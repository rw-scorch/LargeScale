import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CROPS, cropRect, cropLayer } from "../src/shared/maps.js";
import { parseWorldConfig, defaultBots } from "../src/worldconfig.js";
import { isLand } from "../src/shared/terrain.js";

const META = { w: 3600, h: 1440, north: 84, south: -60 };

test("a lat/long box becomes a pixel rectangle on the Earth grid", () => {
  assert.deepEqual(cropRect(META, CROPS.europe), { x: 1550, y: 120, w: 700, h: 380 });
  assert.deepEqual(cropRect(META, { west: -180, east: 180, north: 84, south: -60 }), { x: 0, y: 0, w: 3600, h: 1440 });
  assert.equal(cropRect(META, { west: -10, east: 10, north: 88, south: 0 }), null);
  assert.equal(cropRect(META, { west: 10, east: -10, north: 50, south: 40 }), null);
});

test("cropping copies the right rows and columns", () => {
  const src = new Uint8Array(20 * 10).map((_, i) => i % 251);
  const out = cropLayer(src, 20, { x: 3, y: 2, w: 5, h: 4 });
  assert.equal(out.length, 20);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) assert.equal(out[y * 5 + x], src[(y + 2) * 20 + x + 3]);
});

test("world config accepts the map choices and bot counts, and rejects the rest", () => {
  assert.deepEqual(parseWorldConfig({}).map, { kind: "test", w: 320, h: 200, seed: 5 });
  assert.deepEqual(parseWorldConfig({ map: "earth", bots: 400 }), { map: { kind: "earth" }, bots: 400 });
  assert.equal(parseWorldConfig({ map: "europe" }).map.kind, "crop");
  assert.equal(parseWorldConfig({ map: { west: 0, east: 20, north: 50, south: 40 } }).map.name, "custom");
  assert.match(parseWorldConfig({ map: "mars" }).error, /unknown map/);
  assert.match(parseWorldConfig({ map: "toString" }).error, /unknown map/);
  assert.match(parseWorldConfig({ map: "earth", bots: 401 }).error, /bots/);
  assert.match(parseWorldConfig({ map: "earth", bots: 2.5 }).error, /bots/);
  assert.match(parseWorldConfig({ w: 100000, h: 100 }).error, /test map/);
  assert.match(parseWorldConfig({ map: { west: 20, east: 0, north: 50, south: 40 } }).error, /crop/);
  assert.equal(defaultBots(1_554_650), 311);
  assert.equal(defaultBots(126_804), 25);
  assert.equal(defaultBots(10_000_000), 400);
});

test("the Europe crop of the real map has the expected land", { skip: !existsSync("public/map/terrain.bin") }, () => {
  const meta = JSON.parse(readFileSync("public/map/meta.json", "utf8"));
  const t = new Uint8Array(readFileSync("public/map/terrain.bin"));
  const rect = cropRect(meta, CROPS.europe);
  const crop = cropLayer(t, meta.w, rect);
  let land = 0;
  for (const v of crop) if (isLand(v)) land++;
  assert.equal(land, 126_804);
});
