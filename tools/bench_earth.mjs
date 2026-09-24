import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { makeRng } from "../src/shared/rng.js";
import { isLand } from "../src/shared/terrain.js";
import { encodeRuns, countRuns } from "../src/shared/codec.js";
import { MSG, partFrames } from "../src/shared/protocol.js";

const { values: a } = parseArgs({ options: {
  bots: { type: "string", default: "400" },
  players: { type: "string", default: "8" },
  ticks: { type: "string", default: "2400" },
  budget: { type: "string", default: "50" },
  map: { type: "string", default: "public/map" },
  seed: { type: "string", default: "1" },
}});

const DT = 0.25, SAVE_EVERY = 30;
const isolateMB = () => { const m = process.memoryUsage(); return Math.round((m.heapUsed + m.arrayBuffers) / 1e6); };
const bareRss = Math.round(process.memoryUsage().rss / 1e6);
let peakIsolate = 0;
const meta = JSON.parse(readFileSync(`${a.map}/meta.json`, "utf8"));
const terrain = new Uint8Array(readFileSync(`${a.map}/terrain.bin`));
const w = new World({ w: meta.w, h: meta.h, terrain });
const rng = makeRng(Number(a.seed));
installCombat(w);

let t = performance.now();
const bots = spawnBots(w, Number(a.bots), rng);
installBots(w, rng);
const players = [];
for (let k = 0; k < Number(a.players); k++) {
  const id = w.addNation({ name: `P${k + 1}` });
  for (let tries = 0; tries < 4000 && !w.nations.get(id).spawned; tries++) w.spawn(id, rng.int(0, meta.w - 1), rng.int(0, meta.h - 1));
  if (w.nations.get(id).spawned) players.push(id);
}
w.pathGraph();
w.takeDirty();
w.events.length = 0;
const setup = performance.now() - t;
for (const n of w.nations.values()) n.troops = w.maxTroops(n);

const moves = [];
function farLand(from) {
  for (let tries = 0; tries < 200; tries++) {
    const x = w.grid.x(from) + rng.int(-600, 600), y = w.grid.y(from) + rng.int(-300, 300);
    if (!w.grid.inside(x, y)) continue;
    const i = w.grid.idx(x, y);
    if (isLand(terrain[i]) && w.grid.dist(from, i) > 150) return i;
  }
  return -1;
}
function playerOrders() {
  for (const id of players) {
    const n = w.nations.get(id);
    if (!n.alive) continue;
    const mine = [...w.stacks.values()].filter(s => s.owner === id);
    if (mine.length < 2) {
      const s = w.createStack(id, n.capital, n.troops * 0.4);
      if (s && mine.length === 0) w.orderAdvance(s.id);
      else if (s) mine.push(s);
    }
    for (const s of mine) {
      if (s.order !== "hold" || s.path.length) continue;
      const to = farLand(s.pos);
      if (to < 0) continue;
      const m0 = performance.now();
      const ok = w.orderMove(s.id, to);
      moves.push({ ms: performance.now() - m0, ok, dist: w.grid.dist(s.pos, to), noRoute: !ok && !w.route(s.pos, to) });
    }
  }
}

const times = [], saveTimes = [];
let stateBytes = 0, maxEvents = 0, maxDiffBytes = 0, blocked = 0;
for (let i = 0; i < Number(a.ticks); i++) {
  if (i % 20 === 0) playerOrders();
  const s = performance.now();
  w.tick(DT);
  const changes = w.takeDirty();
  if (changes.length) {
    const flat = new Uint32Array(changes.length * 2);
    changes.forEach(([p, o], k) => { flat[k * 2] = p; flat[k * 2 + 1] = o; });
    maxDiffBytes = Math.max(maxDiffBytes, flat.byteLength + 4);
  }
  if (i % 4 === 0) {
    const nations = [...w.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot }));
    const stacks = [...w.stacks.values()].map(x => ({ id: x.id, owner: x.owner, pos: x.pos, troops: Math.floor(x.troops), order: x.order }));
    stateBytes = Math.max(stateBytes, Buffer.byteLength(JSON.stringify({ t: "state", time: Math.floor(w.time), nations, stacks })));
  }
  maxEvents = Math.max(maxEvents, w.events.length);
  blocked += w.events.filter(e => e.type === "path_blocked").length;
  w.events.length = 0;
  if (Math.round(w.time / DT) % (SAVE_EVERY / DT) === 0) {
    const s2 = performance.now();
    encodeRuns(w.owner);
    saveTimes.push(performance.now() - s2);
  }
  times.push(performance.now() - s);
  if (i % 40 === 0) peakIsolate = Math.max(peakIsolate, isolateMB());
}

let borderOk = true;
for (let i = 0; i < w.owner.length && borderOk; i++) {
  const o = w.owner[i];
  const want = o !== 0 && w.isBorder(i);
  if (want !== (o !== 0 && w.borderOf(o).has(i))) borderOk = false;
}
let borderPlots = 0;
for (const set of w.border.values()) borderPlots += set.size;

const sorted = [...times].sort((x, y) => x - y);
const worst = sorted.at(-1), p50 = sorted[sorted.length >> 1], p99 = sorted[Math.floor(sorted.length * 0.99)];
const runs = encodeRuns(w.owner);
const nations = [...w.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot }));
const helloBytes = Buffer.byteLength(JSON.stringify({ t: "hello", v: 1, you: 1, w: meta.w, h: meta.h, map: { kind: "earth", baseHash: "00000000", srcW: meta.w, srcH: meta.h }, hashes: { terrain: "00000000", owner: "00000000" }, frames: { terrain: 1, owner: 1 }, caughtUp: 0, nations, chat: [] }));
const ownerFrameBytes = partFrames(MSG.OWNER, runs).reduce((s, f) => s + f.length, 0);
const okMoves = moves.filter(m => m.ok);
let owned = 0;
for (const v of w.owner) if (v) owned++;

const report = {
  map: `${meta.w}x${meta.h}`,
  bots: bots.length,
  players: players.length,
  gameSeconds: Math.round(w.time),
  setupMs: Math.round(setup),
  tickMs: { p50: +p50.toFixed(1), p99: +p99.toFixed(1), worst: +worst.toFixed(1) },
  saveEncodeMs: { worst: +Math.max(...saveTimes).toFixed(1), count: saveTimes.length },
  moveOrders: { issued: moves.length, ok: okMoves.length, noLandRoute: moves.filter(m => m.noRoute).length, plannerFailed: moves.filter(m => !m.ok && !m.noRoute).length, worstMs: +Math.max(0, ...moves.map(m => m.ms)).toFixed(1), longestPlots: Math.round(Math.max(0, ...okMoves.map(m => m.dist))), blockedOnTheWay: blocked },
  stacks: w.stacks.size,
  ownedPlots: owned,
  ownerRuns: countRuns(w.owner),
  borderPlots,
  borderSetsMatchFullScan: borderOk,
  bytes: { join: helloBytes + ownerFrameBytes, joinHello: helloBytes, joinOwner: ownerFrameBytes, stateMessage: stateBytes, largestDiff: maxDiffBytes },
  maxEventsPerTick: maxEvents,
  budgetMs: Number(a.budget),
  memoryMB: { peakHeapPlusBuffers: peakIsolate, endHeapPlusBuffers: isolateMB(), rss: Math.round(process.memoryUsage().rss / 1e6), nodeAloneRss: bareRss },
};
console.log(JSON.stringify(report, null, 2));
if (!borderOk) { console.error("FAIL: border sets do not match a full scan"); process.exit(1); }
if (worst > Number(a.budget)) {
  console.error(`FAIL: worst tick ${worst.toFixed(1)} ms is over the ${a.budget} ms budget`);
  process.exit(1);
}
console.log("PASS");
