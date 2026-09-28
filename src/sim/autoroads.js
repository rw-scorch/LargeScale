import { ROAD_TYPES, roadRoute, roadPrice } from "../shared/roads.js";
import { roadView, payAndLay } from "./logistics.js";
import { sync } from "./stores.js";

function storeList(world, nid) {
  const out = [];
  for (const id of world.bld?.mine.get(nid) ?? []) {
    const b = world.bld.list.get(id);
    if (b?.state === "active" && world.bld.table[b.type]?.store && world.owner[b.anchor] === nid) out.push(b);
  }
  return out;
}

function ringOf(g, b) {
  const own = new Set(b.plots), out = new Set();
  for (const p of b.plots) for (const q of g.neighbours4(p)) if (!own.has(q)) out.add(q);
  return out;
}

export function connectPlan(world, nid, kind) {
  const log = world.log, rules = log?.rules, n = world.nations.get(nid), g = world.grid;
  if (!rules?.types[kind]) return { error: "pick dirt or cobble" };
  const list = storeList(world, nid);
  if (!list.length) return { error: "you have no stores to connect yet" };
  const view = roadView(world), road = log.road, level = ROAD_TYPES.indexOf(kind);
  const hub = list.reduce((best, b) => (n.capital != null && g.dist(b.anchor, n.capital) < g.dist(best.anchor, n.capital) ? b : best), list[0]);
  const open = i => world.owner[i] === nid && !view.blocked(i);
  const connected = new Set(), flood = [];
  const join = i => { if (connected.has(i)) return; connected.add(i); if (road[i]) flood.push(i); };
  for (const i of ringOf(g, hub)) if (open(i)) join(i);
  const spread = () => {
    while (flood.length) for (const q of g.neighbours4(flood.pop())) if (road[q] && world.owner[q] === nid && !connected.has(q)) { connected.add(q); flood.push(q); }
  };
  spread();
  const planned = new Set();
  let joined = 0, already = 0, unreachable = 0;
  const rest = list.filter(b => b !== hub).sort((a, b) => g.dist(a.anchor, hub.anchor) - g.dist(b.anchor, hub.anchor));
  for (const b of rest) {
    if ([...ringOf(g, b)].some(i => connected.has(i))) { already++; continue; }
    const path = roadRoute(view, nid, b.plots, i => connected.has(i), "dirt", rules);
    if (!path) { unreachable++; continue; }
    for (const i of path) {
      if (view.blocked(i)) continue;
      if (!road[i]) planned.add(i);
      join(i);
    }
    spread();
    joined++;
    if (planned.size > rules.connectMax) break;
  }
  const plots = [...planned];
  return { plots, ...roadPrice(kind, world.terrain, plots, rules, log.scale), stores: list.length, joined, already, unreachable, level };
}

export function connectStores(world, nid, kind) {
  const n = world.nations.get(nid), plan = connectPlan(world, nid, kind);
  if (plan.error || !plan.plots.length) return plan;
  if (world.stores) sync(world, n);
  const r = payAndLay(world, nid, plan, kind);
  return r.error ? { ...plan, error: r.error } : { ...plan, laid: r.laid };
}

const signature = (world, nid) => `${Math.floor(world.time / 300)}:${storeList(world, nid).map(b => b.id).join(",")}`;

function autoConnect(world, n) {
  const st = world.autoRoads, sig = signature(world, n.id);
  if (st.done.get(n.id) === sig) return;
  const r = connectStores(world, n.id, n.autoRoads);
  if (r.error && r.cost) {
    if (!n.autoRoadsShort) world.emit("roads_waiting", { nation: n.id, cost: r.cost, plots: r.plots.length });
    n.autoRoadsShort = true;
    return;
  }
  n.autoRoadsShort = false;
  if (!r.error && !r.unreachable) st.done.set(n.id, sig);
  if (r.laid) world.emit("roads_connected", { nation: n.id, plots: r.laid, cost: r.cost, stores: r.joined });
}

export function installAutoRoads(world) {
  if (world.autoRoads) return world.autoRoads;
  const st = { clock: 0, turn: 0, done: new Map() };
  world.autoRoads = st;
  const every = () => world.log?.rules?.autoEvery ?? 20;
  const tick = (w, dt) => {
    st.clock += dt;
    if (st.clock < every()) return;
    st.clock = 0;
    const due = [...w.nations.values()].filter(n => n.human && n.alive && n.autoRoads);
    for (let k = 0; k < Math.min(2, due.length); k++) autoConnect(w, due[st.turn++ % due.length]);
  };
  tick.whole = w => { for (const n of w.nations.values()) if (n.human && n.alive && n.autoRoads) autoConnect(w, n); };
  tick.rank = 3;
  world.hooks.postTick.push(tick);
  return st;
}
