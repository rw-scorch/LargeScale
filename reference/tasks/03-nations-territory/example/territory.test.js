import test from "node:test";
import assert from "node:assert/strict";
import { World } from "./territory.js";
import { TID } from "../../../shared/terrain.js";

function flatMap(w, h, t = "grassland") {
  return { w, h, terrain: new Uint8Array(w * h).fill(TID[t]) };
}

test("spawn claims a disc and respects the spawn gap", () => {
  const w = new World(flatMap(60, 40));
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  assert.ok(w.spawn(a, 10, 10));
  assert.ok(w.nations.get(a).plots > 40);
  assert.equal(w.spawn(b, 14, 10), false);
  assert.ok(w.spawn(b, 45, 25));
});

test("troops grow toward the cap and never exceed it", () => {
  const w = new World(flatMap(40, 40));
  const a = w.addNation({ name: "A" });
  w.spawn(a, 20, 20);
  for (let i = 0; i < 2000; i++) w.tick(1);
  const n = w.nations.get(a);
  assert.ok(n.troops <= w.maxTroops(n) + 1e-6);
  assert.ok(n.troops > w.maxTroops(n) * 0.99);
});

test("stack moves across unowned land and claims its path", () => {
  const w = new World(flatMap(60, 20));
  const a = w.addNation({ name: "A" });
  w.spawn(a, 5, 10);
  const s = w.createStack(a, w.grid.idx(5, 10), 300);
  assert.ok(s);
  assert.ok(w.orderMove(s.id, w.grid.idx(30, 10)));
  for (let i = 0; i < 40; i++) w.tick(1);
  assert.equal(s.pos, w.grid.idx(30, 10));
  assert.equal(w.owner[w.grid.idx(20, 10)], a);
  assert.ok(s.troops < 300);
});

test("enemy land costs more than empty land", () => {
  const w = new World(flatMap(80, 30));
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 15);
  w.spawn(b, 50, 15);
  for (let i = 0; i < 200; i++) w.tick(1);
  const empty = w.captureCost(w.grid.idx(30, 15), a);
  const enemy = w.captureCost(w.grid.idx(50, 15), a);
  assert.ok(enemy > empty * 5, `enemy ${enemy} empty ${empty}`);
});

test("advance sweeps the frontier and stops when the troops run low", () => {
  const w = new World(flatMap(60, 60));
  const a = w.addNation({ name: "A" });
  w.spawn(a, 30, 30);
  const before = w.nations.get(a).plots;
  const s = w.createStack(a, w.grid.idx(30, 30), 200);
  w.orderMove(s.id, w.grid.idx(34, 30));
  for (let i = 0; i < 5; i++) w.tick(1);
  w.orderAdvance(s.id);
  for (let i = 0; i < 60; i++) w.tick(1);
  assert.ok(w.nations.get(a).plots > before + 30);
  assert.ok(s.troops >= w.rules.minStack);
});

test("a ring of territory captures the pocket inside it", () => {
  const w = new World(flatMap(30, 30));
  const a = w.addNation({ name: "A" });
  w.nations.get(a).spawned = true;
  for (let x = 10; x <= 16; x++) { w.claim(w.grid.idx(x, 10), a); w.claim(w.grid.idx(x, 16), a); }
  for (let y = 10; y <= 15; y++) { w.claim(w.grid.idx(10, y), a); if (y !== 13) w.claim(w.grid.idx(16, y), a); }
  const inside = w.grid.idx(13, 13);
  assert.equal(w.owner[inside], 0);
  w.claim(w.grid.idx(16, 13), a);
  w.fillEnclaves(w.grid.idx(16, 13), a);
  assert.equal(w.owner[inside], a);
});

test("a nation with no plots is eliminated and its stacks vanish", () => {
  const w = new World(flatMap(40, 40));
  const a = w.addNation({ name: "A" });
  w.spawn(a, 20, 20);
  const s = w.createStack(a, w.grid.idx(20, 20), 100);
  for (let i = 0; i < w.grid.size; i++) if (w.owner[i] === a) w.claim(i, 0);
  w.tick(1);
  assert.equal(w.nations.get(a).alive, false);
  assert.equal(w.stacks.has(s.id), false);
});

test("stacks cannot cross water", () => {
  const map = flatMap(40, 10);
  for (let y = 0; y < 10; y++) map.terrain[y * 40 + 20] = TID.ocean;
  const w = new World(map);
  const a = w.addNation({ name: "A" });
  w.spawn(a, 5, 5);
  const s = w.createStack(a, w.grid.idx(5, 5), 100);
  assert.equal(w.orderMove(s.id, w.grid.idx(30, 5)), false);
});
