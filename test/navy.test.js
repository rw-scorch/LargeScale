import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding, BUILDINGS } from "../src/sim/buildings.js";
import { installMachines, spawnUnit, giveMachine, UNIT_TYPES, limitClass, diveOf, canHit, orderUnit, wreck } from "../src/sim/units.js";
import { installAir, planeOf, homeOf } from "../src/sim/air.js";
import { installBoats, boatPlan, boatType } from "../src/sim/boats.js";
import { installNavy } from "../src/sim/navy.js";
import { initResearch } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { TREE } from "../src/sim/research.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";

const WATER = x => x < 20 ? TID.grassland : x < 25 ? TID.shallows : x < 40 ? TID.ocean : x < 160 ? TID.deep_ocean : x < 180 ? TID.ocean : TID.grassland;

function world() {
  const W = 200, H = 24, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = WATER(i % W);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installBoats(w);
  installAir(w);
  installNavy(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 8, 12);
  w.spawn(b, 190, 12);
  for (let y = 0; y < H; y++) { for (let x = 0; x < 20; x++) w.claim(g.idx(x, y), a); for (let x = 180; x < W; x++) w.claim(g.idx(x, y), b); }
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 1e6, era: "Mo" });
  w.events.length = 0;
  const until = (done, most = 4000, dt = 0.25) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(dt); } return -1; };
  return { w, g, a, b, until, order: (nid, m) => runOrder(w, nid, m) };
}

test("Modern ships come from the naval dock with their research; landing craft are free and count toward nothing", () => {
  const locks = lockMap(TREE);
  const ids = ["cruiser", "battleship", "submarine", "aircraft_carrier", "landing_craft"];
  assert.deepEqual(ids.map(id => locks.units.get(id)), ["modern_navy", "modern_navy", "submarines", "carriers", "amphibious_warfare"]);
  assert.deepEqual(ids.map(id => limitClass(UNIT_TYPES[id])), ["sea", "sea", "sea", "sea", null]);
  assert.ok(["cruiser", "battleship", "submarine", "aircraft_carrier"].every(id => BUILDINGS.table.naval_dock.builds.includes(id)));
  assert.deepEqual([UNIT_TYPES.landing_craft.cost, UNIT_TYPES.landing_craft.builtAt, UNIT_TYPES.destroyer.asw, UNIT_TYPES.cruiser.asw], [{}, [], true, true]);
});

test("a submarine is open to anything in shallows, only to hunters in open ocean, to nothing in deep ocean, and firing brings it up", () => {
  const { w, g, a } = world();
  const sub = spawnUnit(w, a, "submarine", g.idx(22, 5));
  const by = id => UNIT_TYPES[id];
  const at = (x, y) => { sub.at = g.idx(x, y); return [diveOf(w, sub), ...["ironclad", "destroyer", "cruiser", "submarine", "attack_heli"].map(id => canHit(w, by(id), sub))]; };
  assert.deepEqual(at(22, 5), [0, true, true, true, true, true], "shallows: it cannot dive");
  assert.deepEqual(at(30, 5), [1, false, true, true, true, true], "open ocean: submerged, only hunters reach it");
  assert.deepEqual(at(100, 5), [2, false, false, false, false, false], "deep ocean: nothing reaches it");
  sub.surfaced = w.time + 20;
  assert.equal(diveOf(w, sub), 1, "after firing it is at attack depth");
  w.time += 21;
  assert.equal(diveOf(w, sub), 2, "and goes deep again");
});

test("a deep submarine torpedoes a warship that cannot answer, then a destroyer answers it while it is up", () => {
  const { w, g, a, b } = world();
  const sub = spawnUnit(w, a, "submarine", g.idx(100, 10));
  const iron = spawnUnit(w, b, "ironclad", g.idx(101, 10));
  w.tick(1);
  assert.ok(iron.hp < UNIT_TYPES.ironclad.hp, `the torpedoes hit: ${iron.hp}`);
  assert.equal(sub.hp, UNIT_TYPES.submarine.hp, "the ironclad cannot hit a submarine under water");
  assert.equal(sub.firing, iron.at);
  assert.equal(sub.dive, 1, "firing brought it up to attack depth");
  w.units.list.delete(iron.id);
  for (let k = 0; k < 22; k++) w.tick(1);
  assert.equal(sub.dive, 2, "20 s later it is deep again");
  const hunter = spawnUnit(w, b, "destroyer", g.idx(101, 10));
  w.tick(1);
  assert.equal(sub.hp, UNIT_TYPES.submarine.hp, "deep, even a destroyer cannot hit it");
  w.tick(1);
  w.tick(1);
  assert.ok(sub.hp < UNIT_TYPES.submarine.hp && hunter.hp < UNIT_TYPES.destroyer.hp, "once it fires, the destroyer hits back");
});

test("a battleship shells companies on the coast within 4 plots and makes land there a third as costly to take", () => {
  const { w, g, a, b } = world();
  const ship = spawnUnit(w, a, "battleship", g.idx(177, 12));
  const foe = w.createStack(b, g.idx(181, 12), 300);
  const far = w.createStack(b, g.idx(186, 12), 300);
  for (let k = 0; k < 40; k++) w.tick(0.25);
  assert.ok(Math.abs(300 - foe.troops - 50) < 1, `5 troops a second: ${(300 - foe.troops).toFixed(1)} in 10 s`);
  assert.equal(far.troops, 300, "out of reach, untouched");
  assert.equal(ship.shelling, foe.pos);
  assert.equal(w.siegeAt(a, g.idx(181, 11)), 3);
  assert.equal(w.siegeAt(a, g.idx(186, 12)), 1);
});

test("a cruiser fires at enemy planes within 3 plots", () => {
  const { w, g, a, b } = world();
  spawnUnit(w, a, "cruiser", g.idx(60, 10));
  const plane = spawnUnit(w, b, "biplane", g.idx(62, 10));
  const A = planeOf(w, plane);
  Object.assign(A, { x: 60.5, y: 10.5, landed: false, fuel: 999, mission: { kind: "patrol", x: 60.5, y: 10.5, at: g.idx(60, 10) } });
  for (let k = 0; k < 4; k++) w.tick(0.25);
  assert.ok(plane.hp < UNIT_TYPES.biplane.hp || !w.units.list.has(plane.id), `the cruiser's guns hit: ${plane.hp}`);
});

test("an aircraft carrier bases 12 planes whose reach moves with it, and takes the planes aboard down when it sinks", () => {
  const { w, g, a, until, order } = world();
  addBuilding(w, { type: "airfield", owner: a, anchor: g.idx(5, 5), state: "active" });
  const carrier = spawnUnit(w, a, "aircraft_carrier", g.idx(30, 12));
  const jet = spawnUnit(w, a, "jet_fighter", g.idx(6, 6));
  w.tick(0.25);
  assert.equal(order(a, { t: "air", plane: jet.id, do: "base", at: g.idx(10, 10) }).error, "pick one of your airfields or aircraft carriers");
  assert.deepEqual(order(a, { t: "air", plane: jet.id, do: "base", at: carrier.at }), { t: "result", of: "air", ok: true, done: 1, failed: 0, error: null, rearming: 0 });
  assert.ok(until(() => planeOf(w, jet).landed && planeOf(w, jet).x === 30.5) > 0, "it flies out and lands on the carrier");
  assert.equal(homeOf(w, planeOf(w, jet), a).name, "aircraft carrier");
  assert.match(order(a, { t: "air", plane: jet.id, do: "patrol", at: g.idx(125, 12) }).error, /^out of range: 95 plots from its aircraft carrier, at most 90$/);
  orderUnit(w, carrier.id, g.idx(40, 12));
  assert.ok(until(() => carrier.at === g.idx(40, 12)) > 0);
  w.tick(0.25);
  assert.deepEqual([planeOf(w, jet).x, planeOf(w, jet).y], [40.5, 12.5], "the plane aboard sails with it");
  assert.equal(order(a, { t: "air", plane: jet.id, do: "patrol", at: g.idx(125, 12) }).ok, true, "and its reach moved too");
  order(a, { t: "air", plane: jet.id, do: "return" });
  assert.ok(until(() => planeOf(w, jet).landed) >= 0);
  const more = Array.from({ length: 11 }, () => spawnUnit(w, a, "biplane", g.idx(6, 6)));
  w.tick(0.25);
  for (const p of more) assert.equal(order(a, { t: "air", plane: p.id, do: "base", at: carrier.at }).ok, true);
  const extra = spawnUnit(w, a, "biplane", g.idx(6, 6));
  w.tick(0.25);
  assert.equal(order(a, { t: "air", plane: extra.id, do: "base", at: carrier.at }).error, "that aircraft carrier is full: 12 planes");
  wreck(w, carrier);
  w.tick(0.25);
  const lost = w.events.filter(e => e.type === "plane_down" && e.why === "its carrier was lost").map(e => e.machine);
  assert.ok(lost.includes(jet.id), "the plane aboard went down with it");
});

test("after Amphibious warfare the free boats are landing craft: faster, and losing half as much", () => {
  const { w, g, a, b, order } = world();
  const from = g.idx(10, 12), target = g.idx(185, 12);
  const before = boatPlan(w, a, from, target);
  assert.equal(boatType(w, a), "transport_boat");
  initResearch(w.nations.get(a)).known.push("amphibious_warfare");
  assert.equal(boatType(w, a), "landing_craft");
  const after = boatPlan(w, a, from, target);
  assert.ok(Math.abs(after.loss - before.loss / 2) < 1e-9, `half the loss: ${before.loss} then ${after.loss}`);
  assert.ok(UNIT_TYPES.landing_craft.speed > UNIT_TYPES.transport_boat.speed);
  const s = w.createStack(a, from, 400);
  assert.ok(order(a, { t: "move", stack: s.id, to: target }).boat);
  for (let k = 0; k < 400 && !w.events.some(e => e.type === "boat_launched"); k++) w.tick(0.5);
  const launched = w.events.find(e => e.type === "boat_launched");
  assert.equal(w.units.list.get(launched.machine)?.type, "landing_craft");
  assert.equal(b > 0, true);
});

test("a warship given by the admin comes out beside a naval dock, not in a lake by the capital", () => {
  const { w, g, a } = world();
  w.terrain[g.idx(10, 12)] = TID.lake;
  const lake = giveMachine(w, a, "cruiser");
  assert.equal(lake.at, g.idx(10, 12), "with no dock or port it takes the nearest water");
  w.units.list.delete(lake.id);
  addBuilding(w, { type: "naval_dock", owner: a, anchor: g.idx(18, 3), state: "active" });
  const ship = giveMachine(w, a, "cruiser");
  assert.equal(g.x(ship.at), 20);
  assert.equal(orderUnit(w, ship.id, g.idx(100, 12)), null, "and it can sail out to sea");
});
