export async function onRequestGet(context) {
  const sessionId = new URL(context.request.url).searchParams.get("session_id") || "";
  if (!/^cs_(?:test|live)_/.test(sessionId) || !context.env.DB) return Response.json({ ok: false, message: "Order not found." }, { status: 404 });
  const order = await context.env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(`stripe_${sessionId}`).first();
  if (!order) return Response.json({ ok: false, status: "pending" });
  return Response.json({ ok: true, status: order.status });
}
