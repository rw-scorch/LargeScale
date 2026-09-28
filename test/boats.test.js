import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installBoats, boatPlan, boatLoss, boatsAtSea } from "../src/sim/boats.js";
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

test("the Move preview plans the crossing: the walk to the coast, the water and the landing", () => {
  const { w, g, a, order } = islands();
  const s = w.createStack(a, g.idx(10, 15), 1000);
  const r = order(a, { t: "route", stack: s.id, to: g.idx(62, 15) });
  assert.ok(r.ok && r.boat, JSON.stringify(r));
  assert.equal(r.crossing, 29);
  assert.ok(Math.abs(r.loss - 0.039) < 1e-9);
  assert.equal(g.x(r.embark), 24, "it embarks on the coast facing the island");
  assert.equal(g.x(r.landing), 55);
  assert.ok(r.points.some(([x]) => x > 25 && x < 55), "the line crosses the water");
  assert.ok(r.points.some(([x, y]) => x === 55 && y === g.y(r.landing)), "and reaches the landing");
  assert.ok(r.seconds > 29 / (UNIT_TYPES.transport_boat.speed * w.rules.stackSpeed), `${r.seconds} s`);
  assert.ok(r.plots >= 14 + 29 + 7 && r.plots <= 14 + 29 + 7 + 4, `${r.plots} plots`);
  const { w: w2, g: g2, a: a2, order: order2 } = islands();
  for (let y = 0; y < 30; y++) for (let x = 15; x < 25; x++) w2.claim(g2.idx(x, y), 0);
  const inland = w2.createStack(a2, g2.idx(10, 15), 100);
  assert.equal(order2(a2, { t: "route", stack: inland.id, to: g2.idx(62, 15) }).error, "your land does not reach that sea yet; take land down to the coast first");
});

test("a group crossing sails as one boat against the limit, and keeps its formation on the far side", () => {
  const { w, g, a, order } = islands();
  const stacks = [0, 1, 2, 3, 4].map(k => w.createStack(a, g.idx(10, 11 + 2 * k), 200));
  const r = order(a, { t: "group", stacks: stacks.map(s => s.id), do: "move", to: g.idx(64, 15) });
  assert.ok(r.ok && r.done === 5 && !r.failed, JSON.stringify(r));
  assert.equal(boatsAtSea(w, a), 1, "five stacks, one crossing");
  assert.ok(order(a, { t: "attack", at: g.idx(75, 5), share: 0.1 }).ok);
  assert.ok(order(a, { t: "attack", at: g.idx(75, 25), share: 0.1 }).ok);
  assert.equal(order(a, { t: "attack", at: g.idx(75, 15), share: 0.1 }).error, "at most 3 boats at sea at once");
  assert.ok(until(w, () => w.events.filter(e => e.type === "landed").length >= 5 && [...w.stacks.values()].filter(s => s.owner === a && g.x(s.pos) > 55 && g.x(s.pos) < 70).every(s => !s.path.length && s.order !== "move"), 4000) >= 0, "all five landed and stopped");
  const ys = [...w.stacks.values()].filter(s => s.owner === a && g.x(s.pos) > 55 && g.x(s.pos) < 70).map(s => g.y(s.pos)).sort((p, q) => p - q);
  assert.deepEqual(ys, [11, 13, 15, 17, 19], "each keeps its place in the line");
});

test("a drawn path may cross water once: walk the points, sail, and walk on", () => {
  const { w, g, a, order } = islands();
  const s = w.createStack(a, g.idx(5, 5), 500);
  const via = [g.idx(15, 25), g.idx(60, 25)], to = g.idx(66, 10);
  const pre = order(a, { t: "route", stack: s.id, to, via });
  assert.ok(pre.ok && pre.boat, JSON.stringify(pre));
  assert.ok(pre.points.some(([x, y]) => x === 15 && y === 25) || pre.points.some(([x, y]) => y > 20 && x < 25), "the preview goes by the first point");
  const r = order(a, { t: "move", stack: s.id, to, via });
  assert.ok(r.ok && r.boat, JSON.stringify(r));
  let seen = false;
  assert.ok(until(w, () => { const t = w.stacks.get(s.id); if (t && g.y(t.pos) >= 24) seen = true; return w.events.some(e => e.type === "boat_launched"); }) >= 0);
  assert.ok(seen, "it walked down to the first point before embarking");
  assert.ok(until(w, () => w.events.some(e => e.type === "landed")) >= 0);
  const ashore = w.stacks.get(w.events.find(e => e.type === "landed").stack);
  assert.ok(until(w, () => !ashore.path.length && !ashore.route && !ashore.via?.length && ashore.order !== "move", 600) >= 0);
  assert.equal(ashore.pos, to, "it walked on to the end of the path");
  const back = w.createStack(a, g.idx(5, 5), 100);
  assert.equal(order(a, { t: "move", stack: back.id, to: g.idx(10, 10), via: [g.idx(60, 10)] }).error, "a drawn path can cross water only once");
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
