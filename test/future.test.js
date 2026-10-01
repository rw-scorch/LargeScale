import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { World } from "../src/sim/territory.js";
import { addBuilding, BUILDINGS } from "../src/sim/buildings.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installCivilians, zonePlots, tryUpgrade, bestTypeFor } from "../src/sim/civilians.js";
import { installResources, produce, goldOf } from "../src/sim/resources.js";
import { installPower, powerTick, powerView } from "../src/sim/power.js";
import { installEffects } from "../src/sim/effects.js";
import { installResearch, complete, TREE } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

const T = BUILDINGS.table;

function world({ research = false } = {}) {
  const W = 50, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  for (let y = 20; y < H; y++) for (let x = 0; x < 20; x++) terrain[y * W + x] = TID.desert;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installConstruction(w);
  installCivilians(w, makeRng(7));
  installResources(w, undefined, { rng: makeRng(8), hook: false, seasonOf: () => "winter" });
  installEffects(w);
  installPower(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true });
  w.spawn(a, 3, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), a);
  if (research) installResearch(w);
  const n = w.nations.get(a);
  Object.assign(n, { money: 100000, era: "F", pop: 0 });
  const put = (type, x, y, extra = {}) => addBuilding(w, { type, owner: a, anchor: g.idx(x, y), state: "active", progress: 1, ...extra });
  return { w, g, a, n, put };
}

test("the Future Age needs fourteen Modern nodes in three branches, and every Future building of Part B is behind a node", () => {
  const age = TREE.nodes.find(t => t.id === "age_future");
  assert.deepEqual([age.era, age.advances, age.need, age.icon], ["Mo", "F", { nodes: 14, branches: 3 }, "era_badge_F"]);
  const locks = lockMap(TREE);
  const ids = ["fusion_reactor", "vertical_farm", "eco_tower", "dome_habitat", "arcology", "wonder_orbital_elevator", "wonder_launch_complex"];
  assert.deepEqual(ids.map(id => locks.buildings.get(id)), ["fusion_power", "vertical_farming", "green_cities", "green_cities", "arcologies", "space_flight", "space_flight"]);
  assert.ok(ids.every(id => T[id].era === "F"));
  const manifest = JSON.parse(readFileSync("public/assets/manifest.json", "utf8")), families = new Set(manifest.sprites.map(s => s.family));
  assert.deepEqual(ids.filter(id => !families.has(id)), [], "every one has art");
  assert.deepEqual(ids.map(id => T[id].fp ?? T[id].footprint).map(f => f.join("x")), ["3x3", "2x2", "2x2", "2x2", "3x3", "2x2", "3x3"], "footprints match the art");
});

test("a fusion reactor powers its grid for nothing, even with an empty treasury; a coal plant needs gold", () => {
  const { w, n, put } = world();
  const reactor = put("fusion_reactor", 2, 2), farm = put("vertical_farm", 8, 3), far = put("vertical_farm", 30, 3);
  put("coal_plant", 40, 10);
  const mill = put("vertical_farm", 44, 10);
  n.money = 0;
  powerTick(w, 5);
  assert.deepEqual([farm.power, far.power, mill.power], [1, 0.5, 0.5], "full power beside the reactor, half off the grid and on a coal plant with no gold to burn");
  assert.equal(n.money, 0, "nothing was paid");
  assert.deepEqual(powerView(w, n).plants[reactor.id], [1, 3]);
  n.money = 1000;
  powerTick(w, 5);
  assert.equal(mill.power, 1);
  assert.ok(n.money < 1000, "the coal plant burns gold again");
});

test("a vertical farm earns the same on desert in winter as anywhere, where a wheat field cannot even be placed", () => {
  const { w, g, a, n, put } = world();
  assert.equal(canPlace(w, a, "crop_wheat", g.idx(5, 25)), "the soil is too poor to farm");
  assert.equal(canPlace(w, a, "vertical_farm", g.idx(5, 25)), null);
  n.stats = { worked: 1 };
  const farm = put("vertical_farm", 5, 25);
  farm.power = 1;
  const got = produce(w, 10).get(a);
  assert.ok(Math.abs(got - goldOf("food", 4 * 10)) < 1e-9, `4 food a second for 10 s: ${got}`);
  farm.power = 0.5;
  assert.ok(Math.abs(produce(w, 10).get(a) - goldOf("food", 20)) < 1e-9, "half without power");
});

test("Future towns build dome habitats on new land, and an eco tower grows into an arcology that takes in the homes inside it", () => {
  const { w, g, a, n, put } = world({ research: true });
  assert.equal(bestTypeFor("res", "F"), "dome_habitat", "eco towers and arcologies only come by upgrade");
  for (const id of ["fire_keeping", "high_rise", "green_cities"]) complete(w, n, id);
  const plots = [];
  for (let y = 10; y < 16; y++) for (let x = 20; x < 26; x++) plots.push(g.idx(x, y));
  zonePlots(w, a, plots, "res");
  for (let t = 0; t < 30; t++) w.tick(1);
  const built = [...w.bld.list.values()].filter(b => b.civilian).map(b => b.type);
  assert.ok(built.length && built.every(t => t === "dome_habitat"), `domes only: ${built.join(", ")}`);
  const area = [];
  for (let y = 2; y < 5; y++) for (let x = 30; x < 33; x++) area.push(g.idx(x, y));
  zonePlots(w, a, area, "res");
  const tower = put("eco_tower", 30, 2, { residents: 900 }), left = put("tenement", 32, 2, { residents: 50 }), below = put("tenement", 31, 4, { residents: 40 });
  assert.equal(tryUpgrade(w, tower, true), false, "not before Arcologies");
  complete(w, n, "arcologies");
  assert.equal(tryUpgrade(w, tower, true), true);
  assert.deepEqual([tower.type, tower.plots.length, tower.residents], ["arcology", 9, 990], "the tenements' people move in");
  assert.ok(!w.bld.list.has(left.id) && !w.bld.list.has(below.id));
  const blocked = put("eco_tower", 40, 2), stranger = put("hut_grass", 42, 4);
  zonePlots(w, a, [g.idx(40, 2), g.idx(41, 2), g.idx(42, 2), g.idx(40, 3), g.idx(41, 3), g.idx(42, 3), g.idx(40, 4), g.idx(41, 4)], "res");
  assert.equal(tryUpgrade(w, blocked, true), false, "a plot outside the residential zone stops it");
  assert.ok(w.bld.list.has(stranger.id));
});
