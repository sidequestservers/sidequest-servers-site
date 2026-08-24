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
  const game = String(data.game || "");
  const serverId = Number(data.server_id);
  return Number.isInteger(userId) && userId > 0 && ["palworld", "zomboid"].includes(game)
    ? { userId, game, serverId: Number.isInteger(serverId) && serverId > 0 ? serverId : null }
    : null;
}

async function stripeRequest(env, path, options = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...options.headers }
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function portalConfiguration(env, game, priceIds, configuredId) {
  if (configuredId) return configuredId;
  const listed = await stripeRequest(env, "/billing_portal/configurations?limit=100");
  if (!listed.response.ok) throw new Error(listed.body.error?.message || `Stripe configuration lookup failed (${listed.response.status}).`);
  const existing = listed.response.ok && listed.body.data?.find((configuration) => configuration.active && configuration.metadata?.sidequest_game === game);
  if (existing?.id) return existing.id;

  const prices = await Promise.all(priceIds.map(async (priceId) => {
    const result = await stripeRequest(env, `/prices/${encodeURIComponent(priceId)}`);
    if (!result.response.ok) throw new Error(result.body.error?.message || `Stripe price lookup failed (${result.response.status}).`);
    return result.body;
  }));
  const products = new Map();
  for (const price of prices.filter(Boolean)) {
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    if (!productId) continue;
    const productPrices = products.get(productId) || [];
    productPrices.push(price.id);
    products.set(productId, productPrices);
  }
  if (!products.size) return null;

  const body = new URLSearchParams({
    name: `SideQuest ${game === "zomboid" ? "Project Zomboid" : "Palworld"}`,
    "metadata[sidequest_game]": game,
    "features[invoice_history][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_update][enabled]": "true",
    "features[subscription_update][default_allowed_updates][]": "price",
    "features[subscription_update][proration_behavior]": "create_prorations"
  });
  let index = 0;
  for (const [productId, productPrices] of products) {
    body.set(`features[subscription_update][products][${index}][product]`, productId);
    productPrices.forEach((priceId) => body.append(`features[subscription_update][products][${index}][prices][]`, priceId));
    index += 1;
  }
  const created = await stripeRequest(env, "/billing_portal/configurations", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!created.response.ok) throw new Error(created.body.error?.message || `Stripe portal configuration creation failed (${created.response.status}).`);
  return created.body.id || null;
}

export async function createPortalSession(env, stripeCustomerId, requestUrl, game, priceIds, configuredId) {
  let configurationId = null;
  try {
    configurationId = await portalConfiguration(env, game, priceIds, configuredId);
  } catch (error) {
    // Preserve the working default portal while an invalid custom catalog is corrected.
    console.error("SideQuest portal configuration unavailable:", error);
  }
  const body = new URLSearchParams({
    customer: stripeCustomerId,
    return_url: env.PANEL_BILLING_RETURN_URL || `${new URL(requestUrl).protocol}//${new URL(requestUrl).host}/billing`
  });
  if (configurationId) body.set("configuration", configurationId);
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const session = await response.json().catch(() => ({}));
  return response.ok && session.url ? session.url : null;
}
