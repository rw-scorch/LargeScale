import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResearch } from "../src/sim/research.js";
import { runAdmin, parseSpeed, cleanName, ADMIN_RULES } from "../src/admin.js";
import { runOrder } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function setup() {
  const W = 60, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 6 });
  const a = w.addNation({ name: "A" }), bot = w.addNation({ name: "Bot", bot: true }), late = w.addNation({ name: "Late" });
  w.spawn(a, 30, 20);
  w.spawn(bot, 8, 8);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, makeRng(4));
  installResearch(w);
  w.tick(0.01);
  return { w, a, bot, late, n: w.nations.get(a) };
}

test("give adds gold or troops to a living nation, never below zero; goods are gone", () => {
  const { w, a, bot, late, n } = setup();
  const money = n.money;
  assert.deepEqual(runAdmin(w, { op: "give", nation: a, what: "money", amount: 1000 }), { ok: true, nation: a, name: "A", what: "money", amount: 1000, now: Math.floor(money + 1000) });
  assert.equal(runAdmin(w, { op: "give", nation: a, what: "money", amount: -1e6 }).now, 0, "taking more than there is leaves none");
  const troops = w.nations.get(bot).troops;
  assert.equal(runAdmin(w, { op: "give", nation: bot, what: "troops", amount: 250 }).now, Math.floor(troops + 250), "bots can be given troops");
  assert.equal(runAdmin(w, { op: "give", nation: bot, what: "money", amount: 5 }).error, "Bot has no economy");
  assert.equal(runAdmin(w, { op: "give", nation: late, what: "money", amount: 5 }).error, "pick a living nation", "not spawned yet");
  assert.equal(runAdmin(w, { op: "give", nation: a, what: "wood", amount: 5 }).error, "give one of money, troops, unit, machine");
  for (const amount of [0, 1.5, "10", ADMIN_RULES.maxGive + 1, NaN]) assert.match(runAdmin(w, { op: "give", nation: a, what: "money", amount }).error, /whole number/);
});

test("finish completes the research queue in order, and says why it stops", () => {
  const { w, a, n } = setup();
  const r = runAdmin(w, { op: "finish", nation: a });
  assert.deepEqual(r.done, ["fire_keeping", "stone_tools", "foraging", "barter", "farming"]);
  assert.equal(r.waiting, null);
  assert.ok(w.events.filter(e => e.type === "researched").length === 5, "each one is announced like normal research");
  assert.equal(runAdmin(w, { op: "finish", nation: a }).error, "A has nothing queued");
  runOrder(w, a, { t: "research", id: "age_medieval" });
  const needed = new Set(w.research.locks.nodes.get("age_medieval").requires);
  const extra = n.research.queue.filter(id => id !== "age_medieval" && !needed.has(id)).at(-1);
  runOrder(w, a, { t: "research", id: extra, mode: "remove" });
  const age = runAdmin(w, { op: "finish", nation: a });
  assert.ok(age.done.length > 0 && !age.done.includes("age_medieval"), `finished ${age.done}`);
  assert.match(age.waiting, /needs 8 Tribal upgrades across 3 branches \(you have 7 across \d\)/);
  assert.equal(n.era, "T");
  assert.match(runAdmin(w, { op: "finish", nation: a }).error, /^nothing in the queue can be finished: needs 8 Tribal upgrades/);
  runOrder(w, a, { t: "research", id: "age_medieval" });
  assert.equal(runAdmin(w, { op: "finish", nation: a }).done.at(-1), "age_medieval", "queueing the age again fills the gap");
  assert.equal(n.era, "M");
});

test("unknown ops, speeds and names are refused", () => {
  const { w, a } = setup();
  for (const op of ["nuke", "__proto__", "constructor", undefined]) assert.equal(runAdmin(w, { op, nation: a }).error, "unknown op");
  assert.deepEqual([1, 4, ADMIN_RULES.maxSpeed].map(parseSpeed), [1, 4, ADMIN_RULES.maxSpeed]);
  for (const v of [0, 2.5, ADMIN_RULES.maxSpeed + 1, "2", null]) assert.equal(parseSpeed(v), null);
  assert.equal(cleanName("  Weekend\u0007 Europe "), "Weekend Europe");
  for (const v of ["", "   ", "x".repeat(ADMIN_RULES.nameLength + 1), 42]) assert.equal(cleanName(v), null);
});
