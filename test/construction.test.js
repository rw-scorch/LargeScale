import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction, canPlace, place, demolish } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { buildingAt } from "../src/sim/buildings.js";
import { runOrder, BuildingFeed, purseOf } from "../src/game.js";
import { ClientWorld } from "../src/shared/client.js";
import { encodeRows, decodeRows } from "../src/shared/buildings.js";
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
