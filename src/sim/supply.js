import rules from "../../data/rules.json" with { type: "json" };
import { supplyCostOf, reachMap } from "../shared/supply.js";
import { nationBuildings } from "./buildings.js";
import { storesOf as storeList, sync, takeFrom, putNear } from "./stores.js";

export const SUPPLY = {
  range: 18, every: 3, carrySeconds: 600, lowSeconds: 60, weakenSeconds: 120, minMult: 0.5, desertPerSec: 0.0005,
  wagonRadius: 3, wagonMax: 500, wagonCrew: 20, feedPerTroop: 0.0005, storeReach: 2, followEvery: 2, perTick: 2, ...rules.supply,
};

export function installSupply(world, { scale = 1, rules: r = SUPPLY } = {}) {
  const sup = { rules: r, scale, follow: 0, clocks: new Map(), fields: new Map() };
  world.supply = sup;
  const power = world.powerOf, attack = world.stackAttack.bind(world), full = r.carrySeconds;
  if (power) world.powerOf = (s, holding) => power(s, holding) * (s.supplyMult ?? 1);
  world.stackAttack = s => attack(s) * (power && (s.mix || s.xp) ? 1 : s.supplyMult ?? 1);
  const split = world.splitStack.bind(world), merge = world.mergeStacks.bind(world);
  world.splitStack = (sid, amount) => {
    const s = world.stacks.get(sid), c = split(sid, amount);
    if (c && s) Object.assign(c, { carry: s.carry, outFor: s.outFor, supplyMult: s.supplyMult });
    return c;
  };
  world.mergeStacks = (a, b) => {
    const A = world.stacks.get(a), B = world.stacks.get(b);
    const worst = { carry: Math.min(A?.carry ?? full, B?.carry ?? full), outFor: Math.max(A?.outFor ?? 0, B?.outFor ?? 0), supplyMult: Math.min(A?.supplyMult ?? 1, B?.supplyMult ?? 1) };
    const ok = merge(a, b);
    if (ok) Object.assign(world.stacks.get(a) ?? {}, worst);
    return ok;
  };
  const tick = (w, dt) => {
    sup.follow += dt;
    if (sup.follow >= r.followEvery) { sup.follow = 0; followWagons(w); }
    const due = [];
    for (const n of w.nations.values()) {
      if (!n.human || !n.alive) continue;
      const t = (sup.clocks.get(n.id) ?? 0) + dt;
      sup.clocks.set(n.id, t);
      if (t >= r.every) due.push(n.id);
    }
    if (!due.length) return;
    due.sort((a, b) => sup.clocks.get(b) - sup.clocks.get(a));
    const turn = new Set(due.slice(0, r.perTick)), byOwner = playerStacks(w, turn);
    for (const nid of turn) {
      supplyNation(w, nid, byOwner.get(nid) ?? [], sup.clocks.get(nid));
      sup.clocks.set(nid, 0);
    }
  };
  tick.live = true;
  world.hooks.postTick.push(tick);
  return sup;
}

export const isWagon = s => s?.kind === "supply";

export function storesOf(world, nid) {
  const out = [];
  for (const b of nationBuildings(world, nid)) if (b.state === "active" && world.bld.table[b.type]?.store) out.push(b);
  return out;
}

const viewOf = world => ({ terrain: world.terrain, owner: world.owner, road: world.log?.road });

export function supplyCost(world, nid) {
  return supplyCostOf(viewOf(world), nid, (a, b) => world.passable(a, b));
}

export function reachOf(world, n) {
  if (!((n.stock?.food ?? 0) > 0)) return new Map();
  const held = world.stores ? storeList(world, n.id).filter(s => !s.camp && (s.goods.food ?? 0) >= 1) : storesOf(world, n.id);
  const sources = held.map(b => b.anchor).filter(i => i != null && world.owner[i] === n.id);
  if (n.capital != null && world.owner[n.capital] === n.id) sources.push(n.capital);
  const sup = world.supply;
  return reachMap(world.grid, viewOf(world), n.id, sources, sup.rules.range * sup.scale, (a, b) => world.passable(a, b));
}

function playerStacks(world, only = null) {
  const byOwner = new Map();
  for (const s of world.stacks.values()) {
    if (only ? !only.has(s.owner) : !world.nations.get(s.owner)?.human) continue;
    let list = byOwner.get(s.owner);
    if (!list) byOwner.set(s.owner, (list = []));
    list.push(s);
  }
  return byOwner;
}

export function supplyTick(world, dt) {
  for (const [nid, list] of playerStacks(world)) supplyNation(world, nid, list, dt);
}

function supplyNation(world, nid, list, dt) {
  const sup = world.supply, r = sup.rules, g = world.grid, radius = Math.round(r.wagonRadius * sup.scale);
  const field = reachOf(world, world.nations.get(nid));
  sup.fields.set(nid, field);
  const wagons = list.filter(s => isWagon(s) && s.supplies > 0);
  for (const s of list) {
    if (isWagon(s)) continue;
    let fed = field.has(s.pos);
    for (let k = 0; !fed && k < wagons.length; k++) {
      const w = wagons[k];
      if (w.supplies <= 0 || g.cheb(w.pos, s.pos) > radius) continue;
      w.supplies = Math.max(0, w.supplies - s.troops * r.feedPerTroop * dt);
      if (w.supplies <= 0) world.emit("wagon_empty", { stack: w.id, nation: nid, at: w.pos });
      fed = true;
    }
    if (fed) {
      if (s.outFor) world.emit("resupplied", { stack: s.id, nation: nid, at: s.pos });
      s.carry = r.carrySeconds;
      s.outFor = 0;
      s.supplyMult = 1;
      continue;
    }
    const had = s.carry ?? r.carrySeconds;
    s.carry = Math.max(0, had - dt);
    if (had > r.lowSeconds && s.carry <= r.lowSeconds) world.emit("supplies_low", { stack: s.id, nation: nid, at: s.pos, left: s.carry });
    if (s.carry > 0) continue;
    if (!s.outFor) world.emit("out_of_supply", { stack: s.id, nation: nid, at: s.pos });
    s.outFor = (s.outFor ?? 0) + dt;
    s.supplyMult = Math.max(r.minMult, 1 - ((1 - r.minMult) * s.outFor) / r.weakenSeconds);
    const gone = s.troops * r.desertPerSec * ((1 - s.supplyMult) / (1 - r.minMult)) * dt;
    if (gone > 0) world.loseTroops(s, gone);
    if (s.troops < 1) { world.stacks.delete(s.id); world.emit("stack_destroyed", { stack: s.id, nation: nid, why: "supply" }); }
  }
}

function followWagons(world) {
  const g = world.grid, radius = Math.max(1, Math.round((world.supply.rules.wagonRadius - 1) * world.supply.scale));
  for (const s of world.stacks.values()) {
    if (!isWagon(s) || !s.follow) continue;
    const t = world.stacks.get(s.follow);
    if (!t || t.owner !== s.owner) { s.follow = null; continue; }
    if (g.cheb(s.pos, t.pos) <= radius) continue;
    const end = s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : null);
    if (end !== null && g.cheb(end, t.pos) <= radius) continue;
    world.orderMove(s.id, t.pos, "move");
  }
}

export function formWagon(world, nid, at, food) {
  const n = world.nations.get(nid), r = world.supply.rules;
  if (!Number.isFinite(food) || food < 1) return { error: "load some food onto the wagon" };
  const load = Math.min(Math.floor(food), r.wagonMax);
  if (world.stores) sync(world, n);
  if ((n.stock?.food ?? 0) < load) return { error: `you have only ${Math.floor(n.stock?.food ?? 0)} food` };
  const reach = Math.round(r.storeReach * world.supply.scale), g = world.grid;
  const atCapital = n.capital != null && world.owner[n.capital] === nid && g.cheb(n.capital, at) <= reach;
  let src = null;
  if (world.stores) {
    const list = storeList(world, nid), near = list.filter(s => s.plots.some(p => g.cheb(p, at) <= reach));
    if (!near.length && atCapital) near.push(...list.filter(s => s.anchor != null).sort((a, b) => g.dist(a.anchor, n.capital) - g.dist(b.anchor, n.capital)).slice(0, 1));
    src = near.sort((a, b) => (b.goods.food ?? 0) - (a.goods.food ?? 0))[0] ?? null;
    if (!src) return { error: "supply wagons are loaded at your capital or a store: your seat of government, a storage yard or a port" };
    if ((src.goods.food ?? 0) < load) return { error: `that store holds only ${Math.floor(src.goods.food ?? 0)} food` };
  } else if (!atCapital && !storesOf(world, nid).some(b => b.plots.some(p => g.cheb(p, at) <= reach))) return { error: "supply wagons are loaded at your capital or a store: your seat of government, a storage yard or a port" };
  if (world.owner[at] !== nid) return { error: "form the wagon on your own land" };
  if ((n.troops ?? 0) < r.wagonCrew + 1) return { error: `a wagon needs ${r.wagonCrew} troops to drive it` };
  const s = world.createStack(nid, at, r.wagonCrew);
  if (!s) return { error: "could not form the wagon there" };
  s.kind = "supply";
  s.supplies = load;
  if (src) takeFrom(world, n, src, "food", load);
  else n.stock.food -= load;
  return { stack: s.id, food: load };
}

export function unloadWagon(world, s) {
  if (!isWagon(s) || !(s.supplies > 0)) return 0;
  const n = world.nations.get(s.owner), back = s.supplies;
  if (world.stores) { sync(world, n); putNear(world, { owner: s.owner, anchor: s.pos, plots: [s.pos] }, "food", back); }
  else n.stock.food = (n.stock.food ?? 0) + back;
  s.supplies = 0;
  return back;
}

export function supplyView(world, n) {
  const sup = world.supply;
  if (!sup || !n) return null;
  const out = [];
  for (const s of world.stacks.values()) {
    if (s.owner !== n.id || isWagon(s)) continue;
    const carry = s.carry ?? sup.rules.carrySeconds;
    if (carry >= sup.rules.carrySeconds && (s.supplyMult ?? 1) >= 1) continue;
    out.push([s.id, Math.round(carry), Math.round((s.supplyMult ?? 1) * 100)]);
  }
  return { stacks: out, carry: sup.rules.carrySeconds, range: sup.rules.range * sup.scale, radius: Math.round(sup.rules.wagonRadius * sup.scale), wagonMax: sup.rules.wagonMax, crew: sup.rules.wagonCrew };
}
