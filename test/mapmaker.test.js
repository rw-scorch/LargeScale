import test from "node:test";
import assert from "node:assert/strict";
import { gzip } from "../src/shared/codec.js";
import { TID, TERRAIN } from "../src/shared/terrain.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { writeMapFile, readMapFile, checkMap, MAP_MAGIC } from "../src/shared/mapfile.js";
import { Edit, paintDisc, paintLine, fill, undo, redo } from "../src/shared/mapedit.js";
import { parseWorldConfig } from "../src/worldconfig.js";
import rules from "../data/rules.json" with { type: "json" };

const LIMITS = rules.maps;

test("a map file round-trips name, size, latitudes and every plot", async () => {
  const { terrain } = makeTestMap(160, 100, 9);
  const bytes = await writeMapFile({ name: " Isles ", w: 160, h: 100, terrain, north: 60, south: 40 });
  const r = await readMapFile(bytes, LIMITS);
  assert.equal(r.error, undefined);
  assert.deepEqual([r.map.name, r.map.w, r.map.h, r.map.north, r.map.south], ["Isles", 160, 100, 60, 40]);
  assert.deepEqual(r.map.terrain, terrain);
  assert.ok(r.land > 0 && /^[0-9a-f]{8}$/.test(r.hash));
});

test("bad map files are refused with a reason", async () => {
  const sea = new Uint8Array(100 * 100).fill(TID.ocean);
  assert.match((await readMapFile(new Uint8Array([1, 2, 3]))).error, /not a Large Scale map/);
  assert.match((await readMapFile(await gzip(new TextEncoder().encode("hello world, not a map")))).error, /not a Large Scale map/);
  assert.match((await readMapFile(await writeMapFile({ name: "Sea", w: 100, h: 100, terrain: sea }), LIMITS)).error, /land plots/);
  const odd = sea.slice();
  odd[5] = TERRAIN.length;
  assert.match(checkMap({ name: "Odd", w: 100, h: 100, terrain: odd }), /unknown terrain/);
  assert.match(checkMap({ name: "Tiny", w: 10, h: 10, terrain: new Uint8Array(100) }, LIMITS), /sides must be/);
  assert.match(checkMap({ name: "", w: 100, h: 100, terrain: sea }, LIMITS), /needs a name/);
  assert.match(checkMap({ name: "Flip", w: 100, h: 100, terrain: makeTestMap(100, 100, 2).terrain, north: 10, south: 20 }, LIMITS), /latitudes/);
});

test("a file that unpacks too large is stopped before it fills memory", async () => {
  const big = new Uint8Array(MAP_MAGIC.length + 5 + 30000);
  big.set(new TextEncoder().encode(MAP_MAGIC));
  assert.match((await readMapFile(await gzip(big), { maxPlots: 1000 })).error, /more than a map can hold/);
});

test("brush, line and fill change only what they should, and undo and redo restore it", () => {
  const w = 40, h = 30, terrain = new Uint8Array(w * h).fill(TID.ocean), before = terrain.slice();
  const e = new Edit(terrain);
  paintDisc(e, w, h, 10, 10, 3, TID.grassland);
  const disc = e.size;
  assert.ok(disc >= 20 && disc <= 32, `disc of radius 3 painted ${disc}`);
  assert.equal(terrain[10 * w + 10], TID.grassland);
  assert.equal(terrain[10 * w + 14], TID.ocean);
  paintLine(e, w, h, 0, 25, 39, 25, 1, TID.mountain);
  for (let x = 0; x < w; x++) assert.equal(terrain[25 * w + x], TID.mountain);
  const step = e.done(TID.grassland);
  undo(terrain, step);
  assert.deepEqual(terrain, before);

  const f = new Edit(terrain);
  paintLine(f, w, h, 20, 0, 20, 29, 1, TID.mountain);
  fill(f, w, h, 5, 5, TID.plains);
  for (let y = 0; y < h; y++) {
    assert.equal(terrain[y * w + 5], TID.plains);
    assert.equal(terrain[y * w + 30], TID.ocean);
  }
  const s2 = f.done(TID.plains), after = terrain.slice();
  undo(terrain, s2);
  assert.deepEqual(terrain, before);
  for (let k = 0; k < s2.idx.length; k++) terrain[s2.idx[k]] = after[s2.idx[k]];
  assert.deepEqual(terrain, after);
});

test("a brush limited to water leaves land alone, and redo repeats a single-terrain stroke", () => {
  const w = 20, h = 20, terrain = new Uint8Array(w * h).fill(TID.ocean);
  terrain[10 * w + 10] = TID.forest;
  const e = new Edit(terrain);
  paintDisc(e, w, h, 10, 10, 4, TID.shallows, t => !TERRAIN[t].land);
  assert.equal(terrain[10 * w + 10], TID.forest);
  assert.equal(terrain[10 * w + 11], TID.shallows);
  const step = e.done(TID.shallows);
  undo(terrain, step);
  assert.equal(terrain[10 * w + 11], TID.ocean);
  redo(terrain, step);
  assert.equal(terrain[10 * w + 11], TID.shallows);
});

test("world config accepts a saved map by id and nothing else that looks like one", () => {
  const ok = parseWorldConfig({ map: "custom:Ab3_-x9" });
  assert.deepEqual(ok.map, { kind: "custom", id: "Ab3_-x9" });
  assert.match(parseWorldConfig({ map: "custom:../etc" }).error, /unknown map/);
  assert.match(parseWorldConfig({ map: "custom:Ab3", detail: "fine" }).error, /fine detail/);
});
