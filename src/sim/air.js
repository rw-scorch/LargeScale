import rules from "../../data/rules.json" with { type: "json" };
import { UNIT_TYPES, wreck } from "./units.js";
import { touched } from "./buildings.js";

export const AIR_RULES = { rearm: 20, reserve: 1.25, orbit: 2, detect: 6, cell: 8, dogfight: 4, bomb: { defenceCut: 0.5, cutSeconds: 90, repairSeconds: 120 }, ...rules.air };

const isPlane = u => UNIT_TYPES[u.type]?.domain === "air";
const scaleOf = world => world.machines?.scale ?? 1;

export function installAir(world, { rules: r = AIR_RULES } = {}) {
  if (world.air) return world.air;
  const T = world.air = { rules: r, bombed: new Map(), repairs: new Set(), flak: null, flakAt: -Infinity };
  const cost = world.captureCost.bind(world);
  world.captureCost = (i, attacker) => {
    const c = cost(i, attacker), until = T.bombed.get(i);
    if (until === undefined) return c;
    if (until <= world.time) { T.bombed.delete(i); return c; }
    return world.owner[i] ? c * r.bomb.defenceCut : c;
  };
  for (const b of world.bld?.list.values() ?? []) if (b.state === "damaged") { b.repairAt ??= world.time + r.bomb.repairSeconds; T.repairs.add(b.id); }
  const tick = (w, dt) => airTick(w, dt);
  tick.whole = (w, dt) => airWhole(w, dt);
  world.hooks.postTick.push(tick);
  return T;
}

function liveBase(world, b, nid) {
  return !!b && b.owner === nid && b.state === "active" && !!world.bld.table[b.type]?.airbase && world.owner[b.anchor] === nid;
}

export function centreOf(world, b) {
  const g = world.grid, fp = world.bld.table[b.type].footprint ?? [1, 1];
  return [g.x(b.anchor) + fp[0] / 2, g.y(b.anchor) + fp[1] / 2];
}

export function nearestBase(world, nid, x, y) {
  let best = null, bd = Infinity;
  for (const id of world.bld?.mine.get(nid) ?? []) {
    const b = world.bld.list.get(id);
    if (!liveBase(world, b, nid)) continue;
    const [cx, cy] = centreOf(world, b), d = Math.hypot(cx - x, cy - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function plotAt(world, x, y) {
  const g = world.grid;
  return g.idx(Math.max(0, Math.min(g.w - 1, Math.floor(x))), Math.max(0, Math.min(g.h - 1, Math.floor(y))));
}

export function planeOf(world, u) {
  if (u.air) return u.air;
  const def = UNIT_TYPES[u.type], g = world.grid, base = nearestBase(world, u.owner, g.x(u.at) + 0.5, g.y(u.at) + 0.5);
  const [x, y] = base ? centreOf(world, base) : [g.x(u.at) + 0.5, g.y(u.at) + 0.5];
  u.air = { base: base?.id ?? null, x, y, heading: 0, fuel: def.endurance, bombs: def.bombs ?? 0, mission: null, landed: true, rearm: 0 };
  u.at = plotAt(world, x, y);
  return u.air;
}

export function orderPlane(world, u, kind, at) {
  const def = UNIT_TYPES[u?.type], g = world.grid;
  if (def?.domain !== "air") return { error: "not a plane" };
  if (u.wreck) return { error: "that plane is down" };
  const A = planeOf(world, u);
  if (kind === "return") { A.mission = A.landed ? null : { kind: "return" }; return { ok: true }; }
  if (kind === "bomb" && !def.bomb) return { error: "only bombers drop bombs" };
  if (kind === "patrol" && !(def.attack > 0)) return { error: "bombers do not patrol: send fighters" };
  if (kind !== "bomb" && kind !== "patrol") return { error: "the order is patrol, bomb or return" };
  let base = world.bld.list.get(A.base);
  if (!liveBase(world, base, u.owner)) { base = nearestBase(world, u.owner, A.x, A.y); if (!base) return { error: "it has no airfield to fly from" }; A.base = base.id; }
  const [bx, by] = centreOf(world, base), tx = g.x(at) + 0.5, ty = g.y(at) + 0.5, d = Math.hypot(tx - bx, ty - by), reach = def.radius * scaleOf(world);
  if (d > reach) return { error: `out of range: ${Math.round(d)} plots from its airfield, at most ${Math.round(reach)}` };
  A.mission = { kind, at, x: tx, y: ty };
  return { ok: true, rearming: A.landed && A.rearm > 0 ? Math.ceil(A.rearm) : 0 };
}

function down(world, u, why) {
  world.emit("plane_down", { machine: u.id, nation: u.owner, kind: u.type, at: u.at, by: u.hitBy ?? null, why });
  wreck(world, u);
  world.units.list.delete(u.id);
}

function fly(world, u, dt) {
  const T = world.air, r = T.rules, def = UNIT_TYPES[u.type], A = planeOf(world, u), sc = scaleOf(world), sp = def.speed * (world.rules.stackSpeed ?? 1);
  let base = world.bld.list.get(A.base);
  if (!liveBase(world, base, u.owner)) {
    if (A.landed) return down(world, u, "its airfield was lost");
    base = nearestBase(world, u.owner, A.x, A.y);
    A.base = base?.id ?? null;
  }
  if (u.pilot) {
    const P = world.pilot?.list.get(`m:${u.id}`);
    if (P) { A.x = P.x; A.y = P.y; A.heading = P.heading; }
    A.landed = false;
    A.rearm = 0;
    A.mission = null;
    A.fuel -= dt;
    if (A.fuel <= 0) down(world, u, "it ran out of fuel");
    return;
  }
  if (A.landed) {
    if (A.rearm > 0) {
      A.rearm -= dt;
      if (A.rearm > 0) return;
      A.fuel = def.endurance;
      A.bombs = def.bombs ?? 0;
    }
    if (!A.mission || A.mission.kind === "return") { A.mission = null; return; }
    A.landed = false;
  }
  A.fuel -= dt;
  if (A.fuel <= 0) return down(world, u, "it ran out of fuel");
  const [bx, by] = base ? centreOf(world, base) : [A.x, A.y], home = Math.hypot(bx - A.x, by - A.y);
  if (base && A.mission?.kind !== "return" && A.fuel <= (home / sp) * r.reserve + dt) {
    A.mission = { kind: "return" };
    world.emit("plane_returning", { machine: u.id, nation: u.owner, kind: u.type });
  }
  A.mission ??= { kind: "return" };
  const back = A.mission.kind === "return", prey = A.chase ? world.units.list.get(A.chase) : null;
  const tx = prey?.air ? prey.air.x : back ? bx : A.mission.x, ty = prey?.air ? prey.air.y : back ? by : A.mission.y;
  const dx = tx - A.x, dy = ty - A.y, d = Math.hypot(dx, dy), step = sp * dt, orbit = r.orbit * sc;
  if (prey?.air) {
    if (d > 0.05) { A.heading = Math.atan2(dy, dx); const k = Math.min(step, d); A.x += Math.cos(A.heading) * k; A.y += Math.sin(A.heading) * k; }
  } else if ((A.mission.kind === "patrol" || (back && !base)) && d <= orbit) {
    A.heading += (sp / Math.max(0.5, orbit)) * dt;
    A.x += Math.cos(A.heading) * step;
    A.y += Math.sin(A.heading) * step;
  } else if (d <= step) {
    A.x = tx;
    A.y = ty;
    if (A.mission.kind === "bomb") { drop(world, u, A.x, A.y); A.mission = { kind: "return" }; }
    else if (back && base) { A.landed = true; A.rearm = r.rearm; A.mission = null; }
  } else {
    A.heading = Math.atan2(dy, dx);
    A.x += (dx / d) * step;
    A.y += (dy / d) * step;
  }
  u.face = Math.cos(A.heading) < 0 ? -1 : 1;
  u.at = plotAt(world, A.x, A.y);
}

export function drop(world, u, x, y) {
  const def = UNIT_TYPES[u.type], A = planeOf(world, u), T = world.air, r = T.rules, g = world.grid;
  if (!def?.bomb || !(A.bombs > 0)) return null;
  A.bombs--;
  const R = def.bomb.radius * scaleOf(world), rr = Math.ceil(R), cx = Math.floor(x), cy = Math.floor(y), until = world.time + r.bomb.cutSeconds;
  const hostile = o => !!o && o !== u.owner && world.hostile(u.owner, o);
  const hit = { plots: 0, troops: 0, stacks: 0, buildings: 0, machines: 0 };
  for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    const px = cx + dx, py = cy + dy;
    if (!g.inside(px, py) || Math.hypot(px + 0.5 - x, py + 0.5 - y) > R + 0.5) continue;
    const i = g.idx(px, py);
    if (hostile(world.owner[i])) { T.bombed.set(i, until); hit.plots++; }
    const bid = world.bld?.at.get(i), b = bid === undefined ? null : world.bld.list.get(bid);
    if (b && hostile(b.owner) && b.state === "active") {
      b.state = "damaged";
      b.repairAt = world.time + r.bomb.repairSeconds;
      T.repairs.add(b.id);
      touched(world, b);
      hit.buildings++;
    }
  }
  for (const s of [...world.stacks.values()]) {
    if (!hostile(s.owner) || Math.hypot(g.x(s.pos) + 0.5 - x, g.y(s.pos) + 0.5 - y) > R + 0.5) continue;
    const loss = Math.min(s.troops, def.bomb.troops);
    world.loseTroops(s, loss);
    hit.troops += loss;
    hit.stacks++;
    if (s.troops <= 0.5) { world.stacks.delete(s.id); world.emit("stack_destroyed", { stack: s.id, nation: s.owner, at: s.pos, by: u.owner }); }
  }
  for (const m of [...world.units.list.values()]) {
    if (m.wreck || isPlane(m) || !hostile(m.owner) || UNIT_TYPES[m.type]?.domain !== "land" || Math.hypot(g.x(m.at) + 0.5 - x, g.y(m.at) + 0.5 - y) > R + 0.5) continue;
    m.hp -= def.bomb.machine ?? 0;
    m.hitBy = u.owner;
    hit.machines++;
    if (m.hp <= 0) wreck(world, m);
  }
  const at = g.idx(Math.max(0, Math.min(g.w - 1, cx)), Math.max(0, Math.min(g.h - 1, cy)));
  world.emit("bombed", { by: u.owner, at, nation: world.owner[at] || null, machine: u.id, ...hit, troops: Math.round(hit.troops) });
  return hit;
}

function buckets(list, cell) {
  const map = new Map();
  for (const u of list) {
    const k = Math.floor(u.air.x / cell) * 65536 + Math.floor(u.air.y / cell);
    let b = map.get(k);
    if (!b) map.set(k, (b = []));
    b.push(u);
  }
  return map;
}

function near(map, cell, x, y, reach, f) {
  const x0 = Math.floor((x - reach) / cell), x1 = Math.floor((x + reach) / cell), y0 = Math.floor((y - reach) / cell), y1 = Math.floor((y + reach) / cell);
  for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (const u of map.get(bx * 65536 + by) ?? []) f(u);
}

function dogfights(world, flying, map, cell, dt) {
  const r = world.air.rules, sc = scaleOf(world), leth = world.machines?.rules.lethality ?? 0.08;
  for (const f of flying) {
    const def = UNIT_TYPES[f.type];
    if (!(def.attack > 0) || f.hp <= 0) continue;
    const reach = def.range * sc;
    let best = null, bd = Infinity;
    near(map, cell, f.air.x, f.air.y, reach, e => {
      if (e === f || e.hp <= 0 || e.owner === f.owner || !world.hostile(f.owner, e.owner)) return;
      const d = Math.hypot(e.air.x - f.air.x, e.air.y - f.air.y);
      if (d <= reach && d < bd) { bd = d; best = e; }
    });
    if (!best) continue;
    best.hp -= leth * def.attack * r.dogfight * dt;
    best.hitBy = f.owner;
  }
}

function flak(world, map, cell, dt) {
  const T = world.air, sc = scaleOf(world);
  if (!T.flak || world.time - T.flakAt >= 2) {
    T.flakAt = world.time;
    T.flak = [];
    for (const b of world.bld?.list.values() ?? []) {
      const aa = world.bld.table[b.type]?.antiAir;
      if (aa && b.state === "active") T.flak.push([b, aa, ...centreOf(world, b)]);
    }
  }
  for (const [b, aa, x, y] of T.flak) {
    const reach = aa.radius * sc;
    near(map, cell, x, y, reach, e => {
      if (e.hp <= 0 || e.owner === b.owner || !world.hostile(b.owner, e.owner) || Math.hypot(e.air.x - x, e.air.y - y) > reach) return;
      e.hp -= aa.damage * dt;
      e.hitBy = b.owner;
    });
  }
}

function repairs(world) {
  const T = world.air;
  for (const id of [...T.repairs]) {
    const b = world.bld.list.get(id);
    if (!b || b.state !== "damaged") { T.repairs.delete(id); continue; }
    if (world.time < (b.repairAt ?? 0)) continue;
    b.state = "active";
    delete b.repairAt;
    touched(world, b);
    T.repairs.delete(id);
  }
}

function hunt(world, planes, cell) {
  const r = world.air.rules, sc = scaleOf(world), up = planes.filter(u => u.air && !u.air.landed), map = buckets(up, cell), reach = r.detect * sc, area = (r.orbit + r.detect) * sc;
  for (const u of planes) {
    const A = planeOf(world, u);
    A.chase = null;
    if (A.landed || A.mission?.kind !== "patrol" || !(UNIT_TYPES[u.type].attack > 0)) continue;
    let bd = Infinity;
    near(map, cell, A.x, A.y, reach, e => {
      if (e === u || e.owner === u.owner || !world.hostile(u.owner, e.owner)) return;
      const d = Math.hypot(e.air.x - A.x, e.air.y - A.y);
      if (d <= reach && d < bd && Math.hypot(e.air.x - A.mission.x, e.air.y - A.mission.y) <= area) { bd = d; A.chase = e.id; }
    });
  }
}

function airTick(world, dt) {
  const T = world.air, cell = T.rules.cell * scaleOf(world), planes = [];
  for (const u of world.units?.list.values() ?? []) if (!u.wreck && isPlane(u)) planes.push(u);
  if (planes.length > 1) hunt(world, planes, cell);
  for (const u of planes) fly(world, u, dt);
  const flying = planes.filter(u => world.units.list.has(u.id) && !u.air.landed);
  if (flying.length) {
    const map = buckets(flying, cell);
    dogfights(world, flying, map, cell, dt);
    flak(world, map, cell, dt);
    for (const u of flying) if (u.hp <= 0 && world.units.list.has(u.id)) down(world, u, "it was shot down");
  }
  repairs(world);
}

function airWhole(world, dt) {
  for (const u of [...(world.units?.list.values() ?? [])]) {
    if (u.wreck || !isPlane(u)) continue;
    const A = planeOf(world, u), def = UNIT_TYPES[u.type], base = nearestBase(world, u.owner, A.x, A.y);
    if (!base) continue;
    [A.x, A.y] = centreOf(world, base);
    Object.assign(A, { base: base.id, landed: true, rearm: 0, mission: null, fuel: def.endurance, bombs: def.bombs ?? 0 });
    u.at = plotAt(world, A.x, A.y);
  }
  for (const [i, until] of world.air.bombed) if (until <= world.time) world.air.bombed.delete(i);
  repairs(world);
}

export function planeRow(u) {
  const A = u.air;
  return A ? [Math.round(A.x * 10), Math.round(A.y * 10), Math.round(A.heading * 100), A.landed ? 1 : 0, A.bombs, Math.ceil(A.fuel), A.mission?.kind === "patrol" ? 1 : A.mission?.kind === "bomb" ? 2 : A.mission?.kind === "return" ? 3 : 0, Math.ceil(A.rearm)] : null;
}
