import rules from "../../data/rules.json" with { type: "json" };
import { PLAN_DEFAULTS, PLAN_KINDS } from "../shared/planner.js";
import { roadPlan, routePlan } from "../shared/roads.js";
import { polePlan } from "../shared/power.js";
import { MAX_ZONE_SIDE } from "../shared/protocol.js";
import { roadView } from "./logistics.js";
import { ZONE_NAMES } from "./civilians.js";
import { powerView } from "./power.js";
import { canPlace } from "./construction.js";

export const PLAN_RULES = { ...PLAN_DEFAULTS, ...rules.planner };
const PIECES = ["build", "zone", "road", "poles", "upgrade"];

export function installPlanner(world, { run, scale = 1, rules: r = PLAN_RULES } = {}) {
  const P = { rules: { ...r, scale }, run, clock: 0, news: new Set() };
  world.planner = P;
  const tick = (w, dt) => {
    P.clock += dt;
    while (P.clock >= P.rules.every) { P.clock -= P.rules.every; planTick(w, P.rules.perTick); }
  };
  tick.whole = w => planTick(w, P.rules.maxPieces);
  tick.rank = 5;
  world.hooks.postTick.push(tick);
  return P;
}

const isPlot = (world, v) => Number.isInteger(v) && v >= 0 && v < world.grid.size;

export function cleanPiece(world, p) {
  if (!p || typeof p !== "object" || !PIECES.includes(p.t)) return null;
  if (p.t === "build") return typeof p.type === "string" && Object.hasOwn(world.bld.table, p.type) && isPlot(world, p.at) ? { t: "build", type: p.type, at: p.at } : null;
  if (p.t === "zone") {
    const { x, y, w, h } = p;
    if (!ZONE_NAMES.includes(p.zone) || ![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || w > MAX_ZONE_SIDE || h > MAX_ZONE_SIDE) return null;
    return { t: "zone", zone: p.zone, x, y, w, h };
  }
  if (p.t === "road") {
    if (typeof p.kind !== "string" || !world.log?.rules?.types[p.kind]) return null;
    if (Array.isArray(p.via)) return p.via.length >= 1 && p.via.length <= (world.log.rules.maxPoints ?? 64) && p.via.every(i => isPlot(world, i)) ? { t: "road", kind: p.kind, via: [...p.via] } : null;
    return isPlot(world, p.from) && isPlot(world, p.to) && p.from !== p.to ? { t: "road", kind: p.kind, from: p.from, to: p.to } : null;
  }
  if (p.t === "poles") return Array.isArray(p.via) && p.via.length >= 1 && p.via.length <= 64 && p.via.every(i => isPlot(world, i)) ? { t: "poles", via: [...p.via] } : null;
  return Array.isArray(p.ids) && p.ids.length >= 1 && p.ids.length <= 60 && p.ids.every(Number.isInteger) ? { t: "upgrade", ids: [...new Set(p.ids)] } : null;
}

const queued = n => (n.plan ?? []).reduce((s, p) => s + p.pieces.length, 0);

export function planOrder(world, nid, m) {
  const n = world.nations.get(nid), R = world.planner.rules, P = world.planner;
  n.plan ??= [];
  if (m.op === "add") {
    const p = m.project;
    if (!p || typeof p !== "object") return { error: "send a project" };
    if (typeof p.key !== "string" || !p.key || p.key.length > 80) return { error: "a project needs a key" };
    if (!PLAN_KINDS.includes(p.kind)) return { error: `a project's kind is ${PLAN_KINDS.join(", ")}` };
    if (!Array.isArray(p.pieces) || !p.pieces.length || p.pieces.length > R.maxProjectPieces) return { error: `a project has 1 to ${R.maxProjectPieces} pieces` };
    const pieces = p.pieces.map(q => cleanPiece(world, q));
    if (pieces.some(q => !q)) return { error: "a piece of that project is not valid" };
    const rest = n.plan.filter(q => q.key !== p.key);
    if (queued({ plan: rest }) + pieces.length > R.maxPieces) return { error: `at most ${R.maxPieces} pieces can wait in the queue` };
    const name = String(p.name ?? "A project").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
    n.plan = [...rest, { key: p.key, kind: p.kind, name, pieces, total: pieces.length, done: 0, dropped: 0 }];
    P.news.add(nid);
    return { queued: queued(n), projects: n.plan.length };
  }
  if (m.op === "cancel") {
    const before = n.plan.length;
    n.plan = n.plan.filter(q => q.key !== m.key);
    if (n.plan.length === before) return { error: "that project is not in the queue" };
    P.news.add(nid);
    return { queued: queued(n), projects: n.plan.length };
  }
  if (m.op === "clear") {
    n.plan = [];
    n.planWhy = null;
    P.news.add(nid);
    return { queued: 0, projects: 0 };
  }
  if (m.op === "keep") {
    if (!Array.isArray(m.rects) || m.rects.length > R.keepMax) return { error: `keep clear up to ${R.keepMax} areas` };
    const g = world.grid, rects = [];
    for (const r of m.rects) {
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isInteger)) return { error: "an area is x, y, width and height" };
      const [x, y, w, h] = r;
      if (w < 1 || h < 1 || w > R.keepSide || h > R.keepSide || x < 0 || y < 0 || x + w > g.w || y + h > g.h) return { error: `an area is at most ${R.keepSide} by ${R.keepSide} plots, inside the map` };
      rects.push([x, y, w, h]);
    }
    n.keepClear = rects;
    P.news.add(nid);
    return { keep: rects.length };
  }
  return { error: "op is add, cancel, clear or keep" };
}

export function orderOf(p) {
  if (p.t === "road") return p.via ? { t: "road", kind: p.kind, via: p.via } : { t: "road", kind: p.kind, from: p.from, to: p.to };
  return { ...p };
}

export function pieceCost(world, n, p) {
  const bld = world.bld;
  if (p.t === "zone") return { money: 0 };
  if (p.t === "build") {
    const err = canPlace(world, n.id, p.type, p.at);
    return err ? { error: err } : { money: bld.table[p.type]?.cost?.money ?? 0 };
  }
  if (p.t === "road") {
    const log = world.log;
    if (!log?.rules) return { error: "roads are not running in this world" };
    const plan = p.via ? roadPlan(roadView(world), n.id, p.via, p.kind, log.rules, log.scale) : routePlan(roadView(world), n.id, p.from, p.to, p.kind, log.rules, log.scale);
    if (plan.error) return { error: plan.error };
    return plan.plots.length ? { money: plan.cost.money ?? 0 } : { done: true };
  }
  if (p.t === "poles") {
    const def = bld.table.power_pole;
    if (!world.power || !def) return { error: "power is not running in this world" };
    const plan = polePlan(roadView(world), n.id, p.via, { ...world.power.rules, reach: def.pole.reach * world.power.scale });
    return plan.error ? { error: plan.error } : { money: plan.poles.length * (def.cost.money ?? 0) };
  }
  const premium = world.cons?.rules.instantPremium ?? 1.5;
  let money = 0;
  for (const id of p.ids) {
    const b = bld.list.get(id), next = b && b.owner === n.id && b.state === "active" && bld.table[b.type].next;
    if (next) money += (bld.table[next].cost?.money ?? 0) * premium;
  }
  return money ? { money } : { error: "none of those can be upgraded now" };
}

const moneyShort = e => typeof e === "string" && /\bgold\b/.test(e) && /\bneed/.test(e);

export function planTick(world, budget) {
  const P = world.planner;
  for (const n of world.nations.values()) {
    if (!n.plan?.length) continue;
    if (!n.alive || !n.spawned) { n.plan = []; n.planWhy = null; P.news.add(n.id); continue; }
    let tries = 0, waiting = null;
    for (const p of n.plan) {
      for (let k = 0; k < p.pieces.length && tries < budget; ) {
        const piece = p.pieces[k];
        if (waiting && piece.t !== "zone") { k++; continue; }
        tries++;
        const cost = pieceCost(world, n, piece);
        if (cost.done) { p.pieces.splice(k, 1); p.done++; P.news.add(n.id); continue; }
        if (!cost.error && (n.money ?? 0) < cost.money) { waiting ??= { name: p.name, gold: Math.ceil(cost.money - (n.money ?? 0)) }; k++; continue; }
        const r = cost.error ? { ok: false, error: cost.error } : P.run(n.id, orderOf(piece));
        if (r?.ok) { p.pieces.splice(k, 1); p.done++; P.news.add(n.id); continue; }
        if (moneyShort(r?.error)) { waiting ??= { name: p.name, gold: null }; k++; continue; }
        p.pieces.splice(k, 1);
        p.dropped++;
        p.why = r?.error ?? "it could not be done";
        world.emit("plan_dropped", { nation: n.id, name: p.name, what: piece.t, why: p.why });
        P.news.add(n.id);
      }
    }
    for (const p of n.plan) if (!p.pieces.length) world.emit("plan_done", { nation: n.id, name: p.name, done: p.done, dropped: p.dropped });
    const left = n.plan.filter(p => p.pieces.length);
    if (left.length !== n.plan.length) P.news.add(n.id);
    n.plan = left;
    n.planWhy = waiting ? (waiting.gold ? `waiting for ${waiting.gold} more gold for ${waiting.name}` : `waiting for gold for ${waiting.name}`) : null;
  }
}

export function planSummary(n) {
  if (!n?.plan && !n?.keepClear) return null;
  return { projects: (n.plan ?? []).map(p => [p.key, p.name, p.kind, p.pieces.length, p.done, p.dropped]), why: n.planWhy ?? null, keep: n.keepClear ?? [] };
}

export function planQueue(n) {
  return (n?.plan ?? []).map(p => ({ key: p.key, kind: p.kind, name: p.name, pieces: p.pieces }));
}

export function takePlanNews(world) {
  const P = world.planner;
  if (!P?.news.size) return null;
  const out = [...P.news];
  P.news.clear();
  return out;
}

export function planView(world, nid, extra = {}) {
  const n = world.nations.get(nid), bld = world.bld, size = world.grid.size;
  const occupant = i => { const id = bld.at.get(i); return id === undefined || bld.list.get(id).state === "rubble" ? 0 : id; };
  const buildings = [...bld.list.values()].map(b => ({ id: b.id, type: b.type, def: bld.table[b.type], owner: b.owner, anchor: b.anchor, plots: b.plots, state: b.state }));
  const s = n.stats ?? {};
  const reserved = [];
  for (const p of n.plan ?? []) for (const q of p.pieces) if (q.t === "build") for (let dy = 0; dy < bld.table[q.type].fp[1]; dy++) for (let dx = 0; dx < bld.table[q.type].fp[0]; dx++) reserved.push(q.at + dy * world.grid.w + dx);
  return {
    w: world.grid.w, h: world.grid.h, terrain: world.terrain, owner: world.owner, zone: bld.zone, road: world.log?.road ?? new Uint8Array(size),
    occupant, blocked: i => !!occupant(i), deposit: i => world.res?.depositAt(i) ?? null, depositPlots: world.res?.dep.plots ?? [],
    lockOf: (id, kind) => world.lockReason?.(nid, id, kind) ?? null, buildings, defs: bld.table,
    me: { id: nid, era: n.era ?? "T", money: n.money ?? 0, capital: n.capital },
    town: { workers: s.workers ?? 0, jobs: s.jobs ?? 0, demand: s.demand ?? {}, pop: n.pop ?? 0 },
    nations: [...world.nations.values()].map(o => ({ id: o.id, name: o.name, troops: o.troops, alive: o.alive })),
    power: world.power ? powerView(world, n) : null, roadRules: world.log?.rules ?? null, powerRules: world.power?.rules ?? null,
    keep: n.keepClear ?? [], reserved, premium: world.cons?.rules.instantPremium ?? 1.5,
    ...extra,
  };
}
