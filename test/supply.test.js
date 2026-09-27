import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installRoads, layRoad } from "../src/sim/logistics.js";
import { installSupply, supplyTick, reachOf, formWagon, supplyView, SUPPLY } from "../src/sim/supply.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function field() {
  const W = 80, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installRoads(w, { rules: rules.roads });
  installSupply(w);
  const g = w.grid, a = w.addNation({ name: "A" }), bot = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 3, 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < 60; x++) w.claim(g.idx(x, y), a);
  const n = w.nations.get(a);
  Object.assign(n, { human: true, troops: 3000, money: 1000, stock: { food: 1000 } });
  w.nations.get(bot).troops = 1000;
  addBuilding(w, { type: "chieftain_hut", owner: a, anchor: g.idx(2, 9), plots: [g.idx(2, 9), g.idx(3, 9), g.idx(2, 10), g.idx(3, 10)], state: "active", progress: 1 });
  w.events.length = 0;
  return { w, g, a, n, bot, order: m => runOrder(w, a, m) };
}

const R = SUPPLY;

test("the supply rules match rules.json, and reach runs 18 plots of travel from a store holding food", () => {
  assert.deepEqual(SUPPLY, { ...rules.supply });
  const { w, g, n } = field();
  const reach = reachOf(w, n);
  assert.ok(reach.has(g.idx(20, 9)) && !reach.has(g.idx(21, 9)), "18 plots of grass from the hut's corner at x 2");
  n.stock.food = 0;
  assert.equal(reachOf(w, n).size, 0, "no food, no supply");
});

test("a stack beyond reach lives on 10 minutes of supplies, then weakens to half and slowly deserts; back in reach it recovers", () => {
  const { w, g, a } = field();
  const near = w.createStack(a, g.idx(10, 9), 500), far = w.createStack(a, g.idx(40, 9), 1000);
  const p0 = w.powerOf(far, false);
  supplyTick(w, 300);
  assert.deepEqual([near.carry, far.carry], [R.carrySeconds, R.carrySeconds - 300]);
  supplyTick(w, 300);
  assert.equal(far.carry, 0);
  assert.ok(w.events.some(e => e.type === "supplies_low" && e.stack === far.id));
  supplyTick(w, 3);
  assert.ok(w.events.some(e => e.type === "out_of_supply" && e.stack === far.id));
  for (let t = 0; t < 40; t++) supplyTick(w, 3);
  assert.equal(far.supplyMult, R.minMult);
  assert.ok(Math.abs(w.powerOf(far, false) / far.troops - (p0 / 1000) * 0.5) < 1e-9, "power per soldier is halved");
  assert.equal(w.stackAttack(far), w.stackAttack(near) * 0.5, "and it takes land at half the rate");
  const before = far.troops;
  supplyTick(w, 60);
  assert.ok(Math.abs(before - far.troops - before * R.desertPerSec * 60) < 1e-6, `a few desert: ${(before - far.troops).toFixed(1)} a minute`);
  far.pos = g.idx(12, 9);
  supplyTick(w, 3);
  assert.deepEqual([far.carry, far.supplyMult, far.outFor], [R.carrySeconds, 1, 0]);
  assert.ok(w.events.some(e => e.type === "resupplied"));
});

test("roads stretch supply reach, bots ignore supply, and splits and merges keep the worse state", () => {
  const { w, g, a, n, bot } = field();
  const s = w.createStack(a, g.idx(28, 9), 400);
  supplyTick(w, 30);
  assert.equal(s.carry, R.carrySeconds - 30, "28 plots out is beyond reach on grass");
  layRoad(w, a, [g.idx(4, 9), g.idx(32, 9)], "dirt");
  supplyTick(w, 3);
  assert.equal(s.carry, R.carrySeconds, "a dirt road carries supply 30 plots");
  for (let y = 0; y < 20; y++) w.claim(g.idx(75, y), bot);
  const b = w.createStack(bot, g.idx(75, 9), 300);
  supplyTick(w, 900);
  assert.equal(b.carry, undefined, "bot stacks are left alone");
  const lost = w.createStack(a, g.idx(50, 9), 600);
  supplyTick(w, 700);
  const half = w.splitStack(lost.id, 200);
  assert.deepEqual([half.carry, half.outFor], [0, lost.outFor], "a split does not refill supplies");
  const fresh = w.createStack(a, g.idx(51, 9), 100);
  w.mergeStacks(fresh.id, half.id);
  assert.equal(fresh.carry, 0, "a merge keeps the worse supplies");
  assert.ok(supplyView(w, n).stacks.some(([id, carry, pct]) => id === lost.id && carry === 0 && pct < 100));
});

test("a supply wagon is loaded at a store, feeds stacks within 3 plots, runs dry, follows a stack, and gives its food back", () => {
  const { w, g, a, n, order } = field();
  assert.match(formWagon(w, a, g.idx(30, 9), 100).error, /loaded at your capital or a store/);
  const made = order({ t: "wagon", at: g.idx(4, 11), food: 200 });
  assert.ok(made.ok && made.food === 200, JSON.stringify(made));
  assert.equal(n.stock.food, 800);
  const wagon = w.stacks.get(made.stack);
  assert.deepEqual([wagon.kind, wagon.supplies, wagon.troops], ["supply", 200, R.wagonCrew]);
  const army = w.createStack(a, g.idx(45, 9), 2000);
  wagon.pos = g.idx(47, 9);
  supplyTick(w, 30);
  assert.equal(army.carry, R.carrySeconds, "fed by the wagon two plots away");
  assert.ok(Math.abs(wagon.supplies - (200 - 2000 * R.feedPerTroop * 30)) < 1e-9, `wagon has ${wagon.supplies} food left`);
  supplyTick(w, 200);
  assert.equal(wagon.supplies, 0);
  assert.ok(w.events.some(e => e.type === "wagon_empty"));
  assert.equal(order({ t: "advance", stack: wagon.id }).error, "supply wagons carry food; they do not take land");
  assert.equal(order({ t: "merge", into: army.id, stack: wagon.id }).error, "supply wagons do not merge with troops");
  const second = w.stacks.get(order({ t: "wagon", at: g.idx(4, 11), food: 100 }).stack);
  assert.ok(order({ t: "follow", stack: second.id, target: army.id }).ok);
  for (let k = 0; k < 120 && w.grid.cheb(second.pos, army.pos) > 2; k++) w.tick(0.5);
  assert.ok(w.grid.cheb(second.pos, army.pos) <= 2, "the wagon caught up with the army");
  second.pos = g.idx(5, 11);
  const left = Math.floor(second.supplies), food0 = n.stock.food, back = order({ t: "disband", stack: second.id });
  assert.ok(left > 90 && back.food === left && Math.floor(n.stock.food - food0) === left, `disbanding a wagon on your land puts its ${left} food back`);
});
