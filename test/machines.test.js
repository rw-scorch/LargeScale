import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, resolveBattles, stackPower } from "../src/sim/combat.js";
import { installTroops, UNITS } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installResearch, complete, TREE } from "../src/sim/research.js";
import { installMachines, spawnUnit, saveMachines, UNIT_TYPES, MACHINE_RULES } from "../src/sim/units.js";
import { runOrder, StateFeed } from "../src/game.js";
import { lockMap } from "../src/shared/research.js";
import { TID } from "../src/shared/terrain.js";

function world(W, H, water, { research = false } = {}) {
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = water(i % W, (i / W) | 0) ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  if (research) installResearch(w);
  installMachines(w);
  for (const id of [a, b]) Object.assign(w.nations.get(id), { troops: 5000, money: 1000, stock: { wood: 500, stone: 100 }, era: "M" });
  const claim = (id, x0, x1, y0 = 0, y1 = H) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!water(x, y)) w.claim(g.idx(x, y), id); };
  const order = (nid, m) => runOrder(w, nid, m);
  const spawn = (id, x, y) => { w.spawn(id, x, y); w.nations.get(id).troops = 5000; };
  return { w, g, a, b, claim, order, spawn, n: w.nations.get(a) };
}

function coast() {
  const t = world(80, 30, x => x >= 25 && x < 55);
  t.spawn(t.a, 10, 15);
  t.spawn(t.b, 70, 15);
  t.claim(t.a, 0, 25);
  t.claim(t.b, 60, 80);
  return t;
}

function field() {
  const t = world(60, 30, () => false);
  t.spawn(t.a, 5, 15);
  t.spawn(t.b, 55, 15);
  t.claim(t.a, 0, 30);
  t.claim(t.b, 30, 60);
  return t;
}

const until = (w, done, most = 2000) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(1); } return -1; };

test("the Medieval machines come from the unit registry, and research unlocks them", () => {
  assert.deepEqual(Object.keys(UNIT_TYPES), ["catapult", "trebuchet", "galley", "cog"]);
  assert.ok(UNITS.troops.every(d => d.kind === "troop") && UNITS.troops.length === 9, "the troop list leaves machines out");
  const locks = lockMap(TREE);
  assert.deepEqual(["catapult", "trebuchet", "galley", "cog"].map(id => locks.units.get(id)), ["siegecraft", "siegecraft", "harbours", "harbours"]);
  assert.equal(locks.buildings.get("siege_workshop"), "siegecraft");
  const { w } = field();
  for (const d of Object.values(UNIT_TYPES)) for (const b of d.builtAt) assert.ok(w.bld.table[b].builds.includes(d.id), `${b} builds ${d.id}`);
});

test("a siege workshop builds catapults one after another, paying as each starts, and waits when gold runs short", () => {
  const { w, g, a, n, order } = field();
  const ws = addBuilding(w, { type: "siege_workshop", owner: a, anchor: g.idx(10, 10), state: "active" });
  Object.assign(n, { money: 250 });
  n.stock.wood = 500;
  assert.deepEqual(order(a, { t: "produce", building: ws.id, type: "catapult", count: 3 }), { t: "result", of: "produce", ok: true, queued: 3 });
  w.tick(1);
  assert.equal(n.money, 130, "the first catapult is paid for as it starts");
  const first = until(w, () => w.units.list.size === 1);
  assert.ok(first >= 58 && first <= 61, `it takes its 60 seconds: ${first + 1}`);
  const cat = [...w.units.list.values()][0];
  assert.equal(cat.type, "catapult");
  assert.ok(ws.plots.some(p => g.cheb(p, cat.at) === 1) && !ws.plots.includes(cat.at), "it appears next to the workshop");
  w.tick(1);
  assert.equal(n.money, 10);
  until(w, () => w.units.list.size === 2);
  w.tick(1);
  assert.equal(w.machines.queues.get(ws.id).why, "not enough gold");
  n.money = 500;
  w.tick(1);
  assert.equal(n.money, 380);
  assert.deepEqual(order(a, { t: "produce", building: ws.id, clear: true }), { t: "result", of: "produce", ok: true, cleared: 1, refund: { money: 120, wood: 60 } });
  assert.equal(n.money, 500, "clearing the queue refunds the one being built");
});

test("a harbour launches ships onto the water beside it, and orders are checked", () => {
  const { w, g, a, b, n, order } = coast();
  const hb = addBuilding(w, { type: "harbour", owner: a, anchor: g.idx(23, 10), state: "active" });
  const ws = addBuilding(w, { type: "siege_workshop", owner: a, anchor: g.idx(10, 10), state: "construction" });
  n.money = 5000;
  assert.equal(order(a, { t: "produce", building: hb.id, type: "catapult" }).error, "a harbour builds galley and cog");
  assert.equal(order(a, { t: "produce", building: ws.id, type: "catapult" }).error, "finish the building first");
  assert.equal(order(b, { t: "produce", building: hb.id, type: "cog" }).error, "not your building");
  assert.equal(order(a, { t: "produce", building: hb.id, type: "cog", count: 11 }).error, "at most 10 in a queue");
  assert.equal(order(a, { t: "produce", building: hb.id, type: "cog" }).ok, true);
  until(w, () => w.units.list.size === 1);
  const cog = [...w.units.list.values()][0];
  assert.equal(w.terrain[cog.at], TID.ocean);
  assert.ok(hb.plots.some(p => g.cheb(p, cog.at) === 1), "the cog floats next to the harbour");
  assert.equal(order(a, { t: "machine", machine: cog.id, do: "move", to: g.idx(10, 10) }).error, "ships sail on water only");
  assert.equal(order(a, { t: "machine", machine: cog.id, do: "follow", stack: 1 }).error, "only land machines follow stacks");
  assert.equal(order(a, { t: "machine", machine: cog.id, do: "land", at: g.idx(56, 15) }).error, "nothing aboard");
  assert.equal(order(b, { t: "machine", machine: cog.id, do: "stop" }).error, "not your machine");
});

test("research gates machines like buildings", () => {
  const { w, g, a, n, order } = world(40, 20, () => false, { research: true });
  w.spawn(a, 5, 10);
  const ws = addBuilding(w, { type: "siege_workshop", owner: a, anchor: g.idx(5, 5), state: "active" });
  n.era = "M";
  assert.equal(order(a, { t: "produce", building: ws.id, type: "trebuchet" }).error, "needs Siegecraft research");
  complete(w, n, "siegecraft");
  assert.equal(order(a, { t: "produce", building: ws.id, type: "trebuchet" }).ok, true);
});

test("a land machine follows its stack at its own pace and ends up beside it", () => {
  const { w, g, a, order } = field();
  const cat = spawnUnit(w, a, "catapult", g.idx(5, 5)), s = w.createStack(a, g.idx(6, 5), 500);
  assert.equal(order(a, { t: "machine", machine: cat.id, do: "follow", stack: s.id }).ok, true);
  assert.equal(order(a, { t: "move", stack: s.id, to: g.idx(25, 25) }).ok, true);
  let lag = 0;
  for (let k = 0; k < 20; k++) { w.tick(0.5); lag = Math.max(lag, g.cheb(cat.at, s.pos)); }
  assert.ok(lag >= 2, `slower than the stack, the catapult falls behind (${lag} plots at most)`);
  until(w, () => s.pos === g.idx(25, 25) && g.cheb(cat.at, s.pos) <= 1, 200);
  assert.equal(s.pos, g.idx(25, 25));
  assert.ok(g.cheb(cat.at, s.pos) <= 1, "and catches up once it stops");
  assert.deepEqual(order(a, { t: "machine", machine: cat.id, do: "stop" }), { t: "result", of: "machine", ok: true });
  assert.equal(cat.follow, null);
});

test("a catapult beside a stack adds its attack in battle and takes a share of the losses", () => {
  const plain = field(), backed = field();
  for (const t of [plain, backed]) {
    const { w, g, a, b } = t;
    t.sa = w.createStack(a, g.idx(29, 15), 300);
    t.sb = w.createStack(b, g.idx(30, 15), 300);
    w.orderAdvance(t.sa.id);
  }
  const cat = spawnUnit(backed.w, backed.a, "catapult", backed.g.idx(28, 15));
  assert.equal(backed.w.supportOf(backed.sa, false), 14);
  assert.equal(backed.w.supportOf(backed.sa, true), 2);
  assert.equal(backed.w.supportOf(backed.sb, false), 0);
  assert.ok(Math.abs(stackPower(backed.w, backed.sa) - (stackPower(plain.w, plain.sa) * 314) / 300) < 1e-6, "power rises by the catapult's 14");
  for (let k = 0; k < 10; k++) { resolveBattles(plain.w, 1); resolveBattles(backed.w, 1); }
  assert.ok(cat.hp < 30 && cat.hp > 20, `the catapult is hit: ${cat.hp.toFixed(1)} of 40`);
  assert.ok(backed.sa.troops > plain.sa.troops, `fewer troops lost with it: ${backed.sa.troops.toFixed(1)} against ${plain.sa.troops.toFixed(1)}`);
  assert.ok(backed.sb.troops < plain.sb.troops, "and the enemy loses more");
});

test("siege machines cut the cost of taking another nation's land within their range, not unclaimed land", () => {
  const cost = (kind, owner) => {
    const { w, g, a, b } = field();
    if (owner === 0) for (let y = 0; y < 30; y++) w.claim(g.idx(30, y), 0);
    const s = w.createStack(a, g.idx(29, 15), 1000), before = s.troops;
    if (kind) spawnUnit(w, a, kind, g.idx(27, 15));
    assert.ok(w.enter(s, g.idx(30, 15)));
    return before - s.troops;
  };
  const plain = cost(null, 2);
  assert.ok(Math.abs(cost("catapult", 2) - plain / 2) < 1e-9, "a catapult halves it");
  assert.ok(Math.abs(cost("trebuchet", 2) - plain / 3) < 1e-9, "a trebuchet cuts it to a third");
  assert.equal(cost("catapult", 0), cost(null, 0), "unclaimed land costs the same");
  const { w, g, a } = field();
  spawnUnit(w, a, "catapult", g.idx(20, 15));
  assert.equal(w.siegeAt(a, g.idx(30, 15)), 1, "out of range, no help");
  assert.equal(w.siegeAt(a, g.idx(23, 15)), 2);
});

test("a machine left alone is taken by an enemy stack, but not while a friendly stack is beside it", () => {
  const { w, g, a, b } = field();
  const lone = spawnUnit(w, a, "catapult", g.idx(35, 5)), guarded = spawnUnit(w, a, "catapult", g.idx(35, 20));
  w.createStack(b, g.idx(36, 5), 200);
  w.createStack(b, g.idx(36, 20), 200);
  const guard = w.createStack(b, g.idx(40, 20), 200);
  guard.owner = a;
  guard.pos = g.idx(34, 20);
  w.tick(0.5);
  assert.equal(lone.owner, b);
  assert.equal(guarded.owner, a);
  assert.ok(w.events.some(e => e.type === "machine_captured" && e.machine === lone.id && e.nation === a && e.by === b));
});

test("a stack boards a ship with its mix and experience, sails across, and lands with a 15% loss", () => {
  const { w, g, a, n, order } = coast();
  const cog = spawnUnit(w, a, "cog", g.idx(25, 15));
  n.mix = { knight: 100 };
  n.troops = 300;
  const s = w.createStack(a, g.idx(15, 15), 150);
  s.xp = 1.2;
  assert.deepEqual(order(a, { t: "board", stack: s.id, ship: cog.id }), { t: "result", of: "board", ok: true });
  assert.ok(until(w, () => cog.cargo) > 0, "the stack walks to the shore and embarks");
  assert.equal(w.stacks.has(s.id), false);
  assert.equal(cog.cargo.troops, 150);
  assert.ok(Math.abs(cog.cargo.mix.knight - 50) < 1e-9 && cog.cargo.xp === 1.2);
  assert.equal(order(a, { t: "machine", machine: cog.id, do: "land", at: g.idx(55, 15) }).ok, true);
  const took = until(w, () => !cog.cargo);
  assert.ok(took > 0 && took < 20, `about 30 plots at 3.3 a second: ${took} s`);
  const landed = [...w.stacks.values()].find(t => t.owner === a && t.pos === g.idx(55, 15));
  const attack = (100 + 50 * 3) * 1.2 / 150, left = 150 * 0.85 - 0.6 / attack;
  assert.ok(Math.abs(landed.troops - left) < 1e-9, `${landed.troops} troops ashore, ${left} expected`);
  assert.ok(Math.abs(landed.mix.knight - 50 * left / 150) < 1e-9 && landed.xp === 1.2, "the knights and their experience land with them");
  assert.equal(w.owner[g.idx(55, 15)], a);
  assert.ok(w.events.some(e => e.type === "landed" && e.stack === landed.id));
});

test("landing next to your own jetty loses nobody, and a landing on a defended coast can fail", () => {
  const { w, g, a, b, n, order } = coast();
  addBuilding(w, { type: "jetty", owner: a, anchor: g.idx(24, 20), state: "active" });
  const ship = spawnUnit(w, a, "galley", g.idx(25, 18));
  ship.cargo = { troops: 100, owner: a, mix: null, xp: 0 };
  assert.equal(order(a, { t: "machine", machine: ship.id, do: "land", at: g.idx(24, 18) }).ok, true);
  w.tick(1);
  assert.equal([...w.stacks.values()].find(s => s.pos === g.idx(24, 18))?.troops, 100);
  w.nations.get(b).troops = 200000;
  const raid = spawnUnit(w, a, "galley", g.idx(54, 15));
  raid.cargo = { troops: 30, owner: a, mix: null, xp: 0 };
  w.claim(g.idx(55, 15), b);
  assert.equal(order(a, { t: "machine", machine: raid.id, do: "land", at: g.idx(55, 15) }).ok, true);
  w.tick(1);
  assert.equal(w.owner[g.idx(55, 15)], b);
  assert.equal(raid.cargo, null);
  assert.ok(w.events.some(e => e.type === "landing_failed" && e.lost > 0));
});

test("ships next to enemy ships fight, and a sunk ship loses its cargo and clears after five minutes", () => {
  const { w, g, a, b } = coast();
  const galley = spawnUnit(w, a, "galley", g.idx(40, 15)), cog = spawnUnit(w, b, "cog", g.idx(41, 15));
  galley.cargo = { troops: 100, owner: a, mix: null, xp: 0 };
  const sunk = until(w, () => galley.wreck > 0, 200);
  const perSecond = MACHINE_RULES.lethality * 8 * MACHINE_RULES.hpPerLoss;
  assert.ok(Math.abs(sunk - 60 / perSecond) <= 1, `the galley holds out ${sunk} s against the cog's defence`);
  assert.ok(cog.hp > 20 && !cog.wreck, `the cog survives with ${cog.hp.toFixed(0)} of 80`);
  assert.ok(w.events.some(e => e.type === "machine_destroyed" && e.machine === galley.id && e.lost === 100));
  assert.equal(galley.cargo, null);
  until(w, () => !w.units.list.has(galley.id), 400);
  assert.ok(!w.units.list.has(galley.id) && w.time >= galley.wreck, "the wreck clears");
});

test("machines and build queues are saved and come back the same", () => {
  const { w, g, a, n, order } = coast();
  const hb = addBuilding(w, { type: "harbour", owner: a, anchor: g.idx(23, 10), state: "active" });
  n.money = 5000;
  order(a, { t: "produce", building: hb.id, type: "galley", count: 2 });
  const cat = spawnUnit(w, a, "catapult", g.idx(5, 5)), s = w.createStack(a, g.idx(6, 5), 500);
  order(a, { t: "machine", machine: cat.id, do: "follow", stack: s.id });
  for (let k = 0; k < 30; k++) w.tick(1);
  const saved = JSON.parse(JSON.stringify(saveMachines(w)));
  const again = coast();
  installMachines(again.w, { saved });
  assert.equal(again.w.machines.queues.size, 0, "installing twice keeps the first");
  const fresh = new World({ w: 80, h: 30, terrain: w.terrain }, { spawnRadius: 2 });
  installMachines(fresh, { saved });
  assert.deepEqual([...fresh.units.list.values()], [...w.units.list.values()].map(({ replan, ...u }) => u));
  assert.deepEqual([...fresh.machines.queues], [...w.machines.queues]);
  assert.equal(fresh.units.next, w.units.next);
});

test("machine rows reach clients only when they change", () => {
  const { w, g, a } = coast();
  const feed = new StateFeed(), cog = spawnUnit(w, a, "cog", g.idx(30, 15));
  assert.deepEqual(feed.machineSnapshot(w), [[cog.id, a, 13, g.idx(30, 15), 80, 0, 0, 0, 1]]);
  assert.deepEqual(feed.delta(w).m, [[cog.id, a, 13, g.idx(30, 15), 80, 0, 0, 0, 1]]);
  assert.equal(feed.delta(w)?.m, undefined);
  cog.cargo = { troops: 120.7, owner: a };
  assert.deepEqual(feed.delta(w).m[0].slice(5), [0, 120, 0, 1]);
  w.units.list.delete(cog.id);
  assert.deepEqual(feed.delta(w).mg, [cog.id]);
});

test("ships find their way across a long, winding sea", () => {
  const W = 400, H = 120, sea = (x, y) => (y >= 10 && y < 30 && x < 380) || (x >= 360 && x < 380 && y < 110) || (y >= 90 && y < 110 && x >= 20);
  const { w, g, a, order } = world(W, H, (x, y) => !sea(x, y) ? false : true);
  w.spawn(a, 5, 60);
  const cog = spawnUnit(w, a, "cog", g.idx(5, 20));
  const t0 = performance.now();
  assert.equal(order(a, { t: "machine", machine: cog.id, do: "move", to: g.idx(25, 100) }).ok, true);
  const ms = performance.now() - t0;
  const took = until(w, () => cog.at === g.idx(25, 100), 1000);
  const plots = 355 + 80 + 335;
  assert.ok(took > plots / 3.3 * 0.9 && took < plots / 3.3 * 1.3, `about ${plots} plots of sea at 3.3 a second: ${took} s`);
  assert.ok(ms < 200, `planning the first leg took ${ms.toFixed(1)} ms`);
});
