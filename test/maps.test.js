import test from "node:test";
import { hasMap, readMap } from "./mapfile.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CROPS, cropRect, cropLayer } from "../src/shared/maps.js";
import { parseWorldConfig, defaultBots, scaledRules } from "../src/worldconfig.js";
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

test("the Europe crop of the real map has the expected land", { skip: !hasMap() }, () => {
  const { meta, terrain: t } = readMap();
  const rect = cropRect(meta, CROPS.europe);
  const crop = cropLayer(t, meta.w, rect);
  let land = 0;
  for (const v of crop) if (isLand(v)) land++;
  assert.equal(land, 126_804);
});

test("region maps default to fine detail, the whole Earth to normal, and rules scale with it", () => {
  assert.equal(parseWorldConfig({ map: "europe" }).map.dir, "map/fine");
  assert.equal(parseWorldConfig({ map: "europe", detail: "normal" }).map.dir, undefined);
  assert.equal(parseWorldConfig({ map: { west: 0, east: 10, north: 50, south: 40 } }).map.dir, "map/fine");
  assert.equal(parseWorldConfig({ map: "earth" }).map.dir, undefined);
  assert.match(parseWorldConfig({ map: "earth", detail: "fine" }).error, /region maps/);
  assert.match(parseWorldConfig({ map: "europe", detail: "ultra" }).error, /fine or normal/);
  const one = scaledRules(1), two = scaledRules(2);
  assert.equal(two.territory.stackSpeed, one.territory.stackSpeed * 2, "distances double");
  assert.equal(two.territory.advanceRadius, one.territory.advanceRadius * 2);
  assert.equal(two.combat.engageRange, one.combat.engageRange * 2);
  assert.equal(two.territory.advanceRate, one.territory.advanceRate * 4, "amounts per area go up four times");
  assert.equal(two.territory.troopBase, one.territory.troopBase * 4);
  assert.equal(two.territory.troopPerPlot, one.territory.troopPerPlot, "per-plot numbers stay");
  assert.equal(defaultBots(4 * 126_804, 2), defaultBots(126_804, 1), "bots follow land area, not plot count");
});

test("the fine map is twice as detailed and its Europe crop has four times the plots", { skip: !hasMap("public/map/fine") || !hasMap() }, () => {
  const { meta, terrain: t } = readMap("public/map/fine");
  const coarse = JSON.parse(readFileSync("public/map/meta.json", "utf8"));
  assert.deepEqual([meta.w, meta.h], [coarse.w * 2, coarse.h * 2]);
  assert.equal(t.length, meta.w * meta.h);
  const rect = cropRect(meta, CROPS.europe);
  assert.deepEqual([rect.w, rect.h], [1400, 760]);
  let land = 0;
  for (const v of cropLayer(t, meta.w, rect)) if (isLand(v)) land++;
  console.log(`fine Europe: ${rect.w} by ${rect.h}, ${land} land plots, ${(land / 126_804).toFixed(2)} times the normal crop`);
  assert.ok(land > 3.6 * 126_804 && land < 4.4 * 126_804);
});

test("fine maps allow a quarter of the bots, since each bot takes four times the plots", () => {
  assert.equal(parseWorldConfig({ map: "europe", bots: 100 }).bots, 100);
  assert.match(parseWorldConfig({ map: "europe", bots: 101 }).error, /0 to 100/);
  assert.equal(parseWorldConfig({ map: "europe", detail: "normal", bots: 400 }).bots, 400);
  assert.equal(parseWorldConfig({ map: "earth", bots: 400 }).bots, 400);
  assert.equal(defaultBots(40_000_000, 2), 100);
});
