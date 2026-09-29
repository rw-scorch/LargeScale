import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CROPS, cropRect, cropLayer } from "../src/shared/maps.js";
import { scaledRules, defaultBots } from "../src/worldconfig.js";
import { parseArgs } from "node:util";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { installBuildings, addBuilding, removeBuilding, footprint, saveLayers, ZONES, WOOD_FULL } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources } from "../src/sim/resources.js";
import { installResearch, orderResearch } from "../src/sim/research.js";
import { installMachines, giveMachine, orderUnit, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installEffects } from "../src/sim/effects.js";
import { installGuard, guardTick } from "../src/sim/guard.js";
import { installOvertime } from "../src/sim/overtime.js";
import { installRoads, setRoad, ROADS } from "../src/sim/logistics.js";
import { installBoats } from "../src/sim/boats.js";
import { installTrade, dockOf, railPath } from "../src/sim/trade.js";
import { waterOk } from "../src/sim/units.js";
import { installPower, powerTick } from "../src/sim/power.js";
import { decodeDeposits, cropDeposits } from "../src/shared/deposits.js";
import { makeRng } from "../src/shared/rng.js";
import { isLand } from "../src/shared/terrain.js";
import { encodeRuns, countRuns } from "../src/shared/codec.js";
import { MSG, partFrames } from "../src/shared/protocol.js";
import { StateFeed, BuildingFeed, publicEvents, runOrder } from "../src/game.js";
import { installPlanner, planView, PLAN_RULES } from "../src/sim/planner.js";
import { proposePlan } from "../src/shared/planner.js";
import { planCatchUp, runCatchUp } from "../src/sim/offline.js";
import allRules from "../data/rules.json" with { type: "json" };
import { encodeRows } from "../src/shared/buildings.js";
import { installSoldiers, fieldOf } from "../src/sim/soldiers.js";
import { installAir, orderPlane, planeOf } from "../src/sim/air.js";

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
  roads: { type: "string", default: "1500" },
  rail: { type: "string", default: "200" },
  tanks: { type: "string", default: "4" },
  plan: { type: "string", default: "1" },
  power: { type: "string", default: "1" },
  ports: { type: "string", default: "4" },
  companies: { type: "string", default: "100" },
  planes: { type: "string", default: "100" },
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
const pick = t => (t % 20 === 3 ? "crop_wheat" : t % 20 === 13 ? "pasture_sheep" : t % 10 < 7 ? "hut_grass" : t % 10 < 9 ? "market_stall" : "chieftain_hut");
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
  for (let k = 0; k < Number(a.tanks); k++) giveMachine(w, id, "early_tank");
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
const guard = installGuard(w, { scale });
const overtime = installOvertime(w, { every: allRules.overtime.every });
installRoads(w, { scale, rules: allRules.roads });
installBoats(w, { scale });
const soldiers = Number(a.companies) > 0 ? installSoldiers(w) : null;
const air = Number(a.planes) > 0 ? installAir(w) : null;
const airSetup = { fields: 0, planes: 0 };
if (air) for (const id of players) {
  const n = w.nations.get(id), cx = w.grid.x(n.capital), cy = w.grid.y(n.capital);
  let field = null;
  for (let r = 3; r < 40 && !field; r++) for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !w.grid.inside(cx + dx, cy + dy)) continue;
    const at = w.grid.idx(cx + dx, cy + dy), plots = footprint(w, at, bld.table.airfield.fp);
    if (!plots || plots.some(p => w.owner[p] !== id || bld.at.has(p) || !isLand(terrain[p]))) continue;
    field = addBuilding(w, { type: "airfield", owner: id, anchor: at, plots, state: "active", progress: 1 });
  }
  if (!field) continue;
  airSetup.fields++;
  for (let k = 0; k < Number(a.planes); k++) { const u = spawnUnit(w, id, k % 2 ? "early_bomber" : "biplane", field.anchor); if (u) { planeOf(w, u); airSetup.planes++; } }
}
const airOrders = { issued: 0, ok: 0 };
let fieldPeak = { soldiers: 0, companies: 0 };
const trade = installTrade(w, { scale, seed: Number(a.seed) + 11 });
let seaSetup = null;
if (Number(a.ports) > 0) {
  const coast = new Map(players.map(id => [id, []]));
  for (let i = 0; i < w.grid.size; i++) {
    const list = coast.get(w.owner[i]);
    if (!list || !isLand(terrain[i]) || bld.at.has(i)) continue;
    if (w.grid.neighbours4(i).some(j => waterOk(terrain[j]))) list.push(i);
  }
  let placed = 0;
  for (const [id, list] of coast) for (let k = 0; k < Number(a.ports) && list.length; k++) {
    const i = list[Math.floor(((k + 0.5) * list.length) / Number(a.ports))];
    if (bld.at.has(i)) continue;
    addBuilding(w, { type: "jetty", owner: id, anchor: i, plots: [i], state: "active", progress: 1 });
    placed++;
  }
  const t0 = performance.now();
  const docks = [...bld.list.values()].filter(b => b.type === "jetty" && dockOf(w, b)).length;
  seaSetup = { ports: placed, docks, docksMs: +(performance.now() - t0).toFixed(1) };
}
let railPlots = 0, stations = 0;
for (const id of players) {
  const n = w.nations.get(id), cy = w.grid.y(n.capital);
  for (const dir of [1, -1]) {
    let end = null;
    for (let x = w.grid.x(n.capital) + (dir > 0 ? 0 : -1), laid = 0; laid < Number(a.rail) / 2 && x > 0 && x < w.grid.w - 1; x += dir) {
      const i = w.grid.idx(x, cy);
      if (w.owner[i] !== id || !isLand(terrain[i])) break;
      if (bld.at.has(i)) removeBuilding(w, bld.at.get(i));
      setRoad(w, i, ROADS.rail);
      laid++;
      railPlots++;
      end = i;
    }
    if (end === null || !Number(a.rail)) continue;
    for (const [dx, dy] of [[0, 1], [-1, 1], [-2, 1], [0, -2], [-1, -2], [-2, -2]]) {
      const x = w.grid.x(end) + dx, y = w.grid.y(end) + dy;
      if (!w.grid.inside(x, y)) continue;
      const at = w.grid.idx(x, y), plots = footprint(w, at, bld.table.station_large.fp);
      if (!plots || plots.some(p => w.owner[p] !== id || w.log.road[p] || !isLand(terrain[p]))) continue;
      for (const p of plots) if (bld.at.has(p)) removeBuilding(w, bld.at.get(p));
      addBuilding(w, { type: "station_large", owner: id, anchor: at, plots, state: "active", progress: 1 });
      stations++;
      break;
    }
  }
}
const power = a.power !== "0" ? installPower(w, { scale }) : null;
if (power) for (const id of players) {
  const n = w.nations.get(id), cx = w.grid.x(n.capital), cy = w.grid.y(n.capital);
  const want = [["coal_plant", 2], ["vehicle_factory", 6], ["power_pole", 40]];
  for (let r = 4; r < 80 && want.some(([, k]) => k > 0); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !w.grid.inside(cx + dx, cy + dy)) continue;
    const pick = want.find(([, k]) => k > 0);
    if (!pick) break;
    if (pick[0] === "power_pole" && (dx % 3 || dy % 3)) continue;
    const i = w.grid.idx(cx + dx, cy + dy), plots = footprint(w, i, bld.table[pick[0]].fp);
    if (!plots || plots.some(p => w.owner[p] !== id || bld.at.has(p) || w.log.road[p] || !isLand(terrain[p]))) continue;
    addBuilding(w, { type: pick[0], owner: id, anchor: i, plots, state: "active", progress: 1 });
    pick[1]--;
  }
}
let roadPlots = 0;
for (const id of players) {
  const n = w.nations.get(id), cx = w.grid.x(n.capital), cy = w.grid.y(n.capital);
  let laid = 0;
  for (let r = 1; r < 400 && laid < Number(a.roads); r++) for (let dy = -r; dy <= r && laid < Number(a.roads); dy++) for (let dx = -r; dx <= r && laid < Number(a.roads); dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx % 6 && dy % 6)) continue;
    const x = cx + dx, y = cy + dy;
    if (!w.grid.inside(x, y)) continue;
    const i = w.grid.idx(x, y);
    if (w.owner[i] !== id || !isLand(terrain[i]) || bld.at.has(i) || w.log.road[i]) continue;
    setRoad(w, i, ROADS.cobble);
    laid++;
  }
  roadPlots += laid;
}
for (const id of players) w.nations.get(id).guard = true;
const guardProbe = () => { const t0 = performance.now(); guardTick(w, guard.rules); return performance.now() - t0; };
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
let planSetup = null, planDone = 0, planDropped = 0;
if (a.plan !== "0") {
  installPlanner(w, { run: (nid, m) => runOrder(w, nid, m), scale });
  planSetup = { proposeMs: [], projects: 0, pieces: 0, refused: 0, eras: "" };
}
function queuePlans() {
  if (!planSetup) return;
  planSetup.eras = players.map(id => w.nations.get(id).era).join("");
  for (const id of players) {
    const t0 = performance.now(), list = proposePlan(planView(w, id), { ...PLAN_RULES, scale });
    planSetup.proposeMs.push(+(performance.now() - t0).toFixed(1));
    for (const p of list) {
      const r = runOrder(w, id, { t: "plan", op: "add", project: { key: p.key, kind: p.kind, name: p.title, pieces: p.pieces } });
      if (r.ok) { planSetup.projects++; planSetup.pieces += p.pieces.length; } else planSetup.refused++;
    }
  }
}
const feed0 = () => { for (const id of players) { const n = w.nations.get(id); if (n.money !== undefined && n.money < 1e6) n.money = 1e7; } };
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
    if (soldiers) {
      const want = Number(a.companies), each = Math.floor((soldiers.rules.fieldCap * soldiers.rules.troopsEach) / want);
      for (let k = mine.length; k < want; k++) {
        const s = w.createStack(id, n.capital, Math.min(each, n.troops * 0.5));
        if (!s) break;
        mine.push(s);
      }
    } else if (mine.length < 2) {
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
    if (air) for (const u of w.units.list.values()) {
      if (u.owner !== id || !u.air || !u.air.landed || u.air.rearm > 0 || u.air.mission) continue;
      const bx = u.air.x, by = u.air.y, rad = UNIT_TYPES[u.type].radius * scale * 0.8;
      for (let tries = 0; tries < 20; tries++) {
        const x = Math.floor(bx + (rng.next() * 2 - 1) * rad), y = Math.floor(by + (rng.next() * 2 - 1) * rad);
        if (!w.grid.inside(x, y)) continue;
        const at = w.grid.idx(x, y);
        if (UNIT_TYPES[u.type].bomb && !(w.owner[at] && w.owner[at] !== id)) continue;
        airOrders.issued++;
        if (orderPlane(w, u, UNIT_TYPES[u.type].bomb ? "bomb" : "patrol", at).ok) airOrders.ok++;
        break;
      }
    }
    for (const s of mine) {
      if (s.order !== "hold" || s.path.length) continue;
      if (soldiers && s.id % 2) { w.orderAdvance(s.id, null, true); continue; }
      const to = farLand(s.pos);
      if (to < 0) continue;
      const m0 = performance.now();
      const ok = w.orderMove(s.id, to);
      moves.push({ ms: performance.now() - m0, ok, dist: w.grid.dist(s.pos, to), noRoute: !ok && !w.route(s.pos, to) });
    }
  }
}

const econTimes = [], plainTimes = [], times = [], saveTimes = [], stateSizes = [], eventSizes = [];
const part = { seek: 0, seeks: 0, extend: 0, extends: 0 }, total = { seek: 0, seeks: 0, extend: 0, extends: 0 };
let worstParts = null;
for (const [name, key] of [["seek", "seek"], ["extendPath", "extend"]]) {
  const f = w[name].bind(w);
  w[name] = (...args) => { const t0 = performance.now(); try { return f(...args); } finally { const d = performance.now() - t0; part[key] += d; part[key + "s"]++; total[key] += d; total[key + "s"]++; } };
}
const feed = new StateFeed(0.01, 5);
feed.delta(w);
let maxEvents = 0, maxDiffBytes = 0, blocked = 0, airBombs = 0, airDowns = 0;
for (let i = 0; i < Number(a.ticks); i++) {
  if (i % 800 === 400) queuePlans();
  if (i % 20 === 0) {
    playerOrders();
    feed0();
    if (soldiers) for (const id of players) { const f = fieldOf(w, id); fieldPeak = { soldiers: Math.max(fieldPeak.soldiers, f.soldiers), companies: Math.max(fieldPeak.companies, f.companies) }; }
  }
  const econDue = !!w.civ && w.civ.clock + DT >= w.civ.rules.econEvery;
  part.seek = part.extend = part.seeks = part.extends = 0;
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
  for (const e of w.events) { if (e.type === "bombed") airBombs++; if (e.type === "plane_down") airDowns++; if (e.type === "plan_done") planDone += e.done; if (e.type === "plan_dropped") planDropped++; }
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
  if (!worstParts || times.at(-1) > worstParts.ms) worstParts = { ms: +times.at(-1).toFixed(1), seekMs: +part.seek.toFixed(1), seeks: part.seeks, extendMs: +part.extend.toFixed(1), extends: part.extends };
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

const shrink = (() => {
  const held = () => [...w.nations.values()].reduce((t, n) => t + (n.alive ? n.plots : 0), 0), before = held();
  overtime.on = true;
  overtime.clock = overtime.every - DT;
  let worst = 0, ticks = 0;
  do { const t0 = performance.now(); w.tick(DT); worst = Math.max(worst, performance.now() - t0); ticks++; } while (overtime.queue.length && ticks < 400);
  overtime.on = false;
  w.events.length = 0;
  w.takeDirty();
  return { plotsTaken: before - held(), ticks, worstTickMs: +worst.toFixed(1) };
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
  guard: { tickMs: +guardProbe().toFixed(1), formed: [...w.stacks.values()].filter(s => s.guard?.formed).length, sent: [...w.stacks.values()].filter(s => s.guard?.threat !== undefined).length },
  catchUp,
  overtime: shrink,
  roads: { plots: roadPlots, minStep: +w.pathMinStep().toFixed(3) },
  worstTickParts: worstParts,
  pathTotals: { seekMs: Math.round(total.seek), seeks: total.seeks, extendMs: Math.round(total.extend), extends: total.extends, perExtendMs: +(total.extend / Math.max(1, total.extends)).toFixed(2) },
  air: air && { ...airSetup, orders: airOrders, flyingNow: [...w.units.list.values()].filter(u => u.air && !u.air.landed).length, planesNow: [...w.units.list.values()].filter(u => u.air).length, bombRuns: airBombs, shotDown: airDowns },
  soldiers: soldiers && { perPlayerPeak: fieldPeak, cap: soldiers.rules.fieldCap, stacksNow: w.stacks.size, playerStacksNow: [...w.stacks.values()].filter(s => w.nations.get(s.owner)?.human).length, battlesNow: [...w.stacks.values()].filter(s => s.engaged).length },
  rail: { plots: railPlots, stations, trainsNow: trade.trains.size, railSearch: (() => { const list = [...bld.list.values()].filter(b => b.type === "station_large"), t0 = performance.now(); trade.paths.clear(); let found = 0; for (const b of list) for (const c of list) if (b !== c && b.owner === c.owner && railPath(w, b.owner, b, c)) found++; return { pairs: found, ms: +(performance.now() - t0).toFixed(1) }; })() },
  power: power && (() => {
    const t0 = performance.now();
    powerTick(w, 5);
    const ms = performance.now() - t0, views = [...power.views.values()];
    return { passMs: +ms.toFixed(1), grids: views.reduce((t, v) => t + v.grids.length, 0), plants: [...w.bld.list.values()].filter(b => b.type === "coal_plant").length, poles: [...w.bld.list.values()].filter(b => b.type === "power_pole").length, users: views.reduce((t, v) => t + Object.keys(v.users).length, 0), powered: views.reduce((t, v) => t + Object.values(v.users).filter(k => k >= 0).length, 0) };
  })(),
  tanks: [...w.units.list.values()].filter(u => u.type === "early_tank").length,
  planner: planSetup && { ...planSetup, piecesLeft: players.reduce((t, id) => t + (w.nations.get(id).plan ?? []).reduce((s, p) => s + p.pieces.length, 0), 0), done: players.reduce((t, id) => t + (w.nations.get(id).plan ?? []).reduce((s, p) => s + p.done, 0), 0) + planDone, dropped: planDropped },
  trade: seaSetup && { ...seaSetup, shipsAtSea: [...w.units.list.values()].filter(u => u.trade && !u.wreck).length, goldEarned: Math.round(players.reduce((t, id) => t + (w.nations.get(id).tradeGold ?? 0), 0)) },
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
if (shrink.worstTickMs > Number(a.budget)) { console.error(`FAIL: an overtime shrink took ${shrink.worstTickMs} ms in one tick`); process.exit(1); }
if (worst > Number(a.budget)) {
  console.error(`FAIL: worst tick ${worst.toFixed(1)} ms is over the ${a.budget} ms budget`);
  process.exit(1);
}
console.log("PASS");
