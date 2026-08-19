import { escapeHtml, sendEmail } from "../../_lib/email";

const encoder = new TextEncoder();

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  if (!context.env.DB) return Response.json({ ok: false, message: "Billing is unavailable." }, { status: 503 });
  const email = String((await context.request.json().catch(() => ({}))).email || "").trim().toLowerCase();
  // Do not reveal whether an address has a billing account.
  const accepted = Response.json({ ok: true, message: "If that email has a billing account, a sign-in link is on its way." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return accepted;

  const order = await context.env.DB.prepare(
    "SELECT stripe_customer_id FROM orders WHERE provider = 'stripe' AND lower(customer_email) = ? AND stripe_customer_id IS NOT NULL AND status != 'cancelled' ORDER BY updated_at DESC LIMIT 1"
  ).bind(email).first();
  if (!order?.stripe_customer_id) return accepted;
  const recent = await context.env.DB.prepare(
    "SELECT 1 FROM portal_magic_links WHERE email = ? AND created_at > unixepoch() - 60 LIMIT 1"
  ).bind(email).first();
  if (recent) return accepted;

  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await context.env.DB.prepare(
    "INSERT INTO portal_magic_links (token_hash, email, stripe_customer_id, expires_at) VALUES (?, ?, ?, unixepoch() + 900)"
  ).bind(await sha256(token), email, order.stripe_customer_id).run();
  const url = new URL("/api/stripe/portal-session", context.request.url);
  url.searchParams.set("token", token);
  const link = url.toString();
  await sendEmail(context.env, {
    to: email,
    subject: "Open your SideQuest billing portal",
    text: `Use this one-time billing link within 15 minutes:\n${link}\n\nIf you did not request it, you can ignore this email.`,
    html: `<p>Use this one-time link within 15 minutes:</p><p><a href="${escapeHtml(link)}">Open billing portal</a></p><p>If you did not request it, you can ignore this email.</p>`
  });
  return accepted;
}
