export const PLANS = {
  "4": { name: "Starter Camp", players: 4, priceCents: 699, memory: 6144, disk: 10240, cpu: 100 },
  "6": { name: "Explorer Outpost", players: 6, priceCents: 899, memory: 6144, disk: 12288, cpu: 125 },
  "8": { name: "Frontier Base", players: 8, priceCents: 1099, memory: 12288, disk: 15360, cpu: 150 },
  "12": { name: "Guild Hall", players: 12, priceCents: 1499, memory: 12288, disk: 20480, cpu: 200 }
};

export function getPlan(planId) {
  return PLANS[String(planId)] || null;
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
