import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding, BUILDINGS } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads, setRoad } from "../src/sim/logistics.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installAir, planeOf } from "../src/sim/air.js";
import { installNavy } from "../src/sim/navy.js";
import { installNukes, NUKE_RULES, detonate, nukeView, flightsOf } from "../src/sim/nukes.js";
import { initResearch, TREE } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { runOrder, publicEvents } from "../src/game.js";
import { POWER_OF } from "../src/admin.js";
import { TID } from "../src/shared/terrain.js";

const LAND = x => x < 110 ? TID.grassland : x < 115 ? TID.shallows : x < 125 ? TID.ocean : TID.deep_ocean;

function world() {
  const W = 140, H = 60, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = LAND(i % W);
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
  installNukes(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 30);
  w.spawn(b, 90, 30);
  for (let y = 0; y < H; y++) { for (let x = 0; x < 30; x++) w.claim(g.idx(x, y), a); for (let x = 30; x < 110; x++) w.claim(g.idx(x, y), b); }
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 0, era: "Mo" });
  const silo = addBuilding(w, { type: "missile_silo", owner: a, anchor: g.idx(5, 5), state: "active" });
  w.events.length = 0;
  const A = w.nations.get(a), B = w.nations.get(b);
  const arm = (kind = "atomic", at = silo) => { A.nuke ??= { silos: {}, flying: [], next: 1 }; A.nuke.silos[at.id] = { kind, left: 0, ready: true, paid: NUKE_RULES.warheads[kind].cost }; };
  const until = (done, most = 2000, dt = 1) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(dt); } return -1; };
  return { w, g, a, b, A, B, silo, arm, until, order: m => runOrder(w, a, { t: "nuke", ...m }) };
}

test("Nuclear weapons, Thermonuclear weapons and Missile defence unlock the silo, the hydrogen warhead and the ABM silo", () => {
  const locks = lockMap(TREE);
  assert.deepEqual([locks.buildings.get("missile_silo"), locks.buildings.get("abm_silo")], ["nuclear_weapons", "missile_defence"]);
  assert.deepEqual(TREE.nodes.find(n => n.id === "thermonuclear").requires, ["nuclear_weapons"]);
  const W = NUKE_RULES.warheads;
  assert.deepEqual([W.atomic.needs, W.atomic.cost, W.hydrogen.needs, W.hydrogen.cost], ["nuclear_weapons", 40000, "thermonuclear", 120000]);
  assert.deepEqual(BUILDINGS.table.missile_silo.silo.warheads, ["atomic", "hydrogen"]);
  assert.equal(BUILDINGS.table.abm_silo.abm.chance, 0.6);
  assert.equal(POWER_OF.nukes, "world", "the host switch needs the World power");
});

test("a silo builds one warhead at a time for gold only, and loses it with the silo", () => {
  const { w, g, a, b, A, silo, until, order } = world();
  initResearch(A);
  assert.equal(order({ op: "build", silo: silo.id, kind: "atomic" }).error, "needs Nuclear weapons");
  A.research.known.push("nuclear_weapons");
  A.money = 50000;
  const r = order({ op: "build", silo: silo.id, kind: "atomic" });
  assert.deepEqual([r.ok, r.seconds, A.money], [true, 900, 10000]);
  assert.equal(order({ op: "build", silo: silo.id, kind: "atomic" }).error, "this silo is already building a warhead");
  const second = addBuilding(w, { type: "missile_silo", owner: a, anchor: g.idx(7, 5), state: "active" });
  assert.equal(order({ op: "build", silo: second.id, kind: "hydrogen" }).error, "needs Thermonuclear weapons");
  assert.equal(order({ op: "build", silo: second.id, kind: "atomic" }).error, "not enough gold: 40000 needed");
  assert.deepEqual(nukeView(w, a).silos[silo.id], ["atomic", 900, 0]);
  assert.ok(until(() => w.events.some(e => e.type === "warhead_ready"), 200, 5) > 170, "it takes 15 minutes");
  assert.deepEqual(nukeView(w, a).silos[silo.id], ["atomic", 0, 1]);
  assert.equal(order({ op: "build", silo: silo.id, kind: "atomic" }).error, "this silo already holds a warhead");
  assert.deepEqual([order({ op: "cancel", silo: silo.id }).refund, A.money], [40000, 50000]);
  order({ op: "build", silo: silo.id, kind: "atomic" });
  silo.owner = b;
  w.tick(1);
  assert.ok(w.events.some(e => e.type === "warhead_lost" && e.building === silo.id), "a captured silo's warhead is lost");
  assert.deepEqual(A.nuke.silos, {});
});

test("a launch is refused when nukes are off, in the peace, or at land that is not an enemy's, and everyone sees one that goes", () => {
  const { w, g, a, b, A, silo, arm, until, order } = world();
  assert.equal(order({ op: "launch", silo: silo.id, at: g.idx(90, 30) }).error, "this silo holds no warhead");
  arm();
  w.nukes.on = false;
  assert.equal(order({ op: "launch", silo: silo.id, at: g.idx(90, 30) }).error, "nuclear weapons are off in this world");
  w.nukes.on = true;
  w.peace = true;
  assert.equal(order({ op: "launch", silo: silo.id, at: g.idx(90, 30) }).error, "no launches during the peace");
  w.peace = false;
  assert.equal(order({ op: "launch", silo: silo.id, at: g.idx(12, 30) }).error, "that is your own land");
  w.claim(g.idx(60, 5), 0);
  assert.equal(order({ op: "launch", silo: silo.id, at: g.idx(60, 5) }).error, "aim at enemy land: nobody owns that");
  const hostile = w.hostile;
  w.hostile = () => false;
  assert.equal(order({ op: "check", silo: silo.id, at: g.idx(90, 30) }).error, "you are not at war with them");
  w.hostile = hostile;
  const c = order({ op: "check", silo: silo.id, at: g.idx(90, 30) });
  assert.deepEqual([c.ok, c.kind, c.flight, c.owner, c.chance, c.radius, c.inner], [true, "atomic", 63, b, 0, 8, 3], "60 s plus a thirtieth of a second a plot");
  const r = order({ op: "launch", silo: silo.id, at: g.idx(90, 30) });
  assert.deepEqual([r.ok, r.seconds], [true, 63]);
  const e = w.events.find(e => e.type === "nuke_launched");
  assert.deepEqual([e.nation, e.toward, e.target, e.seconds, e.radius], [a, b, g.idx(90, 30), 63, 8]);
  assert.equal(publicEvents(w, [e]).length, 1, "sent to everyone");
  assert.deepEqual(A.nuke.silos, {}, "the silo is empty again");
  assert.equal(flightsOf(w).length, 1);
  assert.equal(until(() => w.events.some(e => e.type === "nuke_detonated")), 63);
  assert.equal(flightsOf(w).length, 0);
});

test("the blast craters the middle, clears land but capitals, ruins or damages buildings, and kills or thins what stands in it", () => {
  const { w, g, a, b, B } = world();
  const t = g.idx(92, 30);
  const inner = addBuilding(w, { type: "hut_grass", owner: b, anchor: g.idx(94, 31), state: "active", residents: 10 });
  const outer = addBuilding(w, { type: "hut_grass", owner: b, anchor: g.idx(92, 38), state: "active", residents: 10 });
  setRoad(w, g.idx(93, 29), 1);
  const near = w.createStack(b, g.idx(92, 31), 500), far = w.createStack(b, g.idx(92, 40), 500);
  const tank = spawnUnit(w, b, "main_battle_tank", g.idx(92, 32)), tank2 = spawnUnit(w, b, "main_battle_tank", g.idx(100, 30));
  const jet = spawnUnit(w, b, "jet_fighter", g.idx(92, 30));
  Object.assign(planeOf(w, jet), { x: 91.5, y: 29.5, landed: false, fuel: 99 });
  const hit = detonate(w, { owner: a, kind: "hydrogen", target: t, toward: b });
  assert.deepEqual([w.terrain[t], w.terrain[g.idx(94, 30)], w.terrain[g.idx(100, 30)]], [TID.crater, TID.scorched, TID.grassland]);
  assert.deepEqual([w.owner[g.idx(94, 30)], w.owner[g.idx(100, 30)], w.owner[B.capital]], [0, b, b], "the inner ring is cleared, but never a capital");
  assert.equal(w.log.road[g.idx(93, 29)], 0, "roads in the inner ring are gone");
  assert.deepEqual([inner.state, outer.state, outer.residents], ["rubble", "damaged", 3]);
  assert.deepEqual([w.stacks.has(near.id), Math.round(far.troops)], [false, 200], "inside the inner ring all die, outside 60%");
  assert.deepEqual([!!tank.wreck, !!tank2.wreck, Math.round(tank2.hp)], [true, false, Math.round(UNIT_TYPES.main_battle_tank.hp * 0.4)]);
  assert.equal(w.units.list.has(jet.id), false, "the plane overhead is lost");
  assert.deepEqual([hit.rubble, hit.damaged, hit.stacks, hit.troops, hit.residents], [1, 1, 1, 800, 17]);
  const deep = spawnUnit(w, b, "submarine", g.idx(128, 30)), ship = spawnUnit(w, b, "destroyer", g.idx(120, 30));
  w.tick(0.25);
  detonate(w, { owner: a, kind: "hydrogen", target: g.idx(121, 30), toward: b });
  assert.deepEqual([!!ship.wreck, deep.hp], [true, UNIT_TYPES.submarine.hp], "a submarine deep in the ocean is spared");
  assert.equal(w.events.filter(e => e.type === "nuke_detonated").length, 2);
});

test("an ABM silo near the target stops 60%, a SAM site adds half its 15%, and each roll spends a missile", () => {
  const { w, g, b, B, silo, arm, until, order } = world();
  const abm = addBuilding(w, { type: "abm_silo", owner: b, anchor: g.idx(80, 30), state: "active" });
  const sam = addBuilding(w, { type: "sam_site", owner: b, anchor: g.idx(95, 33), state: "active" });
  addBuilding(w, { type: "abm_silo", owner: b, anchor: g.idx(35, 55), state: "active" });
  arm();
  const c = order({ op: "check", silo: silo.id, at: g.idx(92, 30) });
  assert.deepEqual([c.chance, c.defences], [0.63, 2], "1 - 0.4 * (1 - 0.075); the far silo is out of reach");
  w.nukes.roll = () => 0.5;
  order({ op: "launch", silo: silo.id, at: g.idx(92, 30) });
  until(() => w.events.some(e => e.type === "nuke_intercepted"));
  const e = w.events.find(e => e.type === "nuke_intercepted");
  assert.deepEqual([e.by, e.with, abm.interceptors, sam.missiles], [b, "abm", 1, 4]);
  assert.equal(w.events.some(e => e.type === "nuke_detonated"), false);
  w.nukes.roll = () => 0.99;
  arm();
  order({ op: "launch", silo: silo.id, at: g.idx(92, 30) });
  until(() => w.events.some(e => e.type === "nuke_detonated"));
  assert.deepEqual([abm.interceptors, sam.missiles], [0, 3], "both fired and missed");
  B.money = 5000;
  until(() => abm.interceptors === 2, 400);
  assert.deepEqual([abm.interceptors, B.money], [2, 2000], "they come back one every 3 minutes for 1,500 gold");
  assert.deepEqual(nukeView(w, b).abms[abm.id], [2, 2, 0]);
});

test("a warhead in flight survives a save and lands during catch-up", () => {
  const { w, g, a, A, silo, arm, order } = world();
  arm("hydrogen");
  order({ op: "launch", silo: silo.id, at: g.idx(92, 30) });
  w.nations.set(a, JSON.parse(JSON.stringify(A)));
  w.catchUp(300);
  const e = w.events.find(e => e.type === "nuke_detonated");
  assert.deepEqual([e?.kind, e?.radius, flightsOf(w).length], ["hydrogen", 14, 0]);
});
