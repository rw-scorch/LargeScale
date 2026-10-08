import rules from "../../data/rules.json" with { type: "json" };
import { TID, TERRAIN } from "../shared/terrain.js";
import { makeRng } from "../shared/rng.js";
import { knownOf, TREE } from "./research.js";
import { touched } from "./buildings.js";
import { UNIT_TYPES, wreck, diveOf } from "./units.js";
import { launchers, refreshSites, down } from "./air.js";
import { setTerrain } from "./resources.js";
import { setRoad } from "./logistics.js";
import { shieldsOver } from "./shields.js";

export const NUKE_RULES = { crater: 1, outerLoss: 0.6, outerResidents: 0.3, outerDamage: 0.6, repairSeconds: 600, samChance: 0.15, overlap: 0.5, cancelRefund: 1, sitesEvery: 2, ...rules.nukes };
export const WARHEADS = NUKE_RULES.warheads;

const scaleOf = world => world.machines?.scale ?? 1;
const nodeName = id => TREE.nodes.find(n => n.id === id)?.name ?? id;
const stateOf = n => (n.nuke ??= { silos: {}, flying: [], next: 1 });

export function installNukes(world, { rules: r = NUKE_RULES, speed = 1, rng = makeRng(7) } = {}) {
  if (world.nukes) return world.nukes;
  const N = world.nukes = { rules: r, speed, on: true, abms: null, abmsAt: -Infinity, roll: () => rng.next() };
  const tick = (w, dt) => nukeTick(w, dt);
  tick.whole = (w, dt) => nukeTick(w, dt, true);
  world.hooks.postTick.push(tick);
  return N;
}

function siloOf(world, nid, bid) {
  const b = world.bld?.list.get(bid);
  if (!b || b.owner !== nid || !world.bld.table[b.type]?.silo) return { error: "pick one of your missile silos" };
  return { b, silo: world.bld.table[b.type].silo };
}

export function warheadLock(world, n, kind) {
  const W = world.nukes.rules.warheads[kind];
  if (!W) return "pick a warhead";
  if (n?.research && W.needs && !knownOf(n).has(W.needs)) return `needs ${nodeName(W.needs)}`;
  return null;
}

function allowed(world, W = null) {
  if (!world.nukes.on && !W?.conventional) return "nuclear weapons are off in this world";
  if (world.peace) return "no launches during the peace";
  return null;
}

export function buildWarhead(world, nid, bid, kind) {
  const n = world.nations.get(nid), s = siloOf(world, nid, bid);
  if (s.error) return s;
  if (!world.nukes.on && !world.nukes.rules.warheads[kind]?.conventional) return { error: "nuclear weapons are off in this world" };
  if (s.b.state !== "active") return { error: "the silo is not working" };
  if (!s.silo.warheads.includes(kind)) return { error: "this silo cannot hold that warhead" };
  const lock = warheadLock(world, n, kind);
  if (lock) return { error: lock };
  const st = stateOf(n), have = st.silos[bid];
  if (have) return { error: have.ready ? "this silo already holds a missile" : "this silo is already building a missile" };
  const W = world.nukes.rules.warheads[kind];
  if ((n.money ?? 0) < W.cost) return { error: `not enough gold: ${W.cost} needed` };
  n.money -= W.cost;
  st.silos[bid] = { kind, left: W.time, paid: W.cost };
  return { ok: true, kind, seconds: W.time, cost: W.cost };
}

export function cancelWarhead(world, nid, bid) {
  const s = siloOf(world, nid, bid);
  if (s.error) return s;
  const n = world.nations.get(nid), st = n?.nuke, have = st?.silos[bid];
  if (!have) return { error: "this silo holds no warhead" };
  const refund = Math.floor(have.paid * world.nukes.rules.cancelRefund);
  n.money = (n.money ?? 0) + refund;
  delete st.silos[bid];
  return { ok: true, refund };
}

function abmSites(world) {
  const N = world.nukes;
  if (N.abms && world.time - N.abmsAt < N.rules.sitesEvery) return N.abms;
  N.abmsAt = world.time;
  N.abms = [];
  for (const b of world.bld?.list.values() ?? []) {
    const abm = b.state === "active" && world.bld.table[b.type]?.abm;
    if (!abm) continue;
    const d = world.bld.table[b.type];
    N.abms.push({ b, abm, x: (b.anchor % world.grid.w) + d.fp[0] / 2, y: Math.floor(b.anchor / world.grid.w) + d.fp[1] / 2 });
  }
  return N.abms;
}

export function defencesAt(world, launcher, target, kind = null) {
  const g = world.grid, sc = scaleOf(world), r = world.nukes.rules, tx = g.x(target) + 0.5, ty = g.y(target) + 0.5, out = [], sam = r.warheads[kind]?.samChance ?? r.samChance;
  const foe = o => o !== launcher && world.hostile(launcher, o);
  for (const s of shieldsOver(world, launcher, tx, ty)) out.push({ h: s.b, key: null, owner: s.owner, chance: s.chance, x: s.x, y: s.y, kind: "shield" });
  if (r.warheads[kind]?.shieldOnly) return overlap(out, r);
  for (const { b, abm, x, y } of abmSites(world)) {
    b.interceptors ??= abm.interceptors;
    if (foe(b.owner) && b.interceptors > 0 && Math.hypot(x - tx, y - ty) <= abm.radius * sc) out.push({ h: b, key: "interceptors", owner: b.owner, chance: abm.chance, x, y, kind: "abm" });
  }
  if (world.air) {
    refreshSites(world);
    for (const L of launchers(world)) {
      L.h.missiles ??= L.sam.missiles;
      if (foe(L.owner) && L.h.missiles > 0 && Math.hypot(L.x - tx, L.y - ty) <= L.sam.radius * sc) out.push({ h: L.h, key: "missiles", owner: L.owner, chance: sam, x: L.x, y: L.y, kind: L.site ? "sam" : "truck" });
    }
  }
  return overlap(out, r);
}

function overlap(out, r) {
  out.sort((a, b) => b.chance - a.chance);
  let k = 1;
  for (const d of out) { d.p = d.chance * k; k *= r.overlap; }
  return out;
}

export const interceptChance = list => 1 - list.reduce((q, d) => q * (1 - d.p), 1);

export function checkLaunch(world, nid, bid, target) {
  const n = world.nations.get(nid), s = siloOf(world, nid, bid);
  if (s.error) return s;
  const have = n.nuke?.silos[bid];
  const no = allowed(world, have ? world.nukes.rules.warheads[have.kind] : null);
  if (no) return { error: no };
  if (!have?.ready) return { error: have ? "the missile is not ready yet" : "this silo holds no missile" };
  if (s.b.state !== "active") return { error: "the silo is not working" };
  const g = world.grid;
  if (!Number.isInteger(target) || target < 0 || target >= g.size) return { error: "that spot is off the map" };
  const owner = world.owner[target];
  if (owner === nid) return { error: "that is your own land" };
  if (!owner) return { error: "aim at enemy land: nobody owns that" };
  if (!world.hostile(nid, owner)) return { error: "you are not at war with them" };
  const W = world.nukes.rules.warheads[have.kind], sc = scaleOf(world);
  const [fx, fy] = [g.x(s.b.anchor), g.y(s.b.anchor)], dist = Math.hypot(g.x(target) - fx, g.y(target) - fy);
  const flight = Math.round(W.flight + (dist / sc) * W.perPlot);
  const defences = defencesAt(world, nid, target, have.kind);
  return { ok: true, kind: have.kind, conventional: !!W.conventional, flight, owner, chance: Math.round(interceptChance(defences) * 100) / 100, defences: defences.length, radius: W.radius * sc, inner: W.inner * sc, from: s.b.anchor };
}

export function launchWarhead(world, nid, bid, target) {
  const c = checkLaunch(world, nid, bid, target);
  if (c.error) return c;
  const st = stateOf(world.nations.get(nid));
  delete st.silos[bid];
  const f = { id: nid * 100000 + st.next++, kind: c.kind, from: c.from, target, launched: world.time, due: world.time + c.flight, toward: c.owner, radius: c.radius, inner: c.inner, ...(c.conventional ? { conventional: true } : {}) };
  st.flying.push(f);
  world.emit("nuke_launched", { nation: nid, ...f, seconds: c.flight });
  return { ok: true, id: f.id, kind: c.kind, seconds: c.flight, chance: c.chance };
}

function resolve(world, owner, f) {
  const N = world.nukes;
  for (const d of defencesAt(world, owner, f.target, f.kind)) {
    if (d.key) d.h[d.key]--;
    if ((d.kind === "sam" || d.kind === "truck") && world.air) world.air.reloading = true;
    if (N.roll() < d.p) {
      world.emit("nuke_intercepted", { id: f.id, nation: owner, by: d.owner, kind: f.kind, target: f.target, toward: f.toward, from: [Math.round(d.x * 10) / 10, Math.round(d.y * 10) / 10], with: d.kind });
      return null;
    }
  }
  return detonate(world, { owner, ...f });
}

function worse(map, id, level) {
  if ((map.get(id) ?? 0) < level) map.set(id, level);
}

function ruin(world, b) {
  const lost = b.residents ?? 0;
  Object.assign(b, { state: "rubble", progress: 0, residents: 0, upgrading: false, nuked: true });
  delete b.need;
  touched(world, b);
  world.cons?.timers.add(b.id);
  return lost;
}

export function strike(world, m) {
  const r = world.nukes?.rules ?? NUKE_RULES, W = r.warheads[m.kind], g = world.grid, sc = scaleOf(world), R = W.radius * sc;
  const tx = g.x(m.target) + 0.5, ty = g.y(m.target) + 0.5, near = (x, y) => Math.hypot(x - tx, y - ty) <= R;
  const hit = { plots: 0, damaged: 0, stacks: 0, troops: 0, machines: 0, residents: 0 }, seen = new Set();
  for (let y = Math.floor(ty - R); y <= Math.ceil(ty + R); y++)
    for (let x = Math.floor(tx - R); x <= Math.ceil(tx + R); x++) {
      if (!g.inside(x, y) || !near(x + 0.5, y + 0.5)) continue;
      hit.plots++;
      const bid = world.bld?.at.get(g.idx(x, y));
      if (bid === undefined || seen.has(bid)) continue;
      seen.add(bid);
      const b = world.bld.list.get(bid);
      if (!b || b.state !== "active") continue;
      const before = b.residents ?? 0;
      if (before) b.residents = before * (1 - W.residents);
      hit.residents += before - (b.residents ?? 0);
      Object.assign(b, { state: "damaged", repairAt: world.time + r.repairSeconds });
      world.air?.repairs.add(b.id);
      touched(world, b);
      hit.damaged++;
    }
  for (const s of [...world.stacks.values()]) {
    if (!near(g.x(s.pos) + 0.5, g.y(s.pos) + 0.5)) continue;
    const loss = s.troops * W.loss;
    world.loseTroops(s, loss);
    hit.troops += loss;
    hit.stacks++;
    if (s.troops < 1) { world.stacks.delete(s.id); world.emit("stack_destroyed", { stack: s.id, nation: s.owner, at: s.pos, by: m.owner }); }
  }
  for (const u of [...(world.units?.list.values() ?? [])]) {
    if (u.wreck || u.air?.landed === false) continue;
    const def = UNIT_TYPES[u.type];
    if (u.air || !near(g.x(u.at) + 0.5, g.y(u.at) + 0.5) || diveOf(world, u) === 2) continue;
    u.hp -= def.hp * W.damage;
    u.hitBy = m.owner;
    if (u.hp <= 0) { hit.machines++; wreck(world, u); }
  }
  hit.troops = Math.round(hit.troops);
  hit.residents = Math.round(hit.residents);
  world.emit("nuke_detonated", { id: m.id ?? null, by: m.owner, nation: m.toward ?? null, at: m.target, kind: m.kind, radius: R, inner: 0, conventional: true, rubble: 0, cleared: 0, ...hit });
  return hit;
}

export function detonate(world, m) {
  const r = world.nukes?.rules ?? NUKE_RULES, W = r.warheads[m.kind], g = world.grid, sc = scaleOf(world);
  if (W.conventional) return strike(world, m);
  const R = W.radius * sc, inner = W.inner * sc, crater = r.crater * sc, rr = Math.ceil(R);
  const cx = g.x(m.target), cy = g.y(m.target), tx = cx + 0.5, ty = cy + 0.5;
  const capitals = new Set();
  for (const n of world.nations.values()) if (n.capital != null) capitals.add(n.capital);
  const hit = { plots: 0, cleared: 0, rubble: 0, damaged: 0, stacks: 0, troops: 0, machines: 0, residents: 0 };
  const struck = new Map();
  for (let y = cy - rr; y <= cy + rr; y++)
    for (let x = cx - rr; x <= cx + rr; x++) {
      if (!g.inside(x, y)) continue;
      const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
      if (d > R) continue;
      const i = g.idx(x, y), bid = world.bld?.at.get(i);
      hit.plots++;
      if (bid !== undefined) worse(struck, bid, d <= inner ? 2 : 1);
      const t = TERRAIN[world.terrain[i]];
      if (!t.land || d > inner) continue;
      if (world.terrain[i] !== TID.river) {
        const now = d <= crater ? TID.crater : TID.scorched;
        if (world.res) setTerrain(world, i, now);
        else world.terrain[i] = now;
      }
      if (world.res?.wood?.[i]) { world.res.wood[i] = 0; world.bld.changed.add("wood"); }
      if (world.log?.road[i]) setRoad(world, i, 0);
      if (world.owner[i] && !capitals.has(i)) { world.claim(i, 0); hit.cleared++; }
    }
  for (const [bid, level] of struck) {
    const b = world.bld.list.get(bid);
    if (!b || b.state === "rubble") continue;
    if (level === 2) { hit.residents += ruin(world, b); hit.rubble++; continue; }
    if (b.state !== "active") continue;
    const before = b.residents ?? 0;
    if (before) b.residents = before * r.outerResidents;
    hit.residents += before - (b.residents ?? 0);
    Object.assign(b, { state: "damaged", repairAt: world.time + r.repairSeconds, nuked: true });
    world.air?.repairs.add(b.id);
    touched(world, b);
    hit.damaged++;
  }
  for (const s of [...world.stacks.values()]) {
    const d = Math.hypot(g.x(s.pos) + 0.5 - tx, g.y(s.pos) + 0.5 - ty);
    if (d > R) continue;
    if (d <= inner) {
      hit.troops += s.troops;
      hit.stacks++;
      world.stacks.delete(s.id);
      world.emit("stack_destroyed", { stack: s.id, nation: s.owner, at: s.pos, by: m.owner });
      continue;
    }
    const loss = s.troops * r.outerLoss;
    world.loseTroops(s, loss);
    hit.troops += loss;
  }
  for (const u of [...(world.units?.list.values() ?? [])]) {
    if (u.wreck) continue;
    const def = UNIT_TYPES[u.type], [ux, uy] = u.air ? [u.air.x, u.air.y] : [g.x(u.at) + 0.5, g.y(u.at) + 0.5], d = Math.hypot(ux - tx, uy - ty);
    if (d > R || diveOf(world, u) === 2) continue;
    if (d > inner) u.hp -= def.hp * r.outerDamage;
    if (d > inner && u.hp > 0) continue;
    u.hitBy = m.owner;
    hit.machines++;
    if (def.domain === "air") down(world, u, "it was caught in a nuclear blast");
    else wreck(world, u);
  }
  hit.troops = Math.round(hit.troops);
  hit.residents = Math.round(hit.residents);
  world.emit("nuke_detonated", { id: m.id ?? null, by: m.owner, nation: m.toward ?? null, at: m.target, kind: m.kind, radius: R, inner, ...hit });
  return hit;
}

function reloadAbm(world, b, abm, dt, whole) {
  b.interceptors ??= abm.interceptors;
  if (b.interceptors >= abm.interceptors) { b.reloadAt = null; return; }
  const n = world.nations.get(b.owner);
  if (whole) {
    const want = Math.min(abm.interceptors - b.interceptors, Math.floor(dt / abm.reload), n ? Math.floor(n.money / abm.reloadCost) : 0);
    if (want > 0) { n.money -= want * abm.reloadCost; b.interceptors += want; }
    if (b.interceptors >= abm.interceptors) b.reloadAt = null;
    return;
  }
  b.reloadAt ??= world.time + abm.reload;
  if (world.time < b.reloadAt || !n || n.money < abm.reloadCost) return;
  n.money -= abm.reloadCost;
  b.interceptors++;
  b.reloadAt = b.interceptors < abm.interceptors ? world.time + abm.reload : null;
}

export function nukeTick(world, dt, whole = false) {
  const N = world.nukes;
  for (const n of world.nations.values()) {
    const st = n.nuke;
    if (!st) continue;
    for (const [bid, have] of Object.entries(st.silos)) {
      const b = world.bld?.list.get(Number(bid));
      if (!b || b.owner !== n.id || b.state === "rubble") {
        delete st.silos[bid];
        world.emit("warhead_lost", { nation: n.id, building: Number(bid), kind: have.kind });
        continue;
      }
      if (have.ready || b.state !== "active") continue;
      have.left -= dt * N.speed;
      if (have.left > 0) continue;
      have.left = 0;
      have.ready = true;
      world.emit("warhead_ready", { nation: n.id, building: b.id, kind: have.kind });
    }
    if (!st.flying.length) continue;
    const due = st.flying.filter(f => f.due <= world.time);
    if (!due.length) continue;
    st.flying = st.flying.filter(f => f.due > world.time);
    for (const f of due) resolve(world, n.id, f);
  }
  for (const { b, abm } of abmSites(world)) reloadAbm(world, b, abm, dt, whole);
}

export function finishWarheads(world, n) {
  for (const have of Object.values(n.nuke?.silos ?? {})) if (!have.ready) have.left = 0;
}

export function nukeView(world, nid) {
  if (!world.nukes) return null;
  const n = world.nations.get(nid), silos = {}, abms = {};
  for (const [bid, h] of Object.entries(n?.nuke?.silos ?? {})) silos[bid] = [h.kind, Math.ceil(h.left / world.nukes.speed), h.ready ? 1 : 0];
  for (const { b, abm } of abmSites(world)) if (b.owner === nid) abms[b.id] = [b.interceptors ?? abm.interceptors, abm.interceptors, b.reloadAt == null ? 0 : Math.max(0, Math.ceil(b.reloadAt - world.time))];
  return Object.keys(silos).length || Object.keys(abms).length ? { silos, abms } : null;
}

export function flightsOf(world) {
  const out = [];
  for (const n of world.nations.values()) for (const f of n.nuke?.flying ?? []) out.push({ nation: n.id, ...f });
  return out;
}
