import { getPlan, jsonError } from "../../_lib/plans";

async function reserveAllocation(context, plan) {
  const panelUrl = context.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  const apiKey = context.env.PTERODACTYL_APPLICATION_API_KEY;
  const nodeIds = JSON.parse(context.env.PTERODACTYL_NODE_IDS_JSON || "[]");
  const allocationAliases = JSON.parse(context.env.PTERODACTYL_ALLOCATION_ALIASES_JSON || "{}");
  if (!context.env.DB || !panelUrl || !apiKey || !Array.isArray(nodeIds) || !nodeIds.length) return null;

  await context.env.DB.prepare("DELETE FROM checkout_reservations WHERE expires_at <= unixepoch()").run();
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "Application/vnd.pterodactyl.v1+json" };
  await context.env.DB.batch(nodeIds.map((nodeId) => context.env.DB.prepare(
    "INSERT OR IGNORE INTO node_capacity_locks (node_id) VALUES (?)"
  ).bind(Number(nodeId))));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [reserved, locks, allocationResponses] = await Promise.all([
      context.env.DB.prepare("SELECT allocation_id, node_id, memory_mb, disk_mb FROM checkout_reservations").all(),
      context.env.DB.prepare("SELECT node_id, version FROM node_capacity_locks").all(),
      Promise.all(nodeIds.map(async (nodeId) => {
        const response = await fetch(`${panelUrl}/api/application/nodes/${Number(nodeId)}/allocations?filter[server_id]=&per_page=100`, { headers });
        const result = await response.json().catch(() => ({}));
        return { nodeId: Number(nodeId), allocations: response.ok ? result.data || [] : [] };
      }))
    ]);
    const reservedIds = new Set(reserved.results.map(({ allocation_id }) => allocation_id));
    const reservedCapacity = new Map(nodeIds.map((nodeId) => [Number(nodeId), { memory: 0, disk: 0 }]));
    for (const entry of reserved.results) {
      const capacity = reservedCapacity.get(entry.node_id);
      if (capacity) {
        capacity.memory += entry.memory_mb;
        capacity.disk += entry.disk_mb;
      }
    }
    const lockVersions = new Map(locks.results.map(({ node_id, version }) => [node_id, version]));

    for (const { nodeId, allocations } of allocationResponses) {
      const capacity = reservedCapacity.get(nodeId);
      const deployableResponse = await fetch(
        `${panelUrl}/api/application/nodes/deployable?memory=${plan.memory + capacity.memory}&disk=${plan.disk + capacity.disk}&per_page=100`,
        { headers }
      );
      const deployable = await deployableResponse.json().catch(() => ({}));
      if (!deployableResponse.ok || !(deployable.data || []).some(({ attributes }) => attributes.id === nodeId)) continue;

      for (const { attributes } of allocations) {
        if (attributes.alias !== allocationAliases[String(nodeId)]) continue;
        if (reservedIds.has(attributes.id)) continue;
        const reservationId = crypto.randomUUID();
        const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
        const result = await context.env.DB.batch([
          context.env.DB.prepare("UPDATE node_capacity_locks SET version = version + 1 WHERE node_id = ? AND version = ?")
            .bind(nodeId, lockVersions.get(nodeId)),
          context.env.DB.prepare(
            "INSERT INTO checkout_reservations (id, allocation_id, node_id, memory_mb, disk_mb, expires_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1"
          ).bind(reservationId, attributes.id, nodeId, plan.memory, plan.disk, expiresAt)
        ]);
        if (result[1].meta.changes) return { allocationId: attributes.id, expiresAt, reservationId };
        break;
      }
    }
  }
  return null;
}

export async function onRequestPost(context) {
  const stripeSecretKey = context.env.STRIPE_SECRET_KEY;
  if (context.env.CHECKOUT_ENABLED !== "launch-ready") {
    return jsonError("Checkout is temporarily unavailable while SideQuest Servers is under development.", 503);
  }

  const { plan } = await context.request.json().catch(() => ({}));
  const selectedPlan = getPlan(plan);
  const priceId = {
    "4": context.env.STRIPE_PRICE_ID_4_MONTHLY,
    "6": context.env.STRIPE_PRICE_ID_6_MONTHLY,
    "8": context.env.STRIPE_PRICE_ID_8_MONTHLY,
    "12": context.env.STRIPE_PRICE_ID_12_MONTHLY
  }[plan];
  if (!selectedPlan) return jsonError("The selected hosting plan is unavailable.", 400);
  if (!priceId) return jsonError("Stripe pricing is not configured for this plan.", 503);
  if (!stripeSecretKey) return jsonError("Stripe checkout is not configured.", 503);
  const reservation = await reserveAllocation(context, selectedPlan);
  if (!reservation) {
    return jsonError("Palworld capacity is currently full. Please check back soon.", 409);
  }

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${new URL(context.request.url).origin}/billing.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${new URL(context.request.url).origin}/billing.html?payment=cancelled`,
    "metadata[plan]": String(plan),
    "metadata[allocation_id]": String(reservation.allocationId),
    "metadata[reservation_id]": reservation.reservationId,
    "custom_fields[0][key]": "panel_login_email",
    "custom_fields[0][label][type]": "custom",
    "custom_fields[0][label][custom]": "Panel login email",
    "custom_fields[0][type]": "dropdown",
    "custom_fields[0][dropdown][options][0][label]": "Use my checkout email for my Panel login",
    "custom_fields[0][dropdown][options][0][value]": "checkout_email",
    "custom_text[submit][message]": "The email entered here will be used for your SideQuest control-panel login. After server setup, you will receive a separate email with a one-time link to create your password.",
    "expires_at": String(reservation.expiresAt)
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
  if (!response.ok) {
    await context.env.DB.prepare("DELETE FROM checkout_reservations WHERE id = ?").bind(reservation.reservationId).run();
    return jsonError("Unable to start Stripe Checkout.", 502);
  }
  return Response.json({ ok: true, checkoutUrl: result.url, plan: selectedPlan.name });
}
