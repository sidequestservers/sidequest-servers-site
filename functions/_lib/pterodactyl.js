function configuration(env) {
  const panelUrl = env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  const apiKey = env.PTERODACTYL_APPLICATION_API_KEY;
  if (!panelUrl || !apiKey) throw new Error("Pterodactyl Application API is not configured.");
  return {
    panelUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json"
    }
  };
}

async function request(env, path, options = {}) {
  const { panelUrl, headers } = configuration(env);
  const response = await fetch(`${panelUrl}/api/application${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Pterodactyl request failed (${response.status}).`);
  return response.status === 204 ? null : response.json().catch(() => ({}));
}

export async function setServerSuspended(env, serverId, suspended) {
  await request(env, `/servers/${Number(serverId)}/${suspended ? "suspend" : "unsuspend"}`, { method: "POST" });
}

export async function updateServerBuild(env, serverId, plan) {
  // Preserve the server's current default allocation while changing only its limits.
  const server = await request(env, `/servers/${Number(serverId)}?include=allocations`);
  const attributes = server.attributes;
  const defaultAllocation = Number(attributes?.allocation);
  if (!attributes || !Number.isInteger(defaultAllocation)) throw new Error("Unable to read the server's current allocation.");
  await request(env, `/servers/${Number(serverId)}/build`, {
    method: "PATCH",
    body: JSON.stringify({
      allocation: defaultAllocation,
      memory: plan.memory,
      swap: 0,
      disk: plan.disk,
      io: 500,
      cpu: plan.cpu,
      threads: null,
      feature_limits: { databases: 0, allocations: 0, backups: plan.backups || 1 }
    })
  });
}
