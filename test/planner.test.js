import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources, DEPOSIT_IDS } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installEffects } from "../src/sim/effects.js";
import { installPower, powerTick } from "../src/sim/power.js";
import { installPlanner, planView, planTick, PLAN_RULES } from "../src/sim/planner.js";
import { proposePlan, piecePlots, rectPlots } from "../src/shared/planner.js";
import { runOrder, purseOf } from "../src/game.js";
import { ClientWorld } from "../src/shared/client.js";
import { PROTOCOL } from "../src/shared/protocol.js";
import { rowOf } from "../src/shared/buildings.js";
import { powerView } from "../src/sim/power.js";
import { planSummary } from "../src/sim/planner.js";
import buildingData from "../data/buildings.json" with { type: "json" };
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function deposits(list) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  return { plots: Uint32Array.from(sorted, d => d[0]), type: Uint8Array.from(sorted, d => DEPOSIT_IDS.indexOf(d[1]) + 1), amount: Float64Array.from(sorted, () => 500) };
}

function world({ era = "M", dep = [], W = 90, H = 60 } = {}) {
  const terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  const g = w.grid;
  installCombat(w);
  installTroops(w);
  installConstruction(w, { speed: 1000 });
  installCivilians(w, makeRng(3));
  installResources(w, deposits(dep.map(([x, y, k]) => [g.idx(x, y), k])), { rng: makeRng(4), hook: false });
  installRoads(w, { rules: rules.roads });
  installEffects(w);
  installPower(w);
  installPlanner(w, { run: (nid, m) => runOrder(w, nid, m) });
  const a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 20, 20);
  w.spawn(b, 70, 20);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 50 ? a : b);
  const n = w.nations.get(a);
  Object.assign(n, { troops: 2000, money: 100000, era, pop: 40, stats: { workers: 30, jobs: 4, demand: { res: 1, com: 0, ind: 0 } } });
  Object.assign(w.nations.get(b), { troops: 9000, money: 0, era });
  const put = (type, x, y, owner = a) => addBuilding(w, { type, owner, anchor: g.idx(x, y), state: "active", progress: 1 });
  put("chieftain_hut", 19, 19);
  for (const [x, y] of [[17, 18], [22, 19], [18, 22], [21, 22]]) put("hut_grass", x, y);
  return { w, g, a, b, n, put, plan: (extra = {}) => proposePlan(planView(w, a, extra), PLAN_RULES) };
}

const byKey = (list, prefix) => list.find(p => p.key.startsWith(prefix));

test("the planner rules come from rules.json", () => {
  assert.deepEqual(PLAN_RULES, { ...PLAN_RULES, ...rules.planner });
});

test("a town short of housing gets a block of homes in four lots with a street grid, on free land of its own", () => {
  const { w, g, a, plan } = world();
  const list = plan();
  const block = byKey(list, "block:res");
  assert.ok(block, `a housing block is proposed: ${list.map(p => p.key).join(", ")}`);
  const zones = block.pieces.filter(p => p.t === "zone"), roads = block.pieces.filter(p => p.t === "road");
  assert.deepEqual(zones.map(z => [z.zone, z.w, z.h]), [["res", 3, 3], ["res", 3, 3], ["res", 3, 3], ["res", 3, 3]]);
  assert.equal(roads.length, 2, "two streets cross the block");
  assert.deepEqual([roads[0].kind, block.price], ["cobble", 78], "13 plots of cobbled road at 6 gold, since nothing here locks Paved roads");
  const lots = zones.flatMap(z => rectPlots(g.w, g.h, [z.x, z.y, z.w, z.h]));
  assert.ok(lots.every(i => w.owner[i] === a && !w.bld.zone[i] && !w.bld.at.has(i)), "every lot is free land of A's");
  const cap = w.nations.get(a).capital, d = Math.hypot(block.at % g.w - cap % g.w, ((block.at / g.w) | 0) - ((cap / g.w) | 0));
  assert.ok(d < 10, `the block sits by the capital: ${d.toFixed(1)} plots away`);
  assert.ok(!byKey(list, "block:com") && !byKey(list, "block:ind"), "no shops or works without demand for them");
});

test("every unworked deposit gets its best mine, nothing goes on land kept clear, and every build passes the server's placement", () => {
  const dep = [[30, 30, "iron"], [31, 30, "iron"], [36, 40, "gold"], [10, 40, "copper"], [60, 30, "iron"]];
  const { w, g, a, plan } = world({ dep });
  const list = plan();
  const iron = byKey(list, "mines:iron"), gold = byKey(list, "mines:gold");
  assert.ok(iron && gold && byKey(list, "mines:copper"), `mines for each kind: ${list.map(p => p.key).join(", ")}`);
  assert.equal(iron.pieces.length, 2, "both of A's iron plots, not B's at 60, 30");
  assert.ok(iron.pieces.every(p => p.type === "mine_pit"), "Medieval: pit mines");
  assert.ok(gold.title.startsWith("1 pit mine on your gold"), gold.title);
  const builds = list.flatMap(p => p.pieces).filter(p => p.t === "build");
  for (const p of builds) assert.equal(canPlace(w, a, p.type, p.at), null, `${p.type} at ${p.at} is placeable`);
  const all = list.flatMap(p => [...new Set(p.pieces.flatMap(q => piecePlots({ w: g.w, h: g.h, defs: w.bld.table, buildings: [] }, q)))]);
  assert.equal(all.length, new Set(all).size, "no two proposals share a plot");
  const kept = plan({ keep: [[28, 28, 6, 6]] });
  assert.equal(byKey(kept, "mines:iron"), undefined, "the iron under the kept area is left alone");
  const keptPlots = new Set(rectPlots(g.w, g.h, [28, 28, 6, 6]));
  assert.ok(kept.every(p => p.pieces.every(q => piecePlots({ w: g.w, h: g.h, defs: w.bld.table, buildings: [] }, q).every(i => !keptPlots.has(i)))), "nothing at all is planned there");
  const skipped = plan({ skip: new Set(["mines:gold"]) });
  assert.equal(byKey(skipped, "mines:gold"), undefined, "a skipped project is not proposed again");
});

test("idle workers get fields, civic buildings come up to the number that counts, and upgrades are one project", () => {
  const { w, a, put, plan } = world({ era: "G" });
  put("bank", 30, 10);
  put("watchtower_wood", 25, 12);
  const list = plan();
  const farms = byKey(list, "farms:");
  assert.ok(farms && farms.pieces.length === 12 && farms.pieces.every(p => p.type === "crop_wheat"), `fields for 26 idle workers, at most 12: ${farms?.pieces.length}`);
  const bank = byKey(list, "civic:bank");
  assert.ok(bank && bank.pieces.length === 2 && /\+8% income\. You have 1 of the 5 that count/.test(bank.reason), bank?.reason);
  assert.ok(list.findIndex(p => p.key === "civic:bank") < list.findIndex(p => p.key === "civic:library"), "income first, then research");
  const up = byKey(list, "upgrade");
  assert.ok(up && up.pieces[0].ids.length === 2, "the tower and the chieftain hut can go up a level");
  assert.equal(up.price, Math.round((170 + 380) * 1.5));
});

test("towers face the strongest neighbour along the border, and an airfield comes with Flight", () => {
  const { w, g, a, b, plan } = world({ era: "I" });
  const list = plan();
  const towers = byKey(list, `towers:${b}`);
  assert.ok(towers, `towers facing B: ${list.map(p => p.key).join(", ")}`);
  const r = w.bld.table[towers.pieces[0].type].fort.radius;
  assert.ok(towers.pieces.every(p => g.x(p.at) >= 49 - r && w.owner[p.at] === a), "every tower is within reach of the border");
  assert.match(towers.reason, /^B has 9,000 troops along 60 plots of your border/);
  assert.ok(byKey(list, `airfield:${b}`), "an airfield near the border, since nothing here locks Flight");
});

test("buildings off the grid get a pole line to the nearest grid, or a plant of their own", () => {
  const { w, a, put, plan } = world({ era: "I" });
  put("coal_plant", 5, 40);
  const far = put("vehicle_factory", 14, 40), alone = put("vehicle_factory", 46, 55);
  powerTick(w, 5);
  const list = plan();
  const line = byKey(list, `power:${far.id}`), plant = byKey(list, `power:${alone.id}`);
  assert.ok(line && line.pieces[0].t === "poles" && line.price === line.draw[0].plots.length * 15, `poles to the factory 9 plots from the plant: ${JSON.stringify(line?.pieces)}`);
  assert.ok(plant && plant.pieces[0].type === "coal_plant", `a plant for the factory far from any grid: ${JSON.stringify(plant?.pieces)}`);
});

test("the queue runs zones at once, waits for gold in order, builds when it comes, and drops what became impossible", () => {
  const dep = [[30, 30, "iron"]];
  const { w, g, a, n, put, plan } = world({ dep });
  const list = plan(), block = byKey(list, "block:res"), mines = byKey(list, "mines:iron");
  for (const p of [block, mines]) assert.equal(runOrder(w, a, { t: "plan", op: "add", project: { key: p.key, kind: p.kind, name: p.title, pieces: p.pieces } }).ok, true);
  n.money = 0;
  planTick(w, 20);
  const zone = block.pieces.find(p => p.t === "zone");
  assert.equal(w.bld.zone[g.idx(zone.x, zone.y)], 1, "zones cost nothing and are painted at once");
  assert.match(n.planWhy, /^waiting for \d+ more gold for A block of housing/);
  assert.equal(n.plan.length, 2, "the streets and the mine wait");
  const events = [];
  n.money = 10000;
  planTick(w, 20);
  events.push(...w.events.splice(0));
  assert.equal(n.plan.length, 0, "everything is done");
  assert.ok([...w.bld.list.values()].some(b => b.type === "mine_pit" && b.owner === a), "the mine is placed");
  assert.equal(events.filter(e => e.type === "plan_done").length, 2);
  const again = plan();
  const next = again.find(p => p.pieces.some(q => q.t === "build"));
  runOrder(w, a, { t: "plan", op: "add", project: { key: next.key, kind: next.kind, name: next.title, pieces: next.pieces } });
  const first = next.pieces.find(q => q.t === "build");
  put("watchtower_wood", g.x(first.at), g.y(first.at));
  w.events.length = 0;
  planTick(w, 20);
  const dropped = w.events.find(e => e.type === "plan_dropped");
  assert.equal(dropped?.why, "something is already there", "a spot taken meanwhile is dropped with the reason");
});

test("plan orders are checked: pieces, the queue limit, cancelling and kept areas", () => {
  const { w, a, n } = world();
  const add = (pieces, key = "x") => runOrder(w, a, { t: "plan", op: "add", project: { key, kind: "towns", name: "Test", pieces } });
  assert.equal(add([{ t: "build", type: "nope", at: 5 }]).error, "a piece of that project is not valid");
  assert.equal(add([{ t: "zone", zone: "res", x: 1, y: 1, w: 200, h: 1 }]).error, "a piece of that project is not valid");
  assert.equal(runOrder(w, a, { t: "plan", op: "add", project: { key: "x", kind: "war", name: "T", pieces: [{ t: "zone", zone: "res", x: 1, y: 1, w: 1, h: 1 }] } }).error, "a project's kind is towns, economy, civic, defence");
  for (let k = 0; k < 6; k++) assert.equal(add(Array.from({ length: 60 }, (_, i) => ({ t: "zone", zone: "res", x: i % 40, y: k, w: 1, h: 1 })), `k${k}`).ok, true);
  assert.equal(add(Array.from({ length: 60 }, () => ({ t: "zone", zone: "res", x: 1, y: 1, w: 1, h: 1 })), "k7").error, "at most 400 pieces can wait in the queue");
  assert.equal(add([{ t: "zone", zone: "res", x: 1, y: 1, w: 1, h: 1 }], "k0").queued, 301, "a project with the same key is replaced");
  assert.deepEqual(runOrder(w, a, { t: "plan", op: "cancel", key: "k1" }).queued, 241);
  assert.equal(runOrder(w, a, { t: "plan", op: "keep", rects: [[0, 0, 200, 2]] }).error, "an area is at most 128 by 128 plots, inside the map");
  assert.equal(runOrder(w, a, { t: "plan", op: "keep", rects: [[0, 0, 10, 10], [20, 20, 5, 5]] }).keep, 2);
  assert.deepEqual(n.keepClear, [[0, 0, 10, 10], [20, 20, 5, 5]]);
  assert.equal(runOrder(w, a, { t: "plan", op: "clear" }).queued, 0);
});

test("the browser's copy of the world proposes exactly what the server's view does", () => {
  const dep = [[30, 30, "iron"], [36, 40, "gold"], [10, 40, "copper"]];
  const { w, a, put } = world({ era: "I", dep });
  put("bank", 30, 10);
  put("coal_plant", 5, 50);
  put("vehicle_factory", 14, 50);
  powerTick(w, 5);
  runOrder(w, a, { t: "plan", op: "keep", rects: [[0, 0, 12, 12]] });
  const n = w.nations.get(a);
  const c = new ClientWorld({
    t: "hello", v: PROTOCOL, you: a, w: w.grid.w, h: w.grid.h, map: { kind: "test" }, hashes: {},
    nations: [...w.nations.values()].map(o => ({ id: o.id, name: o.name, capital: o.capital, troops: o.troops, alive: o.alive, spawned: o.spawned, plots: 0 })),
    defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] }, roadRules: w.log.rules, powerRules: w.power.rules, depositIds: DEPOSIT_IDS,
  });
  c.terrain = w.terrain.slice();
  c.owner.set(w.owner);
  c.zone.set(w.bld.zone);
  c.roads.set(w.log.road);
  c.setDeposits(w.res.dep);
  for (const b of w.bld.list.values()) c.setBuilding(rowOf(b, w.bld.table));
  c.message({ t: "purse", ...purseOf(n, { power: powerView(w, n), plan: planSummary(n) }) });
  const shape = list => list.map(p => [p.key, p.kind, p.price, JSON.stringify(p.pieces)]);
  const server = proposePlan(planView(w, a), PLAN_RULES), browser = proposePlan(c.planView(), PLAN_RULES);
  assert.ok(server.length >= 6, `a full plan: ${server.map(p => p.key).join(", ")}`);
  assert.deepEqual(shape(browser), shape(server));
});

test("a Modern nation's plan uses Modern buildings: open-pit mines and concrete towers", () => {
  const { plan } = world({ era: "Mo", dep: [[30, 30, "iron"], [31, 31, "iron"]] });
  const list = plan();
  const mines = byKey(list, "mines:iron"), towers = byKey(list, "towers:");
  assert.deepEqual([mines?.pieces.length, mines?.pieces[0].type], [1, "mine_openpit"], "one open-pit mine reaches both iron plots");
  assert.equal(towers?.pieces[0].type, "tower_concrete");
});
