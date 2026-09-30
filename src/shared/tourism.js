export const TOURISM_RULES = { airport: 0.25, port: 0.1, rail: 0.1, wonder: 0.1, variety: 0.5 };
export const CORE_RULES = { radius: 14, maxBonus: 0.5, minBonus: 0, attackShare: 0.6 };

export function tourismIncome(items, links = {}, rules = TOURISM_RULES) {
  let base = 0, wonders = 0;
  const kinds = new Set();
  for (const it of items) {
    kinds.add(it.type);
    if (it.wonder) wonders++;
    base += it.value * (it.mult ?? 1);
  }
  const variety = items.length ? 1 - rules.variety + rules.variety * Math.sqrt(kinds.size / items.length) : 1;
  const reach = 1 + (links.airport ? rules.airport : 0) + (links.port ? rules.port : 0) + (links.rail ? rules.rail : 0);
  const wonder = 1 + rules.wonder * wonders;
  return { perSecond: base * wonder * reach * variety, base, variety, reach, wonder, sites: items.length, kinds: kinds.size, wonders };
}

export function coreCentre(w, b, def) {
  return { x: (b.anchor % w) + (def.fp[0] >> 1), y: Math.floor(b.anchor / w) + (def.fp[1] >> 1), value: def.core };
}

export function coreStrength(centres, x, y, rules = CORE_RULES, scale = 1) {
  let best = 0;
  for (const c of centres) {
    const reach = rules.radius * scale * c.value, d = Math.hypot(x - c.x, y - c.y);
    if (d > reach) continue;
    best = Math.max(best, rules.minBonus + (rules.maxBonus - rules.minBonus) * (1 - d / reach));
  }
  return best;
}
