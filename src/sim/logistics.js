import { TERRAIN } from "../shared/terrain.js";
import { findPath, costField } from "../shared/pathfind.js";

export const ROADS = { none: 0, dirt: 1, cobble: 2, paved: 3, highway: 4, rail: 5 };
export const ROAD_NAMES = Object.keys(ROADS);
export const ROAD_MULT = [1, 0.6, 0.45, 0.3, 0.2, 0.12];
export const CONVOY = {
  T: { sprite: "supply_T", capacity: 10, speed: 1.0 },
  M: { sprite: "supply_M", capacity: 30, speed: 1.3 },
  G: { sprite: "supply_G", capacity: 50, speed: 1.5 },
  I: { sprite: "supply_I", capacity: 150, speed: 2.5 },
  Mo: { sprite: "supply_Mo", capacity: 300, speed: 3.5 },
  F: { sprite: "supply_F", capacity: 500, speed: 5 },
};
export const SUPPLY = { range: 18, attritionPerSec: 0.004, minMult: 0.5, perTroopPerSec: 0.0005 };

export function installLogistics(world) {
  const log = { road: new Uint8Array(world.grid.size), nodes: new Map(), convoys: new Map(), next: 1, clock: 0 };
  world.log = log;
  return log;
}

export function roadMask(world, i) {
  const g = world.grid, r = world.log.road, x = g.x(i), y = g.y(i);
  if (!r[i]) return null;
  let m = 0;
  if (y > 0 && r[i - g.w]) m |= 1;
  if (x < g.w - 1 && r[i + 1]) m |= 2;
  if (y < g.h - 1 && r[i + g.w]) m |= 4;
  if (x > 0 && r[i - 1]) m |= 8;
  const name = [[1, "N"], [2, "E"], [4, "S"], [8, "W"]].filter(([b]) => m & b).map(v => v[1]).join("") || "dot";
  const kind = ROAD_NAMES[r[i]];
  return kind === "rail" ? `rail_${name}` : `road_${kind}_${name}`;
}

export function travelCost(world, nid, allowForeign = false) {
  const f = (a, b) => {
    const t = TERRAIN[world.terrain[b]];
    if (!t.land || t.move === Infinity) return Infinity;
    const o = world.owner[b];
    if (!allowForeign && o !== nid && !(o && world.passable(nid, o))) return Infinity;
    return t.move * ROAD_MULT[world.log.road[b]];
  };
  f.minStep = 0.12;
  return f;
}

export function addNode(world, nid, at, cap = 500) {
  const n = { id: world.log.next++, owner: nid, at, stock: {}, keep: {}, want: {}, cap };
  world.log.nodes.set(n.id, n);
  return n;
}

export function sendConvoy(world, from, to, cargo, era = "M") {
  const spec = CONVOY[era];
  const path = findPath(world.grid, from.at, to.at, travelCost(world, from.owner), 80000);
  if (!path) return null;
  let load = 0;
  for (const [k, v] of Object.entries(cargo)) {
    const take = Math.min(v, from.stock[k] ?? 0, spec.capacity - load);
    if (take <= 0) continue;
    from.stock[k] -= take;
    cargo[k] = take;
    load += take;
  }
  for (const k of Object.keys(cargo)) if (!(cargo[k] > 0) || (from.stock[k] ?? 0) < 0) delete cargo[k];
  if (!load) return null;
  const c = { id: world.log.next++, owner: from.owner, from: from.id, to: to.id, cargo, pos: from.at, path: path.slice(1), progress: 0, speed: spec.speed, sprite: spec.sprite };
  world.log.convoys.set(c.id, c);
  return c;
}

export function stepConvoys(world, dt) {
  const log = world.log;
  for (const c of [...log.convoys.values()]) {
    if (!c.path.length) {
      const dest = log.nodes.get(c.to);
      if (dest) for (const [k, v] of Object.entries(c.cargo)) dest.stock[k] = (dest.stock[k] ?? 0) + v;
      log.convoys.delete(c.id);
      world.emit("convoy_arrived", { convoy: c.id, node: c.to });
      continue;
    }
    const next = c.path[0];
    const t = TERRAIN[world.terrain[next]];
    c.progress += (c.speed * dt) / (t.move * ROAD_MULT[log.road[next]]);
    while (c.progress >= 1 && c.path.length) {
      c.progress -= 1;
      c.pos = c.path.shift();
      const o = world.owner[c.pos];
      if (o && o !== c.owner && world.hostile(c.owner, o)) {
        log.convoys.delete(c.id);
        world.emit("convoy_lost", { convoy: c.id, at: c.pos, cargo: c.cargo });
        break;
      }
    }
  }
}

export function dispatch(world, nid, era = "M") {
  const nodes = [...world.log.nodes.values()].filter(n => n.owner === nid);
  const sent = [];
  const kinds = new Set(nodes.flatMap(n => [...Object.keys(n.stock), ...Object.keys(n.want)]));
  for (const k of kinds) {
    const needy = nodes.filter(n => (n.stock[k] ?? 0) < (n.want[k] ?? 0));
    for (const to of needy) {
      const busy = [...world.log.convoys.values()].some(c => c.to === to.id && c.cargo[k]);
      if (busy) continue;
      const gap = (to.want[k] ?? 0) - (to.stock[k] ?? 0);
      const donors = nodes
        .filter(n => n !== to && (n.stock[k] ?? 0) - (n.keep[k] ?? 0) > 0)
        .sort((a, b) => world.grid.dist(a.at, to.at) - world.grid.dist(b.at, to.at));
      const from = donors[0];
      if (!from) continue;
      const amount = Math.min(gap, from.stock[k] - (from.keep[k] ?? 0));
      const c = sendConvoy(world, from, to, { [k]: amount }, era);
      if (c) sent.push(c);
    }
  }
  return sent;
}

export function supplyField(world, nid, sources, range = SUPPLY.range) {
  const cost = travelCost(world, nid, false);
  return costField(world.grid, sources.map(i => ({ i })), cost, range * 3);
}

export function applySupply(world, nid, field, dt, rules = SUPPLY) {
  for (const s of world.stacks.values()) {
    if (s.owner !== nid) continue;
    const d = field.dist[s.pos];
    if (d <= rules.range) { s.supplyMult = 1; s.outOfSupply = 0; continue; }
    const over = d === Infinity ? rules.range : Math.min(rules.range, d - rules.range);
    s.supplyMult = Math.max(rules.minMult, 1 - over / rules.range);
    s.outOfSupply = (s.outOfSupply ?? 0) + dt;
    s.troops -= s.troops * rules.attritionPerSec * (1 - s.supplyMult) * 2 * dt;
  }
}

export function supplySources(world, nid, extra = []) {
  const src = [];
  for (const n of world.log.nodes.values()) if (n.owner === nid && (n.stock.food ?? 0) > 0) src.push(n.at);
  for (const s of world.stacks.values()) if (s.owner === nid && s.kind === "supply" && s.supplies > 0) src.push(s.pos);
  return [...src, ...extra];
}
