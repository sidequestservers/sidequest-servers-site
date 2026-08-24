const THREE_DAYS = 3 * 24 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

function panelConfiguration(env) {
  const panelUrl = env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  if (!panelUrl || !env.PTERODACTYL_APPLICATION_API_KEY) throw new Error("Pterodactyl Application API is not configured.");
  return { panelUrl, headers: { Authorization: `Bearer ${env.PTERODACTYL_APPLICATION_API_KEY}`, Accept: "Application/vnd.pterodactyl.v1+json" } };
}

async function panelRequest(env, path, options = {}) {
  const { panelUrl, headers } = panelConfiguration(env);
  const response = await fetch(`${panelUrl}/api/application${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Pterodactyl request failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function suspend(env, serverId) {
  await panelRequest(env, `/servers/${serverId}/suspend`, { method: "POST" });
}

async function archiveSignature(secret, orderId, expiresAt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${orderId}.${expiresAt}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function equalConstantTime(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function archiveUrl(env, orderId, expiresAt, signature) {
  const base = env.ARCHIVE_DOWNLOAD_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("ARCHIVE_DOWNLOAD_BASE_URL is not configured.");
  const url = new URL(`${base}/${encodeURIComponent(orderId)}`);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signature);
  return url.toString();
}

async function sendArchiveEmail(env, email, game, url, expiresAt) {
  await panelRequest(env, "/sidequest/archives/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, game, download_url: url, expires_at: expiresAt })
  });
}

async function createCancellationRows(env, now) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO cancellation_archives (order_id, pterodactyl_server_id, server_delete_at, archive_purge_at)
     SELECT id, pterodactyl_server_id, ?, ? FROM orders
     WHERE provider = 'stripe' AND status = 'cancelled' AND pterodactyl_server_id IS NOT NULL`
  ).bind(now + THREE_DAYS, now + THIRTY_DAYS).run();
}

async function startBackups(env) {
  const pending = await env.DB.prepare("SELECT order_id, pterodactyl_server_id FROM cancellation_archives WHERE status = 'pending' LIMIT 10").all();
  for (const archive of pending.results) {
    try {
      const result = await panelRequest(env, "/sidequest/archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: archive.pterodactyl_server_id, order_id: archive.order_id })
      });
      if (!result?.uuid) throw new Error("Panel did not return a backup UUID.");
      await env.DB.prepare("UPDATE cancellation_archives SET status = 'backup_pending', pterodactyl_backup_uuid = ?, last_error = NULL, updated_at = unixepoch() WHERE order_id = ? AND status = 'pending'")
        .bind(result.uuid, archive.order_id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE cancellation_archives SET last_error = ?, updated_at = unixepoch() WHERE order_id = ?").bind(String(error.message).slice(0, 1000), archive.order_id).run();
      console.error(`Could not create cancellation backup for ${archive.order_id}:`, error);
    }
  }
}

async function copyCompletedBackups(env) {
  const pending = await env.DB.prepare("SELECT order_id, pterodactyl_server_id, pterodactyl_backup_uuid FROM cancellation_archives WHERE status = 'backup_pending' LIMIT 10").all();
  const { panelUrl } = panelConfiguration(env);
  for (const archive of pending.results) {
    try {
      const query = new URLSearchParams({ server_id: String(archive.pterodactyl_server_id), backup_uuid: archive.pterodactyl_backup_uuid });
      const status = await panelRequest(env, `/sidequest/archives?${query}`);
      if (status.failed) {
        await env.DB.prepare("UPDATE cancellation_archives SET status = 'failed', last_error = 'Pterodactyl backup failed.', updated_at = unixepoch() WHERE order_id = ?").bind(archive.order_id).run();
        continue;
      }
      if (!status.complete || !status.download_url) continue;
      const downloadUrl = new URL(status.download_url);
      const allowedOrigins = [panelUrl, env.PTERODACTYL_BACKUP_DOWNLOAD_ORIGIN].filter(Boolean);
      if (!allowedOrigins.includes(downloadUrl.origin)) throw new Error(`Panel returned a backup URL outside configured origins: ${downloadUrl.origin}`);
      const download = await fetch(downloadUrl);
      if (!download.ok || !download.body) throw new Error(`Backup download failed (${download.status}).`);
      const key = `cancellations/${archive.order_id}.tar.gz`;
      await env.CANCELLATION_ARCHIVES.put(key, download.body, {
        httpMetadata: { contentType: "application/gzip", contentDisposition: `attachment; filename="sidequest-${archive.order_id}.tar.gz"` },
        customMetadata: { orderId: archive.order_id, pterodactylBackupUuid: archive.pterodactyl_backup_uuid },
        storageClass: "Standard"
      });
      await env.DB.prepare("UPDATE cancellation_archives SET status = 'ready', r2_key = ?, archived_at = unixepoch(), last_error = NULL, updated_at = unixepoch() WHERE order_id = ? AND status = 'backup_pending'")
        .bind(key, archive.order_id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE cancellation_archives SET last_error = ?, updated_at = unixepoch() WHERE order_id = ?").bind(String(error.message).slice(0, 1000), archive.order_id).run();
      console.error(`Could not copy cancellation backup for ${archive.order_id}:`, error);
    }
  }
}

async function emailReadyArchives(env, now) {
  const ready = await env.DB.prepare(
    `SELECT archives.order_id, archives.archive_purge_at, orders.customer_email, orders.game
     FROM cancellation_archives AS archives JOIN orders ON orders.id = archives.order_id
     WHERE archives.status = 'ready' AND archives.emailed_at IS NULL LIMIT 10`
  ).all();
  for (const archive of ready.results) {
    try {
      const signature = await archiveSignature(env.ARCHIVE_DOWNLOAD_SIGNING_KEY, archive.order_id, archive.archive_purge_at);
      await sendArchiveEmail(env, archive.customer_email, archive.game, archiveUrl(env, archive.order_id, archive.archive_purge_at, signature), archive.archive_purge_at);
      await env.DB.prepare("UPDATE cancellation_archives SET emailed_at = ?, updated_at = unixepoch() WHERE order_id = ? AND emailed_at IS NULL")
        .bind(now, archive.order_id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE cancellation_archives SET last_error = ?, updated_at = unixepoch() WHERE order_id = ?").bind(String(error.message).slice(0, 1000), archive.order_id).run();
      console.error(`Could not email cancellation archive for ${archive.order_id}:`, error);
    }
  }
}

async function deleteExpiredServers(env, now) {
  const due = await env.DB.prepare("SELECT order_id, pterodactyl_server_id FROM cancellation_archives WHERE status = 'ready' AND emailed_at IS NOT NULL AND server_deleted_at IS NULL AND server_delete_at <= ? LIMIT 10").bind(now).all();
  for (const archive of due.results) {
    try {
      await panelRequest(env, `/servers/${archive.pterodactyl_server_id}/force`, { method: "DELETE" });
      await env.DB.prepare("UPDATE cancellation_archives SET server_deleted_at = ?, updated_at = unixepoch() WHERE order_id = ? AND server_deleted_at IS NULL")
        .bind(now, archive.order_id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE cancellation_archives SET last_error = ?, updated_at = unixepoch() WHERE order_id = ?").bind(String(error.message).slice(0, 1000), archive.order_id).run();
      console.error(`Could not delete expired server for ${archive.order_id}:`, error);
    }
  }
}

async function purgeExpiredArchives(env, now) {
  const due = await env.DB.prepare("SELECT order_id, r2_key FROM cancellation_archives WHERE status = 'ready' AND archive_purge_at <= ? LIMIT 100").bind(now).all();
  for (const archive of due.results) {
    await env.CANCELLATION_ARCHIVES.delete(archive.r2_key);
    await env.DB.prepare("UPDATE cancellation_archives SET status = 'purged', purged_at = ?, updated_at = unixepoch() WHERE order_id = ? AND status = 'ready'")
      .bind(now, archive.order_id).run();
  }
}

async function runArchiveLifecycle(env) {
  if (!env.CANCELLATION_ARCHIVES) throw new Error("CANCELLATION_ARCHIVES R2 binding is not configured.");
  if (!env.ARCHIVE_DOWNLOAD_SIGNING_KEY) throw new Error("ARCHIVE_DOWNLOAD_SIGNING_KEY is not configured.");
  if (!env.ARCHIVE_DOWNLOAD_BASE_URL) throw new Error("ARCHIVE_DOWNLOAD_BASE_URL is not configured.");
  const now = Math.floor(Date.now() / 1000);
  await createCancellationRows(env, now);
  await startBackups(env);
  await copyCompletedBackups(env);
  await emailReadyArchives(env, now);
  await deleteExpiredServers(env, now);
  await purgeExpiredArchives(env, now);
}

async function handleArchiveDownload(request, env) {
  const url = new URL(request.url);
  const orderId = decodeURIComponent(url.pathname.slice("/archives/".length));
  const expiresAt = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  if (!orderId || !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !env.ARCHIVE_DOWNLOAD_SIGNING_KEY) return new Response("Archive link is invalid or expired.", { status: 403 });
  const expected = await archiveSignature(env.ARCHIVE_DOWNLOAD_SIGNING_KEY, orderId, expiresAt);
  if (!equalConstantTime(expected, signature)) return new Response("Archive link is invalid or expired.", { status: 403 });
  const archive = await env.DB.prepare("SELECT r2_key FROM cancellation_archives WHERE order_id = ? AND status = 'ready' AND archive_purge_at = ?").bind(orderId, expiresAt).first();
  if (!archive?.r2_key) return new Response("Archive is unavailable.", { status: 404 });
  const object = await env.CANCELLATION_ARCHIVES.get(archive.r2_key);
  if (!object?.body) return new Response("Archive is unavailable.", { status: 404 });
  const headers = new Headers({ "Content-Length": String(object.size), ETag: object.httpEtag, "Cache-Control": "private, no-store" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.startsWith("/archives/")) return handleArchiveDownload(request, env);
    return new Response("Not found.", { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const now = Math.floor(Date.now() / 1000);
      const expired = await env.DB.prepare(
        "SELECT id, pterodactyl_server_id FROM orders WHERE provider = 'stripe' AND lifecycle_state = 'grace' AND grace_expires_at <= ? AND pterodactyl_server_id IS NOT NULL"
      ).bind(now).all();
      for (const order of expired.results) {
        try {
          await suspend(env, order.pterodactyl_server_id);
          await env.DB.prepare("UPDATE orders SET lifecycle_state = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lifecycle_state = 'grace'").bind(order.id).run();
        } catch (error) {
          console.error(`Could not suspend expired order ${order.id}:`, error);
        }
      }
      await runArchiveLifecycle(env);
    })());
  }
};
