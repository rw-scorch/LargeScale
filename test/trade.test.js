import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy, convertToGold } from "../src/sim/economy.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installBoats } from "../src/sim/boats.js";
import { installTrade, tradeView, tripPay } from "../src/sim/trade.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function sea() {
  const W = 100, H = 30, water = x => x >= 20 && x < 80;
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = water(i % W) ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installConstruction(w);
  installMachines(w);
  installBoats(w);
  installTrade(w, { seed: 7 });
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 5, 15);
  w.spawn(b, 95, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < 20; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < H; y++) for (let x = 80; x < W; x++) w.claim(g.idx(x, y), b);
  for (const id of [a, b]) Object.assign(w.nations.get(id), { money: 1000, era: "I", troops: 2000 });
  const port = (owner, x, y) => addBuilding(w, { type: "jetty", owner, anchor: g.idx(x, y), state: "active", progress: 1 });
  w.hostile = () => false;
  w.events.length = 0;
  return { w, g, a, b, port, na: w.nations.get(a), nb: w.nations.get(b) };
}

const until = (w, done, most = 600) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(0.5); } return -1; };
const ships = w => [...w.units.list.values()].filter(u => u.trade && !u.wreck);

test("trade ships are free, sail between the ports of nations at peace, and pay both ends", () => {
  const { w, g, a, b, port, na, nb } = sea();
  const pa = port(a, 19, 15), pb = port(b, 80, 15);
  w.tick(1.01);
  const list = ships(w);
  assert.equal(list.length, 2, "each port sends one ship");
  const out = list.find(u => u.owner === a);
  assert.equal(out.trade.to, pb.id);
  assert.equal(UNIT_TYPES[out.type].name, "Trade ship");
  assert.equal(runOrder(w, a, { t: "machine", machine: out.id, do: "stop" }).error, "trade ships sail on their own between ports");
  assert.ok(Math.abs(out.trade.pay - Math.round(tripPay(w, g.dist(out.at, out.trade.dock)) * 10) / 10) < 1e-9, `a trip of about 60 plots pays ${out.trade.pay}`);
  const before = [na.money, nb.money];
  assert.ok(until(w, () => !ships(w).length) >= 0, "both arrive");
  const pay = list.reduce((s, u) => s + u.trade.pay, 0);
  assert.ok(na.money - before[0] >= pay - 1e-6 && nb.money - before[1] >= pay - 1e-6, `each earned both trips: ${Math.round(na.money - before[0])} and ${Math.round(nb.money - before[1])}, trips worth ${pay}`);
  const v = tradeView(w, na);
  assert.deepEqual([v.ports, v.stations], [1, 0]);
  assert.ok(v.total >= Math.floor(pay) && v.perMinute > 0, JSON.stringify(v));
  assert.ok(pa && pb);
});

test("a nation at war gets no trade, and a port with nowhere to trade sends nothing", () => {
  const { w, a, b, port } = sea();
  port(a, 19, 15);
  port(b, 80, 15);
  w.hostile = (x, y) => x !== y;
  w.tick(1.01);
  assert.equal(ships(w).length, 0);
  const lone = sea();
  lone.port(lone.a, 19, 15);
  lone.w.tick(1.01);
  assert.equal(ships(lone.w).length, 0, "one port alone has nowhere to go");
});

test("a hostile warship captures a trade ship and takes it to its own port, which earns the trip", () => {
  const { w, g, a, b, port, na, nb } = sea();
  const c = w.addNation({ name: "C", human: true });
  w.spawn(c, 50, 2);
  const nc = w.nations.get(c);
  Object.assign(nc, { money: 0, era: "I" });
  for (let y = 0; y < 3; y++) for (let x = 45; x < 55; x++) { w.terrain[g.idx(x, y)] = TID.grassland; w.claim(g.idx(x, y), c); }
  w.units.water = null;
  port(a, 19, 15);
  port(b, 80, 15);
  const home = port(c, 50, 2);
  w.hostile = (x, y) => (x === c) !== (y === c);
  w.tick(1.01);
  const target = ships(w).find(u => u.owner === a);
  const pay = target.trade.pay;
  spawnUnit(w, c, "destroyer", g.idx(g.x(target.at) + 12, 15));
  assert.ok(until(w, () => target.owner === c, 200) >= 0, "the destroyer takes it");
  const taken = w.events.find(e => e.type === "trade_captured");
  assert.deepEqual([taken.nation, taken.by, taken.machine], [a, c, target.id]);
  assert.equal(target.trade.to, home.id, "it sails for the captor's port");
  const before = na.money;
  assert.ok(until(w, () => !w.units.list.has(target.id), 400) >= 0, "and arrives");
  assert.ok(Math.abs(nc.money - pay) < 1e-6, `the captor earned the trip: ${nc.money} of ${pay}`);
  assert.ok(na.money - before < pay, "the owner did not");
  assert.ok(nb);
});

test("a warship with no port of its own sinks the trade ship it catches", () => {
  const { w, g, a, b, port } = sea();
  const c = w.addNation({ name: "C", human: true });
  w.spawn(c, 50, 2);
  port(a, 19, 15);
  port(b, 80, 15);
  w.hostile = (x, y) => (x === c) !== (y === c);
  w.tick(1.01);
  const target = ships(w).find(u => u.owner === a);
  spawnUnit(w, c, "destroyer", g.idx(g.x(target.at) + 12, 15));
  assert.ok(until(w, () => target.wreck, 200) >= 0, "sunk");
  assert.ok(w.events.some(e => e.type === "trade_captured" && e.by === c));
});

test("old worlds turn their goods into gold, and retired buildings, carts and wagons are refunded", () => {
  const { w, g, a, na } = sea();
  installEconomy(w);
  const worth = rules.economy.worth;
  Object.assign(na, { money: 100, stock: { food: 100, wood: 50, steel: 10 }, stored: {} });
  const yard = addBuilding(w, { type: "storage_yard", owner: a, anchor: g.idx(5, 5), state: "active", progress: 1 });
  const kept = addBuilding(w, { type: "barracks", owner: a, anchor: g.idx(10, 5), state: "active", progress: 1 });
  kept.goods = { food: 5 };
  const wagon = w.createStack(a, g.idx(12, 12), 10);
  Object.assign(wagon, { kind: "supply", supplies: 40 });
  const s = w.createStack(a, g.idx(14, 14), 100);
  s.supplyMult = 0.5;
  const old = spawnUnit(w, a, "merchant_ship", g.idx(30, 15));
  const r = convertToGold(w);
  const goods = 100 * worth.food + 50 * worth.wood + 10 * worth.steel;
  const yardCost = w.bld.table.storage_yard.cost.money;
  assert.deepEqual(r, { gold: Math.round(goods + yardCost + 40 * worth.food), removed: 1, wagons: 1, ships: 1 });
  assert.equal(na.money, 100 + goods + yardCost + 40);
  assert.equal(na.stock, undefined);
  assert.ok(!w.bld.list.has(yard.id) && w.bld.list.has(kept.id) && kept.goods === undefined);
  assert.ok(!w.stacks.has(wagon.id) && s.supplyMult === undefined, "the wagon is gone and no stack stays weakened by supply");
  assert.ok(!w.units.list.has(old.id));
});

test("while away, only ports and stations with somewhere to trade earn", () => {
  const { w, a, b, port, na } = sea();
  port(a, 19, 10);
  port(a, 19, 15);
  const before = na.money;
  w.catchUp(600);
  assert.equal(na.money, before, "two of your own jetties 5 plots apart have no trade to estimate");
  port(b, 80, 15);
  w.catchUp(600);
  assert.ok(na.money > before, `with a partner across the water they earn while away: ${Math.round(na.money - before)} gold`);
});

test("a submarine sinks a trade ship instead of capturing it, even with a port of its own", () => {
  const { w, g, a, b, port } = sea();
  const c = w.addNation({ name: "C", human: true });
  w.spawn(c, 50, 2);
  Object.assign(w.nations.get(c), { money: 0, era: "Mo" });
  for (let y = 0; y < 3; y++) for (let x = 45; x < 55; x++) { w.terrain[g.idx(x, y)] = TID.grassland; w.claim(g.idx(x, y), c); }
  w.units.water = null;
  port(a, 19, 15);
  port(b, 80, 15);
  port(c, 50, 2);
  w.hostile = (x, y) => (x === c) !== (y === c);
  w.tick(1.01);
  const target = ships(w).find(u => u.owner === a);
  spawnUnit(w, c, "submarine", g.idx(g.x(target.at) + 12, 15));
  assert.ok(until(w, () => target.wreck, 200) >= 0, "sunk");
  const sunk = w.events.find(e => e.type === "trade_sunk");
  assert.deepEqual([sunk?.nation, sunk?.by], [a, c]);
  assert.ok(!w.events.some(e => e.type === "trade_captured"), "not taken home");
});
