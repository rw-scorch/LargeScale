import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResearch } from "../src/sim/research.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installCheats, CHEAT_RULES } from "../src/sim/cheats.js";
import { runAdmin, adminAllowed, cleanPowers, POWERS } from "../src/admin.js";
import { runOrder, purseOf } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function setup() {
  const W = 60, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 6 });
  const a = w.addNation({ name: "A", human: true }), bot = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 30, 20);
  w.spawn(bot, 8, 8);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, makeRng(4));
  installResearch(w);
  installCheats(w);
  w.tick(0.01);
  return { w, a, bot, n: w.nations.get(a) };
}

test("cheats keep gold and troops full, finish buildings and research at once, and stop when turned off", () => {
  const { w, a, bot, n } = setup();
  assert.equal(runAdmin(w, { op: "cheat", nation: a, cheat: "wood", on: true }).error, "the cheats are gold, troops, build, research");
  assert.equal(runAdmin(w, { op: "cheat", nation: a, cheat: "gold", on: "yes" }).error, "on is true or false");
  const gold0 = n.money;
  assert.deepEqual(runAdmin(w, { op: "cheat", nation: a, cheat: "gold", on: true }), { ok: true, nation: a, name: "A", cheat: "gold", on: true, cheats: ["gold"] });
  assert.equal(n.money, CHEAT_RULES.gold, "full at once");
  n.money -= 5000;
  w.tick(1);
  assert.equal(n.money, CHEAT_RULES.gold, "and topped up every tick");
  const troops0 = n.troops;
  runAdmin(w, { op: "cheat", nation: a, cheat: "troops", on: true });
  n.troops = 10;
  w.tick(1);
  assert.equal(n.troops, CHEAT_RULES.troops);
  assert.equal(runAdmin(w, { op: "cheat", nation: bot, cheat: "troops", on: true }).ok, true, "bots can be given cheats too");
  const site = addBuilding(w, { type: "war_camp", owner: a, anchor: w.grid.idx(34, 22), state: "construction", progress: 0 });
  runAdmin(w, { op: "cheat", nation: a, cheat: "build", on: true });
  assert.equal(site.state, "active", "a site already started finishes at once");
  const later = addBuilding(w, { type: "war_camp", owner: a, anchor: w.grid.idx(24, 22), state: "construction", progress: 0 });
  w.tick(1);
  assert.equal(later.state, "active", "and so does the next one");
  runAdmin(w, { op: "cheat", nation: a, cheat: "research", on: true });
  runOrder(w, a, { t: "research", id: "age_medieval" });
  w.tick(1);
  assert.equal(n.era, "M", "a queue to the next age finishes in one tick");
  assert.deepEqual(purseOf(n, { cheats: n.cheats }).cheats, ["gold", "troops", "build", "research"]);
  runAdmin(w, { op: "cheat", nation: a, cheat: "gold", on: false });
  assert.equal(n.money, gold0, "off again, the gold goes back to what it was before the cheat");
  w.tick(1);
  assert.ok(n.money < gold0 + 50, "and is not topped up any more");
  for (const c of ["troops", "build", "research"]) runAdmin(w, { op: "cheat", nation: a, cheat: c, on: false });
  assert.ok(n.troops <= troops0, `the troops go back too: ${n.troops} of ${troops0}`);
  assert.deepEqual([n.cheats, n.cheatBase], [undefined, undefined], "no cheats left, nothing saved");
});

test("research all finishes every node in every era, and says when there is nothing left", () => {
  const { w, a, n } = setup();
  const r = runAdmin(w, { op: "researchAll", nation: a });
  assert.equal(r.done.length, w.research.tree.nodes.length, `${r.done.length} of ${w.research.tree.nodes.length}`);
  assert.equal(n.era, "Mo");
  assert.equal(runAdmin(w, { op: "researchAll", nation: a }).error, "A already knows everything");
});

test("from the first era, queueing a Modern node queues everything it needs, eras included", () => {
  const { w, a, n } = setup();
  const r = runOrder(w, a, { t: "research", id: "jet_engines", mode: "queue" });
  assert.equal(r.ok, true);
  assert.ok(["age_medieval", "age_gunpowder", "age_industry", "age_modern"].every(id => n.research.queue.includes(id)), "every age on the way is queued");
  assert.equal(n.research.queue.at(-1), "jet_engines", "and the node itself comes last");
  const done = runAdmin(w, { op: "finish", nation: a });
  assert.equal(done.done.at(-1), "jet_engines");
  assert.equal(done.waiting, null);
});

test("helpers get only the powers ticked for them; full admins get everything", () => {
  assert.deepEqual(cleanPowers(["give", "world", "give"]), ["world", "give"]);
  assert.equal(cleanPowers(["give", "nuke"]), null);
  assert.equal(cleanPowers("give"), null);
  const helper = { admin: false }, admin = { admin: true };
  assert.deepEqual(["give", "finish", "researchAll", "cheat", "speed", "kick", "powers", "log"].map(op => adminAllowed(helper, ["give"], op)), [true, true, true, false, false, false, false, true]);
  assert.deepEqual(["cheat", "log", "rename", "schedule"].map(op => adminAllowed(helper, ["cheats"], op)), [true, true, false, false]);
  assert.equal(adminAllowed(helper, [], "log"), false, "no powers, no panel");
  assert.ok(["powers", "cheat", "speed", "kick", "anything"].every(op => adminAllowed(admin, [], op)));
  assert.deepEqual(POWERS, ["world", "speed", "schedule", "kick", "give", "cheats"]);
});
