import rules from "../../data/rules.json" with { type: "json" };
import { TERRAIN } from "../shared/terrain.js";
import { ROAD_MULT } from "../shared/roads.js";
import { findPath, labelMap } from "../shared/pathfind.js";
import { supplyCostOf } from "../shared/supply.js";

export const STORE_RULES = {
  reach: 12, every: 5, fieldEvery: 10, perTick: 2, pathsPerTick: 4, buffer: 20, campCapacity: 500, convoyMax: 12, raidRange: 1, pathNodes: 60000, cacheMax: 300,
  convoy: { T: { capacity: 10, speed: 1 }, M: { capacity: 30, speed: 1.3 }, G: { capacity: 50, speed: 1.5 }, I: { capacity: 150, speed: 2.5 }, Mo: { capacity: 300, speed: 3.5 }, F: { capacity: 500, speed: 5 } },
  ...rules.stores,
};

const EPS = 1e-6;
const REFRESH = new Set(["built", "kit", "demolished", "upgraded"]);

export function installStores(world, { scale = 1, rules: r = STORE_RULES } = {}) {
  if (world.stores) return world.stores;
  const st = {
    rules: r, scale, index: new Map(), rescan: true, fields: new Map(), fieldClock: new Map(), clocks: new Map(), clock: 0, budget: r.pathsPerTick,
    convoys: new Map(), next: 1, paths: new Map(), counts: { sent: 0, arrived: 0, taken: 0, lost: 0, searches: 0 }, asks: new Map(), sites: new Set(), held: new Set(), stuck: new Map(), news: new Set(), whole: false,
  };
  world.stores = st;
  (world.bld.extra ??= {}).stores = () => encodeStores(world);
  world.bld.onOwner = (b, from) => ownerChanged(world, b, from);
  const tick = (w, dt) => storesTick(w, dt);
  tick.whole = (w, dt) => storesWhole(w, dt);
  tick.rank = 2;
  world.hooks.postTick.push(tick);
  return st;
}

const human = (world, nid) => !!world.nations.get(nid)?.human;
const defOf = (world, b) => world.bld.table[b.type];
export const isStore = (world, b) => !!b && (b.camp || !!defOf(world, b)?.store);
export const capOf = (world, s) => (s.camp ? world.stores.rules.campCapacity : defOf(world, s)?.store?.capacity ?? 0);
const isSeat = (world, s) => !s.camp && !!defOf(world, s)?.store?.seat;
const valid = (world, nid, b) => world.bld.list.get(b.id) === b && b.owner === nid && b.state === "active";
const mark = world => world.bld.changed.add("stores");
export const specOf = (world, era) => world.stores.rules.convoy[era] ?? world.stores.rules.convoy.T;

function scan(world) {
  const st = world.stores, idx = new Map();
  for (const b of world.bld.list.values()) {
    if (b.state !== "active" || !defOf(world, b)?.store || !human(world, b.owner)) continue;
    b.goods ??= {};
    let list = idx.get(b.owner);
    if (!list) idx.set(b.owner, (list = []));
    list.push(b);
  }
  for (const nid of new Set([...idx.keys(), ...st.index.keys()])) {
    const a = idx.get(nid) ?? [], b = st.index.get(nid) ?? [];
    if (a.length !== b.length || a.some((s, k) => s !== b[k])) st.fields.delete(nid);
  }
  st.index = idx;
  st.rescan = false;
}

function campOf(n) {
  n.camp ??= { goods: {} };
  return { id: 0, camp: true, goods: n.camp.goods, anchor: n.capital ?? null, owner: n.id, plots: n.capital != null ? [n.capital] : [] };
}

export function storesOf(world, nid) {
  const st = world.stores;
  if (st.rescan) scan(world);
  const list = (st.index.get(nid) ?? []).filter(b => valid(world, nid, b));
  if (list.length) return list;
  const n = world.nations.get(nid);
  return n?.alive && n.capital != null ? [campOf(n)] : [];
}

export function storeById(world, nid, id) {
  if (id === 0) { const list = storesOf(world, nid); return list[0]?.camp ? list[0] : null; }
  const b = world.bld.list.get(id);
  return b && valid(world, nid, b) && isStore(world, b) ? (b.goods ??= {}, b) : null;
}

function spread(world, list, k, v) {
  const order = [...list].sort((a, b) => isSeat(world, b) - isSeat(world, a) || (capOf(world, b) - (b.goods[k] ?? 0)) - (capOf(world, a) - (a.goods[k] ?? 0)));
  for (const s of order) {
    const t = Math.min(v, Math.max(0, capOf(world, s) - (s.goods[k] ?? 0)));
    if (t > 0) { s.goods[k] = (s.goods[k] ?? 0) + t; v -= t; }
    if (v <= EPS) return;
  }
  if (order[0]) order[0].goods[k] = (order[0].goods[k] ?? 0) + v;
}

function drain(list, k, v) {
  const total = list.reduce((a, s) => a + (s.goods[k] ?? 0), 0);
  if (total <= EPS) return;
  const f = Math.min(1, v / total);
  for (const s of list) if (s.goods[k]) s.goods[k] = s.goods[k] * (1 - f) > EPS ? s.goods[k] * (1 - f) : 0;
}

export function sync(world, n) {
  if (!world.stores || !n?.human) return;
  const list = storesOf(world, n.id);
  if (!list.length) return;
  n.stock ??= {};
  n.stored ??= {};
  let moved = false;
  if (!list[0].camp && n.camp) {
    for (const [k, v] of Object.entries(n.camp.goods)) if (v > EPS) spread(world, list, k, v);
    delete n.camp;
    moved = true;
  }
  for (const k of new Set([...Object.keys(n.stock), ...Object.keys(n.stored)])) {
    const d = (n.stock[k] ?? 0) - (n.stored[k] ?? 0);
    if (d > EPS) spread(world, list, k, d);
    else if (d < -EPS) drain(list, k, -d);
    else continue;
    moved = true;
  }
  const tot = {};
  for (const k of Object.keys(n.stock)) tot[k] = 0;
  for (const s of list) for (const [k, v] of Object.entries(s.goods)) tot[k] = (tot[k] ?? 0) + v;
  for (const [k, v] of Object.entries(tot)) n.stock[k] = v;
  n.stored = tot;
  if (moved) mark(world);
}

export function putInto(world, n, s, k, v) { put(world, n, s, k, v); }
export function takeFrom(world, n, s, k, v) { return take(world, n, s, k, v); }

function put(world, n, s, k, v) {
  if (!(v > 0)) return;
  s.goods[k] = (s.goods[k] ?? 0) + v;
  n.stock ??= {};
  n.stored ??= {};
  n.stock[k] = (n.stock[k] ?? 0) + v;
  n.stored[k] = (n.stored[k] ?? 0) + v;
  mark(world);
}

function take(world, n, s, k, v) {
  const t = Math.min(v, s.goods[k] ?? 0);
  if (!(t > 0)) return 0;
  s.goods[k] -= t;
  if (s.goods[k] < EPS) s.goods[k] = 0;
  n.stock[k] = (n.stock[k] ?? 0) - t;
  n.stored ??= {};
  n.stored[k] = (n.stored[k] ?? 0) - t;
  mark(world);
  return t;
}

const viewOf = world => ({ terrain: world.terrain, owner: world.owner, road: world.log?.road });
const costFor = (world, nid) => {
  const cost = supplyCostOf(viewOf(world), nid, (a, b) => world.passable(a, b));
  cost.minStep = world.pathMinStep?.() ?? 0.9;
  return cost;
};
const ownOrAlly = (world, nid, i) => { const o = world.owner[i]; return o === nid || (!!o && world.passable(nid, o)); };

function fieldOf(world, nid) {
  const st = world.stores;
  if (st.rescan) scan(world);
  let f = st.fields.get(nid);
  if (f) return f;
  const src = [];
  for (const s of storesOf(world, nid)) if (s.anchor != null && world.owner[s.anchor] === nid) src.push([s.anchor, s.id]);
  f = labelMap(world.grid, src, costFor(world, nid), st.rules.reach * st.scale);
  st.fields.set(nid, f);
  st.fieldClock.set(nid, 0);
  return f;
}

export function homeAt(world, nid, plot) {
  if (!human(world, nid)) return null;
  const id = fieldOf(world, nid).label.get(plot);
  return id === undefined ? null : storeById(world, nid, id);
}

export function homeOf(world, b) {
  if (!human(world, b.owner)) return null;
  const f = fieldOf(world, b.owner);
  let id = f.label.get(b.anchor);
  if (id === undefined) for (const p of b.plots ?? []) if ((id = f.label.get(p)) !== undefined) break;
  return id === undefined ? null : storeById(world, b.owner, id);
}

function nearestStore(world, nid, plot, list = storesOf(world, nid)) {
  const g = world.grid;
  let best = null, bd = Infinity;
  for (const s of list) {
    if (s.anchor == null) continue;
    const d = g.dist(s.anchor, plot);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function goodsNear(world, b) {
  return homeOf(world, b)?.goods ?? {};
}

export function takeNear(world, b, k, v) {
  const n = world.nations.get(b.owner), home = homeOf(world, b);
  return home ? take(world, n, home, k, v) : 0;
}

export function putNear(world, b, k, v, at = b.anchor) {
  const n = world.nations.get(b.owner);
  if (!n?.human || !(v > 0)) return;
  const s = homeOf(world, b) ?? nearestStore(world, b.owner, at);
  if (s) put(world, n, s, k, v);
}

export function roomFor(world, b, kind) {
  if (!world.stores || !human(world, b.owner)) return Infinity;
  const home = homeOf(world, b), r = world.stores.rules;
  return (home ? Math.max(0, capOf(world, home) - (home.goods[kind] ?? 0)) : 0) + Math.max(0, r.buffer - (b.held?.[kind] ?? 0));
}

export function deliver(world, b, kind, v) {
  const st = world.stores, n = world.nations.get(b.owner);
  if (!n?.human) return;
  const home = homeOf(world, b);
  let left = v + (b.held?.[kind] ?? 0);
  if (b.held) delete b.held[kind];
  if (home) {
    const t = Math.min(left, Math.max(0, capOf(world, home) - (home.goods[kind] ?? 0)));
    put(world, n, home, kind, t);
    left -= t;
  }
  if (left > EPS) {
    (b.held ??= {})[kind] = Math.min(st.rules.buffer, left);
    st.held.add(b.id);
    st.stuck.set(b.id, home ? "full" : "reach");
    mark(world);
  } else {
    if (b.held && !Object.keys(b.held).length) { delete b.held; st.held.delete(b.id); }
    st.stuck.delete(b.id);
  }
}

function flushHeld(world, nid = null) {
  const st = world.stores;
  for (const id of st.held) {
    const b = world.bld.list.get(id);
    if (nid !== null && b?.owner !== nid) continue;
    if (!b?.held || !human(world, b.owner)) { if (b) delete b.held; st.held.delete(id); st.stuck.delete(id); continue; }
    const home = homeOf(world, b), n = world.nations.get(b.owner);
    if (!home) { st.stuck.set(id, "reach"); continue; }
    for (const [k, v] of Object.entries(b.held)) {
      const t = Math.min(v, Math.max(0, capOf(world, home) - (home.goods[k] ?? 0)));
      put(world, n, home, k, t);
      if (v - t > EPS) b.held[k] = v - t; else delete b.held[k];
    }
    if (!Object.keys(b.held).length) { delete b.held; st.held.delete(id); st.stuck.delete(id); } else st.stuck.set(id, "full");
  }
}

function askAt(world, id, k) {
  return world.stores.asks.get(`${id}:${k}`)?.amount ?? 0;
}

function keepOf(world, s, k) {
  return Math.max(s.keep?.[k] ?? 0, s.want?.[k] ?? 0, askAt(world, s.id, k));
}

const surplus = (world, s, k) => (s.goods[k] ?? 0) - keepOf(world, s, k);

export function poolOf(world, n, list) {
  const stores = [], seen = new Set();
  for (const b of list) {
    const h = homeOf(world, b);
    if (h && !seen.has(h.id)) { seen.add(h.id); stores.push(h); }
  }
  return {
    stores,
    have: k => stores.reduce((a, s) => a + (s.goods[k] ?? 0), 0),
    take: (k, v) => { for (const s of stores) { v -= take(world, n, s, k, v); if (v <= EPS) break; } },
    ask: (k, v) => { if (stores[0]) askFor(world, stores[0], k, v); },
  };
}

export function askFor(world, s, k, v) {
  const st = world.stores, key = `${s.id}:${k}`, cap = capOf(world, s);
  st.asks.set(key, { store: s.id, owner: s.owner, kind: k, amount: Math.min(cap, Math.max(v, st.asks.get(key)?.amount ?? 0)), at: world.time });
}

function coming(world, id, k) {
  let v = 0;
  for (const c of world.stores.convoys.values()) if (c.to === id && c.kind === k) v += c.amount;
  return v;
}

function inFlight(world, nid) {
  let v = 0;
  for (const c of world.stores.convoys.values()) if (c.owner === nid) v++;
  return v;
}

function pathBetween(world, nid, a, b) {
  if (a === b) return [a];
  const st = world.stores, key = `${nid}:${a}:${b}`, ver = world.log?.ver ?? 0;
  const hit = st.paths.get(key);
  if (hit && hit.ver === ver) {
    if (!hit.path) { if (world.time - hit.at < st.rules.every * 2) return null; }
    else if (hit.path.every(i => ownOrAlly(world, nid, i))) return hit.path;
  }
  if (!st.whole) { if (st.budget <= 0) return false; st.budget--; }
  st.counts.searches++;
  const path = findPath(world.grid, a, b, costFor(world, nid), st.rules.pathNodes);
  if (st.paths.size >= st.rules.cacheMax) st.paths.clear();
  st.paths.set(key, { path, ver, at: world.time });
  return path;
}

function launch(world, n, from, to, k, amount) {
  const st = world.stores, spec = specOf(world, n.era ?? "T");
  const load = Math.min(amount, spec.capacity, surplus(world, from, k));
  if (!(load > EPS) || from.anchor == null || to.anchor == null) return null;
  const path = pathBetween(world, n.id, from.anchor, to.anchor);
  if (!path) return null;
  take(world, n, from, k, load);
  const c = { id: st.next++, owner: n.id, kind: k, amount: load, from: from.id, to: to.id, dest: to.anchor, pos: path[0], path: path.slice(1), progress: 0, era: n.era ?? "T" };
  st.convoys.set(c.id, c);
  st.news.add(c.id);
  st.counts.sent++;
  return c;
}

function fill(world, n, b, k, v) {
  const use = Math.min(b.need?.[k] ?? 0, v);
  if (use > 0) {
    b.need[k] -= use;
    if (b.need[k] <= EPS) delete b.need[k];
    if (!Object.keys(b.need).length) { delete b.need; world.stores.sites.delete(b.id); }
    mark(world);
  }
  return use;
}

const isSite = (world, b, nid) => !!b?.need && b.owner === nid && b.state === "construction" && world.bld.list.get(b.id) === b;

function send(world, n, list, to, k, gap, room) {
  const g = world.grid, st = world.stores;
  const donors = list.filter(s => s.id !== to.id && surplus(world, s, k) > EPS && s.anchor != null).sort((a, b) => g.dist(a.anchor, to.anchor) - g.dist(b.anchor, to.anchor));
  let sent = 0;
  for (const s of donors) {
    while (gap > EPS && surplus(world, s, k) > EPS && (st.whole || sent < room)) {
      if (st.whole) {
        const t = take(world, n, s, k, Math.min(gap, surplus(world, s, k)));
        gap -= t;
        const left = isSite(world, to, n.id) ? t - fill(world, n, to, k, t) : t;
        if (left > EPS) put(world, n, isStore(world, to) ? to : s, k, left);
        continue;
      }
      const c = launch(world, n, s, to, k, gap);
      if (!c) break;
      gap -= c.amount;
      sent++;
    }
    if (gap <= EPS || (!st.whole && sent >= room)) break;
  }
  return sent;
}

export function requestSite(world, b, use) {
  const st = world.stores, n = world.nations.get(b.owner);
  if (!n?.human) return;
  sync(world, n);
  const home = homeOf(world, b), need = {};
  for (const [k, v] of Object.entries(use)) {
    if (!(v > 0)) continue;
    const left = v - (home ? take(world, n, home, k, v) : 0);
    if (left > EPS) need[k] = left;
  }
  if (!Object.keys(need).length) return;
  b.need = need;
  st.sites.add(b.id);
  mark(world);
  st.budget = Math.max(st.budget, st.rules.pathsPerTick);
  feedSite(world, n, b, storesOf(world, n.id));
}

function feedSite(world, n, b, list) {
  let room = world.stores.rules.convoyMax - inFlight(world, n.id);
  for (const k of Object.keys(b.need ?? {})) {
    const gap = (b.need?.[k] ?? 0) - coming(world, b.id, k);
    if (gap > EPS) room -= send(world, n, list, b, k, gap, room);
  }
}

export function siteDelivered(b, cost) {
  const out = {};
  for (const [k, v] of Object.entries(cost)) if (k !== "money") out[k] = Math.max(0, v - (b.need?.[k] ?? 0));
  return out;
}

function dispatch(world, n) {
  const st = world.stores, bld = world.bld, list = storesOf(world, n.id);
  if (!list.length) return;
  sync(world, n);
  for (const id of st.sites) {
    const b = bld.list.get(id);
    if (!b?.need || b.state !== "construction") { if (b) delete b.need; st.sites.delete(id); continue; }
    if (b.owner !== n.id) continue;
    const home = homeOf(world, b);
    if (home) for (const k of Object.keys(b.need)) fill(world, n, b, k, take(world, n, home, k, Math.max(0, (b.need[k] ?? 0) - coming(world, b.id, k))));
    if (b.need) feedSite(world, n, b, list);
  }
  let room = st.rules.convoyMax - inFlight(world, n.id);
  for (const [key, a] of st.asks) {
    if (a.owner !== n.id) continue;
    const s = storeById(world, n.id, a.store);
    if (!s || world.time - a.at > st.rules.every * 3) { st.asks.delete(key); continue; }
    const gap = a.amount - (s.goods[a.kind] ?? 0) - coming(world, s.id, a.kind);
    if (gap > EPS && (st.whole || room > 0)) room -= send(world, n, list, s, a.kind, gap, room);
  }
  for (const s of list) for (const [k, w] of Object.entries(s.want ?? {})) {
    const gap = w - (s.goods[k] ?? 0) - coming(world, s.id, k);
    if (gap > EPS && (st.whole || room > 0)) room -= send(world, n, list, s, k, gap, room);
  }
}

function arrive(world, c) {
  const st = world.stores, n = world.nations.get(c.owner);
  st.counts.arrived++;
  st.convoys.delete(c.id);
  st.news.add(c.id);
  if (!n?.alive) return;
  const b = c.to ? world.bld.list.get(c.to) : null;
  if (b && isSite(world, b, c.owner)) c.amount -= fill(world, n, b, c.kind, c.amount);
  if (c.amount <= EPS || !n.human) return;
  let dest = c.to === 0 ? storeById(world, c.owner, 0) : b && valid(world, c.owner, b) && isStore(world, b) ? b : null;
  dest ??= homeAt(world, c.owner, c.pos) ?? nearestStore(world, c.owner, c.pos);
  if (dest) put(world, n, dest, c.kind, c.amount);
}

function reroute(world, c) {
  let path = pathBetween(world, c.owner, c.pos, c.dest);
  if (path === false) return "later";
  if (path) { c.path = path.slice(1); return true; }
  const list = storesOf(world, c.owner).filter(s => s.anchor != null).sort((a, b) => world.grid.dist(a.anchor, c.pos) - world.grid.dist(b.anchor, c.pos));
  for (const s of list.slice(0, 4)) {
    path = pathBetween(world, c.owner, c.pos, s.anchor);
    if (path === false) return "later";
    if (path) { Object.assign(c, { to: s.id, dest: s.anchor, path: path.slice(1) }); return true; }
  }
  return false;
}

function lose(world, c, why) {
  const st = world.stores;
  st.counts.lost++;
  st.convoys.delete(c.id);
  st.news.add(c.id);
  world.emit("convoy_lost", { nation: c.owner, convoy: c.id, kind: c.kind, amount: Math.round(c.amount), at: c.pos, why });
}

function stepConvoys(world, dt) {
  const st = world.stores, terrain = world.terrain, road = world.log?.road;
  for (const c of [...st.convoys.values()]) {
    if (!world.nations.get(c.owner)?.alive) { lose(world, c, "gone"); continue; }
    if (!ownOrAlly(world, c.owner, c.pos)) { lose(world, c, "cut off"); continue; }
    if (!c.path || !ownOrAlly(world, c.owner, c.path[0] ?? c.pos)) {
      const r = reroute(world, c);
      if (r === "later") continue;
      if (!r) { lose(world, c, "cut off"); continue; }
    }
    if (!c.path.length) { arrive(world, c); continue; }
    const t = TERRAIN[terrain[c.path[0]]], cost = (t.move < Infinity ? t.move : 10) * ROAD_MULT[road?.[c.path[0]] ?? 0];
    c.progress += (specOf(world, c.era).speed * st.scale * dt) / cost;
    while (c.progress >= 1 && c.path.length) {
      if (!ownOrAlly(world, c.owner, c.path[0])) break;
      c.progress -= 1;
      c.pos = c.path.shift();
      st.news.add(c.id);
    }
    if (!c.path.length) arrive(world, c);
  }
}

function raid(world) {
  const st = world.stores;
  if (!st.convoys.size) return;
  const g = world.grid, byPlot = new Map(), r = Math.max(1, Math.round(st.rules.raidRange * st.scale));
  for (const s of world.stacks.values()) {
    if (s.kind === "supply" || s.troops < 1) continue;
    let l = byPlot.get(s.pos);
    if (!l) byPlot.set(s.pos, (l = []));
    l.push(s);
  }
  for (const c of [...st.convoys.values()]) {
    const x = g.x(c.pos), y = g.y(c.pos);
    let foe = null;
    for (let dy = -r; dy <= r && !foe; dy++) for (let dx = -r; dx <= r && !foe; dx++) {
      if (!g.inside(x + dx, y + dy)) continue;
      for (const s of byPlot.get(g.idx(x + dx, y + dy)) ?? []) if (s.owner !== c.owner && world.hostile(s.owner, c.owner)) { foe = s; break; }
    }
    if (!foe) continue;
    st.counts.taken++;
    st.convoys.delete(c.id);
    st.news.add(c.id);
    const by = world.nations.get(foe.owner);
    if (by?.human) {
      const dest = homeAt(world, by.id, c.pos) ?? nearestStore(world, by.id, c.pos);
      if (dest) put(world, by, dest, c.kind, c.amount);
    }
    world.emit("convoy_taken", { nation: c.owner, by: foe.owner, convoy: c.id, kind: c.kind, amount: Math.round(c.amount), at: c.pos });
  }
}

function ownerChanged(world, b, from) {
  const st = world.stores;
  if (!isStore(world, b)) return;
  st.rescan = true;
  delete b.keep;
  delete b.want;
  const total = Object.values(b.goods ?? {}).reduce((a, v) => a + v, 0);
  if (total >= 1 && human(world, from)) world.emit("store_captured", { nation: from, by: b.owner, building: b.id, kind: b.type, at: b.anchor, goods: Math.round(total) });
}

export function storeLeft(world, b) {
  const st = world.stores;
  if (!st || !b.goods) return;
  st.rescan = true;
  const goods = b.goods;
  b.goods = {};
  delete b.keep;
  delete b.want;
  if (!human(world, b.owner)) return;
  const n = world.nations.get(b.owner);
  let list = storesOf(world, b.owner).filter(s => s !== b);
  if (!list.length && n.capital != null) list = [campOf(n)];
  for (const [k, v] of Object.entries(goods)) if (v > EPS) spread(world, list, k, v);
  mark(world);
}

export function setStore(world, nid, id, kind, keep, want) {
  const b = storeById(world, nid, id);
  if (!b || b.camp) return { error: "pick one of your stores" };
  const cap = capOf(world, b);
  if (typeof kind !== "string" || !/^[a-z_]{1,24}$/.test(kind)) return { error: "pick a good" };
  for (const v of [keep, want]) if (!Number.isInteger(v) || v < 0 || v > cap) return { error: `keep and want are whole numbers from 0 to ${cap}` };
  const k2 = Math.max(keep, want);
  const set = (field, v) => { if (v) (b[field] ??= {})[kind] = v; else if (b[field]) { delete b[field][kind]; if (!Object.keys(b[field]).length) delete b[field]; } };
  set("keep", k2);
  set("want", want);
  mark(world);
  return { building: b.id, kind, keep: k2, want };
}

export function storesTick(world, dt) {
  const st = world.stores, r = st.rules;
  for (const e of world.events) if (REFRESH.has(e.type)) { st.rescan = true; break; }
  st.budget = r.pathsPerTick;
  st.clock += dt;
  if (st.clock >= r.every) { st.clock = 0; st.rescan = true; }
  const due = [], stale = [];
  for (const n of world.nations.values()) {
    if (!n.human || !n.alive) continue;
    const t = (st.clocks.get(n.id) ?? (n.id * 0.7) % r.every) + dt;
    st.clocks.set(n.id, t);
    if (t >= r.every) due.push([t, n]);
  }
  due.sort((a, b) => b[0] - a[0]);
  for (const [, n] of due.slice(0, r.perTick)) {
    st.clocks.set(n.id, 0);
    flushHeld(world, n.id);
    dispatch(world, n);
  }
  for (const nid of st.fields.keys()) {
    const t = (st.fieldClock.get(nid) ?? 0) + dt;
    st.fieldClock.set(nid, t);
    if (t >= r.fieldEvery) stale.push([t, nid]);
  }
  stale.sort((a, b) => b[0] - a[0]);
  for (const [, nid] of stale.slice(0, r.perTick)) { st.fields.delete(nid); fieldOf(world, nid); }
  raid(world);
  stepConvoys(world, dt);
  for (const n of world.nations.values()) if (n.human && n.alive) sync(world, n);
}

export function storesWhole(world, dt) {
  const st = world.stores;
  st.whole = true;
  try {
    st.rescan = true;
    st.fields.clear();
    for (const c of [...st.convoys.values()]) arrive(world, c);
    flushHeld(world);
    for (const n of world.nations.values()) if (n.human && n.alive) dispatch(world, n);
    for (const n of world.nations.values()) if (n.human && n.alive) sync(world, n);
  } finally {
    st.whole = false;
  }
}

const round = o => {
  const out = {};
  for (const [k, v] of Object.entries(o ?? {})) if (v > EPS) out[k] = Math.round(v * 1000) / 1000;
  return out;
};

export function encodeStores(world) {
  const st = world.stores, out = { v: 1, next: st.next, s: [], need: [], held: [], c: [] };
  for (const b of world.bld.list.values()) {
    const goods = round(b.goods);
    if (Object.keys(goods).length || b.keep || b.want) out.s.push([b.id, goods, b.keep ?? 0, b.want ?? 0]);
    if (b.need) out.need.push([b.id, round(b.need)]);
    if (b.held) out.held.push([b.id, round(b.held)]);
  }
  for (const c of st.convoys.values()) out.c.push([c.id, c.owner, c.kind, Math.round(c.amount * 1000) / 1000, c.from, c.to, c.dest, c.pos, c.era]);
  return new TextEncoder().encode(JSON.stringify(out));
}

export function restoreStores(world, bytes) {
  const st = world.stores;
  if (!st || !bytes?.length) return 0;
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (d.v !== 1) throw new Error(`stores format ${d.v} is not known`);
  const bld = world.bld;
  for (const [id, goods, keep, want] of d.s) {
    const b = bld.list.get(id);
    if (!b) continue;
    b.goods = goods;
    if (keep) b.keep = keep;
    if (want) b.want = want;
  }
  for (const [id, need] of d.need) { const b = bld.list.get(id); if (b && Object.keys(need).length) { b.need = need; st.sites.add(id); } }
  for (const [id, held] of d.held) { const b = bld.list.get(id); if (b && Object.keys(held).length) { b.held = held; st.held.add(id); } }
  for (const [id, owner, kind, amount, from, to, dest, pos, era] of d.c) st.convoys.set(id, { id, owner, kind, amount, from, to, dest, pos, path: null, progress: 0, era });
  st.next = Math.max(st.next, d.next ?? 1);
  st.rescan = true;
  bld.changed.delete("stores");
  return d.s.length;
}

export function convoyRow(world, c) {
  return [c.id, c.owner, c.pos, c.kind, Math.round(c.amount), c.era, c.dest];
}

export function logisticsView(world, n) {
  const st = world.stores;
  if (!st || !n?.human) return null;
  const stores = storesOf(world, n.id).map(s => [s.id, round(s.goods), capOf(world, s), s.keep ?? {}, s.want ?? {}, s.camp ? s.anchor : undefined]);
  const sites = [], stuck = [];
  for (const id of st.sites) {
    const b = world.bld.list.get(id);
    if (!b?.need || b.owner !== n.id) continue;
    const on = {};
    for (const k of Object.keys(b.need)) { const v = coming(world, id, k); if (v > 0) on[k] = Math.round(v); }
    const need = {};
    for (const [k, v] of Object.entries(b.need)) need[k] = Math.ceil(v - 1e-3);
    sites.push([id, need, on]);
  }
  for (const [id, why] of st.stuck) {
    const b = world.bld.list.get(id);
    if (!b || b.state !== "active") { st.stuck.delete(id); continue; }
    if (b.owner === n.id) stuck.push([id, why]);
  }
  const convoys = [];
  for (const c of st.convoys.values()) if (c.owner === n.id) convoys.push(c.id);
  const spec = specOf(world, n.era ?? "T");
  return { stores, sites, stuck, autoRoads: n.autoRoads ?? null, convoys: convoys.length, convoyMax: st.rules.convoyMax, capacity: spec.capacity, reach: st.rules.reach * st.scale, buffer: st.rules.buffer };
}
