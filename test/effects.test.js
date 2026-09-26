import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, stackPower } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installEconomy } from "../src/sim/economy.js";
import { installResearch, researchRate } from "../src/sim/research.js";
import { installMachines, spawnUnit } from "../src/sim/units.js";
import { installEffects, buildingEffects } from "../src/sim/effects.js";
import { vitalsOf } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";

const near = (x, y, eps = 1e-9) => Math.abs(x - y) < eps;

function setup(W = 80, H = 40) {
  const terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installEconomy(w);
  installResearch(w);
  installMachines(w);
  installEffects(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 20);
  w.spawn(b, 70, 20);
  for (let y = 0; y < H; y++) for (let x = 0; x < 40; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < H; y++) for (let x = 40; x < W; x++) w.claim(g.idx(x, y), b);
  const n = w.nations.get(a);
  Object.assign(n, { human: true, money: 0, pop: 0, era: "G", troops: 5000 });
  Object.assign(w.nations.get(b), { troops: 5000 });
  const put = (type, x, y, state = "active", owner = a) => addBuilding(w, { type, owner, anchor: g.idx(x, y), state });
  return { w, g, a, b, n, put };
}

test("banks raise gold income by 8% each and courthouses the troop cap by 3%, each up to 5", () => {
  const { w, a, n, put } = setup();
  for (let k = 0; k < 7; k++) put("bank", 2 + 3 * k, 2);
  for (let k = 0; k < 2; k++) put("courthouse", 2 + 3 * k, 6);
  put("bank", 30, 2, "construction");
  w.refreshEffects();
  assert.ok(near(n.bfx.income, 0.4), `seven banks count as five: ${n.bfx.income}`);
  assert.ok(near(w.effectOf(n, "troop_cap"), 0.06));
  const before = n.money;
  w.tick(1);
  const base = w.econ.rules.baseIncome;
  assert.ok(near(n.money - before, base * 1.4), `one second pays ${n.money - before}, 1.4 times ${base}`);
  assert.ok(near(vitalsOf(w, n).income, Math.round(base * 1.4 * 100) / 100), "the control panel's gold rate includes the banks");
  n.effects.troop_cap = 0.05;
  assert.ok(near(w.effectOf(n, "troop_cap"), 0.11), "research and buildings add together");
  assert.deepEqual(buildingEffects(w, w.addNation({ name: "C" })).fx, {}, "a nation with no buildings gets nothing");
});

test("libraries and schools add research points, counting up to 5 and 10", () => {
  const { w, n, put } = setup();
  const plain = researchRate(w, n);
  for (let k = 0; k < 6; k++) put("library", 2 + 3 * k, 2);
  for (let k = 0; k < 12; k++) put("school", 2 + 3 * k, 6);
  put("library", 2, 10, "construction");
  const r = w.research.rules;
  assert.ok(near(researchRate(w, n) - plain, (5 * 0.2 + 10 * 0.1) * (r.speed ?? 1)), `${researchRate(w, n) - plain}`);
});

test("a star fort makes your land around it 1.5 times as dear to take; the strongest fort counts, and only finished ones", () => {
  const { w, g, a, b, put } = setup();
  const inside = g.idx(20, 20), edge = g.idx(26, 20), outside = g.idx(30, 20);
  const plain = [inside, edge, outside].map(i => w.captureCost(i, b));
  put("star_fort", 19, 19);
  put("watchtower_wood", 22, 22);
  put("star_fort", 30, 5, "construction");
  w.refreshEffects();
  assert.ok(near(w.captureCost(inside, b), plain[0] * 1.5), "inside: the fort's 1.5, not 1.5 times the tower's 1.15");
  assert.equal(w.fortAt(a, g.idx(30, 5)), 1, "a fort still being built does nothing");
  assert.ok(near(w.captureCost(outside, b), plain[2]), "outside its 6 plots, no change");
  assert.ok(w.fortAt(a, edge) === 1.5, "the edge of the ring counts");
  assert.equal(w.fortAt(b, inside), 1, "another nation's land is not covered by your fort");
  const tower = put("tower_stone", 34, 34);
  w.refreshEffects();
  assert.equal(w.fortAt(a, g.idx(36, 34)), 1.3);
  assert.equal(w.fortAt(a, g.idx(34, 39)), 1, "a stone tower reaches 4 plots");
  for (const i of tower.plots) w.claim(i, b);
  w.refreshEffects();
  assert.equal(tower.owner, b, "taking the tower's plot takes the tower");
  assert.equal(w.fortAt(b, g.idx(36, 34)), 1.3, "it now helps its new owner");
});

test("a stack holding its own land near a fort fights at the fort's strength", () => {
  const { w, g, a, put } = setup();
  const near1 = w.createStack(a, g.idx(20, 20), 500), far1 = w.createStack(a, g.idx(5, 35), 500);
  near1.order = far1.order = "hold";
  const before = stackPower(w, near1);
  assert.ok(near(before, stackPower(w, far1)));
  put("star_fort", 19, 19);
  w.refreshEffects();
  assert.ok(near(stackPower(w, near1), before * 1.5));
  near1.order = "advance";
  assert.ok(stackPower(w, near1) < before, "moving on, it loses the hold bonus and the fort's with it");
});

test("the Gunpowder troops and the cannon use their data", () => {
  const { w, g, a } = setup();
  const s = w.createStack(a, g.idx(20, 20), 400);
  s.mix = { musketeer: 200, grenadier: 100, line_infantry: 100 };
  assert.ok(near(w.powerOf(s, false), 200 * 3.5 + 100 * 5 + 100 * 3), `attack ${w.powerOf(s, false)}`);
  assert.ok(near(w.powerOf(s, true), 200 * 3 + 100 * 2.5 + 100 * 4.5), `defence ${w.powerOf(s, true)}`);
  spawnUnit(w, a, "cannon", g.idx(37, 20));
  assert.equal(w.siegeAt(a, g.idx(41, 20)), 3, "a cannon cuts capture cost to a third within 4 plots");
  assert.equal(w.siegeAt(a, g.idx(42, 20)), 1);
});
