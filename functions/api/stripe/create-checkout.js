import { getPlan, jsonError } from "../../_lib/plans";

export async function onRequestPost(context) {
  const stripeSecretKey = context.env.STRIPE_SECRET_KEY;
  const stripeTestMode = stripeSecretKey?.startsWith("sk_test_");
  if (context.env.CHECKOUT_ENABLED !== "true" && !stripeTestMode) {
    return jsonError("Checkout is not available yet.", 503);
  }

  const { plan } = await context.request.json().catch(() => ({}));
  const selectedPlan = getPlan(plan);
  const priceId = context.env[`STRIPE_PRICE_ID_${plan}_MONTHLY`];
  if (!selectedPlan || !priceId || !stripeSecretKey) {
    return jsonError("Stripe checkout is not configured for this plan.", 503);
  }

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${new URL(context.request.url).origin}/billing.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${new URL(context.request.url).origin}/billing.html?payment=cancelled`,
    "metadata[plan]": String(plan)
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });
  const result = await response.json();
  if (!response.ok) return jsonError("Unable to start Stripe Checkout.", 502);
  return Response.json({ ok: true, checkoutUrl: result.url, plan: selectedPlan.name });
}
