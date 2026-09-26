import { effectOf } from "./effects.js";
import { TERRAIN } from "../shared/terrain.js";
import { ERA_ORDER, ZONES, BUILDINGS, installBuildings, footprint, addBuilding, setPlots, nationBuildings, touched } from "./buildings.js";
import rules from "../../data/rules.json" with { type: "json" };

export { ERA_ORDER, ZONES, footprint };

export const CIVIL = Object.fromEntries(Object.entries(BUILDINGS.table).filter(([, d]) => d.civilian));
export const ZONE_NAMES = Object.keys(ZONES);

export const CIV_RULES = rules.civilians;
export const POLICY = rules.policy;

const eraIdx = e => ERA_ORDER.indexOf(e);

export function installCivilians(world, rng, cfg = CIV_RULES) {
  const bld = installBuildings(world);
  const r = { ...CIV_RULES, ...cfg };
  const civ = { zone: bld.zone, rules: r, table: bld.table, clock: 0, zoned: new Map(), zoneNews: new Set() };
  world.civ = civ;
  for (let i = 0; i < bld.zone.length; i++) if (bld.zone[i] && world.owner[i]) zonedOf(civ, world.owner[i])[bld.zone[i]].add(i);
  for (const n of world.nations.values()) if (n.human) initNation(n, r);
  const claim = world.claim;
  world.claim = function (i, nid) {
    const old = this.owner[i], z = bld.zone[i];
    claim.call(this, i, nid);
    if (!z || old === nid) return;
    if (old) civ.zoned.get(old)?.[z].delete(i);
    if (nid) zonedOf(civ, nid)[z].add(i);
  };
  const baseMax = world.maxTroops.bind(world);
  world.maxTroops = n => (baseMax(n) + (n.pop ?? 0) * (n.conscription ?? r.conscriptShare)) * (1 + effectOf(world, n, "troop_cap"));
  const tick = (w, dt) => {
    civ.clock += dt;
    while (civ.clock >= r.econEvery) {
      civ.clock -= r.econEvery;
      econTick(w, r.econEvery, rng);
    }
  };
  tick.whole = (w, dt) => econTick(w, dt, rng);
  world.hooks.postTick.push(tick);
  return civ;
}

function zonedOf(civ, nid) {
  let sets = civ.zoned.get(nid);
  if (!sets) civ.zoned.set(nid, (sets = ZONE_NAMES.map(() => new Set())));
  return sets;
}

export function initNation(n, r = CIV_RULES) {
  n.era ??= "T";
  n.pop ??= 0;
  n.stock ??= { ...r.startStock };
  n.stats ??= {};
}

export function zonePlots(world, nid, plots, zone) {
  const code = ZONES[zone], bld = world.bld, civ = world.civ;
  if (code === undefined) return 0;
  let n = 0;
  for (const i of plots) {
    if (world.owner[i] !== nid || bld.zone[i] === code) continue;
    if (code && !TERRAIN[world.terrain[i]].build) continue;
    if (civ && bld.zone[i]) civ.zoned.get(nid)?.[bld.zone[i]].delete(i);
    bld.zone[i] = code;
    if (civ && code) zonedOf(civ, nid)[code].add(i);
    civ?.zoneNews.add(i);
    n++;
  }
  if (n) bld.changed.add("zone");
  return n;
}

export function takeZoneNews(world) {
  const civ = world.civ;
  if (!civ?.zoneNews.size) return null;
  const out = new Uint32Array(civ.zoneNews.size * 2);
  let k = 0;
  for (const i of civ.zoneNews) { out[k++] = i; out[k++] = world.bld.zone[i]; }
  civ.zoneNews.clear();
  return out;
}

function fits(world, nid, plots, zone, self = 0) {
  const bld = world.bld;
  return plots && plots.every(i => {
    const id = bld.at.get(i);
    return world.owner[i] === nid && bld.zone[i] === ZONES[zone] && TERRAIN[world.terrain[i]].build && (id === undefined || id === self);
  });
}

function affordable(n, cost) { return Object.entries(cost).every(([k, v]) => (n.stock[k] ?? 0) >= v); }
function pay(n, cost) { for (const [k, v] of Object.entries(cost)) n.stock[k] -= v; }

export function bestTypeFor(zone, era, table = CIVIL, allowed = () => true) {
  let best = null;
  for (const [id, b] of Object.entries(table)) {
    if (!b.civilian || b.zone !== zone || eraIdx(b.era) > eraIdx(era) || !allowed(id)) continue;
    if (!best || eraIdx(b.era) > eraIdx(table[best].era)) best = id;
  }
  return best;
}

export function startBuilding(world, nid, anchor, type) {
  const def = world.bld.table[type], n = world.nations.get(nid);
  const plots = footprint(world, anchor, def.fp);
  if (!fits(world, nid, plots, def.zone) || !affordable(n, def.cost)) return null;
  pay(n, def.cost);
  const b = addBuilding(world, { type, owner: nid, anchor, plots });
  world.emit("civ_build", { nation: nid, building: b.id, kind: type });
  return b;
}

export function tryUpgrade(world, b, force = false) {
  const table = world.bld.table, r = world.civ?.rules ?? CIV_RULES, def = table[b.type], n = world.nations.get(b.owner);
  if (!def.next || b.state !== "active") return false;
  const nd = table[def.next];
  if (eraIdx(nd.era) > eraIdx(n.era) || !affordable(n, nd.cost) || world.unlocked?.(b.owner, def.next) === false) return false;
  const plots = footprint(world, b.anchor, nd.fp);
  if (!fits(world, b.owner, plots, nd.zone, b.id)) return false;
  if (!force) {
    const needs = n.stats.needs ?? 0, occ = def.housing ? b.residents / def.housing : 1;
    if (needs < r.upgradeNeeds || occ < r.upgradeOccupancy * needs) return false;
  }
  pay(n, nd.cost);
  b.type = def.next;
  setPlots(world, b, plots);
  b.state = "construction";
  b.progress = 0;
  b.upgrading = true;
  world.emit("civ_upgrade", { nation: b.owner, building: b.id, to: b.type });
  return true;
}

export function nationTotals(world) {
  const table = world.bld.table, t = new Map();
  for (const n of world.nations.values()) t.set(n.id, { pop: 0, housing: 0, jobs: 0, comJobs: 0, indJobs: 0, goodsMade: 0, shops: 0 });
  for (const b of world.bld.list.values()) {
    const s = t.get(b.owner);
    if (!s) continue;
    const d = table[b.type];
    if (!b.civilian) {
      if (d.producer && b.state === "active") s.jobs += d.jobs ?? 0;
      continue;
    }
    s.pop += b.residents;
    if (b.state !== "active") continue;
    s.housing += d.housing ?? 0;
    if (d.zone === "com") { s.comJobs += d.jobs; s.shops += d.goods ?? 0; }
    if (d.zone === "ind") { s.indJobs += d.jobs; s.goodsMade += d.makes?.goods ?? 0; }
    s.jobs += d.jobs ?? 0;
  }
  return t;
}

function freePlots(world, nid, zone) {
  const set = world.civ?.zoned.get(nid)?.[ZONES[zone]];
  if (!set) return [];
  const bld = world.bld, out = [];
  for (const i of set) if (!bld.at.has(i) && world.owner[i] === nid && TERRAIN[world.terrain[i]].build) out.push(i);
  return out;
}

export function econTick(world, dt, rng) {
  const bld = world.bld, table = bld.table, r = world.civ?.rules ?? CIV_RULES, speed = world.cons?.rules.speed ?? 1;
  for (const b of bld.list.values()) {
    if (!b.civilian || b.state !== "construction") continue;
    b.progress += (dt * speed) / table[b.type].time;
    touched(world, b);
    if (b.progress >= 1) {
      b.state = "active";
      b.progress = 1;
      b.upgrading = false;
      if (table[b.type].housing && b.residents === 0) b.residents = r.startResidents;
    }
  }
  if (bld.list.size) bld.changed.add("buildings");
  const totals = nationTotals(world), rounds = Math.max(1, Math.round(dt / r.econEvery));
  for (const n of world.nations.values()) {
    if (!n.alive || !n.human) continue;
    initNation(n, r);
    const s = totals.get(n.id);
    const workers = s.pop * r.workerShare, level = n.taxLevel ?? 1;
    const mood = 1 - POLICY.taxUnrest * Math.max(0, level - 1);
    const staff = workers * Math.max(0, 1 - POLICY.conscriptWorkLoss * ((n.conscription ?? r.conscriptShare) - r.conscriptShare));
    const foodNeed = s.pop * r.foodPerPerson * dt;
    const foodSat = foodNeed > 0 ? Math.min(1, n.stock.food / foodNeed) : 1;
    const batch = n.made?.food ?? 0;
    const fed = (batch / (n.madeEvery ?? r.econEvery) + Math.max(0, n.stock.food - batch) / Math.max(r.foodReserveSeconds, dt)) / r.foodPerPerson;
    n.stock.food = Math.max(0, n.stock.food - foodNeed);
    const jobSat = workers > 0 ? Math.min(1, s.jobs / workers) : 1;
    const worked = workers > 0 ? Math.min(1, staff / Math.max(1, s.jobs)) : 0;
    n.stock.goods += s.goodsMade * worked * dt;
    const goodsNeed = n.era === "T" ? 0 : s.pop * r.goodsPerPerson * dt;
    const goodsSat = goodsNeed > 0 ? Math.min(1, n.stock.goods / goodsNeed) : 1;
    n.stock.goods = Math.max(0, n.stock.goods - goodsNeed);
    const needs = foodSat * (0.6 + 0.4 * jobSat) * (0.8 + 0.2 * goodsSat) * mood;
    const foodCap = s.housing * needs > fed ? fed / (s.housing * needs) : 1;
    const zoned = world.civ?.zoned.get(n.id)?.slice(1).map(set => set.size) ?? [0, 0, 0, 0];
    n.stats = { ...s, workers, staff, mood, worked, foodSat, jobSat, goodsSat, needs, foodUse: s.pop * r.foodPerPerson, fed, foodCap, zoned };
    let pop = 0;
    const span = Math.min(dt, r.settleStep ?? dt);
    const grow = 1 - Math.exp(-r.growth * (1 + effectOf(world, n, "pop_growth")) * (1 + POLICY.taxGrowth * Math.max(0, 1 - level)) * span), starve = Math.exp(-(1 - foodSat) * r.starveLoss * span);
    const mine = bld.mine.get(n.id) ?? [];
    for (const id of mine) {
      const b = bld.list.get(id);
      if (!b.civilian) continue;
      const cap = table[b.type].housing;
      if (!cap || b.state !== "active") { pop += b.residents; continue; }
      const target = cap * needs * foodCap;
      b.residents += (target - b.residents) * grow;
      b.residents *= starve;
      b.residents = Math.max(0, Math.min(cap, b.residents));
      pop += b.residents;
    }
    n.pop = pop;
    const demand = {
      res: s.housing === 0 || (needs > 0 && s.pop / s.housing > r.resDemandAt * needs) ? 1 : 0,
      com: s.pop * r.comPerPerson - s.comJobs,
      ind: n.era === "T" ? 0 : s.pop * r.indPerPerson - s.indJobs,
    };
    n.stats.demand = demand;
    for (const zone of ["res", "com", "ind"]) {
      if (demand[zone] <= 0) continue;
      const type = bestTypeFor(zone, n.era, table, id => world.unlocked?.(n.id, id) !== false);
      if (!type) continue;
      const candidates = freePlots(world, n.id, zone);
      for (let k = 0, started = 0; k < r.buildTriesPerTick * rounds && started < rounds && candidates.length; k++) {
        const at = candidates.splice(Math.floor(rng.next() * candidates.length), 1)[0];
        if (startBuilding(world, n.id, at, type)) started++;
      }
    }
    const upChance = r.upgradeChance * dt / r.econEvery;
    for (const id of mine) { const b = bld.list.get(id); if (b.civilian && rng.chance(upChance)) tryUpgrade(world, b); }
  }
}

export function conscript(world, nid, amount) {
  const n = world.nations.get(nid), r = world.civ?.rules ?? CIV_RULES;
  const cost = amount * r.conscriptCost;
  if (n.pop < cost) return false;
  const share = cost / n.pop;
  for (const b of nationBuildings(world, nid)) if (b.civilian) b.residents *= 1 - share;
  n.pop -= cost;
  n.troops += amount;
  return true;
}
