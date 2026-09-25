import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../src/sim/territory.js";
import { installConstruction, canPlace, place, progressConstruction, listUpgradable, selectRange, bulkUpgrade } from "../../src/sim/construction.js";
import { installCivilians, zonePlots, startBuilding, econTick } from "../../src/sim/civilians.js";
import { makeRng } from "../../src/shared/rng.js";
import { TID } from "../../src/shared/terrain.js";

function setup() {
  const map = { w: 40, h: 30, terrain: new Uint8Array(1200).fill(TID.grassland) };
  for (let y = 0; y < 30; y++) for (let x = 30; x < 40; x++) map.terrain[y * 40 + x] = TID.shallows;
  const w = new World(map, { spawnRadius: 6 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 24, 15); w.spawn(b, 8, 15);
  for (let x = 18; x < 30; x++) for (let y = 8; y < 22; y++) w.claim(w.grid.idx(x, y), a);
  installConstruction(w);
  const n = w.nations.get(a);
  Object.assign(n, { era: "M", money: 5000, stock: { wood: 500, stone: 500, steel: 0, concrete: 0, clay: 0, food: 100, goods: 0 } });
  return { w, a, b, n };
}

test("placement rules", () => {
  const { w, a } = setup();
  const g = w.grid;
  assert.equal(canPlace(w, a, "barracks", g.idx(20, 10)), null);
  assert.equal(canPlace(w, a, "barracks", g.idx(8, 15)), "not your land");
  assert.equal(canPlace(w, a, "barracks", g.idx(31, 10)), "cannot build on water");
  assert.equal(canPlace(w, a, "harbour", g.idx(20, 10)), "must sit on the coast");
  assert.equal(canPlace(w, a, "harbour", g.idx(29, 10)), null);
  assert.equal(canPlace(w, a, "warehouse", g.idx(20, 10)), "needs the Industrial era");
  place(w, a, "barracks", g.idx(20, 10));
  assert.equal(canPlace(w, a, "tower_stone", g.idx(21, 10)), "something is already there");
});

test("construction pays up front and finishes over time", () => {
  const { w, a, n } = setup();
  const b = place(w, a, "tower_stone", w.grid.idx(22, 12));
  assert.equal(n.money, 5000 - 80);
  assert.equal(n.stock.stone, 470);
  for (let t = 0; t < 59; t++) progressConstruction(w, 1);
  assert.equal(b.state, "construction");
  progressConstruction(w, 2);
  assert.equal(b.state, "active");
});

test("bulk menu lists lowest levels first and swipe picks a range", () => {
  const { w, a, n } = setup();
  const t1 = place(w, a, "watchtower_wood", w.grid.idx(20, 9));
  const t2 = place(w, a, "tower_stone", w.grid.idx(22, 9));
  const t3 = place(w, a, "watchtower_wood", w.grid.idx(24, 9));
  progressConstruction(w, 999);
  const rows = listUpgradable(w, a);
  assert.deepEqual(rows.map(r => r.type), ["watchtower_wood", "watchtower_wood", "tower_stone"]);
  const pick = selectRange(rows, 1, 0);
  const res = bulkUpgrade(w, a, pick);
  assert.deepEqual(res.done.sort(), [t1.id, t3.id].sort());
  assert.equal(t1.type, "tower_stone");
  assert.equal(t2.type, "tower_stone");
  assert.equal(res.spent, 2 * 80 * 1.5);
});

test("bulk upgrade stops cleanly when money runs out and reports why", () => {
  const { w, a, n } = setup();
  for (let x = 19; x < 29; x += 2) place(w, a, "watchtower_wood", w.grid.idx(x, 20));
  progressConstruction(w, 999);
  n.money = 250;
  const res = bulkUpgrade(w, a, selectRange(listUpgradable(w, a), 0, 99));
  assert.equal(res.done.length, 2);
  assert.ok(res.skipped.every(([, why]) => why === "not enough money"));
});

test("civilian filter shows only civilian buildings and upgrades them instantly", () => {
  const { w, a, n } = setup();
  const rng = makeRng(1);
  installCivilians(w, rng);
  n.era = "M";
  zonePlots(w, a, [w.grid.idx(26, 18)], "res");
  const hut = startBuilding(w, a, w.grid.idx(26, 18), "hut_grass");
  for (let i = 0; i < 10; i++) econTick(w, 5, rng);
  place(w, a, "watchtower_wood", w.grid.idx(20, 18));
  progressConstruction(w, 999);
  const rows = listUpgradable(w, a, { filter: "civilian" });
  assert.equal(rows.length, 1);
  const res = bulkUpgrade(w, a, selectRange(rows, 0, 0));
  assert.deepEqual(res.done, [hut.id]);
  assert.equal(hut.type, "cottage_timber");
  assert.equal(hut.state, "active");
});
