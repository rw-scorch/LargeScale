import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../src/sim/territory.js";
import { generateDeposits, installResources, addProducer, produce, DEPOSITS, DEPOSIT_IDS } from "../../src/sim/resources.js";
import { makeRng } from "../../src/shared/rng.js";
import { makeTestMap } from "../../src/shared/testmap.js";
import { TERRAIN, TID } from "../../src/shared/terrain.js";

const one = (plot, id, amount) => ({ plots: Uint32Array.of(plot), type: Uint8Array.of(DEPOSIT_IDS.indexOf(id) + 1), amount: Float64Array.of(amount) });
const none = () => ({ plots: new Uint32Array(0), type: new Uint8Array(0), amount: new Float64Array(0) });

test("deposits only appear on their terrains", () => {
  const map = makeTestMap(200, 120, 5);
  const dep = generateDeposits(map, makeRng(1));
  for (let k = 0; k < dep.plots.length; k++) {
    const name = DEPOSIT_IDS[dep.type[k] - 1];
    assert.ok(DEPOSITS[name].terrains.includes(TERRAIN[map.terrain[dep.plots[k]]].name), name);
    if (k) assert.ok(dep.plots[k] > dep.plots[k - 1], "sorted by plot");
  }
  assert.ok(dep.plots.length > 50, `only ${dep.plots.length}`);
});

function oneNation(t = "hills") {
  const map = { w: 30, h: 30, terrain: new Uint8Array(900).fill(TID[t]) };
  const w = new World(map);
  const a = w.addNation({ name: "A" });
  w.spawn(a, 15, 15);
  w.nations.get(a).era = "M";
  return { w, a, map };
}

test("a mine empties a finite deposit and then goes idle", () => {
  const { w, a } = oneNation();
  const at = w.grid.idx(15, 15);
  installResources(w, one(at, "iron", 10), { hook: false });
  const m = addProducer(w, a, "mine_pit", at);
  assert.ok(m.id, m.error);
  let total = 0;
  for (let i = 0; i < 200; i++) { const o = produce(w, 1).get(a); total += o?.iron ?? 0; }
  assert.ok(Math.abs(total - 10) < 1e-3, `total ${total}`);
  assert.equal(m.idle, true);
  assert.ok(w.events.some(e => e.type === "deposit_depleted"));
});

test("a mine needs a deposit", () => {
  const { w, a } = oneNation();
  installResources(w, none(), { hook: false });
  assert.equal(addProducer(w, a, "mine_pit", w.grid.idx(15, 15)).error, "must sit on an ore deposit");
});

test("woodcutters clear forest into cleared land", () => {
  const { w, a } = oneNation("forest");
  installResources(w, none(), { hook: false });
  addProducer(w, a, "woodcutter_camp", w.grid.idx(15, 15));
  for (let i = 0; i < 2000; i++) produce(w, 1);
  assert.equal(w.terrain[w.grid.idx(15, 15)], TID.cleared);
});

test("farm yield follows fertility and season", () => {
  const { w, a } = oneNation("plains");
  let season = "summer";
  installResources(w, none(), { hook: false, seasonOf: () => season });
  addProducer(w, a, "crop_wheat", w.grid.idx(15, 15));
  const summer = produce(w, 10).get(a).food;
  season = "winter";
  const winter = produce(w, 10).get(a).food;
  assert.ok(Math.abs(summer - 0.04 * 10 * 1.1 * 1.2) < 1e-9);
  assert.ok(winter < summer / 5);
});
