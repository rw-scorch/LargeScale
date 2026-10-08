import rules from "../../data/rules.json" with { type: "json" };

export const SHIELD_RULES = { every: 2, ...rules.shields };

export function installShields(world, { rules: r = SHIELD_RULES } = {}) {
  if (world.shields) return world.shields;
  world.shields = { rules: r, list: null, at: -Infinity };
  return world.shields;
}

export function shieldSites(world) {
  const S = world.shields;
  if (!S) return [];
  if (S.list && world.time - S.at < S.rules.every) return S.list;
  S.at = world.time;
  S.list = [];
  const g = world.grid, sc = world.machines?.scale ?? 1;
  for (const b of world.bld?.list.values() ?? []) {
    const d = world.bld.table[b.type], sh = d?.shield;
    if (!sh || b.state !== "active" || world.owner[b.anchor] !== b.owner) continue;
    S.list.push({ b, owner: b.owner, x: g.x(b.anchor) + d.fp[0] / 2, y: g.y(b.anchor) + d.fp[1] / 2, r: sh.radius * sc, chance: sh.chance * (b.power ?? 1), cut: sh.bombCut });
  }
  return S.list;
}

export function shieldsOver(world, attacker, x, y) {
  const out = [];
  for (const s of shieldSites(world)) if (s.owner !== attacker && world.hostile(attacker, s.owner) && Math.hypot(s.x - x, s.y - y) <= s.r) out.push(s);
  return out.sort((a, b) => b.chance - a.chance);
}

export function bombCut(world, attacker, x, y) {
  let cut = 0;
  for (const s of shieldsOver(world, attacker, x, y)) cut = Math.max(cut, s.cut);
  return 1 - cut;
}
