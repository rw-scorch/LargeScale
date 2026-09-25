import { checkVictory } from "./sim/bots.js";
import { ORDER_CODES, MAX_ZONE_SIDE, MAX_WAYPOINTS } from "./shared/protocol.js";
import { isLand } from "./shared/terrain.js";
import { zonePlots, ZONE_NAMES } from "./sim/civilians.js";
import { orderResearch } from "./sim/research.js";
import { ERA_ORDER } from "./shared/buildings.js";
import { rowOf } from "./shared/buildings.js";
import { place, demolish, listUpgradable, bulkUpgrade } from "./sim/construction.js";
import { UNITS, xpLevelOf } from "./sim/troops.js";
import { mixRow } from "./shared/units.js";

const isPlot = (sim, v) => Number.isInteger(v) && v >= 0 && v < sim.grid.size;
const fail = error => ({ ok: false, error });

function living(sim, nation) {
  const n = sim.nations.get(nation);
  return n?.spawned && n.alive ? n : null;
}

function ownStack(sim, nation, id) {
  const s = Number.isInteger(id) ? sim.stacks.get(id) : null;
  return s && s.owner === nation ? s : null;
}

function waypoints(sim, m) {
  if (m.via === undefined || m.via === null) return { via: [] };
  if (!Array.isArray(m.via)) return { error: "a drawn path is a list of plots" };
  if (m.via.length > MAX_WAYPOINTS) return { error: `a drawn path has at most ${MAX_WAYPOINTS} points` };
  for (const p of m.via) {
    if (!isPlot(sim, p)) return { error: "that plot is off the map" };
    if (!isLand(sim.terrain[p])) return { error: "every point of a drawn path must be on land" };
  }
  return { via: m.via };
}

function legsOf(sim, from, via, to) {
  const out = [];
  for (const p of [...via, to]) {
    const r = sim.route(from, p);
    if (!r) return null;
    out.push({ from, to: p, r });
    from = p;
  }
  return out;
}

export const ORDERS = {
  spawn(sim, nation, m) {
    if (!Number.isInteger(m.x) || !Number.isInteger(m.y)) return fail("x and y must be whole numbers");
    if (sim.nations.get(nation)?.spawned) return fail("already spawned");
    return sim.spawn(nation, m.x, m.y) ? { ok: true } : fail("cannot spawn there");
  },
  stack(sim, nation, m) {
    const n = sim.nations.get(nation);
    if (!n?.spawned || !n.alive) return fail("spawn first");
    const share = Number.isFinite(m.share) ? Math.min(1, Math.max(0.05, m.share)) : 0.3;
    const home = sim.owner[n.capital] === nation ? n.capital : sim.borderOf(nation).values().next().value;
    const at = m.at === undefined ? home : m.at;
    if (!isPlot(sim, at) || sim.owner[at] !== nation) return fail("stacks form on your own land");
    const s = sim.createStack(nation, at, n.troops * share);
    return s ? { ok: true, stack: s.id } : fail("not enough troops");
  },
  move(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    if (!isPlot(sim, m.to)) return fail("that plot is off the map");
    const { via, error } = waypoints(sim, m);
    if (error) return fail(error);
    const none = via.length ? "no land route through those points" : "no land route there";
    if (via.length && !legsOf(sim, s.pos, via, m.to)) return fail(none);
    return sim.orderMove(s.id, m.to, "move", via) ? { ok: true } : fail(none);
  },
  advance(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    let only = null;
    if (m.only === "free") only = 0;
    else if (m.only !== undefined && m.only !== null) {
      const t = Number.isInteger(m.only) && m.only !== nation ? sim.nations.get(m.only) : null;
      if (!t?.alive || !t.spawned) return fail("pick another nation's land");
      if (!sim.hostile(nation, m.only)) return fail(`you are at peace with ${t.name}`);
      only = m.only;
    }
    return sim.orderAdvance(s.id, only, true) ? { ok: true, only } : fail("cannot advance");
  },
  split(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    const amount = Number.isInteger(m.amount) ? m.amount : Number.isFinite(m.share) ? Math.floor(s.troops * Math.min(1, Math.max(0, m.share))) : NaN;
    if (!(amount > 0)) return fail("give amount or share");
    const c = sim.splitStack(s.id, amount);
    return c ? { ok: true, stack: c.id } : fail(`both halves need at least ${sim.rules.minStack} troops`);
  },
  merge(sim, nation, m) {
    const a = ownStack(sim, nation, m.into), b = ownStack(sim, nation, m.stack);
    if (!a || !b) return fail("not your stack");
    if (a === b) return fail("pick two different stacks");
    return sim.mergeStacks(a.id, b.id) ? { ok: true, stack: a.id } : fail("stacks must be next to each other");
  },
  disband(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    const had = Math.floor(s.troops), r = sim.dischargeStack(s.id);
    if (!r) return fail("disband on your own land");
    if (!(r.back > 0)) return fail("your troops are already at their cap, so the stack stays");
    const left = Math.floor(r.left), back = Math.round(r.back);
    return { ok: true, back, lost: Math.max(0, had - left - back), left };
  },
  build(sim, nation, m) {
    if (!living(sim, nation)) return fail("spawn first");
    if (!sim.cons) return fail("building is not running in this world");
    if (typeof m.type !== "string" || !Object.hasOwn(sim.bld.table, m.type)) return fail("unknown building");
    if (!isPlot(sim, m.at)) return fail("that plot is off the map");
    const b = place(sim, nation, m.type, m.at);
    return b.error ? fail(b.error) : { ok: true, building: b.id };
  },
  demolish(sim, nation, m) {
    if (!living(sim, nation)) return fail("spawn first");
    if (!sim.cons) return fail("building is not running in this world");
    if (!Number.isInteger(m.building)) return fail("pick a building");
    const r = demolish(sim, nation, m.building);
    return r.error ? fail(r.error) : { ok: true, ...r };
  },
  upgrade(sim, nation, m) {
    if (!living(sim, nation)) return fail("spawn first");
    if (!sim.cons) return fail("building is not running in this world");
    const filter = m.filter ?? "all";
    if (!["all", "civilian", "player"].includes(filter)) return fail("filter is all, civilian or player");
    if (!Array.isArray(m.picks) || !m.picks.length || m.picks.length > 60) return fail("pick 1 to 60 groups");
    const want = new Map();
    for (const p of m.picks) {
      if (!Array.isArray(p) || typeof p[0] !== "string" || !Object.hasOwn(sim.bld.table, p[0]) || !Number.isInteger(p[1]) || p[1] < 1) return fail("each pick is a building type and a count");
      want.set(p[0], (want.get(p[0]) ?? 0) + p[1]);
    }
    const picks = [];
    for (const r of listUpgradable(sim, nation, { filter })) {
      const left = want.get(r.type) ?? 0;
      if (left > 0) { picks.push({ id: r.id, civilian: r.civilian }); want.set(r.type, left - 1); }
    }
    if (!picks.length) return fail("none of those can be upgraded now");
    const r = bulkUpgrade(sim, nation, picks), skipped = {};
    for (const [, why] of r.skipped) skipped[why] = (skipped[why] ?? 0) + 1;
    if (r.done.length) sim.emit("upgraded", { nation, count: r.done.length, spent: Math.round(r.spent) });
    return { ok: true, done: r.done.length, spent: Math.round(r.spent * 100) / 100, skipped, missing: [...want.values()].reduce((s, v) => s + v, 0) };
  },
  zone(sim, nation, m) {
    if (!living(sim, nation)) return fail("spawn first");
    if (!sim.civ) return fail("towns are not running in this world");
    if (!ZONE_NAMES.includes(m.zone)) return fail("unknown zone");
    const locked = m.zone !== "none" && sim.lockReason?.(nation, m.zone, "zones");
    if (locked) return fail(locked);
    const { x, y, w, h } = m;
    if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1) return fail("give x, y, w and h as whole numbers");
    if (w > MAX_ZONE_SIDE || h > MAX_ZONE_SIDE) return fail(`zone at most ${MAX_ZONE_SIDE} by ${MAX_ZONE_SIDE} plots at a time`);
    const g = sim.grid, plots = [];
    for (let yy = Math.max(0, y); yy < Math.min(g.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(g.w, x + w); xx++) plots.push(g.idx(xx, yy));
    return { ok: true, plots: zonePlots(sim, nation, plots, m.zone) };
  },
  research(sim, nation, m) {
    if (!living(sim, nation)) return fail("spawn first");
    if (!sim.research) return fail("research is not running in this world");
    const mode = m.mode ?? "queue";
    if (!["queue", "first", "remove", "clear"].includes(mode)) return fail("mode is queue, first, remove or clear");
    if (mode !== "clear" && typeof m.id !== "string") return fail("pick a research node");
    const r = orderResearch(sim, nation, m.id, mode);
    return r.error ? { ok: false, ...r } : { ok: true, ...r };
  },
  route(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    if (!isPlot(sim, m.to)) return fail("that plot is off the map");
    const { via, error } = waypoints(sim, m);
    if (error) return fail(error);
    const legs = legsOf(sim, s.pos, via, m.to);
    if (!legs) return fail(via.length ? "no land route through those points" : "no land route there");
    const co = sim.pathGraph(), speed = sim.rules.stackSpeed * sim.speedOf(s), g = sim.grid, points = [];
    let plots = 0, cost = 0;
    for (const { from, to, r } of legs) {
      for (const k of r.regions) {
        const c = co.cellOfRegion[k];
        points.push([Math.min(g.w - 1, (c % co.cw) * co.size + (co.size >> 1)), Math.min(g.h - 1, Math.floor(c / co.cw) * co.size + (co.size >> 1))]);
      }
      const straight = Math.abs(g.x(from) - g.x(to)) + Math.abs(g.y(from) - g.y(to));
      cost += r.regions.length > 1 ? Math.max(r.cost, straight) : straight * co.mean[r.regions[0]];
      plots += Math.max(r.plots ?? 0, straight);
    }
    return { ok: true, plots, seconds: Math.max(1, Math.round(cost / speed)), points };
  },
};

export function runOrder(sim, nation, m) {
  const f = Object.hasOwn(ORDERS, m.t) ? ORDERS[m.t] : null;
  return f ? { t: "result", of: m.t, ...f(sim, nation, m) } : null;
}

export class RateLimit {
  constructor(perSecond, burst) { this.rate = perSecond; this.burst = burst; this.buckets = new Map(); }
  take(key, now) {
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    this.buckets.set(key, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

export function applyPresence(sim, online, offlineMult) {
  for (const n of sim.nations.values()) if (n.human) n.defenceMult = online.has(n.id) ? 1 : offlineMult;
}

export function victory(sim) {
  const v = checkVictory(sim);
  if (!v) return null;
  return { winner: v.winner, name: v.winner === null ? null : sim.nations.get(v.winner)?.name ?? null };
}

const nationRow = n => [n.id, n.plots, Math.floor(n.troops), n.alive ? 1 : 0, n.spawned ? 1 : 0, Math.max(0, ERA_ORDER.indexOf(n.era ?? "T"))];
const stackRow = s => {
  const row = [s.id, s.owner, s.pos, Math.floor(s.troops), ORDER_CODES.indexOf(s.order)];
  const mix = s.mix ? mixRow(UNITS, s.mix) : [], lv = xpLevelOf(s);
  if (mix.length || lv) row.push(mix, lv);
  return row;
};
const NONE = [];
const sameTypes = (p, q) => {
  const a = p[5] ?? NONE, b = q[5] ?? NONE;
  if (a.length !== b.length || (p[6] ?? 0) !== (q[6] ?? 0)) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
};

export class StateFeed {
  constructor(botShare = 0.01, botEvery = 5) { this.botShare = botShare; this.botEvery = botEvery; this.round = 0; this.nations = new Map(); this.stacks = new Map(); }
  snapshot(sim) {
    return [...sim.stacks.values()].map(stackRow);
  }
  close(a, b) { return Math.abs(a - b) < Math.max(1, a * this.botShare); }
  delta(sim) {
    const n = [], s = [], gone = [], turn = this.round++ % this.botEvery;
    const waits = (id, prev) => prev && id % this.botEvery !== turn;
    for (const nat of sim.nations.values()) {
      const row = nationRow(nat), prev = this.nations.get(nat.id);
      if (nat.bot && waits(nat.id, prev) && prev[3] === row[3]) continue;
      const same = prev && prev[1] === row[1] && prev[3] === row[3] && prev[4] === row[4] && prev[5] === row[5] && (prev[2] === row[2] || (nat.bot && this.close(prev[2], row[2])));
      if (same) continue;
      this.nations.set(nat.id, row);
      n.push(row);
    }
    for (const st of sim.stacks.values()) {
      const row = stackRow(st), prev = this.stacks.get(st.id);
      const bot = sim.nations.get(st.owner)?.bot;
      if (bot && !st.engaged && waits(st.id, prev)) continue;
      const same = prev && prev[1] === row[1] && prev[2] === row[2] && prev[4] === row[4] && (prev[3] === row[3] || (bot && this.close(prev[3], row[3]))) && sameTypes(prev, row);
      if (same) continue;
      this.stacks.set(st.id, row);
      s.push(row);
    }
    for (const id of this.stacks.keys()) if (!sim.stacks.has(id)) { gone.push(id); this.stacks.delete(id); }
    return n.length || s.length || gone.length ? { n, s, gone } : null;
  }
}

export class BuildingFeed {
  rows(sim) {
    return [...sim.bld.list.values()].map(b => rowOf(b, sim.bld.table));
  }
  delta(sim) {
    const bld = sim.bld;
    if (!bld?.news.size) return null;
    const up = [], gone = [];
    for (const id of bld.news) {
      const b = bld.list.get(id);
      if (b) up.push(rowOf(b, bld.table)); else gone.push(id);
    }
    bld.news.clear();
    return { up, gone };
  }
}

export function ordersOf(sim, nid) {
  const out = [];
  for (const s of sim.stacks.values()) {
    if (s.owner !== nid) continue;
    const leg = s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : null), rest = s.via ?? [];
    const to = rest.length ? rest[rest.length - 1] : leg;
    const only = s.order === "advance" ? s.only ?? null : null;
    if (to === null && only === null) continue;
    const row = { id: s.id, to, only };
    if (rest.length) row.via = [...(leg === null ? [] : [leg]), ...rest.slice(0, -1)];
    out.push(row);
  }
  return out;
}

const r2 = v => Math.round((v ?? 0) * 100) / 100;

export function purseOf(n, extra = {}) {
  if (!n || n.money === undefined) return null;
  const stock = {};
  for (const [k, v] of Object.entries(n.stock ?? {})) stock[k] = Math.floor(v);
  const s = n.stats ?? {};
  const town = { pop: Math.round(n.pop ?? 0), housing: s.housing ?? 0, jobs: s.jobs ?? 0, workers: Math.round(s.workers ?? 0), foodUse: r2(s.foodUse), needs: r2(s.needs ?? 1), foodSat: r2(s.foodSat ?? 1), fed: Math.floor(s.fed ?? 0), foodCap: r2(s.foodCap ?? 1), worked: r2(s.worked ?? 0), zoned: s.zoned ?? [0, 0, 0, 0], jobSat: r2(s.jobSat ?? 1), goodsSat: r2(s.goodsSat ?? 1), demand: { res: r2(s.demand?.res), com: r2(s.demand?.com), ind: r2(s.demand?.ind) } };
  const making = {};
  for (const [k, v] of Object.entries(n.made ?? {})) making[k] = r2(v / (n.madeEvery ?? 5));
  return { money: Math.floor(n.money), stock, era: n.era ?? "T", town, making, ...extra };
}

const ALWAYS = new Set(["eliminated", "victory", "era_up"]);
const QUIET = new Set(["civ_build", "civ_upgrade"]);

export function publicEvents(sim, events) {
  const human = id => id !== undefined && sim.nations.get(id)?.human;
  return events.filter(e => !QUIET.has(e.type) && (ALWAYS.has(e.type) || human(e.nation) || human(e.by) || (e.stack !== undefined && human(sim.stacks.get(e.stack)?.owner))));
}
