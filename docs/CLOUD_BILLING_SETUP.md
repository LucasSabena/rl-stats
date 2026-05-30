# Cloud Billing Setup

This checklist finishes the Supabase + Stripe integration after the real production credentials exist.

## Current state

Already prepared/applied:

- Supabase schema migrations.
- `sync_push` and `sync_pull` RPCs.
- Billing tables.
- `cloud_basic` and `cloud_supporter` plan rows.
- Edge Functions deployed:
  - `create-checkout-session`
  - `stripe-webhook`

Still missing:

- Stripe products/prices.
- Stripe webhook secret.
- Supabase Auth OAuth credentials for Google/Discord.
- App login UI and real HTTP sync client.

## Stripe products

Create two recurring subscription prices in Stripe:

1. `cloud_basic`
   - Near-cost price.
   - Product name suggestion: `RL Stats Cloud Sync Basic`.
2. `cloud_supporter`
   - Higher voluntary support price.
   - Product name suggestion: `RL Stats Cloud Sync Supporter`.

Both plans unlock the same app features.

## Update plan price IDs

After creating Stripe prices, update Supabase:

```sql
update public.billing_plans
set stripe_price_id = 'price_REPLACE_BASIC'
where code = 'cloud_basic';

update public.billing_plans
set stripe_price_id = 'price_REPLACE_SUPPORTER'
where code = 'cloud_supporter';
```

## Edge Function secrets

Set these in Supabase once Stripe exists:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_or_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Supabase runtime provides its own `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; do not try to set those manually through `supabase secrets set`.

## Stripe webhook endpoint

Add this endpoint in Stripe Dashboard:

```txt
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Required events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Supabase Auth providers

Email/password is available by default. Configure OAuth providers in Supabase Dashboard:

- Google
- Discord

Steam/Epic should be added later as custom/linked accounts, not as MVP blockers.

## App config

The desktop app must store cloud config locally, never hardcode it:

- `supabase_url`
- `supabase_anon_key`
- local user session/access token
- selected cloud profile id

Never ship service role keys in the Tauri app.
