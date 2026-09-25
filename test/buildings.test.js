import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import {
  BUILDINGS, loadTable, installBuildings, addBuilding, removeBuilding, setPlots, buildingAt, nationBuildings,
  encodeBuildings, saveLayers, restoreLayers, ZONES, WOOD_FULL,
} from "../src/sim/buildings.js";
import { installConstruction, place, bulkUpgrade, listUpgradable } from "../src/sim/construction.js";
import { installCivilians, zonePlots, econTick } from "../src/sim/civilians.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { makeRng } from "../src/shared/rng.js";
import { TERRAIN, TID } from "../src/shared/terrain.js";
import { disc } from "../src/shared/grid.js";
import { hashBytes } from "../src/shared/codec.js";

function setup(w = 80, h = 60) {
  const map = makeTestMap(w, h, 5);
  const wo = new World(map, { spawnRadius: 6 });
  installBuildings(wo);
  const a = wo.addNation({ name: "A" }), b = wo.addNation({ name: "B" });
  for (let i = 0; i < wo.grid.size; i++) wo.terrain[i] = TID.grassland;
  assert.ok(wo.spawn(a, 20, 20));
  assert.ok(wo.spawn(b, 50, 20));
  return { wo, a, b };
}

function fresh(wo) {
  const copy = new World({ w: wo.grid.w, h: wo.grid.h, terrain: wo.terrain }, wo.rules);
  copy.owner.set(wo.owner);
  for (const n of wo.nations.values()) copy.nations.set(n.id, { ...n });
  installBuildings(copy);
  return copy;
}

test("the building table has unique names and numbers and valid upgrade steps", () => {
  const nums = new Set();
  for (const d of Object.values(BUILDINGS.table)) {
    assert.ok(Number.isInteger(d.num) && d.num > 0, d.id);
    assert.ok(!nums.has(d.num), `number ${d.num} is used twice`);
    nums.add(d.num);
    assert.equal(typeof d.civilian, "boolean", d.id);
    if (d.civilian) assert.ok(ZONES[d.zone], `${d.id} has zone ${d.zone}`);
  }
  assert.equal(BUILDINGS.table.hut_grass.civilian, true);
  assert.equal(BUILDINGS.table.chieftain_hut.civilian, false);
  assert.throws(() => loadTable({ buildings: [{ id: "x", num: 1, footprint: [1, 1] }, { id: "y", num: 1, footprint: [1, 1] }] }), /twice/);
  assert.throws(() => loadTable({ buildings: [{ id: "x", num: 1, footprint: [1, 1], next: "nope" }] }), /unknown nope/);
});

test("the registry indexes plots sparsely and keeps nation sets in step", () => {
  const { wo, a, b } = setup();
  const at = wo.grid.idx(20, 20);
  const hut = addBuilding(wo, { type: "chieftain_hut", owner: a, anchor: at });
  assert.equal(hut.plots.length, 4);
  assert.equal(wo.bld.at.size, 4);
  for (const i of hut.plots) assert.equal(buildingAt(wo, i), hut);
  assert.equal(buildingAt(wo, wo.grid.idx(25, 25)), null);
  assert.deepEqual([...nationBuildings(wo, a)], [hut]);
  assert.deepEqual([...nationBuildings(wo, b)], []);
  setPlots(wo, hut, [at]);
  assert.equal(wo.bld.at.size, 1);
  assert.equal(buildingAt(wo, wo.grid.idx(21, 21)), null);
  removeBuilding(wo, hut.id);
  assert.equal(wo.bld.at.size, 0);
  assert.equal(wo.bld.list.size, 0);
  assert.deepEqual([...nationBuildings(wo, a)], []);
  assert.equal(addBuilding(wo, { type: "hut_grass", owner: a, anchor: at }).id, 2, "ids are never reused");
});

test("player and civilian buildings share one registry and block each other", () => {
  const { wo, a } = setup();
  installConstruction(wo);
  const rng = makeRng(3);
  installCivilians(wo, rng);
  const n = wo.nations.get(a);
  n.money = 10000;
  n.stock.wood = 1000;
  const hall = place(wo, a, "chieftain_hut", wo.grid.idx(20, 20));
  assert.ok(hall.id, hall.error);
  assert.equal(hall.civilian, false);
  zonePlots(wo, a, disc(wo.grid, 20, 20, 4), "res");
  for (let k = 0; k < 40; k++) { n.stock.food = 500; econTick(wo, 5, rng); }
  const civ = [...wo.bld.list.values()].filter(x => x.civilian);
  assert.ok(civ.length >= 3, `civilian buildings ${civ.length}`);
  for (const x of civ) for (const i of x.plots) assert.ok(!hall.plots.includes(i), "a hut was built on the hall");
  assert.equal(place(wo, a, "watchtower_wood", civ[0].anchor).error, "something is already there");
  const rows = listUpgradable(wo, a, { filter: "all" });
  assert.ok(rows.length >= 1 && rows.every(r => r.civilian), "active huts are listed for upgrade; the hall is still under construction");
});

test("a save round trip restores buildings, zones and wood exactly", () => {
  const { wo, a, b } = setup();
  for (let i = 0; i < 200; i++) wo.terrain[i] = TID.forest;
  const bld = wo.bld;
  bld.wood.fill(0);
  for (let i = 0; i < 200; i++) bld.wood[i] = WOOD_FULL - (i % 7);
  zonePlots(wo, a, disc(wo.grid, 20, 20, 5), "res");
  zonePlots(wo, b, disc(wo.grid, 50, 20, 3), "com");
  const hut = addBuilding(wo, { type: "hut_grass", owner: a, anchor: wo.grid.idx(19, 19), state: "active", progress: 1, residents: 4.3 });
  addBuilding(wo, { type: "barracks", owner: b, anchor: wo.grid.idx(50, 20), progress: 0.37 });
  addBuilding(wo, { type: "cottage_timber", owner: a, anchor: wo.grid.idx(21, 21), state: "construction", upgrading: true });
  removeBuilding(wo, hut.id);
  addBuilding(wo, { type: "chieftain_hut", owner: a, anchor: wo.grid.idx(22, 18), state: "damaged", nuked: true });

  const saved = saveLayers(wo, true);
  assert.deepEqual(Object.keys(saved).sort(), ["buildings", "wood", "zone"]);
  const back = fresh(wo);
  const count = restoreLayers(back, saved);
  assert.equal(count, 3);
  assert.deepEqual([...back.bld.zone], [...bld.zone]);
  assert.deepEqual([...back.bld.wood], [...bld.wood]);
  assert.equal(hashBytes(encodeBuildings(back.bld)), hashBytes(encodeBuildings(bld)));
  for (const x of bld.list.values()) {
    const y = back.bld.list.get(x.id);
    assert.deepEqual({ ...y, progress: 0, residents: 0 }, { ...x, progress: 0, residents: 0 });
    assert.ok(Math.abs(y.progress - x.progress) < 1e-6 && Math.abs(y.residents - x.residents) < 1e-6);
  }
  assert.deepEqual([...back.bld.at].sort(), [...bld.at].sort());
  assert.equal(back.bld.next, bld.next);
  assert.equal(addBuilding(back, { type: "hut_grass", owner: a, anchor: 0 }).id, bld.next, "ids carry on after a load");
});

test("a save writes only the layers that changed", () => {
  const { wo, a } = setup();
  assert.deepEqual(Object.keys(saveLayers(wo)), []);
  zonePlots(wo, a, [wo.grid.idx(20, 20)], "res");
  assert.deepEqual(Object.keys(saveLayers(wo)), ["zone"]);
  assert.deepEqual(Object.keys(saveLayers(wo)), []);
  addBuilding(wo, { type: "hut_grass", owner: a, anchor: wo.grid.idx(20, 20) });
  assert.deepEqual(Object.keys(saveLayers(wo)), ["buildings"]);
  zonePlots(wo, a, [wo.grid.idx(0, 0)], "res");
  assert.deepEqual(Object.keys(saveLayers(wo)), [], "zoning land you do not own changes nothing");
});

test("a format 2 world loads with empty zones and buildings and wood from the terrain", () => {
  const { wo } = setup();
  for (let i = 0; i < 50; i++) wo.terrain[i] = TID.pine_forest;
  const back = fresh(wo);
  assert.equal(restoreLayers(back, {}), 0);
  assert.equal(back.bld.list.size, 0);
  assert.ok(back.bld.zone.every(z => z === 0));
  for (let i = 0; i < back.grid.size; i++) assert.equal(back.bld.wood[i], TERRAIN[back.terrain[i]].forest ? WOOD_FULL : 0);
  assert.deepEqual(Object.keys(saveLayers(back)), [], "nothing is written until something changes");
});

test("captured buildings pass to the capturer with their residents", () => {
  const { wo, a, b } = setup();
  const anchor = wo.grid.idx(20, 20);
  const hall = addBuilding(wo, { type: "chieftain_hut", owner: a, anchor, state: "active" });
  const hut = addBuilding(wo, { type: "hut_grass", owner: a, anchor: wo.grid.idx(18, 18), state: "active", residents: 5 });
  wo.bld.changed.clear();
  wo.claim(wo.grid.idx(21, 21), b);
  assert.equal(hall.owner, a, "a building changes hands when its anchor plot is taken");
  wo.claim(anchor, b);
  assert.equal(hall.owner, b);
  wo.claim(hut.anchor, b);
  assert.equal(hut.owner, b);
  assert.equal(hut.residents, 5);
  assert.deepEqual([...nationBuildings(wo, b)].map(x => x.id).sort(), [hall.id, hut.id]);
  assert.deepEqual([...nationBuildings(wo, a)], []);
  assert.ok(wo.bld.changed.has("buildings"));
  wo.claim(anchor, 0);
  assert.equal(hall.owner, 0, "cleared land leaves the building ownerless");
  wo.claim(anchor, a);
  assert.equal(hall.owner, a);
});

test("bulk upgrade moves the plot index to the new footprint", () => {
  const { wo, a } = setup();
  installConstruction(wo);
  const n = wo.nations.get(a);
  n.era = "M";
  n.money = 1e6;
  n.stock = { wood: 1000, stone: 1000 };
  const hut = place(wo, a, "chieftain_hut", wo.grid.idx(20, 20));
  hut.state = "active";
  const r = bulkUpgrade(wo, a, [{ id: hut.id, civilian: false }]);
  assert.deepEqual(r.done, [hut.id]);
  assert.equal(hut.type, "great_hall");
  for (const i of hut.plots) assert.equal(buildingAt(wo, i), hut);
});

test("every building type says in a sentence or two what it does, and the idle ones say so", () => {
  const defs = Object.values(BUILDINGS.table);
  for (const d of defs) {
    assert.equal(typeof d.description, "string", `${d.id} has a description`);
    assert.ok(d.description.length >= 20 && d.description.length <= 160, `${d.id}: ${d.description.length} characters`);
    assert.match(d.description, /^[A-Z].*\.$/, `${d.id} reads as a sentence`);
  }
  const idle = defs.filter(d => !d.gathers && !d.producer && !d.housing && !d.jobs && !d.makes);
  assert.ok(idle.length > 0);
  for (const d of idle) assert.match(d.description, /no effect/, `${d.id} does nothing yet and says so`);
});
