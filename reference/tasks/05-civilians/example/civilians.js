import { TERRAIN } from "../../../shared/terrain.js";

export const ERA_ORDER = ["T", "M", "G", "I", "Mo", "F"];
export const ZONES = { none: 0, res: 1, com: 2, ind: 3, farm: 4 };

export const CIVIL = {
  hut_grass: { zone: "res", era: "T", fp: [1, 1], housing: 6, cost: { wood: 4 }, time: 20, next: "cottage_timber" },
  cottage_timber: { zone: "res", era: "M", fp: [1, 1], housing: 14, cost: { wood: 12 }, time: 40, next: "house_brick" },
  house_brick: { zone: "res", era: "G", fp: [1, 1], housing: 24, cost: { wood: 6, clay: 20 }, time: 60, next: "tenement" },
  tenement: { zone: "res", era: "I", fp: [1, 1], housing: 60, cost: { clay: 30, steel: 5 }, time: 90, next: "apartment_block" },
  apartment_block: { zone: "res", era: "Mo", fp: [2, 2], housing: 400, cost: { steel: 40, concrete: 80 }, time: 180, next: "eco_tower" },
  eco_tower: { zone: "res", era: "F", fp: [2, 2], housing: 900, cost: { steel: 80, concrete: 120 }, time: 240, next: null },
  market_stall: { zone: "com", era: "T", fp: [1, 1], jobs: 3, goods: 0.02, cost: { wood: 3 }, time: 15, next: "bakery" },
  bakery: { zone: "com", era: "M", fp: [1, 1], jobs: 6, goods: 0.05, cost: { wood: 10 }, time: 40, next: "general_store" },
  general_store: { zone: "com", era: "G", fp: [1, 1], jobs: 10, goods: 0.1, cost: { wood: 10, clay: 10 }, time: 60, next: "shop" },
  shop: { zone: "com", era: "I", fp: [1, 1], jobs: 16, goods: 0.2, cost: { clay: 20, steel: 4 }, time: 80, next: "cafe" },
  cafe: { zone: "com", era: "Mo", fp: [1, 1], jobs: 20, goods: 0.3, cost: { concrete: 20 }, time: 90, next: null },
  forge: { zone: "ind", era: "M", fp: [1, 1], jobs: 8, makes: { goods: 0.06 }, cost: { wood: 10, stone: 10 }, time: 50, next: "foundry" },
  foundry: { zone: "ind", era: "G", fp: [2, 1], jobs: 24, makes: { goods: 0.2 }, cost: { stone: 30, clay: 20 }, time: 90, next: "factory_early" },
  factory_early: { zone: "ind", era: "I", fp: [2, 2], jobs: 80, makes: { goods: 0.8 }, cost: { clay: 60, steel: 20 }, time: 150, next: "factory_modern" },
  factory_modern: { zone: "ind", era: "Mo", fp: [2, 2], jobs: 120, makes: { goods: 1.6 }, cost: { steel: 60, concrete: 60 }, time: 180, next: null },
};

export const CIV_RULES = {
  econEvery: 5,
  growth: 0.02,
  foodPerPerson: 0.002,
  goodsPerPerson: 0.0004,
  workerShare: 0.5,
  comPerPerson: 0.08,
  indPerPerson: 0.15,
  buildTriesPerTick: 6,
  upgradeChance: 0.03,
  conscriptShare: 0.35,
  conscriptCost: 0.25,
  startResidents: 3,
};

const eraIdx = e => ERA_ORDER.indexOf(e);

export function installCivilians(world, rng, rules = CIV_RULES, table = CIVIL) {
  const size = world.grid.size;
  const civ = {
    zone: new Uint8Array(size),
    bld: new Int32Array(size).fill(0),
    buildings: new Map(),
    nextB: 1,
    rules,
    table,
    clock: 0,
  };
  world.civ = civ;
  for (const n of world.nations.values()) initNation(n);
  const baseMax = world.maxTroops.bind(world);
  world.maxTroops = n => (n.pop === undefined ? baseMax(n) : world.rules.troopBase * 0.2 + n.pop * rules.conscriptShare);
  world.hooks.postTick.push((w, dt) => {
    civ.clock += dt;
    while (civ.clock >= rules.econEvery) {
      civ.clock -= rules.econEvery;
      econTick(w, rules.econEvery, rng);
    }
  });
  return civ;
}

export function initNation(n) {
  n.era ??= "T";
  n.pop ??= 0;
  n.stock ??= { food: 50, wood: 40, stone: 0, clay: 0, steel: 0, concrete: 0, goods: 0 };
  n.stats ??= {};
}

export function zonePlots(world, nid, plots, zone) {
  let n = 0;
  for (const i of plots) {
    if (world.owner[i] !== nid || !TERRAIN[world.terrain[i]].build) continue;
    world.civ.zone[i] = ZONES[zone];
    n++;
  }
  return n;
}

export function footprint(world, anchor, fp) {
  const g = world.grid, x0 = g.x(anchor), y0 = g.y(anchor), out = [];
  for (let dy = 0; dy < fp[1]; dy++)
    for (let dx = 0; dx < fp[0]; dx++) {
      if (!g.inside(x0 + dx, y0 + dy)) return null;
      out.push(g.idx(x0 + dx, y0 + dy));
    }
  return out;
}

function fits(world, nid, plots, zone, self = 0) {
  const civ = world.civ;
  return plots && plots.every(i => world.owner[i] === nid && civ.zone[i] === ZONES[zone] && TERRAIN[world.terrain[i]].build && (civ.bld[i] === 0 || civ.bld[i] === self));
}

function affordable(n, cost) { return Object.entries(cost).every(([k, v]) => (n.stock[k] ?? 0) >= v); }
function pay(n, cost) { for (const [k, v] of Object.entries(cost)) n.stock[k] -= v; }

export function bestTypeFor(zone, era, table = CIVIL) {
  let best = null;
  for (const [id, b] of Object.entries(table)) {
    if (b.zone !== zone || eraIdx(b.era) > eraIdx(era)) continue;
    if (!best || eraIdx(b.era) > eraIdx(table[best].era)) best = id;
  }
  return best;
}

export function startBuilding(world, nid, anchor, type) {
  const civ = world.civ, def = civ.table[type], n = world.nations.get(nid);
  const plots = footprint(world, anchor, def.fp);
  if (!fits(world, nid, plots, def.zone) || !affordable(n, def.cost)) return null;
  pay(n, def.cost);
  const b = { id: civ.nextB++, type, owner: nid, anchor, plots, state: "construction", progress: 0, residents: 0, civilian: true };
  civ.buildings.set(b.id, b);
  for (const i of plots) { civ.bld[i] = b.id; world.dirty.add(i); }
  world.emit("civ_build", { nation: nid, building: b.id, type });
  return b;
}

export function tryUpgrade(world, b, force = false) {
  const civ = world.civ, def = civ.table[b.type], n = world.nations.get(b.owner);
  if (!def.next || b.state !== "active") return false;
  const nd = civ.table[def.next];
  if (eraIdx(nd.era) > eraIdx(n.era) || !affordable(n, nd.cost)) return false;
  const plots = footprint(world, b.anchor, nd.fp);
  if (!fits(world, b.owner, plots, nd.zone, b.id)) return false;
  if (!force) {
    const occ = def.housing ? b.residents / def.housing : 1;
    if (occ < 0.9 || (n.stats.needs ?? 0) < 0.8) return false;
  }
  pay(n, nd.cost);
  for (const i of plots) civ.bld[i] = b.id;
  b.type = def.next;
  b.plots = plots;
  b.state = "construction";
  b.progress = 0;
  b.upgrading = true;
  world.emit("civ_upgrade", { building: b.id, to: b.type });
  return true;
}

export function nationTotals(world) {
  const civ = world.civ, t = new Map();
  for (const n of world.nations.values()) t.set(n.id, { pop: 0, housing: 0, jobs: 0, comJobs: 0, indJobs: 0, goodsMade: 0, shops: 0 });
  for (const b of civ.buildings.values()) {
    const s = t.get(b.owner);
    if (!s) continue;
    const d = civ.table[b.type];
    s.pop += b.residents;
    if (b.state !== "active") continue;
    s.housing += d.housing ?? 0;
    if (d.zone === "com") { s.comJobs += d.jobs; s.shops += d.goods ?? 0; }
    if (d.zone === "ind") { s.indJobs += d.jobs; s.goodsMade += d.makes?.goods ?? 0; }
    s.jobs += d.jobs ?? 0;
  }
  return t;
}

export function econTick(world, dt, rng) {
  const civ = world.civ, r = civ.rules;
  for (const b of civ.buildings.values()) {
    if (b.state !== "construction") continue;
    b.progress += dt / civ.table[b.type].time;
    if (b.progress >= 1) {
      b.state = "active";
      b.upgrading = false;
      for (const i of b.plots) world.dirty.add(i);
      if (civ.table[b.type].housing && b.residents === 0) b.residents = r.startResidents;
    }
  }
  const totals = nationTotals(world);
  const free = new Map();
  for (let i = 0; i < world.grid.size; i++) {
    const z = civ.zone[i];
    if (!z || civ.bld[i] !== 0 || !world.owner[i]) continue;
    const o = world.owner[i];
    if (!free.has(o)) free.set(o, [[], [], [], [], []]);
    free.get(o)[z].push(i);
  }
  for (const n of world.nations.values()) {
    if (!n.alive) continue;
    initNation(n);
    const s = totals.get(n.id);
    const workers = s.pop * r.workerShare;
    const foodNeed = s.pop * r.foodPerPerson * dt;
    const foodSat = foodNeed > 0 ? Math.min(1, n.stock.food / foodNeed) : 1;
    n.stock.food = Math.max(0, n.stock.food - foodNeed);
    const jobSat = workers > 0 ? Math.min(1, s.jobs / workers) : 1;
    const worked = workers > 0 ? Math.min(1, workers / Math.max(1, s.jobs)) : 0;
    n.stock.goods += s.goodsMade * worked * dt;
    const goodsNeed = n.era === "T" ? 0 : s.pop * r.goodsPerPerson * dt;
    const goodsSat = goodsNeed > 0 ? Math.min(1, n.stock.goods / goodsNeed) : 1;
    n.stock.goods = Math.max(0, n.stock.goods - goodsNeed);
    const needs = foodSat * (0.6 + 0.4 * jobSat) * (0.8 + 0.2 * goodsSat);
    n.stats = { ...s, workers, foodSat, jobSat, goodsSat, needs };
    let pop = 0;
    for (const b of civ.buildings.values()) {
      if (b.owner !== n.id) continue;
      const cap = civ.table[b.type].housing;
      if (!cap || b.state !== "active") { pop += b.residents; continue; }
      const target = cap * needs;
      b.residents += (target - b.residents) * Math.min(1, r.growth * dt);
      if (foodSat < 1) b.residents *= 1 - (1 - foodSat) * 0.02 * dt;
      b.residents = Math.max(0, Math.min(cap, b.residents));
      pop += b.residents;
    }
    n.pop = pop;
    const demand = {
      res: s.housing === 0 || s.pop / Math.max(1, s.housing) > 0.75 ? 1 : 0,
      com: s.pop * r.comPerPerson - s.comJobs,
      ind: n.era === "T" ? 0 : s.pop * r.indPerPerson - s.indJobs,
    };
    n.stats.demand = demand;
    for (const zone of ["res", "com", "ind"]) {
      if (demand[zone] <= 0) continue;
      const type = bestTypeFor(zone, n.era, civ.table);
      if (!type) continue;
      const candidates = free.get(n.id)?.[ZONES[zone]] ?? [];
      for (let k = 0; k < r.buildTriesPerTick && candidates.length; k++) {
        const at = candidates.splice(Math.floor(rng.next() * candidates.length), 1)[0];
        if (startBuilding(world, n.id, at, type)) break;
      }
    }
    for (const b of civ.buildings.values()) if (b.owner === n.id && rng.chance(r.upgradeChance * dt / r.econEvery)) tryUpgrade(world, b);
  }
}

export function conscript(world, nid, amount) {
  const n = world.nations.get(nid), civ = world.civ;
  const cost = amount * civ.rules.conscriptCost;
  if (n.pop < cost) return false;
  const share = cost / n.pop;
  for (const b of civ.buildings.values()) if (b.owner === nid) b.residents *= 1 - share;
  n.pop -= cost;
  n.troops += amount;
  return true;
}
