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

test("a train row carries its trip's gold and slides from plot to plot", () => {
  const c = new ClientWorld(hello());
  c.setConvoy([4, 1, 50, "gold", 30, "I", 90, 0, 1]);
  const t = c.convoys.get(4);
  assert.deepEqual([t.train, t.kind, t.amount, t.ship, t.prev], [true, "gold", 30, null, 50]);
  c.setConvoy([4, 1, 51, "gold", 30, "I", 90, 0, 1]);
  assert.equal(c.convoys.get(4).prev, 50, "it slides from where it was");
  c.message({ v: PROTOCOL, t: "state", time: 1, n: [], s: [], gone: [], cg: [4] });
  assert.equal(c.convoys.has(4), false, "gone when it arrives");
});

test("a stack that moves keeps where it was, so the client can walk its soldiers between plots", () => {
  const rules = { troopsEach: 10, fieldCap: 1000, maxCompanies: 100, spacing: 0.34, drawZoom: 14, drawArea: 900 };
  const c = new ClientWorld(hello({ soldierRules: rules }));
  assert.deepEqual(c.soldierRules, rules);
  c.message({ v: PROTOCOL, t: "state", time: 1, n: [], s: [[7, 1, 45, 120, 2]], gone: [] });
  const s = c.stacks.get(7);
  assert.equal(s.prev, 44);
  assert.ok(Date.now() - s.movedAt < 1000);
  c.message({ v: PROTOCOL, t: "state", time: 2, n: [], s: [[7, 1, 45, 110, 2]], gone: [] });
  assert.equal(c.stacks.get(7).prev, 44, "losing troops in place keeps the last move");
  assert.equal(c.stacks.get(7).movedAt, s.movedAt);
});

test("pilot positions glide between samples, and shots are kept for a second", () => {
  const c = new ClientWorld(hello({ pilotRules: { sendEvery: 100 }, pilots: [[0, 7, 1, 44.5, 1.5, 0]] }));
  assert.deepEqual(c.pilotAt("s:7"), [44.5, 1.5, 0]);
  c.message({ v: PROTOCOL, t: "pilots", p: [[0, 7, 1, 45.5, 1.5, 0], [1, 3, 2, 10.2, 5.7, 1.57]], shots: [[45.5, 1.5, 47.5, 1.5, 0, 1, 6.2]] });
  const p = c.pilots.get("s:7");
  assert.deepEqual([p.px, p.x], [44.5, 45.5], "it glides from the last sample");
  assert.ok(c.pilotAt("m:3"));
  assert.deepEqual(c.shots.map(s => [s.x1, s.shell, s.hit]), [[47.5, false, 6.2]]);
  c.message({ v: PROTOCOL, t: "pilots", p: [], shots: [] });
  assert.equal(c.pilots.size, 0, "let go: nothing piloted");
  assert.equal(c.shots.length, 1, "the shot still shows for a moment");
});

test("the browser keeps every field of the purse the server sends", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/world.js", import.meta.url), "utf8");
  const call = src.match(/return purseOf\(n, \{([^\n]*)\}\);/);
  assert.ok(call, "the purse call is found");
  const keys = [...call[1].matchAll(/(?:^|, )([a-zA-Z]+):/g)].map(m => m[1]);
  assert.ok(keys.includes("sams") && keys.includes("cheats") && keys.length >= 10, keys.join(" "));
  const c = new ClientWorld({ t: "hello", v: 5, you: 1, w: 4, h: 4, map: { kind: "test" }, hashes: {}, nations: [], stacks: [], units: [], chat: [] });
  const msg = { t: "purse", money: 1, era: "T", town: {} };
  for (const k of keys) msg[k] = { sent: k };
  c.message(msg);
  for (const k of keys) assert.deepEqual(c.purse[k], { sent: k }, `the purse keeps ${k}`);
});

test("the browser follows a warhead from launch to impact, and reads its silos from the purse", () => {
  const c = new ClientWorld(hello({ nukeRules: { warheads: { atomic: { name: "Atomic warhead", radius: 8, inner: 3 } }, scale: 1 }, nukes: [{ id: 7, nation: 1, kind: "atomic", from: 3, target: 50, launched: 10, due: 70, toward: 2, radius: 8, inner: 3 }] }));
  assert.deepEqual(c.nukes.map(f => [f.id, f.toward, f.due]), [[7, 2, 70]], "a warhead already in flight comes with the hello");
  c.message({ t: "events", events: [{ type: "nuke_launched", id: 8, nation: 1, kind: "atomic", from: 3, target: 60, launched: 20, due: 80, toward: 2, radius: 8, inner: 3, seconds: 60 }] });
  assert.equal(c.nukes.length, 2);
  c.message({ t: "events", events: [{ type: "nuke_intercepted", id: 7, nation: 1, by: 2, kind: "atomic", target: 50 }, { type: "nuke_detonated", id: 8, by: 1, nation: 2, at: 60, kind: "atomic", radius: 8, inner: 3 }] });
  assert.deepEqual([c.nukes.length, c.blasts.map(b => [b.kind, b.plot, b.radius])], [0, [["intercept", 50, 8], ["blast", 60, 8]]]);
  c.message({ t: "purse", money: 5, era: "Mo", town: {}, nukes: { silos: { 4: ["atomic", 0, 1] }, abms: { 9: [1, 2, 120] } } });
  assert.deepEqual([c.siloOf(4), c.abmOf(9), c.siloOf(5)], [{ kind: "atomic", left: 0, ready: true }, { interceptors: 1, max: 2, reloadIn: 120 }, null]);
  c.message({ t: "state", time: 100, n: [], s: [], gone: [] });
  assert.ok(c.simNow() >= 100 && c.simNow() < 102.5, "game time runs on between state messages");
  c.message({ t: "nukes", on: false, info: { nukes: false } });
  assert.equal(c.info.nukes, false);
});
