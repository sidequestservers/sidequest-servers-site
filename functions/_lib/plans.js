export const PLANS = {
  "4": { name: "Starter Camp", players: 4, priceCents: 699, memory: 5120, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_STARTER_4_MONTHLY" },
  "6": { name: "Explorer Outpost", players: 6, priceCents: 899, memory: 6144, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_EXPLORER_6_MONTHLY" },
  "8": { name: "Frontier Base", players: 8, priceCents: 1099, memory: 7168, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_FRONTIER_8_MONTHLY" },
  "12": { name: "Guild Hall", players: 12, priceCents: 1499, memory: 8192, disk: 20480, cpu: 0, priceEnv: "STRIPE_PALWORLD_PRICE_ID_GUILD_12_MONTHLY" }
};

export const ZOMBOID_PLANS = {
  "5": { name: "Safehouse", players: 4, priceCents: 899, memory: 5120, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_SAFEHOUSE_5_MONTHLY" },
  "10": { name: "Survivor Group", players: 8, priceCents: 1399, memory: 8192, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_SURVIVOR_10_MONTHLY" },
  "15": { name: "Outbreak", players: 12, priceCents: 1649, memory: 10240, disk: 25600, cpu: 0, backups: 1, priceEnv: "STRIPE_ZOMBOID_PRICE_ID_OUTBREAK_15_MONTHLY" }
};

export function getPlan(planId, game = "palworld") {
  const plans = game === "zomboid" ? ZOMBOID_PLANS : game === "palworld" ? PLANS : null;
  return plans?.[String(planId)] || null;
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
