export async function onRequestGet(context) {
  return Response.json({ enabled: context.env.CHECKOUT_ENABLED === "subscription-lifecycle-ready" && context.env.PUBLIC_CHECKOUT_ENABLED === "true" });
}
