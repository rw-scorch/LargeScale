export const OFFLINE = {
  defenceMult: 0.95,
  offlineOutputShare: 0.9,
  averageWindowSeconds: 1800,
  threatRadius: 6,
  fallbackRatio: 1.5,
  catchupStep: 60,
  maxCatchupSeconds: 3 * 24 * 3600,
  alertKinds: ["plot_lost", "stack_destroyed", "convoy_lost", "war_declared", "eliminated", "built", "deposit_depleted"],
};

export class Presence {
  constructor() { this.online = new Map(); this.lastSeen = new Map(); }
  connect(nid, now) { this.online.set(nid, (this.online.get(nid) ?? 0) + 1); this.lastSeen.set(nid, now); }
  disconnect(nid, now) {
    const c = (this.online.get(nid) ?? 1) - 1;
    if (c <= 0) this.online.delete(nid); else this.online.set(nid, c);
    this.lastSeen.set(nid, now);
  }
  isOnline(nid) { return this.online.has(nid); }
  anyone() { return this.online.size > 0; }
}

export function applyOfflineDefence(world, presence, rules = OFFLINE) {
  for (const n of world.nations.values()) if (n.human) n.defenceMult = presence.isOnline(n.id) ? 1 : rules.defenceMult;
}

export function trackOutput(nation, perSecond, dt, rules = OFFLINE) {
  const w = rules.averageWindowSeconds;
  const k = Math.min(1, dt / w);
  nation.avgOutput ??= {};
  const seen = new Set(Object.keys(perSecond));
  for (const k2 of Object.keys(nation.avgOutput)) seen.add(k2);
  for (const key of seen) {
    const now = perSecond[key] ?? 0;
    nation.avgOutput[key] = (nation.avgOutput[key] ?? now) * (1 - k) + now * k;
  }
  return nation.avgOutput;
}

export function offlineOutput(nation, seconds, rules = OFFLINE) {
  const out = {};
  for (const [key, rate] of Object.entries(nation.avgOutput ?? {})) {
    const got = rate * rules.offlineOutputShare * seconds;
    if (got > 0) out[key] = got;
  }
  return out;
}

export function applyOfflineOutput(nation, seconds, rules = OFFLINE) {
  const out = offlineOutput(nation, seconds, rules);
  nation.stock ??= {};
  for (const [k, v] of Object.entries(out)) nation.stock[k] = (nation.stock[k] ?? 0) + v;
  return out;
}

export function threatNear(world, s, radius) {
  let t = 0;
  for (const o of world.stacks.values()) if (world.hostile(s.owner, o.owner) && world.grid.cheb(s.pos, o.pos) <= radius) t += o.troops;
  return t;
}

export function nearestSafe(world, s) {
  const n = world.nations.get(s.owner);
  const cands = [n.capital, ...(n.cities ?? [])].filter(i => i !== undefined && world.owner[i] === s.owner);
  cands.sort((a, b) => world.grid.dist(a, s.pos) - world.grid.dist(b, s.pos));
  return cands[0] ?? null;
}

export function standingOrders(world, presence, rules = OFFLINE) {
  const moved = [];
  for (const s of world.stacks.values()) {
    if (presence.isOnline(s.owner) || !world.nations.get(s.owner)?.human) continue;
    const mode = s.standing ?? "hold";
    if (mode === "hold") {
      if (s.order === "advance") {
        s.order = "hold";
        s.path = [];
        s.route = null;
        s.via = null;
      }
      continue;
    }
    if (s.retreating && s.path.length) continue;
    const threat = threatNear(world, s, rules.threatRadius);
    if (threat > s.troops * rules.fallbackRatio) {
      const safe = nearestSafe(world, s);
      if (safe !== null && safe !== s.pos && world.orderMove(s.id, safe, "move")) {
        s.retreating = true;
        moved.push(s.id);
      }
    } else s.retreating = false;
  }
  return moved;
}

export function collectAlerts(world, presence, inbox, since, rules = OFFLINE) {
  for (const e of world.events) {
    if (e.t < since || !rules.alertKinds.includes(e.type)) continue;
    const who = e.nation ?? e.b ?? e.owner;
    if (who === undefined || presence.isOnline(who)) continue;
    if (!inbox.has(who)) inbox.set(who, []);
    inbox.get(who).push(e);
  }
}

export function summarise(events) {
  const out = { plotsLost: 0, byAttacker: {}, stacksLost: 0, convoysLost: 0, wars: [], built: 0, other: 0 };
  for (const e of events) {
    if (e.type === "plot_lost") { out.plotsLost++; out.byAttacker[e.by] = (out.byAttacker[e.by] ?? 0) + 1; }
    else if (e.type === "stack_destroyed") out.stacksLost++;
    else if (e.type === "convoy_lost") out.convoysLost++;
    else if (e.type === "war_declared") out.wars.push(e.a);
    else if (e.type === "built") out.built++;
    else out.other++;
  }
  return out;
}

export function planCatchUp(elapsed, rules = OFFLINE) {
  const capped = Math.min(Math.max(0, elapsed), rules.maxCatchupSeconds);
  const steps = Math.floor(capped / rules.catchupStep);
  const rest = capped - steps * rules.catchupStep;
  return { capped, steps, step: rules.catchupStep, rest, dropped: Math.max(0, elapsed - capped) };
}

export function runCatchUp(job, econStep, budgetMs = 50, clock = () => performance.now()) {
  const start = clock();
  while (job.steps > 0) {
    econStep(job.step);
    job.steps--;
    if (clock() - start > budgetMs) return false;
  }
  if (job.rest > 0) { econStep(job.rest); job.rest = 0; }
  return true;
}
