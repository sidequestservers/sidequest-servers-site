import { getPlan, jsonError } from "../_lib/plans";

export async function onRequestPost(context) {
  if (context.request.headers.get("X-Provisioning-Secret") !== context.env.PROVISIONING_SECRET) {
    return jsonError("Unauthorized.", 401);
  }
  if (context.env.PROVISIONING_ENABLED !== "true") {
    return jsonError("Provisioning is not enabled.", 503);
  }

  const { email, plan, externalId, firstName = "SideQuest", lastName = "Customer" } = await context.request.json().catch(() => ({}));
  const selectedPlan = getPlan(plan);
  if (!email || !externalId || !selectedPlan) return jsonError("Invalid provisioning request.");

  const panelUrl = context.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  const apiKey = context.env.PTERODACTYL_APPLICATION_API_KEY;
  const environment = JSON.parse(context.env.PTERODACTYL_ENVIRONMENT_JSON || "{}");
  const locationIds = JSON.parse(context.env.PTERODACTYL_LOCATION_IDS_JSON || "[]");
  const defaultAllocation = Number(context.env.PTERODACTYL_ALLOCATION_ID || 0);
  if (!panelUrl || !apiKey || !context.env.PTERODACTYL_EGG_ID || (!defaultAllocation && !locationIds.length)) {
    return jsonError("Pterodactyl is not configured.", 503);
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "Application/vnd.pterodactyl.v1+json",
    "Content-Type": "application/json"
  };
  const username = `sq${String(externalId).replace(/[^a-z0-9]/gi, "").slice(-20)}`.toLowerCase();
  const userResponse = await fetch(`${panelUrl}/api/application/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, username, first_name: firstName, last_name: lastName, external_id: externalId })
  });
  const user = await userResponse.json();
  if (!userResponse.ok) return jsonError("Unable to create the panel account.", 502);

  const serverResponse = await fetch(`${panelUrl}/api/application/servers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `${selectedPlan.name} - ${username}`,
      user: user.attributes.id,
      egg: Number(context.env.PTERODACTYL_EGG_ID),
      docker_image: context.env.PTERODACTYL_DOCKER_IMAGE,
      startup: context.env.PTERODACTYL_STARTUP,
      environment,
      limits: { memory: selectedPlan.memory, swap: 0, disk: selectedPlan.disk, io: 500, cpu: selectedPlan.cpu },
      feature_limits: { databases: 0, allocations: 0, backups: 1 },
      ...(defaultAllocation
        ? { allocation: { default: defaultAllocation } }
        : { deployment: { locations: locationIds, dedicated_ip: false, port_range: [] } }),
      start_on_completion: true,
      external_id: externalId
    })
  });
  const server = await serverResponse.json();
  if (!serverResponse.ok) return jsonError("Panel account was created, but server creation failed.", 502);
  return Response.json({ ok: true, panelUrl, userId: user.attributes.id, serverId: server.attributes.id, serverIdentifier: server.attributes.identifier });
}
