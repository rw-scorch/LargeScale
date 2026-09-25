import { TERRAIN, TID } from "../shared/terrain.js";
import { depositIndex, emptyDeposits } from "../shared/deposits.js";
import { areaAround } from "../shared/buildings.js";
import { installBuildings, addBuilding, footprint, WOOD_FULL } from "./buildings.js";
import { canPlace } from "./construction.js";
import rules from "../../data/rules.json" with { type: "json" };
import depositData from "../../data/deposits.json" with { type: "json" };
import { makeRng } from "../shared/rng.js";

export const DEPOSIT_TABLE = depositData.deposits;
export const DEPOSIT_IDS = DEPOSIT_TABLE.map(d => d.id);
export const DEPOSITS = Object.fromEntries(DEPOSIT_TABLE.map(d => [d.id, d]));
export const RES_RULES = rules.resources;
export const SEASON_YIELD = RES_RULES.seasonYield;
export const FOREST_WOOD = RES_RULES.forestWood;
const LAND_FORMAT = 1;

export function generateDeposits(map, rng, table = DEPOSIT_TABLE) {
  const size = map.w * map.h, type = new Uint8Array(size), amount = new Float64Array(size);
  const byTerrain = TERRAIN.map(t => table.map((d, k) => k).filter(k => table[k].terrains.includes(t.name)));
  for (let i = 0; i < size; i++) {
    if (type[i]) continue;
    for (const k of byTerrain[map.terrain[i]]) {
      const d = table[k];
      if (!rng.chance(d.chance)) continue;
      const n = rng.int(d.vein[0], d.vein[1]);
      let cur = i;
      for (let v = 0; v < n; v++) {
        if (!type[cur] && d.terrains.includes(TERRAIN[map.terrain[cur]].name)) {
          type[cur] = d.code;
          amount[cur] = d.amount === "infinite" ? Infinity : rng.int(d.amount[0], d.amount[1]) / n;
        }
        const x = cur % map.w, y = (cur / map.w) | 0;
        const dir = rng.int(0, 3);
        const nx = Math.min(map.w - 1, Math.max(0, x + [0, 1, 0, -1][dir]));
        const ny = Math.min(map.h - 1, Math.max(0, y + [-1, 0, 1, 0][dir]));
        cur = ny * map.w + nx;
      }
      break;
    }
  }
  const plots = [];
  for (let i = 0; i < size; i++) if (type[i]) plots.push(i);
  return { plots: Uint32Array.from(plots), type: Uint8Array.from(plots, i => type[i]), amount: Float64Array.from(plots, i => amount[i]) };
}

export function installResources(world, deposits = emptyDeposits(), opts = {}) {
  const bld = installBuildings(world);
  const r = { ...RES_RULES, ...opts.rules };
  const res = {
    dep: deposits, wood: bld.wood, rules: r, clock: 0, rng: opts.rng ?? makeRng(1),
    seasonOf: opts.seasonOf ?? (() => "summer"),
    edits: new Map(), mined: new Set(), growing: new Set(), terrainNews: new Set(),
    depositAt: i => depositAt(world, i),
  };
  world.res = res;
  (bld.extra ??= {}).land = () => encodeLand(world);
  if (opts.hook !== false) {
    const every = opts.every ?? rules.civilians.econEvery;
    world.hooks.postTick.push((w, dt) => {
      res.clock += dt;
      while (res.clock >= every) { res.clock -= every; productionTick(w, every); }
    });
  }
  return res;
}

export function depositAt(world, i) {
  const dep = world.res?.dep;
  if (!dep) return null;
  const k = depositIndex(dep, i);
  return k >= 0 && dep.amount[k] > 0 ? DEPOSIT_IDS[dep.type[k] - 1] : null;
}

export function setTerrain(world, i, tid) {
  const res = world.res;
  world.terrain[i] = tid;
  res.edits.set(i, tid);
  res.terrainNews.add(i);
  world.bld.changed.add("land");
}

export function takeTerrainNews(world) {
  const res = world.res;
  if (!res?.terrainNews.size) return null;
  const out = new Uint32Array(res.terrainNews.size * 2);
  let k = 0;
  for (const i of res.terrainNews) { out[k++] = i; out[k++] = world.terrain[i]; }
  res.terrainNews.clear();
  return out;
}

export function canPlaceProducer(world, nid, type, at) {
  return world.bld.table[type]?.producer ? canPlace(world, nid, type, at) : "not a producer";
}

export function addProducer(world, nid, type, at) {
  const why = canPlaceProducer(world, nid, type, at);
  if (why) return { error: why };
  return addBuilding(world, { type, owner: nid, anchor: at, plots: footprint(world, at, world.bld.table[type].fp), state: "active", progress: 1 });
}

function nearestFirst(world, b, radius) {
  const g = world.grid, ax = g.x(b.anchor), ay = g.y(b.anchor);
  return areaAround({ w: g.w, h: g.h }, b.plots, radius).map(i => [(g.x(i) - ax) ** 2 + (g.y(i) - ay) ** 2, i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(v => v[1]);
}

function gather(world, b, rates, k, out) {
  if (world.owner[b.anchor] !== b.owner) return;
  const n = world.nations.get(b.owner);
  if (!out.has(b.owner)) out.set(b.owner, {});
  const o = out.get(b.owner);
  let got = 0;
  for (const [kind, rate] of Object.entries(rates)) {
    const v = rate * k * (1 + (n?.effects?.[`${kind}_rate`] ?? 0));
    o[kind] = (o[kind] ?? 0) + v;
    got += v;
  }
  b.made = (b.made ?? 0) + got;
}

export function produce(world, dt) {
  const res = world.res, bld = world.bld, dep = res.dep, r = res.rules, out = new Map();
  for (const b of bld.list.values()) {
    const def = bld.table[b.type], p = def.producer;
    if (def.gathers && b.state === "active") gather(world, b, def.gathers, dt * (r.speed ?? 1), out);
    if (!p || b.state !== "active" || world.owner[b.anchor] !== b.owner) continue;
    const n = world.nations.get(b.owner);
    const staffed = Math.max(r.minWorkforce, n?.stats?.worked ?? 1);
    let want = p.rate * dt * staffed * (r.speed ?? 1), got = 0, kind = p.out;
    if (p.kind === "deposit") {
      for (const i of nearestFirst(world, b, p.radius ?? 0)) {
        if (want <= 0) break;
        const k = depositIndex(dep, i);
        if (k < 0 || !(dep.amount[k] > 0)) continue;
        const id = DEPOSIT_IDS[dep.type[k] - 1];
        if (!p.deposits.includes(id)) continue;
        kind ??= id;
        if ((p.out ?? id) !== kind) continue;
        const take = Math.min(want, dep.amount[k]);
        if (dep.amount[k] !== Infinity) {
          dep.amount[k] -= take;
          res.mined.add(k);
          bld.changed.add("land");
          if (dep.amount[k] <= 1e-9) { dep.amount[k] = 0; world.emit("deposit_depleted", { nation: b.owner, at: i, kind: id }); }
        }
        want -= take;
        got += take;
      }
    } else if (p.kind === "forest") {
      const unit = FOREST_WOOD / WOOD_FULL;
      b.cut ??= 0;
      for (const i of nearestFirst(world, b, p.radius)) {
        if (b.cut >= want) break;
        if (!res.wood[i]) continue;
        const steps = Math.min(res.wood[i], Math.ceil((want - b.cut) / unit));
        res.wood[i] -= steps;
        b.cut += steps * unit;
        bld.changed.add("wood");
        res.growing.delete(i);
        if (!res.wood[i] && TERRAIN[world.terrain[i]].forest) { setTerrain(world, i, TID.cleared); world.emit("forest_cleared", { nation: b.owner, at: i }); }
      }
      got = Math.min(want, b.cut);
      b.cut -= got;
    } else if (p.kind === "farm") {
      const fert = b.plots.reduce((s, i) => s + TERRAIN[world.terrain[i]].fertility, 0) / b.plots.length;
      got = want * fert * (SEASON_YIELD[res.seasonOf(b.anchor)] ?? 1) * (b.weatherMult ?? 1);
    } else if (p.kind === "pasture") {
      got = want * (res.seasonOf(b.anchor) === "winter" ? r.winterPasture : 1);
    }
    got *= 1 + (n?.effects?.[`${kind}_rate`] ?? 0);
    b.idle = got <= 1e-9;
    b.made = (b.made ?? 0) + got;
    if (got > 0 && kind) {
      if (!out.has(b.owner)) out.set(b.owner, {});
      const o = out.get(b.owner);
      o[kind] = (o[kind] ?? 0) + got;
    }
  }
  return out;
}

export function productionTick(world, dt) {
  const all = produce(world, dt);
  for (const n of world.nations.values()) {
    const made = all.get(n.id);
    if (!made) { if (n.made) n.made = {}; continue; }
    n.stock ??= {};
    for (const [k, v] of Object.entries(made)) n.stock[k] = (n.stock[k] ?? 0) + v;
    n.made = made;
  }
  regrowForests(world, dt);
}

export function regrowForests(world, dt, chancePerMinute = world.res.rules.regrowPerMinute) {
  const res = world.res, g = world.grid, bld = world.bld, r = res.rules;
  const p = (chancePerMinute * dt) / 60;
  for (const [i, t] of res.edits) {
    if (t !== TID.cleared || world.terrain[i] !== TID.cleared || bld.at.has(i)) continue;
    if (!g.neighbours4(i).some(n => res.wood[n] > WOOD_FULL * 0.5)) continue;
    if (res.rng.chance(p)) {
      setTerrain(world, i, TID.forest);
      res.wood[i] = Math.round(WOOD_FULL * r.regrowStart);
      res.growing.add(i);
      bld.changed.add("wood");
    }
  }
  const grow = Math.max(1, Math.round((WOOD_FULL * dt) / (r.regrowMinutes * 60)));
  for (const i of res.growing) {
    if (!TERRAIN[world.terrain[i]].forest) { res.growing.delete(i); continue; }
    res.wood[i] = Math.min(WOOD_FULL, res.wood[i] + grow);
    bld.changed.add("wood");
    if (res.wood[i] >= WOOD_FULL) res.growing.delete(i);
  }
}

function putVarint(out, v) {
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
}

export function encodeLand(world) {
  const res = world.res, dep = res.dep, out = [LAND_FORMAT];
  const edits = [...res.edits].sort((a, b) => a[0] - b[0]);
  putVarint(out, edits.length);
  let prev = 0;
  for (const [i, t] of edits) { putVarint(out, i - prev); prev = i; out.push(t); }
  const mined = [...res.mined].sort((a, b) => a - b);
  putVarint(out, mined.length);
  prev = 0;
  const f = new Float32Array(1), fb = new Uint8Array(f.buffer);
  for (const k of mined) {
    putVarint(out, dep.plots[k] - prev);
    prev = dep.plots[k];
    f[0] = dep.amount[k];
    out.push(...fb);
  }
  return Uint8Array.from(out);
}

export function restoreLand(world, bytes) {
  const res = world.res, dep = res.dep;
  if (!bytes?.length) return { edits: 0, mined: 0 };
  let p = 0;
  const byte = () => { if (p >= bytes.length) throw new Error("land row is truncated"); return bytes[p++]; };
  const varint = () => { let v = 0, s = 1, b; do { b = byte(); v += (b & 0x7f) * s; s *= 128; } while (b & 0x80); return v; };
  if (byte() !== LAND_FORMAT) throw new Error("land row format is not known");
  const edits = varint();
  let i = 0;
  for (let k = 0; k < edits; k++) {
    i += varint();
    const t = byte();
    world.terrain[i] = t;
    res.edits.set(i, t);
    if (TERRAIN[t].forest && res.wood[i] < WOOD_FULL) res.growing.add(i);
  }
  const mined = varint(), f = new Float32Array(1), fb = new Uint8Array(f.buffer);
  let plot = 0;
  for (let m = 0; m < mined; m++) {
    plot += varint();
    for (let b = 0; b < 4; b++) fb[b] = byte();
    const k = depositIndex(dep, plot);
    if (k >= 0) { dep.amount[k] = f[0]; res.mined.add(k); }
  }
  res.terrainNews.clear();
  return { edits, mined };
}

export function depletedPlots(world) {
  const dep = world.res?.dep, out = [];
  if (!dep) return out;
  for (const k of world.res.mined) if (dep.amount[k] <= 0) out.push(dep.plots[k]);
  return out;
}
