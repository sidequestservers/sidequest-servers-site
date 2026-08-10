import { getPlan, jsonError } from "../../_lib/plans";

export async function onRequestPost(context) {
  if (context.env.CHECKOUT_ENABLED !== "launch-ready") {
    return jsonError("Checkout is not available yet.", 503);
  }

  const { plan } = await context.request.json().catch(() => ({}));
  const selectedPlan = getPlan(plan);
  const paypalPlanId = context.env[`PAYPAL_PLAN_ID_${plan}_MONTHLY`];
  if (!selectedPlan || !paypalPlanId || !context.env.PAYPAL_CLIENT_ID || !context.env.PAYPAL_CLIENT_SECRET) {
    return jsonError("PayPal checkout is not configured for this plan.", 503);
  }

  const apiBase = context.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const credentials = btoa(`${context.env.PAYPAL_CLIENT_ID}:${context.env.PAYPAL_CLIENT_SECRET}`);
  const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok) return jsonError("Unable to connect to PayPal.", 502);

  const origin = new URL(context.request.url).origin;
  const subscriptionResponse = await fetch(`${apiBase}/v1/billing/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      application_context: {
        brand_name: "SideQuest Servers",
        return_url: `${origin}/billing.html?payment=success`,
        cancel_url: `${origin}/billing.html?payment=cancelled`,
        user_action: "SUBSCRIBE_NOW"
      }
    })
  });
  const subscription = await subscriptionResponse.json();
  const approval = subscription.links?.find((link) => link.rel === "approve");
  if (!subscriptionResponse.ok || !approval) return jsonError("Unable to start PayPal Checkout.", 502);
  return Response.json({ ok: true, checkoutUrl: approval.href, plan: selectedPlan.name });
}
