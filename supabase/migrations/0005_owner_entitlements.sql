-- Internal owner/tester access that bypasses Stripe while keeping normal users gated.

create table if not exists public.cloud_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'tester', 'support')),
  cloud_sync_enabled boolean not null default true,
  expires_at timestamptz,
  server_revision bigint not null default public.next_sync_revision(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_cloud_entitlements_updated
before insert or update on public.cloud_entitlements
for each row execute function public.set_sync_revision_fields();

alter table public.cloud_entitlements enable row level security;

create policy "cloud_entitlements_read_own" on public.cloud_entitlements
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
      from public.cloud_entitlements e
      where e.user_id = p_user_id
        and e.cloud_sync_enabled = true
        and (e.expires_at is null or e.expires_at > now())
    )
    or exists (
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

-- To grant yourself owner access after creating an auth user:
-- insert into public.cloud_entitlements (user_id, role, cloud_sync_enabled)
-- select id, 'owner', true from auth.users where email = 'you@example.com'
-- on conflict (user_id) do update set role = 'owner', cloud_sync_enabled = true, expires_at = null, updated_at = now();
