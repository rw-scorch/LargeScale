import test from "node:test";
import assert from "node:assert/strict";
import { ClientWorld } from "../src/shared/client.js";
import { MSG, PROTOCOL, frame, partFrames } from "../src/shared/protocol.js";
import { encodeRuns, gzip, hashBytes } from "../src/shared/codec.js";
import { makeTestMap } from "../src/shared/testmap.js";

function hello(extra = {}) {
  return {
    t: "hello", v: PROTOCOL, you: 2, w: 40, h: 30, map: { kind: "test", w: 40, h: 30, seed: 3 }, hashes: {},
    nations: [{ id: 1, name: "Bot 1", colour: "#8a8a8a", plots: 5, troops: 500, alive: true, spawned: true, bot: true, capital: 44 }, { id: 2, name: "Ryan", colour: "#4f8fe0", plots: 0, troops: 0, alive: true, spawned: false, bot: false, capital: null }],
    stacks: [[7, 1, 44, 120, 2]], chat: [{ t: 1, who: "Ryan", text: "hi" }], ...extra,
  };
}

test("frames that arrive before the map loads are kept and applied in order", async () => {
  const c = new ClientWorld(hello());
  const owner = new Uint16Array(40 * 30);
  owner.fill(1, 40, 50);
  assert.equal(c.frame(partFrames(MSG.TERRAIN_DIFF, new Uint32Array([3, 13]))[0]), null);
  assert.equal(c.frame(partFrames(MSG.OWNER, encodeRuns(owner))[0]), null);
  assert.equal(c.frame(frame(MSG.DIFF, new Uint32Array([60, 2]))), null);
  const changes = await c.loadBase(async () => gzip(new Uint8Array(0)));
  assert.deepEqual(changes.map(x => x?.layer ?? null), ["terrain", "owner", "owner"]);
  const base = makeTestMap(40, 30, 3).terrain;
  assert.equal(c.terrain[3], 13);
  assert.equal(c.terrain[4], base[4]);
  assert.equal(c.owner[45], 1);
  assert.equal(c.owner[60], 2);
  assert.deepEqual(c.frame(frame(MSG.DIFF, new Uint32Array([61, 2, 62, 2]))).plots, [61, 62]);
});

test("a crop is cut from the base file and checked against its hash", async () => {
  const full = new Uint8Array(100 * 50).map((_, i) => i % 41);
  const map = { kind: "crop", srcW: 100, srcH: 50, rect: { x: 10, y: 5, w: 40, h: 30 }, baseHash: hashBytes(full) };
  const c = new ClientWorld(hello({ map }));
  await c.loadBase(async () => gzip(full));
  assert.equal(c.terrain[0], full[5 * 100 + 10]);
  const bad = new ClientWorld(hello({ map: { ...map, baseHash: "00000000" } }));
  await assert.rejects(bad.loadBase(async () => gzip(full)), /out of date/);
});

test("state updates, joins, spawns, chat and victory update the client copy", () => {
  const c = new ClientWorld(hello());
  assert.equal(c.stacks.get(7).order, "advance");
  c.message({ v: PROTOCOL, t: "state", time: 12, n: [[2, 30, 480, 1, 1]], s: [[9, 2, 100, 200, 1]], gone: [7] });
  assert.equal(c.nations.get(2).plots, 30);
  assert.equal(c.stacks.has(7), false);
  assert.equal(c.stacks.get(9).order, "move");
  assert.deepEqual(c.myStacks().map(s => s.id), [9]);
  c.message({ v: PROTOCOL, t: "joined", nation: 3, name: "Friend", colour: "#d94a3a" });
  assert.equal(c.nations.get(3).name, "Friend");
  c.message({ v: PROTOCOL, t: "events", events: [{ type: "spawn", nation: 3, x: 5, y: 6 }] });
  assert.equal(c.nations.get(3).capital, 6 * 40 + 5);
  c.message({ v: PROTOCOL, t: "chat", who: "Friend", text: "yo", at: 5 });
  assert.equal(c.chat.at(-1).text, "yo");
  c.message({ v: PROTOCOL, t: "victory", winner: 2, name: "Ryan" });
  assert.equal(c.frozen, true);
  assert.equal(c.victory.name, "Ryan");
});

test("a frame or message from another protocol version marks the client stale", () => {
  const c = new ClientWorld(hello());
  const f = frame(MSG.DIFF, new Uint32Array([1, 1]));
  f[1] = PROTOCOL + 1;
  assert.equal(c.frame(f), null);
  assert.equal(c.stale, true);
  const d = new ClientWorld(hello());
  d.message({ v: PROTOCOL - 1, t: "state", time: 1, n: [], s: [], gone: [] });
  assert.equal(d.stale, true);
});
