import { placeError, costError, eraIdx } from "../shared/buildings.js";
import { ERA_ORDER, BUILDINGS, installBuildings, footprint, addBuilding, removeBuilding, setPlots, buildingAt, touched } from "./buildings.js";
import rules from "../../data/rules.json" with { type: "json" };

export { ERA_ORDER, footprint, buildingAt };

export const PLAYER_BUILDINGS = Object.fromEntries(Object.entries(BUILDINGS.table).filter(([, d]) => !d.civilian));

export const CONS_RULES = rules.construction;

export function installConstruction(world, cfg = {}) {
  const bld = installBuildings(world);
  const cons = { rules: { ...CONS_RULES, ...cfg }, table: bld.table, timers: new Set() };
  world.cons = cons;
  for (const b of bld.list.values()) if (timed(b)) cons.timers.add(b.id);
  world.hooks.postTick.push((w, dt) => progressConstruction(w, dt));
  return cons;
}

const timed = b => (!b.civilian && b.state === "construction") || b.state === "rubble";

export function placeView(world, nid = 0) {
  const bld = world.bld;
  return {
    lockOf: id => world.lockReason?.(nid, id) ?? null,
    w: world.grid.w, h: world.grid.h, terrain: world.terrain, owner: world.owner,
    occupant: i => { const id = bld.at.get(i); return id === undefined || bld.list.get(id).state === "rubble" ? 0 : id; },
    deposit: i => world.res?.depositAt(i) ?? null,
  };
}

export function canPlace(world, nid, type, anchor, self = 0) {
  return placeError(placeView(world, nid), world.nations.get(nid), world.bld.table[type], anchor, self);
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

function clearRubble(world, plots) {
  for (const i of plots) {
    const b = buildingAt(world, i);
    if (b?.state === "rubble") { world.cons?.timers.delete(b.id); removeBuilding(world, b.id); }
  }
}

export function place(world, nid, type, anchor) {
  const why = canPlace(world, nid, type, anchor);
  if (why) return { error: why };
  const def = world.bld.table[type], n = world.nations.get(nid);
  const short = costError(def, n);
  if (short) return { error: short };
  const use = Object.fromEntries(Object.entries(def.cost).filter(([k]) => k !== "money"));
  charge(n, { money: def.cost.money ?? 0, use });
  const plots = footprint(world, anchor, def.fp);
  clearRubble(world, plots);
  const b = addBuilding(world, { type, owner: nid, anchor, plots });
  world.cons?.timers.add(b.id);
  return b;
}

export function demolish(world, nid, id) {
  const b = world.bld.list.get(id);
  if (!b || b.owner !== nid) return { error: "not your building" };
  if (b.state === "rubble") return { error: "that is already rubble" };
  const n = world.nations.get(nid), r = world.cons?.rules ?? CONS_RULES;
  const share = b.state === "construction" ? r.refundOnCancel : r.demolishRefund;
  const refund = {};
  for (const [k, v] of Object.entries(world.bld.table[b.type].cost)) {
    const back = Math.floor(v * share);
    if (!back) continue;
    refund[k] = back;
    if (k === "money") n.money = (n.money ?? 0) + back;
    else { n.stock ??= {}; n.stock[k] = (n.stock[k] ?? 0) + back; }
  }
  b.state = "rubble";
  b.progress = 0;
  b.residents = 0;
  b.upgrading = false;
  touched(world, b);
  world.cons?.timers.add(b.id);
  world.emit("demolished", { nation: nid, building: b.id, kind: b.type });
  return { building: b.id, refund };
}

export function progressConstruction(world, dt) {
  const cons = world.cons, table = world.bld.table, r = cons?.rules ?? CONS_RULES, speed = r.speed ?? 1;
  const ids = cons ? cons.timers : [...world.bld.list.keys()];
  for (const id of ids) {
    const b = world.bld.list.get(id);
    if (!b || !timed(b)) { cons?.timers.delete(id); continue; }
    if (b.state === "rubble") {
      b.progress += (dt * speed) / r.rubbleSeconds;
      if (b.progress >= 1) { cons?.timers.delete(id); removeBuilding(world, id); }
      else world.bld.changed.add("buildings");
      continue;
    }
    b.progress += (dt * speed) / table[b.type].time;
    touched(world, b);
    if (b.progress >= 1) {
      b.state = "active";
      b.progress = 1;
      cons?.timers.delete(id);
      world.emit("built", { nation: b.owner, building: b.id, kind: b.type });
    }
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
  const n = world.nations.get(nid), bld = world.bld, table = bld.table, view = placeView(world, nid);
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
    const locked = world.lockReason?.(nid, next);
    if (locked) { skipped.push([p.id, locked]); continue; }
    const plots = footprint(world, b.anchor, nd.fp);
    let bad = !plots;
    if (!bad && b.civilian) bad = plots.some(i => { const o = view.occupant(i); return world.owner[i] !== nid || (o && o !== b.id) || bld.zone[i] !== bld.zone[b.anchor]; });
    if (!bad && !b.civilian) bad = !!canPlace(world, nid, next, b.anchor, b.id);
    if (bad) { skipped.push([p.id, "no room to grow"]); continue; }
    const price = priceOf(nd.cost, n, premium, world.cons?.rules);
    if (!charge(n, price)) { skipped.push([p.id, "not enough money"]); continue; }
    spent += price.money;
    b.type = next;
    clearRubble(world, plots);
    setPlots(world, b, plots);
    done.push(b.id);
  }
  return { done, skipped, spent };
}
