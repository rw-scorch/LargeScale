import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, findEngagements } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { runOrder, RateLimit, applyPresence, victory, StateFeed, publicEvents } from "../src/game.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { makeRng } from "../src/shared/rng.js";
import { isLand } from "../src/shared/terrain.js";

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
