import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { findPath } from "../src/shared/pathfind.js";
import { makeRng } from "../src/shared/rng.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { TID, isLand } from "../src/shared/terrain.js";

function walk(w, sid) {
  const s = w.stacks.get(sid), full = [s.pos, ...s.path];
  let worst = 0;
  while (s.route) {
    s.pos = full.at(-1);
    s.path = [];
    const t = performance.now();
    assert.ok(w.extendPath(s), "the route extends");
    worst = Math.max(worst, performance.now() - t);
    full.push(...s.path);
  }
  return { full, worst };
}

function flatMap(w, h, fill) {
  const terrain = new Uint8Array(w * h).fill(TID.plains);
  fill?.(terrain, w);
  return new World({ w, h, terrain }, { pathCell: 8 });
}

test("a cell split by water becomes two regions, and the route goes around", () => {
  const w = flatMap(40, 24, (t, W) => {
    for (let y = 0; y < 20; y++) t[y * W + 12] = TID.ocean;
    for (let x = 0; x < 40; x++) t[22 * W + x] = TID.ocean;
    t[23 * 40 + 39] = TID.plains;
  });
  const co = w.pathGraph();
  assert.notEqual(co.regionOf(10), co.regionOf(13), "the wall splits the cell");
  const a = w.addNation({ name: "A" });
  w.owner[10] = a;
  const s = { id: 1, owner: a, pos: 10, troops: 100, path: [], progress: 0, order: "hold" };
  w.stacks.set(1, s);
  assert.ok(w.orderMove(1, 14));
  const { full } = walk(w, 1);
  assert.equal(full.at(-1), 14);
  assert.ok(full.every(i => isLand(w.terrain[i])));
  assert.ok(full.length > 20, "it walks round the end of the wall");
  assert.equal(w.orderMove(1, 23 * 40 + 39), false, "an island corner is refused at once");
});

test("border sets always equal a full scan while territory changes hands", () => {
  const w = new World(makeTestMap(120, 80, 5), { spawnRadius: 5 });
  const rng = makeRng(8);
  installCombat(w);
  spawnBots(w, 12, rng);
  installBots(w, rng);
  for (let t = 0; t < 400; t++) {
    w.tick(0.5);
    for (let k = 0; k < 5; k++) {
      const i = rng.int(0, w.grid.size - 1);
      if (isLand(w.terrain[i])) w.claim(i, rng.int(0, 12));
    }
  }
  let owned = 0;
  for (let i = 0; i < w.grid.size; i++) {
    const o = w.owner[i];
    if (o) owned++;
    assert.equal(o !== 0 && w.borderOf(o).has(i), o !== 0 && w.isBorder(i), `plot ${i}`);
  }
  assert.ok(owned > 500);
  const before = new Map([...w.border].map(([k, v]) => [k, [...v].sort((p, q) => p - q)]));
  w.rebuildBorders();
  for (const [k, v] of w.border) assert.deepEqual([...v].sort((p, q) => p - q), before.get(k) ?? []);
});

test("bots think in slices, each about once per think period, and fold idle stacks back in", () => {
  const w = new World(makeTestMap(400, 260, 3));
  const rng = makeRng(2);
  installCombat(w);
  const bots = spawnBots(w, 60, rng);
  installBots(w, rng);
  for (const n of w.nations.values()) n.troops = w.maxTroops(n);
  const firstStack = new Map();
  let worstBurst = 0;
  for (let t = 0; t < 80; t++) {
    w.tick(0.25);
    const made = w.events.filter(e => e.type === "stack_created");
    worstBurst = Math.max(worstBurst, made.length);
    for (const e of made) if (!firstStack.has(e.nation)) firstStack.set(e.nation, w.time);
    w.events.length = 0;
  }
  assert.ok(worstBurst <= 4, `at most 60 x 0.25 / 5 = 3 bots think per tick (saw ${worstBurst} stacks made)`);
  assert.ok(firstStack.size >= bots.length * 0.9, `${firstStack.size} of ${bots.length} bots acted within 20 s`);
  for (let t = 0; t < 2400; t++) { w.tick(0.25); w.events.length = 0; }
  assert.ok(w.stacks.size <= bots.length, `${w.stacks.size} stacks for ${bots.length} bots after 10 minutes`);
});

test("plot_lost is sent once per losing nation per tick, with a count", () => {
  const w = new World(makeTestMap(160, 100, 7), { spawnRadius: 6 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  let placed = 0;
  for (let y = 10; y < 90 && placed < 2; y += 2)
    for (let x = 10; x < 150 && placed < 2; x += 2) if (w.spawn(placed ? b : a, x, y)) { placed++; x += 20; }
  const nb = w.nations.get(b);
  for (let i = 0; i < w.grid.size; i++) if (w.owner[i] === b) { w.owner[i] = 0; nb.plots--; }
  for (let i = 0; i < w.grid.size; i++) if (isLand(w.terrain[i]) && !w.owner[i] && w.grid.dist(i, w.nations.get(a).capital) < 30) w.claim(i, b);
  w.nations.get(a).troops = 1e6;
  const s = w.createStack(a, [...w.borderOf(a)][0], 400);
  s.troops = 1e6;
  w.rules.advanceRate = 40;
  w.rules.advanceRadius = 10;
  w.orderAdvance(s.id);
  let merged = 0, total = 0;
  for (let t = 0; t < 20; t++) {
    w.tick(0.25);
    const lost = w.events.filter(e => e.type === "plot_lost" && e.nation === b);
    assert.ok(lost.length <= 1, "one event per tick");
    if (lost.length && lost[0].count >= 2) merged++;
    total += lost[0]?.count ?? 0;
    w.events.length = 0;
  }
  assert.ok(merged > 0, "several plots lost in one tick became one event");
  assert.ok(total >= 10, `${total} plots lost in all`);
});

const MAP = "public/map/terrain.bin";
test("long moves on the Earth map plan within the tick budget and stay close to the best path", { skip: !existsSync(MAP) }, () => {
  const meta = JSON.parse(readFileSync("public/map/meta.json", "utf8"));
  const terrain = new Uint8Array(readFileSync(MAP));
  const w = new World({ w: meta.w, h: meta.h, terrain });
  const t0 = performance.now();
  w.pathGraph();
  const buildMs = performance.now() - t0;
  const plot = (lat, lon) => {
    const x0 = Math.round((lon + 180) * 10), y0 = Math.round((84 - lat) * 10);
    for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = w.grid.idx(x0 + dx, y0 + dy); if (isLand(terrain[i])) return i; }
  };
  const nid = w.addNation({ name: "T" });
  const lines = [`region graph built in ${Math.round(buildMs)} ms, ${w.pathGraph().regions} regions`];
  for (const [name, a, b] of [["Lisbon to Moscow", plot(38.7, -9.1), plot(55.75, 37.6)], ["Paris to Beijing", plot(48.86, 2.35), plot(39.9, 116.4)], ["Cape Town to Cairo", plot(-33.9, 18.4), plot(30.0, 31.2)]]) {
    w.owner[a] = nid;
    w.stacks.set(1, { id: 1, owner: nid, pos: a, troops: 100, path: [], progress: 0, order: "hold" });
    const t = performance.now();
    assert.ok(w.orderMove(1, b), name);
    const orderMs = performance.now() - t;
    const { full, worst } = walk(w, 1);
    assert.equal(full.at(-1), b);
    const cost = (p, q) => w.moveCost(p, q);
    cost.minStep = 0.9;
    const best = findPath(w.grid, a, b, cost, 5_000_000);
    const pathCost = p => p.slice(1).reduce((s, q, k) => s + w.moveCost(p[k], q), 0);
    const ratio = pathCost(full) / pathCost(best);
    lines.push(`${name}: ${full.length} plots, order ${orderMs.toFixed(1)} ms, worst extension ${worst.toFixed(1)} ms, cost ${ratio.toFixed(3)} of the best path`);
    assert.ok(orderMs < 50 && worst < 50);
    assert.ok(ratio < 1.2);
    w.owner[a] = 0;
  }
  console.log(lines.join("\n"));
});
