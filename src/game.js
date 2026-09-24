import { checkVictory } from "./sim/bots.js";
import { ORDER_CODES } from "./shared/protocol.js";

const isPlot = (sim, v) => Number.isInteger(v) && v >= 0 && v < sim.grid.size;
const fail = error => ({ ok: false, error });

function ownStack(sim, nation, id) {
  const s = Number.isInteger(id) ? sim.stacks.get(id) : null;
  return s && s.owner === nation ? s : null;
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
    return sim.orderMove(s.id, m.to) ? { ok: true } : fail("no land route there");
  },
  advance(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    return sim.orderAdvance(s.id) ? { ok: true } : fail("cannot advance");
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
    return sim.disbandStack(s.id) ? { ok: true } : fail("disband on your own land");
  },
  route(sim, nation, m) {
    const s = ownStack(sim, nation, m.stack);
    if (!s) return fail("not your stack");
    if (!isPlot(sim, m.to)) return fail("that plot is off the map");
    const r = sim.route(s.pos, m.to);
    if (!r) return fail("no land route there");
    const co = sim.pathGraph(), speed = sim.rules.stackSpeed * (s.speedMult ?? 1);
    const points = r.regions.map(k => {
      const c = co.cellOfRegion[k];
      return [Math.min(sim.grid.w - 1, (c % co.cw) * co.size + (co.size >> 1)), Math.min(sim.grid.h - 1, Math.floor(c / co.cw) * co.size + (co.size >> 1))];
    });
    const g = sim.grid, straight = Math.abs(g.x(s.pos) - g.x(m.to)) + Math.abs(g.y(s.pos) - g.y(m.to));
    const cost = r.regions.length > 1 ? r.cost : straight * co.mean[r.regions[0]];
    return { ok: true, plots: Math.max(r.plots ?? 0, straight), seconds: Math.max(1, Math.round(cost / speed)), points };
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

const nationRow = n => [n.id, n.plots, Math.floor(n.troops), n.alive ? 1 : 0, n.spawned ? 1 : 0];
const stackRow = s => [s.id, s.owner, s.pos, Math.floor(s.troops), ORDER_CODES.indexOf(s.order)];

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
      const same = prev && prev[1] === row[1] && prev[3] === row[3] && prev[4] === row[4] && (prev[2] === row[2] || (nat.bot && this.close(prev[2], row[2])));
      if (same) continue;
      this.nations.set(nat.id, row);
      n.push(row);
    }
    for (const st of sim.stacks.values()) {
      const row = stackRow(st), prev = this.stacks.get(st.id);
      const bot = sim.nations.get(st.owner)?.bot;
      if (bot && !st.engaged && waits(st.id, prev)) continue;
      const same = prev && prev[1] === row[1] && prev[2] === row[2] && prev[4] === row[4] && (prev[3] === row[3] || (bot && this.close(prev[3], row[3])));
      if (same) continue;
      this.stacks.set(st.id, row);
      s.push(row);
    }
    for (const id of this.stacks.keys()) if (!sim.stacks.has(id)) { gone.push(id); this.stacks.delete(id); }
    return n.length || s.length || gone.length ? { n, s, gone } : null;
  }
}

const ALWAYS = new Set(["eliminated", "victory"]);

export function publicEvents(sim, events) {
  const human = id => id !== undefined && sim.nations.get(id)?.human;
  return events.filter(e => ALWAYS.has(e.type) || human(e.nation) || human(e.by) || (e.stack !== undefined && human(sim.stacks.get(e.stack)?.owner)));
}
