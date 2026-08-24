async function suspend(env, serverId) {
  const panelUrl = env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  if (!panelUrl || !env.PTERODACTYL_APPLICATION_API_KEY) throw new Error("Pterodactyl Application API is not configured.");
  const response = await fetch(`${panelUrl}/api/application/servers/${serverId}/suspend`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PTERODACTYL_APPLICATION_API_KEY}`,
      Accept: "Application/vnd.pterodactyl.v1+json"
    }
  });
  if (!response.ok) throw new Error(`Pterodactyl suspend failed (${response.status}).`);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const expired = await env.DB.prepare(
        "SELECT id, pterodactyl_server_id FROM orders WHERE provider = 'stripe' AND lifecycle_state = 'grace' AND grace_expires_at <= ? AND pterodactyl_server_id IS NOT NULL"
      ).bind(Math.floor(Date.now() / 1000)).all();
      for (const order of expired.results) {
        try {
          // The query is deliberately limited to a D1 order with an owned server ID.
          await suspend(env, order.pterodactyl_server_id);
          await env.DB.prepare(
            "UPDATE orders SET lifecycle_state = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lifecycle_state = 'grace'"
          ).bind(order.id).run();
        } catch (error) {
          console.error(`Could not suspend expired order ${order.id}:`, error);
        }
      }
    })());
  }
};
