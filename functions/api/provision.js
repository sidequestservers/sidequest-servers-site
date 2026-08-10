import { getPlan, jsonError } from "../_lib/plans";

function createAdminPassword() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

export async function onRequestPost(context) {
  if (context.request.headers.get("X-Provisioning-Secret") !== context.env.PROVISIONING_SECRET) {
    return jsonError("Unauthorized.", 401);
  }
  if (context.env.PROVISIONING_ENABLED !== "true") {
    return jsonError("Provisioning is not enabled.", 503);
  }

  const { email, plan, externalId, allocationId, firstName = "SideQuest", lastName = "Customer" } = await context.request.json().catch(() => ({}));
  const selectedPlan = getPlan(plan);
  const selectedAllocationId = Number(allocationId);
  if (!email || !externalId || !selectedPlan || !Number.isInteger(selectedAllocationId)) {
    return jsonError("Invalid provisioning request.");
  }

  const panelUrl = context.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  const apiKey = context.env.PTERODACTYL_APPLICATION_API_KEY;
  const nestId = Number(context.env.PTERODACTYL_NEST_ID || 0);
  const eggId = Number(context.env.PTERODACTYL_EGG_ID || 0);
  if (!panelUrl || !apiKey || !nestId || !eggId) {
    return jsonError("Pterodactyl is not configured.", 503);
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "Application/vnd.pterodactyl.v1+json",
    "Content-Type": "application/json"
  };
  const eggResponse = await fetch(`${panelUrl}/api/application/nests/${nestId}/eggs/${eggId}?include=variables`, { headers });
  const egg = await eggResponse.json().catch(() => ({}));
  const variables = egg.attributes?.relationships?.variables?.data;
  if (!eggResponse.ok || !egg.attributes?.startup || !Array.isArray(variables)) {
    return jsonError("Unable to load the Palworld egg configuration.", 502);
  }
  const environment = Object.fromEntries(
    variables.map(({ attributes }) => [attributes.env_variable, String(attributes.default_value ?? "")])
  );
  Object.assign(environment, {
    ADMIN_PASSWORD: createAdminPassword(),
    MAX_PLAYERS: String(selectedPlan.players),
    SERVER_NAME: `SideQuest ${selectedPlan.name}`
  });
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
      egg: eggId,
      docker_image: context.env.PTERODACTYL_DOCKER_IMAGE,
      startup: egg.attributes.startup,
      environment,
      limits: { memory: selectedPlan.memory, swap: 0, disk: selectedPlan.disk, io: 500, cpu: selectedPlan.cpu },
      feature_limits: { databases: 0, allocations: 0, backups: 1 },
      allocation: { default: selectedAllocationId },
      start_on_completion: true,
      external_id: externalId
    })
  });
  const server = await serverResponse.json();
  if (!serverResponse.ok) return jsonError("Panel account was created, but server creation failed.", 502);
  return Response.json({ ok: true, panelUrl, userId: user.attributes.id, serverId: server.attributes.id, serverIdentifier: server.attributes.identifier });
}
