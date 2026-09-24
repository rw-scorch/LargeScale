import test from "node:test";
import assert from "node:assert/strict";
import { Grid, disc } from "./grid.js";
import { makeRng } from "./rng.js";
import { MinHeap } from "./heap.js";
import { findPath, costField } from "./pathfind.js";

test("heap pops in order", () => {
  const h = new MinHeap(), r = makeRng(1), keys = [];
  for (let i = 0; i < 500; i++) { const k = r.next(); keys.push(k); h.push(k, k); }
  keys.sort((a, b) => a - b);
  for (const k of keys) assert.equal(h.pop(), k);
});

test("rng is deterministic", () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});

test("path avoids walls and matches field distance", () => {
  const g = new Grid(20, 10);
  const wall = new Set();
  for (let y = 0; y < 9; y++) wall.add(g.idx(10, y));
  const cost = (a, b) => (wall.has(b) ? Infinity : 1);
  cost.minStep = 1;
  const p = findPath(g, g.idx(2, 2), g.idx(17, 2), cost);
  assert.ok(p);
  assert.ok(p.every(i => !wall.has(i)));
  const f = costField(g, [{ i: g.idx(2, 2) }], cost);
  assert.equal(p.length - 1, f.dist[g.idx(17, 2)]);
});

test("disc radius", () => {
  const g = new Grid(50, 50);
  const d = disc(g, 25, 25, 4);
  assert.ok(d.length > 45 && d.length < 55);
});
