import { TERRAIN } from "../shared/terrain.js";

export const ERA_ORDER = ["T", "M", "G", "I", "Mo", "F"];
const eraIdx = e => ERA_ORDER.indexOf(e);

export const PLAYER_BUILDINGS = {
  chieftain_hut: { cat: "civic", era: "T", fp: [2, 2], cost: { money: 50, wood: 20 }, time: 60, next: "great_hall" },
  great_hall: { cat: "civic", era: "M", fp: [2, 2], cost: { money: 200, wood: 60, stone: 20 }, time: 120, next: "town_hall" },
  town_hall: { cat: "civic", era: "G", fp: [2, 2], cost: { money: 600, stone: 80 }, time: 180, next: "parliament" },
  parliament: { cat: "civic", era: "I", fp: [3, 3], cost: { money: 2000, stone: 200, steel: 50 }, time: 300, next: null },
  watchtower_wood: { cat: "military", era: "T", fp: [1, 1], cost: { money: 20, wood: 15 }, time: 30, next: "tower_stone" },
  tower_stone: { cat: "military", era: "M", fp: [1, 1], cost: { money: 80, stone: 30 }, time: 60, next: "tower_concrete" },
  tower_concrete: { cat: "military", era: "Mo", fp: [1, 1], cost: { money: 300, concrete: 40 }, time: 90, next: null },
  barracks: { cat: "military", era: "M", fp: [2, 1], cost: { money: 150, wood: 40 }, time: 90, next: null },
  storage_yard: { cat: "infrastructure", era: "M", fp: [1, 1], cost: { money: 40, wood: 20 }, time: 40, next: "warehouse" },
  warehouse: { cat: "infrastructure", era: "I", fp: [2, 1], cost: { money: 250, steel: 20 }, time: 90, next: "logistics_depot" },
  logistics_depot: { cat: "infrastructure", era: "Mo", fp: [2, 2], cost: { money: 900, concrete: 60 }, time: 150, next: null },
  jetty: { cat: "transport", era: "T", fp: [1, 1], rule: "coast", cost: { money: 30, wood: 20 }, time: 40, next: "harbour" },
  harbour: { cat: "transport", era: "M", fp: [2, 2], rule: "coast", cost: { money: 300, wood: 80, stone: 40 }, time: 150, next: "port_commercial" },
  port_commercial: { cat: "transport", era: "I", fp: [3, 3], rule: "coast", cost: { money: 1500, steel: 100 }, time: 300, next: null },
  offshore_rig: { cat: "industry", era: "Mo", fp: [2, 2], rule: "shallows", cost: { money: 2500, steel: 150 }, time: 300, next: null },
};

export const CONS_RULES = { instantPremium: 1.5, moneyForMissing: 4, refundOnCancel: 0.5 };

export function installConstruction(world, table = PLAYER_BUILDINGS) {
  world.cons = { table, buildings: new Map(), at: new Int32Array(world.grid.size), next: 1 };
  return world.cons;
}

export function footprint(world, anchor, fp) {
  const g = world.grid, x0 = g.x(anchor), y0 = g.y(anchor), out = [];
  for (let dy = 0; dy < fp[1]; dy++) for (let dx = 0; dx < fp[0]; dx++) {
    if (!g.inside(x0 + dx, y0 + dy)) return null;
    out.push(g.idx(x0 + dx, y0 + dy));
  }
  return out;
}

function occupied(world, i, self) {
  const c = world.cons.at[i];
  const v = world.civ?.bld?.[i] ?? 0;
  return (c && c !== self) || v;
}

export function canPlace(world, nid, type, anchor, self = 0) {
  const def = world.cons.table[type];
  const n = world.nations.get(nid);
  if (!def) return "unknown building";
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

export function priceOf(cost, n, premium = 1) {
  let money = (cost.money ?? 0) * premium;
  const use = {};
  for (const [k, v] of Object.entries(cost)) {
    if (k === "money") continue;
    const have = n.stock?.[k] ?? 0;
    use[k] = Math.min(have, v);
    money += (v - use[k]) * CONS_RULES.moneyForMissing * premium;
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
  const def = world.cons.table[type], n = world.nations.get(nid);
  const price = { money: def.cost.money ?? 0, use: {} };
  for (const [k, v] of Object.entries(def.cost)) {
    if (k === "money") continue;
    if ((n.stock?.[k] ?? 0) < v) return { error: `needs ${v} ${k}` };
    price.use[k] = v;
  }
  if (!charge(n, price)) return { error: "not enough money" };
  const b = { id: world.cons.next++, type, owner: nid, anchor, plots: footprint(world, anchor, def.fp), state: "construction", progress: 0, civilian: false };
  world.cons.buildings.set(b.id, b);
  for (const i of b.plots) { world.cons.at[i] = b.id; world.dirty.add(i); }
  return b;
}

export function progressConstruction(world, dt) {
  for (const b of world.cons.buildings.values()) {
    if (b.state !== "construction") continue;
    b.progress += dt / world.cons.table[b.type].time;
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
  const rows = [];
  const add = (b, table, civilian) => {
    const def = table[b.type];
    if (b.owner !== nid || b.state !== "active" || !def.next) return;
    if (filter === "civilian" && !civilian) return;
    if (filter === "player" && civilian) return;
    if (category && (def.cat ?? def.zone) !== category) return;
    const chain = chainOf(table, b.type);
    rows.push({ id: b.id, civilian, type: b.type, next: def.next, level: chain.indexOf(b.type), chain: chain[0], era: def.era });
  };
  for (const b of world.cons.buildings.values()) add(b, world.cons.table, false);
  if (world.civ) for (const b of world.civ.buildings.values()) add(b, world.civ.table, true);
  rows.sort((a, b) => a.level - b.level || eraIdx(a.era) - eraIdx(b.era) || a.chain.localeCompare(b.chain) || a.id - b.id);
  return rows;
}

export function selectRange(rows, fromIndex, toIndex) {
  const [a, b] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  return rows.slice(Math.max(0, a), b + 1).map(r => ({ id: r.id, civilian: r.civilian }));
}

export function bulkUpgrade(world, nid, picks) {
  const n = world.nations.get(nid);
  const done = [], skipped = [];
  let spent = 0;
  for (const p of picks) {
    const store = p.civilian ? world.civ : world.cons;
    const b = store?.buildings.get(p.id);
    if (!b || b.owner !== nid || b.state !== "active") { skipped.push([p.id, "not available"]); continue; }
    const table = store.table, next = table[b.type].next;
    if (!next) { skipped.push([p.id, "already top level"]); continue; }
    const nd = table[next];
    if (eraIdx(nd.era) > eraIdx(n.era ?? "T")) { skipped.push([p.id, "era locked"]); continue; }
    const plots = footprint(world, b.anchor, nd.fp);
    let bad = !plots;
    if (!bad && p.civilian) bad = plots.some(i => world.owner[i] !== nid || (world.civ.bld[i] && world.civ.bld[i] !== b.id) || world.cons.at[i] || world.civ.zone[i] !== world.civ.zone[b.anchor]);
    if (!bad && !p.civilian) bad = !!canPlace(world, nid, next, b.anchor, b.id);
    if (bad) { skipped.push([p.id, "no room to grow"]); continue; }
    const price = priceOf(nd.cost, n, CONS_RULES.instantPremium);
    if (!charge(n, price)) { skipped.push([p.id, "not enough money"]); continue; }
    spent += price.money;
    if (p.civilian) { for (const i of plots) world.civ.bld[i] = b.id; }
    else { for (const i of plots) world.cons.at[i] = b.id; }
    b.type = next; b.plots = plots;
    for (const i of plots) world.dirty.add(i);
    done.push(b.id);
  }
  return { done, skipped, spent };
}
