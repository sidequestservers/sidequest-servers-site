import { getPlan, jsonError } from "../_lib/plans";

function createAdminPassword() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

const GAME_CONFIG = {
  palworld: {
    name: "Palworld",
    nestId: "PTERODACTYL_NEST_ID",
    eggId: "PTERODACTYL_EGG_ID",
    image: "PTERODACTYL_DOCKER_IMAGE",
    schedule: {
      name: "Daily 3:57 AM Central Backup and Restart",
      minute: "57",
      hour: "3",
      tasks: [
        { action: "command", payload: "Save", time_offset: 0, continue_on_failure: true },
        { action: "power", payload: "stop", time_offset: 60, continue_on_failure: false },
        { action: "backup", payload: "", time_offset: 60, continue_on_failure: false },
        { action: "power", payload: "start", time_offset: 300, continue_on_failure: false }
      ]
    }
  },
  zomboid: {
    name: "Project Zomboid",
    nestId: "PTERODACTYL_ZOMBOID_NEST_ID",
    eggId: "PTERODACTYL_ZOMBOID_EGG_ID",
    image: "PTERODACTYL_ZOMBOID_DOCKER_IMAGE",
    schedule: {
      name: "Project Zomboid Nightly Backup",
      minute: "0",
      hour: "5",
      tasks: [
        { action: "command", payload: "save", time_offset: 0, continue_on_failure: false },
        { action: "power", payload: "stop", time_offset: 60, continue_on_failure: false },
        { action: "backup", payload: "", time_offset: 120, continue_on_failure: false },
        { action: "power", payload: "start", time_offset: 300, continue_on_failure: false }
      ]
    }
  }
};

async function createDailyBackupAndRestart(panelUrl, headers, serverId, schedule) {
  const scheduleResponse = await fetch(`${panelUrl}/api/application/servers/${serverId}/schedules`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: schedule.name,
      minute: schedule.minute,
      hour: schedule.hour,
      day_of_week: "*",
      day_of_month: "*",
      is_active: true,
      only_when_online: false
    })
  });
  const createdSchedule = await scheduleResponse.json().catch(() => ({}));
  const scheduleId = createdSchedule.attributes?.id;
  if (!scheduleResponse.ok || !scheduleId) throw new Error("Unable to create the daily restart schedule.");

  for (const task of schedule.tasks) {
    const taskResponse = await fetch(`${panelUrl}/api/application/servers/${serverId}/schedules/${scheduleId}/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify(task)
    });
    if (!taskResponse.ok) throw new Error("Unable to create the daily backup and restart tasks.");
  }
}

export async function onRequestPost(context) {
  if (context.request.headers.get("X-Provisioning-Secret") !== context.env.PROVISIONING_SECRET) {
    return jsonError("Unauthorized.", 401);
  }
  if (context.env.PROVISIONING_ENABLED !== "true") {
    return jsonError("Provisioning is not enabled.", 503);
  }

  const { game = "palworld", email, plan, externalId, allocationId, secondaryAllocationId, nodeId, firstName = "SideQuest", lastName = "Customer" } = await context.request.json().catch(() => ({}));
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
      SERVER_NAME: `SideQuest ${selectedPlan.name}`
    });
  } else {
    const allocationResponse = await fetch(`${panelUrl}/api/application/nodes/${selectedNodeId}/allocations/${selectedSecondaryAllocationId}`, { headers });
    const allocation = await allocationResponse.json().catch(() => ({}));
    const steamPort = allocation.attributes?.port;
    if (!allocationResponse.ok || !steamPort) return jsonError("Unable to load the Project Zomboid Steam allocation.", 502);
    Object.assign(environment, {
      SERVER_NAME: `SideQuest ${selectedPlan.name}`,
      ADMIN_USER: "admin",
      ADMIN_PASSWORD: createAdminPassword(),
      STEAM_PORT: String(steamPort),
      AUTO_UPDATE: "1",
      ZOMBOID_SETTINGS_VERSION: "1"
    });
  }
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
    await createDailyBackupAndRestart(panelUrl, headers, server.attributes.id, gameConfig.schedule);
  } catch (error) {
    return jsonError(`Server was created, but daily restart setup failed: ${error.message}`, 502);
  }
  return Response.json({ ok: true, panelUrl, userId: user.attributes.id, serverId: server.attributes.id, serverIdentifier: server.attributes.identifier });
}
