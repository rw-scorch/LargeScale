import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installBoats, boatPlan, boatLoss } from "../src/sim/boats.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function islands() {
  const W = 90, H = 30, water = x => x >= 25 && x < 55;
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = water(i % W) ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installBoats(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 15);
  w.spawn(b, 80, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < 25; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < H; y++) for (let x = 70; x < W; x++) w.claim(g.idx(x, y), b);
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 1000, human: true });
  w.events.length = 0;
  return { w, g, a, b, order: (nid, m) => runOrder(w, nid, m) };
}

const until = (w, done, most = 3000) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(0.5); } return -1; };

test("the transport boat is a free machine nobody builds, and the landing loss grows with the water crossed", () => {
  const d = UNIT_TYPES.transport_boat;
  assert.deepEqual([d.domain, d.cost, d.builtAt, d.transport], ["sea", {}, [], true]);
  const { w } = islands();
  assert.deepEqual([boatLoss(w, 0), boatLoss(w, 30), boatLoss(w, 500), boatLoss(w, 30, true)], [0.01, 0.01 + 0.001 * 30, 0.15, 0]);
  assert.equal(rules.boats.maxBoats, 3);
});

test("a move across water sends the stack by boat from your coast; it lands, carries on, and the boat is gone", () => {
  const { w, g, a, order } = islands();
  const s = w.createStack(a, g.idx(10, 15), 1000);
  const target = g.idx(62, 15);
  const r = order(a, { t: "move", stack: s.id, to: target });
  assert.ok(r.ok && r.boat, JSON.stringify(r));
  assert.equal(r.crossing, 29, "from the first water plot to the last");
  assert.ok(Math.abs(r.loss - 0.039) < 1e-9);
  assert.ok(until(w, () => w.events.some(e => e.type === "boat_launched")) >= 0, "the stack reached the coast and a boat set off");
  const boat = [...w.units.list.values()].find(u => u.type === "transport_boat");
  assert.equal(boat.cargo.troops, 1000);
  assert.ok(!w.stacks.has(s.id));
  assert.ok(until(w, () => w.events.some(e => e.type === "landed")) >= 0, "the boat landed");
  const landed = w.events.find(e => e.type === "landed");
  assert.ok(Math.abs(landed.troops - 1000 * 0.961) < 1, `${landed.troops} troops ashore`);
  assert.ok(![...w.units.list.values()].some(u => u.type === "transport_boat"), "the boat is gone after landing");
  const ashore = w.stacks.get(landed.stack);
  assert.ok(until(w, () => !ashore.path.length && ashore.order !== "move", 400) >= 0);
  assert.equal(ashore.pos, target, "the landed stack walks on to where it was sent");
});

test("an attack across water forms the stack on the coast and advances into that nation after landing", () => {
  const { w, g, a, b, order } = islands();
  const r = order(a, { t: "attack", at: g.idx(75, 15), share: 0.4 });
  assert.ok(r.ok && r.boat && r.only === b, JSON.stringify(r));
  const s = w.stacks.get(r.stack);
  assert.equal(g.x(s.pos), 24, "formed on the coast facing the target");
  const plots = w.nations.get(b).plots;
  assert.ok(until(w, () => w.nations.get(b).plots < plots - 20) >= 0, "it took B's land after landing");
});

test("at most three boats at sea, no boarding or steering a transport, and no landing on a nation at peace", () => {
  const { w, g, a, order } = islands();
  const sent = [0, 1, 2, 3].map(k => order(a, { t: "attack", at: g.idx(75, 5 + k * 5), share: 0.1 }));
  assert.deepEqual(sent.map(r => !!r.ok), [true, true, true, false]);
  assert.equal(sent[3].error, "at most 3 boats at sea at once");
  until(w, () => w.events.some(e => e.type === "boat_launched"));
  const boat = [...w.units.list.values()].find(u => u.type === "transport_boat");
  const other = w.createStack(a, g.idx(5, 5), 100);
  assert.equal(order(a, { t: "board", stack: other.id, ship: boat.id }).error, "a transport boat carries only the stack it was sent for");
  assert.equal(order(a, { t: "machine", machine: boat.id, do: "stop" }).error, "transport boats sail on their own and land where they were sent");
  const inland = islands();
  for (let y = 0; y < 30; y++) for (let x = 15; x < 25; x++) inland.w.claim(inland.g.idx(x, y), 0);
  assert.equal(inland.order(inland.a, { t: "attack", at: inland.g.idx(75, 15) }).error, "your land does not reach that sea yet; take land down to the coast first");
  const { w: w2, g: g2, a: a2, b: b2 } = islands();
  w2.passable = () => false;
  const hostile = w2.hostile;
  w2.hostile = (x, y) => !((x === a2 && y === b2) || (x === b2 && y === a2)) && hostile(x, y);
  assert.equal(boatPlan(w2, a2, g2.idx(10, 15), g2.idx(80, 15)).landing % g2.w, 55, "it lands on the free shore, not on the nation at peace");
});

test("a warship sinks a transport with everyone aboard, and landing by your own port loses nobody", () => {
  const { w, g, a, b, order } = islands();
  const s = w.createStack(a, g.idx(24, 15), 800);
  order(a, { t: "move", stack: s.id, to: g.idx(60, 15) });
  until(w, () => w.events.some(e => e.type === "boat_launched"));
  const boat = [...w.units.list.values()].find(u => u.type === "transport_boat");
  const frigate = spawnUnit(w, b, "frigate", g.idx(28, 15));
  assert.ok(frigate);
  assert.ok(until(w, () => w.events.some(e => e.type === "machine_destroyed" && e.machine === boat.id), 200) >= 0, "the frigate sank the boat");
  assert.equal(w.events.find(e => e.type === "machine_destroyed" && e.machine === boat.id).lost, 800);
  const t = islands();
  for (let y = 0; y < 30; y++) for (let x = 55; x < 70; x++) t.w.claim(t.g.idx(x, y), t.a);
  addBuilding(t.w, { type: "jetty", owner: t.a, anchor: t.g.idx(55, 15), plots: [t.g.idx(55, 15)], state: "active", progress: 1 });
  const plan = boatPlan(t.w, t.a, t.g.idx(10, 15), t.g.idx(56, 15));
  assert.equal(plan.loss, 0, "landing by your own jetty is free");
});
