import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings } from "../src/sim/buildings.js";
import { installMachines, spawnUnit } from "../src/sim/units.js";
import { installSoldiers, fieldOf, fieldTroops, trimField, SOLDIER_RULES } from "../src/sim/soldiers.js";
import { soldierCount, soldierTypes, typeOfSlot, formationSlot } from "../src/shared/soldiers.js";
import { runOrder } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";

function world({ fieldCap = 1000, maxCompanies = 100 } = {}) {
  const W = 60, H = 30, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = i % W >= 28 && i % W < 32 && ((i / W) | 0) < 10 ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installSoldiers(w, { rules: { ...SOLDIER_RULES, fieldCap, maxCompanies } });
  const g = w.grid, a = w.addNation({ name: "A" }), bot = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 10, 20);
  w.spawn(bot, 50, 20);
  for (let y = 12; y < H; y++) for (let x = 0; x < 25; x++) w.claim(g.idx(x, y), a);
  for (let y = 12; y < H; y++) for (let x = 40; x < W; x++) w.claim(g.idx(x, y), bot);
  Object.assign(w.nations.get(a), { troops: 30000 });
  Object.assign(w.nations.get(bot), { troops: 30000 });
  return { w, g, a, bot, n: w.nations.get(a), order: m => runOrder(w, a, m) };
}

test("soldiers are counted ten troops each, by type, the same way on both ends", () => {
  assert.deepEqual(SOLDIER_RULES, { troopsEach: 10, fieldCap: 1000, maxCompanies: 100, spacing: 0.34, drawZoom: 14, drawArea: 900 });
  assert.equal(soldierCount(0, 10), 0);
  assert.equal(soldierCount(3, 10), 1, "a wounded soldier still stands");
  assert.equal(soldierCount(100, 10), 10);
  assert.equal(soldierCount(101, 10), 10);
  assert.equal(soldierCount(99.5, 10), 9, "a company loses a soldier as its troops fall");
  assert.deepEqual(soldierTypes(95, { knight: 30 }, 10), [["levy", 6], ["knight", 3]]);
  assert.deepEqual(soldierTypes(1000, { archer: 250, knight: 250 }, 10), [["levy", 50], ["archer", 25], ["knight", 25]]);
  const types = soldierTypes(1000, { archer: 250, knight: 250 }, 10);
  assert.deepEqual([0, 49, 50, 74, 75, 99, 100].map(k => typeOfSlot(types, k)), ["levy", "levy", "archer", "archer", "knight", "knight", null]);
  const slots = Array.from({ length: 1000 }, (_, k) => formationSlot(k, 0.34));
  const far = Math.max(...slots.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(far > 5 && far < 7.5, `a thousand soldiers spread about six plots from the middle: ${far.toFixed(2)}`);
  let close = Infinity;
  for (let i = 0; i < 200; i++) for (let j = i + 1; j < 200; j++) close = Math.min(close, Math.hypot(slots[i][0] - slots[j][0], slots[i][1] - slots[j][1]));
  assert.ok(close > 0.2, `no two soldiers stand on each other: ${close.toFixed(2)}`);
});

test("a player has at most 1,000 soldiers in the field, counting boats; bots are not limited", () => {
  const { w, g, a, bot, n, order } = world();
  const first = order({ t: "stack", share: 0.5, at: g.idx(10, 20) });
  assert.equal(first.ok, true);
  assert.equal(w.stacks.get(first.stack).troops, 10000, "the stack is cut to the room left in the field");
  assert.equal(n.troops, 20000, "the rest stay home");
  assert.deepEqual(fieldOf(w, a), { soldiers: 1000, cap: 1000, companies: 1, maxCompanies: 100, troopsEach: 10 });
  assert.equal(order({ t: "stack", share: 0.5, at: g.idx(12, 20) }).error, "at most 1,000 soldiers in the field: disband some or send them home");
  assert.equal(order({ t: "attack", at: g.idx(30, 25) }).error, "at most 1,000 soldiers in the field: disband some or send them home");
  assert.ok(w.createStack(bot, g.idx(50, 20), 20000), "a bot stack of 2,000 soldiers' worth is fine");
  const s = w.stacks.get(first.stack);
  const boat = spawnUnit(w, a, "transport_boat", g.idx(29, 5));
  boat.cargo = { troops: 4000, owner: a, mix: null, xp: 0 };
  s.troops = 6000;
  assert.equal(fieldTroops(w, a), 10000, "troops at sea still count");
  assert.equal(order({ t: "stack", share: 0.5 }).error, "at most 1,000 soldiers in the field: disband some or send them home");
});

test("picked soldiers leave their company by type; the whole company is used as it is", () => {
  const { w, g, a, n, order } = world();
  n.mix = { knight: 6000, archer: 3000 };
  const r = order({ t: "stack", share: 1 / 3, at: g.idx(10, 20) });
  const s = w.stacks.get(r.stack);
  assert.equal(s.troops, 10000);
  assert.deepEqual(soldierTypes(s.troops, s.mix, 10), [["levy", 700], ["knight", 200], ["archer", 100]]);
  const d = order({ t: "detach", picks: [{ stack: s.id, take: { knight: 20, archer: 5 } }] });
  assert.equal(d.ok, true);
  assert.equal(d.stacks.length, 1);
  const c = w.stacks.get(d.stacks[0]);
  assert.notEqual(c.id, s.id);
  assert.ok(Math.abs(c.troops - 250) < 1e-6, `25 soldiers are 250 troops: ${c.troops}`);
  assert.ok(Math.abs(c.mix.knight - 200) < 1e-6 && Math.abs(c.mix.archer - 50) < 1e-6 && !c.mix.levy, JSON.stringify(c.mix));
  assert.ok(Math.abs(s.troops - 9750) < 1e-6 && Math.abs(s.mix.knight - 1800) < 1e-6 && Math.abs(s.mix.archer - 950) < 1e-6);
  assert.equal(c.pos, s.pos);
  assert.equal(c.order, "hold");
  const all = order({ t: "detach", picks: [{ stack: c.id, take: { knight: 20, archer: 5 } }] });
  assert.deepEqual(all.stacks, [c.id], "taking every soldier keeps the company");
  assert.equal(order({ t: "detach", picks: [{ stack: 999, take: { levy: 1 } }] }).error, "not your company");
  assert.equal(order({ t: "detach", picks: [{ stack: s.id, take: { levy: "x" } }] }).error, "no soldiers picked");
  assert.equal(order({ t: "detach", picks: [] }).error, "pick soldiers from 1 to 100 companies");
});

test("soldiers picked from companies side by side leave as one company, and the company limit holds", () => {
  const { w, g, a, order } = world({ maxCompanies: 3 });
  const one = order({ t: "stack", share: 0.1, at: g.idx(10, 20) }).stack;
  const two = order({ t: "stack", share: 0.1, at: g.idx(11, 20) }).stack;
  const d = order({ t: "detach", picks: [{ stack: one, take: { levy: 10 } }, { stack: two, take: { levy: 15 } }] });
  assert.equal(d.stacks.length, 1, "the two parts join");
  assert.ok(Math.abs(w.stacks.get(d.stacks[0]).troops - 250) < 1e-6);
  assert.equal(w.stacks.size, 3);
  assert.equal(order({ t: "stack", share: 0.1, at: g.idx(14, 20) }).error, "at most 3 companies in the field: join some together first");
  assert.equal(order({ t: "split", stack: one, share: 0.5 }).error, "at most 3 companies in the field: join some together first");
  const far = order({ t: "detach", picks: [{ stack: one, take: { levy: 5 } }] });
  assert.equal(far.ok, false);
  assert.equal(far.error, "at most 3 companies in the field: join some together first");
});

test("an old world's players keep 1,000 soldiers in the field; the rest go home with their types", () => {
  const { w, g, a, n } = world();
  n.mix = null;
  const big = w.createStack(a, g.idx(10, 20), 9000);
  const small = w.createStack(a, g.idx(12, 20), 1000);
  big.troops = 14000;
  big.mix = { knight: 7000 };
  small.troops = 1000;
  const home = n.troops;
  const moved = trimField(w);
  assert.deepEqual([...moved], [[a, 5000]]);
  assert.equal(fieldTroops(w, a), 10000);
  assert.equal(big.troops, 9000);
  assert.ok(Math.abs(big.mix.knight - 4500) < 1e-6, "the stack keeps its share of knights");
  assert.equal(n.troops, home + 5000);
  assert.ok(Math.abs(n.mix.knight - 2500) < 1e-6, "the knights sent home stay knights");
  assert.equal(trimField(w).size, 0, "a second pass changes nothing");
});

test("many companies told to advance at once take turns to find the border, and all set off", () => {
  const { w, g, a } = world();
  const list = [];
  for (let k = 0; k < 20; k++) list.push(w.createStack(a, g.idx(3 + (k % 5), 24 + Math.floor(k / 5)), 100));
  for (const s of list) w.orderAdvance(s.id, null, true);
  w.tick(0.25);
  const first = list.filter(s => s.path.length).length;
  assert.equal(first, w.rules.seeksPerTick, `only ${w.rules.seeksPerTick} look for the border in one tick`);
  for (let k = 0; k < 4; k++) w.tick(0.25);
  assert.ok(list.every(s => s.path.length || s.order !== "advance" || w.owner[s.pos] !== a), "every company is on its way");
});

test("a company forms up as a leader in front and even ranks behind, never on top of each other", async () => {
  const { rankSlots } = await import("../src/shared/soldiers.js");
  const spacing = 0.34;
  for (const n of [1, 2, 7, 25, 100, 400]) {
    const list = rankSlots(n, spacing);
    assert.equal(list.length, n);
    const [leader, ...rest] = list;
    assert.equal(leader[1], 0, "the leader walks in the middle");
    assert.ok(rest.every(([f]) => f < leader[0] - spacing), `${n}: every soldier is behind the leader`);
    const fronts = [...new Set(rest.map(([f]) => f.toFixed(4)))];
    const width = Math.max(0, ...fronts.map(k => rest.filter(([f]) => f.toFixed(4) === k).length));
    assert.ok(width <= 12, `${n}: ranks at most 12 wide, here ${width}`);
    let close = Infinity;
    for (let i = 0; i < Math.min(list.length, 150); i++) for (let j = i + 1; j < Math.min(list.length, 150); j++) close = Math.min(close, Math.hypot(list[i][0] - list[j][0], list[i][1] - list[j][1]));
    if (n > 1) assert.ok(close >= spacing * 0.89, `${n}: nobody stands on anyone: ${close.toFixed(3)}`);
    const sides = rest.map(([, s]) => s), mid = sides.reduce((a, b) => a + b, 0) / Math.max(1, sides.length);
    assert.ok(Math.abs(mid) < 1e-9, `${n}: the ranks are centred on the leader`);
  }
});

test("a company at sea still counts against the company limit, so landing cannot go over it", () => {
  const { w, g, a, order } = world({ maxCompanies: 3 });
  const one = order({ t: "stack", share: 0.05, at: g.idx(10, 20) }), two = order({ t: "stack", share: 0.05, at: g.idx(11, 20) });
  assert.ok(one.ok && two.ok);
  const boat = spawnUnit(w, a, "transport_boat", g.idx(29, 5));
  boat.cargo = { troops: 500, owner: a, mix: null, xp: 0 };
  assert.equal(fieldOf(w, a).companies, 3, "two companies on land and one aboard");
  assert.match(order({ t: "stack", share: 0.05, at: g.idx(12, 20) }).error, /at most 3 companies/);
  boat.cargo = null;
  assert.equal(order({ t: "stack", share: 0.05, at: g.idx(12, 20) }).ok, true, "once it has landed as a stack, the count is the same");
});
