import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { World } from "../src/sim/territory.js";
import { installBuildings } from "../src/sim/buildings.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads, setRoad } from "../src/sim/logistics.js";
import { installDigging, hpOf, damageState, engView, encodeEng, restoreEng, ENG_RULES, CLASS_OF } from "../src/sim/engineering.js";
import { ClientWorld } from "../src/shared/client.js";
import { TREE } from "../src/sim/research.js";
import { lockMap } from "../src/shared/research.js";
import { runOrder, publicEvents } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID, TERRAIN } from "../src/shared/terrain.js";
import unitData from "../data/units.json" with { type: "json" };

function world() {
  const W = 60, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installBuildings(w);
  installResources(w, undefined, { rng: makeRng(2), hook: false });
  installRoads(w);
  const eng = installDigging(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 5, 15);
  w.spawn(b, 50, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 30 ? a : b);
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 10000, era: "M" });
  const crew = (nid, x, y, engineers) => { const s = w.createStack(nid, g.idx(x, y), Math.max(10, engineers)); s.mix = { engineer: engineers }; return s; };
  const order = (nid, m) => runOrder(w, nid, { t: "dig", ...m });
  const run = (seconds, dt = 1) => { for (let k = 0; k < seconds / dt; k++) w.tick(dt); };
  return { w, g, a, b, eng, crew, order, run, A: w.nations.get(a) };
}

test("Sappers research unlocks engineers, a cheap troop that fights poorly, drawn with the engineer figures", () => {
  const u = unitData.units.find(x => x.id === "engineer");
  assert.deepEqual([u.kind, u.era, u.num, lockMap(TREE).units.get("engineer")], ["troop", "M", 59, "sappers"]);
  assert.ok(u.attack < 1.5 && u.defence < 2, "engineers are weak fighters");
  const sprites = new Set(JSON.parse(readFileSync("public/assets/manifest.json", "utf8")).sprites.map(s => s.id));
  assert.ok(["engineer_e_idle", "engineer_e_walk1", "engineer_s_attack", "engineer_dead"].every(id => sprites.has(id)));
  assert.deepEqual([ENG_RULES.digRate, ENG_RULES.maxCrew, ENG_RULES.baseHp.rock, ENG_RULES.chargeCost, ENG_RULES.blastPower], [1, 5, 300, 200, 150]);
});

test("a full team of engineers takes a mountain plot in a minute; fewer take longer, and more than five do not help", () => {
  const { w, g, a, crew, order, run } = world();
  const peak = g.idx(10, 10), slow = g.idx(20, 10);
  w.terrain[peak] = TID.mountain;
  w.terrain[slow] = TID.mountain;
  crew(a, 9, 10, 80);
  crew(a, 19, 10, 20);
  const r = order(a, { op: "dig", at: peak });
  assert.deepEqual([r.ok, r.target, r.max, r.crew, r.seconds], [true, "mountain", 300, 5, 60], "8 engineers count as 5");
  assert.equal(order(a, { op: "dig", at: slow }).seconds, 150);
  run(30);
  assert.equal(damageState(w, peak), "damaged");
  assert.equal(hpOf(w, peak), 150);
  run(30);
  assert.equal(TERRAIN[w.terrain[peak]].name, "rubble");
  assert.equal(TERRAIN[w.terrain[slow]].name, "mountain", "two engineers are still at it");
  assert.ok(w.events.some(e => e.type === "terrain_broken" && e.at === peak && e.to === "rubble"));
  assert.equal(w.res.edits.get(peak), TID.rubble, "the change goes through the saved terrain edits");
});

test("engineers must stand beside the plot; a charge costs 200 gold and two open a mountain at once", () => {
  const { w, g, a, A, crew, order, run } = world();
  const peak = g.idx(12, 5);
  w.terrain[peak] = TID.mountain;
  crew(a, 14, 5, 10);
  assert.equal(order(a, { op: "dig", at: peak }).error, "no engineers beside that plot");
  crew(a, 11, 5, 10);
  assert.equal(order(a, { op: "charge", at: peak }).ok, true);
  assert.equal(A.money, 10000 - 200);
  assert.equal(order(a, { op: "charge", at: peak }).ok, true);
  run(1);
  assert.equal(TERRAIN[w.terrain[peak]].name, "rubble", "300 hit points from two charges");
  assert.ok(w.events.some(e => e.type === "charge_detonated"));
  A.money = 50;
  w.terrain[g.idx(12, 6)] = TID.hills;
  assert.equal(order(a, { op: "charge", at: g.idx(12, 6) }).error, "a charge costs 200 gold");
  assert.equal(order(a, { op: "dig", at: g.idx(11, 6) }).error, "nothing to dig here");
  w.terrain[g.idx(10, 6)] = TID.rubble;
  assert.match(order(a, { op: "dig", at: g.idx(10, 6) }).error, /rubble is cleared, not dug/);
});

test("digging in another player's land needs a war, and the owner is warned when it starts and at half", () => {
  const { w, g, a, b, crew, order, run } = world();
  const ridge = g.idx(30, 8);
  w.terrain[ridge] = TID.hills;
  crew(a, 29, 8, 50);
  w.hostile = () => false;
  assert.equal(order(a, { op: "dig", at: ridge }).error, "not at war with the owner");
  w.hostile = (x, y) => x !== y;
  assert.equal(order(a, { op: "dig", at: ridge }).ok, true);
  const warned = w.events.filter(e => e.type === "terrain_dug");
  assert.deepEqual(warned.map(e => [e.by, e.nation, !!e.half]), [[a, b, false]]);
  run(20);
  assert.deepEqual(w.events.filter(e => e.type === "terrain_dug").map(e => !!e.half), [false, true], "a second warning at half hit points");
  assert.ok(publicEvents(w, w.events).some(e => e.type === "terrain_dug"), "the warnings reach players");
  assert.ok(!publicEvents(w, w.events).some(e => e.type === "terrain_damaged"), "the per-second damage does not");
  run(20);
  assert.equal(TERRAIN[w.terrain[ridge]].name, "scree", "hills become scree");
});

test("a road or bridge goes first, in a few seconds, before the ground under it", () => {
  const { w, g, a, crew, order, run } = world();
  const bridge = g.idx(15, 20);
  w.terrain[bridge] = TID.river;
  setRoad(w, bridge, 1);
  crew(a, 15, 21, 50);
  const r = order(a, { op: "dig", at: bridge });
  assert.deepEqual([r.target, r.max, r.seconds], ["road", 40, 8]);
  run(8);
  assert.equal(w.log.road[bridge], 0, "the bridge is down");
  assert.ok(w.events.some(e => e.type === "road_broken" && e.at === bridge));
  assert.equal(TERRAIN[w.terrain[bridge]].name, "river", "the river stays");
  assert.equal(order(a, { op: "dig", at: bridge }).error, "nothing to dig here");
});

test("digging through a cliff opens a way where there was none, and the route graph is rebuilt", () => {
  const { w, g, a, crew, order, run } = world();
  for (let y = 0; y < 30; y++) w.terrain[g.idx(25, y)] = TID.cliff;
  w.coarse = null;
  assert.equal(w.route(g.idx(20, 15), g.idx(28, 15)), null, "the cliff wall cuts the map in two");
  crew(a, 24, 15, 50);
  order(a, { op: "charge", at: g.idx(25, 15) });
  order(a, { op: "charge", at: g.idx(25, 15) });
  run(1);
  assert.equal(TERRAIN[w.terrain[g.idx(25, 15)]].name, "rubble");
  assert.ok(w.route(g.idx(20, 15), g.idx(28, 15)), "a route now runs through the breach");
});

test("hit points, jobs and dug plots are saved and come back; idle work is dropped after two minutes", () => {
  const { w, g, a, eng, crew, order, run } = world();
  const peak = g.idx(10, 3);
  w.terrain[peak] = TID.mountain;
  const team = crew(a, 9, 3, 50);
  order(a, { op: "dig", at: peak });
  run(10);
  const bytes = encodeEng(w);
  const copy = world();
  copy.w.terrain[peak] = TID.mountain;
  assert.equal(restoreEng(copy.w, bytes), 2);
  assert.equal(hpOf(copy.w, peak), 250);
  assert.deepEqual(engView(copy.w).jobs.map(j => [j[0], j[1], j[2]]), [[peak, a, 0]]);
  w.stacks.delete(team.id);
  run(ENG_RULES.idleSeconds + 2);
  assert.equal(eng.jobs.size, 0, "with nobody working, the job goes");
  assert.equal(hpOf(w, peak), 250, "but the damage stays");
});

test("the browser's copy counts the same engineers and reads the same hit points as the server", () => {
  const { w, g, a, crew, order, run } = world();
  const peak = g.idx(10, 10);
  w.terrain[peak] = TID.mountain;
  const s = crew(a, 9, 10, 30);
  order(a, { op: "dig", at: peak });
  run(10);
  const c = new ClientWorld({ t: "hello", v: 5, you: a, w: 60, h: 30, map: { kind: "test" }, hashes: {}, nations: [], stacks: [], chat: [], eng: engView(w), engRules: { ...ENG_RULES, classOf: CLASS_OF }, soldierRules: { troopsEach: 10 } });
  c.terrain = w.terrain.slice();
  c.stacks.set(s.id, { id: s.id, owner: a, pos: s.pos, troops: s.troops, mix: { engineer: 30 } });
  assert.equal(c.engineersNear(peak), w.eng.crewOf(a, peak));
  assert.equal(c.engineersNear(g.idx(20, 20)), 0);
  const d = c.digOf(peak);
  assert.deepEqual([d.name, d.cls, d.max, d.hp, d.job?.crew], ["mountain", "rock", 300, 270, 3]);
  run(10);
  c.message({ t: "eng", ...engView(w) });
  assert.equal(c.digOf(peak).hp, 240, "the eng message updates it");
});
