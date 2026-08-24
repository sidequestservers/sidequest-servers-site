import { getPlan } from "../../_lib/plans";
import { readPanelBillingRequest } from "../../_lib/panel-billing";

export async function onRequestPost(context) {
  const request = await readPanelBillingRequest(context);
  if (!request || !context.env.DB) return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const orders = await context.env.DB.prepare(
    "SELECT game, plan_id, status, lifecycle_state, provider_subscription_id, pterodactyl_server_id FROM orders WHERE provider = 'stripe' AND pterodactyl_user_id = ? AND status != 'cancelled' ORDER BY updated_at DESC"
  ).bind(request.userId).all();
  const subscriptions = await Promise.all(orders.results.map(async (order) => {
    const plan = getPlan(order.plan_id, order.game);
    let renewalAt = null;
    let status = order.lifecycle_state === "grace" ? "past_due" : order.lifecycle_state;
    let priceCents = plan?.priceCents || null;
    let currency = "usd";
    let interval = "month";
    let cancelAtPeriodEnd = false;
    if (order.provider_subscription_id && context.env.STRIPE_SECRET_KEY) {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(order.provider_subscription_id)}`, {
        headers: { Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}` }
      });
      const subscription = await response.json().catch(() => ({}));
      if (response.ok) {
        const item = subscription.items?.data?.[0] || {};
        renewalAt = subscription.current_period_end || item.current_period_end || null;
        status = subscription.status || status;
        priceCents = item.price?.unit_amount ?? priceCents;
        currency = item.price?.currency || currency;
        interval = item.price?.recurring?.interval || interval;
        cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
      }
    }
    return {
      game: order.game,
      plan: plan?.name || order.plan_id,
      status,
      lifecycleState: order.lifecycle_state,
      serverId: order.pterodactyl_server_id,
      renewalAt,
      priceCents,
      currency,
      interval,
      cancelAtPeriodEnd
    };
  }));
  return Response.json({ ok: true, subscriptions });
}
