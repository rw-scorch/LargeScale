import rules from "../../data/rules.json" with { type: "json" };
import { ROAD_MULT, ROAD_TYPES } from "../shared/roads.js";
import { findPath } from "../shared/pathfind.js";
import { makeRng } from "../shared/rng.js";
import { UNIT_TYPES, spawnUnit, orderUnit, waterGraph, bodiesOf, waterOk, wreck } from "./units.js";

export const TRADE = rules.trade;

export function installTrade(world, { scale = 1, rules: r = TRADE, seed = 1 } = {}) {
  if (world.trade) return world.trade;
  const t = { rules: r, scale, rng: makeRng(seed >>> 0), clock: 0, ports: new Map(), docks: new Map(), trains: new Map(), nextTrain: 1, news: new Set(), paths: new Map(), earned: new Map() };
  world.trade = t;
  for (const u of world.units?.list.values() ?? []) if (u.trade && !u.wreck) (portOf(t, u.trade.from).ship = u.id);
  const tick = (w, dt) => {
    t.clock += dt;
    moveTrains(w, dt);
    if (t.clock < 1) return;
    const step = t.clock;
    t.clock = 0;
    tradeTick(w, step);
  };
  tick.whole = (w, dt) => awayTrade(w, dt);
  tick.rank = 2;
  world.hooks.postTick.push(tick);
  return t;
}

const portOf = (t, id) => { let p = t.ports.get(id); if (!p) t.ports.set(id, (p = { next: 0, ship: null, train: null })); return p; };
const ownOrAlly = (world, nid, i) => { const o = world.owner[i]; return o === nid || (!!o && world.passable(nid, o)); };
export const friendly = (world, a, b) => a === b || (!world.hostile(a, b) && !world.hostile(b, a) && !world.dip?.blocksTransit(a, b) && !world.dip?.blocksTransit(b, a));
const shipDef = world => UNIT_TYPES[world.trade.rules.ship];

function live(world, b) {
  const d = b && world.bld.table[b.type];
  return !!d && !d.retired && b.state === "active" && world.owner[b.anchor] === b.owner ? d : null;
}

export function dockOf(world, b) {
  const t = world.trade, hit = t.docks.get(b.id);
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
  t.docks.set(b.id, { anchor: b.anchor, dock });
  return dock;
}

function allPorts(world) {
  const t = world.trade;
  if (t.portList?.at === world.time) return t.portList.list;
  const list = [];
  for (const [nid, ids] of world.bld.mine) {
    if (!world.nations.get(nid)?.human) continue;
    for (const id of ids) {
      const b = world.bld.list.get(id), d = live(world, b), k = d?.port ? dockOf(world, b) : null;
      if (k) list.push({ b, dock: k.water, body: k.body });
    }
  }
  t.portList = { at: world.time, list };
  return list;
}

const portsIn = (world, body) => allPorts(world).filter(p => p.body === body);

export const tripPay = (world, plots) => world.trade.rules.base + (world.trade.rules.perPlot * plots) / world.trade.scale;

function earn(world, n, gold) {
  if (!n?.alive || n.money === undefined || !(gold > 0)) return 0;
  const g = gold * (n.outputMult ?? 1);
  n.money += g;
  n.tradeGold = (n.tradeGold ?? 0) + g;
  const t = world.trade, list = t.earned.get(n.id) ?? [];
  list.push([world.time, g]);
  while (list.length && list[0][0] < world.time - 300) list.shift();
  t.earned.set(n.id, list);
  return g;
}

function partnersOf(world, b, dock) {
  const t = world.trade, r = t.rules, g = world.grid, from = dockOf(world, b);
  if (!from) return [];
  return portsIn(world, from.body).filter(p => p.b.id !== b.id && friendly(world, b.owner, p.b.owner) && (p.b.owner !== b.owner || g.dist(p.dock, dock) >= r.minPlots * t.scale));
}

function launchShip(world, b, dock) {
  const t = world.trade, r = t.rules, g = world.grid;
  const list = partnersOf(world, b, dock);
  if (!list.length) return null;
  const weight = p => (p.b.owner === b.owner ? 1 : r.foreignWeight);
  let pick = t.rng.next() * list.reduce((s, p) => s + weight(p), 0), to = list[0];
  for (const p of list) { pick -= weight(p); if (pick <= 0) { to = p; break; } }
  const u = spawnUnit(world, b.owner, r.ship, dock);
  if (!u) return null;
  if (orderUnit(world, u.id, to.dock)) { world.units.list.delete(u.id); return null; }
  u.trade = { from: b.id, to: to.b.id, dock: to.dock, pay: Math.round(tripPay(world, g.dist(dock, to.dock)) * 10) / 10, at: world.time };
  return u;
}

function capture(world, u, by) {
  const t = world.trade, from = u.owner, co = waterGraph(world), body = bodiesOf(co)[co.regionOf(u.at)];
  const homes = portsIn(world, body).filter(p => p.b.owner === by);
  world.emit("trade_captured", { nation: from, by, machine: u.id, at: u.at, pay: u.trade.pay });
  if (!homes.length) { wreck(world, u); u.trade = null; return; }
  const g = world.grid, to = homes.reduce((a, p) => (g.dist(p.dock, u.at) < g.dist(a.dock, u.at) ? p : a));
  const port = t.ports.get(u.trade.from);
  if (port?.ship === u.id) port.ship = null;
  Object.assign(u, { owner: by, follow: null });
  u.trade = { ...u.trade, from: null, to: to.b.id, dock: to.dock, taken: from };
  if (orderUnit(world, u.id, to.dock)) world.units.list.delete(u.id);
}

function sink(world, u, by) {
  const port = world.trade.ports.get(u.trade.from);
  if (port?.ship === u.id) port.ship = null;
  world.emit("trade_sunk", { nation: u.owner, by: by.owner, machine: u.id, submarine: by.id, at: u.at, pay: u.trade.pay });
  u.trade = null;
  wreck(world, u);
}

function shipsTick(world) {
  const t = world.trade, g = world.grid, r = t.rules, warships = [];
  for (const u of world.units.list.values()) {
    const d = UNIT_TYPES[u.type];
    if (!u.wreck && d?.domain === "sea" && d.attack > 0) warships.push([u, Math.max(1, Math.round(d.range * (world.machines?.scale ?? 1)))]);
  }
  for (const u of [...world.units.list.values()]) {
    if (!u.trade || u.wreck) continue;
    const hunter = warships.find(([w, range]) => w.owner !== u.owner && world.hostile(w.owner, u.owner) && g.cheb(w.at, u.at) <= range * r.range)?.[0];
    if (hunter && UNIT_TYPES[hunter.type].sub) { sink(world, u, hunter); continue; }
    if (hunter) { capture(world, u, hunter.owner); continue; }
    const arrived = u.at === u.trade.dock || (!u.path.length && !u.route && g.cheb(u.at, u.trade.dock) <= 1);
    if (arrived) {
      const n = world.nations.get(u.owner), dest = world.bld.list.get(u.trade.to), home = t.ports.get(u.trade.from);
      earn(world, n, u.trade.pay);
      if (dest && live(world, dest) && dest.owner !== u.owner && friendly(world, u.owner, dest.owner)) earn(world, world.nations.get(dest.owner), u.trade.pay);
      if (home?.ship === u.id) home.ship = null;
      world.units.list.delete(u.id);
      continue;
    }
    if ((!u.path.length && !u.route && orderUnit(world, u.id, u.trade.dock)) || world.time - u.trade.at > r.lostAfter) {
      const home = t.ports.get(u.trade.from);
      if (home?.ship === u.id) home.ship = null;
      world.units.list.delete(u.id);
    }
  }
}

export function railPath(world, nid, a, b) {
  const t = world.trade, key = `${nid}:${a.id}:${b.id}`, ver = world.log?.ver ?? 0, hit = t.paths.get(key);
  if (hit && hit.ver === ver && (!hit.path || hit.path.every(i => ownOrAlly(world, nid, i)))) return hit.path;
  const road = world.log?.road, rail = ROAD_TYPES.indexOf("rail"), ends = new Set([...(a.plots ?? [a.anchor]), ...(b.plots ?? [b.anchor])]);
  const cost = (p, i) => (ends.has(i) || (road?.[i] === rail && ownOrAlly(world, nid, i)) ? ROAD_MULT[rail] : Infinity);
  cost.minStep = ROAD_MULT[rail];
  const path = road ? findPath(world.grid, a.anchor, b.anchor, cost, t.rules.train.pathNodes) : null;
  const ok = path && path.some(i => !ends.has(i)) ? path : null;
  t.paths.set(key, { path: ok, ver });
  if (t.paths.size > 500) t.paths.delete(t.paths.keys().next().value);
  return ok;
}

function launchTrain(world, b, stations) {
  const t = world.trade, g = world.grid;
  const far = stations.filter(s => s.id !== b.id).sort((p, q) => g.dist(q.anchor, b.anchor) - g.dist(p.anchor, b.anchor));
  for (const s of far) {
    const path = railPath(world, b.owner, b, s);
    if (!path) continue;
    const c = { id: t.nextTrain++, owner: b.owner, from: b.id, to: s.id, path, k: 0, progress: 0, pay: Math.round(tripPay(world, path.length) * t.rules.train.payMult * 10) / 10 };
    t.trains.set(c.id, c);
    t.news.add(c.id);
    return c;
  }
  return null;
}

function moveTrains(world, dt) {
  const t = world.trade, speed = t.rules.train.speed * (world.rules.stackSpeed ?? 1);
  for (const c of t.trains.values()) {
    c.progress += speed * dt;
    const before = c.k;
    while (c.progress >= 1 && c.k < c.path.length - 1) {
      c.progress -= 1;
      if (!ownOrAlly(world, c.owner, c.path[c.k + 1])) { c.cut = true; break; }
      c.k++;
    }
    if (c.k !== before) t.news.add(c.id);
    if (c.cut) { t.trains.delete(c.id); t.news.add(c.id); portOf(t, c.from).train = null; continue; }
    if (c.k >= c.path.length - 1) {
      earn(world, world.nations.get(c.owner), c.pay);
      t.trains.delete(c.id);
      t.news.add(c.id);
      portOf(t, c.from).train = null;
    }
  }
}

function tradeTick(world, dt) {
  const t = world.trade, r = t.rules;
  if (world.units && UNIT_TYPES[r.ship]) shipsTick(world);
  let searches = r.train.searchesPerTick;
  for (const n of world.nations.values()) {
    if (!n.human || !n.alive || n.money === undefined) continue;
    const stations = [];
    for (const id of world.bld.mine.get(n.id) ?? []) {
      const b = world.bld.list.get(id), d = live(world, b);
      if (d?.station) stations.push(b);
    }
    for (const id of world.bld.mine.get(n.id) ?? []) {
      const b = world.bld.list.get(id), d = live(world, b);
      if (!d || (!d.port && !d.station)) continue;
      const p = portOf(t, b.id);
      if (world.time < p.next) continue;
      if (d.port && world.units && !(p.ship && world.units.list.get(p.ship)?.trade)) {
        const dock = dockOf(world, b);
        const u = dock ? launchShip(world, b, dock.water) : null;
        p.ship = u?.id ?? null;
        p.next = world.time + r.every;
      }
      if (d.station && stations.length > 1 && !(p.train && t.trains.has(p.train)) && searches > 0) {
        searches--;
        p.train = launchTrain(world, b, stations)?.id ?? null;
        p.next = world.time + r.train.every;
      }
    }
  }
}

function awayTrade(world, dt) {
  const t = world.trade, r = t.rules;
  for (const n of world.nations.values()) {
    if (!n.human || !n.alive || n.money === undefined) continue;
    let ports = 0;
    const stations = [];
    for (const id of world.bld.mine.get(n.id) ?? []) {
      const b = world.bld.list.get(id), d = live(world, b);
      if (d?.port) { const k = dockOf(world, b); if (k && partnersOf(world, b, k.water).length) ports++; }
      if (d?.station) stations.push(b);
    }
    const railed = stations.filter(s => stations.some(o => o !== s && railPath(world, n.id, s, o))).length;
    const pay = tripPay(world, r.minPlots * t.scale * 2);
    earn(world, n, ports * pay * (dt / (r.every * 2)) + railed * pay * r.train.payMult * (dt / (r.train.every * 2)));
  }
}

export function trainRow(world, c) {
  return [c.id, c.owner, c.path[c.k], "gold", c.pay, world.nations.get(c.owner)?.era ?? "T", world.bld.list.get(c.to)?.anchor ?? c.path[c.path.length - 1], 0, 1];
}

export function takeTrainNews(world) {
  const t = world.trade;
  if (!t?.news.size) return null;
  const up = [], gone = [];
  for (const id of t.news) { const c = t.trains.get(id); if (c) up.push(trainRow(world, c)); else gone.push(id); }
  t.news.clear();
  return { up, gone };
}

export function tradePerSecond(world, nid) {
  const t = world.trade;
  if (!t) return 0;
  return (t.earned.get(nid) ?? []).filter(([at]) => at >= world.time - 300).reduce((s, [, g]) => s + g, 0) / 300;
}

export function tradeView(world, n) {
  const t = world.trade;
  if (!t || !n?.human) return null;
  let ports = 0, stations = 0, ships = 0, trains = 0;
  for (const id of world.bld.mine.get(n.id) ?? []) {
    const b = world.bld.list.get(id), d = live(world, b);
    if (d?.port) ports++;
    if (d?.station) stations++;
  }
  for (const u of world.units?.list.values() ?? []) if (u.trade && !u.wreck && u.owner === n.id) ships++;
  for (const c of t.trains.values()) if (c.owner === n.id) trains++;
  const recent = (t.earned.get(n.id) ?? []).filter(([at]) => at >= world.time - 300).reduce((s, [, g]) => s + g, 0);
  return { ports, stations, ships, trains, perMinute: Math.round(recent / 5), total: Math.floor(n.tradeGold ?? 0) };
}
