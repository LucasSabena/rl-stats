// Supabase Edge Function scaffold for Stripe webhooks.
// Do not deploy until STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and SUPABASE_SERVICE_ROLE_KEY exist.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Webhook environment is not configured" }, 500);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing Stripe signature" }, 400);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (error) {
    return json({ error: `Invalid webhook signature: ${String(error)}` }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await upsertSubscriptionFromEvent(supabase, stripe, event);
  }

  return json({ received: true });
});

async function upsertSubscriptionFromEvent(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  let subscription: Stripe.Subscription | null = null;
  let fallbackUserId: string | undefined;
  let fallbackPlanCode: string | undefined;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    fallbackUserId = session.metadata?.user_id ?? session.client_reference_id ?? undefined;
    fallbackPlanCode = session.metadata?.plan_code ?? undefined;
    if (typeof session.subscription === "string") {
      subscription = await stripe.subscriptions.retrieve(session.subscription);
    }
  } else {
    subscription = event.data.object as Stripe.Subscription;
  }

  if (!subscription) return;

  const userId = subscription.metadata?.user_id ?? fallbackUserId;
  const planCode = subscription.metadata?.plan_code ?? fallbackPlanCode ?? "cloud_basic";
  if (!userId) return;

  const status = mapStripeStatus(subscription.status);
  const cloudSyncEnabled = status === "trialing" || status === "active";

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await supabase.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id:
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      plan_code: planCode,
      status,
      current_period_end: currentPeriodEnd,
      cloud_sync_enabled: cloudSyncEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    default:
      return "inactive";
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
