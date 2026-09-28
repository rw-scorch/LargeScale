import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installResources, productionTick } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, queueMachines, produce } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { installPower, powerTick, powerView, POWER_RULES } from "../src/sim/power.js";
import { runOrder } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

const near = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;

function field() {
  const W = 90, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installConstruction(w);
  installRoads(w, { rules: rules.roads });
  installResources(w, undefined, { rng: makeRng(3), hook: false });
  installMachines(w);
  installEffects(w);
  installPower(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 3, 10);
  w.spawn(b, 85, 25);
  for (let y = 0; y < H; y++) for (let x = 0; x < 80; x++) w.claim(g.idx(x, y), a);
  const n = w.nations.get(a);
  Object.assign(n, { troops: 3000, money: 50000, era: "I", pop: 0 });
  Object.assign(w.nations.get(b), { troops: 3000, money: 1000, era: "I" });
  const hut = addBuilding(w, { type: "parliament", owner: a, anchor: g.idx(2, 8), state: "active", progress: 1 });
  const put = (type, x, y, state = "active") => addBuilding(w, { type, owner: a, anchor: g.idx(x, y), state, progress: state === "active" ? 1 : 0 });
  return { w, g, a, b, n, hut, put };
}

test("the power rules come from rules.json", () => {
  assert.deepEqual(POWER_RULES, { ...POWER_RULES, ...rules.power });
  assert.equal(rules.power.offGrid, 0.5);
});

test("a coal plant powers Industrial buildings within 6 plots at full rate for gold upkeep; one further away works at half", () => {
  const { w, g, a, n, put } = field();
  put("coal_plant", 6, 4);
  const mill = put("vehicle_factory", 10, 4), far = put("vehicle_factory", 30, 4);
  const money = n.money;
  powerTick(w, 5);
  assert.deepEqual([mill.power, far.power], [1, 0.5]);
  const v = powerView(w, n);
  assert.deepEqual(v.grids, [[20, 6, 100, 1, 0]], "20 made, 6 used, all of it met, one plant, no poles");
  assert.equal(v.users[far.id], -1, "the far factory is off the grid");
  assert.ok(near(money - n.money, 0.6 * 5 * (6 / 20)), `the plant costs gold for the load it carries: ${money - n.money}`);
});

test("a line of poles, dragged like a road, carries the grid 4 plots a pole; a short grid shares its power", () => {
  const { w, g, a, n, put } = field();
  put("coal_plant", 6, 4);
  const far = put("vehicle_factory", 30, 4);
  const dry = runOrder(w, a, { t: "poles", via: [g.idx(10, 8), g.idx(29, 8)], dry: true });
  assert.ok(dry.ok && dry.poles.length >= 6 && dry.poles.length <= 8, `a pole every 3 plots: ${dry.poles?.length}`);
  assert.deepEqual(dry.cost, { money: 15 * dry.poles.length });
  const money = n.money, r = runOrder(w, a, { t: "poles", via: [g.idx(10, 8), g.idx(29, 8)] });
  assert.ok(r.ok && r.placed === dry.poles.length, JSON.stringify(r));
  assert.equal(money - n.money, 15 * r.placed);
  for (let k = 0; k < 15; k++) w.tick(1);
  powerTick(w, 5);
  assert.equal(far.power, 1, "the far mill is on the grid now");
  assert.equal(powerView(w, n).grids[0][4], r.placed, "the grid counts its poles");
  for (let k = 0; k < 3; k++) put("vehicle_factory", 12 + 5 * k, 12);
  powerTick(w, 5);
  const share = 20 / 24;
  assert.ok(near(far.power, 0.5 + 0.5 * share), `24 wanted, 20 made: every building gets ${Math.round(share * 100)}%`);
});

test("a plant with no gold for its upkeep makes nothing, and its card says so", () => {
  const { w, g, n, put } = field();
  const plant = put("coal_plant", 6, 4), mill = put("vehicle_factory", 10, 4);
  n.money = 0;
  powerTick(w, 5);
  assert.equal(mill.power, 0.5);
  assert.deepEqual(powerView(w, n).grids[0].slice(0, 3), [0, 6, 0]);
  assert.deepEqual(powerView(w, n).plants[plant.id], [0, 0]);
});

test("capturing a pole splits the grid", () => {
  const { w, g, a, b, n, put } = field();
  put("coal_plant", 6, 4);
  const far = put("vehicle_factory", 30, 4);
  runOrder(w, a, { t: "poles", via: [g.idx(10, 8), g.idx(29, 8)] });
  for (let k = 0; k < 15; k++) w.tick(1);
  powerTick(w, 5);
  assert.equal(far.power, 1);
  const mid = [...w.bld.list.values()].filter(x => x.type === "power_pole").sort((p, q) => g.x(p.anchor) - g.x(q.anchor))[2];
  w.claim(mid.anchor, b);
  powerTick(w, 5);
  assert.equal(far.power, 0.5, "cut off beyond the captured pole");
});

test("powered vehicle factories build twice as fast as unpowered ones, and unpowered universities count half", () => {
  const { w, g, a, n, put } = field();
  const f = put("vehicle_factory", 40, 20), uni = put("university", 40, 14);
  powerTick(w, 5);
  queueMachines(w, a, f.id, "field_artillery");
  produce(w, 10);
  const slow = w.machines.queues.get(f.id).progress;
  put("coal_plant", 44, 17);
  powerTick(w, 5);
  produce(w, 10);
  assert.ok(near(w.machines.queues.get(f.id).progress - slow, 2 * slow), `${slow} then ${w.machines.queues.get(f.id).progress - slow}`);
  uni.power = 0.5;
  w.refreshEffects();
  assert.ok(near(n.bfx.research ?? 0, 0.06) || uni.power === 1, `an unpowered university adds half: ${n.bfx.research}`);
});
