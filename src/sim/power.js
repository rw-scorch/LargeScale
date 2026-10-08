import rules from "../../data/rules.json" with { type: "json" };
import { gridsOf, POWER_DEFAULTS } from "../shared/power.js";

export const POWER_RULES = { ...POWER_DEFAULTS, ...rules.power };

export function installPower(world, { scale = 1, rules: r = POWER_RULES } = {}) {
  if (world.power) return world.power;
  const p = { rules: r, scale, clock: 0, views: new Map() };
  world.power = p;
  const tick = (w, dt) => {
    p.clock += dt;
    while (p.clock >= r.every) { p.clock -= r.every; powerTick(w, r.every); }
  };
  tick.whole = (w, dt) => powerTick(w, dt);
  tick.rank = -2;
  world.hooks.postTick.push(tick);
  return p;
}

export function powerTick(world, dt) {
  const P = world.power, r = P.rules, bld = world.bld, byNation = new Map();
  for (const b of bld.list.values()) {
    const d = bld.table[b.type];
    if (!d.power && !d.pole && !d.uses) continue;
    const n = world.nations.get(b.owner);
    if (b.state !== "active" || world.owner[b.anchor] !== b.owner || !n?.human) { delete b.power; continue; }
    let e = byNation.get(b.owner);
    if (!e) byNation.set(b.owner, (e = { nodes: [], users: [] }));
    if (d.power || d.pole) e.nodes.push({ b, id: b.id, at: b.anchor, reach: (d.power?.reach ?? d.pole.reach) * P.scale, make: d.power?.make ?? 0 });
    if (d.uses) e.users.push({ b, id: b.id, plots: b.plots ?? [b.anchor], uses: d.uses });
  }
  P.views.clear();
  for (const [nid, e] of byNation) {
    const n = world.nations.get(nid), { grids, userGrid } = gridsOf(world.grid, e.nodes, e.users), view = { grids: [], users: {}, plants: {} };
    for (const g of grids) {
      const plants = g.nodes.filter(v => v.make > 0), need = g.users.reduce((s, u) => s + u.uses, 0);
      let make = 0;
      for (const v of plants) {
        v.fuel = !bld.table[v.b.type].power.upkeep || (n.money ?? 0) > 0;
        if (v.fuel) make += v.make;
      }
      const share = need ? Math.min(1, make / need) : 0, load = make ? Math.min(1, need / make) : 0;
      for (const v of plants) {
        if (v.fuel) n.money = Math.max(0, n.money - bld.table[v.b.type].power.upkeep * dt * load);
        view.plants[v.id] = [v.fuel ? 1 : 0, Math.round(load * 100)];
      }
      for (const u of g.users) u.b.power = r.offGrid + (1 - r.offGrid) * share;
      view.grids.push([make, need, Math.round(share * 100), plants.length, g.nodes.length - plants.length]);
    }
    for (const u of e.users) {
      if (!userGrid.has(u.id)) u.b.power = r.offGrid;
      view.users[u.id] = userGrid.has(u.id) ? userGrid.get(u.id) : -1;
    }
    P.views.set(nid, view);
  }
}

export function powerView(world, n) {
  if (!world.power || !n?.human) return null;
  return world.power.views.get(n.id) ?? { grids: [], users: {}, plants: {} };
}
