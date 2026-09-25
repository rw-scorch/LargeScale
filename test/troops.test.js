import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, resolveBattles } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { installTroops, addUnits, UNITS, trainTick, setKeep, armyView } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installResearch, complete, TREE } from "../src/sim/research.js";
import { StateFeed, runOrder } from "../src/game.js";
import { runAdmin } from "../src/admin.js";
import { lockMap } from "../src/shared/research.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function flat(W = 60, H = 30) {
  const terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 5, 15);
  w.spawn(b, 50, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < 20; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < H; y++) for (let x = 40; x < W; x++) w.claim(g.idx(x, y), b);
  w.nations.get(a).troops = 5000;
  w.nations.get(b).troops = 5000;
  return { w, g, a, b, n: w.nations.get(a) };
}

const near = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;

test("plain troops behave exactly as before: a bot world with troop types matches one without", () => {
  const run = typed => {
    const w = new World(makeTestMap(160, 100, 7));
    installCombat(w);
    if (typed) installTroops(w);
    installBots(w, makeRng(3));
    spawnBots(w, 12, makeRng(4));
    for (let k = 0; k < 300; k++) w.tick(1);
    return w;
  };
  const plain = run(false), typed = run(true);
  assert.ok(Buffer.from(typed.owner.buffer).equals(Buffer.from(plain.owner.buffer)), "same territory after 300 s");
  assert.deepEqual([...typed.nations.values()].map(n => n.troops), [...plain.nations.values()].map(n => n.troops));
  assert.deepEqual([...typed.stacks.values()].map(s => [s.pos, s.troops]), [...plain.stacks.values()].map(s => [s.pos, s.troops]));
});

test("forming a stack takes the same share of every type in the reserve", () => {
  const { w, g, a, n } = flat();
  assert.equal(addUnits(w, a, "knight", 200), 200);
  assert.equal(n.troops, 5200);
  const s = w.createStack(a, g.idx(10, 15), 2600);
  assert.ok(near(s.mix.knight, 100) && near(n.mix.knight, 100), `half the knights go with half the troops: ${s.mix.knight} in the stack, ${n.mix.knight} at home`);
  assert.equal(n.troops, 2600);
});

test("losses, splits, merges and disbands keep every type's count right", () => {
  const { w, g, a, n } = flat();
  addUnits(w, a, "knight", 200);
  const s = w.createStack(a, g.idx(10, 15), 2600);
  w.loseTroops(s, 1300);
  assert.ok(near(s.mix.knight, 50), "losses come out of every type alike");
  const c = w.splitStack(s.id, 650);
  assert.ok(near(c.mix.knight, 25) && near(s.mix.knight, 25) && c.mix !== s.mix, "a split shares the knights and does not share the object");
  assert.equal(w.mergeStacks(s.id, c.id), true);
  assert.ok(near(s.mix.knight, 50) && s.troops === 1300);
  n.troops = 500;
  const home = n.mix.knight;
  const r = w.dischargeStack(s.id);
  assert.ok(near(r.back, 975) && !w.stacks.has(s.id));
  assert.ok(near(n.mix.knight, home + 37.5), `a quarter of the returning knights are lost too: ${n.mix.knight - home}`);
});

test("a knight stack beats half as many again of levies, as the square law says", () => {
  const { w, g, a, b } = flat();
  w.nations.get(a).bot = true;
  w.nations.get(a).human = false;
  const k = w.createStack(a, g.idx(10, 15), 400), l = w.createStack(b, g.idx(45, 15), 600);
  k.mix = { knight: 400 };
  k.pos = g.idx(30, 15);
  l.pos = g.idx(31, 15);
  k.order = l.order = "advance";
  for (let t = 0; t < 2000 && w.stacks.has(k.id) && w.stacks.has(l.id); t++) resolveBattles(w, 0.25);
  assert.equal(w.stacks.has(l.id), false, "the levies are destroyed");
  assert.ok(k.troops > 150 && k.troops < 250, `about 200 knights are left, as 400 squared minus 600 squared over 3 predicts: ${k.troops.toFixed(1)}`);
  assert.ok(near(k.mix.knight, k.troops), "the survivors are all knights");
});

test("experience raises a stack's power, and merging averages it", () => {
  const { w, g, a } = flat();
  const s = w.createStack(a, g.idx(10, 15), 1000), t = w.createStack(a, g.idx(10, 16), 1000);
  assert.equal(w.powerOf(s, false), 1000);
  w.gainXp(s, 350);
  assert.ok(near(s.xp, 0.35) && near(w.powerOf(s, false), 1100), "0.35 experience makes it Seasoned: 10% stronger");
  w.gainXp(s, 700);
  assert.ok(near(w.powerOf(s, false), 1200), "Veteran at 1");
  w.mergeStacks(s.id, t.id);
  assert.ok(near(s.xp, 0.525) && near(w.powerOf(s, false), 2200), "merging with a green stack of the same size halves the experience: back to Seasoned");
});

test("a stronger stack pays fewer troops to take land, and mounted troops take it faster", () => {
  const { w, g, a } = flat();
  const lev = w.createStack(a, g.idx(19, 5), 1000), kn = w.createStack(a, g.idx(19, 25), 1000);
  kn.mix = { knight: 1000 };
  w.orderAdvance(lev.id, 0);
  w.orderAdvance(kn.id, 0);
  const plotsNear = y0 => { let c = 0; for (let y = y0 - 6; y <= y0 + 6; y++) for (let x = 20; x < 26; x++) if (w.owner[g.idx(x, y)] === a) c++; return c; };
  w.tick(1);
  assert.equal(plotsNear(5), 6, "levies take 6 plots a second");
  assert.equal(plotsNear(25), 9, "knights take half as many again");
  assert.ok(near(1000 - lev.troops, 3.6, 1e-9), `levies pay 0.6 a plot: ${1000 - lev.troops}`);
  assert.ok(near(1000 - kn.troops, 1.8, 1e-9), `knights, three times as strong, pay 0.2 a plot: ${1000 - kn.troops}`);
});

test("a trained reserve makes its land dearer to take, and a stack moves at its slowest type's speed", () => {
  const { w, g, a, b } = flat();
  const plot = g.idx(45, 15), before = w.captureCost(plot, a), nb = w.nations.get(b);
  nb.mix = { archer: nb.troops / 2 };
  assert.ok(near(w.captureCost(plot, a) / before, 0.5 + 0.5 * UNITS.table.archer.defence), "half archers: defence 1.65 times the levies'");
  const s = w.createStack(a, g.idx(10, 15), 300);
  assert.equal(w.speedOf(s), 1);
  s.mix = { knight: 300 };
  assert.equal(w.speedOf(s), 1.5);
  s.mix = { knight: 200, pikeman: 100 };
  assert.equal(w.speedOf(s), 0.9);
  s.mix = { knight: 200 };
  assert.equal(w.speedOf(s), 1, "the 100 levies set the pace");
});

test("state rows carry the mix and experience only when a stack has them, and resend when they change", () => {
  const { w, g, a } = flat();
  const plain = w.createStack(a, g.idx(10, 15), 500), typed = w.createStack(a, g.idx(11, 15), 500);
  typed.mix = { knight: 120.7, archer: 50 };
  typed.xp = 1.2;
  const feed = new StateFeed(), first = feed.delta(w);
  const rowOf = id => first.s.find(r => r[0] === id);
  assert.equal(rowOf(plain.id).length, 5, "a plain stack's row is as short as before");
  assert.deepEqual(rowOf(typed.id).slice(5), [[UNITS.table.knight.num, 120, UNITS.table.archer.num, 50], 2]);
  assert.equal(feed.delta(w), null);
  w.loseTroops(typed, 250);
  assert.deepEqual(feed.delta(w).s.map(r => r[0]), [typed.id]);
});

test("admins can give a troop type, and research unlocks the types", () => {
  const { w, a, n } = flat();
  n.spawned = true;
  const r = runAdmin(w, { op: "give", nation: a, what: "unit", unit: "swordsman", amount: 80 });
  assert.equal(r.ok, true);
  assert.equal(n.mix.swordsman, 80);
  assert.equal(n.troops, 5080);
  assert.equal(runAdmin(w, { op: "give", nation: a, what: "unit", unit: "dragon", amount: 5 }).error, "pick a troop type");
  const locks = lockMap(TREE);
  assert.deepEqual(["club_warrior", "horse_archer", "archer", "knight"].map(u => locks.units.get(u)), ["clubs", "bows", "archery", "stirrups"]);
  for (const d of UNITS.troops) if (d.id !== "levy") assert.ok(locks.units.has(d.id), `${d.id} is unlocked by some research`);
});

function camp() {
  const s = flat();
  installBuildings(s.w);
  installResearch(s.w);
  Object.assign(s.n, { money: 1000, stock: { wood: 100, food: 50 }, era: "T" });
  return s;
}

test("a war camp keeps the reserve topped up to its target, charging for each soldier", () => {
  const { w, g, a, n } = camp();
  assert.equal(setKeep(w, a, { club_warrior: 40 }).error, "Club warriors: needs Clubs and spears research");
  complete(w, n, "clubs");
  assert.deepEqual(setKeep(w, a, { club_warrior: 40 }).keep, { club_warrior: 40 });
  trainTick(w, 5);
  assert.equal(n.drill.why, "build a war camp to train soldiers");
  addBuilding(w, { type: "war_camp", owner: a, anchor: g.idx(8, 8), state: "active" });
  const troops = n.troops, money = n.money;
  trainTick(w, 5);
  assert.ok(near(n.mix.club_warrior, 5), "one war camp trains one a second");
  assert.equal(n.troops, troops, "training turns levies into soldiers, so the total stays the same");
  assert.ok(near(money - n.money, 5 * 0.4), "each club warrior costs 0.4 gold");
  for (let k = 0; k < 20; k++) trainTick(w, 5);
  assert.ok(near(n.mix.club_warrior, 40), "it stops at the target");
  w.createStack(a, g.idx(10, 15), Math.floor(n.troops / 2));
  assert.ok(near(n.mix.club_warrior, 20), "a half-share stack takes half of them");
  trainTick(w, 5);
  assert.ok(near(n.mix.club_warrior, 25), "and the camp starts refilling the reserve");
});

test("a barracks trains Medieval types, as far as materials and levies allow", () => {
  const { w, g, a, n } = camp();
  n.era = "M";
  complete(w, n, "iron_working");
  addBuilding(w, { type: "barracks", owner: a, anchor: g.idx(8, 8), state: "active" });
  assert.equal(setKeep(w, a, { swordsman: 100 }).error, undefined);
  trainTick(w, 5);
  assert.equal(n.drill.why, "not enough gold or iron for swordsmen");
  n.stock.iron = 2;
  trainTick(w, 5);
  assert.ok(near(n.mix.swordsman, 10) && near(n.stock.iron, 0), "2 iron buys 10 swordsmen, which is also the barracks' 2 a second for 5 s");
  n.stock.iron = 100;
  n.troops = 13;
  trainTick(w, 5);
  assert.ok(near(n.mix.swordsman, 13), "only levies at home can be trained");
  assert.equal(n.drill.why, null);
  trainTick(w, 5);
  assert.equal(n.drill.why, "no levies left at home to train");
});

test("the army order checks its targets, and the purse shows the reserve", () => {
  const { w, a, n } = camp();
  const order = m => runOrder(w, a, m);
  assert.equal(order({ t: "army", keep: { knight: 5 } }).error, "Knights: needs the Medieval era");
  assert.equal(order({ t: "army", keep: { levy: 5 } }).error, "levy is not a troop type you can train");
  assert.equal(order({ t: "army", keep: { constructor: 5 } }).error, "constructor is not a troop type you can train");
  assert.equal(order({ t: "army", keep: { club_warrior: -1 } }).error, "keep a whole number from 0 to 1000000");
  assert.equal(order({ t: "army", keep: [] }).error, "give keep: how many of each type to keep at home");
  complete(w, n, "clubs");
  assert.deepEqual(order({ t: "army", keep: { club_warrior: 10, spear_thrower: 5 } }), { t: "result", of: "army", ok: true, keep: { club_warrior: 10, spear_thrower: 5 } });
  assert.deepEqual(order({ t: "army", keep: { spear_thrower: 0 } }).keep, { club_warrior: 10 }, "0 clears a target");
  addUnits(w, a, "club_warrior", 7);
  assert.deepEqual(armyView(w, n), { levies: 5000, reserve: { club_warrior: 7 }, keep: { club_warrior: 10 }, rate: 0, why: null });
});
