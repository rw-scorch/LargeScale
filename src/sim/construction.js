import { TERRAIN } from "../shared/terrain.js";
import { ERA_ORDER, BUILDINGS, installBuildings, footprint, addBuilding, setPlots, buildingAt } from "./buildings.js";
import rules from "../../data/rules.json" with { type: "json" };

export { ERA_ORDER, footprint };
const eraIdx = e => ERA_ORDER.indexOf(e);

export const PLAYER_BUILDINGS = Object.fromEntries(Object.entries(BUILDINGS.table).filter(([, d]) => !d.civilian));

export const CONS_RULES = rules.construction;

export function installConstruction(world, cfg = CONS_RULES) {
  const bld = installBuildings(world);
  world.cons = { rules: { ...CONS_RULES, ...cfg }, table: bld.table };
  return world.cons;
}

function occupied(world, i, self) {
  const id = world.bld.at.get(i);
  return id !== undefined && id !== self;
}

export function canPlace(world, nid, type, anchor, self = 0) {
  const def = world.bld.table[type];
  const n = world.nations.get(nid);
  if (!def || def.civilian) return "unknown building";
  if (eraIdx(def.era) > eraIdx(n.era ?? "T")) return "era locked";
  const plots = footprint(world, anchor, def.fp);
  if (!plots) return "off the map";
  if (plots.some(i => occupied(world, i, self))) return "something is already there";
  const land = plots.filter(i => TERRAIN[world.terrain[i]].land);
  const water = plots.filter(i => !TERRAIN[world.terrain[i]].land);
  if (def.rule === "coast") {
    if (!land.length || !water.length) return "must sit on the coast";
    if (land.some(i => world.owner[i] !== nid)) return "not your land";
  } else if (def.rule === "shallows") {
    if (land.length || plots.some(i => TERRAIN[world.terrain[i]].water !== "shallow")) return "must sit in shallow water";
    const near = plots.some(i => nearOwned(world, i, nid, 3));
    if (!near) return "too far from your coast";
  } else {
    if (water.length) return "cannot build on water";
    if (plots.some(i => world.owner[i] !== nid)) return "not your land";
    if (plots.some(i => !TERRAIN[world.terrain[i]].build)) return "terrain too rough";
  }
  return null;
}

function nearOwned(world, i, nid, r) {
  const g = world.grid, x0 = g.x(i), y0 = g.y(i);
  for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (g.inside(x, y) && world.owner[g.idx(x, y)] === nid) return true;
  return false;
}

export function priceOf(cost, n, premium = 1, r = CONS_RULES) {
  let money = (cost.money ?? 0) * premium;
  const use = {};
  for (const [k, v] of Object.entries(cost)) {
    if (k === "money") continue;
    const have = n.stock?.[k] ?? 0;
    use[k] = Math.min(have, v);
    money += (v - use[k]) * r.moneyForMissing * premium;
  }
  return { money, use };
}

function charge(n, price) {
  if ((n.money ?? 0) < price.money) return false;
  n.money -= price.money;
  for (const [k, v] of Object.entries(price.use)) n.stock[k] -= v;
  return true;
}

export function place(world, nid, type, anchor) {
  const why = canPlace(world, nid, type, anchor);
  if (why) return { error: why };
  const def = world.bld.table[type], n = world.nations.get(nid);
  const price = { money: def.cost.money ?? 0, use: {} };
  for (const [k, v] of Object.entries(def.cost)) {
    if (k === "money") continue;
    if ((n.stock?.[k] ?? 0) < v) return { error: `needs ${v} ${k}` };
    price.use[k] = v;
  }
  if (!charge(n, price)) return { error: "not enough money" };
  return addBuilding(world, { type, owner: nid, anchor });
}

export function progressConstruction(world, dt) {
  for (const b of world.bld.list.values()) {
    if (b.civilian || b.state !== "construction") continue;
    b.progress += dt / world.bld.table[b.type].time;
    world.bld.changed.add("buildings");
    if (b.progress >= 1) { b.state = "active"; b.progress = 1; world.emit("built", { building: b.id, type: b.type }); }
  }
}

function chainOf(table, type) {
  let base = type;
  for (let guard = 0; guard < 20; guard++) {
    const prev = Object.keys(table).find(k => table[k].next === base);
    if (!prev) break;
    base = prev;
  }
  const chain = [base];
  while (table[chain[chain.length - 1]].next) chain.push(table[chain[chain.length - 1]].next);
  return chain;
}

export function listUpgradable(world, nid, { filter = "all", category = null } = {}) {
  const rows = [], table = world.bld.table;
  for (const b of world.bld.list.values()) {
    const def = table[b.type], civilian = b.civilian;
    if (b.owner !== nid || b.state !== "active" || !def.next) continue;
    if (filter === "civilian" && !civilian) continue;
    if (filter === "player" && civilian) continue;
    if (category && (def.cat ?? def.zone) !== category) continue;
    const chain = chainOf(table, b.type);
    rows.push({ id: b.id, civilian, type: b.type, next: def.next, level: chain.indexOf(b.type), chain: chain[0], era: def.era });
  }
  rows.sort((a, b) => a.level - b.level || eraIdx(a.era) - eraIdx(b.era) || a.chain.localeCompare(b.chain) || a.id - b.id);
  return rows;
}

export function selectRange(rows, fromIndex, toIndex) {
  const [a, b] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  return rows.slice(Math.max(0, a), b + 1).map(r => ({ id: r.id, civilian: r.civilian }));
}

export function bulkUpgrade(world, nid, picks) {
  const n = world.nations.get(nid), bld = world.bld, table = bld.table;
  const premium = world.cons?.rules.instantPremium ?? CONS_RULES.instantPremium;
  const done = [], skipped = [];
  let spent = 0;
  for (const p of picks) {
    const b = bld.list.get(p.id);
    if (!b || b.owner !== nid || b.state !== "active") { skipped.push([p.id, "not available"]); continue; }
    const next = table[b.type].next;
    if (!next) { skipped.push([p.id, "already top level"]); continue; }
    const nd = table[next];
    if (eraIdx(nd.era) > eraIdx(n.era ?? "T")) { skipped.push([p.id, "era locked"]); continue; }
    const plots = footprint(world, b.anchor, nd.fp);
    let bad = !plots;
    if (!bad && b.civilian) bad = plots.some(i => world.owner[i] !== nid || occupied(world, i, b.id) || bld.zone[i] !== bld.zone[b.anchor]);
    if (!bad && !b.civilian) bad = !!canPlace(world, nid, next, b.anchor, b.id);
    if (bad) { skipped.push([p.id, "no room to grow"]); continue; }
    const price = priceOf(nd.cost, n, premium, world.cons?.rules);
    if (!charge(n, price)) { skipped.push([p.id, "not enough money"]); continue; }
    spent += price.money;
    b.type = next;
    setPlots(world, b, plots);
    done.push(b.id);
  }
  return { done, skipped, spent };
}

export { buildingAt };
