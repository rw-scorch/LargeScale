import { TERRAIN } from "../shared/terrain.js";
import { findPath, costField } from "../shared/pathfind.js";
import { encodeRuns, decodeRuns } from "../shared/codec.js";
import { ROAD_TYPES, ROAD_MULT, ROAD_RULES, TUNNEL, roadPlan, routePlan, roadSprite } from "../shared/roads.js";

export { ROAD_MULT };
export const ROADS = Object.fromEntries(ROAD_TYPES.map((k, i) => [k, i]));
export const ROAD_NAMES = ROAD_TYPES;
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

export function installRoads(world, opts = {}) {
  const log = world.log ?? installLogistics(world);
  log.rules = { ...ROAD_RULES, ...opts.rules, types: { ...ROAD_RULES.types, ...opts.rules?.types } };
  log.scale = opts.scale ?? 1;
  log.news = new Set();
  log.count = new Uint32Array(ROAD_TYPES.length);
  log.count[0] = log.road.length;
  const base = world.moveCost.bind(world);
  world.moveCost = (a, b) => (log.road[b] === TUNNEL ? (TERRAIN[world.terrain[b]].land ? ROAD_MULT[TUNNEL] : Infinity) : base(a, b) * ROAD_MULT[log.road[b]]);
  world.pathMinStep = () => {
    let low = 1;
    for (let k = 1; k < log.count.length; k++) if (log.count[k]) low = Math.min(low, ROAD_MULT[k]);
    return 0.9 * low;
  };
  if (world.bld) (world.bld.extra ??= {}).road = () => encodeRuns(log.road);
  return log;
}

export function setRoad(world, i, level) {
  const log = world.log, was = log.road[i];
  if (was === level) return;
  log.count[was]--;
  log.count[level]++;
  log.road[i] = level;
  log.ver = (log.ver ?? 0) + 1;
  log.news.add(i);
  world.bld?.changed.add("road");
}

export function restoreRoads(world, bytes) {
  const log = world.log;
  if (bytes?.length) decodeRuns(bytes, log.road);
  log.count.fill(0);
  for (const v of log.road) log.count[v]++;
  log.news.clear();
  return log.road.length - log.count[0];
}

export function takeRoadNews(world) {
  const log = world.log;
  if (!log?.news?.size) return null;
  const out = new Uint32Array(log.news.size * 2);
  let k = 0;
  for (const i of log.news) { out[k++] = i; out[k++] = log.road[i]; }
  log.news.clear();
  return out;
}

export function roadView(world) {
  const bld = world.bld, blocked = i => { const id = bld?.at.get(i); return id !== undefined && bld.list.get(id)?.state !== "rubble"; };
  return { w: world.grid.w, terrain: world.terrain, road: world.log.road, owner: world.owner, blocked };
}

export function payAndLay(world, nid, plan, kind) {
  const log = world.log, n = world.nations.get(nid);
  const need = log.rules.types[kind]?.needs, locked = need && world.lockReason?.(nid, need);
  if (locked) return { error: locked };
  if (!plan.plots.length) return { error: kind === "none" ? "there is no road of yours there" : "that road is already there" };
  const short = Object.entries(plan.cost).find(([k, v]) => (k === "money" ? n.money ?? 0 : n.stock?.[k] ?? 0) < v);
  if (short) return { error: `you need ${short[1]} ${short[0] === "money" ? "gold" : short[0]} for ${plan.plots.length} plots`, cost: plan.cost };
  for (const [k, v] of Object.entries(plan.cost)) if (k === "money") n.money -= v; else n.stock[k] -= v;
  const level = ROAD_TYPES.indexOf(kind);
  for (const i of plan.plots) setRoad(world, i, level);
  return { laid: plan.plots.length, cost: plan.cost, bridges: plan.bridges, skipped: plan.skipped };
}

export function layRoad(world, nid, points, kind) {
  const log = world.log, n = world.nations.get(nid);
  if (!log?.rules || !n) return { error: "roads are not running in this world" };
  const plan = roadPlan(roadView(world), nid, points, kind, log.rules, log.scale);
  return plan.error ? plan : payAndLay(world, nid, plan, kind);
}

export function layRoute(world, nid, from, to, kind) {
  const log = world.log, n = world.nations.get(nid);
  if (!log?.rules || !n) return { error: "roads are not running in this world" };
  const plan = routePlan(roadView(world), nid, from, to, kind, log.rules, log.scale);
  return plan.error ? plan : payAndLay(world, nid, plan, kind);
}

export function roadSpriteAt(world, i) { return roadSprite(world.log.road, world.terrain, world.grid.w, i); }

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
