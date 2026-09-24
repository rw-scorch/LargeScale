import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyRequest, handleInteraction, message, optionValue, userIdOf, TYPE, REPLY, COMMANDS } from "../src/discord.js";
import { NotifyQueue, formatBatch, prefsFor, wants, inQuietHours } from "../src/notify.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function signed(bodyObject) {
  const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = hex(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  const body = JSON.stringify(bodyObject);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = hex(await webcrypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(ts + body)));
  return { pub, body, ts, sig };
}

test("a properly signed request passes and a tampered one fails", async () => {
  const { pub, body, ts, sig } = await signed({ type: 1 });
  assert.equal(await verifyRequest(body, sig, ts, pub), true);
  assert.equal(await verifyRequest(body + " ", sig, ts, pub), false);
  assert.equal(await verifyRequest(body, sig, String(Number(ts) + 1), pub), false);
  assert.equal(await verifyRequest(body, sig.replace(/^../, "00"), ts, pub), false);
  assert.equal(await verifyRequest(body, null, ts, pub), false);
});

test("ping is answered with pong, and unknown commands are handled", async () => {
  assert.deepEqual(await handleInteraction({ type: TYPE.PING }, {}), { type: REPLY.PONG });
  const r = await handleInteraction({ type: TYPE.COMMAND, data: { name: "nope" } }, {});
  assert.match(r.data.content, /Unknown command/);
});

test("command options and the calling user are read from either shape", async () => {
  const i = { type: TYPE.COMMAND, data: { name: "alerts", options: [{ name: "state", value: "on" }] }, member: { user: { id: "42" } } };
  assert.equal(optionValue(i, "state"), "on");
  assert.equal(userIdOf(i), "42");
  assert.equal(userIdOf({ user: { id: "7" } }), "7");
  const handled = await handleInteraction(i, { alerts: async x => message("state " + optionValue(x, "state")) });
  assert.equal(handled.data.content, "state on");
  assert.equal(handled.data.flags, 64);
});

test("a command that throws still returns a reply rather than crashing", async () => {
  const r = await handleInteraction({ type: TYPE.COMMAND, data: { name: "status" } }, { status: async () => { throw new Error("boom"); } });
  assert.match(r.data.content, /went wrong/);
});

test("the four commands are declared the way Discord expects", () => {
  assert.deepEqual(COMMANDS.map(c => c.name), ["status", "world", "alerts", "link"]);
  for (const c of COMMANDS) {
    assert.ok(/^[a-z]{1,32}$/.test(c.name));
    assert.ok(c.description.length > 0 && c.description.length <= 100);
  }
});

test("alerts batch up, repeats merge, and missiles jump the queue", () => {
  const q = new NotifyQueue({ batchSeconds: 60, perKindCooldown: 300 });
  q.add(1, "attack", "Kerevo is taking your land.", 0);
  assert.equal(q.add(1, "attack", "Kerevo is taking your land.", 5), "merged");
  assert.equal(q.take(10).length, 0, "nothing goes out straight away");
  q.add(1, "missile", "A missile is inbound.", 12);
  const urgent = q.take(12);
  assert.equal(urgent.length, 1);
  assert.equal(urgent[0].lines[0].kind, "missile");
  const later = q.take(70);
  assert.equal(later[0].lines[0].count, 2);
  assert.match(formatBatch("Test world", later[0]), /x2/);
});

test("preferences and quiet hours decide what is sent", () => {
  const prefs = prefsFor({ attack: false, quietFrom: 22, quietTo: 7 });
  assert.equal(wants(prefs, "attack"), false);
  assert.equal(wants(prefs, "war", new Date(Date.UTC(2026, 0, 1, 12))), true);
  assert.equal(wants(prefs, "war", new Date(Date.UTC(2026, 0, 1, 23))), false);
  assert.equal(wants(prefs, "missile", new Date(Date.UTC(2026, 0, 1, 23))), true, "missiles ignore quiet hours");
  assert.equal(inQuietHours(prefsFor({}), new Date(Date.UTC(2026, 0, 1, 3))), false);
});
