const encoder = new TextEncoder();

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equal(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function readPanelBillingRequest(context) {
  const secret = context.env.PANEL_BILLING_BRIDGE_SECRET;
  const timestamp = Number(context.request.headers.get("X-SideQuest-Timestamp"));
  const signature = context.request.headers.get("X-SideQuest-Signature") || "";
  const body = await context.request.text();
  if (!secret || !Number.isInteger(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 300000 || !equal(signature, await hmac(secret, `${timestamp}.${body}`))) return null;
  const data = JSON.parse(body || "{}");
  const userId = Number(data.user_id);
  return Number.isInteger(userId) && userId > 0 ? { userId } : null;
}

export async function createPortalSession(env, stripeCustomerId, requestUrl) {
  const body = new URLSearchParams({
    customer: stripeCustomerId,
    return_url: env.PANEL_BILLING_RETURN_URL || `${new URL(requestUrl).protocol}//${new URL(requestUrl).host}/billing`
  });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const session = await response.json().catch(() => ({}));
  return response.ok && session.url ? session.url : null;
}
