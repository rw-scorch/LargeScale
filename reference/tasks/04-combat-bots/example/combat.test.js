import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { installCombat, simulateDuel, resolveBattles } from "./combat.js";
import { spawnBots, installBots, checkVictory } from "./bots.js";
import { makeRng } from "../../../shared/rng.js";
import { TID } from "../../../shared/terrain.js";

const flat = (w, h) => ({ w, h, terrain: new Uint8Array(w * h).fill(TID.grassland) });

test("square-law duel: bigger stack wins with about sqrt(a^2 - b^2) left", () => {
  const r = simulateDuel(1000, 600);
  assert.equal(r.b, 0);
  const expect = Math.sqrt(1000 ** 2 - 600 ** 2);
  assert.ok(Math.abs(r.a - expect) < expect * 0.05, `${r.a} vs ${expect}`);
});

test("adjacent hostile stacks fight until one is gone", () => {
  const w = new World(flat(60, 30));
  installCombat(w);
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 15); w.spawn(b, 40, 15);
  const sa = w.createStack(a, w.grid.idx(10, 15), 480);
  const sb = w.createStack(b, w.grid.idx(40, 15), 200);
  w.orderMove(sa.id, w.grid.idx(39, 15));
  for (let i = 0; i < 120 && w.stacks.has(sb.id) && w.stacks.has(sa.id); i++) w.tick(1);
  assert.equal(w.stacks.has(sb.id), false);
  assert.ok(w.stacks.has(sa.id));
  assert.ok(sa.troops < 480);
});

test("allied stacks do not fight", () => {
  const w = new World(flat(30, 30));
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.hostile = () => false;
  w.spawn(a, 5, 5); w.spawn(b, 20, 20);
  const sa = w.createStack(a, w.grid.idx(5, 5), 100);
  const sb = w.createStack(b, w.grid.idx(20, 20), 100);
  sb.pos = w.grid.idx(6, 5);
  assert.equal(resolveBattles(w, 1), 0);
  assert.equal(sa.troops, 100);
});

test("bots expand into empty land but leave players alone", () => {
  const w = new World(flat(120, 80));
  const p = w.addNation({ name: "Player" });
  w.spawn(p, 20, 40);
  const rng = makeRng(7);
  const bots = spawnBots(w, 2, rng);
  installBots(w, rng);
  const start = bots.map(id => w.nations.get(id).plots);
  const pStart = w.nations.get(p).plots;
  for (let i = 0; i < 400; i++) w.tick(1);
  bots.forEach((id, k) => assert.ok(w.nations.get(id).plots > start[k]));
  assert.equal(w.hostile(bots[0], p), false);
  assert.ok(w.nations.get(p).plots >= pStart);
});

test("victory when one human faction remains", () => {
  const w = new World(flat(10, 10));
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" }), c = w.addNation({ name: "C" });
  assert.equal(checkVictory(w), null);
  w.nations.get(c).alive = false;
  const faction = id => (id === a || id === b ? 99 : id);
  assert.deepEqual(checkVictory(w, faction), { winner: 99 });
  assert.equal(checkVictory(w), null);
});
