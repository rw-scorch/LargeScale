import rules from "../../data/rules.json" with { type: "json" };
import { BUILDINGS, removeBuilding } from "./buildings.js";
import { tourismIncome as income, TOURISM_RULES as BASE } from "../shared/tourism.js";

export const TOURISM_RULES = { every: 5, ...BASE, ...rules.tourism };
export const TOURISM = Object.fromEntries(Object.values(BUILDINGS.table).filter(d => d.tourism).map(d => [d.id, { ...d.tourism, ...(d.wonder ? { wonder: true } : {}) }]));

export function tourismIncome(types, season, { airport = false, port = false, rail = false } = {}, r = TOURISM_RULES) {
  const items = types.filter(t => TOURISM[t]).map(t => ({ type: t, value: TOURISM[t].value, mult: TOURISM[t].season?.[season] ?? 1, wonder: !!TOURISM[t].wonder }));
  return income(items, { airport, port, rail }, r).perSecond;
}

export function installTourism(world, { rules: r = TOURISM_RULES } = {}) {
  if (world.tourism) return world.tourism;
  const T = world.tourism = { rules: r, clock: 0, known: new Set(), sites: new Set(), last: new Map() };
  for (const b of world.bld.list.values()) if (world.bld.table[b.type]?.wonder && b.state !== "construction" && b.state !== "rubble") T.known.add(b.id);
  const tick = (w, dt) => tourismTick(w, dt, false);
  tick.whole = (w, dt) => tourismTick(w, dt, true);
  world.hooks.postTick.push(tick);
  return T;
}

export function tourismOf(world, n) {
  const bld = world.bld, items = [], links = { airport: false, port: false, rail: false }, seasons = new Map();
  for (const id of bld.mine.get(n.id) ?? []) {
    const b = bld.list.get(id), d = bld.table[b.type];
    if (b.state !== "active") continue;
    if (d.airport) links.airport = true;
    if (d.port) links.port = true;
    if (d.station) links.rail = true;
    if (!d.tourism) continue;
    const season = d.tourism.season ? world.res?.seasonOf(b.anchor) ?? "summer" : null, mult = season ? d.tourism.season[season] ?? 1 : 1;
    items.push({ type: b.type, value: d.tourism.value, mult, wonder: !!d.wonder });
    if (season) seasons.set(`${b.type}:${season}`, [b.type, season, mult]);
  }
  return { ...income(items, links, world.tourism?.rules ?? TOURISM_RULES), links, seasons: [...seasons.values()] };
}

function race(world, type, list, T) {
  const winner = list.find(b => T.known.has(b.id)) ?? list.find(b => b.state !== "construction");
  if (!winner) return;
  if (!T.known.has(winner.id)) {
    T.known.add(winner.id);
    world.emit("wonder_built", { nation: winner.owner, building: winner.id, kind: type, at: winner.anchor });
  }
  for (const b of list) {
    if (b === winner) continue;
    const n = world.nations.get(b.owner), cost = world.bld.table[type].cost?.money ?? 0;
    if (n) n.money = (n.money ?? 0) + cost;
    T.sites.delete(b.id);
    removeBuilding(world, b.id);
    world.emit("wonder_lost", { nation: b.owner, by: winner.owner, kind: type, refund: cost, at: b.anchor });
  }
}

export function wonderRace(world, full = true) {
  const T = world.tourism, bld = world.bld, byType = new Map();
  const ids = full ? bld.list.keys() : T.sites;
  if (full) T.sites.clear();
  for (const id of ids) {
    const b = bld.list.get(id), d = b && bld.table[b.type];
    if (!d?.wonder || b.state === "rubble") { T.sites.delete(id); continue; }
    if (full) T.sites.add(id);
    (byType.get(b.type) ?? byType.set(b.type, []).get(b.type)).push(b);
  }
  for (const [type, list] of byType) race(world, type, list, T);
  for (const id of T.known) if (!bld.list.has(id) || bld.list.get(id).state === "rubble") T.known.delete(id);
}

function tourismTick(world, dt, whole) {
  const T = world.tourism;
  T.clock += dt;
  if (T.sites.size && !whole) wonderRace(world, false);
  if (!whole && T.clock < T.rules.every) return;
  const span = T.clock;
  T.clock = 0;
  wonderRace(world, true);
  for (const n of world.nations.values()) {
    if (!n.alive || !n.human) continue;
    const v = tourismOf(world, n);
    T.last.set(n.id, v);
    if (v.perSecond > 0 && n.money !== undefined) n.money += v.perSecond * (n.outputMult ?? 1) * span;
  }
}

export function tourismView(world, n) {
  const v = n && world.tourism?.last.get(n.id);
  if (!v || !v.sites) return null;
  const r2 = x => Math.round(x * 100) / 100;
  return { perSecond: r2(v.perSecond * (n.outputMult ?? 1)), base: r2(v.base), sites: v.sites, kinds: v.kinds, wonders: v.wonders, variety: r2(v.variety), reach: r2(v.reach), links: v.links, seasons: v.seasons };
}
