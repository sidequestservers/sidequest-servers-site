import { getPlan, jsonError } from "../_lib/plans";

function createAdminPassword() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

function createIdentity(firstName, lastName, externalId) {
  const initial = String(firstName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 1);
  const surname = String(lastName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  return (initial + surname).slice(0, 25) || `sq${String(externalId).replace(/[^a-z0-9]/gi, "").slice(-20)}`.toLowerCase();
}

function identityWithSuffix(identity, suffix) {
  const suffixText = suffix ? String(suffix) : "";
  return `${identity.slice(0, 25 - suffixText.length)}${suffixText}`;
}

const GAME_CONFIG = {
  palworld: {
    name: "Palworld",
    nestId: "PTERODACTYL_NEST_ID",
    eggId: "PTERODACTYL_EGG_ID",
    image: "PTERODACTYL_DOCKER_IMAGE"
  },
  zomboid: {
    name: "Project Zomboid",
    nestId: "PTERODACTYL_ZOMBOID_NEST_ID",
    eggId: "PTERODACTYL_ZOMBOID_EGG_ID",
    image: "PTERODACTYL_ZOMBOID_DOCKER_IMAGE"
  }
};

async function createDailyBackupAndRestart(panelUrl, headers, serverId, game, timezone) {
  const scheduleResponse = await fetch(`${panelUrl}/api/application/sidequest/schedules`, {
    method: "POST",
    headers,
    body: JSON.stringify({ server_id: serverId, game, timezone })
  });
  if (!scheduleResponse.ok) throw new Error("Unable to create the daily backup and restart schedule.");
}

export async function onRequestPost(context) {
  if (context.request.headers.get("X-Provisioning-Secret") !== context.env.PROVISIONING_SECRET) {
    return jsonError("Unauthorized.", 401);
  }
  if (context.env.PROVISIONING_ENABLED !== "true") {
    return jsonError("Provisioning is not enabled.", 503);
  }

  const { game = "palworld", email, plan, externalId, allocationId, secondaryAllocationId, nodeId, timezone = "", firstName = "SideQuest", lastName = "Customer" } = await context.request.json().catch(() => ({}));
  const gameConfig = GAME_CONFIG[game];
  const selectedPlan = getPlan(plan, game);
  const selectedAllocationId = Number(allocationId);
  const selectedSecondaryAllocationId = Number(secondaryAllocationId);
  const selectedNodeId = Number(nodeId);
  if (!gameConfig || !email || !externalId || !selectedPlan || !Number.isInteger(selectedAllocationId)) {
    return jsonError("Invalid provisioning request.");
  }
  if (game === "zomboid" && (!Number.isInteger(selectedSecondaryAllocationId) || !Number.isInteger(selectedNodeId))) return jsonError("Invalid Project Zomboid allocations.");

  const panelUrl = context.env.PTERODACTYL_PANEL_URL?.replace(/\/$/, "");
  const apiKey = context.env.PTERODACTYL_APPLICATION_API_KEY;
  const nestId = Number(context.env[gameConfig.nestId] || 0);
  const eggId = Number(context.env[gameConfig.eggId] || 0);
  const dockerImage = context.env[gameConfig.image];
  if (!panelUrl || !apiKey || !nestId || !eggId || !dockerImage) {
    return jsonError(`${gameConfig.name} Pterodactyl configuration is incomplete.`, 503);
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
    return jsonError(`Unable to load the ${gameConfig.name} egg configuration.`, 502);
  }
  const environment = Object.fromEntries(
    variables.map(({ attributes }) => [attributes.env_variable, String(attributes.default_value ?? "")])
  );
  if (game === "palworld") {
    Object.assign(environment, {
      ADMIN_PASSWORD: createAdminPassword(),
      MAX_PLAYERS: String(selectedPlan.players),
      SERVER_NAME: createIdentity(firstName, lastName, externalId)
    });
  } else {
    const allocationResponse = await fetch(`${panelUrl}/api/application/nodes/${selectedNodeId}/allocations/${selectedSecondaryAllocationId}`, { headers });
    const allocation = await allocationResponse.json().catch(() => ({}));
    const steamPort = allocation.attributes?.port;
    if (!allocationResponse.ok || !steamPort) return jsonError("Unable to load the Project Zomboid Steam allocation.", 502);
    Object.assign(environment, {
      SERVER_NAME: createIdentity(firstName, lastName, externalId),
      ADMIN_USER: "admin",
      ADMIN_PASSWORD: createAdminPassword(),
      STEAM_PORT: String(steamPort),
      AUTO_UPDATE: "1",
      ZOMBOID_SETTINGS_VERSION: "1"
    });
  }
  const identity = createIdentity(firstName, lastName, externalId);
  let username;
  let user;
  let userResponse;
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    username = identityWithSuffix(identity, suffix);
    userResponse = await fetch(`${panelUrl}/api/application/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, username, first_name: firstName, last_name: lastName, external_id: externalId })
    });
    user = await userResponse.json().catch(() => ({}));
    const usernameTaken = user?.errors?.some((error) => error.meta?.source_field === "username" || error.source?.pointer === "/data/attributes/username");
    if (userResponse.ok || !usernameTaken) break;
  }
  if (!userResponse.ok) return jsonError("Unable to create the panel account.", 502);
  environment.SERVER_NAME = username;

  const serverResponse = await fetch(`${panelUrl}/api/application/servers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: username,
      user: user.attributes.id,
      egg: eggId,
       docker_image: dockerImage,
      startup: egg.attributes.startup,
      environment,
      limits: { memory: selectedPlan.memory, swap: 0, disk: selectedPlan.disk, io: 500, cpu: selectedPlan.cpu },
       feature_limits: { databases: 0, allocations: 0, backups: selectedPlan.backups || 1 },
       allocation: { default: selectedAllocationId, additional: game === "zomboid" ? [selectedSecondaryAllocationId] : [] },
      start_on_completion: true,
      external_id: externalId
    })
  });
  const server = await serverResponse.json();
  if (!serverResponse.ok) return jsonError("Panel account was created, but server creation failed.", 502);
  try {
    await createDailyBackupAndRestart(panelUrl, headers, server.attributes.id, game, String(timezone || "").trim().slice(0, 64));
  } catch (error) {
    return jsonError(`Server was created, but daily restart setup failed: ${error.message}`, 502);
  }
  return Response.json({ ok: true, panelUrl, userId: user.attributes.id, serverId: server.attributes.id, serverIdentifier: server.attributes.identifier });
}
