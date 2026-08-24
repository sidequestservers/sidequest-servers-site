import { createPortalSession, readPanelBillingRequest } from "../../_lib/panel-billing";

export async function onRequestPost(context) {
  const request = await readPanelBillingRequest(context);
  if (!request || !context.env.DB || !context.env.STRIPE_SECRET_KEY) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const order = await context.env.DB.prepare(
    "SELECT stripe_customer_id FROM orders WHERE provider = 'stripe' AND pterodactyl_user_id = ? AND stripe_customer_id IS NOT NULL AND status != 'cancelled' ORDER BY updated_at DESC LIMIT 1"
  ).bind(request.userId).first();
  const url = order?.stripe_customer_id && await createPortalSession(context.env, order.stripe_customer_id, context.request.url);
  if (!url) return Response.json({ ok: false, message: "Billing portal unavailable." }, { status: 503 });
  return Response.json({ ok: true, url });
}
