import rules from "../../data/rules.json" with { type: "json" };
import { isLand } from "../shared/terrain.js";
import { UNIT_TYPES, unitCost, wreck } from "./units.js";
import { stackPower, COMBAT } from "./combat.js";

export const PILOT_RULES = { every: 50, sendEvery: 100, idle: 30, range: 2, reload: 1.2, bonus: 1.5, aimRadius: 1.2, followEvery: 1, turnRate: 2.5, inputsPerSecond: 30, ...rules.pilot };

const keyOf = (kind, id) => `${kind}:${id}`;

export function installPilot(world, { rules: r = PILOT_RULES, lethality = COMBAT.lethality } = {}) {
  if (world.pilot) return world.pilot;
  world.pilot = { rules: r, lethality, list: new Map(), shots: [], clock: 0 };
  const step = world.stepStack.bind(world);
  world.stepStack = (s, dt) => (s.pilot ? undefined : step(s, dt));
  return world.pilot;
}

function unitOf(world, P) {
  return P.kind === "s" ? world.stacks.get(P.id) : world.units?.list.get(P.id);
}

function plotOf(world, P) {
  const g = world.grid, x = Math.floor(P.x), y = Math.floor(P.y);
  return g.inside(x, y) ? g.idx(x, y) : -1;
}

export function pilotOf(world, nid) {
  for (const P of world.pilot.list.values()) if (P.owner === nid) return P;
  return null;
}

export function takeControl(world, nid, kind, id, followers = []) {
  const T = world.pilot, g = world.grid;
  if (kind !== "s" && kind !== "m") return { error: "pilot a company or a machine" };
  const u = kind === "s" ? world.stacks.get(id) : world.units?.list.get(id);
  if (!u || u.owner !== nid) return { error: kind === "s" ? "not your company" : "not your machine" };
  if (kind === "m") {
    const d = UNIT_TYPES[u.type];
    if (u.wreck) return { error: "that machine is a wreck" };
    if (d.freight || d.transport) return { error: "boats and trade ships sail on their own" };
  }
  if (kind === "s" && (u.sail || u.board)) return { error: "that company is boarding" };
  const old = pilotOf(world, nid);
  if (old) release(world, old);
  const at = kind === "s" ? u.pos : u.at;
  const P = { kind, id, owner: nid, x: g.x(at) + 0.5, y: g.y(at) + 0.5, move: [0, 0], aim: null, fire: false, reload: 0, heading: 0, speed: 0, last: world.time, followers: [], followClock: 0 };
  for (const fid of followers.slice(0, 100)) {
    const f = world.stacks.get(fid);
    if (!f || f.owner !== nid || f.id === id) continue;
    P.followers.push({ id: fid, dx: g.x(f.pos) - g.x(at), dy: g.y(f.pos) - g.y(at) });
  }
  if (kind === "s") Object.assign(u, { pilot: true, path: [], route: null, via: null, progress: 0, order: "move" });
  else Object.assign(u, { pilot: true, path: [], route: null, progress: 0, follow: null, land: null });
  T.list.set(keyOf(kind, id), P);
  return { ok: true, x: P.x, y: P.y, followers: P.followers.length };
}

export function release(world, P) {
  const T = world.pilot;
  T.list.delete(keyOf(P.kind, P.id));
  const u = unitOf(world, P);
  if (!u) return;
  delete u.pilot;
  if (P.kind === "s") Object.assign(u, { order: "hold", path: [], route: null, via: null, progress: 0 });
}

export function steer(world, nid, m) {
  const P = pilotOf(world, nid);
  if (!P) return false;
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  let [dx, dy] = Array.isArray(m.move) ? [num(m.move[0]), num(m.move[1])] : [0, 0];
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  P.move = [dx, dy];
  P.aim = Array.isArray(m.aim) && Number.isFinite(m.aim[0]) && Number.isFinite(m.aim[1]) ? [m.aim[0], m.aim[1]] : null;
  P.fire = m.fire === true;
  P.last = world.time;
  return true;
}

function turning(P, def) {
  return !!def && (def.domain === "sea" || def.domain === "air");
}

function speedOf(world, P, u, def, at) {
  const base = world.rules.stackSpeed ?? 1;
  if (P.kind === "s") return (base * world.speedOf(u)) / world.moveCost(at, at);
  return (def.speed * base) / Math.max(0.1, unitCost(world, def)(at, at));
}

function canEnter(world, P, u, def, next) {
  if (next < 0) return false;
  if (P.kind === "s") {
    if (!isLand(world.terrain[next])) return false;
    if (next === u.pos) return true;
    return world.enter(u, next);
  }
  if (!(unitCost(world, def)(next, next) < Infinity)) return false;
  u.at = next;
  return true;
}

function move(world, P, u, def, dt) {
  const r = world.pilot.rules;
  let vx, vy;
  if (turning(P, def)) {
    P.heading += P.move[0] * r.turnRate * dt;
    const top = speedOf(world, P, u, def, u.at);
    P.speed = Math.max(0, Math.min(top, P.speed + P.move[1] * -top * dt));
    vx = Math.cos(P.heading) * P.speed;
    vy = Math.sin(P.heading) * P.speed;
  } else {
    const at = P.kind === "s" ? u.pos : u.at, sp = speedOf(world, P, u, def, at);
    vx = P.move[0] * sp;
    vy = P.move[1] * sp;
    if (vx || vy) P.heading = Math.atan2(vy, vx);
  }
  if (!vx && !vy) return;
  const nx = P.x + vx * dt, ny = P.y + vy * dt, g = world.grid;
  if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) { P.speed = 0; return; }
  const from = P.kind === "s" ? u.pos : u.at, next = g.idx(Math.floor(nx), Math.floor(ny));
  if (next === from || canEnter(world, P, u, def, next)) { P.x = nx; P.y = ny; return; }
  const sx = g.idx(Math.floor(nx), Math.floor(P.y)), sy = g.idx(Math.floor(P.x), Math.floor(ny));
  if (sx === from || canEnter(world, P, u, def, sx)) { P.x = nx; return; }
  if (sy === from || canEnter(world, P, u, def, sy)) { P.y = ny; return; }
  P.speed = 0;
}

function targetsNear(world, P, ax, ay, reach) {
  const g = world.grid, r = world.pilot.rules, out = [];
  const near = (x, y) => Math.hypot(x - ax, y - ay) <= r.aimRadius && Math.hypot(x - P.x, y - P.y) <= reach + 0.5;
  for (const s of world.stacks.values()) {
    if (s.owner === P.owner || !world.hostile(P.owner, s.owner)) continue;
    const x = g.x(s.pos) + 0.5, y = g.y(s.pos) + 0.5;
    if (near(x, y)) out.push({ kind: "s", u: s, x, y, d: Math.hypot(x - ax, y - ay) });
  }
  for (const m of world.units?.list.values() ?? []) {
    if (m.wreck || m.owner === P.owner || !world.hostile(P.owner, m.owner)) continue;
    const x = g.x(m.at) + 0.5, y = g.y(m.at) + 0.5;
    if (near(x, y)) out.push({ kind: "m", u: m, x, y, d: Math.hypot(x - ax, y - ay) });
  }
  return out.sort((a, b) => a.d - b.d);
}

function fire(world, P, u, def) {
  const T = world.pilot, r = T.rules;
  if (!P.fire || !P.aim || P.reload > 0) return;
  const reach = P.kind === "s" ? r.range * (world.machines?.scale ?? 1) : Math.max(1, Math.round((def.range ?? 1) * (world.machines?.scale ?? 1)));
  const power = P.kind === "s" ? stackPower(world, u) : def.attack;
  if (!(power > 0)) return;
  P.reload = r.reload;
  const [t] = targetsNear(world, P, P.aim[0], P.aim[1], reach);
  const hit = T.lethality * power * r.reload * r.bonus;
  const shot = { from: [P.x, P.y], to: t ? [t.x, t.y] : P.aim, by: P.owner, kind: P.kind === "s" ? "shot" : "shell", hit: t ? Math.round(hit * 10) / 10 : 0 };
  T.shots.push(shot);
  if (!t) return;
  if (t.kind === "s") {
    world.loseTroops(t.u, Math.min(t.u.troops, hit));
    if (P.kind === "s") world.gainXp?.(u, hit);
    if (t.u.troops <= 0.5) {
      world.stacks.delete(t.u.id);
      world.emit("stack_destroyed", { stack: t.u.id, nation: t.u.owner, at: t.u.pos, by: P.owner });
    }
  } else {
    t.u.hitBy = P.owner;
    t.u.hp -= hit * (world.machines?.rules.hpPerLoss ?? 1);
    if (t.u.hp <= 0) wreck(world, t.u);
  }
}

function follow(world, P) {
  const g = world.grid;
  for (const f of P.followers) {
    const s = world.stacks.get(f.id);
    if (!s || s.pilot) continue;
    const x = Math.floor(P.x) + f.dx, y = Math.floor(P.y) + f.dy;
    const to = g.inside(x, y) && isLand(world.terrain[g.idx(x, y)]) ? g.idx(x, y) : g.idx(Math.floor(P.x), Math.floor(P.y));
    const goal = s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : s.pos);
    if (g.cheb(goal, to) <= 1 || g.cheb(s.pos, to) <= 1) continue;
    world.orderMove(s.id, to, "move");
  }
}

export function pilotStep(world, dt) {
  const T = world.pilot, r = T.rules;
  T.clock += dt;
  for (const P of [...T.list.values()]) {
    const u = unitOf(world, P), def = P.kind === "m" ? UNIT_TYPES[u?.type] : null;
    if (!u || u.owner !== P.owner || (P.kind === "m" && u.wreck) || world.time - P.last > r.idle) { if (u) release(world, P); else T.list.delete(keyOf(P.kind, P.id)); continue; }
    P.reload = Math.max(0, P.reload - dt);
    move(world, P, u, def, dt);
    fire(world, P, u, def);
    P.followClock += dt;
    if (P.followers.length && P.followClock >= r.followEvery) { P.followClock = 0; follow(world, P); }
  }
}

export function pilotRows(world) {
  const out = [];
  for (const P of world.pilot.list.values()) out.push([P.kind === "s" ? 0 : 1, P.id, P.owner, Math.round(P.x * 100) / 100, Math.round(P.y * 100) / 100, Math.round(P.heading * 100) / 100]);
  return out;
}

export function takeShots(world) {
  const s = world.pilot.shots;
  if (!s.length) return null;
  world.pilot.shots = [];
  return s.map(x => [Math.round(x.from[0] * 10) / 10, Math.round(x.from[1] * 10) / 10, Math.round(x.to[0] * 10) / 10, Math.round(x.to[1] * 10) / 10, x.kind === "shell" ? 1 : 0, x.by, x.hit]);
}
