import unitData from "../../data/units.json" with { type: "json" };
import rules from "../../data/rules.json" with { type: "json" };
import { TERRAIN, isLand } from "../shared/terrain.js";
import { buildRegions, coarseRoute, planSegment } from "../shared/pathfind.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";
import { nationBuildings } from "./buildings.js";

export const UNIT_TYPES = Object.fromEntries(unitData.units.filter(d => d.kind === "machine").map(d => [d.id, d]));

export const LANDING = { penalty: 0.15, beachPenalty: 0.05, portPenalty: 0, dropPenalty: 0.1, samLoss: 0.35, ...rules.landing };
export const MINES = { stackShare: 0.25, stackMax: 200, vehicleDamage: 60 };
export const MACHINE_RULES = { wreckSeconds: 300, queueMax: 10, hpPerLoss: 2, portRadius: 2, followEvery: 1, lethality: rules.combat?.lethality ?? 0.08, ...rules.machines };

const waterOk = t => !TERRAIN[t].land && TERRAIN[t].water !== "ice";
const WATER_MOVE = Float32Array.from({ length: 256 }, (_, t) => (TERRAIN[t] && waterOk(t) ? 1 : Infinity));

function around(grid, i, r = 1) {
  const x0 = grid.x(i), y0 = grid.y(i), out = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if ((dx || dy) && grid.inside(x0 + dx, y0 + dy)) out.push(grid.idx(x0 + dx, y0 + dy));
  return out;
}

function clean(h) {
  if (!h?.mix) return;
  for (const id in h.mix) if (!(h.mix[id] > 1e-6)) delete h.mix[id];
  if (!Object.keys(h.mix).length) h.mix = null;
}

export function installUnits(world) {
  world.units ??= { list: new Map(), next: 1, mines: new Map(), sams: [] };
  return world.units;
}

export function spawnUnit(world, owner, type, at) {
  const def = UNIT_TYPES[type];
  if (!def) return null;
  if (def.domain === "land" && !isLand(world.terrain[at])) return null;
  if (def.domain === "sea" && !waterOk(world.terrain[at])) return null;
  const u = { id: world.units.next++, owner, type, at, hp: def.hp, path: [], route: null, progress: 0, cargo: null, follow: null, land: null, wreck: 0, face: 1 };
  world.units.list.set(u.id, u);
  if (def.domain === "sea") waterGraph(world);
  return u;
}

export function unitCost(world, def) {
  const f = (a, b) => {
    const t = TERRAIN[world.terrain[b]];
    if (def.domain === "sea") return t.land ? Infinity : t.water === "ice" ? Infinity : 1;
    if (def.domain === "land") return t.land ? t.move : Infinity;
    return 1;
  };
  f.minStep = def.domain === "land" ? 0.9 : 1;
  return f;
}

export function waterGraph(world) {
  world.units.water ??= buildRegions(world.grid, world.terrain, WATER_MOVE, world.rules.pathCell ?? 16);
  return world.units.water;
}

const graphOf = (world, def) => (def.domain === "sea" ? waterGraph(world) : world.pathGraph());

export function bodiesOf(co) {
  if (co.bodies) return co.bodies;
  const body = new Int32Array(co.regions).fill(-1), todo = new Int32Array(co.regions);
  for (let r = 0, n = 0; r < co.regions; r++) {
    if (body[r] >= 0) continue;
    body[r] = n;
    let top = 0;
    todo[top++] = r;
    while (top) {
      const c = todo[--top];
      for (let k = co.off[c]; k < co.off[c + 1]; k++) if (body[co.to[k]] < 0) { body[co.to[k]] = n; todo[top++] = co.to[k]; }
    }
    n++;
  }
  co.bodies = body;
  return body;
}

export function reachable(world, domain, from, to) {
  const co = domain === "sea" ? waterGraph(world) : world.pathGraph(), a = co.regionOf(from), b = co.regionOf(to);
  return a >= 0 && b >= 0 && bodiesOf(co)[a] === bodiesOf(co)[b];
}

function extendUnitPath(world, u) {
  const def = UNIT_TYPES[u.type], co = graphOf(world, def), r = u.route, from = u.path.length ? u.path[u.path.length - 1] : u.at;
  let k = r.regions.indexOf(co.regionOf(from));
  if (k < 0) {
    const fresh = coarseRoute(co, co.regionOf(from), co.regionOf(r.goal));
    if (!fresh) return false;
    r.regions = fresh.regions;
    k = 0;
  }
  r.regions.splice(0, k);
  const seg = planSegment(world.grid, co, from, r.regions, r.goal, unitCost(world, def), { ahead: world.rules.pathAhead ?? 8, maxNodes: world.rules.pathMaxNodes ?? 60000 });
  if (!seg) return false;
  for (let j = 1; j < seg.length; j++) u.path.push(seg[j]);
  if (seg[seg.length - 1] === r.goal) u.route = null;
  return true;
}

export function orderUnit(world, uid, target) {
  const u = world.units.list.get(uid), def = u && UNIT_TYPES[u.type];
  if (!def || u.wreck) return "no such machine";
  if (def.domain === "air") {
    if (world.grid.dist(u.at, target) > def.range) return "out of range";
    u.path = [target];
    return null;
  }
  if (!(unitCost(world, def)(target, target) < Infinity)) return def.domain === "sea" ? "ships sail on water only" : "machines go on land only";
  const keep = { path: u.path, route: u.route, progress: u.progress };
  u.path = [];
  u.progress = 0;
  u.route = null;
  if (target === u.at) return null;
  const co = graphOf(world, def), r = reachable(world, def.domain, u.at, target) ? coarseRoute(co, co.regionOf(u.at), co.regionOf(target)) : null;
  u.route = r && { regions: r.regions, goal: target };
  if (!r || !extendUnitPath(world, u)) {
    Object.assign(u, keep);
    return def.domain === "sea" ? "no way there by water" : "no land route there";
  }
  return null;
}

export function stepUnits(world, dt) {
  const base = world.rules.stackSpeed ?? 1, g = world.grid;
  for (const u of world.units.list.values()) {
    const def = UNIT_TYPES[u.type];
    if (!def || u.wreck) continue;
    if (def.domain === "air") {
      if (!u.path.length) continue;
      const d = g.dist(u.at, u.path[0]);
      u.progress += def.speed * dt;
      if (u.progress >= d) { u.at = u.path.shift(); u.progress = 0; }
      continue;
    }
    if (u.route && u.path.length < (world.rules.pathLookahead ?? 24) && !extendUnitPath(world, u)) {
      u.route = null;
      world.emit("machine_blocked", { machine: u.id, nation: u.owner });
    }
    if (!u.path.length) { u.progress = 0; continue; }
    const c = unitCost(world, def);
    u.progress += (def.speed * base * dt) / c(u.at, u.path[0]);
    while (u.progress >= 1 && u.path.length) {
      u.progress -= 1;
      const next = u.path.shift(), dx = g.x(next) - g.x(u.at);
      if (dx) u.face = dx > 0 ? 1 : -1;
      u.at = next;
    }
    if (!u.path.length && !u.route) u.progress = 0;
  }
}

export function embark(world, stackId, shipId) {
  const s = world.stacks.get(stackId), u = world.units.list.get(shipId);
  if (!s || !u || u.wreck) return "missing";
  const def = UNIT_TYPES[u.type];
  if (def.domain !== "sea" || !def.capacity) return "not a transport";
  if (u.owner !== s.owner) return "not your ship";
  if (world.grid.cheb(s.pos, u.at) > 1) return "ship must be next to the troops";
  const room = def.capacity - (u.cargo?.troops ?? 0);
  if (room < 1) return "ship is full";
  const load = Math.min(room, s.troops), share = load / s.troops;
  const c = u.cargo ?? { troops: 0, owner: s.owner, mix: null, xp: 0 };
  c.xp = (c.xp * c.troops + (s.xp ?? 0) * load) / (c.troops + load);
  c.troops += load;
  if (s.mix) {
    c.mix ??= {};
    for (const id in s.mix) {
      const k = s.mix[id] * share;
      c.mix[id] = (c.mix[id] ?? 0) + k;
      s.mix[id] -= k;
    }
    clean(s);
  }
  u.cargo = c;
  s.troops -= load;
  if (s.troops < 1) world.stacks.delete(s.id);
  return null;
}

export function disembark(world, shipId, target, ownsPort = false) {
  const u = world.units.list.get(shipId);
  if (!u?.cargo?.troops) return { error: "nothing aboard" };
  if (!isLand(world.terrain[target])) return { error: "must land on land" };
  if (world.grid.cheb(u.at, target) > 1) return { error: "too far from the shore" };
  const def = UNIT_TYPES[u.type], cargo = u.cargo, owner = cargo.owner, o = world.owner[target];
  const ours = o === owner || (o && world.passable(owner, o));
  if (!ours && o && !world.hostile(owner, o)) return { error: "you are not at war with them" };
  const pen = ownsPort ? LANDING.portPenalty : def.beach ? LANDING.beachPenalty : LANDING.penalty;
  let troops = cargo.troops * (1 - pen);
  const mix = cargo.mix ? { ...cargo.mix } : null, scale = k => { if (mix) for (const id in mix) mix[id] *= k; };
  scale(1 - pen);
  u.cargo = null;
  if (!ours) {
    const raw = world.captureCost(target, owner), attack = world.stackAttack({ troops, mix, xp: cargo.xp }) * (o ? world.siegeAt(owner, target) : 1);
    const cost = raw / attack;
    if (troops <= cost) {
      world.emit("landing_failed", { nation: owner, at: target, lost: troops, machine: u.id });
      return { lost: troops };
    }
    scale((troops - cost) / troops);
    troops -= cost;
    if (o) {
      world.loseReserve(world.nations.get(o), raw * world.rules.defenderLossShare);
      world.plotLost(o, owner, target);
    }
    world.claim(target, owner);
  }
  const s = { id: world.nextStack++, owner, pos: target, troops, path: [], progress: 0, order: "hold", engaged: false };
  if (mix) { s.mix = mix; clean(s); }
  if (cargo.xp) s.xp = cargo.xp;
  const n = world.nations.get(owner);
  if (n?.standing) s.standing = n.standing;
  world.stacks.set(s.id, s);
  world.emit("landed", { nation: owner, at: target, troops, lost: cargo.troops - troops, machine: u.id, stack: s.id });
  return { stack: s };
}

export function samCover(world, attacker, at) {
  return world.units.sams.some(s => s.owner !== attacker && world.hostile(attacker, s.owner) && world.grid.dist(s.at, at) <= s.range);
}

export function paradrop(world, planeId, target, troops, rng) {
  const u = world.units.list.get(planeId), def = UNIT_TYPES[u.type];
  if (def.domain !== "air" || !def.capacity) return { error: "not a transport aircraft" };
  if (troops > def.capacity) return { error: `can carry ${def.capacity}` };
  if (!TERRAIN[world.terrain[target]].land) return { error: "cannot drop on water" };
  if (world.grid.dist(u.at, target) > def.range) return { error: "out of range" };
  const n = world.nations.get(u.owner);
  if (n.troops < troops) return { error: "not enough troops at the airfield" };
  n.troops -= troops;
  let landing = troops * (1 - LANDING.dropPenalty);
  if (samCover(world, u.owner, target) && rng.chance(0.5)) landing *= 1 - LANDING.samLoss;
  const flight = world.grid.dist(u.at, target) / def.speed;
  return { due: world.time + flight, owner: u.owner, target, troops: landing };
}

export function landParatroopers(world, drop) {
  const o = world.owner[drop.target];
  let troops = drop.troops;
  if (o !== drop.owner && !(o && world.passable(drop.owner, o))) {
    const cost = world.captureCost(drop.target, drop.owner);
    if (troops <= cost) return null;
    troops -= cost;
    world.claim(drop.target, drop.owner);
  }
  const s = { id: world.nextStack++, owner: drop.owner, pos: drop.target, troops, path: [], progress: 0, order: "hold", engaged: false };
  world.stacks.set(s.id, s);
  return s;
}

export function placeMine(world, nid, at) {
  if (!TERRAIN[world.terrain[at]].land) return "mines go on land";
  const o = world.owner[at];
  if (o && o !== nid) return "only on your land or no-man's land";
  if (!o && !world.grid.neighbours4(at).some(i => world.owner[i] === nid)) return "must touch your border";
  if (world.units.mines.has(at)) return "already mined";
  world.units.mines.set(at, { owner: nid });
  return null;
}

export function triggerMines(world) {
  const hits = [];
  for (const s of world.stacks.values()) {
    const m = world.units.mines.get(s.pos);
    if (!m || m.owner === s.owner || !world.hostile(m.owner, s.owner)) continue;
    const loss = Math.min(MINES.stackMax, s.troops * MINES.stackShare);
    s.troops -= loss;
    world.units.mines.delete(s.pos);
    hits.push({ at: s.pos, stack: s.id, loss });
  }
  for (const u of world.units.list.values()) {
    const m = world.units.mines.get(u.at);
    if (!m || UNIT_TYPES[u.type]?.domain !== "land" || m.owner === u.owner || !world.hostile(m.owner, u.owner)) continue;
    u.hp -= MINES.vehicleDamage;
    world.units.mines.delete(u.at);
    if (u.hp <= 0) world.units.list.delete(u.id);
    hits.push({ at: u.at, unit: u.id });
  }
  for (const h of hits) world.emit("mine", h);
  return hits;
}

export function visibleMines(world, viewer) {
  return [...world.units.mines].filter(([, m]) => m.owner === viewer || world.passable(viewer, m.owner)).map(([at]) => at);
}

export function installMachines(world, { speed = 1, scale = 1, rules: r = MACHINE_RULES, saved = null } = {}) {
  if (world.machines) return world.machines;
  installUnits(world);
  const M = { rules: r, speed, scale, queues: new Map(), support: null, supportAt: -1, siege: null, siegeAt: -1 };
  world.machines = M;
  if (saved) restoreMachines(world, saved);
  for (const u of world.units.list.values()) if (UNIT_TYPES[u.type].domain === "sea") { waterGraph(world); break; }
  world.hooks.preTick.push((w, dt) => {
    expireWrecks(w);
    followStacks(w);
    stepUnits(w, dt);
    landCargo(w);
  });
  world.hooks.postMove.push((w, dt) => {
    boardShips(w);
    shipBattles(w, dt);
    captureLoose(w);
  });
  world.hooks.postTick.push((w, dt) => produce(w, dt));
  const split = world.splitStack.bind(world);
  world.splitStack = (sid, amount) => {
    const c = split(sid, amount);
    if (c) c.board = null;
    return c;
  };
  world.supportOf = (s, holding) => {
    let p = 0;
    for (const u of supportMap(world).get(s.id) ?? []) p += UNIT_TYPES[u.type][holding ? "defence" : "attack"];
    return p;
  };
  world.battleLoss = (s, loss) => {
    const list = supportMap(world).get(s.id);
    if (!list?.length || !(loss > 0)) return loss;
    const holding = s.order === "hold" && !s.path.length, stat = u => UNIT_TYPES[u.type][holding ? "defence" : "attack"];
    const mp = list.reduce((a, u) => a + stat(u), 0), tp = world.powerOf ? world.powerOf(s, holding) : s.troops;
    if (!(mp > 0)) return loss;
    const taken = (loss * mp) / (mp + tp);
    for (const u of list) damage(world, u, ((taken * stat(u)) / mp) * r.hpPerLoss);
    return loss - taken;
  };
  world.siegeAt = (owner, i) => {
    const list = siegeLists(world).get(owner);
    if (!list) return 1;
    let best = 1;
    for (const u of list) {
      const def = UNIT_TYPES[u.type];
      if (def.siege > best && world.grid.cheb(u.at, i) <= Math.round(def.range * M.scale)) best = def.siege;
    }
    return best;
  };
  return M;
}

function supportMap(world) {
  const M = world.machines, g = world.grid;
  if (M.support && M.supportAt === world.time) return M.support;
  const map = new Map(), owners = new Set();
  for (const u of world.units.list.values()) if (!u.wreck && UNIT_TYPES[u.type]?.domain === "land") owners.add(u.owner);
  if (owners.size) {
    const byPlot = new Map();
    for (const s of world.stacks.values()) if (owners.has(s.owner)) byPlot.set(s.pos, [...(byPlot.get(s.pos) ?? []), s]);
    for (const u of world.units.list.values()) {
      if (u.wreck || UNIT_TYPES[u.type]?.domain !== "land") continue;
      const f = u.follow !== null ? world.stacks.get(u.follow) : null;
      let best = f && f.owner === u.owner && g.cheb(f.pos, u.at) <= 1 ? f : null;
      if (!best) for (const p of [u.at, ...around(g, u.at)]) for (const s of byPlot.get(p) ?? []) if (s.owner === u.owner && (!best || s.id < best.id)) best = s;
      if (best) map.set(best.id, [...(map.get(best.id) ?? []), u]);
    }
  }
  M.support = map;
  M.supportAt = world.time;
  return map;
}

function siegeLists(world) {
  const M = world.machines;
  if (M.siege && M.siegeAt === world.time) return M.siege;
  const map = new Map();
  for (const u of world.units.list.values()) if (!u.wreck && UNIT_TYPES[u.type]?.siege) map.set(u.owner, [...(map.get(u.owner) ?? []), u]);
  M.siege = map;
  M.siegeAt = world.time;
  return map;
}

function damage(world, u, hp) {
  if (u.wreck || !(hp > 0)) return;
  u.hp -= hp;
  if (u.hp <= 0) wreck(world, u);
}

export function wreck(world, u) {
  const lost = u.cargo?.troops ?? 0;
  Object.assign(u, { hp: 0, wreck: world.time + world.machines.rules.wreckSeconds, path: [], route: null, progress: 0, follow: null, land: null, cargo: null });
  world.emit("machine_destroyed", { machine: u.id, nation: u.owner, kind: u.type, at: u.at, lost });
}

function expireWrecks(world) {
  for (const u of world.units.list.values()) if (u.wreck && world.time >= u.wreck) world.units.list.delete(u.id);
}

function followStacks(world) {
  const g = world.grid, every = world.machines.rules.followEvery;
  for (const u of world.units.list.values()) {
    if (u.wreck || u.follow === null) continue;
    const s = world.stacks.get(u.follow);
    if (!s || s.owner !== u.owner) { u.follow = null; continue; }
    if (g.cheb(u.at, s.pos) <= 1) {
      if (u.path.length || u.route) { u.path = []; u.route = null; u.progress = 0; }
      continue;
    }
    const end = u.route?.goal ?? (u.path.length ? u.path[u.path.length - 1] : null);
    if (end !== null && g.cheb(end, s.pos) <= Math.max(1, g.cheb(u.at, s.pos) >> 2)) continue;
    if (world.time - (u.replan ?? -Infinity) < every) continue;
    u.replan = world.time;
    orderUnit(world, u.id, s.pos);
  }
}

export function ownsPort(world, owner, at) {
  if (world.owner[at] !== owner || !world.bld) return false;
  const reach = Math.round(world.machines.rules.portRadius * world.machines.scale);
  for (const b of nationBuildings(world, owner)) {
    if (b.state !== "active" || !world.bld.table[b.type]?.port) continue;
    if (b.plots.some(p => world.grid.cheb(p, at) <= reach)) return true;
  }
  return false;
}

function landCargo(world) {
  const g = world.grid;
  for (const u of world.units.list.values()) {
    if (u.wreck || u.land === null || u.path.length || u.route) continue;
    const at = u.land;
    u.land = null;
    if (!u.cargo) continue;
    if (g.cheb(u.at, at) > 1) { world.emit("landing_failed", { nation: u.owner, at, lost: 0, machine: u.id, why: "the ship could not reach the coast there" }); continue; }
    const r = disembark(world, u.id, at, ownsPort(world, u.cargo.owner, at));
    if (r.error) world.emit("landing_failed", { nation: u.owner, at, lost: 0, machine: u.id, why: r.error });
  }
}

export function landingSpots(world, at, from) {
  const g = world.grid;
  return around(g, at).filter(p => waterOk(world.terrain[p])).sort((a, b) => g.dist(a, from) - g.dist(b, from));
}

export function shoreNear(world, shipAt, from) {
  const g = world.grid;
  let best = null, bd = Infinity;
  for (const p of around(g, shipAt)) {
    if (!isLand(world.terrain[p])) continue;
    const d = g.dist(p, from);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function boardShips(world) {
  for (const s of world.stacks.values()) {
    if (s.board === undefined || s.board === null) continue;
    const u = world.units.list.get(s.board);
    const fail = why => { s.board = null; world.emit("board_failed", { stack: s.id, nation: s.owner, why }); };
    if (!u || u.wreck || u.owner !== s.owner) { fail("the ship is gone"); continue; }
    if (world.grid.cheb(s.pos, u.at) <= 1) {
      const troops = s.troops, e = embark(world, s.id, u.id);
      s.board = null;
      if (e) fail(e);
      else world.emit("embarked", { stack: s.id, nation: s.owner, machine: u.id, troops: troops - (world.stacks.has(s.id) ? s.troops : 0), left: world.stacks.has(s.id) ? s.troops : 0 });
      continue;
    }
    if (s.path.length || s.route) continue;
    const spot = shoreNear(world, u.at, s.pos);
    if (spot === null || !world.orderMove(s.id, spot, "move")) fail("no land route to the ship");
  }
}

function shipBattles(world, dt) {
  const r = world.machines.rules, g = world.grid, ships = [];
  for (const u of world.units.list.values()) if (!u.wreck && UNIT_TYPES[u.type]?.domain === "sea") ships.push(u);
  if (ships.length < 2) return;
  const byPlot = new Map();
  for (const u of ships) byPlot.set(u.at, [...(byPlot.get(u.at) ?? []), u]);
  const pairs = [], foes = new Map();
  for (const a of ships)
    for (const p of [a.at, ...around(g, a.at)])
      for (const b of byPlot.get(p) ?? [])
        if (b.id > a.id && (world.hostile(a.owner, b.owner) || world.hostile(b.owner, a.owner))) {
          pairs.push([a, b]);
          foes.set(a.id, (foes.get(a.id) ?? 0) + 1);
          foes.set(b.id, (foes.get(b.id) ?? 0) + 1);
        }
  const power = u => UNIT_TYPES[u.type][u.path.length ? "attack" : "defence"] / foes.get(u.id);
  const hits = pairs.map(([a, b]) => [a, b, power(a), power(b)]);
  for (const [a, b, pa, pb] of hits) {
    damage(world, a, r.lethality * pb * dt * r.hpPerLoss);
    damage(world, b, r.lethality * pa * dt * r.hpPerLoss);
  }
}

function captureLoose(world) {
  const g = world.grid;
  let byPlot = null;
  for (const u of world.units.list.values()) {
    if (u.wreck || UNIT_TYPES[u.type]?.domain !== "land") continue;
    if (!byPlot) {
      byPlot = new Map();
      for (const s of world.stacks.values()) byPlot.set(s.pos, [...(byPlot.get(s.pos) ?? []), s]);
    }
    let friend = false, foe = null;
    for (const p of [u.at, ...around(g, u.at)])
      for (const s of byPlot.get(p) ?? []) {
        if (s.owner === u.owner || world.passable(u.owner, s.owner)) friend = true;
        else if (world.hostile(s.owner, u.owner) && (!foe || s.troops > foe.troops)) foe = s;
      }
    if (friend || !foe) continue;
    const from = u.owner;
    Object.assign(u, { owner: foe.owner, path: [], route: null, progress: 0, follow: null });
    world.emit("machine_captured", { machine: u.id, kind: u.type, nation: from, by: foe.owner, at: u.at });
  }
}

export function machineLock(world, nid, type) {
  const def = Object.hasOwn(UNIT_TYPES, type) ? UNIT_TYPES[type] : null, n = world.nations.get(nid);
  if (!def) return "unknown machine";
  if (eraIdx(def.era) > eraIdx(n?.era ?? "T")) return `needs the ${ERA_NAMES[def.era]} era`;
  return world.lockReason?.(nid, type, "units") ?? null;
}

const have = (n, res) => (res === "money" ? n.money ?? 0 : n.stock?.[res] ?? 0);

function shortOf(n, cost) {
  for (const [res, v] of Object.entries(cost)) if (have(n, res) < v) return res === "money" ? "gold" : res;
  return null;
}

function pay(n, cost, k = 1) {
  for (const [res, v] of Object.entries(cost)) {
    if (res === "money") n.money += -v * k;
    else n.stock[res] = (n.stock[res] ?? 0) - v * k;
  }
}

export function queueMachines(world, nid, bid, type, count = 1) {
  const M = world.machines, b = world.bld?.list.get(bid), n = world.nations.get(nid);
  if (!n?.alive) return { error: "your nation is gone" };
  if (!b || b.owner !== nid) return { error: "not your building" };
  const d = world.bld.table[b.type];
  if (!d.builds?.length) return { error: `a ${d.name.toLowerCase()} builds no machines` };
  if (b.state !== "active") return { error: "finish the building first" };
  if (!d.builds.includes(type)) return { error: `a ${d.name.toLowerCase()} builds ${d.builds.map(t => UNIT_TYPES[t]?.name.toLowerCase() ?? t).join(" and ")}` };
  const lock = machineLock(world, nid, type);
  if (lock) return { error: lock };
  if (!Number.isInteger(count) || count < 1) return { error: "build at least one" };
  const q = M.queues.get(bid) ?? { owner: nid, items: [], progress: 0, paid: false, why: null };
  if (q.items.length + count > M.rules.queueMax) return { error: `at most ${M.rules.queueMax} in a queue` };
  for (let k = 0; k < count; k++) q.items.push(type);
  M.queues.set(bid, q);
  return { queued: q.items.length };
}

export function clearQueue(world, nid, bid) {
  const q = world.machines.queues.get(bid);
  if (!q || q.owner !== nid) return { error: "nothing is being built there" };
  const refund = refundOf(world, q);
  world.machines.queues.delete(bid);
  return { cleared: q.items.length, refund };
}

function refundOf(world, q) {
  const n = world.nations.get(q.owner), def = q.paid && UNIT_TYPES[q.items[0]];
  if (!def || !n?.alive) return {};
  pay(n, def.cost, -1);
  q.paid = false;
  return { ...def.cost };
}

function spawnSpot(world, b, def) {
  const g = world.grid, seen = new Set(b.plots);
  let fallback = null;
  for (const p of b.plots)
    for (const q of around(g, p)) {
      if (seen.has(q)) continue;
      seen.add(q);
      if (def.domain === "sea") { if (waterOk(world.terrain[q])) return q; continue; }
      if (!isLand(world.terrain[q]) || world.owner[q] !== b.owner) continue;
      if (!world.bld.at.has(q)) return q;
      fallback ??= q;
    }
  return fallback;
}

export function produce(world, dt) {
  const M = world.machines;
  for (const [bid, q] of M.queues) {
    const b = world.bld?.list.get(bid);
    if (!b || b.owner !== q.owner || !q.items.length) { refundOf(world, q); M.queues.delete(bid); continue; }
    if (b.state !== "active") { q.why = "the building is being worked on"; continue; }
    const def = UNIT_TYPES[q.items[0]], n = world.nations.get(q.owner);
    if (!q.paid) {
      const short = shortOf(n, def.cost);
      if (short) { q.why = `not enough ${short}`; continue; }
      pay(n, def.cost);
      q.paid = true;
      q.progress = 0;
    }
    q.why = null;
    q.progress = Math.min(1, q.progress + (dt * M.speed) / def.time);
    if (q.progress < 1) continue;
    const at = spawnSpot(world, b, def);
    if (at === null) { q.why = def.domain === "sea" ? "no open water next to it" : "no free land next to it"; continue; }
    const u = spawnUnit(world, q.owner, def.id, at);
    q.items.shift();
    q.paid = false;
    q.progress = 0;
    world.emit("machine_built", { nation: q.owner, machine: u.id, kind: def.id, building: bid });
  }
}

export function saveMachines(world) {
  if (!world.machines) return null;
  const list = [...world.units.list.values()].map(({ replan, ...u }) => u);
  return { next: world.units.next, list, queues: [...world.machines.queues] };
}

export function restoreMachines(world, saved) {
  world.units.next = saved.next ?? 1;
  for (const u of saved.list ?? []) if (UNIT_TYPES[u.type]) world.units.list.set(u.id, u);
  for (const [bid, q] of saved.queues ?? []) world.machines.queues.set(bid, q);
}

export function machineOrdersOf(world, nid) {
  const orders = [], queues = {};
  if (!world.machines) return null;
  for (const u of world.units.list.values()) {
    if (u.owner !== nid || u.wreck) continue;
    const to = u.route?.goal ?? (u.path.length ? u.path[u.path.length - 1] : null);
    if (to === null && u.land === null && u.follow === null) continue;
    orders.push({ id: u.id, to, land: u.land, follow: u.follow });
  }
  for (const [bid, q] of world.machines.queues) if (q.owner === nid) queues[bid] = { items: [...q.items], progress: Math.round(q.progress * 100) / 100, why: q.why };
  return { orders, queues };
}

export function giveMachine(world, nid, type) {
  const def = UNIT_TYPES[type], n = world.nations.get(nid);
  if (!def || !n?.spawned || n.capital === undefined) return null;
  const g = world.grid, seen = new Set([n.capital]), todo = [n.capital];
  for (let k = 0; k < todo.length && k < 40000; k++) {
    const i = todo[k];
    if (def.domain === "land" ? world.owner[i] === nid && isLand(world.terrain[i]) : waterOk(world.terrain[i])) return spawnUnit(world, nid, type, i);
    for (const j of g.neighbours4(i)) if (!seen.has(j) && (world.owner[j] === nid || def.domain === "sea")) { seen.add(j); todo.push(j); }
  }
  return null;
}
