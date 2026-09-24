import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { Presence, applyOfflineDefence, standingOrders, collectAlerts, summarise, planCatchUp, runCatchUp, trackOutput, offlineOutput, applyOfflineOutput } from "./offline.js";
import { TID } from "../../../shared/terrain.js";

function two() {
  const map = { w: 80, h: 30, terrain: new Uint8Array(2400).fill(TID.grassland) };
  const w = new World(map, { spawnRadius: 6 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 15); w.spawn(b, 60, 15);
  for (let x = 10; x < 40; x++) w.claim(w.grid.idx(x, 15), a);
  return { w, a, b };
}

test("offline nations defend slightly worse", () => {
  const { w, a, b } = two();
  const p = new Presence();
  p.connect(b, 0);
  const before = w.captureCost(w.grid.idx(10, 15), b);
  applyOfflineDefence(w, p);
  const after = w.captureCost(w.grid.idx(10, 15), b);
  assert.ok(Math.abs(after / before - 0.95) < 1e-9);
});

test("offline production is the online average minus a tenth", () => {
  const n = { id: 1, stock: { iron: 0, food: 0 } };
  for (let t = 0; t < 3600; t++) trackOutput(n, { iron: 2, food: 5 }, 1);
  assert.ok(Math.abs(n.avgOutput.iron - 2) < 0.01);
  const out = offlineOutput(n, 3600);
  assert.ok(Math.abs(out.iron - 2 * 0.9 * 3600) < 10);
  applyOfflineOutput(n, 600);
  assert.ok(Math.abs(n.stock.food - 5 * 0.9 * 600) < 20);
});

test("an idle nation earns nothing while away", () => {
  const n = { id: 2, stock: {} };
  for (let t = 0; t < 600; t++) trackOutput(n, { iron: 4 }, 1);
  for (let t = 0; t < 7200; t++) trackOutput(n, { iron: 0 }, 1);
  const out = offlineOutput(n, 3600);
  assert.ok((out.iron ?? 0) < 4 * 0.9 * 3600 * 0.05);
});

test("fall back retreats when outnumbered, hold stays put", () => {
  const { w, a, b } = two();
  const p = new Presence();
  p.connect(b, 0);
  const holder = w.createStack(a, w.grid.idx(10, 15), 50);
  holder.pos = w.grid.idx(35, 15);
  const runner = w.createStack(a, w.grid.idx(10, 15), 50);
  runner.pos = w.grid.idx(36, 15);
  runner.standing = "fallback";
  const enemy = w.createStack(b, w.grid.idx(60, 15), 300);
  enemy.pos = w.grid.idx(39, 15);
  const moved = standingOrders(w, p);
  assert.deepEqual(moved, [runner.id]);
  assert.equal(runner.path[runner.path.length - 1], w.nations.get(a).capital);
  assert.equal(holder.path.length, 0);
});

test("alerts pile up only for players who are away", () => {
  const { w, a, b } = two();
  const p = new Presence();
  p.connect(b, 0);
  w.emit("plot_lost", { nation: a, by: b, at: 1 });
  w.emit("plot_lost", { nation: a, by: b, at: 2 });
  w.emit("plot_lost", { nation: b, by: a, at: 3 });
  const inbox = new Map();
  collectAlerts(w, p, inbox, 0);
  assert.equal(inbox.get(a).length, 2);
  assert.equal(inbox.has(b), false);
  assert.deepEqual(summarise(inbox.get(a)).byAttacker, { [b]: 2 });
});

test("catch-up is capped and can be split into slices", () => {
  const plan = planCatchUp(10 * 24 * 3600);
  assert.equal(plan.capped, 3 * 24 * 3600);
  assert.equal(plan.steps, 4320);
  let t = 0, calls = 0, fake = 0;
  const clock = () => fake;
  const step = dt => { t += dt; calls++; fake += 1; };
  let done = false, slices = 0;
  while (!done) { done = runCatchUp(plan, step, 100, clock); slices++; fake = 0; }
  assert.equal(t, 3 * 24 * 3600);
  assert.ok(slices > 40);
});

test("catch-up growth matches live growth closely", () => {
  const live = two(), fast = two();
  for (let i = 0; i < 3600; i++) live.w.growTroops(1);
  const plan = planCatchUp(3600);
  runCatchUp(plan, dt => fast.w.growTroops(dt), 1e9);
  const a = live.w.nations.get(live.a).troops, b = fast.w.nations.get(fast.a).troops;
  assert.ok(Math.abs(a - b) / a < 0.05, `${a} vs ${b}`);
});
