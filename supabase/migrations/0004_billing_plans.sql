-- Billing plan catalog. Stripe price IDs are stored as placeholders until a real Stripe account exists.

create table if not exists public.billing_plans (
  code text primary key check (code in ('cloud_basic', 'cloud_supporter')),
  name text not null,
  description text,
  stripe_price_id text,
  cloud_sync_enabled boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_plans enable row level security;

create policy "billing_plans_read_active" on public.billing_plans
  for select using (active = true);

insert into public.billing_plans (code, name, description, stripe_price_id, cloud_sync_enabled, active, sort_order)
values
  (
    'cloud_basic',
    'Cloud Sync Basic',
    'Backup and sync at a near-cost price.',
    null,
    true,
    true,
    10
  ),
  (
    'cloud_supporter',
    'Cloud Sync Supporter',
    'Same features as Basic, with extra support for the project.',
    null,
    true,
    true,
    20
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  cloud_sync_enabled = excluded.cloud_sync_enabled,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
