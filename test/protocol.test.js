import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL, MSG, FRAME_BYTES, frame, partFrames, readFrame, applyPairs, PartCollector } from "../src/shared/protocol.js";
import { encodeRuns, decodeRuns } from "../src/shared/codec.js";
import { baseLayer, terrainDiff, cropLayer } from "../src/shared/maps.js";
import { makeRng } from "../src/shared/rng.js";

test("every frame carries its type, the protocol version and its part number", () => {
  const f = readFrame(frame(MSG.DIFF, new Uint32Array([5, 9, 7, 2])).buffer);
  assert.deepEqual([f.type, f.version, f.part, f.parts], [MSG.DIFF, PROTOCOL, 0, 1]);
  const owner = new Uint16Array(10);
  applyPairs(owner, f.body);
  assert.equal(owner[5], 9);
  assert.equal(owner[7], 2);
});

test("a large snapshot splits into parts under the frame limit and reassembles in any order", () => {
  const rng = makeRng(9);
  const layer = new Uint16Array(3_000_000);
  for (let i = 0; i < layer.length;) { const len = rng.int(1, 6); layer.fill(rng.int(0, 65535), i, i + len); i += len; }
  const runs = encodeRuns(layer);
  const frames = partFrames(MSG.OWNER, runs);
  assert.ok(frames.length > 1);
  assert.ok(frames.every(f => f.length <= FRAME_BYTES + 4));
  const c = new PartCollector();
  let whole = null;
  for (const f of [...frames].reverse()) whole = c.add(readFrame(f.buffer)) ?? whole;
  assert.deepEqual(decodeRuns(whole, new Uint16Array(layer.length)), layer);
});

test("terrain differences rebuild a crop's terrain from the base map", async () => {
  const srcW = 40, srcH = 30;
  const full = new Uint8Array(srcW * srcH).map((_, i) => i % 23);
  const map = { kind: "crop", srcW, srcH, rect: { x: 5, y: 4, w: 20, h: 10 } };
  const world = cropLayer(full, srcW, map.rect);
  world[3] = 30;
  world[150] = 31;
  const base = await baseLayer(map, 20, 10, async () => full);
  const diff = terrainDiff(base.terrain, world);
  assert.equal(diff.length, 4);
  const client = base.terrain.slice();
  applyPairs(client, readFrame(partFrames(MSG.TERRAIN_DIFF, diff)[0].buffer).body);
  assert.deepEqual(client, world);
});
