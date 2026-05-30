// Supabase Edge Function scaffold for creating Stripe Checkout Sessions.
// Do not deploy until STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, and real price IDs exist.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type CheckoutRequest = {
  planCode: "cloud_basic" | "cloud_supporter";
  successUrl: string;
  cancelUrl: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Billing environment is not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const body = (await req.json()) as CheckoutRequest;
  if (!body.planCode || !body.successUrl || !body.cancelUrl) {
    return json({ error: "planCode, successUrl, and cancelUrl are required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: "Invalid user session" }, 401);
  }

  const { data: plan, error: planError } = await supabase
    .from("billing_plans")
    .select("code, stripe_price_id, active")
    .eq("code", body.planCode)
    .eq("active", true)
    .single();

  if (planError || !plan?.stripe_price_id) {
    return json({ error: "Plan is not configured" }, 400);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    client_reference_id: userData.user.id,
    customer_email: userData.user.email ?? undefined,
    metadata: {
      user_id: userData.user.id,
      plan_code: body.planCode,
    },
    subscription_data: {
      metadata: {
        user_id: userData.user.id,
        plan_code: body.planCode,
      },
    },
  });

  return json({ url: session.url });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
