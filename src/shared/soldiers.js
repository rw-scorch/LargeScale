export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function soldierCount(troops, each) {
  return troops > 0.5 ? Math.max(1, Math.floor(troops / each + 1e-6)) : 0;
}

export function typedTroops(mix) {
  let t = 0;
  for (const id in mix ?? {}) if (mix[id] > 0) t += mix[id];
  return t;
}

export function troopsOfType(troops, mix, id) {
  return id === "levy" ? Math.max(0, troops - typedTroops(mix)) : Math.max(0, mix?.[id] ?? 0);
}

export function soldierTypes(troops, mix, each) {
  const total = soldierCount(troops, each);
  if (!total) return [];
  const parts = [];
  for (const id of Object.keys(mix ?? {}).sort()) if (mix[id] > 1e-6) parts.push([id, mix[id]]);
  const levy = troopsOfType(troops, mix, "levy");
  if (levy > 1e-6) parts.push(["levy", levy]);
  const sum = parts.reduce((a, p) => a + p[1], 0);
  if (!(sum > 0)) return [["levy", total]];
  const exact = parts.map(([id, t]) => { const x = (t / sum) * total; return { id, n: Math.floor(x), rest: x - Math.floor(x) }; });
  let left = total - exact.reduce((a, e) => a + e.n, 0);
  for (const e of [...exact].sort((a, b) => b.rest - a.rest)) { if (left <= 0) break; e.n++; left--; }
  return exact.filter(e => e.n > 0).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)).map(e => [e.id, e.n]);
}

export function typeOfSlot(types, k) {
  for (const [id, n] of types) { if (k < n) return id; k -= n; }
  return null;
}

export function formationSlot(k, spacing) {
  if (k === 0) return [0, 0];
  const r = (spacing / Math.sqrt(Math.PI)) * Math.sqrt(k + 0.5) * 1.05, a = k * GOLDEN;
  return [r * Math.cos(a), r * Math.sin(a)];
}
