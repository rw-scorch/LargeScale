import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../src/sim/territory.js";
import { installCivilians, zonePlots, econTick, startBuilding, tryUpgrade, conscript, bestTypeFor } from "../../src/sim/civilians.js";
import { makeRng } from "../../src/shared/rng.js";
import { TID } from "../../src/shared/terrain.js";
import { disc } from "../../src/shared/grid.js";

function setup(food = 500) {
  const map = { w: 60, h: 60, terrain: new Uint8Array(3600).fill(TID.grassland) };
  const w = new World(map, { spawnRadius: 8 });
  const a = w.addNation({ name: "A" });
  w.spawn(a, 30, 30);
  const rng = makeRng(3);
  installCivilians(w, rng);
  const n = w.nations.get(a);
  n.stock.food = food;
  n.stock.wood = 500;
  return { w, a, n, rng };
}

test("residential zoning grows huts and people when fed", () => {
  const { w, a, n, rng } = setup();
  zonePlots(w, a, disc(w.grid, 30, 30, 4), "res");
  for (let i = 0; i < 80; i++) { n.stock.food = 500; econTick(w, 5, rng); }
  const huts = [...w.bld.list.values()].filter(b => b.type === "hut_grass" && b.state === "active");
  assert.ok(huts.length >= 3, `huts ${huts.length}`);
  assert.ok(n.pop > 10, `pop ${n.pop}`);
});

test("starvation shrinks the population", () => {
  const { w, a, n, rng } = setup();
  zonePlots(w, a, disc(w.grid, 30, 30, 4), "res");
  for (let i = 0; i < 80; i++) { n.stock.food = 500; econTick(w, 5, rng); }
  const fed = n.pop;
  for (let i = 0; i < 80; i++) { n.stock.food = 0; econTick(w, 5, rng); }
  assert.ok(n.pop < fed * 0.6, `fed ${fed} starving ${n.pop}`);
});

test("upgrades wait for the era", () => {
  const { w, a, n, rng } = setup();
  zonePlots(w, a, disc(w.grid, 30, 30, 2), "res");
  const b = startBuilding(w, a, w.grid.idx(30, 30), "hut_grass");
  for (let i = 0; i < 10; i++) econTick(w, 5, rng);
  assert.equal(b.state, "active");
  assert.equal(tryUpgrade(w, b, true), false);
  n.era = "M";
  assert.equal(tryUpgrade(w, b, true), true);
  assert.equal(b.type, "cottage_timber");
});

test("bigger buildings need all their plots zoned and empty", () => {
  const { w, a, n } = setup();
  n.era = "Mo";
  n.stock.steel = 999; n.stock.concrete = 999;
  zonePlots(w, a, [w.grid.idx(30, 30)], "res");
  assert.equal(startBuilding(w, a, w.grid.idx(30, 30), "apartment_block"), null);
  zonePlots(w, a, [w.grid.idx(31, 30), w.grid.idx(30, 31), w.grid.idx(31, 31)], "res");
  assert.ok(startBuilding(w, a, w.grid.idx(30, 30), "apartment_block"));
});

test("best type follows the era", () => {
  assert.equal(bestTypeFor("res", "T"), "hut_grass");
  assert.equal(bestTypeFor("res", "G"), "house_brick");
  assert.equal(bestTypeFor("ind", "T"), null);
});

test("troop cap follows population and conscription costs people", () => {
  const { w, a, n, rng } = setup();
  zonePlots(w, a, disc(w.grid, 30, 30, 4), "res");
  for (let i = 0; i < 80; i++) { n.stock.food = 500; econTick(w, 5, rng); }
  const cap = w.maxTroops(n);
  assert.ok(Math.abs(cap - (w.rules.troopBase + w.rules.troopPerPlot * n.plots + n.pop * 0.35)) < 1e-6, "land plus people");
  const before = n.pop;
  assert.ok(conscript(w, a, 20));
  assert.ok(Math.abs(before - n.pop - 5) < 1e-6);
});
