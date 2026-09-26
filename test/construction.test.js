import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction, canPlace, place, demolish } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { buildingAt } from "../src/sim/buildings.js";
import { runOrder, BuildingFeed, purseOf } from "../src/game.js";
import { ClientWorld } from "../src/shared/client.js";
import { encodeRows, decodeRows, planBatch } from "../src/shared/buildings.js";
import { installResearch } from "../src/sim/research.js";
import { frame, MSG, PROTOCOL } from "../src/shared/protocol.js";
import { TID, TERRAIN } from "../src/shared/terrain.js";
import data from "../data/buildings.json" with { type: "json" };

function setup() {
  const W = 40, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  for (let y = 0; y < H; y++) for (let x = 30; x < W; x++) terrain[y * W + x] = x < 33 ? TID.shallows : TID.ocean;
  terrain[12 * W + 22] = TID.mountain;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 6 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B", bot: true });
  w.spawn(a, 24, 15);
  w.spawn(b, 8, 15);
  for (let x = 18; x < 30; x++) for (let y = 8; y < 22; y++) w.claim(w.grid.idx(x, y), a);
  installConstruction(w);
  installEconomy(w);
  return { w, a, b, g: w.grid, n: w.nations.get(a) };
}

test("the starting kit: gold, food, wood and a finished chieftain hut at the capital, for players only", () => {
  const { w, a, b, n } = setup();
  w.tick(1);
  assert.equal(n.stock.food, 50);
  assert.equal(n.stock.wood, 40);
  assert.equal(Math.round(n.money), 101, "100 to start, then 1 gold a second");
  const hut = [...w.bld.list.values()].find(x => x.owner === a);
  assert.equal(hut.type, "chieftain_hut");
  assert.equal(hut.state, "active");
  assert.ok(hut.plots.includes(n.capital) || hut.plots.some(i => w.grid.cheb(i, n.capital) <= 1), "the hut sits at the capital");
  assert.equal(w.nations.get(b).money, undefined, "bots have no economy");
  w.tick(10);
  assert.equal(Math.round(n.money), 111);
  assert.equal([...w.bld.list.values()].length, 1, "the kit is given once");
});

test("every placement rule gives a readable reason", () => {
  const { w, a, g, n } = setup();
  Object.assign(n, { era: "T", money: 1e6, stock: { wood: 1e6, stone: 1e6, steel: 1e6, concrete: 1e6 } });
  const tower = place(w, a, "watchtower_wood", g.idx(20, 10));
  assert.ok(tower.id);
  n.era = "M";
  const reasons = {
    "unknown building": canPlace(w, a, "hut_grass", g.idx(20, 12)),
    "needs the Industrial era": canPlace(w, a, "warehouse", g.idx(20, 12)),
    "off the edge of the map": canPlace(w, a, "barracks", g.idx(39, 5)),
    "something is already there": canPlace(w, a, "barracks", g.idx(19, 10)),
    "cannot build on water": canPlace(w, a, "barracks", g.idx(31, 10)),
    "not your land": canPlace(w, a, "barracks", g.idx(8, 15)),
    "the ground is too rough to build on": canPlace(w, a, "barracks", g.idx(21, 12)),
    "must sit on the coast": canPlace(w, a, "harbour", g.idx(20, 14)),
  };
  n.era = "Mo";
  reasons["must sit in shallow water"] = canPlace(w, a, "offshore_rig", g.idx(33, 10));
  reasons["too far from your coast"] = canPlace(w, a, "offshore_rig", g.idx(30, 0));
  for (const [want, got] of Object.entries(reasons)) assert.equal(got, want);
  assert.equal(canPlace(w, a, "harbour", g.idx(29, 14)), null);
  assert.equal(canPlace(w, a, "offshore_rig", g.idx(30, 14)), null);
  Object.assign(n, { money: 10, stock: { wood: 3 } });
  n.era = "T";
  assert.equal(place(w, a, "watchtower_wood", g.idx(25, 10)).error, "needs 15 wood, you have 3");
  n.stock.wood = 100;
  assert.equal(place(w, a, "watchtower_wood", g.idx(25, 10)).error, "needs 20 gold, you have 10");
});

test("coast buildings: a jetty sits on your shore, and a harbour half in the sea changes hands with its land", () => {
  const W = 30, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  for (let y = 0; y < 6; y++) for (let x = 0; x < W; x++) terrain[y * W + x] = TID.shallows;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 3 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" }), g = w.grid;
  w.spawn(a, 10, 12);
  for (let x = 4; x < 20; x++) for (let y = 6; y < 16; y++) w.claim(g.idx(x, y), a);
  installConstruction(w);
  const n = w.nations.get(a);
  Object.assign(n, { era: "M", money: 1e6, stock: { wood: 1e6, stone: 1e6 } });
  assert.equal(canPlace(w, a, "jetty", g.idx(10, 6)), null, "own land touching the sea");
  assert.equal(canPlace(w, a, "jetty", g.idx(10, 8)), "must sit on the coast");
  assert.equal(canPlace(w, a, "jetty", g.idx(10, 5)), "must sit on the coast", "not out on the water");
  assert.equal(canPlace(w, a, "jetty", g.idx(24, 6)), "not your land");
  const harbour = place(w, a, "harbour", g.idx(12, 5));
  assert.ok(harbour.id, harbour.error);
  assert.equal(harbour.anchor, g.idx(12, 5), "the anchor is out in the sea");
  w.claim(g.idx(13, 6), b);
  assert.equal(harbour.owner, a, "only its first land plot decides");
  w.claim(g.idx(12, 6), b);
  assert.equal(harbour.owner, b, "the harbour passes to whoever takes its land");
});

test("the upgrade order: 20 watchtowers cost exactly 20 x 1.5 x a stone tower, lowest first, and the rest are explained", () => {
  const { w, a, g, n } = setup();
  Object.assign(n, { era: "M", money: 1e6, stock: { wood: 1e6, stone: 1e6 } });
  const towers = [];
  for (let k = 0; k < 24; k++) towers.push(place(w, a, "watchtower_wood", g.idx(19 + (k % 6) * 2, [8, 10, 12, 20][Math.floor(k / 6)])));
  assert.ok(towers.every(t => t.id), towers.find(t => !t.id)?.error);
  for (let t = 0; t < 31; t++) w.tick(1);
  assert.ok(towers.every(t => t.state === "active"));
  const stone = data.buildings.find(d => d.id === "tower_stone").cost;
  Object.assign(n, { money: 20 * 1.5 * stone.money, stock: { stone: 20 * stone.stone } });
  const plan = planBatch(Array(20).fill(stone), n, 1.5, 4);
  const r = runOrder(w, a, { t: "upgrade", picks: [["watchtower_wood", 20]] });
  assert.deepEqual({ ok: r.ok, done: r.done, spent: r.spent, skipped: r.skipped }, { ok: true, done: 20, spent: 2400, skipped: {} });
  assert.deepEqual({ done: plan.done, spent: plan.spent, used: plan.used }, { done: 20, spent: 2400, used: { stone: 600 } }, "the client's plan matches the server's charge");
  assert.equal(n.money, 0);
  assert.equal(n.stock.stone, 0);
  assert.ok(towers.slice(0, 20).every(t => t.type === "tower_stone") && towers.slice(20).every(t => t.type === "watchtower_wood"), "the lowest ids go first");
  n.money = 700;
  const each = 1.5 * (stone.money + stone.stone * 4);
  assert.equal(planBatch(Array(4).fill(stone), n, 1.5, 4).done, 2, "with no stone, each costs 300 gold, so 700 gold does two");
  const short = runOrder(w, a, { t: "upgrade", picks: [["watchtower_wood", 99]] });
  assert.deepEqual({ done: short.done, spent: short.spent, skipped: short.skipped, missing: short.missing }, { done: 2, spent: 2 * each, skipped: { "not enough money": 2 }, missing: 95 });
  assert.ok(w.events.some(e => e.type === "upgraded" && e.nation === a && e.count === 2));
});

test("the upgrade order checks its picks, the filter, research and the era", () => {
  const { w, a, g, n } = setup();
  Object.assign(n, { era: "T", money: 1e6, stock: { wood: 1e6, stone: 1e6 } });
  const t = place(w, a, "watchtower_wood", g.idx(20, 10));
  for (let k = 0; k < 31; k++) w.tick(1);
  const up = m => runOrder(w, a, { t: "upgrade", ...m });
  assert.equal(up({ picks: "all" }).error, "pick 1 to 60 groups");
  for (const picks of [[["nope", 1]], [["watchtower_wood", 0]], [["__proto__", 1]], [["watchtower_wood", 1.5]], [[]]]) assert.equal(up({ picks }).error, "each pick is a building type and a count");
  assert.equal(up({ picks: [["watchtower_wood", 1]], filter: "mine" }).error, "filter is all, civilian or player");
  assert.equal(up({ picks: [["watchtower_wood", 1]], filter: "civilian" }).error, "none of those can be upgraded now");
  assert.deepEqual(up({ picks: [["watchtower_wood", 1]] }).skipped, { "era locked": 1 });
  n.era = "M";
  installResearch(w);
  assert.deepEqual(up({ picks: [["watchtower_wood", 1]] }).skipped, { "needs Masonry research": 1 });
  assert.equal(t.type, "watchtower_wood");
});

test("the upgrade order can name the buildings to upgrade, for the building card", () => {
  const { w, a, g, n } = setup();
  Object.assign(n, { era: "M", money: 1e6, stock: { wood: 1e6, stone: 1e6 } });
  const towers = [0, 1, 2].map(k => place(w, a, "watchtower_wood", g.idx(20 + 2 * k, 10)));
  for (let t = 0; t < 31; t++) w.tick(1);
  const up = m => runOrder(w, a, { t: "upgrade", ...m });
  const r = up({ ids: [towers[1].id] });
  assert.deepEqual({ ok: r.ok, done: r.done, missing: r.missing }, { ok: true, done: 1, missing: 0 });
  assert.deepEqual(towers.map(t => t.type), ["watchtower_wood", "tower_stone", "watchtower_wood"], "only the named one");
  assert.equal(up({ ids: [towers[1].id + 999] }).error, "none of those can be upgraded now");
  for (const ids of [[], "x", [1.5], Array(61).fill(1)]) assert.equal(up({ ids }).error, "pick 1 to 60 buildings");
  const b = w.addNation({ name: "B" });
  assert.equal(runOrder(w, b, { t: "upgrade", ids: [towers[0].id] }).error, "spawn first");
});

test("the build order pays up front, and the site finishes over its build time", () => {
  const { w, a, g, n } = setup();
  w.tick(1);
  const money = n.money, wood = n.stock.wood;
  const r = runOrder(w, a, { t: "build", type: "watchtower_wood", at: g.idx(20, 10) });
  assert.equal(r.ok, true, r.error);
  assert.equal(n.stock.wood, wood - 15);
  assert.ok(Math.abs(n.money - (money - 20)) < 1e-9);
  const b = w.bld.list.get(r.building);
  assert.equal(b.state, "construction");
  for (let t = 0; t < 29; t++) w.tick(1);
  assert.equal(b.state, "construction");
  w.tick(1.5);
  assert.equal(b.state, "active");
  assert.ok(w.events.some(e => e.type === "built" && e.building === b.id));
  assert.equal(runOrder(w, a, { t: "build", type: "nope", at: 0 }).error, "unknown building");
  assert.equal(runOrder(w, a, { t: "build", type: "watchtower_wood", at: -4 }).error, "that plot is off the map");
  assert.equal(runOrder(w, a, { t: "build", type: "__proto__", at: 0 }).error, "unknown building");
});

test("demolish refunds half, leaves rubble that clears, and the plot can be built on at once", () => {
  const { w, a, g, n } = setup();
  w.tick(1);
  n.money = 100;
  n.stock.wood = 100;
  const tower = place(w, a, "watchtower_wood", g.idx(20, 10));
  for (let t = 0; t < 31; t++) w.tick(1);
  assert.equal(tower.state, "active");
  const before = { money: n.money, wood: n.stock.wood };
  const r = runOrder(w, a, { t: "demolish", building: tower.id });
  assert.ok(r.ok);
  assert.deepEqual(r.refund, { money: 10, wood: 7 });
  assert.equal(Math.round(n.money - before.money), 10);
  assert.equal(n.stock.wood - before.wood, 7);
  assert.equal(tower.state, "rubble");
  assert.equal(runOrder(w, a, { t: "demolish", building: tower.id }).error, "that is already rubble");
  assert.equal(canPlace(w, a, "watchtower_wood", g.idx(20, 10)), null, "rubble does not block building");
  for (let t = 0; t < 121; t++) w.tick(1);
  assert.equal(w.bld.list.has(tower.id), false, "rubble clears after two minutes");
  assert.equal(buildingAt(w, g.idx(20, 10)), null);

  const site = place(w, a, "watchtower_wood", g.idx(21, 10));
  runOrder(w, a, { t: "demolish", building: site.id });
  const next = place(w, a, "watchtower_wood", g.idx(21, 10));
  assert.ok(next.id, next.error);
  assert.equal(w.bld.list.has(site.id), false, "building on rubble clears it");
  assert.equal(buildingAt(w, g.idx(21, 10)), next);
  const other = w.addNation({ name: "C" });
  assert.equal(runOrder(w, other, { t: "demolish", building: next.id }).error, "spawn first");
  assert.equal(demolish(w, other, next.id).error, "not your building");
});

test("building rows round trip, and a client mirror follows the snapshot and the changes", () => {
  const { w, a, g, n } = setup();
  w.tick(1);
  Object.assign(n, { money: 1000, stock: { wood: 1000 } });
  place(w, a, "watchtower_wood", g.idx(20, 10));
  const feed = new BuildingFeed();
  feed.delta(w);
  const rows = feed.rows(w);
  assert.deepEqual(decodeRows(encodeRows(rows)).sort((p, q) => p[0] - q[0]), rows.sort((p, q) => p[0] - q[0]));

  const hello = { w: g.w, h: g.h, you: a, map: { kind: "test" }, hashes: {}, nations: [...w.nations.values()], defs: data.buildings, purse: purseOf(n), frames: { buildings: 1 } };
  const client = new ClientWorld(hello);
  client.terrain = w.terrain.slice();
  client.owner.set(w.owner);
  client.ready = true;
  client.ownerReady = true;
  const late = place(w, a, "watchtower_wood", g.idx(22, 10));
  client.message({ v: PROTOCOL, t: "state", time: 1, n: [], s: [], gone: [], b: feed.delta(w).up });
  client.frame(frame(MSG.BUILDINGS, encodeRows(rows)));
  assert.equal(client.buildings.size, 3, "the kit hut, the first tower and one sent after the snapshot");
  assert.equal(client.buildingAt(g.idx(22, 10)).id, late.id);

  runOrder(w, a, { t: "demolish", building: late.id });
  for (let t = 0; t < 31; t++) w.tick(1);
  let d = feed.delta(w);
  client.message({ v: PROTOCOL, t: "state", time: 2, n: [], s: [], gone: [], b: d.up, bg: d.gone });
  assert.equal(client.buildingAt(g.idx(22, 10)).state, "rubble");
  assert.equal(client.buildingAt(g.idx(20, 10)).state, "active");
  for (let t = 0; t < 130; t++) w.tick(1);
  d = feed.delta(w);
  client.message({ v: PROTOCOL, t: "state", time: 3, n: [], s: [], gone: [], b: d.up, bg: d.gone });
  assert.equal(client.buildingAt(g.idx(22, 10)), null);
  client.message({ v: PROTOCOL, t: "purse", ...purseOf(n) });

  let checked = 0;
  for (const type of ["watchtower_wood", "chieftain_hut", "jetty", "barracks"]) {
    for (let i = 0; i < g.size; i++) {
      assert.equal(client.placeError(type, i), canPlace(w, a, type, i) ?? client.costError(type), `${type} at ${i}`);
      checked++;
    }
  }
  assert.ok(checked > 4000);
});

test("the client greys out what the player cannot afford, with the reason", () => {
  const { w, a, n } = setup();
  w.tick(1);
  const client = new ClientWorld({ w: 40, h: 30, you: a, map: { kind: "test" }, hashes: {}, nations: [...w.nations.values()], defs: data.buildings, purse: purseOf(n) });
  assert.equal(client.costError("watchtower_wood"), null);
  assert.equal(client.costError("harbour"), "needs 80 wood, you have 40");
  assert.equal(TERRAIN[TID.grassland].build, true);
});
