import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops, trainTick } from "../src/sim/troops.js";
import { addBuilding, BUILDINGS } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, queueMachines, produce, spawnUnit, fleetOf } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { installResearch, complete, TREE } from "../src/sim/research.js";
import { installSoldiers, fieldOf } from "../src/sim/soldiers.js";
import { lockMap, planPath } from "../src/shared/research.js";
import { makeRng } from "../src/shared/rng.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };
import unitData from "../data/units.json" with { type: "json" };

const near = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;
const unit = id => unitData.units.find(u => u.id === id);

function field({ research = false } = {}) {
  const W = 60, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installConstruction(w);
  installRoads(w, { rules: rules.roads });
  installResources(w, undefined, { rng: makeRng(3), hook: false });
  installMachines(w);
  installEffects(w);
  installSoldiers(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 3, 15);
  w.spawn(b, 56, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 30 ? a : b);
  if (research) installResearch(w);
  const n = w.nations.get(a);
  Object.assign(n, { troops: 5000, money: 100000, era: "Mo", pop: 0 });
  Object.assign(w.nations.get(b), { troops: 5000, money: 1000, era: "Mo" });
  const put = (type, x, y) => addBuilding(w, { type, owner: a, anchor: g.idx(x, y), state: "active", progress: 1 });
  const order = m => runOrder(w, a, m);
  const until = (done, most = 400) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(0.5); } return -1; };
  return { w, g, a, b, n, put, order, until };
}

test("the Modern Age needs twelve Industrial nodes in all four branches, and each Modern node unlocks what the plan names", () => {
  const era = TREE.nodes.find(t => t.id === "age_modern");
  assert.deepEqual([era.era, era.advances, era.need, era.requires], ["I", "Mo", { nodes: 12, branches: 4 }, ["railways", "armour", "flight", "universities"]]);
  const locks = lockMap(TREE), u = id => locks.units.get(id), b = id => locks.buildings.get(id);
  assert.deepEqual(["soldier", "special_forces", "at_team", "main_battle_tank", "apc", "rocket_artillery"].map(u), ["modern_infantry", "special_operations", "anti_tank", "mechanised", "mechanised", "rocketry"]);
  const moBuildings = Object.values(BUILDINGS.table).filter(d => d.era === "Mo" && !d.retired).map(d => d.id);
  assert.deepEqual(moBuildings.map(b), ["reinforced_concrete", "modern_oil", "high_rise", "consumer_society", "automation", "open_pit_mining", "modern_oil", "natural_gas", "jet_engines", "guided_missiles", "nuclear_weapons", "missile_defence", "mass_tourism", "mass_tourism", "mass_tourism", "mass_tourism", "mass_tourism", "skyscrapers", "skyscrapers", "mass_tourism"], `every Modern building is behind a node: ${moBuildings.join(", ")}`);
  const modern = TREE.nodes.filter(t => t.era === "Mo");
  assert.equal(modern.length, 27);
  const costs = modern.filter(t => !["nuclear_weapons", "thermonuclear"].includes(t.id)).map(t => t.cost);
  assert.ok(Math.min(...costs) === 800 && Math.max(...costs) === 1400, `Modern nodes cost 800 to 1,400: ${costs.join(" ")}`);
  assert.deepEqual(["nuclear_weapons", "thermonuclear"].map(id => TREE.nodes.find(t => t.id === id).cost), [1800, 2000], "the nuclear nodes cost the most");
  const path = planPath(locks, new Set(TREE.nodes.filter(t => t.era !== "Mo" && t.id !== "age_modern").map(t => t.id)), "rocketry");
  assert.deepEqual(path, ["age_modern", "mechanised", "rocketry"]);
});

test("Modern soldiers outfight stormtroopers, need their research, and train at the barracks for gold", () => {
  const { w, g, n, put, order } = field({ research: true });
  const st = unit("stormtrooper"), mo = ["soldier", "special_forces", "at_team"].map(unit);
  assert.deepEqual(mo.map(d => [d.num, d.era, d.attack, d.defence]), [[35, "Mo", 8, 7], [36, "Mo", 11, 6], [37, "Mo", 7, 11]]);
  assert.ok(mo.every(d => d.attack + d.defence > st.attack + st.defence), "each is worth more in a fight than a stormtrooper");
  put("barracks", 8, 12);
  assert.equal(order({ t: "army", keep: { soldier: 40 } }).error, "Soldiers: needs Modern infantry research");
  complete(w, n, "modern_infantry");
  assert.equal(order({ t: "army", keep: { soldier: 40 } }).ok, true);
  const money = n.money;
  trainTick(w, 60);
  assert.equal(Math.round(n.mix.soldier), 40);
  assert.ok(near(money - n.money, 40 * 14, 1e-3), `14 gold each: ${money - n.money}`);
  const s = w.createStack(n.id, g.idx(10, 10), 100), t = w.createStack(n.id, g.idx(12, 10), 100);
  s.mix = { soldier: 100 };
  t.mix = { stormtrooper: 100 };
  assert.ok(near(w.powerOf(s, false) / w.powerOf(t, false), 8 / 6), "a soldier attacks at 8 against a stormtrooper's 6");
});

test("the vehicle factory builds the Modern machines once they are researched, and they count toward the 100", () => {
  const { w, a, n, put } = field({ research: true });
  const f = put("vehicle_factory", 8, 12);
  assert.equal(queueMachines(w, a, f.id, "main_battle_tank").error, "needs Mechanised warfare research");
  complete(w, n, "mechanised");
  complete(w, n, "rocketry");
  for (const type of ["main_battle_tank", "apc", "rocket_artillery"]) assert.ok(!queueMachines(w, a, f.id, type).error, type);
  for (let k = 0; k < 800 && w.units.list.size < 3; k++) produce(w, 1);
  assert.deepEqual([...w.units.list.values()].map(u => u.type).sort(), ["apc", "main_battle_tank", "rocket_artillery"]);
  assert.deepEqual(fleetOf(w, a), { land: 3, sea: 0, air: 0 });
  const mbt = unit("main_battle_tank"), tank = unit("early_tank");
  assert.ok(mbt.attack > 2 * tank.attack && mbt.defence > 2 * tank.defence && mbt.speed > tank.speed, "a main battle tank is more than twice an early tank");
});

test("an APC takes a company aboard, drives, and sets it down where it stops with no loss; its troops count as soldiers", () => {
  const { w, g, a, n, order, until } = field();
  const apc = spawnUnit(w, a, "apc", g.idx(10, 15));
  const s = w.createStack(a, g.idx(6, 15), 250);
  s.mix = { soldier: 100 };
  n.mix = { soldier: 200 };
  assert.deepEqual(order({ t: "board", stack: s.id, ship: apc.id }), { t: "result", of: "board", ok: true });
  assert.ok(until(() => apc.cargo) > 0, "the company walks to the APC and gets in");
  assert.deepEqual([w.stacks.has(s.id), apc.cargo.troops, Math.round(apc.cargo.mix.soldier)], [false, 250, 100]);
  assert.equal(fieldOf(w, a).soldiers, 25, "the 25 soldiers aboard still count toward the 1,000");
  const r = order({ t: "machine", machine: apc.id, do: "move", to: g.idx(24, 15) });
  assert.deepEqual([r.ok, r.unloads], [true, g.idx(24, 15)]);
  const took = until(() => !apc.cargo);
  assert.ok(took > 0 && took < 30, `14 plots at vehicle speed: ${took / 2} s`);
  const landed = [...w.stacks.values()].find(t => t.owner === a && t.pos === g.idx(24, 15));
  assert.ok(landed && landed.troops === 250 && Math.round(landed.mix.soldier) === 100, `all 250 get off, soldiers and all: ${landed?.troops}`);
  const walk = w.createStack(a, g.idx(6, 20), 250);
  const walked = (() => { w.orderMove(walk.id, g.idx(20, 20)); return until(() => walk.pos === g.idx(20, 20)); })();
  assert.ok(walked > took, `on foot the same kind of trip takes longer: ${walked / 2} s against ${took / 2} s`);
  assert.equal(order({ t: "machine", machine: apc.id, do: "land", at: g.idx(20, 15) }).error, "nothing aboard");
});

test("an APC that drives into enemy land unloads fighting, and its troops get out to fight when an enemy stack comes beside it", () => {
  const { w, g, a, b, order, until } = field();
  const apc = spawnUnit(w, a, "apc", g.idx(28, 5));
  apc.cargo = { troops: 250, owner: a, mix: null, xp: 0 };
  assert.equal(order({ t: "machine", machine: apc.id, do: "land", at: g.idx(31, 5) }).ok, true);
  until(() => !apc.cargo);
  const landed = [...w.stacks.values()].find(t => t.owner === a && t.pos === g.idx(31, 5));
  assert.ok(landed && landed.troops < 250 && w.owner[g.idx(31, 5)] === a, `it takes the plot, paying for it: ${landed?.troops} left`);
  const other = spawnUnit(w, a, "apc", g.idx(29, 25));
  other.cargo = { troops: 200, owner: a, mix: null, xp: 0 };
  w.createStack(b, g.idx(30, 25), 300);
  w.tick(0.5);
  const out = [...w.stacks.values()].find(t => t.owner === a && t.pos === g.idx(29, 25));
  assert.ok(!other.cargo && other.owner === a && out, "the troops aboard get out beside the APC instead of it being taken");
  assert.ok(w.events.some(e => e.type === "landed" && e.machine === other.id));
  const empty = spawnUnit(w, a, "apc", g.idx(29, 2));
  w.createStack(b, g.idx(30, 2), 300);
  w.tick(0.5);
  assert.equal(empty.owner, b, "an empty APC left alone is captured like any machine");
});

test("rocket artillery cuts capture cost from 6 plots away, further than field artillery reaches", () => {
  const { w, g, a } = field();
  spawnUnit(w, a, "rocket_artillery", g.idx(24, 15));
  assert.equal(w.siegeAt(a, g.idx(30, 15)), 4.5, "6 plots away");
  assert.equal(w.siegeAt(a, g.idx(31, 15)), 1, "7 plots away is out of range");
  const f = field();
  spawnUnit(f.w, f.a, "field_artillery", f.g.idx(24, 15));
  assert.equal(f.w.siegeAt(f.a, f.g.idx(30, 15)), 1, "field artillery reaches only 5");
});
