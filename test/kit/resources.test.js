import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../src/sim/territory.js";
import { generateDeposits, installResources, addProducer, produce, DEPOSITS } from "../../src/sim/resources.js";
import { makeRng } from "../../src/shared/rng.js";
import { makeTestMap } from "../../src/shared/testmap.js";
import { TERRAIN, TID } from "../../src/shared/terrain.js";

test("deposits only appear on their terrains", () => {
  const map = makeTestMap(200, 120, 5);
  const dep = generateDeposits(map, makeRng(1));
  let count = 0;
  for (let i = 0; i < dep.type.length; i++) {
    if (!dep.type[i]) continue;
    count++;
    const name = dep.ids[dep.type[i] - 1];
    assert.ok(DEPOSITS[name].terrains.includes(TERRAIN[map.terrain[i]].name), name);
  }
  assert.ok(count > 50, `only ${count}`);
});

function oneNation(t = "hills") {
  const map = { w: 30, h: 30, terrain: new Uint8Array(900).fill(TID[t]) };
  const w = new World(map);
  const a = w.addNation({ name: "A" });
  w.spawn(a, 15, 15);
  return { w, a, map };
}

test("a mine empties a finite deposit and then goes idle", () => {
  const { w, a, map } = oneNation();
  const dep = { type: new Uint8Array(900), amount: new Float32Array(900), ids: Object.keys(DEPOSITS) };
  const at = w.grid.idx(15, 15);
  dep.type[at] = dep.ids.indexOf("iron") + 1;
  dep.amount[at] = 10;
  installResources(w, dep);
  const m = addProducer(w, a, "mine_pit", at);
  assert.ok(m.id);
  let total = 0;
  for (let i = 0; i < 200; i++) { const o = produce(w, 1).get(a); total += o?.iron ?? 0; }
  assert.ok(Math.abs(total - 10) < 1e-3, `total ${total}`);
  assert.equal(m.idle, true);
  assert.ok(w.events.some(e => e.type === "deposit_depleted"));
});

test("a mine needs a deposit", () => {
  const { w, a } = oneNation();
  installResources(w, { type: new Uint8Array(900), amount: new Float32Array(900), ids: Object.keys(DEPOSITS) });
  assert.equal(addProducer(w, a, "mine_pit", w.grid.idx(15, 15)).error, "needs a deposit");
});

test("woodcutters clear forest into cleared land", () => {
  const { w, a } = oneNation("forest");
  installResources(w, { type: new Uint8Array(900), amount: new Float32Array(900), ids: Object.keys(DEPOSITS) });
  addProducer(w, a, "woodcutter_camp", w.grid.idx(15, 15));
  for (let i = 0; i < 2000; i++) produce(w, 1);
  assert.equal(w.terrain[w.grid.idx(15, 15)], TID.cleared);
});

test("farm yield follows fertility and season", () => {
  const { w, a } = oneNation("plains");
  let season = "summer";
  installResources(w, { type: new Uint8Array(900), amount: new Float32Array(900), ids: Object.keys(DEPOSITS) }, () => season);
  addProducer(w, a, "field", w.grid.idx(15, 15));
  const summer = produce(w, 10).get(a).food;
  season = "winter";
  const winter = produce(w, 10).get(a).food;
  assert.ok(Math.abs(summer - 0.04 * 10 * 1.1 * 1.2) < 1e-9);
  assert.ok(winter < summer / 5);
});
