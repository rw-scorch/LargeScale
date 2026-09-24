import { TERRAIN } from "../shared/terrain.js";
import { findPath } from "../shared/pathfind.js";

export const UNIT_TYPES = {
  catapult: { domain: "land", era: "M", hp: 40, attack: 14, defence: 2, range: 3, speed: 0.8, siege: 2.0 },
  cannon: { domain: "land", era: "G", hp: 50, attack: 22, defence: 4, range: 4, speed: 0.9, siege: 2.5 },
  armoured_car: { domain: "land", era: "I", hp: 70, attack: 18, defence: 12, range: 1, speed: 3.5 },
  early_tank: { domain: "land", era: "I", hp: 120, attack: 30, defence: 22, range: 1, speed: 2.2 },
  field_artillery: { domain: "land", era: "I", hp: 60, attack: 35, defence: 5, range: 6, speed: 1.4, siege: 2 },
  apc: { domain: "land", era: "Mo", hp: 110, attack: 12, defence: 25, range: 1, speed: 3.2, capacity: 40 },
  main_battle_tank: { domain: "land", era: "Mo", hp: 220, attack: 60, defence: 45, range: 2, speed: 3.0 },
  galley: { domain: "sea", era: "M", hp: 60, attack: 6, defence: 6, range: 1, speed: 1.8, capacity: 120 },
  cog: { domain: "sea", era: "M", hp: 80, attack: 4, defence: 8, range: 1, speed: 2.2, capacity: 200 },
  galleon: { domain: "sea", era: "G", hp: 160, attack: 30, defence: 20, range: 3, speed: 2.6, capacity: 300 },
  landing_craft: { domain: "sea", era: "I", hp: 50, attack: 2, defence: 6, range: 1, speed: 3, capacity: 300, beach: true },
  destroyer: { domain: "sea", era: "I", hp: 200, attack: 45, defence: 30, range: 5, speed: 5 },
  submarine: { domain: "sea", era: "I", hp: 120, attack: 70, defence: 10, range: 3, speed: 3.5, hidden: true },
  battleship: { domain: "sea", era: "I", hp: 600, attack: 110, defence: 90, range: 9, speed: 3 },
  transport_plane: { domain: "air", era: "I", hp: 60, attack: 0, defence: 4, range: 90, speed: 12, capacity: 250 },
  early_fighter: { domain: "air", era: "I", hp: 50, attack: 20, defence: 10, range: 50, speed: 14 },
  transport_heli: { domain: "air", era: "Mo", hp: 70, attack: 0, defence: 8, range: 40, speed: 9, capacity: 30 },
};

export const LANDING = { penalty: 0.15, beachPenalty: 0.05, portPenalty: 0, dropPenalty: 0.1, samLoss: 0.35 };
export const MINES = { stackShare: 0.25, stackMax: 200, vehicleDamage: 60 };

export function installUnits(world) {
  world.units = { list: new Map(), next: 1, mines: new Map(), sams: [] };
  return world.units;
}

export function spawnUnit(world, owner, type, at) {
  const def = UNIT_TYPES[type];
  const land = TERRAIN[world.terrain[at]].land;
  if (def.domain === "land" && !land) return null;
  if (def.domain === "sea" && land) return null;
  const u = { id: world.units.next++, owner, type, at, hp: def.hp, path: [], progress: 0, cargo: null };
  world.units.list.set(u.id, u);
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

export function orderUnit(world, uid, target) {
  const u = world.units.list.get(uid), def = UNIT_TYPES[u.type];
  if (def.domain === "air") {
    if (world.grid.dist(u.at, target) > def.range) return "out of range";
    u.path = [target];
    return null;
  }
  const p = findPath(world.grid, u.at, target, unitCost(world, def), 80000);
  if (!p) return "no route";
  u.path = p.slice(1);
  return null;
}

export function stepUnits(world, dt) {
  for (const u of world.units.list.values()) {
    if (!u.path.length) continue;
    const def = UNIT_TYPES[u.type];
    if (def.domain === "air") {
      const d = world.grid.dist(u.at, u.path[0]);
      u.progress += def.speed * dt;
      if (u.progress >= d) { u.at = u.path.shift(); u.progress = 0; }
      continue;
    }
    const c = unitCost(world, def);
    u.progress += def.speed * dt / c(u.at, u.path[0]);
    while (u.progress >= 1 && u.path.length) { u.progress -= 1; u.at = u.path.shift(); }
  }
}

export function embark(world, stackId, shipId) {
  const s = world.stacks.get(stackId), u = world.units.list.get(shipId);
  if (!s || !u) return "missing";
  const def = UNIT_TYPES[u.type];
  if (def.domain !== "sea" || !def.capacity) return "not a transport";
  if (u.owner !== s.owner) return "not your ship";
  if (world.grid.cheb(s.pos, u.at) > 1) return "ship must be next to the troops";
  const room = def.capacity - (u.cargo?.troops ?? 0);
  if (room <= 0) return "ship is full";
  const load = Math.min(room, s.troops);
  u.cargo = { troops: (u.cargo?.troops ?? 0) + load, owner: s.owner };
  s.troops -= load;
  if (s.troops < 1) world.stacks.delete(s.id);
  return null;
}

export function disembark(world, shipId, target, ownsPort = false) {
  const u = world.units.list.get(shipId);
  if (!u?.cargo?.troops) return { error: "nothing aboard" };
  if (!TERRAIN[world.terrain[target]].land) return { error: "must land on land" };
  if (world.grid.cheb(u.at, target) > 1) return { error: "too far from the shore" };
  const def = UNIT_TYPES[u.type];
  const pen = ownsPort ? LANDING.portPenalty : def.beach ? LANDING.beachPenalty : LANDING.penalty;
  let troops = u.cargo.troops * (1 - pen);
  const owner = u.cargo.owner;
  u.cargo = null;
  const o = world.owner[target];
  if (o !== owner && !(o && world.passable(owner, o))) {
    if (o && !world.hostile(owner, o)) return { error: "you are not at war with them" };
    const cost = world.captureCost(target, owner);
    if (troops <= cost) { world.emit("landing_failed", { nation: owner, at: target }); return { lost: troops }; }
    troops -= cost;
    world.claim(target, owner);
  }
  const s = { id: world.nextStack++, owner, pos: target, troops, path: [], progress: 0, order: "hold", engaged: false };
  world.stacks.set(s.id, s);
  world.emit("landed", { nation: owner, at: target, troops });
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
    if (!m || UNIT_TYPES[u.type].domain !== "land" || m.owner === u.owner || !world.hostile(m.owner, u.owner)) continue;
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
