export const PLANS = {
  "4": { name: "Starter Camp", priceCents: 699, memory: 4096, disk: 10240, cpu: 100 },
  "6": { name: "Explorer Outpost", priceCents: 899, memory: 5120, disk: 12288, cpu: 125 },
  "8": { name: "Frontier Base", priceCents: 1099, memory: 6144, disk: 15360, cpu: 150 },
  "12": { name: "Guild Hall", priceCents: 1499, memory: 8192, disk: 20480, cpu: 200 }
};

export function getPlan(planId) {
  return PLANS[String(planId)] || null;
}

export function jsonError(message, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
