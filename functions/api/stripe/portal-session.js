const encoder = new TextEncoder();

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet(context) {
  const token = new URL(context.request.url).searchParams.get("token") || "";
  if (!context.env.DB || !context.env.STRIPE_SECRET_KEY || !token) return new Response("Invalid or expired billing link.", { status: 400 });
  const consumed = await context.env.DB.prepare(
    "UPDATE portal_magic_links SET used_at = unixepoch() WHERE token_hash = ? AND used_at IS NULL AND expires_at > unixepoch() RETURNING stripe_customer_id"
  ).bind(await sha256(token)).first();
  if (!consumed?.stripe_customer_id) return new Response("Invalid or expired billing link.", { status: 400 });
  const returnUrl = context.env.BILLING_PORTAL_RETURN_URL || `${new URL(context.request.url).origin}/billing.html`;
  const body = new URLSearchParams({ customer: consumed.stripe_customer_id, return_url: returnUrl });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST", headers: { Authorization: `Bearer ${context.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.url) return new Response("Unable to open the billing portal.", { status: 502 });
  return Response.redirect(session.url, 303);
}
