import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops, trainTick } from "../src/sim/troops.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, queueMachines, produce } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { installTrade, tripPay } from "../src/sim/trade.js";
import { ROAD_TYPES } from "../src/shared/roads.js";
import { TREE } from "../src/sim/research.js";
import { lockMap, planPath } from "../src/shared/research.js";
import { makeRng } from "../src/shared/rng.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };
import unitData from "../data/units.json" with { type: "json" };

const near = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;
const unit = id => unitData.units.find(u => u.id === id);

function field() {
  const W = 80, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installConstruction(w);
  installRoads(w, { rules: rules.roads });
  installResources(w, undefined, { rng: makeRng(3), hook: false });
  installMachines(w);
  installEffects(w);
  installTrade(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true });
  w.spawn(a, 3, 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), a);
  const n = w.nations.get(a);
  Object.assign(n, { troops: 3000, money: 50000, era: "I", pop: 0 });
  const hut = addBuilding(w, { type: "parliament", owner: a, anchor: g.idx(2, 8), state: "active", progress: 1 });
  w.events.length = 0;
  const put = (type, x, y, state = "active") => addBuilding(w, { type, owner: a, anchor: g.idx(x, y), state, progress: state === "active" ? 1 : 0 });
  return { w, g, a, n, hut, put };
}

test("Age of Industry needs ten Gunpowder nodes in all four branches, and each Industrial node unlocks what the plan names", () => {
  const era = TREE.nodes.find(t => t.id === "age_industry");
  assert.deepEqual([era.advances, era.need, era.requires], ["I", { nodes: 10, branches: 4 }, ["star_forts", "navigation", "schools", "courts"]]);
  const locks = lockMap(TREE), b = id => locks.buildings.get(id), u = id => locks.units.get(id);
  assert.deepEqual(["station_large", "oil_derrick", "factory_early", "textile_mill", "bunker", "vehicle_factory", "naval_dock", "university", "clinic", "tax_office", "parliament"].map(b),
    ["railways", "oil", "mass_production", "mass_production", "trench_warfare", "field_guns", "steam_navy", "universities", "medicine", "bureaucracy", "bureaucracy"]);
  assert.deepEqual(["rifleman", "machine_gunner", "mortar_team", "stormtrooper", "field_artillery", "early_tank", "steamship", "ironclad", "destroyer"].map(u),
    ["rifling", "machine_guns", "trench_warfare", "trench_warfare", "field_guns", "armour", "steam_navy", "steam_navy", "destroyers"]);
  const costs = TREE.nodes.filter(t => t.era === "I" && t.branch !== "era").map(t => t.cost);
  assert.ok(Math.min(...costs) === 440 && Math.max(...costs) === 960, `Industrial nodes cost 440 to 960: ${costs.join(" ")}`);
  const path = planPath(locks, new Set(TREE.nodes.filter(t => t.era !== "I" && t.id !== "age_industry").map(t => t.id)), "armour");
  assert.ok(path.includes("age_industry") && path.indexOf("age_industry") < path.indexOf("armour"), `the way to Armour goes through the era: ${path.join(", ")}`);
});

test("with gold the only currency the steel mill is retired, and Steelmaking gives income instead", () => {
  const { w, g, a } = field();
  assert.equal(canPlace(w, a, "steel_mill", g.idx(20, 8)), "no longer built: every cost is in gold now");
  assert.deepEqual(TREE.nodes.find(t => t.id === "steelmaking").unlocks, { buildings: [], effects: { income: 0.05 } });
  for (const d of unitData.units) assert.deepEqual(Object.keys(d.cost).filter(k => k !== "money"), [], `${d.id} costs gold only`);
});

test("universities, clinics, tax offices and bunkers change the numbers they name", () => {
  const { w, g, a, n, put } = field();
  for (let k = 0; k < 4; k++) put("university", 10 + 4 * k, 2);
  for (let k = 0; k < 2; k++) put("clinic", 10 + 2 * k, 5);
  for (let k = 0; k < 6; k++) put("tax_office", 10 + 2 * k, 7);
  put("bunker", 30, 14);
  w.refreshEffects();
  assert.ok(near(n.bfx.research, 0.36), `four universities count as three: ${n.bfx.research}`);
  assert.ok(near(n.bfx.pop_growth, 0.2));
  assert.ok(near(n.bfx.income, 0.25), "six tax offices count as five");
  assert.equal(w.fortAt(a, g.idx(33, 14)), 1.4);
  assert.equal(w.fortAt(a, g.idx(34, 14)), 1, "3 plots, no further");
});

test("riflemen train at the barracks for gold, and the new troops keep the plan's numbers", () => {
  const { w, g, n, put } = field();
  put("barracks", 8, 12);
  n.drill = { keep: { rifleman: 50 } };
  const money = n.money;
  trainTick(w, 60);
  assert.equal(Math.round(n.mix.rifleman), 50);
  assert.ok(near(money - n.money, 50 * unit("rifleman").cost.money, 1e-3), `${unit("rifleman").cost.money} gold each: ${money - n.money}`);
  const row = id => [unit(id).attack, unit(id).defence, unit(id).speed, unit(id).capture];
  assert.deepEqual(["rifleman", "machine_gunner", "mortar_team", "stormtrooper"].map(row), [[4.5, 4, 1, 1.3], [3, 7, 0.8, 0.8], [5, 3, 0.9, 1.4], [6, 3, 1.2, 1.8]]);
  const s = w.createStack(n.id, g.idx(10, 10), 100);
  s.mix = { rifleman: 100 };
  const m = w.createStack(n.id, g.idx(12, 10), 100);
  m.mix = { musketeer: 100 };
  assert.ok(near(w.powerOf(s, false) / w.powerOf(m, false), 4.5 / 3.5), "a rifleman attacks at 4.5 against a musketeer's 3.5");
});

test("a vehicle factory builds an early tank for gold, and waits when the gold runs out", () => {
  const { w, g, a, n, put } = field();
  const f = put("vehicle_factory", 8, 12);
  assert.ok(!queueMachines(w, a, f.id, "early_tank").error);
  const money = n.money;
  for (let k = 0; k < 200 && ![...w.units.list.values()].some(u => u.type === "early_tank"); k++) produce(w, 1);
  assert.ok([...w.units.list.values()].some(u => u.type === "early_tank" && u.owner === a), "the tank rolls out");
  assert.ok(near(money - n.money, unit("early_tank").cost.money), `${money - n.money} gold`);
  n.money = 0;
  queueMachines(w, a, f.id, "early_tank");
  produce(w, 1);
  assert.equal(w.machines.queues.get(f.id).why, "not enough gold");
});

test("rail needs Railways and costs 12 gold a plot; trains run between two stations joined by rail and earn gold for each trip", () => {
  const { w, g, a, n, put } = field();
  assert.equal(lockMap(TREE).buildings.get("rail"), "railways");
  const money = n.money;
  const r = runOrder(w, a, { t: "road", kind: "rail", via: [g.idx(13, 8), g.idx(39, 8)] });
  assert.ok(r.ok, r.error);
  assert.deepEqual([r.laid, money - n.money], [27, 27 * 12]);
  const A = put("station_large", 10, 8), B = put("station_large", 40, 8);
  w.tick(1.01);
  w.tick(1);
  const trains = [...w.trade.trains.values()];
  assert.equal(trains.length, 2, "each station sends a train to the other, one rail search a second");
  const rail = ROAD_TYPES.indexOf("rail"), ends = new Set([...A.plots, ...B.plots]);
  assert.ok(trains.every(c => c.path.every(i => w.log.road[i] === rail || ends.has(i))), "the trains keep to the rail");
  const pay = trains.reduce((s, c) => s + c.pay, 0), before = n.money;
  assert.ok(near(trains[0].pay, Math.round(tripPay(w, trains[0].path.length) * rules.trade.train.payMult * 10) / 10));
  for (let k = 0; k < 20 && w.trade.trains.size; k++) w.tick(1);
  assert.equal(w.trade.trains.size, 0, "both arrived");
  assert.ok(n.money - before >= pay - 1e-6, `they earned ${Math.round(n.money - before)} gold, the trips were worth ${pay}`);
  w.claim(g.idx(25, 8), w.addNation({ name: "C", human: true }));
  for (let k = 0; k < 40; k++) w.tick(1);
  assert.equal(w.trade.trains.size, 0, "rail cut by another nation stops the trains");
});
