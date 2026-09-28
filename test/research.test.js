import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { World } from "../src/sim/territory.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources, addProducer, produce } from "../src/sim/resources.js";
import { installResearch, initResearch, orderResearch, researchView, researchRate, complete, TREE, knownOf } from "../src/sim/research.js";
import { validateTree } from "../src/sim/techtree.js";
import { BUILDINGS, addBuilding } from "../src/sim/buildings.js";
import { researchError } from "../src/shared/research.js";
import { runOrder, purseOf, StateFeed, publicEvents } from "../src/game.js";
import { ClientWorld } from "../src/shared/client.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import data from "../data/buildings.json" with { type: "json" };

function setup({ speed = 1 } = {}) {
  const W = 60, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  for (let x = 40; x < 60; x++) for (let y = 0; y < 40; y++) terrain[y * W + x] = TID.forest;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 9 });
  const a = w.addNation({ name: "A" }), bot = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 30, 20);
  w.spawn(bot, 8, 8);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, makeRng(4));
  installResources(w, undefined, { rng: makeRng(5) });
  installResearch(w, { speed });
  w.tick(0.01);
  return { w, a, bot, g: w.grid, n: w.nations.get(a) };
}

const research = (w, a, id, mode) => runOrder(w, a, { t: "research", id, mode });

test("the tree is valid, and every unlock is a sprite or a building", () => {
  const manifest = JSON.parse(readFileSync("public/assets/manifest.json", "utf8"));
  const ids = new Set(manifest.sprites.map(s => s.family));
  for (const s of manifest.sprites) if (s.tags?.includes("autotile")) ids.add(s.group);
  for (const id of Object.keys(BUILDINGS.table)) ids.add(id);
  ["crop_rice"].forEach(v => ids.add(v));
  assert.deepEqual(validateTree(TREE, ids), []);
  const broken = structuredClone(TREE);
  broken.nodes[0].unlocks.buildings.push("hut_of_typos");
  assert.ok(validateTree(broken, ids).some(e => e.includes("hut_of_typos")));
});

test("a new nation must research its first buildings and its shops", () => {
  const { w, a, g, n } = setup();
  assert.ok([...w.bld.list.values()].some(b => b.type === "chieftain_hut" && b.owner === a && b.state === "active"), "the starting hut is a gift, not research");
  n.money = 1000;
  assert.equal(canPlace(w, a, "watchtower_wood", g.idx(33, 20)), "needs Palisades research");
  assert.equal(runOrder(w, a, { t: "zone", zone: "com", x: 25, y: 15, w: 3, h: 3 }).error, "needs Barter research");
  assert.equal(runOrder(w, a, { t: "zone", zone: "res", x: 25, y: 15, w: 3, h: 3 }).ok, true);
  for (let t = 0; t < 30; t++) w.tick(1);
  assert.equal([...w.bld.list.values()].filter(b => b.civilian).length, 0, "no huts before Fire keeping");
  complete(w, n, "fire_keeping");
  for (let t = 0; t < 10; t++) w.tick(1);
  assert.ok([...w.bld.list.values()].some(b => b.type === "hut_grass"), "huts once Fire keeping is known");
  assert.equal(canPlace(w, 2, "watchtower_wood", g.idx(8, 8)), null, "bots are not gated");
});

test("a new player starts with a queue that brings homes, wood, food, shops and fields; bots have none", () => {
  const { w, a, bot, n } = setup({ speed: 10 });
  assert.deepEqual(n.research.queue, ["fire_keeping", "stone_tools", "foraging", "barter", "farming"]);
  assert.equal(researchView(w, n).current, "fire_keeping");
  assert.equal(w.nations.get(bot).research, undefined);
  for (let t = 0; t < 11; t++) w.tick(1);
  assert.deepEqual(n.research.known, ["fire_keeping"], "20 points at 2 a second");
  assert.equal(research(w, a, "farming", "remove").ok, true);
  assert.deepEqual(n.research.queue, ["stone_tools", "foraging", "barter"], "the player can change it");
});

test("a nation saved before the guided start gets the starter queue once, when its world loads", () => {
  const old = { human: true, research: { known: ["clubs", "stone_tools"], queue: ["palisades"], partial: {}, bank: 0, current: null } };
  initResearch(old);
  assert.deepEqual(old.research.queue, ["palisades", "fire_keeping", "foraging", "barter", "farming"], "known and queued nodes are skipped");
  const reloaded = JSON.parse(JSON.stringify(old));
  reloaded.research.queue = [];
  initResearch(reloaded);
  assert.deepEqual(reloaded.research.queue, [], "after that, a queue the player cleared stays cleared through saves");
});

test("queueing a node adds its missing prerequisites, and points carry over", () => {
  const { w, a, n } = setup();
  research(w, a, null, "clear");
  const r = research(w, a, "palisades");
  assert.equal(r.ok, true);
  assert.deepEqual(r.queue, ["clubs", "stone_tools", "palisades"]);
  assert.equal(research(w, a, "foraging", "first").queue[0], "foraging");
  assert.deepEqual(research(w, a, "clubs", "remove").queue, ["foraging", "stone_tools"], "removing a node drops what depends on it");
  assert.equal(research(w, a, "nope").error, "unknown research");
  const rate = researchRate(w, n);
  assert.ok(Math.abs(rate - 0.2) < 1e-9);
  for (let t = 0; t < 135; t++) w.tick(1);
  assert.ok(knownOf(n).has("foraging"), "25 points at 0.2 a second");
  assert.ok(n.effects.food_rate === 0.1);
  const v = researchView(w, n);
  assert.equal(v.current, "stone_tools");
  assert.ok(v.progress > 0 && v.progress < 30);
});

test("queueing any node, however far ahead, queues everything it needs, eras included", () => {
  for (const target of ["masonry", "banking", ...TREE.nodes.filter(x => x.era === "G").map(x => x.id)]) {
    const { w, a, n } = setup();
    research(w, a, null, "clear");
    const r = research(w, a, target);
    assert.equal(r.ok, true, `${target}: ${r.error}`);
    const known = new Set();
    for (const id of r.queue) {
      const why = researchError(TREE, w.research.locks, known, [...known].some(k => k === "age_gunpowder") ? "G" : known.has("age_medieval") ? "M" : "T", id);
      assert.equal(why, null, `${target}: ${id} would wait: ${why}`);
      known.add(id);
    }
    assert.ok(known.has(target) && r.queue.length <= w.research.rules.maxQueue, `${target}: ${r.queue.length} nodes`);
  }
});

test("with nothing queued, points bank up to the cap and pay into the next node", () => {
  const { w, a, n } = setup({ speed: 100 });
  research(w, a, null, "clear");
  for (let t = 0; t < 30; t++) w.tick(1);
  assert.equal(n.research.bank, 500);
  research(w, a, "fire_keeping");
  w.tick(0.01);
  assert.ok(knownOf(n).has("fire_keeping"));
  assert.ok(n.research.bank >= 479 && n.research.bank <= 481, `bank ${n.research.bank}`);
});

test("a new nation researches through Tribal into Medieval, and everyone hears", () => {
  const { w, a, n } = setup({ speed: 20 });
  research(w, a, null, "clear");
  const r = research(w, a, "age_medieval");
  assert.equal(r.ok, true);
  const tribal = r.queue.filter(id => id !== "age_medieval").map(id => TREE.nodes.find(x => x.id === id));
  assert.ok(tribal.length >= 8 && new Set(tribal.map(x => x.branch)).size >= 3, `queueing the age also queues enough Tribal upgrades: ${r.queue.join(", ")}`);
  for (let t = 0; t < 400 && n.era === "T"; t++) { w.tick(1); assert.equal(researchView(w, n).waiting, null, "it never waits"); }
  assert.equal(n.era, "M");
  const era = w.events.find(e => e.type === "era_up");
  assert.deepEqual({ nation: era.nation, era: era.era, name: era.name }, { nation: a, era: "M", name: "Medieval" });
  assert.ok(publicEvents(w, [era, { type: "era_up", nation: 2 }]).length === 2, "announced to everyone, bots too");
  assert.equal(canPlace(w, a, "barracks", w.grid.idx(33, 17)), null, "Medieval buildings the tree does not gate appear");
  assert.equal(canPlace(w, a, "tower_stone", w.grid.idx(36, 20)), "needs Masonry research");
  const feed = new StateFeed();
  assert.equal(feed.delta(w).n.find(row => row[0] === a)[5], 1, "the era travels in the nation row");
});

test("once Carpentry is known, huts turn into timber cottages without help", () => {
  const { w, a, n } = setup();
  for (const id of ["fire_keeping", "barter", "stone_tools", "foraging", "farming", "chieftains", "clubs", "palisades"]) complete(w, n, id);
  runOrder(w, a, { t: "zone", zone: "res", x: 25, y: 14, w: 11, h: 4 });
  runOrder(w, a, { t: "zone", zone: "com", x: 25, y: 19, w: 11, h: 3 });
  for (const [x, y] of [[26, 24], [28, 24], [30, 24], [32, 24], [34, 24], [36, 24]]) addProducer(w, a, "crop_wheat", w.grid.idx(x, y));
  for (let t = 0; t < 400; t++) w.tick(1);
  const huts = [...w.bld.list.values()].filter(b => b.type === "hut_grass").length;
  assert.ok(huts >= 20, `a Tribal town of ${huts} huts`);
  assert.equal(w.events.filter(e => e.type === "civ_upgrade").length, 0, "no upgrades while Tribal");
  complete(w, n, "age_medieval");
  complete(w, n, "carpentry");
  let upgraded = 0;
  for (let t = 0; t < 900 && upgraded < 5; t++) { w.tick(1); upgraded = w.events.filter(e => e.type === "civ_upgrade" && e.to === "cottage_timber").length; }
  assert.ok(upgraded >= 5, `${upgraded} of ${huts} huts upgraded (needs ${n.stats.needs.toFixed(2)})`);
});

test("effects from research change the numbers they name", () => {
  const { w, a, n, g } = setup();
  const cap = w.maxTroops(n);
  complete(w, n, "barter");
  complete(w, n, "chieftains");
  assert.ok(Math.abs(w.maxTroops(n) - cap * 1.05) < 1e-6, "troop_cap 0.05");
  const farm = addBuilding(w, { type: "crop_wheat", owner: a, anchor: g.idx(38, 20), state: "active", progress: 1 });
  n.stats = { worked: 1 };
  const earns = () => { const m = farm.made ?? 0; produce(w, 10); return farm.made - m; };
  const before = earns();
  complete(w, n, "foraging");
  assert.ok(Math.abs(earns() / before - 1.1) < 1e-6, "food_rate 0.1 raises what farms earn");
  complete(w, n, "stone_tools");
  assert.ok(Math.abs(n.effects.income - 0.05) < 1e-9, "Stone tools gives income 0.05 now that wood is gone");
});

test("the client shows the same research and building reasons as the server", () => {
  const { w, a, n, g } = setup();
  complete(w, n, "fire_keeping");
  const client = new ClientWorld({ w: g.w, h: g.h, you: a, map: { kind: "test" }, hashes: {}, nations: [...w.nations.values()], defs: data.buildings, tech: TREE, purse: purseOf(n, { research: researchView(w, n) }) });
  client.terrain = w.terrain.slice();
  client.owner.set(w.owner);
  for (const node of TREE.nodes) assert.equal(client.researchError(node.id), researchError(TREE, w.research.locks, knownOf(n), n.era, node.id), node.id);
  assert.equal(client.researchError("mud_building"), null);
  assert.equal(client.researchError("masonry"), "needs the Medieval era");
  assert.equal(client.researchError("palisades"), "needs Clubs and spears and Stone tools first");
  for (let i = 0; i < g.size; i += 7) assert.equal(client.placeError("watchtower_wood", i), canPlace(w, a, "watchtower_wood", i) ?? client.costError("watchtower_wood"));
});
