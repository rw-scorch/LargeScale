import { UNIT_TYPES, spawnUnit, orderUnit, waterGraph, bodiesOf, waterOk } from "./units.js";
import { storesOf, storeById, pathBetween, landTime, specOf, STORE_RULES } from "./stores.js";

export const SEA_RULES = STORE_RULES.sea;

export function installSeaRoutes(world, { rules: r = SEA_RULES } = {}) {
  const st = world.stores;
  if (!st || !world.units || !UNIT_TYPES[r.ship]) return null;
  const sea = {
    rules: r, docks: new Map(),
    plan: (n, from, to, path) => seaPlan(world, n, from, to, path),
    board: c => board(world, c),
    step: c => sail(world, c),
    portsOf: nid => docksOf(world, nid).length,
  };
  st.sea = sea;
  const tick = w => sweep(w);
  tick.rank = 3;
  world.hooks.postTick.push(tick);
  return sea;
}

const isPort = (world, b) => !b.camp && !!world.bld.table[b.type]?.port;

function dockOf(world, b) {
  const sea = world.stores.sea, hit = sea.docks.get(b.id);
  if (hit && hit.anchor === b.anchor) return hit.dock;
  const g = world.grid, co = waterGraph(world), body = bodiesOf(co);
  let dock = null;
  for (const p of b.plots ?? [b.anchor]) {
    for (const q of g.neighbours4(p)) {
      if (!waterOk(world.terrain[q])) continue;
      const r = co.regionOf(q);
      if (r >= 0) { dock = { water: q, body: body[r] }; break; }
    }
    if (dock) break;
  }
  sea.docks.set(b.id, { anchor: b.anchor, dock });
  return dock;
}

export function docksOf(world, nid) {
  const out = [];
  for (const s of storesOf(world, nid)) {
    if (!isPort(world, s) || s.anchor == null) continue;
    const d = dockOf(world, s);
    if (d) out.push({ store: s, water: d.water, body: d.body });
  }
  return out;
}

const shipSpeed = world => UNIT_TYPES[world.stores.sea.rules.ship].speed * (world.rules.stackSpeed ?? 1);

export function seaTime(world, a, b) {
  return (world.grid.dist(a, b) * world.stores.sea.rules.detour) / shipSpeed(world);
}

function nearest(world, list, plot, k) {
  const g = world.grid;
  return list.slice().sort((a, b) => g.dist(a.store.anchor, plot) - g.dist(b.store.anchor, plot)).slice(0, k);
}

export function seaPlan(world, n, from, to, landPath = null) {
  const st = world.stores, r = st.sea.rules, era = n.era ?? "T", docks = docksOf(world, n.id), g = world.grid;
  if (docks.length < 2) return null;
  const perPlot = (world.pathMinStep?.() ?? 0.9) / (specOf(world, era).speed * st.scale);
  const pairs = [];
  for (const a of nearest(world, docks, from.anchor, r.ports))
    for (const b of nearest(world, docks.filter(d => d !== a && d.body === a.body), to.anchor, r.ports))
      pairs.push({ a, b, low: (g.dist(from.anchor, a.store.anchor) + g.dist(b.store.anchor, to.anchor)) * perPlot + seaTime(world, a.water, b.water) });
  pairs.sort((p, q) => p.low - q.low);
  const land = landPath ? landTime(world, era, landPath) : Infinity;
  let best = null;
  for (const { a, b, low } of pairs) {
    if (low * r.prefer >= land || low >= (best?.t ?? Infinity)) break;
    const leg1 = pathBetween(world, n.id, from.anchor, a.store.anchor);
    if (leg1 === false) return false;
    if (!leg1) continue;
    const leg2 = pathBetween(world, n.id, b.store.anchor, to.anchor);
    if (leg2 === false) return false;
    if (!leg2) continue;
    const t = landTime(world, era, leg1) + seaTime(world, a.water, b.water) + landTime(world, era, leg2);
    if (!best || t < best.t) best = { t, a, b, leg1 };
  }
  if (!best || land <= r.prefer * best.t) return null;
  const { a, b } = best;
  return { leg: best.leg1, goal: a.store.anchor, time: best.t, route: { p1: a.store.id, p2: b.store.id, w1: a.water, w2: b.water, body: a.body, stage: 0 } };
}

function port(world, nid, id) {
  const s = storeById(world, nid, id);
  return s && isPort(world, s) && dockOf(world, s) ? s : null;
}

function board(world, c) {
  const s = c.sea, r = world.stores.sea.rules;
  if (!port(world, c.owner, s.p1)) return false;
  const u = spawnUnit(world, c.owner, r.ship, s.w1);
  if (!u) return false;
  if (orderUnit(world, u.id, s.w2)) { world.units.list.delete(u.id); return false; }
  u.freight = c.id;
  s.stage = 1;
  Object.assign(c, { ship: u.id, pos: s.w1, path: [], progress: 0 });
  world.stores.news.add(c.id);
  world.emit("convoy_sailed", { nation: c.owner, convoy: c.id, kind: c.kind, amount: Math.round(c.amount), from: s.p1, to: s.p2, at: s.w1 });
  return true;
}

function drop(world, u, c, why) {
  world.units.list.delete(u.id);
  c.ship = null;
  return why;
}

function sail(world, c) {
  const st = world.stores, s = c.sea, g = world.grid, u = world.units.list.get(c.ship);
  if (u?.wreck) {
    if (u.hitBy) c.by = u.hitBy;
    return "sunk";
  }
  if (u && u.at !== c.pos) { c.pos = u.at; st.news.add(c.id); }
  if (u && (u.path.length || u.route)) return "sailing";
  if (u && g.cheb(u.at, s.w2) > 1) return orderUnit(world, u.id, s.w2) ? drop(world, u, c, "cut off") : "sailing";
  let p2 = port(world, c.owner, s.p2);
  if (!p2 && u) {
    const next = nearest(world, docksOf(world, c.owner).filter(d => d.body === s.body), u.at, 1)[0];
    if (next && !orderUnit(world, u.id, next.water)) {
      Object.assign(s, { p2: next.store.id, w2: next.water });
      return "sailing";
    }
    return drop(world, u, c, "no port");
  }
  if (u) world.units.list.delete(u.id);
  if (!p2) return "no port";
  Object.assign(c, { ship: null, sea: null, goal: null, pos: p2.anchor, path: null, progress: 0 });
  st.news.add(c.id);
  return "landed";
}

function sweep(world) {
  const st = world.stores;
  for (const u of world.units.list.values()) if (u.freight && !u.wreck && st.convoys.get(u.freight)?.ship !== u.id) world.units.list.delete(u.id);
}
