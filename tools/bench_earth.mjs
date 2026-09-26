import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CROPS, cropRect, cropLayer } from "../src/shared/maps.js";
import { scaledRules, defaultBots } from "../src/worldconfig.js";
import { parseArgs } from "node:util";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { installBuildings, addBuilding, footprint, saveLayers, ZONES, WOOD_FULL } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources } from "../src/sim/resources.js";
import { installResearch, orderResearch } from "../src/sim/research.js";
import { installMachines, giveMachine, orderUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { decodeDeposits, cropDeposits } from "../src/shared/deposits.js";
import { makeRng } from "../src/shared/rng.js";
import { isLand } from "../src/shared/terrain.js";
import { encodeRuns, countRuns } from "../src/shared/codec.js";
import { MSG, partFrames } from "../src/shared/protocol.js";
import { StateFeed, BuildingFeed, publicEvents } from "../src/game.js";
import { planCatchUp, runCatchUp } from "../src/sim/offline.js";
import allRules from "../data/rules.json" with { type: "json" };
import { encodeRows } from "../src/shared/buildings.js";

const { values: a } = parseArgs({ options: {
  bots: { type: "string", default: "400" },
  players: { type: "string", default: "8" },
  ticks: { type: "string", default: "2400" },
  budget: { type: "string", default: "50" },
  buildings: { type: "string", default: "2000" },
  map: { type: "string", default: "public/map" },
  crop: { type: "string" },
  seed: { type: "string", default: "1" },
  catchup: { type: "string", default: "12" },
}});

const DT = 0.25, SAVE_EVERY = 30;
const settledMB = () => { globalThis.gc?.(); globalThis.gc?.(); return isolateMB(); };
const isolateMB = () => { const m = process.memoryUsage(); return Math.round((m.heapUsed + m.arrayBuffers) / 1e6); };
const bareRss = Math.round(process.memoryUsage().rss / 1e6);
let peakIsolate = 0;
const src = JSON.parse(readFileSync(`${a.map}/meta.json`, "utf8"));
const raw = existsSync(`${a.map}/terrain.bin`) ? readFileSync(`${a.map}/terrain.bin`) : gunzipSync(readFileSync(`${a.map}/terrain.bin.gz`));
const scale = src.w / 3600, rules = scaledRules(scale);
const rect = a.crop ? cropRect(src, CROPS[a.crop]) : null;
const meta = rect ? { w: rect.w, h: rect.h } : src;
const terrain = rect ? cropLayer(new Uint8Array(raw), src.w, rect) : new Uint8Array(raw);
const w = new World({ w: meta.w, h: meta.h, terrain }, rules.territory);
const rng = makeRng(Number(a.seed));
installCombat(w, rules.combat);
installTroops(w);
if (a.bots === "auto") { let land = 0; for (const v of terrain) if (isLand(v)) land++; a.bots = String(defaultBots(land, scale)); }
console.log(`map ${a.map}${a.crop ? ` crop ${a.crop}` : ""}: ${meta.w} by ${meta.h}, scale ${scale}, ${a.bots} bots`);

let t = performance.now();
const bots = spawnBots(w, Number(a.bots), rng);
installBots(w, rng);
const players = [];
for (let k = 0; k < Number(a.players); k++) {
  const id = w.addNation({ name: `P${k + 1}` });
  for (let tries = 0; tries < 4000 && !w.nations.get(id).spawned; tries++) w.spawn(id, rng.int(0, meta.w - 1), rng.int(0, meta.h - 1));
  if (w.nations.get(id).spawned) players.push(id);
}
const bld = installBuildings(w);
installConstruction(w);
installEconomy(w);
const perPlayer = Number(a.buildings);
const pick = t => (t % 20 === 3 ? "crop_wheat" : t % 20 === 13 ? "woodcutter_camp" : t % 10 < 7 ? "hut_grass" : t % 10 < 9 ? "market_stall" : "chieftain_hut");
const allDeposits = decodeDeposits(gunzipSync(readFileSync(`${a.map}/deposits.bin.gz`)));
const deposits = rect ? cropDeposits(allDeposits, src.w, rect) : allDeposits;
let placed = 0, woodCut = 0;
for (const id of players) {
  const n = w.nations.get(id);
  const want = Math.ceil(perPlayer * 1.8), seen = new Set(), todo = [];
  for (let seed = n.capital, tries = 0; n.plots < want && tries < 1000; tries++, seed = rng.int(0, w.grid.size - 1)) {
    if (seen.has(seed) || !isLand(terrain[seed]) || (w.owner[seed] !== 0 && w.owner[seed] !== id)) continue;
    seen.add(seed);
    for (let k = todo.push(seed) - 1; k < todo.length && n.plots < want; k++) {
      const c = todo[k];
      if (w.owner[c] === 0) w.claim(c, id);
      for (const nb of w.grid.neighbours4(c)) if (!seen.has(nb) && isLand(terrain[nb]) && (w.owner[nb] === 0 || w.owner[nb] === id)) { seen.add(nb); todo.push(nb); }
    }
  }
  let made = 0, turn = 0;
  for (const c of todo) {
    if (made >= perPlayer) break;
    if (w.owner[c] !== id) continue;
    bld.zone[c] = ZONES.res;
    if (bld.wood[c] && woodCut < 2000) { bld.wood[c] = Math.floor(WOOD_FULL * 0.4); woodCut++; }
    if (bld.at.has(c)) continue;
    let type = pick(turn), plots = footprint(w, c, bld.table[type].fp);
    if (!plots || plots.some(i => w.owner[i] !== id || bld.at.has(i))) { type = "hut_grass"; plots = [c]; }
    addBuilding(w, { type, owner: id, anchor: c, plots, state: "active", progress: 1, residents: bld.table[type].housing ? 4.5 : 0 });
    made++; turn++;
  }
  placed += made;
}
bld.changed.add("zone");
if (!process.env.NOCIV) installCivilians(w, makeRng(Number(a.seed) + 7));
installResources(w, deposits, { rng: makeRng(Number(a.seed) + 9) });
installResearch(w, { speed: 20 });
for (const id of players) for (const node of ["palisades", "farming", "chieftains", "age_medieval", "carpentry", "masonry"]) orderResearch(w, id, node);
installMachines(w, { scale });
for (const id of players) {
  for (let k = 0; k < 6; k++) giveMachine(w, id, "catapult");
  for (let k = 0; k < 3; k++) giveMachine(w, id, "cog");
}
let forts = 0;
for (const id of players) {
  const want = [["star_fort", 3], ["tower_stone", 20], ["bank", 5], ["courthouse", 5]];
  for (let k = 0; k < w.grid.size && want.some(([, n]) => n > 0); k += 97) {
    const pick = want.find(([, n]) => n > 0), def = bld.table[pick[0]];
    const plots = footprint(w, k, def.fp);
    if (!plots || plots.some(i => w.owner[i] !== id || bld.at.has(i))) continue;
    addBuilding(w, { type: pick[0], owner: id, anchor: k, plots, state: "active", progress: 1 });
    pick[1]--;
    forts++;
  }
}
installEffects(w);
const fortProbe = (() => { const t0 = performance.now(); let s = 0; for (let k = 0; k < 200000; k++) s += w.fortAt(players[k % players.length], (k * 7919) % w.grid.size); return { lookups: 200000, ms: +(performance.now() - t0).toFixed(1), sum: Math.round(s) }; })();
let mines = 0;
for (const id of players) {
  let here = 0;
  for (let k = 0; k < deposits.plots.length && here < 50; k++) {
    const i = deposits.plots[k];
    if (w.owner[i] !== id || bld.at.has(i)) continue;
    addBuilding(w, { type: "mine_pit", owner: id, anchor: i, plots: [i], state: "active", progress: 1 });
    here++;
  }
  mines += here;
}
const feed0 = () => { for (const id of players) { const n = w.nations.get(id); if (!n.stock) continue; n.stock.food = 1e6; n.stock.wood = 1e6; } };
feed0();
if (woodCut) bld.changed.add("wood");
const ls0 = performance.now();
const layers = saveLayers(w, true);
const layerSaveMs = performance.now() - ls0;
const ROW = 1_000_000, rowsOf = b => Math.max(1, Math.ceil(b.length / ROW));
w.pathGraph();
w.takeDirty();
w.events.length = 0;
const setup = performance.now() - t;
for (const n of w.nations.values()) n.troops = w.maxTroops(n);

const moves = [], sails = [];
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
    for (const u of w.units.list.values()) {
      if (u.owner !== id || u.wreck) continue;
      if (UNIT_TYPES[u.type].domain === "land") {
        if (u.follow === null && mine.length) u.follow = mine[u.id % mine.length].id;
        continue;
      }
      if (u.path.length || u.route) continue;
      for (let tries = 0; tries < 50; tries++) {
        const x = w.grid.x(u.at) + rng.int(-300, 300), y = w.grid.y(u.at) + rng.int(-150, 150);
        if (!w.grid.inside(x, y) || isLand(terrain[w.grid.idx(x, y)])) continue;
        const m0 = performance.now(), err = orderUnit(w, u.id, w.grid.idx(x, y));
        sails.push({ ms: performance.now() - m0, ok: !err });
        break;
      }
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

const econTimes = [], plainTimes = [], times = [], saveTimes = [], stateSizes = [], eventSizes = [];
const feed = new StateFeed(0.01, 5);
feed.delta(w);
let maxEvents = 0, maxDiffBytes = 0, blocked = 0;
for (let i = 0; i < Number(a.ticks); i++) {
  if (i % 20 === 0) { playerOrders(); feed0(); }
  const econDue = !!w.civ && w.civ.clock + DT >= w.civ.rules.econEvery;
  const s = performance.now();
  w.tick(DT);
  const changes = w.takeDirty();
  if (changes.length) {
    const flat = new Uint32Array(changes.length * 2);
    changes.forEach(([p, o], k) => { flat[k * 2] = p; flat[k * 2 + 1] = o; });
    maxDiffBytes = Math.max(maxDiffBytes, flat.byteLength + 4);
  }
  if (i % 4 === 0) {
    const d = feed.delta(w);
    stateSizes.push(d ? Buffer.byteLength(JSON.stringify({ v: 2, t: "state", time: Math.floor(w.time), ...d })) : 0);
  }
  const shown = publicEvents(w, w.events);
  eventSizes.push(shown.length ? Buffer.byteLength(JSON.stringify({ v: 2, t: "events", events: shown })) : 0);
  maxEvents = Math.max(maxEvents, w.events.length);
  blocked += w.events.filter(e => e.type === "path_blocked").length;
  w.events.length = 0;
  if (Math.round(w.time / DT) % (SAVE_EVERY / DT) === 0) {
    const s2 = performance.now();
    encodeRuns(w.owner);
    saveTimes.push(performance.now() - s2);
  }
  times.push(performance.now() - s);
  (econDue ? econTimes : plainTimes).push(times.at(-1));
  if (i % 40 === 0) peakIsolate = Math.max(peakIsolate, isolateMB());
}

const catchUp = (() => {
  const hours = Number(a.catchup), before = players.map(id => ({ money: w.nations.get(id).money, pop: w.nations.get(id).pop, known: w.nations.get(id).research.known.length }));
  const job = planCatchUp(hours * 3600, allRules.offline), steps = job.steps, step = job.step;
  let worstStep = 0, k = 0;
  const t0 = performance.now();
  runCatchUp(job, dt => {
    if (k++ % Math.max(1, Math.round(1800 / step)) === 0) feed0();
    const s0 = performance.now();
    w.catchUp(dt);
    worstStep = Math.max(worstStep, performance.now() - s0);
  }, Infinity);
  w.events.length = 0;
  w.takeDirty();
  const after = players.map(id => w.nations.get(id));
  return { hours, steps, step, ms: Math.round(performance.now() - t0), worstStepMs: +worstStep.toFixed(1), moneyGained: Math.round(after.reduce((t, n, k) => t + n.money - before[k].money, 0) / after.length), popBefore: Math.round(before.reduce((t, b) => t + b.pop, 0)), popAfter: Math.round(after.reduce((t, n) => t + n.pop, 0)), researched: after.reduce((t, n, k) => t + n.research.known.length - before[k].known, 0) };
})();

let borderOk = true;
for (let i = 0; i < w.owner.length && borderOk; i++) {
  const o = w.owner[i];
  const want = o !== 0 && w.isBorder(i);
  if (want !== (o !== 0 && w.borderOf(o).has(i))) borderOk = false;
}
let borderPlots = 0;
for (const set of w.border.values()) borderPlots += set.size;

const settled = settledMB();
const sorted = [...times].sort((x, y) => x - y);
const worst = sorted.at(-1), p50 = sorted[sorted.length >> 1], p99 = sorted[Math.floor(sorted.length * 0.99)];
const runs = encodeRuns(w.owner);
const nations = [...w.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot }));
const helloBytes = Buffer.byteLength(JSON.stringify({ t: "hello", v: 1, you: 1, w: meta.w, h: meta.h, map: { kind: "earth", baseHash: "00000000", srcW: meta.w, srcH: meta.h }, hashes: { terrain: "00000000", owner: "00000000" }, frames: { terrain: 1, owner: 1 }, caughtUp: 0, nations, chat: [] }));
const ownerFrameBytes = partFrames(MSG.OWNER, runs).reduce((s, f) => s + f.length, 0);
const buildingFrameBytes = partFrames(MSG.BUILDINGS, encodeRows(new BuildingFeed().rows(w))).reduce((s, f) => s + f.length, 0);
const defsBytes = Buffer.byteLength(JSON.stringify(Object.values(bld.table).map(({ fp, cat, ...d }) => d)));
const okMoves = moves.filter(m => m.ok);
let owned = 0;
for (const v of w.owner) if (v) owned++;

const report = {
  map: `${meta.w}x${meta.h}`,
  bots: bots.length,
  players: players.length,
  gameSeconds: Math.round(w.time),
  setupMs: Math.round(setup),
  tickMs: { p50: +p50.toFixed(1), p99: +p99.toFixed(1), worst: +worst.toFixed(1), worstWithEconomy: +Math.max(0, ...econTimes).toFixed(1), worstWithout: +Math.max(0, ...plainTimes).toFixed(1), medianWithEconomy: +([...econTimes].sort((x, y) => x - y)[econTimes.length >> 1] ?? 0).toFixed(1) },
  saveEncodeMs: { worst: +Math.max(...saveTimes).toFixed(1), count: saveTimes.length },
  moveOrders: { issued: moves.length, ok: okMoves.length, noLandRoute: moves.filter(m => m.noRoute).length, plannerFailed: moves.filter(m => !m.ok && !m.noRoute).length, worstMs: +Math.max(0, ...moves.map(m => m.ms)).toFixed(1), longestPlots: Math.round(Math.max(0, ...okMoves.map(m => m.dist))), blockedOnTheWay: blocked },
  stacks: w.stacks.size,
  catchUp,
  effects: { buildings: forts, fortLookupMs: fortProbe.ms, lookups: fortProbe.lookups },
  machines: { count: w.units.list.size, following: [...w.units.list.values()].filter(u => u.follow !== null).length, sailOrders: sails.length, sailOk: sails.filter(s => s.ok).length, sailWorstMs: +Math.max(0, ...sails.map(s => s.ms)).toFixed(1) },
  ownedPlots: owned,
  ownerRuns: countRuns(w.owner),
  borderPlots,
  borderSetsMatchFullScan: borderOk,
  bytes: {
    join: helloBytes + defsBytes + ownerFrameBytes + buildingFrameBytes, joinHello: helloBytes + defsBytes, joinOwner: ownerFrameBytes, joinBuildings: buildingFrameBytes, largestDiff: maxDiffBytes,
    stateMessage: { median: [...stateSizes].sort((x, y) => x - y)[stateSizes.length >> 1], worst: Math.max(...stateSizes) },
    perPlayerPerSecond: { state: Math.round(stateSizes.reduce((x, y) => x + y, 0) / w.time), events: Math.round(eventSizes.reduce((x, y) => x + y, 0) / w.time) },
  },
  maxEventsPerTick: maxEvents,
  buildings: {
    placed, perPlayer, mines, researched: players.map(id => w.nations.get(id).research.known.length), eras: players.map(id => w.nations.get(id).era).join(""), producers: [...bld.list.values()].filter(b => bld.table[b.type].producer).length, deposits: deposits.plots.length, terrainEdits: w.res.edits.size, civilianBuildings: [...bld.list.values()].filter(b => b.civilian).length, population: Math.round(players.reduce((t, id) => t + (w.nations.get(id).pop ?? 0), 0)), econTicks: Math.floor(w.time / 5), plotIndex: bld.at.size, woodPlotsCut: woodCut, 
    saveBytes: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length])),
    saveRows: { owner: rowsOf(runs), ...Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, rowsOf(v)])), state: 1 },
    encodeMs: +layerSaveMs.toFixed(1),
    ownersMatch: [...bld.list.values()].every(b => b.owner === w.owner[b.anchor] || w.owner[b.anchor] === 0),
  },
  budgetMs: Number(a.budget),
  memoryMB: { settledHeapPlusBuffers: settled, peakHeapPlusBuffers: peakIsolate, endHeapPlusBuffers: isolateMB(), rss: Math.round(process.memoryUsage().rss / 1e6), nodeAloneRss: bareRss },
};
console.log(JSON.stringify(report, null, 2));
if (!borderOk) { console.error("FAIL: border sets do not match a full scan"); process.exit(1); }
if (worst > Number(a.budget)) {
  console.error(`FAIL: worst tick ${worst.toFixed(1)} ms is over the ${a.budget} ms budget`);
  process.exit(1);
}
console.log("PASS");
