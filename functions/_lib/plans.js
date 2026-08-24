export const PLANS = {
  "6": { name: "Starter Camp", players: 6, priceCents: 899, memory: 6144, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_STARTER_6_MONTHLY" },
  "8": { name: "Frontier Base", players: 10, priceCents: 1199, memory: 8192, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_FRONTIER_8_MONTHLY" },
  "12": { name: "Guild Hall", players: 16, priceCents: 1699, memory: 12288, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_GUILD_12_MONTHLY" }
};

export const ZOMBOID_PLANS = {
  "6": { name: "Safehouse", players: 4, priceCents: 899, memory: 6144, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_SAFEHOUSE_6_MONTHLY" },
  "8": { name: "Survivor Group", players: 8, priceCents: 1199, memory: 8192, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_SURVIVOR_8_MONTHLY" },
  "12": { name: "Outbreak", players: 12, priceCents: 1699, memory: 12288, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_OUTBREAK_12_MONTHLY" }
};

export function getPlan(planId, game = "palworld") {
  const plans = game === "zomboid" ? ZOMBOID_PLANS : game === "palworld" ? PLANS : null;
  return plans?.[String(planId)] || null;
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
