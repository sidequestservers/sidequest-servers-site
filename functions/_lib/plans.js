export const PLANS = {
  "4": { name: "Starter Camp", players: 4, priceCents: 699, memory: 5120, disk: 10240, cpu: 100 },
  "6": { name: "Explorer Outpost", players: 6, priceCents: 899, memory: 6144, disk: 12288, cpu: 125 },
  "8": { name: "Frontier Base", players: 8, priceCents: 1099, memory: 7168, disk: 15360, cpu: 150 },
  "12": { name: "Guild Hall", players: 12, priceCents: 1499, memory: 8192, disk: 20480, cpu: 200 }
};

export const ZOMBOID_PLANS = {
  "5": { name: "Safehouse", players: 5, priceCents: 899, memory: 5120, disk: 25600, cpu: 0, backups: 1 },
  "10": { name: "Survivor Group", players: 10, priceCents: 1399, memory: 8192, disk: 25600, cpu: 0, backups: 1 },
  "15": { name: "Outbreak", players: 15, priceCents: 1649, memory: 10240, disk: 25600, cpu: 0, backups: 1 }
};

export function getPlan(planId, game = "palworld") {
  const plans = game === "zomboid" ? ZOMBOID_PLANS : game === "palworld" ? PLANS : null;
  return plans?.[String(planId)] || null;
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
