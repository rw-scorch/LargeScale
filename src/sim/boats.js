import rules from "../../data/rules.json" with { type: "json" };
import { isLand } from "../shared/terrain.js";
import { UNIT_TYPES, spawnUnit, embark, orderUnit, waterGraph, bodiesOf, waterOk, ownsPort, wreck } from "./units.js";
import { knownOf } from "./research.js";

export const BOATS = { type: "transport_boat", maxBoats: 3, search: 40, embarkSearch: 120, sinkMult: 40, loss: { min: 0.01, perPlot: 0.001, max: 0.15 }, ...rules.boats };

export function installBoats(world, { scale = 1, rules: r = BOATS } = {}) {
  world.boats = { rules: r, scale };
  world.hooks.postMove.push((w, dt) => { launchBoats(w); raidBoats(w, dt); });
  world.landingPenalty = u => (u.transport ? u.transport.loss : null);
  world.afterLanding = (u, s) => {
    if (!u.transport) return;
    world.units.list.delete(u.id);
    if (!s) return;
    const then = u.transport.then;
    if (then?.order === "advance") world.orderAdvance(s.id, then.only ?? null, true);
    else if (then?.to !== undefined && (then.to !== s.pos || then.via?.length)) world.orderMove(s.id, then.to, "move", then.via ?? []);
  };
  return world.boats;
}

const bodyAt = (co, i) => { const r = co.regionOf(i); return r < 0 ? -1 : bodiesOf(co)[r]; };

function neighbours(g, i) {
  const x = g.x(i), y = g.y(i), out = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (g.inside(x + dx, y + dy)) out.push(g.idx(x + dx, y + dy));
  return out;
}

function waterBeside(world, i, body = null) {
  const co = waterGraph(world);
  for (const n of neighbours(world.grid, i)) if (waterOk(world.terrain[n]) && (body === null || bodyAt(co, n) === body)) return n;
  return null;
}

function crossings(world, nid) {
  const keys = new Set();
  for (const u of world.units.list.values()) if (u.owner === nid && !u.wreck && UNIT_TYPES[u.type]?.transport) keys.add(u.transport?.group ?? `u${u.id}`);
  for (const s of world.stacks.values()) if (s.owner === nid && s.sail) keys.add(s.sail.group ?? `s${s.id}`);
  return keys;
}

export const boatsAtSea = (world, nid) => crossings(world, nid).size;

export function crossingOf(world, from, via, to) {
  const pts = [...via, to];
  let at = from;
  for (let k = 0; k < pts.length; k++) {
    if (world.route(at, pts[k])) { at = pts[k]; continue; }
    for (let j = k + 1; j < pts.length; j++) if (!world.route(pts[j - 1], pts[j])) return { error: "a drawn path can cross water only once" };
    return { from: at, target: pts[k], before: pts.slice(0, k), then: pts.slice(k, -1) };
  }
  return null;
}

export function boatLoss(world, crossing, safe = false, mult = 1) {
  const l = world.boats.rules.loss;
  return safe ? 0 : Math.min(l.max, l.min + (l.perPlot / world.boats.scale) * crossing) * mult;
}

export function boatType(world, nid) {
  const n = world.nations.get(nid);
  return UNIT_TYPES.landing_craft && n?.research && knownOf(n).has("amphibious_warfare") ? "landing_craft" : world.boats.rules.type;
}

export function boatPlan(world, nid, from, target) {
  const g = world.grid, t = world.terrain;
  if (!isLand(t[target])) return { error: "pick land, not water" };
  const co = waterGraph(world), land = world.pathGraph(), home = bodyAt(land, from), R = Math.round(world.boats.rules.search * world.boats.scale);
  let landing = null, landSea = null, best = Infinity;
  const tx = g.x(target), ty = g.y(target);
  for (let y = Math.max(0, ty - R); y <= Math.min(g.h - 1, ty + R); y++) for (let x = Math.max(0, tx - R); x <= Math.min(g.w - 1, tx + R); x++) {
    const i = g.idx(x, y), d = g.dist(i, target);
    if (d >= best || !isLand(t[i]) || bodyAt(land, i) === home) continue;
    const o = world.owner[i];
    if (o && o !== nid && !world.passable(nid, o) && !world.hostile(nid, o)) continue;
    const sea = waterBeside(world, i);
    if (sea === null) continue;
    best = d; landing = i; landSea = sea;
  }
  if (landing === null) return { error: "there is no coast to land on near there" };
  const body = bodyAt(co, landSea);
  let embarkAt = null, sea = null, score = Infinity;
  const fx = g.x(from), fy = g.y(from), E = Math.round(world.boats.rules.embarkSearch * world.boats.scale);
  const look = (x, y) => {
    if (!g.inside(x, y)) return;
    const i = g.idx(x, y);
    if (world.owner[i] !== nid || bodyAt(land, i) !== home) return;
    const w = waterBeside(world, i, body);
    if (w === null) return;
    const s = g.dist(w, landSea) + 0.5 * g.dist(from, i);
    if (s < score) { score = s; embarkAt = i; sea = w; }
  };
  for (let r = 0; r <= E && 0.5 * r < score; r++) {
    if (!r) { look(fx, fy); continue; }
    for (let k = -r; k <= r; k++) { look(fx + k, fy - r); look(fx + k, fy + r); }
    for (let k = -r + 1; k < r; k++) { look(fx - r, fy + k); look(fx + r, fy + k); }
  }
  if (embarkAt === null) return { error: "your land does not reach that sea yet; take land down to the coast first" };
  const crossing = g.dist(sea, landSea);
  return { embark: embarkAt, sea, landing, landSea, crossing, loss: boatLoss(world, crossing, ownsPort(world, nid, landing), UNIT_TYPES[boatType(world, nid)].lossMult ?? 1) };
}

export function sendByBoat(world, sid, target, then = {}, { from = null, via = [], group = null } = {}) {
  const s = world.stacks.get(sid);
  if (!s || !world.boats) return { error: "no boats in this world" };
  const r = world.boats.rules, keys = crossings(world, s.owner);
  if (keys.size >= r.maxBoats && !(group && keys.has(group))) return { error: `at most ${r.maxBoats} boats at sea at once` };
  const plan = boatPlan(world, s.owner, from ?? s.pos, target);
  if (plan.error) return plan;
  if ((s.pos !== plan.embark || via.length) && !world.orderMove(s.id, plan.embark, "move", via)) return { error: "no land route to your coast there" };
  s.sail = { ...plan, target, then, group };
  s.board = null;
  return { boat: true, crossing: Math.round(plan.crossing), loss: plan.loss, landing: plan.landing };
}

function raidBoats(world, dt) {
  const boats = [], ships = [];
  for (const u of world.units.list.values()) {
    const d = UNIT_TYPES[u.type];
    if (u.wreck || d?.domain !== "sea") continue;
    if (d.transport) boats.push(u);
    else if (d.attack > 0) ships.push(u);
  }
  if (!boats.length || !ships.length) return;
  const g = world.grid, hit = world.machines.rules.lethality * world.boats.rules.sinkMult * dt;
  for (const b of boats) for (const s of ships) {
    if (b.wreck || (!world.hostile(s.owner, b.owner) && !world.hostile(b.owner, s.owner))) continue;
    const d = UNIT_TYPES[s.type];
    if (g.cheb(s.at, b.at) > Math.max(1, Math.round(d.range * world.machines.scale))) continue;
    b.hp -= d.attack * hit;
    b.hitBy = s.owner;
    if (b.hp <= 0) wreck(world, b);
  }
}

function launchBoats(world) {
  for (const s of [...world.stacks.values()]) {
    const p = s.sail;
    if (!p) continue;
    if (s.pos !== p.embark) {
      if (!s.path.length && !s.route) { s.sail = null; world.emit("board_failed", { stack: s.id, nation: s.owner, why: "they could not reach the coast" }); }
      continue;
    }
    s.sail = null;
    const u = spawnUnit(world, s.owner, boatType(world, s.owner), p.sea);
    if (!u) { world.emit("board_failed", { stack: s.id, nation: s.owner, why: "no water to launch from" }); continue; }
    const troops = s.troops;
    u.transport = { then: p.then, target: p.target, crossing: p.crossing, loss: p.loss, home: p.embark, homeSea: p.sea, group: p.group ?? null };
    if (embark(world, s.id, u.id)) { world.units.list.delete(u.id); continue; }
    if (orderUnit(world, u.id, p.landSea)) { u.path = []; u.route = null; }
    u.land = p.landing;
    world.emit("boat_launched", { nation: s.owner, machine: u.id, troops, at: p.embark, to: p.landing, loss: p.loss });
  }
}
