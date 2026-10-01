import rules from "../../data/rules.json" with { type: "json" };
import { UNIT_TYPES, wreck, disembark, canHit } from "./units.js";
import { touched } from "./buildings.js";
import { isLand } from "../shared/terrain.js";

export const AIR_RULES = { rearm: 20, reserve: 1.25, orbit: 2, detect: 6, cell: 8, dogfight: 4, overlap: 0.5, stickGap: 1.5, base: { reach: 1, slots: 4 }, bomb: { defenceCut: 0.5, cutSeconds: 90, repairSeconds: 120 }, ...rules.air };

const isPlane = u => UNIT_TYPES[u.type]?.domain === "air";
const scaleOf = world => world.machines?.scale ?? 1;

export function baseRules(world, b) {
  const a = world.bld.table[b.type]?.airbase, r = world.air?.rules.base ?? AIR_RULES.base;
  return a && typeof a === "object" ? { ...r, ...a } : r;
}

export function installAir(world, { rules: r = AIR_RULES } = {}) {
  if (world.air) return world.air;
  const T = world.air = { rules: r, bombed: new Map(), repairs: new Set(), flak: null, sites: null, flakAt: -Infinity, slots: new Map() };
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

const lowName = s => (/^[A-Z]{2}/.test(s) ? s : s.toLowerCase());
const listOf = a => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);

export const takesPlane =(airbase, type) => !!airbase && (!type || !airbase.only || airbase.only.includes(type));

function liveBase(world, b, nid, type = null) {
  return !!b && b.owner === nid && b.state === "active" && takesPlane(world.bld.table[b.type]?.airbase, type) && world.owner[b.anchor] === nid;
}

export function centreOf(world, b) {
  const g = world.grid, fp = world.bld.table[b.type].footprint ?? [1, 1];
  return [g.x(b.anchor) + fp[0] / 2, g.y(b.anchor) + fp[1] / 2];
}

export function nearestBase(world, nid, x, y, type = null) {
  let best = null, bd = Infinity;
  for (const id of world.bld?.mine.get(nid) ?? []) {
    const b = world.bld.list.get(id);
    if (!liveBase(world, b, nid, type)) continue;
    const [cx, cy] = centreOf(world, b), d = Math.hypot(cx - x, cy - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

const carrierOf = u => UNIT_TYPES[u?.type]?.carrier;
const liveCarrier = (c, nid) => !!c && !c.wreck && c.owner === nid && !!carrierOf(c);

export function aboard(world, cid, except = null) {
  let n = 0;
  for (const p of world.units.list.values()) if (p !== except && !p.wreck && p.air?.ship === cid) n++;
  return n;
}

export function homeOf(world, A, nid) {
  const g = world.grid;
  if (A.ship != null) {
    const c = world.units.list.get(A.ship);
    if (!liveCarrier(c, nid)) return null;
    const cr = carrierOf(c);
    return { key: `u${c.id}`, ship: c, x: g.x(c.at) + 0.5, y: g.y(c.at) + 0.5, reach: cr.reach ?? 1, slots: cr.slots, name: UNIT_TYPES[c.type].name.toLowerCase() };
  }
  const b = A.base != null ? world.bld?.list.get(A.base) : null;
  if (!liveBase(world, b, nid)) return null;
  const [x, y] = centreOf(world, b), br = baseRules(world, b);
  return { key: `b${b.id}`, b, x, y, reach: br.reach, slots: br.slots, name: world.bld.table[b.type].name.toLowerCase() };
}

function setHome(A, home) {
  A.base = home?.b ? home.b.id : null;
  if (home?.ship) A.ship = home.ship.id;
  else delete A.ship;
}

export function nearestHome(world, nid, x, y, plane = null) {
  let best = null, bd = Infinity;
  const b = nearestBase(world, nid, x, y, plane?.type);
  if (b) { const [cx, cy] = centreOf(world, b); bd = Math.hypot(cx - x, cy - y); best = { base: b.id }; }
  for (const c of world.units?.list.values() ?? []) {
    if (!liveCarrier(c, nid)) continue;
    const d = Math.hypot(world.grid.x(c.at) + 0.5 - x, world.grid.y(c.at) + 0.5 - y);
    if (d < bd && aboard(world, c.id, plane) < carrierOf(c).planes) { bd = d; best = { ship: c.id }; }
  }
  return best ? homeOf(world, best, nid) : null;
}

function rebase(world, u, A, def, at) {
  const g = world.grid, bid = world.bld?.at.get(at), b = bid === undefined ? null : world.bld.list.get(bid);
  const only = b && liveBase(world, b, u.owner) && !liveBase(world, b, u.owner, u.type) ? world.bld.table[b.type] : null;
  if (only) return { error: `a ${only.name.toLowerCase()} takes only ${listOf(only.airbase.only.map(t => lowName(UNIT_TYPES[t].name) + "s"))}` };
  let home = b && liveBase(world, b, u.owner, u.type) ? homeOf(world, { base: b.id }, u.owner) : null;
  if (!home) for (const c of world.units.list.values()) {
    if (!liveCarrier(c, u.owner) || g.cheb(c.at, at) > 1) continue;
    const cap = carrierOf(c).planes;
    if (aboard(world, c.id, u) >= cap) return { error: `that ${UNIT_TYPES[c.type].name.toLowerCase()} is full: ${cap} planes` };
    home = homeOf(world, { ship: c.id }, u.owner);
    break;
  }
  if (!home) return { error: "pick one of your airfields or aircraft carriers" };
  const d = Math.hypot(home.x - A.x, home.y - A.y), sp = def.speed * (world.rules.stackSpeed ?? 1);
  if (d / sp > A.fuel) return { error: `too far for its fuel: ${Math.round(d)} plots` };
  setHome(A, home);
  A.mission = { kind: "return" };
  if (A.landed && d > 0.6) Object.assign(A, { landed: false, rearm: 0, queued: false });
  return { ok: true, base: home.name };
}

function plotAt(world, x, y) {
  const g = world.grid;
  return g.idx(Math.max(0, Math.min(g.w - 1, Math.floor(x))), Math.max(0, Math.min(g.h - 1, Math.floor(y))));
}

export function planeOf(world, u) {
  if (u.air) return u.air;
  const def = UNIT_TYPES[u.type], g = world.grid, home = nearestHome(world, u.owner, g.x(u.at) + 0.5, g.y(u.at) + 0.5, u);
  const [x, y] = home ? [home.x, home.y] : [g.x(u.at) + 0.5, g.y(u.at) + 0.5];
  u.air = { base: null, x, y, heading: 0, fuel: def.endurance, bombs: def.bombs ?? 0, mission: null, landed: true, rearm: 0 };
  setHome(u.air, home);
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
  if (kind === "patrol" && !(def.attack > 0)) return { error: def.capacity ? "transports do not patrol" : "bombers do not patrol: send fighters" };
  if (kind === "drop") {
    if (!def.capacity) return { error: "only transports carry troops" };
    if (!(u.cargo?.troops > 0)) return { error: "nothing aboard" };
    if (!isLand(world.terrain[at])) return { error: def.paraOnly ? "paratroopers jump onto land" : "set the troops down on land" };
    const o = world.owner[at];
    if (o && o !== u.owner && !world.passable(u.owner, o) && !world.hostile(u.owner, o)) return { error: `you are at peace with ${world.nations.get(o)?.name ?? "them"}` };
  }
  if (kind === "base") return rebase(world, u, A, def, at);
  if (kind !== "bomb" && kind !== "patrol" && kind !== "drop") return { error: "the order is patrol, bomb, drop, base or return" };
  let home = homeOf(world, A, u.owner);
  if (!home) { home = nearestHome(world, u.owner, A.x, A.y, u); if (!home) return { error: "it has no airfield to fly from" }; setHome(A, home); }
  const tx = g.x(at) + 0.5, ty = g.y(at) + 0.5, d = Math.hypot(tx - home.x, ty - home.y), reach = def.radius * scaleOf(world) * home.reach;
  if (d > reach) return { error: `out of range: ${Math.round(d)} plots from its ${home.name}, at most ${Math.round(reach)}` };
  A.mission = { kind, at, x: tx, y: ty };
  return { ok: true, rearming: A.landed && A.rearm > 0 ? Math.ceil(A.rearm) : 0 };
}

export function down(world, u, why) {
  const lost = Math.round(u.cargo?.troops ?? 0);
  world.emit("plane_down", { machine: u.id, nation: u.owner, kind: u.type, at: u.at, by: u.hitBy ?? null, why, ...(lost ? { lost } : {}) });
  wreck(world, u);
  world.units.list.delete(u.id);
}

function unload(world, u, at, after = "; it flies them home") {
  const def = UNIT_TYPES[u.type];
  u.at = at;
  const r = disembark(world, u.id, at, false, def.dropLoss ?? 0);
  if (r.error) world.emit("landing_failed", { nation: u.owner, at, lost: 0, machine: u.id, why: `${r.error}${after}` });
  return r;
}

export function dropTroops(world, u, x, y) {
  if (!UNIT_TYPES[u.type]?.capacity || !(u.cargo?.troops > 0)) return null;
  const at = plotAt(world, x, y);
  if (!isLand(world.terrain[at])) { world.emit("landing_failed", { nation: u.owner, at, lost: 0, machine: u.id, why: "there is only water below" }); return null; }
  return unload(world, u, at, "");
}

function stick(world, u) {
  const A = u.air, n = A.bombs, gap = world.air.rules.stickGap * scaleOf(world), c = Math.cos(A.heading), s = Math.sin(A.heading);
  const sum = { plots: 0, troops: 0, stacks: 0, buildings: 0, machines: 0 };
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * gap, hit = drop(world, u, A.x + c * off, A.y + s * off, false);
    if (hit) for (const key in sum) sum[key] += hit[key];
  }
  const g = world.grid, at = g.idx(Math.max(0, Math.min(g.w - 1, Math.floor(A.x))), Math.max(0, Math.min(g.h - 1, Math.floor(A.y))));
  world.emit("bombed", { by: u.owner, at, nation: world.owner[at] || null, machine: u.id, bombs: n, ...sum, troops: Math.round(sum.troops) });
}

function fly(world, u, dt) {
  const T = world.air, r = T.rules, def = UNIT_TYPES[u.type], A = planeOf(world, u), sc = scaleOf(world), sp = def.speed * (world.rules.stackSpeed ?? 1);
  let base = homeOf(world, A, u.owner);
  if (!base) {
    if (A.landed) {
      if (u.cargo?.troops > 0 && isLand(world.terrain[u.at])) unload(world, u, u.at);
      return down(world, u, A.ship != null ? "its carrier was lost" : "its airfield was lost");
    }
    base = nearestHome(world, u.owner, A.x, A.y, u);
    setHome(A, base);
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
    if (base.ship) { A.x = base.x; A.y = base.y; u.at = plotAt(world, A.x, A.y); }
    if (A.rearm > 0) {
      const left = T.slots.get(base.key) ?? base.slots;
      if (left <= 0) { A.queued = true; return; }
      T.slots.set(base.key, left - 1);
      A.queued = false;
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
  const [bx, by] = base ? [base.x, base.y] : [A.x, A.y], home = Math.hypot(bx - A.x, by - A.y);
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
  } else if (def.hover && A.mission.kind === "patrol" && d <= step) {
    A.x = tx;
    A.y = ty;
  } else if ((A.mission.kind === "patrol" || (back && !base)) && d <= orbit && !def.hover) {
    A.heading += (sp / Math.max(0.5, orbit)) * dt;
    A.x += Math.cos(A.heading) * step;
    A.y += Math.sin(A.heading) * step;
  } else if (d <= step) {
    A.x = tx;
    A.y = ty;
    if (A.mission.kind === "bomb") { stick(world, u); A.mission = { kind: "return" }; }
    else if (A.mission.kind === "drop") { unload(world, u, A.mission.at); A.mission = { kind: "return" }; }
    else if (back && base) { A.landed = true; A.rearm = r.rearm; A.mission = null; }
  } else {
    A.heading = Math.atan2(dy, dx);
    A.x += (dx / d) * step;
    A.y += (dy / d) * step;
  }
  u.face = Math.cos(A.heading) < 0 ? -1 : 1;
  u.at = plotAt(world, A.x, A.y);
}

export function drop(world, u, x, y, emit = true) {
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
  if (emit) world.emit("bombed", { by: u.owner, at, nation: world.owner[at] || null, machine: u.id, ...hit, troops: Math.round(hit.troops) });
  return hit;
}

function buckets(list, cell, xy = u => [u.air.x, u.air.y]) {
  const map = new Map();
  for (const u of list) {
    const [x, y] = xy(u), k = Math.floor(x / cell) * 65536 + Math.floor(y / cell);
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

const fighter = def => def.attack > 0 && !def.strike;

function dogfights(world, flying, map, cell, dt) {
  const r = world.air.rules, sc = scaleOf(world), leth = world.machines?.rules.lethality ?? 0.08;
  for (const f of flying) {
    const def = UNIT_TYPES[f.type];
    if (!fighter(def) || f.hp <= 0) continue;
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

function hitFrom(hits, e, owner, amount) {
  let h = hits.get(e);
  if (!h) hits.set(e, (h = []));
  h.push([amount, owner]);
}

export function refreshSites(world) { sites(world); }

function sites(world) {
  const T = world.air;
  if (T.flak && world.time - T.flakAt < 2) return;
  T.flakAt = world.time;
  T.flak = [];
  T.sites = [];
  for (const b of world.bld?.list.values() ?? []) {
    if (b.state !== "active") continue;
    const d = world.bld.table[b.type];
    if (d?.antiAir) T.flak.push([b, d.antiAir, ...centreOf(world, b)]);
    if (d?.sam) T.sites.push([b, d.sam, ...centreOf(world, b)]);
  }
}

function flak(world, map, cell, dt, hits) {
  const T = world.air, sc = scaleOf(world), g = world.grid, guns = [...T.flak];
  for (const m of world.units.list.values()) {
    const aa = !m.wreck && UNIT_TYPES[m.type]?.antiAir;
    if (aa) guns.push([m, aa, g.x(m.at) + 0.5, g.y(m.at) + 0.5]);
  }
  for (const [b, aa, x, y] of guns) {
    const reach = aa.radius * sc;
    near(map, cell, x, y, reach, e => {
      if (e.hp <= 0 || e.owner === b.owner || !world.hostile(b.owner, e.owner) || Math.hypot(e.air.x - x, e.air.y - y) > reach) return;
      hitFrom(hits, e, b.owner, aa.damage * dt);
    });
  }
}

export function launchers(world, nid = null) {
  const out = [], g = world.grid;
  for (const [b, sam, x, y] of world.air?.sites ?? []) if (nid === null || b.owner === nid) out.push({ h: b, owner: b.owner, sam, x, y, site: b.id });
  for (const u of world.units?.list.values() ?? []) {
    const sam = !u.wreck && UNIT_TYPES[u.type]?.sam;
    if (sam && (nid === null || u.owner === nid)) out.push({ h: u, owner: u.owner, sam, x: g.x(u.at) + 0.5, y: g.y(u.at) + 0.5, truck: u.id });
  }
  return out;
}

function reload(world, h, owner, sam) {
  h.missiles ??= sam.missiles;
  if (h.missiles >= sam.missiles) { h.reloadAt = null; return; }
  h.reloadAt ??= world.time + sam.reload;
  if (world.time < h.reloadAt) return;
  const n = world.nations.get(owner);
  if (!n || n.money < sam.reloadCost) return;
  n.money -= sam.reloadCost;
  h.missiles++;
  h.reloadAt = h.missiles < sam.missiles ? world.time + sam.reload : null;
}

function sams(world, map, cell, hits) {
  const sc = scaleOf(world), T = world.air;
  T.reloading = false;
  for (const L of launchers(world)) {
    const { h, owner, sam, x, y } = L;
    reload(world, h, owner, sam);
    if (h.missiles < sam.missiles) T.reloading = true;
    if (!map || !(h.missiles > 0) || world.time < (h.fireAt ?? -Infinity)) continue;
    const reach = sam.radius * sc;
    let best = null, bd = Infinity;
    near(map, cell, x, y, reach, e => {
      if (e.hp <= 0 || e.owner === owner || !world.hostile(owner, e.owner)) return;
      const d = Math.hypot(e.air.x - x, e.air.y - y);
      if (d <= reach && d < bd) { bd = d; best = e; }
    });
    if (!best) continue;
    h.missiles--;
    T.reloading = true;
    h.fireAt = world.time + sam.fireEvery;
    h.reloadAt ??= world.time + sam.reload;
    hitFrom(hits, best, owner, sam.damage);
    world.emit("sam_fired", { by: owner, nation: best.owner, machine: best.id, kind: best.type, from: [Math.round(x * 10) / 10, Math.round(y * 10) / 10], to: [Math.round(best.air.x * 10) / 10, Math.round(best.air.y * 10) / 10], left: h.missiles, ...(L.site ? { site: L.site } : { truck: L.truck }) });
  }
}

export function combined(list, overlap) {
  const sorted = list.map(h => h[0]).sort((a, b) => b - a);
  let total = 0, k = 1;
  for (const d of sorted) { total += d * k; k *= overlap; }
  return total;
}

function applyHits(world, hits) {
  const overlap = world.air.rules.overlap;
  for (const [e, list] of hits) {
    e.hp -= combined(list, overlap);
    e.hitBy = list.reduce((a, b) => (b[0] > a[0] ? b : a))[1];
  }
}

function strikes(world, flying, dt) {
  const list = flying.filter(u => UNIT_TYPES[u.type].strike && u.air.mission?.kind === "patrol" && u.hp > 0);
  for (const u of flying) if (u.air.target) u.air.target = null;
  if (!list.length) return;
  const g = world.grid, sc = scaleOf(world), cell = 8, xyOf = i => [g.x(i) + 0.5, g.y(i) + 0.5];
  const stacks = buckets([...world.stacks.values()], cell, s => xyOf(s.pos));
  const ground = buckets([...world.units.list.values()].filter(m => !m.wreck && !isPlane(m)), cell, m => xyOf(m.at));
  for (const u of list) {
    const S = UNIT_TYPES[u.type].strike, A = u.air, reach = S.range * sc, foe = o => o !== u.owner && world.hostile(u.owner, o);
    let best = null, bd = Infinity;
    near(stacks, cell, A.x, A.y, reach, s => {
      if (!foe(s.owner)) return;
      const [x, y] = xyOf(s.pos), d = Math.hypot(x - A.x, y - A.y);
      if (d <= reach && d < bd) { bd = d; best = { s, x, y }; }
    });
    near(ground, cell, A.x, A.y, reach, m => {
      if (m.wreck || !foe(m.owner) || !canHit(world, UNIT_TYPES[u.type], m)) return;
      const [x, y] = xyOf(m.at), d = Math.hypot(x - A.x, y - A.y);
      if (d <= reach && d < bd) { bd = d; best = { m, x, y }; }
    });
    if (!best) continue;
    A.target = [best.x, best.y];
    if (best.s) {
      const s = best.s;
      if (!world.stacks.has(s.id)) continue;
      world.loseTroops(s, Math.min(s.troops, S.troops * dt));
      if (s.troops <= 0.5) { world.stacks.delete(s.id); world.emit("stack_destroyed", { stack: s.id, nation: s.owner, at: s.pos, by: u.owner }); }
    } else {
      const m = best.m;
      m.hp -= S.machine * dt;
      m.hitBy = u.owner;
      if (m.hp <= 0 && !m.wreck) wreck(world, m);
    }
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
    if (A.landed || A.mission?.kind !== "patrol" || !fighter(UNIT_TYPES[u.type])) continue;
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
  T.slots.clear();
  for (const u of planes) fly(world, u, dt);
  const flying = planes.filter(u => world.units.list.has(u.id) && !u.air.landed);
  const hits = new Map(), map = flying.length ? buckets(flying, cell) : null;
  if (map || T.reloading) sites(world);
  if (map) {
    dogfights(world, flying, map, cell, dt);
    flak(world, map, cell, dt, hits);
    strikes(world, flying, dt);
  }
  if (map || T.reloading) sams(world, map, cell, hits);
  if (map) {
    applyHits(world, hits);
    for (const u of flying) if (u.hp <= 0 && world.units.list.has(u.id)) down(world, u, "it was shot down");
  }
  repairs(world);
}

function airWhole(world, dt) {
  for (const u of [...(world.units?.list.values() ?? [])]) {
    if (u.wreck || !isPlane(u)) continue;
    const A = planeOf(world, u), def = UNIT_TYPES[u.type], base = homeOf(world, A, u.owner) ?? nearestHome(world, u.owner, A.x, A.y, u);
    if (!base) continue;
    setHome(A, base);
    [A.x, A.y] = [base.x, base.y];
    Object.assign(A, { landed: true, rearm: 0, mission: null, fuel: def.endurance, bombs: def.bombs ?? 0, queued: false, target: null });
    u.at = plotAt(world, A.x, A.y);
  }
  sites(world);
  for (const { h, owner, sam } of launchers(world)) {
    h.missiles ??= sam.missiles;
    const n = world.nations.get(owner), want = Math.min(sam.missiles - h.missiles, Math.floor(dt / sam.reload), n ? Math.floor(n.money / sam.reloadCost) : 0);
    if (want > 0) { n.money -= want * sam.reloadCost; h.missiles += want; }
    if (h.missiles >= sam.missiles) h.reloadAt = null;
  }
  for (const [i, until] of world.air.bombed) if (until <= world.time) world.air.bombed.delete(i);
  repairs(world);
}

export function samView(world, nid) {
  if (!world.air) return null;
  sites(world);
  const out = [];
  for (const { h, sam, site, truck } of launchers(world, nid)) out.push([site ? 0 : 1, site ?? truck, h.missiles ?? sam.missiles, sam.missiles, h.reloadAt == null ? 0 : Math.max(0, Math.ceil(h.reloadAt - world.time))]);
  return out.length ? out : null;
}

const MISSION_CODES = { patrol: 1, bomb: 2, return: 3, drop: 4 };

export function planeRow(u) {
  const A = u.air;
  if (!A) return null;
  const row = [Math.round(A.x * 10), Math.round(A.y * 10), Math.round(A.heading * 100), A.landed ? 1 : 0, A.bombs, Math.ceil(A.fuel), MISSION_CODES[A.mission?.kind] ?? 0, Math.ceil(A.rearm), A.queued && A.landed ? 1 : 0];
  if (A.target) row.push(Math.round(A.target[0] * 10), Math.round(A.target[1] * 10));
  return row;
}
