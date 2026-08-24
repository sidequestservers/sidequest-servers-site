import { createPortalSession, readPanelBillingRequest } from "../../_lib/panel-billing";
import { PLANS, ZOMBOID_PLANS } from "../../_lib/plans";

export async function onRequestPost(context) {
  const request = await readPanelBillingRequest(context);
  if (!request || !request.serverId || !context.env.DB || !context.env.STRIPE_SECRET_KEY) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const order = await context.env.DB.prepare(
    "SELECT stripe_customer_id, game FROM orders WHERE provider = 'stripe' AND pterodactyl_user_id = ? AND pterodactyl_server_id = ? AND game = ? AND stripe_customer_id IS NOT NULL AND status != 'cancelled' LIMIT 1"
  ).bind(request.userId, request.serverId, request.game).first();
  const configurationId = order?.game === "palworld"
    ? context.env.STRIPE_PALWORLD_PORTAL_CONFIGURATION_ID
    : context.env.STRIPE_ZOMBOID_PORTAL_CONFIGURATION_ID;
  const plans = order?.game === "palworld" ? PLANS : ZOMBOID_PLANS;
  const priceIds = Object.values(plans).map((plan) => context.env[plan.priceEnv]).filter(Boolean);
  try {
    const url = order?.stripe_customer_id && await createPortalSession(context.env, order.stripe_customer_id, context.request.url, order.game, priceIds, configurationId);
    if (!url) return Response.json({ ok: false, message: "Billing portal unavailable." }, { status: 503 });
    return Response.json({ ok: true, url });
  } catch (error) {
    console.error("Stripe portal configuration failed:", error);
    return Response.json({ ok: false, message: `Billing portal unavailable: ${error.message}` }, { status: 503 });
  }
}
