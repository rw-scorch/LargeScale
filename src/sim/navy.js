import { UNIT_TYPES, NAVY_RULES, diveOf } from "./units.js";

export function installNavy(world, { rules: r = NAVY_RULES } = {}) {
  if (world.navy) return world.navy;
  world.navy = { rules: r };
  world.hooks.postTick.push((w, dt) => navyTick(w, dt));
  return world.navy;
}

function stackBuckets(world, cell) {
  const g = world.grid, map = new Map();
  for (const s of world.stacks.values()) {
    const k = Math.floor(g.x(s.pos) / cell) * 65536 + Math.floor(g.y(s.pos) / cell);
    let b = map.get(k);
    if (!b) map.set(k, (b = []));
    b.push(s);
  }
  return map;
}

export function navyTick(world, dt) {
  const g = world.grid, sc = world.machines?.scale ?? 1, guns = [];
  for (const u of world.units?.list.values() ?? []) {
    const def = UNIT_TYPES[u.type];
    if (def?.domain !== "sea") continue;
    if (def.sub) {
      const d = diveOf(world, u);
      if (d) u.dive = d;
      else delete u.dive;
    }
    if (def.shell && !u.wreck) guns.push(u);
    else if (u.shelling != null) u.shelling = null;
  }
  if (!guns.length) return;
  const cell = world.navy.rules.cell, map = stackBuckets(world, cell);
  for (const u of guns) {
    const S = UNIT_TYPES[u.type].shell, reach = Math.max(1, Math.round(S.range * sc)), x = g.x(u.at), y = g.y(u.at);
    let best = null, bd = Infinity;
    for (let bx = Math.floor((x - reach) / cell); bx <= Math.floor((x + reach) / cell); bx++)
      for (let by = Math.floor((y - reach) / cell); by <= Math.floor((y + reach) / cell); by++)
        for (const s of map.get(bx * 65536 + by) ?? []) {
          if (s.owner === u.owner || !world.hostile(u.owner, s.owner) || !world.stacks.has(s.id)) continue;
          const d = g.cheb(u.at, s.pos);
          if (d <= reach && d < bd) { bd = d; best = s; }
        }
    u.shelling = best ? best.pos : null;
    if (!best) continue;
    world.loseTroops(best, Math.min(best.troops, S.troops * dt));
    if (best.troops <= 0.5) {
      world.stacks.delete(best.id);
      world.emit("stack_destroyed", { stack: best.id, nation: best.owner, at: best.pos, by: u.owner });
    }
  }
}
