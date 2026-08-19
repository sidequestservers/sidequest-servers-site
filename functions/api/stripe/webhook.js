import { PLANS, ZOMBOID_PLANS, getPlan, jsonError } from "../../_lib/plans";
import { escapeHtml, sendEmail } from "../../_lib/email";
import { setServerSuspended, updateServerBuild } from "../../_lib/pterodactyl";

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function equalConstantTime(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifyStripeWebhook(request, webhookSecret) {
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature");
  if (!signature || !webhookSecret) return null;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1 || Math.abs(Date.now() / 1000 - timestamp) > 300) return null;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  if (!equalConstantTime(hex(signed), parts.v1)) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

function response(message, status = 200) {
  return Response.json({ ok: status < 400, message }, { status });
}

function planForPrice(env, priceId) {
  for (const [game, plans] of [["palworld", PLANS], ["zomboid", ZOMBOID_PLANS]]) {
    for (const [planId, plan] of Object.entries(plans)) if (env[plan.priceEnv] === priceId) return { game, planId, plan };
  }
  return null;
}

async function processOnce(context, event, work) {
  const inserted = await context.env.DB.prepare("INSERT OR IGNORE INTO webhook_events (provider, event_id) VALUES ('stripe', ?)").bind(event.id).run();
  if (!inserted.meta.changes) return response("Event already handled.");
  try {
    await work();
    return response("Event handled.");
  } catch (error) {
    await context.env.DB.prepare("DELETE FROM webhook_events WHERE provider = 'stripe' AND event_id = ?").bind(event.id).run();
    console.error(`Stripe ${event.type} failed:`, error);
    return response("Lifecycle update failed.", 500);
  }
}

async function handleLifecycleEvent(context, event) {
  const object = event.data?.object || {};
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.id;
  if (!subscriptionId) return response("Event acknowledged.");
  return processOnce(context, event, async () => {
    const order = await context.env.DB.prepare(
      "SELECT id, status, lifecycle_state, pterodactyl_server_id FROM orders WHERE provider = 'stripe' AND provider_subscription_id = ?"
    ).bind(subscriptionId).first();
    if (!order) return;
    if (typeof object.customer === "string") {
      await context.env.DB.prepare("UPDATE orders SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(object.customer, order.id).run();
    }
    if (event.type === "invoice.payment_failed") {
      await context.env.DB.prepare(
        "UPDATE orders SET lifecycle_state = 'grace', grace_expires_at = CASE WHEN lifecycle_state = 'grace' THEN grace_expires_at ELSE unixepoch() + 259200 END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'cancelled'"
      ).bind(order.id).run();
      return;
    }
    if (event.type === "invoice.paid") {
      if (order.status === "cancelled") return;
      if (order.pterodactyl_server_id && ["grace", "suspended"].includes(order.lifecycle_state)) await setServerSuspended(context.env, order.pterodactyl_server_id, false);
      await context.env.DB.prepare(
        "UPDATE orders SET lifecycle_state = 'active', grace_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(order.id).run();
      return;
    }
    if (event.type === "customer.subscription.deleted") {
      if (order.pterodactyl_server_id) await setServerSuspended(context.env, order.pterodactyl_server_id, true);
      await context.env.DB.prepare(
        "UPDATE orders SET status = 'cancelled', lifecycle_state = 'cancelled', grace_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(order.id).run();
      return;
    }
    const priceId = object.items?.data?.[0]?.price?.id;
    const selected = planForPrice(context.env, priceId) || (() => {
      const game = String(object.metadata?.game || "");
      const planId = String(object.metadata?.plan || "");
      const plan = getPlan(planId, game);
      return plan ? { game, planId, plan } : null;
    })();
    if (!selected) throw new Error("Subscription price is not a configured SideQuest plan.");
    if (order.pterodactyl_server_id) await updateServerBuild(context.env, order.pterodactyl_server_id, selected.plan);
    await context.env.DB.prepare(
      "UPDATE orders SET game = ?, plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(selected.game, selected.planId, order.id).run();
  });
}

export async function onRequestPost(context) {
  const event = await verifyStripeWebhook(context.request, context.env.STRIPE_WEBHOOK_SECRET);
  if (!event) return jsonError("Invalid Stripe webhook signature.", 400);
  if (!context.env.DB) return jsonError("Order database is not configured.", 503);
  if (["invoice.payment_failed", "invoice.paid", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    return handleLifecycleEvent(context, event);
  }
  if (event.type !== "checkout.session.completed") return response("Event acknowledged.");

  const session = event.data?.object;
  const game = String(session?.metadata?.game || "palworld");
  const planId = String(session?.metadata?.plan || "");
  const allocationId = Number(session?.metadata?.allocation_id);
  const secondaryAllocationId = Number(session?.metadata?.secondary_allocation_id);
  const reservationId = String(session?.metadata?.reservation_id || "");
  const plan = getPlan(planId, game);
  const email = session?.customer_details?.email || session?.customer_email;
  if (!session?.id || !email || !plan || !["palworld", "zomboid"].includes(game) || !Number.isInteger(allocationId) || !reservationId || session.payment_status !== "paid") {
    return jsonError("Unsupported completed checkout session.", 400);
  }
  if (game === "zomboid" && !Number.isInteger(secondaryAllocationId)) return jsonError("Unsupported Project Zomboid allocation pair.", 400);

  if (context.env.PROVISIONING_ENABLED === "true" && !context.env.PROVISIONING_SECRET) {
    return jsonError("Provisioning secret is not configured.", 503);
  }
  const orderId = `stripe_${session.id}`;
  const handled = await context.env.DB.prepare(
    "SELECT 1 FROM webhook_events WHERE provider = ? AND event_id = ?"
  ).bind("stripe", event.id).first();
  if (handled) return response("Event already handled.");
  const reservation = await context.env.DB.prepare(
    "SELECT allocation_id, secondary_allocation_id, node_id FROM checkout_reservations WHERE id = ? AND allocation_id = ? AND expires_at > unixepoch()"
  ).bind(reservationId, allocationId).first();
  if (!reservation) return jsonError("The reserved server slot is no longer available.", 409);
  if (game === "zomboid" && reservation.secondary_allocation_id !== secondaryAllocationId) return jsonError("The reserved Project Zomboid allocation pair is no longer available.", 409);
  const results = await context.env.DB.batch([
    context.env.DB.prepare("INSERT OR IGNORE INTO webhook_events (provider, event_id) VALUES (?, ?)").bind("stripe", event.id),
    context.env.DB.prepare(
       `INSERT INTO orders (id, provider, provider_event_id, provider_subscription_id, stripe_customer_id, customer_email, game, plan_id, status, lifecycle_state)
        VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, 'paid', 'active')
        ON CONFLICT(id) DO UPDATE SET provider_event_id = excluded.provider_event_id, provider_subscription_id = excluded.provider_subscription_id, stripe_customer_id = excluded.stripe_customer_id, status = 'paid', lifecycle_state = 'active', updated_at = CURRENT_TIMESTAMP`
     ).bind(orderId, event.id, session.subscription || null, session.customer || null, email, game, planId)
  ]);
  if (results[0].meta.changes === 0) return response("Event already handled.");

  if (context.env.PROVISIONING_ENABLED !== "true") return response("Payment recorded; provisioning remains disabled.");

  const claim = await context.env.DB.prepare(
    "UPDATE orders SET status = 'provisioning', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'paid'"
  ).bind(orderId).run();
  if (claim.meta.changes === 0) return response("Order is already being provisioned.");

  const [firstName = "SideQuest", ...rest] = String(session.customer_details?.name || "Customer").trim().split(/\s+/);
  try {
    const provision = await fetch(`${new URL(context.request.url).origin}/api/provision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Provisioning-Secret": context.env.PROVISIONING_SECRET },
      body: JSON.stringify({ game, email, plan: planId, externalId: orderId, allocationId, secondaryAllocationId: reservation.secondary_allocation_id, nodeId: reservation.node_id, firstName, lastName: rest.join(" ") || "Customer" })
    });
    const result = await provision.json().catch(() => ({}));
    if (!provision.ok) throw new Error(result.message || "Provisioning request failed.");
    await context.env.DB.prepare(
      "UPDATE orders SET status = 'active', pterodactyl_user_id = ?, pterodactyl_server_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(result.userId || null, result.serverId || null, orderId).run();
    await context.env.DB.prepare("DELETE FROM checkout_reservations WHERE id = ?").bind(reservationId).run();
    const customerName = String(session.customer_details?.name || "there").trim();
    const panelUrl = result.panelUrl || context.env.PTERODACTYL_PANEL_URL;
    await sendEmail(context.env, {
      to: email,
       subject: "Your SideQuest Servers game server is ready",
       text: `Hi ${customerName},\n\nYour ${game === "zomboid" ? "Project Zomboid" : "Palworld"} ${plan.name} server is ready. Your Stripe email is also your control-panel login. The panel sends a separate Setup Your Account email with a one-time link to create your password.\n\nOpen the control panel: ${panelUrl}\n\nQuestions? Reply to this email or contact support@sidequestservers.com.`,
       html: `<p>Hi ${escapeHtml(customerName)},</p><p>Your <strong>${escapeHtml(game === "zomboid" ? "Project Zomboid" : "Palworld")} ${escapeHtml(plan.name)}</strong> server is ready.</p><p>Your Stripe email is also your control-panel login. The Panel sends a separate <strong>Setup Your Account</strong> email with a one-time link to create your password.</p><p><a href="${escapeHtml(panelUrl)}">Open the control panel</a></p><p>Questions? Reply to this email or contact <a href="mailto:support@sidequestservers.com">support@sidequestservers.com</a>.</p>`
    });
    return response("Payment recorded and server provisioned.");
  } catch (error) {
    await context.env.DB.batch([
      context.env.DB.prepare("UPDATE orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(orderId),
      context.env.DB.prepare("DELETE FROM webhook_events WHERE provider = ? AND event_id = ?").bind("stripe", event.id),
      context.env.DB.prepare("DELETE FROM checkout_reservations WHERE id = ?").bind(reservationId)
    ]);
    return response(`Provisioning failed: ${error.message}`, 500);
  }
}
