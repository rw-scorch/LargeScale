import { TID, TERRAIN } from "../../../shared/terrain.js";

export const WARHEADS = {
  atomic: { era: "Mo", radius: 8, inner: 3, baseFlight: 60, perPlot: 1 / 30, cost: { money: 20000, uranium: 40 } },
  hydrogen: { era: "Mo", radius: 14, inner: 5, baseFlight: 75, perPlot: 1 / 30, cost: { money: 60000, uranium: 90 } },
  orbital_strike: { era: "F", radius: 5, inner: 2, baseFlight: 10, perPlot: 0, cost: { money: 40000, electronics: 50 } },
};
export const INTERCEPT = { sam_site: { range: 10, chance: 0.25 }, shield_generator: { range: 12, chance: 0.8 } };

export function launch(world, nid, from, target, kind, cfg = { nukes: true }) {
  if (!cfg.nukes) return { error: "nukes are off in this world" };
  const w = WARHEADS[kind];
  if (!w) return { error: "unknown warhead" };
  const o = world.owner[target];
  if (o && o !== nid && !world.hostile(nid, o)) return { error: "you are not at war with them" };
  if (o === nid) return { error: "that is your own land" };
  const flight = w.baseFlight + world.grid.dist(from, target) * w.perPlot;
  const m = { owner: nid, from, target, kind, due: world.time + flight };
  world.emit("nuke_launched", { nation: nid, target, due: m.due, kind });
  return { missile: m };
}

export function tryIntercept(world, m, defences, rng) {
  for (const d of defences) {
    const spec = INTERCEPT[d.type];
    if (!spec || d.owner === m.owner || !world.hostile(m.owner, d.owner)) continue;
    if (world.grid.dist(d.at, m.target) > spec.range) continue;
    if (rng.chance(spec.chance)) { world.emit("nuke_intercepted", { by: d.owner, at: d.at, target: m.target }); return true; }
  }
  return false;
}

export function detonate(world, m) {
  const w = WARHEADS[m.kind], g = world.grid;
  const tx = g.x(m.target), ty = g.y(m.target);
  const hit = { plots: 0, cleared: 0, stacks: 0, troops: 0 };
  for (let y = ty - w.radius; y <= ty + w.radius; y++)
    for (let x = tx - w.radius; x <= tx + w.radius; x++) {
      if (!g.inside(x, y)) continue;
      const d = Math.hypot(x - tx, y - ty);
      if (d > w.radius) continue;
      const i = g.idx(x, y);
      hit.plots++;
      if (!TERRAIN[world.terrain[i]].land) continue;
      if (d <= w.inner) {
        world.terrain[i] = d <= 1 ? TID.crater : TID.scorched;
        if (world.owner[i]) { world.claim(i, 0); hit.cleared++; }
        world.dirty.add(i);
      }
      for (const store of [world.civ, world.cons]) {
        if (!store) continue;
        const id = store.bld ? store.bld[i] : store.at[i];
        const b = id ? store.buildings.get(id) : null;
        if (!b || b.nuked) continue;
        b.nuked = true;
        b.state = d <= w.inner ? "rubble" : "damaged";
        if (b.residents) b.residents *= d <= w.inner ? 0 : 0.3;
      }
    }
  for (const s of [...world.stacks.values()]) {
    const d = g.dist(s.pos, m.target);
    if (d > w.radius) continue;
    const loss = d <= w.inner ? s.troops : s.troops * 0.6;
    s.troops -= loss;
    hit.troops += loss;
    if (s.troops < 1) { world.stacks.delete(s.id); hit.stacks++; }
  }
  world.emit("nuke_detonated", { by: m.owner, at: m.target, kind: m.kind, ...hit });
  return hit;
}
