-- RL Stats Cloud Sync schema for Supabase/Postgres.
-- Local-first app: cloud writes are opt-in and should go through narrow sync RPCs/Edge Functions.

create extension if not exists pgcrypto;

create sequence if not exists public.sync_server_revision_seq as bigint start with 1 increment by 1;

create or replace function public.next_sync_revision()
returns bigint
language sql
volatile
as $$
  select nextval('public.sync_server_revision_seq');
$$;

create or replace function public.set_sync_revision_fields()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.server_revision = public.next_sync_revision();
  return new;
end;
$$;

create or replace function public.record_sync_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
  v_entity_type text;
  v_entity_key text;
  v_operation text;
  v_server_revision bigint;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_profile_id := old.profile_id;
    v_entity_type := old.entity_type;
    v_entity_key := old.entity_key;
    v_operation := 'delete';
    v_server_revision := public.next_sync_revision();
    v_payload := jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_key', v_entity_key,
      'deleted_at', now()
    );
  else
    v_user_id := new.user_id;
    v_profile_id := new.profile_id;
    v_entity_type := new.entity_type;
    v_entity_key := new.entity_key;
    v_operation := case when new.deleted_at is null then 'upsert' else 'delete' end;
    v_server_revision := new.server_revision;
    v_payload := to_jsonb(new);
  end if;

  insert into public.sync_changes (
    user_id,
    profile_id,
    entity_type,
    entity_key,
    operation,
    server_revision,
    payload_json,
    created_at
  ) values (
    v_user_id,
    v_profile_id,
    v_entity_type,
    v_entity_key,
    v_operation,
    v_server_revision,
    v_payload,
    now()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create table if not exists public.cloud_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_device_id text not null,
  name text,
  platform text,
  app_version text,
  last_seen_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_device_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan_code text not null check (plan_code in ('free_local', 'cloud_basic', 'cloud_supporter')),
  status text not null check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_end timestamptz,
  cloud_sync_enabled boolean not null default false,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.cloud_app_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  profile_id uuid,
  entity_type text not null,
  entity_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_key)
);

create table if not exists public.cloud_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null default 'profile',
  entity_key text not null,
  local_profile_id text not null,
  name text not null,
  player_name text,
  local_primary_id text,
  manifest_created_at timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  profile_id uuid generated always as (id) stored,
  unique (user_id, entity_key),
  unique (user_id, local_profile_id)
);

create table if not exists public.cloud_profile_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.cloud_profiles(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null,
  entity_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, entity_type, entity_key)
);

create table if not exists public.cloud_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.cloud_profiles(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null default 'match',
  entity_key text not null,
  local_match_id bigint,
  guid text,
  match_fingerprint text,
  started_at timestamptz,
  ended_at timestamptz,
  arena text,
  playlist text,
  match_type text,
  score_blue integer,
  score_orange integer,
  winner integer,
  is_online boolean,
  is_overtime boolean,
  duration_seconds integer,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, entity_key),
  unique (user_id, profile_id, guid),
  unique (user_id, profile_id, match_fingerprint)
);

create table if not exists public.cloud_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.cloud_profiles(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null default 'player',
  entity_key text not null,
  primary_id text not null,
  name text,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, entity_key),
  unique (user_id, profile_id, primary_id)
);

create table if not exists public.cloud_match_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.cloud_profiles(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null default 'match_player',
  entity_key text not null,
  match_guid text,
  player_primary_id text,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, entity_key),
  unique (user_id, profile_id, match_guid, player_primary_id)
);

create table if not exists public.cloud_match_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.cloud_profiles(id) on delete cascade,
  source_device_id uuid references public.cloud_devices(id) on delete set null,
  entity_type text not null default 'match_event',
  entity_key text not null,
  match_guid text,
  event_type text,
  occurred_at timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_id, entity_key)
);

create table if not exists public.cloud_sync_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.cloud_devices(id) on delete set null,
  idempotency_key text not null,
  change_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.sync_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.cloud_profiles(id) on delete cascade,
  entity_type text not null,
  entity_key text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  server_revision bigint not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cloud_devices_user on public.cloud_devices(user_id);
create index if not exists idx_billing_subscriptions_user on public.billing_subscriptions(user_id);
create index if not exists idx_cloud_app_entities_revision on public.cloud_app_entities(user_id, server_revision);
create index if not exists idx_cloud_profiles_user_revision on public.cloud_profiles(user_id, server_revision);
create index if not exists idx_cloud_profile_entities_revision on public.cloud_profile_entities(user_id, profile_id, server_revision);
create index if not exists idx_cloud_matches_revision on public.cloud_matches(user_id, profile_id, server_revision);
create index if not exists idx_cloud_players_revision on public.cloud_players(user_id, profile_id, server_revision);
create index if not exists idx_cloud_match_players_revision on public.cloud_match_players(user_id, profile_id, server_revision);
create index if not exists idx_cloud_match_events_revision on public.cloud_match_events(user_id, profile_id, server_revision);
create index if not exists idx_sync_changes_pull on public.sync_changes(user_id, server_revision, id);
create index if not exists idx_sync_changes_profile_pull on public.sync_changes(user_id, profile_id, server_revision, id);

create trigger trg_cloud_devices_revision
before insert or update on public.cloud_devices
for each row execute function public.set_sync_revision_fields();

create trigger trg_billing_subscriptions_updated
before insert or update on public.billing_subscriptions
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_app_entities_revision
before insert or update on public.cloud_app_entities
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_profiles_revision
before insert or update on public.cloud_profiles
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_profile_entities_revision
before insert or update on public.cloud_profile_entities
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_matches_revision
before insert or update on public.cloud_matches
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_players_revision
before insert or update on public.cloud_players
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_match_players_revision
before insert or update on public.cloud_match_players
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_match_events_revision
before insert or update on public.cloud_match_events
for each row execute function public.set_sync_revision_fields();

create trigger trg_cloud_app_entities_changes
after insert or update or delete on public.cloud_app_entities
for each row execute function public.record_sync_change();

create trigger trg_cloud_profiles_changes
after insert or update or delete on public.cloud_profiles
for each row execute function public.record_sync_change();

create trigger trg_cloud_profile_entities_changes
after insert or update or delete on public.cloud_profile_entities
for each row execute function public.record_sync_change();

create trigger trg_cloud_matches_changes
after insert or update or delete on public.cloud_matches
for each row execute function public.record_sync_change();

create trigger trg_cloud_players_changes
after insert or update or delete on public.cloud_players
for each row execute function public.record_sync_change();

create trigger trg_cloud_match_players_changes
after insert or update or delete on public.cloud_match_players
for each row execute function public.record_sync_change();

create trigger trg_cloud_match_events_changes
after insert or update or delete on public.cloud_match_events
for each row execute function public.record_sync_change();

alter table public.cloud_devices enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.cloud_app_entities enable row level security;
alter table public.cloud_profiles enable row level security;
alter table public.cloud_profile_entities enable row level security;
alter table public.cloud_matches enable row level security;
alter table public.cloud_players enable row level security;
alter table public.cloud_match_players enable row level security;
alter table public.cloud_match_events enable row level security;
alter table public.cloud_sync_batches enable row level security;
alter table public.sync_changes enable row level security;

create policy "cloud_devices_read_own" on public.cloud_devices
  for select using (auth.uid() = user_id);

create policy "billing_subscriptions_read_own" on public.billing_subscriptions
  for select using (auth.uid() = user_id);

create policy "cloud_app_entities_read_own" on public.cloud_app_entities
  for select using (auth.uid() = user_id);

create policy "cloud_profiles_read_own" on public.cloud_profiles
  for select using (auth.uid() = user_id);

create policy "cloud_profile_entities_read_own" on public.cloud_profile_entities
  for select using (auth.uid() = user_id);

create policy "cloud_matches_read_own" on public.cloud_matches
  for select using (auth.uid() = user_id);

create policy "cloud_players_read_own" on public.cloud_players
  for select using (auth.uid() = user_id);

create policy "cloud_match_players_read_own" on public.cloud_match_players
  for select using (auth.uid() = user_id);

create policy "cloud_match_events_read_own" on public.cloud_match_events
  for select using (auth.uid() = user_id);

create policy "cloud_sync_batches_read_own" on public.cloud_sync_batches
  for select using (auth.uid() = user_id);

create policy "sync_changes_read_own" on public.sync_changes
  for select using (auth.uid() = user_id);

create or replace function public.has_active_cloud_sync(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.billing_subscriptions s
      where s.user_id = p_user_id
        and s.cloud_sync_enabled = true
        and s.status in ('trialing', 'active')
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    false
  );
$$;

create or replace function public.sync_pull(p_after_revision bigint, p_limit integer default 500)
returns table (
  server_revision bigint,
  entity_type text,
  entity_key text,
  operation text,
  profile_id uuid,
  payload_json jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.server_revision,
    c.entity_type,
    c.entity_key,
    c.operation,
    c.profile_id,
    c.payload_json,
    c.created_at
  from public.sync_changes c
  where c.user_id = auth.uid()
    and c.server_revision > p_after_revision
  order by c.server_revision asc, c.id asc
  limit least(greatest(p_limit, 1), 1000);
$$;
