import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding, BUILDINGS } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installAir, drop } from "../src/sim/air.js";
import { installNavy } from "../src/sim/navy.js";
import { installNukes, NUKE_RULES, defencesAt } from "../src/sim/nukes.js";
import { installShields, shieldsOver, bombCut } from "../src/sim/shields.js";
import { installRailguns } from "../src/sim/railguns.js";
import { TREE } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";

const T = BUILDINGS.table;

function world() {
  const W = 140, H = 60, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = i % W < 120 ? TID.grassland : TID.deep_ocean;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installConstruction(w);
  installResources(w);
  installRoads(w);
  installMachines(w);
  installAir(w);
  installNavy(w);
  installShields(w);
  installRailguns(w);
  installNukes(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 30);
  w.spawn(b, 100, 30);
  for (let y = 0; y < H; y++) { for (let x = 0; x < 30; x++) w.claim(g.idx(x, y), a); for (let x = 30; x < 120; x++) w.claim(g.idx(x, y), b); }
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 0, era: "F" });
  const put = (type, owner, x, y) => addBuilding(w, { type, owner, anchor: g.idx(x, y), state: "active" });
  const A = w.nations.get(a);
  const arm = (kind, at) => { A.nuke ??= { silos: {}, flying: [], next: 1 }; A.nuke.silos[at.id] = { kind, left: 0, ready: true, paid: NUKE_RULES.warheads[kind].cost }; };
  const until = (done, most = 2000, dt = 1) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(dt); } return -1; };
  w.events.length = 0;
  return { w, g, a, b, A, put, arm, until, order: m => runOrder(w, a, { t: "nuke", ...m }) };
}

test("Energy shields, Railguns and Orbital weapons unlock the shields, the railgun battery and the orbital uplink", () => {
  const locks = lockMap(TREE);
  assert.deepEqual(["shield_node", "shield_generator", "railgun_battery", "orbital_uplink"].map(id => locks.buildings.get(id)), ["shields", "shields", "railguns", "orbital_weapons"]);
  assert.deepEqual(TREE.nodes.find(n => n.id === "orbital_weapons").requires, ["space_flight", "railguns"]);
  const O = NUKE_RULES.warheads.orbital;
  assert.deepEqual([O.needs, O.radius, O.inner, O.flight, O.shieldOnly, !!O.conventional], ["orbital_weapons", 5, 2, 10, true, false], "the guide's orbital strike: radius 5, inner 2, 10 seconds");
  assert.deepEqual(T.orbital_uplink.silo.warheads, ["orbital"]);
  assert.deepEqual([T.shield_generator.shield.radius, T.shield_generator.shield.chance], [12, 0.8], "the guide's shield: 80% within 12 plots");
});

test("a hostile shield over the target joins the defences, at its power; your own does not", () => {
  const { w, g, a, b, put } = world();
  const gen = put("shield_generator", b, 60, 30);
  put("shield_node", a, 24, 30);
  const target = g.idx(66, 31);
  const list = defencesAt(w, a, target, "atomic");
  assert.deepEqual(list.map(d => [d.kind, d.owner, d.chance]), [["shield", b, 0.8]], "B's generator covers it; A's own node does not count");
  gen.power = 0.5;
  w.time += 5;
  assert.equal(defencesAt(w, a, target, "atomic")[0].chance, 0.4, "a shield off the grid works at half strength");
  assert.equal(defencesAt(w, a, g.idx(80, 30), "atomic").length, 0, "out of its 12 plots");
  assert.equal(defencesAt(w, a, g.idx(25, 31), "atomic").length, 0, "A's own node never stops A's missiles");
  assert.equal(shieldsOver(w, b, 25.5, 31.5).length, 1, "but it shields A's land from B");
});

test("an orbital strike ignores ABM silos and SAMs, only a shield can stop it, and it clears land like a small nuke", () => {
  const { w, g, a, b, put, arm, until, order } = world();
  const uplink = put("orbital_uplink", a, 5, 5);
  put("abm_silo", b, 70, 30);
  put("sam_site", b, 72, 34);
  const target = g.idx(70, 40);
  assert.equal(defencesAt(w, a, target, "atomic").length, 2, "a warhead meets the ABM silo and the SAM site");
  assert.equal(defencesAt(w, a, target, "orbital").length, 0, "an orbital strike meets neither");
  arm("orbital", uplink);
  const check = order({ op: "check", silo: uplink.id, at: target });
  assert.deepEqual([check.ok, check.flight, check.chance, check.radius, check.inner], [true, 10, 0, 5, 2]);
  w.nukes.on = false;
  assert.equal(order({ op: "launch", silo: uplink.id, at: target }).error, "nuclear weapons are off in this world", "the host's switch turns it off");
  w.nukes.on = true;
  assert.equal(order({ op: "launch", silo: uplink.id, at: target }).ok, true);
  assert.ok(until(() => w.events.some(e => e.type === "nuke_detonated")) <= 11, "it lands in 10 seconds");
  const hit = w.events.find(e => e.type === "nuke_detonated");
  assert.equal(hit.kind, "orbital");
  assert.ok(hit.cleared > 0 && hit.cleared <= 13, `land within 2 plots is cleared: ${hit.cleared}`);
  assert.equal(w.owner[target], 0);
  put("shield_generator", b, 68, 44);
  w.nukes.roll = () => 0;
  arm("orbital", uplink);
  assert.equal(order({ op: "launch", silo: uplink.id, at: g.idx(70, 46) }).ok, true);
  until(() => w.events.some(e => e.type === "nuke_intercepted"));
  const stop = w.events.find(e => e.type === "nuke_intercepted");
  assert.deepEqual([stop.kind, stop.with, stop.by], ["orbital", "shield", b]);
});

test("bombs under an enemy shield do half harm to troops and machines and leave buildings standing", () => {
  const { w, g, a, b, put } = world();
  put("airfield", a, 20, 20);
  const bomber = spawnUnit(w, a, "early_bomber", g.idx(21, 21));
  const open = w.createStack(b, g.idx(50, 10), 500), openShop = put("bunker", b, 51, 10);
  const def = UNIT_TYPES.early_bomber.bomb;
  drop(w, bomber, 50.5, 10.5);
  assert.equal(open.troops, 500 - def.troops);
  assert.equal(openShop.state, "damaged");
  put("shield_generator", b, 60, 40);
  const safe = w.createStack(b, g.idx(62, 44), 500), safeShop = put("bunker", b, 63, 44);
  w.time += 5;
  assert.equal(bombCut(w, a, 62.5, 44.5), 0.5);
  bomber.air.bombs = 1;
  const hit = drop(w, bomber, 62.5, 44.5);
  assert.equal(safe.troops, 500 - def.troops / 2);
  assert.equal(safeShop.state, "active");
  assert.equal(hit.buildings, 0);
  assert.equal(w.events.filter(e => e.type === "bombed").at(-1).shielded, true);
});

test("a railgun battery shoots the nearest enemy company or vehicle in range every 4 s, half as often off the grid", () => {
  const { w, g, a, b, put } = world();
  const gun = put("railgun_battery", a, 25, 30);
  const near = w.createStack(b, g.idx(33, 30), 400), far = w.createStack(b, g.idx(31, 22), 400), away = w.createStack(b, g.idx(45, 30), 400);
  const R = T.railgun_battery.railgun;
  w.tick(1);
  assert.deepEqual([near.troops, far.troops, away.troops], [400 - R.troops, 400, 400], "the nearest company in 10 plots is hit");
  const fired = w.events.find(e => e.type === "railgun_fired");
  assert.deepEqual([fired.by, fired.nation, fired.at, fired.troops], [a, b, near.pos, R.troops]);
  for (let k = 0; k < 4; k++) w.tick(1);
  assert.equal(near.troops, 400 - 2 * R.troops, "it fires again 4 s later");
  gun.power = 0.5;
  for (let k = 0; k < 4; k++) w.tick(1);
  assert.equal(near.troops, 400 - 2 * R.troops, "off the grid it waits twice as long");
  for (let k = 0; k < 4; k++) w.tick(1);
  assert.equal(near.troops, 400 - 3 * R.troops);
  w.stacks.delete(near.id);
  w.stacks.delete(far.id);
  gun.power = 1;
  const tank = spawnUnit(w, b, "main_battle_tank", g.idx(30, 34));
  for (let k = 0; k < 8; k++) w.tick(1);
  assert.equal(tank.hp, UNIT_TYPES.main_battle_tank.hp - 2 * R.machine, "with no company in reach it hits the tank");
  assert.equal(away.troops, 400);
});
