import { costField } from "../shared/pathfind.js";

export const CBD = {
  radius: 14,
  maxBonus: 0.5,
  minBonus: 0,
  attackShare: 0.6,
  weightByValue: true,
};

export function installCbd(world, rules = {}) {
  world.cbd = { rules: { ...CBD, ...rules }, centres: [], field: null };
  return world.cbd;
}

export function setCentres(world, centres) {
  world.cbd.centres = centres.map(c => ({ at: c.at, owner: c.owner, value: c.value ?? 1 }));
  world.cbd.field = null;
}

export function rebuildField(world) {
  const r = world.cbd.rules;
  const cost = () => 1;
  cost.minStep = 1;
  const byNation = new Map();
  for (const c of world.cbd.centres) {
    if (!byNation.has(c.owner)) byNation.set(c.owner, []);
    byNation.get(c.owner).push(c);
  }
  const fields = new Map();
  for (const [nid, list] of byNation) {
    const f = costField(world.grid, list.map(c => ({ i: c.at })), cost, r.radius * (r.weightByValue ? Math.max(...list.map(c => c.value)) : 1));
    fields.set(nid, { f, list });
  }
  world.cbd.field = fields;
  return fields;
}

export function strengthAt(world, nid, plot) {
  const r = world.cbd.rules;
  if (!world.cbd.field) rebuildField(world);
  const entry = world.cbd.field.get(nid);
  if (!entry) return 0;
  const d = entry.f.dist[plot];
  if (!(d < Infinity)) return 0;
  const centre = entry.list.reduce((best, c) => (world.grid.dist(c.at, plot) < world.grid.dist(best.at, plot) ? c : best), entry.list[0]);
  const reach = r.radius * (r.weightByValue ? centre.value : 1);
  if (d > reach) return 0;
  return r.minBonus + (r.maxBonus - r.minBonus) * (1 - d / reach);
}

export function defenceMultiplier(world, nid, plot) {
  return 1 + strengthAt(world, nid, plot);
}

export function attackMultiplier(world, nid, plot) {
  return 1 + strengthAt(world, nid, plot) * world.cbd.rules.attackShare;
}

export function installCombatHooks(world) {
  const baseCapture = world.captureCost.bind(world);
  world.captureCost = (i, attacker) => {
    const owner = world.owner[i];
    const base = baseCapture(i, attacker);
    if (!owner) return base;
    return base * defenceMultiplier(world, owner, i) / attackMultiplier(world, attacker, i);
  };
}
