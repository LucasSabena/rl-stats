# Supabase Backend

This directory contains versioned SQL migrations for RL Stats Cloud Sync.

## Design constraints

- The desktop app remains local-first.
- Cloud sync is opt-in and gated by an active subscription.
- The app should call narrow RPCs/Edge Functions instead of arbitrary database queries.
- RLS is enabled on all user-owned tables.
- No Supabase project URL, anon key, service role key, Stripe key, or webhook secret belongs in this repository.

## Migrations

Apply in order:

1. `migrations/0001_cloud_sync_schema.sql`
   - Core tables.
   - Server revision sequence.
   - Change log table.
   - RLS policies.
   - `sync_pull` RPC.
2. `migrations/0002_sync_push_rpc.sql`
   - Initial idempotent `sync_push` RPC.
3. `migrations/0003_rpc_permissions.sql`
   - Restricts sync RPC execution to authenticated users and service role.
4. `migrations/0004_billing_plans.sql`
   - Adds local plan catalog placeholders for `cloud_basic` and `cloud_supporter`.

## Required auth providers for MVP

Configure in Supabase dashboard, not in code:

- Email/password
- Google
- Discord

Steam/Epic should be added later as linked accounts or custom auth flows.

## Billing gate

`sync_push` checks:

```sql
public.has_active_cloud_sync(auth.uid())
```

A user can push only when `billing_subscriptions` has:

- `cloud_sync_enabled = true`
- `status in ('trialing', 'active')`
- `current_period_end is null or current_period_end > now()`

Stripe webhooks should update `billing_subscriptions` using the Supabase service role key from the server/Edge Function environment only.

Edge Function scaffolds live in `supabase/functions/`:

- `create-checkout-session`
- `create-portal-session`
- `stripe-webhook`

## RPC shape

### `sync_push`

Expected call shape:

```json
{
  "p_local_device_id": "local-device-uuid",
  "p_device_name": "Lucas PC",
  "p_platform": "windows",
  "p_app_version": "1.8.0",
  "p_batch_idempotency_key": "device:batch-id",
  "p_profile_id": "cloud-profile-uuid-or-null",
  "p_changes": [
    {
      "entity_type": "match",
      "entity_key": "match-guid",
      "operation": "upsert",
      "payload_json": { "guid": "match-guid" }
    }
  ]
}
```

For app-level data such as `profiles_manifest`, `p_profile_id` can be `null`.

For profile-level data, `p_profile_id` is required.

### `sync_pull`

Expected call shape:

```json
{
  "p_after_revision": 123,
  "p_limit": 500
}
```

Returns ordered changes after the provided revision.
