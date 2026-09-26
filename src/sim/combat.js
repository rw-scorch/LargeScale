import { TERRAIN } from "../shared/terrain.js";

export const COMBAT = {
  lethality: 0.08,
  holdBonus: 1.25,
  ownLandBonus: 1.1,
  engageRange: 1,
  retreatBelow: 0,
};

export function stackPower(world, s, rules = COMBAT) {
  const holding = s.order === "hold" && !s.path.length;
  let p = ((world.powerOf ? world.powerOf(s, holding) : s.troops) + (world.supportOf ? world.supportOf(s, holding) : 0)) * (s.attackMult ?? 1) * (s.supplyMult ?? 1);
  if (world.owner[s.pos] === s.owner) p *= rules.ownLandBonus * TERRAIN[world.terrain[s.pos]].defence;
  if (holding) p *= rules.holdBonus;
  return p;
}

export function findEngagements(world, rules = COMBAT) {
  const byPlot = new Map();
  for (const s of world.stacks.values()) {
    s.engaged = false;
    if (!byPlot.has(s.pos)) byPlot.set(s.pos, []);
    byPlot.get(s.pos).push(s);
  }
  const g = world.grid, R = rules.engageRange, pairs = [], seen = new Set();
  for (const s of world.stacks.values()) {
    const sx = g.x(s.pos), sy = g.y(s.pos);
    for (let y = sy - R; y <= sy + R; y++)
      for (let x = sx - R; x <= sx + R; x++) {
        if (!g.inside(x, y)) continue;
        for (const o of byPlot.get(g.idx(x, y)) ?? []) {
          if (o.id <= s.id || !(world.hostile(s.owner, o.owner) || world.hostile(o.owner, s.owner))) continue;
          const key = s.id + ":" + o.id;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([s, o]);
        }
      }
  }
  return pairs;
}

export function resolveBattles(world, dt, rules = COMBAT) {
  const pairs = findEngagements(world, rules);
  const loss = new Map(), dealt = new Map();
  const enemies = new Map();
  for (const [a, b] of pairs) {
    enemies.set(a.id, (enemies.get(a.id) ?? 0) + 1);
    enemies.set(b.id, (enemies.get(b.id) ?? 0) + 1);
  }
  for (const [a, b] of pairs) {
    a.engaged = b.engaged = true;
    const pa = stackPower(world, a, rules) / enemies.get(a.id);
    const pb = stackPower(world, b, rules) / enemies.get(b.id);
    loss.set(a.id, (loss.get(a.id) ?? 0) + rules.lethality * pb * dt);
    loss.set(b.id, (loss.get(b.id) ?? 0) + rules.lethality * pa * dt);
    dealt.set(a.id, (dealt.get(a.id) ?? 0) + rules.lethality * pa * dt);
    dealt.set(b.id, (dealt.get(b.id) ?? 0) + rules.lethality * pb * dt);
  }
  for (const [id, l0] of loss) {
    const s = world.stacks.get(id), l = world.battleLoss ? world.battleLoss(s, l0) : l0;
    if (world.loseTroops) world.loseTroops(s, l);
    else s.troops -= l;
    if (s.troops <= 0.5) {
      world.stacks.delete(id);
      world.emit("stack_destroyed", { stack: id, nation: s.owner, at: s.pos });
    }
  }
  for (const [id, d] of dealt) {
    const s = world.stacks.get(id);
    if (s) world.gainXp?.(s, d);
  }
  return pairs.length;
}

export function simulateDuel(a, b, dt = 0.25, rules = COMBAT) {
  let A = a, B = b, t = 0;
  while (A > 0.5 && B > 0.5 && t < 36000) {
    const la = rules.lethality * B * dt, lb = rules.lethality * A * dt;
    A -= la; B -= lb; t += dt;
  }
  return { a: Math.max(0, A), b: Math.max(0, B), seconds: t };
}

export function installCombat(world, rules = COMBAT) {
  world.hooks.preTick.push(() => {
    for (const s of world.stacks.values()) s.engaged = false;
    findEngagements(world, rules).forEach(([a, b]) => { a.engaged = b.engaged = true; });
  });
  world.hooks.postMove.push((w, dt) => resolveBattles(w, dt, rules));
}
