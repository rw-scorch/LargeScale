import rules from "../../data/rules.json" with { type: "json" };
import { release } from "./pilot.js";

export const DIPLO = {
  warNotice: 300,
  proposalLife: 600,
  betrayalCooldown: 900,
  peaceMinWar: 600,
  peaceTreaty: 600,
  maxFactionSize: 4,
  factionDefends: true,
  treatyMinutes: [30, 60, 120, 240],
  every: 1,
  ...rules.diplomacy,
};

export const RELATIONS = ["peace", "war_pending", "war", "alliance"];
export const PROPOSALS = ["peace", "alliance", "non_aggression"];
export const cleanFactionName = s => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim().slice(0, 24) : "");

const SPAN = 1048576;
const key = (a, b) => (a < b ? a * SPAN + b : b * SPAN + a);
const pairOf = k => [Math.floor(k / SPAN), k % SPAN];

export class Diplomacy {
  constructor(rules = {}) {
    this.rules = { ...DIPLO, ...rules };
    this.base = "peace";
    this.rel = new Map();
    this.embargo = new Set();
    this.proposals = new Map();
    this.factions = new Map();
    this.memberOf = new Map();
    this.next = 1;
    this.log = [];
    this.closed = [];
    this.version = 0;
  }

  get(a, b) {
    const k = key(a, b);
    let r = this.rel.get(k);
    if (!r) this.rel.set(k, (r = { status: this.base, since: 0, treatyUntil: 0, noWarUntil: 0, pendingAt: 0 }));
    return r;
  }

  faction(a) { return this.memberOf.get(a) ?? null; }
  sameFaction(a, b) { const f = this.faction(a); return f !== null && f === this.faction(b); }

  status(a, b, now) {
    if (a === b || this.sameFaction(a, b)) return "alliance";
    const r = this.get(a, b);
    if (r.status === "war_pending" && now >= r.pendingAt) {
      r.status = "war";
      r.since = r.pendingAt;
      this.version++;
      this.log.push({ t: now, type: "war_started", a, b });
    }
    return r.status;
  }

  hostile(a, b, now) { return this.status(a, b, now) === "war"; }
  passable(a, b, now) { return this.status(a, b, now) === "alliance" && !this.blocksTransit(b, a); }
  sharesVision(a, b, now) { return this.status(a, b, now) === "alliance"; }
  blocksTransit(owner, traveller) { return this.embargo.size > 0 && this.embargo.has(`${owner}>${traveller}`); }

  declareWar(a, b, now) {
    if (a === b) return "cannot declare war on yourself";
    if (this.sameFaction(a, b)) return "cannot declare war on your own faction";
    const targets = this.rules.factionDefends && this.faction(b) !== null ? this.membersOf(this.faction(b)) : [b];
    for (const t of targets) {
      const r = this.get(a, t);
      const st = this.status(a, t, now);
      if (st === "alliance") return "leave the alliance first";
      if (r.treatyUntil > now) return "a non-aggression treaty is in force";
      if (r.noWarUntil > now) return "you broke a treaty recently, wait before declaring war";
      if (st === "war" || st === "war_pending") return "already at war";
    }
    for (const t of targets) {
      const r = this.get(a, t);
      r.status = "war_pending";
      r.pendingAt = now + this.rules.warNotice;
      this.log.push({ t: now, type: "war_declared", a, b: t, at: r.pendingAt });
    }
    this.version++;
    return null;
  }

  check(from, to, kind, now) {
    if (from === to) return "pick another nation";
    const st = this.status(from, to, now);
    if (kind === "alliance") return st === "alliance" ? "you are already allied" : st !== "peace" ? "make peace first" : null;
    if (kind === "peace") {
      if (st !== "war" && st !== "war_pending") return "you are not at war";
      return st === "war" && now - this.get(from, to).since < this.rules.peaceMinWar ? "the war is too young for peace talks" : null;
    }
    if (kind === "non_aggression") return st !== "peace" ? "only possible in peace" : null;
    if (kind === "faction_invite") {
      const f = this.faction(from);
      if (f === null || this.factions.get(f).leader !== from) return "only a faction leader can invite";
      if (this.faction(to) !== null) return "they are already in a faction";
      if (this.factions.get(f).members.size >= this.rules.maxFactionSize) return "faction is full";
      for (const m of this.factions.get(f).members) { const s = this.status(m, to, now); if (s === "war" || s === "war_pending") return m === from ? "make peace first" : "make peace with every member first"; }
      return null;
    }
    return "unknown proposal";
  }

  propose(from, to, kind, now, terms = {}) {
    const error = this.check(from, to, kind, now);
    if (error) return { error };
    for (const [id, q] of this.proposals) if (q.from === from && q.to === to && q.kind === kind) this.proposals.delete(id);
    const p = { id: this.next++, from, to, kind, terms, at: now, expires: now + this.rules.proposalLife };
    this.proposals.set(p.id, p);
    this.version++;
    return { proposal: p };
  }

  accept(by, id, now) {
    const p = this.proposals.get(id);
    if (!p || p.to !== by) return "no such proposal";
    this.proposals.delete(id);
    this.version++;
    if (now > p.expires) return "proposal expired";
    const why = this.check(p.from, p.to, p.kind, now);
    if (why) return why;
    const r = this.get(p.from, p.to);
    if (p.kind === "alliance") { r.status = "alliance"; r.since = now; }
    if (p.kind === "peace") { r.status = "peace"; r.since = now; r.pendingAt = 0; r.treatyUntil = now + this.rules.peaceTreaty; this.closed.push([p.from, p.to]); }
    if (p.kind === "non_aggression") r.treatyUntil = now + (p.terms.minutes ?? 60) * 60;
    if (p.kind === "faction_invite") return this.join(this.faction(p.from), by, now);
    this.log.push({ t: now, type: `${p.kind}_signed`, a: p.from, b: p.to, ...(p.kind === "non_aggression" ? { minutes: p.terms.minutes ?? 60 } : {}) });
    return null;
  }

  decline(by, id) {
    const p = this.proposals.get(id);
    if (!p || p.to !== by) return "no such proposal";
    this.proposals.delete(id);
    this.version++;
    return null;
  }

  withdraw(by, id) {
    const p = this.proposals.get(id);
    if (!p || p.from !== by) return "no such proposal";
    this.proposals.delete(id);
    this.version++;
    return null;
  }

  leaveAlliance(a, b, now) {
    const r = this.get(a, b);
    if (r.status !== "alliance") return "not allied";
    r.status = "peace";
    r.since = now;
    r.noWarUntil = now + this.rules.betrayalCooldown;
    this.closed.push([a, b]);
    this.log.push({ t: now, type: "alliance_left", a, b });
    this.version++;
    return null;
  }

  breakTreaty(a, b, now) {
    const r = this.get(a, b);
    if (r.treatyUntil <= now) return "no treaty";
    r.treatyUntil = 0;
    r.noWarUntil = now + this.rules.betrayalCooldown;
    this.log.push({ t: now, type: "treaty_broken", a, b });
    this.version++;
    return null;
  }

  setEmbargo(owner, target, on, now = 0) {
    const k = `${owner}>${target}`;
    if (on === this.embargo.has(k)) return;
    if (on) { this.embargo.add(k); this.closed.push([owner, target]); } else this.embargo.delete(k);
    this.log.push({ t: now, type: "embargo", a: owner, b: target, on: !!on });
    this.version++;
  }

  createFaction(founder, name, now = 0) {
    if (this.faction(founder) !== null) return { error: "already in a faction" };
    const id = this.next++;
    this.factions.set(id, { id, name, leader: founder, members: new Set([founder]) });
    this.memberOf.set(founder, id);
    this.log.push({ t: now, type: "faction_created", a: founder, faction: id, name });
    this.version++;
    return { faction: id };
  }

  renameFaction(nation, name, now = 0) {
    const fid = this.faction(nation), f = this.factions.get(fid);
    if (!f) return "not in a faction";
    if (f.leader !== nation) return "only the leader can rename the faction";
    f.name = name;
    this.log.push({ t: now, type: "faction_renamed", a: nation, faction: fid, name });
    this.version++;
    return null;
  }

  membersOf(fid) { return [...(this.factions.get(fid)?.members ?? [])]; }

  join(fid, nation, now = 0) {
    const f = this.factions.get(fid);
    if (!f) return "no such faction";
    if (f.members.size >= this.rules.maxFactionSize) return "faction is full";
    f.members.add(nation);
    this.memberOf.set(nation, fid);
    for (const m of f.members) if (m !== nation) { const r = this.get(m, nation); r.status = "peace"; r.pendingAt = 0; }
    for (const [id, p] of this.proposals) if (p.kind === "faction_invite" && p.to === nation) this.proposals.delete(id);
    this.log.push({ t: now, type: "faction_joined", a: nation, faction: fid, name: f.name });
    this.version++;
    return null;
  }

  leave(nation, now, by = null) {
    const fid = this.faction(nation);
    if (fid === null) return "not in a faction";
    const f = this.factions.get(fid);
    f.members.delete(nation);
    this.memberOf.delete(nation);
    for (const m of f.members) { this.get(m, nation).noWarUntil = now + this.rules.betrayalCooldown; this.closed.push([m, nation]); }
    if (!f.members.size) this.factions.delete(fid);
    else if (f.leader === nation) f.leader = [...f.members][0];
    for (const [id, p] of this.proposals) if (p.kind === "faction_invite" && (p.from === nation || !this.factions.has(fid))) this.proposals.delete(id);
    this.log.push({ t: now, type: "faction_left", a: nation, faction: fid, name: f.name, ...(by !== null ? { by } : {}), ...(f.members.size ? { leader: f.leader } : { ended: true }) });
    this.version++;
    return null;
  }

  winnerKey(nation) { return this.faction(nation) ?? `n${nation}`; }

  expire(now) {
    for (const [id, p] of this.proposals) if (now > p.expires) { this.proposals.delete(id); this.version++; }
  }

  save() {
    return {
      v: 1, base: this.base, next: this.next,
      rel: [...this.rel].map(([k, r]) => [...pairOf(k), r.status, r.since, r.treatyUntil, r.noWarUntil, r.pendingAt]),
      embargo: [...this.embargo],
      proposals: [...this.proposals.values()],
      factions: [...this.factions.values()].map(f => ({ id: f.id, name: f.name, leader: f.leader, members: [...f.members] })),
    };
  }

  load(o) {
    this.base = o.base ?? "peace";
    this.next = o.next ?? 1;
    this.rel = new Map((o.rel ?? []).map(([a, b, status, since, treatyUntil, noWarUntil, pendingAt]) => [key(a, b), { status, since, treatyUntil, noWarUntil, pendingAt }]));
    this.embargo = new Set(o.embargo ?? []);
    this.proposals = new Map((o.proposals ?? []).map(p => [p.id, p]));
    this.factions = new Map((o.factions ?? []).map(f => [f.id, { ...f, members: new Set(f.members) }]));
    this.memberOf = new Map();
    for (const f of this.factions.values()) for (const m of f.members) this.memberOf.set(m, f.id);
    this.version++;
    return this;
  }

  view(now) {
    return {
      base: this.base,
      rel: [...this.rel.keys()].map(k => { const [a, b] = pairOf(k), s = this.status(a, b, now), r = this.rel.get(k); return [a, b, RELATIONS.indexOf(s), r.pendingAt, r.treatyUntil, r.noWarUntil, r.since]; }),
      embargo: [...this.embargo].map(e => e.split(">").map(Number)),
      factions: [...this.factions.values()].map(f => ({ id: f.id, name: f.name, leader: f.leader, members: [...f.members] })),
    };
  }

  proposalsOf(nid) {
    return [...this.proposals.values()].filter(p => p.from === nid || p.to === nid)
      .map(p => ({ id: p.id, from: p.from, to: p.to, kind: p.kind, minutes: p.terms?.minutes ?? null, expires: p.expires }));
  }
}

export function wireToWorld(world, dip) {
  world.hostile = (a, b) => dip.hostile(a, b, world.time);
  world.passable = (a, b) => dip.passable(a, b, world.time);
}

export function installDiplomacy(world, { rules: r = {}, saved = null, fresh = true } = {}) {
  if (world.dip) return world.dip;
  const dip = new Diplomacy(r);
  if (saved) dip.load(saved);
  else dip.base = fresh ? "peace" : "war";
  world.dip = dip;
  const nations = world.nations, hostile = world.hostile, passable = world.passable;
  let flags = new Uint8Array(64);
  const human = id => {
    if (id >= flags.length) { const f = new Uint8Array(Math.max(id + 1, flags.length * 2)); f.set(flags); flags = f; }
    let v = flags[id];
    if (v === 0) { const n = nations.get(id); if (!n) return false; v = flags[id] = n.human === true ? 2 : 1; }
    return v === 2;
  };
  const players = (a, b) => a !== b && human(a) && human(b);
  world.hostile = (a, b) => (players(a, b) ? dip.hostile(a, b, world.time) : hostile(a, b));
  world.passable = (a, b) => (players(a, b) ? dip.passable(a, b, world.time) : passable(a, b));
  let clock = 0;
  const tick = (w, dt) => { clock += dt; if (clock < dip.rules.every) return; clock = 0; diploTick(w); };
  tick.whole = w => diploTick(w);
  world.hooks.postTick.push(tick);
  return dip;
}

export function diploTick(world) {
  const dip = world.dip, now = world.time;
  for (const [k, r] of dip.rel) if (r.status === "war_pending" && now >= r.pendingAt) dip.status(...pairOf(k), now);
  dip.expire(now);
  for (const [a, b] of dip.closed.splice(0)) sendHome(world, a, b);
  for (const e of dip.log.splice(0)) {
    const { t, type, ...rest } = e;
    world.emit(type, rest);
  }
}

export function sendHome(world, a, b) {
  const moved = new Map();
  for (const s of world.stacks.values()) {
    const o = world.owner[s.pos];
    if (!((s.owner === a && o === b) || (s.owner === b && o === a))) continue;
    if (world.passable(s.owner, o) || world.hostile(s.owner, o)) continue;
    const n = world.nations.get(s.owner);
    const home = world.nearestOwned(s.owner, s.pos) ?? (n && world.owner[n.capital] === s.owner ? n.capital : null);
    if (home === null) continue;
    if (s.pilot) for (const P of world.pilot?.list.values() ?? []) if (P.kind === "s" && P.id === s.id) release(world, P);
    Object.assign(s, { pos: home, order: "hold", path: [], route: null, via: null, board: null, progress: 0 });
    moved.set(s.owner, (moved.get(s.owner) ?? 0) + 1);
  }
  for (const [nation, stacks] of moved) world.emit("troops_home", { nation, from: nation === a ? b : a, stacks });
  return moved;
}

export function relationOf(world, a, b) {
  const A = world.nations.get(a), B = world.nations.get(b);
  if (!world.dip || !A?.human || !B?.human || a === b) return null;
  return world.dip.status(a, b, world.time);
}

export function peaceReason(world, a, b) {
  const name = world.nations.get(b)?.name ?? "them", st = relationOf(world, a, b);
  if (st === "war_pending") return `the war with ${name} starts in ${Math.max(1, Math.ceil(world.dip.get(a, b).pendingAt - world.time))} s`;
  if (st === "alliance") return `${name} is your ally`;
  if (st === "war") return `the peace period is still on`;
  return st === "peace" ? `you are at peace with ${name}: declare war first` : `you are at peace with ${name}`;
}

const target = (world, nid, m) => {
  const t = Number.isInteger(m.to) && m.to !== nid ? world.nations.get(m.to) : null;
  if (!t) return { error: "pick another nation" };
  if (!t.human) return { error: `${t.name} is a bot: you attack bots without declaring war` };
  if (!t.alive) return { error: `${t.name} is gone` };
  return { t };
};

export function diploOrder(world, nid, m) {
  const dip = world.dip, now = world.time;
  if (!dip) return { error: "there is no diplomacy in this world" };
  if (!world.nations.get(nid)?.human) return { error: "only players take part in diplomacy" };
  const id = Number(m.id);
  switch (m.op) {
    case "war": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      const why = dip.declareWar(nid, t.id, now);
      return why ? { error: why } : { ok: true, starts: now + dip.rules.warNotice };
    }
    case "propose": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      if (!PROPOSALS.includes(m.kind)) return { error: "propose peace, an alliance or a treaty" };
      const minutes = m.kind === "non_aggression" ? Number(m.minutes) : null;
      if (m.kind === "non_aggression" && !dip.rules.treatyMinutes.includes(minutes)) return { error: `a treaty lasts ${dip.rules.treatyMinutes.join(", ")} minutes` };
      const theirs = [...dip.proposals.values()].find(p => p.from === t.id && p.to === nid && p.kind === m.kind && (m.kind !== "non_aggression" || p.terms.minutes === minutes));
      if (theirs) { const why = dip.accept(nid, theirs.id, now); return why ? { error: why } : { ok: true, signed: m.kind }; }
      const r = dip.propose(nid, t.id, m.kind, now, minutes ? { minutes } : {});
      return r.error ? r : { ok: true, proposal: r.proposal.id, to: t.id, kind: m.kind };
    }
    case "accept": {
      const p = dip.proposals.get(id);
      if (p?.kind === "faction_invite" && dip.faction(nid) !== null) return { error: "leave your faction first" };
      const why = dip.accept(nid, id, now);
      return why ? { error: why } : { ok: true, signed: p.kind, with: p.from };
    }
    case "decline": { const why = dip.decline(nid, id); return why ? { error: why } : { ok: true }; }
    case "withdraw": { const why = dip.withdraw(nid, id); return why ? { error: why } : { ok: true }; }
    case "leave": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      if (dip.sameFaction(nid, t.id)) return { error: "you share a faction: leave the faction instead" };
      const why = dip.leaveAlliance(nid, t.id, now);
      return why ? { error: why } : { ok: true };
    }
    case "break": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      const why = dip.breakTreaty(nid, t.id, now);
      return why ? { error: why } : { ok: true };
    }
    case "embargo": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      dip.setEmbargo(nid, t.id, !!m.on, now);
      return { ok: true, on: !!m.on };
    }
    case "faction":
    case "rename": {
      const name = cleanFactionName(m.name);
      if (!name) return { error: "a faction name is 1 to 24 characters" };
      if ([...dip.factions.values()].some(f => f.name.toLowerCase() === name.toLowerCase() && f.id !== dip.faction(nid))) return { error: "another faction has that name" };
      if (m.op === "rename") { const why = dip.renameFaction(nid, name, now); return why ? { error: why } : { ok: true, name }; }
      const r = dip.createFaction(nid, name, now);
      return r.error ? r : { ok: true, faction: r.faction, name };
    }
    case "invite": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      if (dip.faction(nid) === null) return { error: "found a faction first" };
      const r = dip.propose(nid, t.id, "faction_invite", now);
      return r.error ? r : { ok: true, proposal: r.proposal.id, to: t.id, kind: "faction_invite" };
    }
    case "quit": {
      const why = dip.leave(nid, now);
      return why ? { error: why } : { ok: true };
    }
    case "expel": {
      const { t, error } = target(world, nid, m);
      if (error) return { error };
      const fid = dip.faction(nid);
      if (fid === null || dip.factions.get(fid).leader !== nid) return { error: "only the faction leader can expel" };
      if (dip.faction(t.id) !== fid) return { error: `${t.name} is not in your faction` };
      const why = dip.leave(t.id, now, nid);
      return why ? { error: why } : { ok: true };
    }
    default:
      return { error: "the order is war, propose, accept, decline, withdraw, leave, break, embargo, faction, invite, quit, expel or rename" };
  }
}
