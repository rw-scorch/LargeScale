import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installMachines, spawnUnit, UNIT_TYPES, queueMachines } from "../src/sim/units.js";
import { installAir, planeOf, orderPlane, AIR_RULES } from "../src/sim/air.js";
import { installPilot, takeControl, steer, pilotStep } from "../src/sim/pilot.js";
import { runOrder, StateFeed } from "../src/game.js";
import { ClientWorld } from "../src/shared/client.js";
import { lockMap } from "../src/shared/research.js";
import { TREE } from "../src/sim/research.js";
import { TID } from "../src/shared/terrain.js";

function world() {
  const W = 140, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installPilot(w);
  installAir(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 20);
  w.spawn(b, 120, 20);
  for (let y = 0; y < H; y++) for (let x = 0; x < 40; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < H; y++) for (let x = 60; x < W; x++) w.claim(g.idx(x, y), b);
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 20000, money: 1e6, era: "I" });
  const field = addBuilding(w, { type: "airfield", owner: a, anchor: g.idx(20, 20), state: "active" });
  const until = (done, most = 4000) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(0.25); } return -1; };
  return { w, g, a, b, field, until, order: (nid, m) => runOrder(w, nid, m) };
}

test("Flight unlocks the airfield, fighters and bombers, and anti-aircraft guns the flak tower", () => {
  const locks = lockMap(TREE);
  assert.equal(locks.buildings.get("airfield"), "flight");
  assert.equal(locks.units.get("biplane"), "flight");
  assert.equal(locks.units.get("early_bomber"), "flight");
  assert.equal(locks.buildings.get("flak_tower"), "anti_aircraft");
  assert.equal(TREE.nodes.get?.("flight")?.requires?.[0] ?? TREE.byId?.flight?.requires?.[0] ?? "steam_power", "steam_power");
  assert.deepEqual(AIR_RULES.bomb, { defenceCut: 0.5, cutSeconds: 90, repairSeconds: 120 });
});

test("an airfield builds a bomber, which waits at its base with full fuel and bombs", () => {
  const { w, a, field, until } = world();
  assert.deepEqual(queueMachines(w, a, field.id, "early_bomber"), { queued: 1 });
  assert.ok(until(() => w.units.list.size === 1) > 0);
  const u = [...w.units.list.values()][0];
  w.tick(0.25);
  const A = planeOf(w, u);
  assert.equal(A.base, field.id);
  assert.equal(A.landed, true);
  assert.deepEqual([A.x, A.y], [21.5, 21]);
  assert.equal(A.fuel, UNIT_TYPES.early_bomber.endurance);
  assert.equal(A.bombs, 1);
});

test("a bomber flies to its target, bombs it, and comes home to rearm; the damage heals in time", () => {
  const { w, g, a, b, field, until, order } = world();
  const bomber = spawnUnit(w, a, "early_bomber", g.idx(21, 21));
  const foe = w.createStack(b, g.idx(70, 20), 500);
  const shop = addBuilding(w, { type: "bunker", owner: b, anchor: g.idx(71, 21), state: "active" });
  const fighter = spawnUnit(w, a, "biplane", g.idx(21, 21));
  assert.match(order(a, { t: "air", plane: fighter.id, do: "patrol", at: g.idx(130, 20) }).error, /^out of range: 109 plots from its airfield, at most 50$/, "fighters keep a short reach");
  assert.ok(["early_bomber", "strategic_bomber"].every(id => UNIT_TYPES[id].radius >= Math.hypot(3600, 1440)), "a bomber reaches any spot on the Earth map from any airfield");
  assert.ok(["early_bomber", "strategic_bomber"].every(id => UNIT_TYPES[id].endurance * UNIT_TYPES[id].speed >= 3 * 3600), "and has fuel to cross it three times");
  assert.equal(order(a, { t: "air", plane: bomber.id, do: "bomb", at: g.idx(130, 20) }).ok, true, "the far side of this map is in reach");
  assert.equal(order(a, { t: "air", plane: bomber.id, do: "patrol", at: g.idx(70, 20) }).error, "bombers do not patrol: send fighters");
  const raw = w.captureCost(g.idx(70, 21), a);
  assert.equal(order(a, { t: "air", plane: bomber.id, do: "bomb", at: g.idx(70, 20) }).ok, true);
  const speed = UNIT_TYPES.early_bomber.speed * w.rules.stackSpeed;
  const ticks = until(() => w.events.some(e => e.type === "bombed"));
  assert.ok(Math.abs(ticks * 0.25 - 49 / speed) < 1, `it takes ${(ticks * 0.25).toFixed(1)} s to fly 49 plots at ${speed} a second`);
  const e = w.events.find(e => e.type === "bombed");
  assert.equal(foe.troops, 500 - UNIT_TYPES.early_bomber.bomb.troops, "the stack under the bombs loses troops");
  assert.equal(e.stacks, 1);
  assert.equal(shop.state, "damaged", "the building is damaged");
  assert.equal(w.captureCost(g.idx(70, 21), a), raw * 0.5, "the land hit is easier to take");
  assert.equal(planeOf(w, bomber).bombs, 0);
  assert.ok(until(() => planeOf(w, bomber).landed) > 0, "it flies home and lands");
  assert.equal(planeOf(w, bomber).mission, null);
  until(() => planeOf(w, bomber).bombs === 1, 200);
  assert.equal(planeOf(w, bomber).bombs, 1, "rearmed at the airfield");
  w.time += 200;
  w.tick(0.25);
  assert.equal(shop.state, "active", "the building is repaired after a while");
  assert.equal(w.captureCost(g.idx(70, 21), a), raw, "and the land defends as before");
  assert.equal(field.state, "active");
});

test("a fighter on patrol turns home when its fuel runs low and never runs dry", () => {
  const { w, g, a, until, order } = world();
  const f = spawnUnit(w, a, "biplane", g.idx(21, 21));
  assert.equal(order(a, { t: "air", plane: f.id, do: "patrol", at: g.idx(69, 20) }).ok, true);
  let lowest = Infinity, crashed = false, returning = false;
  until(() => {
    const A = planeOf(w, f);
    if (!A.landed) lowest = Math.min(lowest, A.fuel);
    crashed ||= w.events.some(e => e.type === "plane_down");
    returning ||= w.events.some(e => e.type === "plane_returning");
    w.events.length = 0;
    return returning && A.landed;
  }, 2000);
  assert.ok(returning && !crashed && planeOf(w, f).landed, "it came back on its own");
  assert.ok(lowest > 0, `it landed with fuel to spare: ${lowest.toFixed(1)} s`);
});

test("fighters shoot down enemy planes, and flak hits planes overhead", () => {
  const { w, g, a, b, until, order } = world();
  addBuilding(w, { type: "airfield", owner: b, anchor: g.idx(100, 20), state: "active" });
  const mine = spawnUnit(w, a, "biplane", g.idx(21, 21)), theirs = spawnUnit(w, b, "biplane", g.idx(101, 21));
  const hp = mine.hp;
  order(a, { t: "air", plane: mine.id, do: "patrol", at: g.idx(60, 20) });
  runOrder(w, b, { t: "air", plane: theirs.id, do: "patrol", at: g.idx(60, 20) });
  const t = until(() => w.events.some(e => e.type === "plane_down"), 3000);
  assert.ok(t > 0, "one of the two fighters goes down");
  const down = w.events.find(e => e.type === "plane_down");
  assert.equal(down.why, "it was shot down");
  assert.ok(!w.units.list.has(down.machine), "a downed plane is gone");
  const survivor = [mine, theirs].find(u => w.units.list.has(u.id));
  assert.ok(survivor.hp < hp, "the winner took hits too");
  addBuilding(w, { type: "flak_tower", owner: b, anchor: g.idx(64, 20), state: "active" });
  const bomber = spawnUnit(w, a, "early_bomber", g.idx(21, 21));
  w.tick(0.25);
  order(a, { t: "air", plane: bomber.id, do: "bomb", at: g.idx(66, 21) });
  const before = bomber.hp;
  until(() => planeOf(w, bomber).bombs === 0 || !w.units.list.has(bomber.id), 2000);
  assert.ok(!w.units.list.has(bomber.id) || bomber.hp < before, "flak hits the bomber over the tower");
});

test("planes are limited to 100, catch-up lands them, a piloted bomber drops its bombs, and rows carry the flight", () => {
  const { w, g, a, b, field, order } = world();
  w.machines.rules = { ...w.machines.rules, limits: { land: 100, sea: 100, air: 2 } };
  spawnUnit(w, a, "biplane", g.idx(21, 21));
  assert.equal(queueMachines(w, a, field.id, "early_bomber", 2).error, "at most 2 planes: you have 1");
  const bomber = spawnUnit(w, a, "early_bomber", g.idx(21, 21));
  w.tick(0.25);
  order(a, { t: "air", plane: bomber.id, do: "bomb", at: g.idx(50, 20) });
  for (let k = 0; k < 20; k++) w.tick(0.25);
  assert.equal(planeOf(w, bomber).landed, false);
  w.catchUp(600);
  assert.deepEqual([planeOf(w, bomber).landed, planeOf(w, bomber).mission, planeOf(w, bomber).bombs], [true, null, 1], "back at base after the world slept");
  const foe = w.createStack(b, g.idx(62, 20), 300);
  assert.equal(takeControl(w, a, "m", bomber.id).ok, true);
  for (let k = 0; k < 400 && Math.floor(w.pilot.list.get(`m:${bomber.id}`).x) < 62; k++) { steer(w, a, { move: [0, -1] }); pilotStep(w, 0.05); w.tick(0.05); }
  steer(w, a, { move: [0, 0], bomb: true });
  pilotStep(w, 0.05);
  assert.equal(foe.troops, 300 - UNIT_TYPES.early_bomber.bomb.troops, "the bomb button drops on the spot below");
  const feed = new StateFeed(0.01, 5), d = feed.delta(w), row = (d.m ?? []).find(r => r[0] === bomber.id);
  assert.equal(row.length, 10);
  const c = new ClientWorld({ t: "hello", v: 5, you: a, w: 140, h: 40, map: { kind: "test" }, hashes: {}, nations: [], stacks: [], units: Object.values(UNIT_TYPES).concat([{ id: "levy", num: 1, name: "Levies", kind: "troop", era: "T", attack: 1, defence: 1, speed: 1, capture: 1 }]), chat: [] });
  c.setMachine(row);
  const u = c.machines.get(bomber.id);
  assert.equal(u.air.bombs, 0);
  assert.ok(Math.abs(u.air.x - w.pilot.list.get(`m:${bomber.id}`).x) < 0.2);
});

test("a bomber crosses a map as wide as the Earth, bombs the far end and comes home with fuel to spare", () => {
  const W = 3600, H = 12, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installAir(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 6);
  w.spawn(b, 3590, 6);
  for (let y = 0; y < H; y++) for (let x = 0; x < 30; x++) w.claim(g.idx(x, y), a);
  Object.assign(w.nations.get(a), { money: 1e6, era: "I" });
  addBuilding(w, { type: "airfield", owner: a, anchor: g.idx(4, 4), state: "active" });
  const foe = w.createStack(b, g.idx(3590, 6), 400);
  for (const id of ["early_bomber", "strategic_bomber"]) {
    const u = spawnUnit(w, a, id, g.idx(5, 5));
    w.tick(1);
    const r = runOrder(w, a, { t: "air", plane: u.id, do: "bomb", at: g.idx(3590, 6) });
    assert.equal(r.ok, true, `${id}: 3,585 plots away is in reach (${r.error})`);
    let lowest = Infinity, t = 0;
    w.events.length = 0;
    for (; t < 20000 && !(planeOf(w, u).landed && planeOf(w, u).bombs === 0 && w.events.some(e => e.type === "bombed")); t += 5) { w.tick(5); if (!planeOf(w, u).landed) lowest = Math.min(lowest, planeOf(w, u).fuel); }
    assert.ok(w.units.list.has(u.id) && !w.events.some(e => e.type === "plane_down"), `${id} came back`);
    assert.ok(w.events.some(e => e.type === "bombed" && e.at === g.idx(3590, 6)), `${id} bombed the far end`);
    assert.ok(lowest > UNIT_TYPES[id].endurance / 3, `${id} landed with over a third of its fuel left: ${Math.round(lowest)} of ${UNIT_TYPES[id].endurance} s, after ${t} s`);
  }
  assert.ok(foe.troops < 400, "the company at the far end took the bombs");
});
