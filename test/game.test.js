import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, findEngagements } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { runOrder, RateLimit, applyPresence, victory, StateFeed, publicEvents, ordersOf } from "../src/game.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { makeRng } from "../src/shared/rng.js";
import { isLand, TID } from "../src/shared/terrain.js";
import { simplifyPath } from "../src/shared/pathfind.js";
import { standingOrders, summarise } from "../src/sim/offline.js";

function setup() {
  const w = new World(makeTestMap(160, 100, 7));
  installCombat(w);
  installBots(w, makeRng(1));
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  const spots = [];
  for (let y = 20; y < 80 && spots.length < 2; y += 3)
    for (let x = 20; x < 140 && spots.length < 2; x += 3)
      if (w.canSpawnAt(x, y) && (!spots.length || Math.hypot(x - spots[0][0], y - spots[0][1]) > 30)) spots.push([x, y]);
  const order = (nation, m) => runOrder(w, nation, m);
  assert.equal(order(a, { t: "spawn", x: spots[0][0], y: spots[0][1] }).ok, true);
  assert.equal(order(b, { t: "spawn", x: spots[1][0], y: spots[1][1] }).ok, true);
  return { w, a, b, order };
}

test("spawn checks whole numbers, land and a second spawn", () => {
  const w = new World(makeTestMap(160, 100, 7));
  const a = w.addNation({ name: "A" });
  assert.equal(runOrder(w, a, { t: "spawn", x: 1.5, y: 2 }).ok, false);
  assert.equal(runOrder(w, a, { t: "spawn", x: "3", y: 2 }).ok, false);
  const water = [...Array(w.grid.size).keys()].find(i => !isLand(w.terrain[i]));
  assert.equal(runOrder(w, a, { t: "spawn", x: w.grid.x(water), y: w.grid.y(water) }).error, "cannot spawn there");
  const land = [...Array(w.grid.size).keys()].find(i => w.canSpawnAt(w.grid.x(i), w.grid.y(i)));
  assert.equal(runOrder(w, a, { t: "spawn", x: w.grid.x(land), y: w.grid.y(land) }).ok, true);
  assert.equal(runOrder(w, a, { t: "spawn", x: w.grid.x(land), y: w.grid.y(land) }).error, "already spawned");
  assert.equal(runOrder(w, a, { t: "nonsense" }), null);
  assert.equal(runOrder(w, a, { t: "constructor" }), null);
});

test("stack forms only on your own land and clamps the share", () => {
  const { w, a, b, order } = setup();
  const n = w.nations.get(a), before = n.troops;
  const r = order(a, { t: "stack", share: 7 });
  assert.equal(r.ok, true);
  assert.equal(w.stacks.get(r.stack).troops, Math.floor(before));
  assert.equal(order(a, { t: "stack", at: w.nations.get(b).capital }).error, "stacks form on your own land");
  assert.equal(order(a, { t: "stack", at: -4 }).error, "stacks form on your own land");
  const c = w.addNation({ name: "C" });
  assert.equal(order(c, { t: "stack" }).error, "spawn first");
  w.claim(n.capital, b);
  n.troops = 500;
  const fallback = order(a, { t: "stack", share: 0.5 });
  assert.equal(fallback.ok, true, "with the capital lost, the stack forms on the nation's own border");
  assert.equal(w.owner[w.stacks.get(fallback.stack).pos], a);
});

test("move, advance and route refuse other players' stacks and bad plots", () => {
  const { w, a, b, order } = setup();
  const s = order(a, { t: "stack", share: 0.5 }).stack;
  const target = w.nations.get(b).capital;
  assert.equal(order(b, { t: "move", stack: s, to: target }).error, "not your stack");
  assert.equal(order(a, { t: "move", stack: s, to: w.grid.size }).error, "that plot is off the map");
  assert.equal(order(a, { t: "move", stack: "1", to: target }).error, "not your stack");
  assert.equal(order(b, { t: "advance", stack: s }).error, "not your stack");
  assert.equal(order(b, { t: "route", stack: s, to: target }).error, "not your stack");
  const route = order(a, { t: "route", stack: s, to: target });
  assert.equal(route.ok, true);
  assert.ok(route.plots > 0 && route.seconds > 0 && route.points.length >= 1);
  assert.equal(w.stacks.get(s).path.length, 0, "route does not move the stack");
  assert.equal(order(a, { t: "move", stack: s, to: target }).ok, true);
  assert.ok(w.stacks.get(s).path.length > 0);
  assert.equal(order(a, { t: "advance", stack: s }).ok, true);
  assert.equal(w.stacks.get(s).route, null);
});

test("an advance can keep to unclaimed land or to one nation's land, and players see their own stacks' orders", () => {
  const W = 40, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2, advanceRate: 40, enemyCostFactor: 0.01 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" }), g = w.grid;
  w.spawn(a, 3, 10);
  w.spawn(b, 30, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < 10; y++) for (let x = 10; x < 22; x++) w.claim(g.idx(x, y), b);
  w.nations.get(a).troops = 5000;
  const order = m => runOrder(w, a, m);
  const s = order({ t: "stack", share: 1, at: g.idx(9, 9) }).stack;
  const bPlots = w.nations.get(b).plots;
  const freeTaken = () => { let n = 0; for (let y = 10; y < H; y++) for (let x = 10; x < W; x++) if (w.owner[g.idx(x, y)] === a) n++; return n; };
  assert.deepEqual(order({ t: "advance", stack: s, only: "free" }), { t: "result", of: "advance", ok: true, only: 0 });
  w.tick(0.1);
  assert.ok(freeTaken() > 0, "unclaimed land is taken");
  assert.equal(w.nations.get(b).plots, bPlots, "B's land next to the stack is left alone");
  const freeBefore = freeTaken();
  assert.equal(order({ t: "advance", stack: s, only: b }).ok, true);
  for (let k = 0; k < 5; k++) w.tick(0.1);
  assert.ok(w.nations.get(b).plots < bPlots, "B's land is taken");
  assert.equal(freeTaken(), freeBefore, "unclaimed land within reach is left alone");
  assert.deepEqual(ordersOf(w, a), [{ id: s, to: null, only: b }]);
  for (const only of [a, 999, "x", 1.5]) assert.equal(order({ t: "advance", stack: s, only }).error, "pick another nation's land");
  w.hostile = (p, q) => p !== q && !(p === a && q === b);
  assert.equal(order({ t: "advance", stack: s, only: b }).error, "you are at peace with B");
  const s2 = order({ t: "split", stack: s, share: 0.5 }).stack;
  assert.equal(order({ t: "move", stack: s2, to: g.idx(2, 18) }).ok, true);
  assert.deepEqual(ordersOf(w, a).find(o => o.id === s2), { id: s2, to: g.idx(2, 18), only: null });
  assert.deepEqual(ordersOf(w, b), [], "nobody sees another nation's orders");
});

test("attack forms a stack at your land nearest the click and advances into that nation only", () => {
  const W = 60, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  for (let y = 0; y < H; y++) terrain[y * W + 59] = TID.ocean;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2, advanceRate: 40 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" }), c = w.addNation({ name: "C" }), g = w.grid;
  w.spawn(a, 3, 10); w.spawn(b, 30, 3); w.spawn(c, 30, 16);
  for (let y = 0; y < H; y++) for (let x = 0; x < 20; x++) w.claim(g.idx(x, y), a);
  for (let y = 0; y < 8; y++) for (let x = 25; x < 40; x++) w.claim(g.idx(x, y), b);
  for (let y = 12; y < H; y++) for (let x = 25; x < 40; x++) w.claim(g.idx(x, y), c);
  w.nations.get(a).troops = 5000;
  const order = m => runOrder(w, a, m);
  const r = order({ t: "attack", at: g.idx(30, 4), share: 0.4 });
  assert.equal(r.ok, true);
  assert.equal(r.only, b);
  const s = w.stacks.get(r.stack);
  assert.equal(s.pos, g.idx(19, 4), "the stack forms on the owned plot nearest the click");
  assert.equal(Math.round(s.troops), 2000, "with the slider's share");
  assert.equal(s.order, "advance");
  const bPlots = w.nations.get(b).plots, cPlots = w.nations.get(c).plots;
  for (let k = 0; k < 40 && w.nations.get(b).plots === bPlots; k++) w.tick(0.5);
  assert.ok(w.nations.get(b).plots < bPlots, "B's land is taken");
  assert.equal(w.nations.get(c).plots, cPlots, "C's land is left alone");
  const free = order({ t: "attack", at: g.idx(45, 10), share: 0.2 });
  assert.equal(free.ok, true);
  assert.equal(free.only, 0, "unclaimed land means unclaimed land only");
  assert.equal(order({ t: "attack", at: g.idx(5, 5) }).error, "that is your own land");
  assert.equal(order({ t: "attack", at: g.idx(59, 5) }).error, "pick land, not water");
  assert.equal(order({ t: "attack", at: -1 }).error, "that plot is off the map");
  w.hostile = (p, q) => p !== q && !(p === a && q === c);
  assert.equal(order({ t: "attack", at: g.idx(30, 16) }).error, "you are at peace with C");
  w.nations.get(a).troops = 1;
  assert.equal(order({ t: "attack", at: g.idx(30, 4) }).error, "not enough troops");
});

function strip(W, H) {
  const terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2, advanceRate: 40 });
  const g = w.grid, nation = (name, x, y) => { const id = w.addNation({ name }); w.spawn(id, x, y); w.nations.get(id).troops = 5000; return id; };
  const fill = (id, x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w.claim(g.idx(x, y), id); };
  const run = (until, ticks = 600) => { for (let k = 0; k < ticks; k++) { w.tick(0.5); if (until()) return true; } return false; };
  const count = (id, x0, x1, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (w.owner[g.idx(x, y)] === id) n++; return n; };
  return { w, g, nation, fill, run, count };
}

test("an advance with nothing in reach walks through its own land to find what it wants", () => {
  const { w, g, nation, fill, run, count } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 35, 3);
  fill(a, 0, 30, 0, 20);
  fill(b, 30, 40, 0, 10);
  const bPlots = w.nations.get(b).plots;
  const bot = w.createStack(a, g.idx(2, 15), 1000);
  w.orderAdvance(bot.id);
  w.tick(0.5);
  assert.equal(bot.order, "hold", "without seeking, as bots use it, the advance stops at once");
  assert.equal(w.events.find(e => e.type === "advance_done" && e.stack === bot.id).sought, undefined);
  const s = runOrder(w, a, { t: "advance", stack: bot.id, only: "free" });
  assert.equal(s.ok, true);
  w.tick(0.5);
  const heading = ordersOf(w, a)[0];
  assert.equal(heading.only, 0);
  assert.ok(heading.to !== null && g.x(heading.to) === 30 && g.y(heading.to) >= 10, `it heads for the nearest unclaimed plot, got ${heading.to !== null && [g.x(heading.to), g.y(heading.to)]}`);
  assert.ok(run(() => count(a, 30, 60, 10, 20) > 40), "it reaches the unclaimed land and takes it");
  assert.ok(g.x(bot.pos) >= 30, "the stack itself moved to the new land");
  assert.equal(w.nations.get(b).plots, bPlots, "B's land on the way is left alone");
  assert.equal(bot.order, "advance");
});

test("a kept advance stops with a reason when a third nation walls off what it wants", () => {
  const { w, g, nation, fill, run, count } = strip(50, 20);
  const a = nation("A", 3, 10), b = nation("B", 25, 10);
  fill(a, 0, 20, 0, 20);
  fill(b, 20, 30, 0, 20);
  const bPlots = w.nations.get(b).plots;
  const s = w.createStack(a, g.idx(2, 10), 1000);
  assert.equal(runOrder(w, a, { t: "advance", stack: s.id, only: "free" }).ok, true);
  w.tick(0.5);
  const done = w.events.find(e => e.type === "advance_done" && e.stack === s.id);
  assert.deepEqual({ order: s.order, only: done?.only, sought: done?.sought }, { order: "hold", only: 0, sought: true });
  assert.equal(s.pos, g.idx(2, 10), "it does not wander off");
  assert.equal(w.nations.get(b).plots, bPlots, "and never touches B");
  assert.equal(runOrder(w, a, { t: "advance", stack: s.id }).ok, true);
  assert.ok(run(() => w.nations.get(b).plots < bPlots), "a plain advance takes any land, so it walks to B and attacks");
  assert.equal(count(a, 30, 50, 0, 20), 0, "the unclaimed land beyond B is still out of reach");
});

test("advancing into one nation's land crosses unclaimed land to reach it, but not a third nation's", () => {
  const { w, g, nation, fill, run, count } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 25, 5), c = nation("C", 45, 10);
  fill(a, 0, 10, 0, 20);
  fill(b, 20, 30, 0, 12);
  fill(c, 40, 50, 0, 20);
  const bPlots = w.nations.get(b).plots, cPlots = w.nations.get(c).plots;
  const s = w.createStack(a, g.idx(2, 5), 2000);
  assert.equal(runOrder(w, a, { t: "advance", stack: s.id, only: c }).ok, true);
  assert.ok(run(() => w.nations.get(c).plots < cPlots - 10), "it finds C and takes C's land");
  assert.equal(w.nations.get(b).plots, bPlots, "B stays whole, although it is in the straight line to C");
  assert.ok(count(a, 10, 40, 0, 20) > 0, "the unclaimed land between is crossed and taken on the way");
});

test("a seeking stack refuses land a third nation took on its path, and finds another way", () => {
  const { w, g, nation, fill, run, count } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 50, 3);
  fill(a, 0, 30, 0, 20);
  const s = w.createStack(a, g.idx(2, 10), 1000);
  runOrder(w, a, { t: "advance", stack: s.id, only: "free" });
  w.tick(0.5);
  const cut = s.path[Math.floor(s.path.length / 2)];
  w.claim(cut, b);
  assert.ok(run(() => count(a, 30, 60, 0, 20) > 20), "it still gets to the unclaimed land");
  assert.equal(w.owner[cut], b, "without taking B's plot on the way");
});

function field(W, H, water = () => false) {
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = water(i % W, (i / W) | 0) ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 }), g = w.grid, a = w.addNation({ name: "A" });
  w.spawn(a, 3, 3);
  for (let i = 0; i < W * H; i++) if (isLand(terrain[i])) w.claim(i, a);
  w.nations.get(a).troops = 5000;
  return { w, g, a, order: m => runOrder(w, a, m) };
}

test("a move can follow a drawn path, through every point in the order drawn", () => {
  const { w, g, a, order } = field(40, 30);
  const s = order({ t: "stack", share: 0.5, at: g.idx(2, 2) }).stack, st = w.stacks.get(s);
  const via = [g.idx(30, 3), g.idx(30, 25), g.idx(3, 25)], to = g.idx(15, 15);
  const walked = [], enter = w.enter.bind(w);
  w.enter = (x, next) => { const ok = enter(x, next); if (ok && x.id === s) walked.push(next); return ok; };
  assert.equal(order({ t: "move", stack: s, to, via }).ok, true);
  assert.deepEqual(ordersOf(w, a), [{ id: s, to, only: null, via }], "the purse shows the whole drawn path");
  const trip = order({ t: "route", stack: s, to, via }), straight = order({ t: "route", stack: s, to });
  assert.ok(trip.ok && trip.plots >= 90 && trip.seconds > straight.seconds * 3, `the route estimate follows the drawn path: ${trip.plots} plots, ${trip.seconds} s against ${straight.seconds} s straight`);
  let k = 0;
  while (st.pos !== via[0] && k++ < 200) w.tick(0.5);
  w.tick(0.5);
  assert.deepEqual(ordersOf(w, a)[0].via, via.slice(1), "points already passed drop off");
  while (st.order === "move" && k++ < 600) w.tick(0.5);
  const at = [...via, to].map(p => walked.indexOf(p));
  assert.ok(at.every((n, j) => n >= 0 && (j === 0 || n > at[j - 1])), `it passes every point in order, at steps ${at}`);
  assert.equal(st.pos, to);
  assert.equal(st.order, "hold");
  assert.deepEqual(ordersOf(w, a), []);
});

test("a drawn path is checked: points on land, at most 32, and a land route through each", () => {
  const { w, g, order } = field(40, 10, x => x >= 18 && x < 22);
  const s = order({ t: "stack", share: 0.5, at: g.idx(2, 2) }).stack, here = g.idx(5, 5);
  assert.equal(order({ t: "move", stack: s, to: here, via: [g.idx(19, 5)] }).error, "every point of a drawn path must be on land");
  assert.equal(order({ t: "move", stack: s, to: here, via: Array(33).fill(here) }).error, "a drawn path has at most 32 points");
  assert.equal(order({ t: "move", stack: s, to: here, via: "5" }).error, "a drawn path is a list of plots");
  assert.equal(order({ t: "move", stack: s, to: here, via: [-1] }).error, "that plot is off the map");
  assert.equal(order({ t: "move", stack: s, to: here, via: [1.5] }).error, "that plot is off the map");
  assert.equal(order({ t: "move", stack: s, to: here, via: [g.idx(30, 5)] }).error, "no land route through those points");
  assert.equal(order({ t: "route", stack: s, to: here, via: [g.idx(30, 5)] }).error, "no land route through those points");
  assert.equal(order({ t: "move", stack: s, to: here, via: Array(32).fill(here) }).ok, true, "32 points are fine, even repeated");
  assert.equal(order({ t: "move", stack: s, to: here, via: [] }).ok, true);
});

test("a split, a plain move or an advance drops a drawn path", () => {
  const { w, g, a, order } = field(40, 30);
  const s = order({ t: "stack", share: 0.8, at: g.idx(2, 2) }).stack, st = w.stacks.get(s);
  const via = [g.idx(30, 3), g.idx(30, 25)];
  order({ t: "move", stack: s, to: g.idx(3, 25), via });
  const c = order({ t: "split", stack: s, share: 0.5 }).stack;
  assert.equal(w.stacks.get(c).via, null, "the new half holds without the path");
  assert.equal(st.via.length, 2, "the old half keeps going");
  order({ t: "move", stack: s, to: g.idx(10, 10) });
  assert.equal(st.via, null);
  order({ t: "move", stack: s, to: g.idx(3, 25), via });
  order({ t: "advance", stack: s });
  assert.equal(st.via, null);
  assert.equal(ordersOf(w, a).some(o => o.via), false);
});

test("disbanding loses a quarter, and sends home only what the troop cap has room for", () => {
  const { w, g, a, order } = field(40, 30);
  const n = w.nations.get(a), cap = w.maxTroops(n);
  n.troops = 3000;
  const s1 = w.createStack(a, g.idx(5, 5), 400);
  assert.deepEqual(order({ t: "disband", stack: s1.id }), { t: "result", of: "disband", ok: true, back: 300, lost: 100, left: 0 });
  assert.equal(n.troops, 2900);
  assert.equal(w.stacks.has(s1.id), false);
  const s2 = w.createStack(a, g.idx(5, 5), 400);
  n.troops = cap - 100;
  assert.deepEqual(order({ t: "disband", stack: s2.id }), { t: "result", of: "disband", ok: true, back: 100, lost: 34, left: 266 }, "133.3 leave the stack: 100 fill the cap and 33.3 are lost");
  assert.equal(n.troops, cap, "the garrison is exactly full");
  assert.ok(Math.abs(s2.troops - 800 / 3) < 1e-9, `the other 266.7 stay in the stack, none wasted: ${s2.troops}`);
  assert.equal(order({ t: "disband", stack: s2.id }).error, "your troops are already at their cap, so the stack stays");
  assert.ok(Math.abs(s2.troops - 800 / 3) < 1e-9);
  const fold = w.createStack(a, g.idx(5, 5), 10);
  n.troops = 1000;
  w.disbandStack(fold.id);
  assert.equal(n.troops, 1010, "bots folding a stack back in lose nothing, as before");
});

test("a drawn line is thinned to its corners, keeping both ends", () => {
  const line = [];
  for (let x = 0; x <= 20; x++) line.push([x, 0]);
  for (let y = 1; y <= 20; y++) line.push([20, y]);
  for (let x = 19; x >= 0; x--) line.push([x, 20]);
  assert.deepEqual(simplifyPath(line, 100), line, "short enough already");
  assert.deepEqual(simplifyPath(line, 10), [[0, 0], [20, 0], [20, 20], [0, 20]]);
  const wiggle = Array.from({ length: 400 }, (_, k) => [k, Math.round(3 * Math.sin(k / 5))]);
  const thin = simplifyPath(wiggle, 33);
  assert.ok(thin.length <= 33 && thin.length >= 10, `${thin.length} points`);
  assert.deepEqual([thin[0], thin.at(-1)], [wiggle[0], wiggle.at(-1)]);
});

test("split, merge and disband keep troop totals and check the rules", () => {
  const { w, a, b, order } = setup();
  const s = order(a, { t: "stack", share: 0.8 }).stack;
  const total = w.stacks.get(s).troops;
  assert.equal(order(b, { t: "split", stack: s, amount: 50 }).error, "not your stack");
  assert.match(order(a, { t: "split", stack: s, amount: 5 }).error, /at least 10/);
  assert.equal(order(a, { t: "split", stack: s }).error, "give amount or share");
  const c = order(a, { t: "split", stack: s, amount: 60 }).stack;
  assert.equal(w.stacks.get(c).troops + w.stacks.get(s).troops, total);
  assert.equal(w.stacks.get(c).route, null);
  const d = order(a, { t: "split", stack: s, share: 0.5 }).stack;
  assert.ok(w.stacks.get(d).troops > 0);
  assert.equal(order(a, { t: "merge", stack: c, into: c }).error, "pick two different stacks");
  assert.equal(order(b, { t: "merge", stack: c, into: s }).error, "not your stack");
  assert.equal(order(a, { t: "merge", stack: c, into: s }).ok, true);
  assert.equal(w.stacks.has(c), false);
  w.stacks.get(d).pos = w.nations.get(b).capital;
  assert.equal(order(a, { t: "merge", stack: d, into: s }).error, "stacks must be next to each other");
  assert.equal(order(a, { t: "disband", stack: d }).error, "disband on your own land");
  const garrison = w.nations.get(a).troops;
  assert.equal(order(a, { t: "disband", stack: s }).ok, true);
  assert.ok(w.nations.get(a).troops > garrison);
  assert.equal(order(a, { t: "disband", stack: s }).error, "not your stack");
});

test("route refuses targets with no land path", () => {
  const { w, a, order } = setup();
  const s = order(a, { t: "stack", share: 0.5 }).stack;
  const water = [...Array(w.grid.size).keys()].find(i => !isLand(w.terrain[i]));
  assert.equal(order(a, { t: "route", stack: s, to: water }).error, "no land route there");
});

test("the rate limit allows a burst, then about the set rate", () => {
  const r = new RateLimit(20, 40);
  let ok = 0;
  for (let k = 0; k < 100; k++) if (r.take(1, 1000)) ok++;
  assert.equal(ok, 40);
  assert.equal(r.take(1, 1000), false);
  let later = 0;
  for (let k = 0; k < 100; k++) if (r.take(1, 2000)) later++;
  assert.equal(later, 20);
  assert.equal(r.take(2, 2000), true, "each account has its own bucket");
});

test("offline players defend at 0.95 and bots are left alone", () => {
  const { w, a, b } = setup();
  const bot = spawnBots(w, 1, makeRng(3))[0];
  applyPresence(w, new Set([a]), 0.95);
  assert.equal(w.nations.get(a).defenceMult, 1);
  assert.equal(w.nations.get(b).defenceMult, 0.95);
  assert.equal(w.nations.get(bot).defenceMult, undefined);
});

test("bots never attack players, but a player's stack next to a bot's stack fights", () => {
  const { w, a } = setup();
  const bot = spawnBots(w, 1, makeRng(5))[0];
  assert.equal(w.hostile(bot, a), false);
  assert.equal(w.hostile(a, bot), true);
  const botStack = w.createStack(bot, w.nations.get(bot).capital, 100);
  const mine = w.createStack(a, w.nations.get(a).capital, 100);
  assert.ok(botStack.id < mine.id, "the bot's stack has the lower id, the case that used to skip the battle");
  mine.pos = botStack.pos + 1;
  assert.equal(findEngagements(w).length, 1);
});

test("victory needs two players and one left standing", () => {
  const { w, a, b } = setup();
  assert.equal(victory(w), null);
  w.nations.get(b).alive = false;
  assert.deepEqual(victory(w), { winner: a, name: "A" });
});

test("the state feed sends only what changed", () => {
  const { w, a, order } = setup();
  const feed = new StateFeed(0.01);
  const first = feed.delta(w);
  assert.equal(first.n.length, w.nations.size);
  assert.equal(feed.delta(w), null, "nothing changed");
  const s = order(a, { t: "stack", share: 0.5 }).stack;
  const d = feed.delta(w);
  assert.deepEqual(d.n.map(r => r[0]), [a]);
  assert.deepEqual(d.s.map(r => r[0]), [s]);
  order(a, { t: "disband", stack: s });
  assert.deepEqual(feed.delta(w).gone, [s]);
  const bot = spawnBots(w, 1, makeRng(9))[0];
  feed.delta(w);
  w.nations.get(bot).troops += 2;
  assert.equal(feed.delta(w), null, "a bot's troops moving under 1 percent is not sent");
  w.nations.get(a).troops += 1;
  assert.deepEqual(feed.delta(w).n.map(r => r[0]), [a], "a player's troops are sent exactly");
  w.nations.get(bot).plots += 3;
  const seen = [];
  for (let k = 0; k < 5; k++) seen.push(feed.delta(w)?.n.some(r => r[0] === bot) ?? false);
  assert.deepEqual(seen.filter(Boolean).length, 1, "a bot's change goes out once, on its turn within 5 updates");
});

test("clients get events that involve players, not bot chatter", () => {
  const { w, a } = setup();
  const bot = spawnBots(w, 1, makeRng(6))[0];
  const events = [
    { type: "stack_created", nation: bot }, { type: "plot_lost", nation: bot, by: a }, { type: "advance_done", stack: 999 },
    { type: "eliminated", nation: bot }, { type: "stack_created", nation: a },
  ];
  assert.deepEqual(publicEvents(w, events).map(e => e.type), ["plot_lost", "eliminated", "stack_created"]);
});

test("a stack forms on any plot you own that you pick", () => {
  const { w, a, order } = setup();
  const n = w.nations.get(a);
  n.troops = 500;
  const far = [...w.borderOf(a)].sort((p, q) => w.grid.dist(q, n.capital) - w.grid.dist(p, n.capital))[0];
  const r = order(a, { t: "stack", share: 0.3, at: far });
  assert.equal(r.ok, true);
  assert.equal(w.stacks.get(r.stack).pos, far);
  assert.notEqual(far, n.capital);
});

test("a lost capital moves to the nearest plot still owned, with an event", () => {
  const { w, a, b } = setup();
  const n = w.nations.get(a), old = n.capital;
  w.claim(old, b);
  w.events.length = 0;
  w.tick(0.25);
  assert.notEqual(n.capital, old);
  assert.equal(w.owner[n.capital], a);
  assert.equal(w.grid.cheb(n.capital, old), 1, "a neighbour of the old capital is the nearest owned plot");
  const e = w.events.find(x => x.type === "capital_moved");
  assert.deepEqual([e.nation, e.from, e.to], [a, old, n.capital]);
  w.tick(0.25);
  assert.equal(w.events.filter(x => x.type === "capital_moved").length, 1, "it only moves once");
});

test("a short route inside one block of the route graph still has a length and a time", () => {
  const { w, a, order } = setup();
  const s = w.stacks.get(order(a, { t: "stack", share: 0.5 }).stack);
  const co = w.pathGraph(), home = co.regionOf(s.pos);
  const near = [...Array(w.grid.size).keys()].find(i => i !== s.pos && co.regionOf(i) === home && w.grid.dist(i, s.pos) >= 3);
  const r = order(a, { t: "route", stack: s.id, to: near });
  assert.equal(r.ok, true);
  const straight = Math.abs(w.grid.x(near) - w.grid.x(s.pos)) + Math.abs(w.grid.y(near) - w.grid.y(s.pos));
  assert.equal(r.plots, straight);
  assert.ok(r.seconds >= 1);
});

test("while a player is away, advancing stacks hold, and fall-back stacks retreat when outnumbered", () => {
  const { w, g, nation, fill } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 50, 10);
  fill(a, 0, 30, 0, 20);
  fill(b, 40, 60, 0, 20);
  const s = w.createStack(a, g.idx(2, 10), 1000);
  runOrder(w, a, { t: "advance", stack: s.id, only: "free" });
  w.tick(0.5);
  assert.ok(s.path.length > 0, "it is walking to unclaimed land");
  const online = new Set([a]), presence = { isOnline: n => online.has(n) };
  standingOrders(w, presence);
  assert.equal(s.order, "advance", "while its owner is online it keeps going");
  online.delete(a);
  standingOrders(w, presence);
  assert.deepEqual({ order: s.order, path: s.path.length }, { order: "hold", path: 0 }, "with its owner away it holds, and drops the path it was on");
  const f = w.createStack(a, g.idx(28, 10), 200);
  assert.equal(runOrder(w, a, { t: "standing", stack: f.id, mode: "fallback" }).ok, true);
  const enemy = w.createStack(b, g.idx(41, 10), 500);
  enemy.pos = g.idx(31, 10);
  standingOrders(w, presence);
  assert.deepEqual({ order: f.order, retreating: f.retreating, goal: f.route?.goal ?? f.path.at(-1) }, { order: "move", retreating: true, goal: w.nations.get(a).capital }, "outnumbered 2.5 to 1, it falls back to the capital");
});

test("the standing order checks its mode, can set every stack and new ones, and the purse shows fall-back stacks", () => {
  const { w, g, a, order } = field(40, 30);
  const s1 = order({ t: "stack", share: 0.2, at: g.idx(5, 5) }).stack;
  assert.equal(order({ t: "standing", stack: s1, mode: "flee" }).error, "mode is hold or fallback");
  assert.equal(order({ t: "standing", stack: 999, mode: "hold" }).error, "not your stack");
  assert.deepEqual(order({ t: "standing", mode: "fallback", all: true }), { t: "result", of: "standing", ok: true, mode: "fallback", stacks: 1 });
  const s2 = order({ t: "stack", share: 0.2, at: g.idx(6, 6) }).stack;
  assert.equal(w.stacks.get(s2).standing, "fallback", "new stacks take the default");
  assert.deepEqual(ordersOf(w, a).map(o => [o.id, o.standing]), [[s1, "fallback"], [s2, "fallback"]]);
  order({ t: "standing", stack: s1, mode: "hold" });
  assert.deepEqual(ordersOf(w, a).map(o => o.id), [s2], "holding is the default and not listed");
});

test("land-loss events name every attacker, even two in the same tick", () => {
  const { w, g, nation, fill } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 30, 10), c = nation("C", 55, 10);
  fill(a, 0, 20, 0, 20);
  fill(b, 20, 40, 0, 20);
  fill(c, 40, 60, 0, 20);
  const sa = w.createStack(a, g.idx(19, 10), 2000), sc = w.createStack(c, g.idx(40, 10), 2000);
  w.orderAdvance(sa.id);
  w.orderAdvance(sc.id);
  w.events.length = 0;
  w.tick(0.5);
  const lost = w.events.filter(e => e.type === "plot_lost" && e.nation === b);
  assert.deepEqual(lost.map(e => e.by).sort(), [a, c].sort(), "one event for each attacker");
  assert.ok(lost.every(e => e.count > 1));
  const taken = by => lost.find(e => e.by === by).count;
  assert.deepEqual(summarise(lost), { plotsLost: taken(a) + taken(c), byAttacker: { [a]: taken(a), [c]: taken(c) }, stacksLost: 0, convoysLost: 0, wars: [], built: 0, other: 0 }, "the away summary counts plots, not events");
});

test("land taken by closing a pocket is reported to the nation that loses it", () => {
  const { w, g, nation, fill } = strip(60, 20);
  const a = nation("A", 3, 10), b = nation("B", 50, 10);
  fill(a, 0, 30, 0, 20);
  fill(b, 10, 12, 10, 12);
  w.events.length = 0;
  w.fillEnclaves(g.idx(12, 10), a);
  assert.deepEqual(w.events.filter(e => e.type === "plot_lost").map(e => [e.nation, e.by, e.count]), [[b, a, 4]]);
  assert.equal(w.owner[g.idx(10, 10)], a);
});
