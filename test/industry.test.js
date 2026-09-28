import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops, trainTick } from "../src/sim/troops.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installResources, productionTick } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, queueMachines, produce } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { installStores, sync, putInto, storesTick, logisticsView, STORE_RULES } from "../src/sim/stores.js";
import { TREE } from "../src/sim/research.js";
import { lockMap, planPath } from "../src/shared/research.js";
import { makeRng } from "../src/shared/rng.js";
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
  installStores(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true });
  w.spawn(a, 3, 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), a);
  const n = w.nations.get(a);
  Object.assign(n, { troops: 3000, money: 50000, era: "I", pop: 0, stock: { food: 500, iron: 100, coal: 150, steel: 200, oil: 100 } });
  const hut = addBuilding(w, { type: "parliament", owner: a, anchor: g.idx(2, 8), state: "active", progress: 1 });
  sync(w, n);
  w.events.length = 0;
  const put = (type, x, y, state = "active") => addBuilding(w, { type, owner: a, anchor: g.idx(x, y), state, progress: state === "active" ? 1 : 0 });
  return { w, g, a, n, hut, put };
}

test("Age of Industry needs ten Gunpowder nodes in all four branches, and each Industrial node unlocks what the plan names", () => {
  const era = TREE.nodes.find(t => t.id === "age_industry");
  assert.deepEqual([era.advances, era.need, era.requires], ["I", { nodes: 10, branches: 4 }, ["star_forts", "navigation", "schools", "courts"]]);
  const locks = lockMap(TREE), b = id => locks.buildings.get(id), u = id => locks.units.get(id);
  assert.deepEqual(["steel_mill", "station_large", "oil_derrick", "factory_early", "textile_mill", "bunker", "vehicle_factory", "naval_dock", "university", "clinic", "tax_office", "parliament"].map(b),
    ["steelmaking", "railways", "oil", "mass_production", "mass_production", "trench_warfare", "field_guns", "steam_navy", "universities", "medicine", "bureaucracy", "bureaucracy"]);
  assert.deepEqual(["rifleman", "machine_gunner", "mortar_team", "stormtrooper", "field_artillery", "early_tank", "steamship", "ironclad", "destroyer"].map(u),
    ["rifling", "machine_guns", "trench_warfare", "trench_warfare", "field_guns", "armour", "steam_navy", "steam_navy", "destroyers"]);
  const costs = TREE.nodes.filter(t => t.era === "I").map(t => t.cost);
  assert.ok(Math.min(...costs) === 440 && Math.max(...costs) === 960, `Industrial nodes cost 440 to 960: ${costs.join(" ")}`);
  const path = planPath(locks, new Set(TREE.nodes.filter(t => t.era !== "I" && t.id !== "age_industry").map(t => t.id)), "armour");
  assert.ok(path.includes("age_industry") && path.indexOf("age_industry") < path.indexOf("armour"), `the way to Armour goes through the era: ${path.join(", ")}`);
});

test("a steel mill turns 1 iron and 1.5 coal from its store into 1 steel, and says what it waits for when an input runs out", () => {
  const { w, g, a, n, hut, put } = field();
  const mill = put("steel_mill", 6, 8);
  const steel = hut.goods.steel;
  productionTick(w, 10);
  assert.ok(near(hut.goods.steel - steel, 2), `0.2 steel a second: ${hut.goods.steel - steel}`);
  assert.ok(near(hut.goods.iron, 98) && near(hut.goods.coal, 147));
  assert.ok(near(n.stock.steel, 202), "the nation's stock follows the store");
  hut.goods.coal = 0;
  sync(w, n);
  productionTick(w, 10);
  assert.ok(near(hut.goods.steel - steel, 2), "no coal, no steel");
  assert.deepEqual(logisticsView(w, n).stuck, [[mill.id, "short:coal"]]);
  assert.ok(w.stores.asks.get(`${hut.id}:coal`)?.amount >= 1.5 * 0.2 * 60, "its store asks for a minute of coal");
  const yard = put("warehouse", 40, 8);
  w.stores.rescan = true;
  sync(w, n);
  putInto(w, n, yard, "coal", 100);
  storesTick(w, STORE_RULES.every);
  assert.ok([...w.stores.convoys.values()].some(c => c.to === hut.id && c.kind === "coal"), "carts bring coal from the warehouse");
  hut.goods.coal = 30;
  sync(w, n);
  productionTick(w, 10);
  assert.deepEqual(logisticsView(w, n).stuck, [], "working again");
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

test("riflemen train at the barracks with steel from its store, and the new troops keep the plan's numbers", () => {
  const { w, g, n, hut, put } = field();
  put("barracks", 8, 12);
  n.drill = { keep: { rifleman: 50 } };
  const steel = hut.goods.steel;
  trainTick(w, 60);
  assert.equal(Math.round(n.mix.rifleman), 50);
  assert.ok(near(steel - hut.goods.steel, 50 * 0.2, 1e-3), `0.2 steel each: ${steel - hut.goods.steel}`);
  const row = id => [unit(id).attack, unit(id).defence, unit(id).speed, unit(id).capture];
  assert.deepEqual(["rifleman", "machine_gunner", "mortar_team", "stormtrooper"].map(row), [[4.5, 4, 1, 1.3], [3, 7, 0.8, 0.8], [5, 3, 0.9, 1.4], [6, 3, 1.2, 1.8]]);
  const s = w.createStack(n.id, g.idx(10, 10), 100);
  s.mix = { rifleman: 100 };
  const m = w.createStack(n.id, g.idx(12, 10), 100);
  m.mix = { musketeer: 100 };
  assert.ok(near(w.powerOf(s, false) / w.powerOf(m, false), 4.5 / 3.5), "a rifleman attacks at 4.5 against a musketeer's 3.5");
});

test("a vehicle factory builds an early tank with steel and oil from its store", () => {
  const { w, g, a, n, hut, put } = field();
  const f = put("vehicle_factory", 8, 12);
  assert.ok(!queueMachines(w, a, f.id, "early_tank").error);
  const oil = hut.goods.oil, steel = hut.goods.steel;
  for (let k = 0; k < 200 && ![...w.units.list.values()].some(u => u.type === "early_tank"); k++) produce(w, 1);
  assert.ok([...w.units.list.values()].some(u => u.type === "early_tank" && u.owner === a), "the tank rolls out");
  assert.deepEqual([oil - hut.goods.oil, steel - hut.goods.steel], [30, 80]);
  hut.goods.oil = 0;
  sync(w, n);
  queueMachines(w, a, f.id, "early_tank");
  produce(w, 1);
  assert.match(w.machines.queues.get(f.id).why, /oil/);
});
