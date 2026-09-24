import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { launch, tryIntercept, detonate } from "./nukes.js";
import { tourismIncome } from "./tourism.js";
import { makeRng } from "../../../shared/rng.js";
import { TID } from "../../../shared/terrain.js";

function two() {
  const map = { w: 100, h: 40, terrain: new Uint8Array(4000).fill(TID.grassland) };
  const w = new World(map, { spawnRadius: 8 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 15, 20); w.spawn(b, 80, 20);
  return { w, a, b };
}

test("nukes need war and fly for a while", () => {
  const { w, a, b } = two();
  w.hostile = () => false;
  assert.equal(launch(w, a, w.grid.idx(15, 20), w.grid.idx(80, 20), "atomic").error, "you are not at war with them");
  w.hostile = (x, y) => x !== y;
  const { missile } = launch(w, a, w.grid.idx(15, 20), w.grid.idx(80, 20), "atomic");
  assert.ok(missile.due > 60);
  assert.equal(launch(w, a, 0, w.grid.idx(80, 20), "atomic", { nukes: false }).error, "nukes are off in this world");
});

test("interceptors only work in range and only against enemies", () => {
  const { w, a, b } = two();
  const m = { owner: a, target: w.grid.idx(80, 20) };
  const always = { chance: () => true };
  assert.equal(tryIntercept(w, m, [{ type: "sam_site", owner: b, at: w.grid.idx(50, 20) }], always), false);
  assert.equal(tryIntercept(w, m, [{ type: "sam_site", owner: b, at: w.grid.idx(82, 20) }], always), true);
  assert.equal(tryIntercept(w, m, [{ type: "sam_site", owner: a, at: w.grid.idx(82, 20) }], always), false);
});

test("detonation clears the centre and wrecks stacks", () => {
  const { w, a, b } = two();
  const at = w.grid.idx(80, 20);
  const near = w.createStack(b, at, 200);
  const edge = w.createStack(b, at, 200);
  edge.pos = w.grid.idx(86, 20);
  const plotsBefore = w.nations.get(b).plots;
  const hit = detonate(w, { owner: a, target: at, kind: "atomic" });
  assert.equal(w.terrain[at], TID.crater);
  assert.equal(w.owner[at], 0);
  assert.equal(w.stacks.has(near.id), false);
  assert.ok(Math.abs(edge.troops - 80) < 1e-9);
  assert.ok(w.nations.get(b).plots < plotsBefore);
  assert.ok(hit.cleared > 20);
});

test("tourism follows seasons, wonders and transport links", () => {
  const summer = tourismIncome(["beach_resort", "ski_resort"], "summer");
  const winter = tourismIncome(["beach_resort", "ski_resort"], "winter");
  assert.ok(summer < winter);
  const plain = tourismIncome(["museum", "zoo"], "summer");
  const linked = tourismIncome(["museum", "zoo"], "summer", { airport: true });
  assert.ok(Math.abs(linked / plain - 1.25) < 1e-9);
  assert.ok(tourismIncome(["museum", "wonder_pyramid"], "summer") > tourismIncome(["museum"], "summer") + 8);
});
