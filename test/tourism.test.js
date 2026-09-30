import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding, BUILDINGS, ZONES } from "../src/sim/buildings.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads, setRoad } from "../src/sim/logistics.js";
import { installCivilians, tryUpgrade, downtownError } from "../src/sim/civilians.js";
import { installTourism, tourismOf, tourismView } from "../src/sim/tourism.js";
import { installCbd, strengthAt } from "../src/sim/cbd.js";
import { tourismIncome } from "../src/shared/tourism.js";
import { TREE } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { publicEvents } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import { ClientWorld } from "../src/shared/client.js";
import { rowOf } from "../src/shared/buildings.js";
import { PROTOCOL } from "../src/shared/protocol.js";
import buildingData from "../data/buildings.json" with { type: "json" };

const T = BUILDINGS.table;

function world({ cbd = false } = {}) {
  const W = 80, H = 40, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; terrain[i] = x >= 64 ? TID.ocean : x >= 60 ? TID.shallows : x >= 20 && x <= 22 && y >= 30 && y <= 32 ? TID.mountain : TID.grassland; }
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installConstruction(w);
  installResources(w, undefined, { seasonOf: i => ((i / W) | 0) < 20 ? "winter" : "summer" });
  installRoads(w);
  installCivilians(w, makeRng(3));
  installTourism(w);
  if (cbd) installCbd(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 20);
  w.spawn(b, 50, 20);
  for (let y = 0; y < H; y++) { for (let x = 0; x < 40; x++) w.claim(g.idx(x, y), a); for (let x = 40; x < 64; x++) w.claim(g.idx(x, y), b); }
  const A = w.nations.get(a), B = w.nations.get(b);
  for (const n of [A, B]) Object.assign(n, { human: true, money: 0, era: "Mo" });
  const put = (type, x, y, owner = a, state = "active") => addBuilding(w, { type, owner, anchor: g.idx(x, y), state, progress: state === "active" ? 1 : 0 });
  w.events.length = 0;
  return { w, g, a, b, A, B, put };
}

test("ten tourism buildings, nine wonders and a downtown line, each behind its era or research", () => {
  const tourism = Object.values(T).filter(d => d.tourism && !d.wonder), wonders = Object.values(T).filter(d => d.wonder);
  assert.deepEqual(tourism.map(d => d.id), ["park", "plaza", "museum", "zoo", "arena", "stadium", "casino", "luxury_hotel", "beach_resort", "ski_resort"]);
  assert.equal(wonders.length, 9);
  assert.ok(wonders.every(d => d.tourism.value > 0 && d.category === "wonders"));
  assert.deepEqual([T.cafe.next, T.office_block.next, T.office_block.downtown, T.skyscraper.core, T.air_base.airport], ["office_block", "skyscraper", true, 1, true]);
  const locks = lockMap(TREE);
  assert.deepEqual(["stadium", "beach_resort", "wonder_observatory", "office_block", "skyscraper", "park"].map(id => locks.buildings.get(id) ?? null), ["mass_tourism", "mass_tourism", "mass_tourism", "skyscrapers", "skyscrapers", null]);
});

test("visitors pay every 5 s, more for variety, an airport, a port and rail, and 10% more for each wonder", () => {
  const { w, A, put } = world();
  put("park", 5, 25);
  put("plaza", 6, 25);
  w.tick(5);
  assert.ok(Math.abs(A.money - 0.55 * 5) < 1e-9, `two kinds, full variety: ${A.money}`);
  put("park", 7, 25);
  const three = tourismOf(w, A);
  assert.ok(Math.abs(three.variety - (0.5 + 0.5 * Math.sqrt(2 / 3))) < 1e-9 && three.base === 0.8, "a copy earns less than a new kind");
  put("air_base", 5, 30);
  const airport = tourismOf(w, A);
  put("jetty", 39, 25);
  const linked = tourismOf(w, A);
  assert.deepEqual([airport.reach, linked.links.airport, linked.links.port, linked.links.rail, linked.reach], [1.25, true, true, false, 1.35]);
  put("wonder_pyramid", 10, 10);
  assert.ok(Math.abs(tourismOf(w, A).wonder - 1.1) < 1e-9);
  w.tick(5);
  assert.deepEqual(Object.keys(tourismView(w, A)).sort(), ["base", "kinds", "links", "perSecond", "reach", "seasons", "sites", "variety", "wonders"]);
  assert.ok(Math.abs(tourismIncome([{ type: "x", value: 2 }], { airport: true, port: true, rail: true }).reach - 1.45) < 1e-9, "airport, port and rail together: 45% more");
});

test("resorts swing with the season at their own latitude, and sit where they belong", () => {
  const { w, a, A, put } = world();
  assert.equal(canPlace(w, a, "beach_resort", w.grid.idx(10, 25)), "must sit on the coast");
  assert.equal(canPlace(w, a, "ski_resort", w.grid.idx(5, 5)), "must be within 3 plots of hills or mountains");
  assert.equal(canPlace(w, a, "ski_resort", w.grid.idx(24, 28)), null);
  put("ski_resort", 24, 28);
  const summer = tourismOf(w, A);
  assert.deepEqual(summer.seasons, [["ski_resort", "summer", 0.2]]);
  put("ski_resort", 24, 5);
  assert.deepEqual(tourismOf(w, A).seasons.map(s => s[1]).sort(), ["summer", "winter"], "the same resort in the north is in winter");
  assert.ok(Math.abs(tourismOf(w, A).base - 4.5 * (0.2 + 1.8)) < 1e-9);
});

test("a wonder is one per world: whoever finishes first owns it, and a rival's site is cleared and refunded", () => {
  const { w, g, a, b, A, B, put } = world();
  const mine = put("wonder_pyramid", 5, 5, a, "construction"), theirs = put("wonder_pyramid", 45, 5, b, "construction");
  assert.equal(canPlace(w, a, "wonder_pyramid", g.idx(5, 12)), "you are already building it");
  w.tick(5);
  assert.ok(w.bld.list.has(theirs.id), "two sites can race");
  mine.state = "active";
  w.tick(0.25);
  const built = w.events.find(e => e.type === "wonder_built"), lost = w.events.find(e => e.type === "wonder_lost");
  assert.deepEqual([built?.nation, lost?.nation, lost?.by, lost?.refund, B.money], [a, b, a, 2500, 2500]);
  assert.equal(w.bld.list.has(theirs.id), false);
  assert.equal(canPlace(w, b, "wonder_pyramid", g.idx(45, 5)), "it already stands in A's land: there is one per world");
  assert.equal(publicEvents(w, [built]).length, 1, "everyone hears of it");
  w.tick(5);
  assert.equal(w.events.filter(e => e.type === "wonder_built").length, 1, "announced once");
  assert.ok(A.money > 0);
});

test("in a busy downtown with roads on two sides, a cafe grows into an office block and then a skyscraper", () => {
  const { w, g, a, put } = world();
  for (let y = 2; y <= 18; y++) for (let x = 2; x <= 18; x++) w.bld.zone[g.idx(x, y)] = ZONES.com;
  const cafe = put("cafe", 10, 10);
  assert.equal(downtownError(w, cafe, [cafe.anchor]), "needs roads on 2 sides");
  setRoad(w, g.idx(10, 9), 1);
  assert.equal(tryUpgrade(w, cafe, true), false, "one side is not enough");
  setRoad(w, g.idx(9, 10), 1);
  for (const [x, y] of [[13, 13], [7, 7], [13, 7]]) put("shop", x, y);
  assert.equal(downtownError(w, cafe, [cafe.anchor]), "needs 6 shops within 4 plots, has 3");
  for (const [x, y] of [[7, 13], [14, 10], [6, 10]]) put("shop", x, y);
  assert.equal(tryUpgrade(w, cafe, true), true);
  assert.deepEqual([cafe.type, cafe.state], ["office_block", "construction"]);
  cafe.state = "active";
  const neighbour = put("shop", 11, 11), outside = put("general_store", 12, 11);
  assert.equal(tryUpgrade(w, cafe, true), true, "the 2 by 2 skyscraper has roads on two sides, and takes in the shop inside its footprint");
  assert.deepEqual([cafe.type, cafe.plots.length, w.bld.list.has(neighbour.id), w.bld.list.has(outside.id)], ["skyscraper", 4, false, true]);
  assert.equal(w.events.find(e => e.type === "civ_upgrade" && e.to === "skyscraper")?.absorbed, 1);
  const low = put("cafe", 3, 3);
  setRoad(w, g.idx(3, 2), 1);
  setRoad(w, g.idx(2, 3), 1);
  assert.match(downtownError(w, low, [low.anchor]), /^needs 6 shops/, "a quiet corner stays a cafe");
});

test("a city core makes land near a downtown harder to take, and its owner hits harder there", () => {
  const { w, g, a, b, put } = world({ cbd: true });
  const near = g.idx(51, 21), mid = g.idx(51, 28), far = g.idx(58, 38), edge = g.idx(41, 21);
  const before = [near, mid, far].map(i => w.captureCost(i, a)), edgeBefore = w.captureCost(edge, a);
  const sky = put("skyscraper", 50, 20, b);
  w.tick(5);
  assert.equal(strengthAt(w, b, near), 0.5);
  const after = [near, mid, far].map(i => w.captureCost(i, a));
  assert.ok(Math.abs(after[0] / before[0] - 1.5) < 1e-9, `half again at the centre: ${after[0] / before[0]}`);
  assert.ok(Math.abs(after[1] / before[1] - 1.25) < 1e-9, "a quarter more 7 plots out");
  assert.equal(after[2], before[2], "nothing beyond 14 plots");
  put("skyscraper", 30, 20, a);
  w.tick(5);
  const s = 0.5 * (1 - 10 / 14);
  assert.ok(Math.abs(strengthAt(w, a, edge) - s) < 1e-9 && Math.abs(strengthAt(w, b, edge) - s) < 1e-9, "10 plots from each core");
  assert.ok(Math.abs(w.captureCost(edge, a) / edgeBefore - (1 + s) / (1 + 0.6 * s)) < 1e-9, "the defender's core counts in full, the attacker's at 60%");
  sky.state = "rubble";
  w.tick(5);
  assert.equal(strengthAt(w, b, near), 0, "a lost skyscraper takes its core with it");
});

test("catch-up pays tourism for the whole time away", () => {
  const { w, A, put } = world();
  put("museum", 5, 25);
  w.catchUp(300);
  assert.ok(Math.abs(A.money - 1.4 * 300) < 1e-6, `${A.money}`);
});

test("the browser works out the same city core and wonder standing as the server", () => {
  const { w, g, a, b, put } = world({ cbd: true });
  put("skyscraper", 50, 20, b);
  put("office_block", 30, 20, a);
  put("wonder_colossus", 45, 30, b, "construction");
  w.tick(5);
  const c = new ClientWorld({ t: "hello", v: PROTOCOL, you: a, w: g.w, h: g.h, map: { kind: "test" }, hashes: {}, nations: [...w.nations.values()].map(o => ({ id: o.id, name: o.name })), defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] }, cbdRules: { ...w.cbd.rules, scale: 1 } });
  for (const x of w.bld.list.values()) c.setBuilding(rowOf(x, w.bld.table));
  for (const [nid, x, y] of [[b, 51, 21], [b, 51, 28], [b, 58, 38], [a, 31, 21], [a, 36, 24], [b, 41, 21]]) assert.equal(c.coreAt(nid, g.idx(x, y)), strengthAt(w, nid, g.idx(x, y)), `${nid} at ${x}, ${y}`);
  assert.equal(c.wonderOf("wonder_colossus")?.site?.owner, b);
  assert.equal(c.wonderOf("wonder_pyramid"), null);
});
