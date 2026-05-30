# Edge Functions

Local scaffolding only. Do not deploy until a real Supabase project and Stripe account exist.

## Functions

### `create-checkout-session`

Creates a Stripe Checkout subscription session for:

- `cloud_basic`
- `cloud_supporter`

Required environment variables:

```txt
STRIPE_SECRET_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### `create-portal-session`

Creates a Stripe Customer Portal session for managing/canceling subscriptions.

Required environment variables:

```txt
STRIPE_SECRET_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### `stripe-webhook`

Validates Stripe webhook signatures and updates `billing_subscriptions`.

Required environment variables:

```txt
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## Important security notes

- `SUPABASE_SERVICE_ROLE_KEY` must exist only in Supabase Edge Function secrets or a trusted server.
- Never ship service role keys in the Tauri app.
- Stripe webhook signature verification is mandatory.
- `billing_subscriptions` should not be writable by normal authenticated users.
