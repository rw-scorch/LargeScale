import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installBuildings, saveLayers, addBuilding } from "../src/sim/buildings.js";
import { placeView } from "../src/sim/construction.js";
import { placeError } from "../src/shared/buildings.js";
import { installRoads, layRoad, layRoute, roadView, restoreRoads, takeRoadNews, setRoad, ROADS } from "../src/sim/logistics.js";
import { installAutoRoads, connectPlan, connectStores } from "../src/sim/autoroads.js";
import { unitCost } from "../src/sim/units.js";
import { roadLine, roadPlan, routePlan, roadSprite, roadName, ROAD_RULES } from "../src/shared/roads.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function field(w = 60, h = 30, scale = 1) {
  const terrain = new Uint8Array(w * h).fill(TID.grassland);
  const world = new World({ w, h, terrain }, { spawnRadius: 2 });
  installBuildings(world);
  installRoads(world, { rules: rules.roads, scale });
  const g = world.grid, a = world.addNation({ name: "A" }), n = world.nations.get(a);
  world.spawn(a, 5, 15);
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 10; x++) world.claim(g.idx(x, y), a);
  n.money = 1000;
  n.stock = { stone: 100 };
  n.human = true;
  world.events.length = 0;
  return { world, g, a, n };
}

const walk = (world, sid, cap = 2000) => {
  let t = 0;
  while (world.stacks.get(sid)?.order === "move" && t < cap) { world.tick(0.25); t += 0.25; }
  return t;
};

test("a road line is 4-connected from end to end", () => {
  const w = 50, line = roadLine(w, [2 * w + 3, 9 * w + 20]);
  assert.equal(line[0], 2 * w + 3);
  assert.equal(line.at(-1), 9 * w + 20);
  assert.equal(line.length, 17 + 7 + 1);
  for (let k = 1; k < line.length; k++) assert.equal(Math.abs(line[k] % w - line[k - 1] % w) + Math.abs(((line[k] / w) | 0) - ((line[k - 1] / w) | 0)), 1);
  assert.deepEqual(roadLine(w, [10, 10, 12]), [10, 11, 12], "repeated points add nothing");
  assert.deepEqual(ROAD_RULES, { ...rules.roads }, "the client's copy matches rules.json");
});

test("roads go on your own land, cost more over rivers and mountains, and less a plot on fine maps", () => {
  const { world, g, a } = field();
  const t = world.terrain;
  t[g.idx(10, 5)] = TID.river;
  t[g.idx(11, 5)] = TID.mountain;
  const view = { w: g.w, terrain: t, road: world.log.road, owner: world.owner };
  const plan = roadPlan(view, a, [g.idx(5, 5), g.idx(14, 5)], "dirt", rules.roads);
  assert.equal(plan.plots.length, 10);
  assert.deepEqual([plan.cost, plan.bridges], [{ money: 8 + 5 + 4 }, 1]);
  assert.deepEqual(roadPlan(view, a, [g.idx(5, 5), g.idx(14, 5)], "dirt", rules.roads, 2).cost, { money: 9 }, "half a plot's price on a fine map, rounded up");
  assert.equal(roadPlan(view, a, [g.idx(45, 5), g.idx(55, 5)], "dirt", rules.roads).error, "roads go on your own land");
  t[g.idx(20, 8)] = TID.lake;
  assert.match(roadPlan(view, a, [g.idx(18, 8), g.idx(22, 8)], "dirt", rules.roads).error, /cannot cross water/);
  assert.equal(roadPlan(view, a, [g.idx(1, 1)], "highway", rules.roads).error, "that road comes with a later era");
});

test("laying a road charges for new plots only, cobble waits for research, and removing is free", () => {
  const { world, g, a, n } = field();
  const r = layRoad(world, a, [g.idx(5, 10), g.idx(24, 10)], "dirt");
  assert.deepEqual([r.laid, r.cost, n.money], [20, { money: 20 }, 980]);
  assert.equal(layRoad(world, a, [g.idx(5, 10), g.idx(24, 10)], "dirt").error, "that road is already there");
  const again = layRoad(world, a, [g.idx(20, 10), g.idx(29, 10)], "dirt");
  assert.deepEqual([again.laid, again.skipped], [5, 5]);
  world.lockReason = (nid, id) => (id === "road_cobble" ? "research Paved roads first" : null);
  assert.equal(layRoad(world, a, [g.idx(5, 10), g.idx(9, 10)], "cobble").error, "research Paved roads first");
  world.lockReason = () => null;
  const cob = layRoad(world, a, [g.idx(5, 10), g.idx(9, 10)], "cobble");
  assert.deepEqual([cob.laid, cob.cost, n.stock.stone], [5, { money: 15, stone: 5 }, 95]);
  n.money = 3;
  assert.match(layRoad(world, a, [g.idx(5, 20), g.idx(14, 20)], "dirt").error, /^you need 10 gold/);
  const gone = layRoad(world, a, [g.idx(5, 10), g.idx(29, 10)], "none");
  assert.deepEqual([gone.laid, n.money, world.log.road[g.idx(7, 10)]], [25, 3, 0]);
});

test("stacks walk faster on roads and plan their way along them", () => {
  const { world, g, a } = field();
  const s1 = world.createStack(a, g.idx(5, 3), 50);
  world.orderMove(s1.id, g.idx(45, 3));
  const plain = walk(world, s1.id);
  layRoad(world, a, [g.idx(5, 6), g.idx(45, 6)], "dirt");
  const s2 = world.createStack(a, g.idx(5, 6), 50);
  world.orderMove(s2.id, g.idx(45, 6));
  const road = walk(world, s2.id);
  assert.ok(road < plain * 0.65 && road > plain * 0.55, `grass ${plain} s, dirt road ${road} s`);
  layRoad(world, a, [g.idx(5, 22), g.idx(5, 20), g.idx(45, 20), g.idx(45, 22)], "dirt");
  const s3 = world.createStack(a, g.idx(5, 22), 50);
  world.orderMove(s3.id, g.idx(45, 22));
  const on = s3.path.filter(i => world.log.road[i]).length;
  assert.ok(on >= 40, `the path uses the road for ${on} of ${s3.path.length} plots`);
});

test("roads stay when land changes hands, and land machines use them too", () => {
  const { world, g, a } = field();
  layRoad(world, a, [g.idx(10, 12), g.idx(30, 12)], "dirt");
  const b = world.addNation({ name: "B" });
  for (let x = 10; x <= 30; x++) world.claim(g.idx(x, 12), b);
  assert.equal(world.log.road[g.idx(20, 12)], ROADS.dirt);
  const land = unitCost(world, { domain: "land" });
  assert.equal(land(g.idx(19, 12), g.idx(20, 12)), 0.6);
  assert.equal(land(g.idx(19, 11), g.idx(20, 11)), 1);
  assert.equal(world.pathMinStep(), 0.9 * 0.6);
  setRoad(world, g.idx(0, 0), ROADS.cobble);
  assert.equal(world.pathMinStep(), 0.9 * 0.45);
});

test("roads are saved when they change, restored, and sent as small diffs", () => {
  const { world, g, a } = field();
  saveLayers(world);
  layRoad(world, a, [g.idx(3, 3), g.idx(3, 13)], "dirt");
  const news = takeRoadNews(world);
  assert.equal(news.length, 22);
  assert.equal(takeRoadNews(world), null);
  const out = saveLayers(world);
  assert.ok(out.road?.length > 0);
  assert.equal(saveLayers(world).road, undefined, "nothing to write when nothing changed");
  const copy = field().world;
  assert.equal(restoreRoads(copy, out.road), 11);
  assert.equal(copy.log.road[g.idx(3, 8)], ROADS.dirt);
});

test("road sprites join up, and rivers get bridges", () => {
  const w = 10, road = new Uint8Array(100), terrain = new Uint8Array(100).fill(TID.grassland);
  road[55] = road[56] = road[57] = 1;
  terrain[56] = TID.river;
  terrain[57] = TID.mountain;
  assert.equal(roadSprite(road, terrain, w, 55), "road_dirt_E");
  assert.equal(roadSprite(road, terrain, w, 56), "bridge_wood_h");
  assert.equal(roadSprite(road, terrain, w, 57), "road_mountain_W");
  road[56] = 2;
  assert.equal(roadSprite(road, terrain, w, 56), "bridge_stone_h");
  assert.deepEqual([roadName(road, terrain, 55), roadName(road, terrain, 56), roadName(road, terrain, 0)], ["Dirt road", "Stone bridge", null]);
});

test("roads and buildings keep off each other's plots", () => {
  const { world, g, a } = field();
  addBuilding(world, { type: "watchtower_wood", owner: a, anchor: g.idx(20, 20), plots: [g.idx(20, 20)], state: "active", progress: 1 });
  assert.equal(layRoad(world, a, [g.idx(18, 20), g.idx(22, 20)], "dirt").error, "a building stands in the way");
  assert.equal(layRoad(world, a, [g.idx(18, 22), g.idx(22, 22)], "dirt").laid, 5);
  const def = world.bld.table.watchtower_wood;
  assert.equal(placeError(placeView(world, a), { id: a, era: "T" }, def, g.idx(20, 22)), "a road runs there; take it up first");
  assert.equal(placeError(placeView(world, a), { id: a, era: "T" }, def, g.idx(20, 24)), null);
});

test("a routed road goes around buildings and rivers to the point you pick, reusing roads already there", () => {
  const { world, g, a, n } = field();
  const wall = [];
  for (let y = 5; y < 25; y++) wall.push(g.idx(20, y));
  for (let k = 0; k < wall.length; k++) addBuilding(world, { type: "watchtower_wood", owner: a, anchor: wall[k], plots: [wall[k]], state: "active", progress: 1 });
  const straight = layRoad(world, a, [g.idx(10, 15), g.idx(30, 15)], "dirt");
  assert.equal(straight.error, "a building stands in the way", "a drawn line refuses the tower in the way");
  const r = layRoute(world, a, g.idx(10, 15), g.idx(30, 15), "dirt");
  assert.ok(!r.error, r.error);
  assert.equal(world.log.road[g.idx(10, 15)], 1);
  assert.equal(world.log.road[g.idx(30, 15)], 1);
  assert.ok(wall.every(i => !world.log.road[i]), "no road on the towers");
  assert.ok(r.laid >= 20 + 2 * 10 && r.laid <= 20 + 2 * 11 + 2, `it goes round the end of the wall: ${r.laid} plots`);
  assert.equal(n.money, 1000 - r.cost.money);
  const again = layRoute(world, a, g.idx(10, 15), g.idx(30, 15), "dirt");
  assert.equal(again.error, "that road is already there");
  const plan = routePlan(roadView(world), a, g.idx(10, 16), g.idx(30, 16), "dirt", world.log.rules);
  assert.ok(plan.plots.length < 5, `a parallel route rides the road already laid: ${plan.plots.length} new plots`);
  assert.match(layRoute(world, a, g.idx(10, 15), g.idx(55, 15), "dirt").error, /no way to lay a road/, "the far end is not your land");
});

test("Connect stores links every store to the capital's roads, and the standing order connects new ones", () => {
  const { world, g, a, n } = field();
  installAutoRoads(world);
  n.capital = g.idx(5, 15);
  const hut = addBuilding(world, { type: "chieftain_hut", owner: a, anchor: g.idx(5, 15), state: "active", progress: 1 });
  const yard = addBuilding(world, { type: "storage_yard", owner: a, anchor: g.idx(25, 5), state: "active", progress: 1 });
  const dry = connectPlan(world, a, "dirt");
  assert.equal(dry.joined, 1);
  assert.ok(dry.plots.length >= 25 && dry.plots.length <= 32, `${dry.plots.length} plots from the yard to the hut`);
  const r = connectStores(world, a, "dirt");
  assert.equal(r.laid, dry.plots.length);
  assert.equal(connectPlan(world, a, "dirt").already, 1, "now it is on the network");
  assert.equal(connectPlan(world, a, "dirt").plots.length, 0);
  n.autoRoads = "dirt";
  const jetty = addBuilding(world, { type: "storage_yard", owner: a, anchor: g.idx(40, 25), state: "active", progress: 1 });
  for (let t = 0; t < 21; t++) world.tick(1);
  assert.ok(world.events.some(e => e.type === "roads_connected" && e.nation === a), "the standing order laid roads by itself");
  assert.equal(connectPlan(world, a, "dirt").already, 2);
  assert.ok(hut && yard && jetty);
});
