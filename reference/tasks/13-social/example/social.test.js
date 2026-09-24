import test from "node:test";
import assert from "node:assert/strict";
import { blankFlag, encodeFlag, decodeFlag, floodFill, FLAG_W } from "./flag.js";
import { ChatHub, cleanText } from "./chat.js";
import { Diplomacy } from "../../11-diplomacy-factions/example/diplomacy.js";

test("flags round-trip and stay small", () => {
  const f = blankFlag(9);
  for (let x = 0; x < FLAG_W; x++) f[10 * FLAG_W + x] = 0;
  f[3] = 2;
  const s = encodeFlag(f);
  assert.ok(s.length < 60, s);
  assert.deepEqual(decodeFlag(s), f);
});

test("bad flag strings are rejected", () => {
  assert.equal(decodeFlag("f1.zz"), null);
  assert.equal(decodeFlag("hello"), null);
  assert.equal(decodeFlag("f1.AA"), null);
  assert.equal(decodeFlag(123), null);
});

test("flood fill stops at other colours", () => {
  const f = blankFlag(0);
  for (let y = 0; y < 20; y++) f[y * FLAG_W + 16] = 1;
  assert.equal(floodFill(f, 2, 2, 5), 16 * 20);
  assert.equal(f[FLAG_W - 1], 0);
});

test("chat cleans text, routes channels and rate limits", () => {
  const d = new Diplomacy();
  d.createFaction(1, "North");
  const nations = [1, 2, 3].map(id => ({ id, human: true }));
  const hub = new ChatHub();
  assert.equal(cleanText("  hi\u202e   there \u0007"), "hi there");
  const g = hub.post(1, { channel: "global", text: "hello" }, 0, nations, d);
  assert.deepEqual(g.to, [1, 2, 3]);
  assert.deepEqual(hub.post(1, { channel: "faction", text: "ours" }, 0.1, nations, d).to, [1]);
  assert.equal(hub.post(2, { channel: "faction", text: "x" }, 0.1, nations, d).error, "no such channel");
  const p = hub.post(2, { channel: "private", to: 3, text: "psst" }, 0.1, nations, d);
  assert.equal(p.message.ch, "p2-3");
  for (let i = 0; i < 3; i++) hub.post(1, { channel: "global", text: "spam" }, 0.2, nations, d);
  assert.equal(hub.post(1, { channel: "global", text: "spam" }, 0.3, nations, d).error, "slow down");
  assert.ok(hub.post(1, { channel: "global", text: "later" }, 3, nations, d).message);
});

test("typing indicators expire", () => {
  const hub = new ChatHub();
  const key = hub.setTyping(4, { channel: "global" }, 10, null);
  assert.deepEqual(hub.whoIsTyping(key, 12), [4]);
  assert.deepEqual(hub.whoIsTyping(key, 20), []);
});
