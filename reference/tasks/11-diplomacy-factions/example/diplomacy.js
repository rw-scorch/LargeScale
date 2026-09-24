export const DIPLO = {
  warNotice: 300,
  proposalLife: 600,
  betrayalCooldown: 900,
  peaceMinWar: 600,
  maxFactionSize: 4,
  factionDefends: true,
};

const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class Diplomacy {
  constructor(rules = {}) {
    this.rules = { ...DIPLO, ...rules };
    this.rel = new Map();
    this.embargo = new Set();
    this.proposals = new Map();
    this.factions = new Map();
    this.memberOf = new Map();
    this.next = 1;
    this.log = [];
  }

  get(a, b) {
    const k = key(a, b);
    if (!this.rel.has(k)) this.rel.set(k, { status: "peace", since: 0, treatyUntil: 0, noWarUntil: 0, pendingAt: 0 });
    return this.rel.get(k);
  }

  faction(a) { return this.memberOf.get(a) ?? null; }
  sameFaction(a, b) { const f = this.faction(a); return f !== null && f === this.faction(b); }

  status(a, b, now) {
    if (a === b || this.sameFaction(a, b)) return "alliance";
    const r = this.get(a, b);
    if (r.status === "war_pending" && now >= r.pendingAt) { r.status = "war"; r.since = r.pendingAt; this.log.push({ t: now, type: "war_started", a, b }); }
    return r.status;
  }

  hostile(a, b, now) { return this.status(a, b, now) === "war"; }
  passable(a, b, now) { return this.status(a, b, now) === "alliance"; }
  sharesVision(a, b, now) { return this.status(a, b, now) === "alliance"; }
  blocksTransit(owner, traveller) { return this.embargo.has(`${owner}>${traveller}`); }

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
    return null;
  }

  propose(from, to, kind, now, terms = {}) {
    if (!["alliance", "peace", "non_aggression", "faction_invite"].includes(kind)) return { error: "unknown proposal" };
    const st = this.status(from, to, now);
    if (kind === "alliance" && st !== "peace") return { error: "make peace first" };
    if (kind === "peace" && st !== "war" && st !== "war_pending") return { error: "you are not at war" };
    if (kind === "peace" && st === "war" && now - this.get(from, to).since < this.rules.peaceMinWar) return { error: "the war is too young for peace talks" };
    if (kind === "non_aggression" && st !== "peace") return { error: "only possible in peace" };
    if (kind === "faction_invite") {
      const f = this.faction(from);
      if (f === null || this.factions.get(f).leader !== from) return { error: "only a faction leader can invite" };
      if (this.faction(to) !== null) return { error: "they are already in a faction" };
      if (this.factions.get(f).members.size >= this.rules.maxFactionSize) return { error: "faction is full" };
      if (st === "war" || st === "war_pending") return { error: "make peace first" };
    }
    const p = { id: this.next++, from, to, kind, terms, expires: now + this.rules.proposalLife };
    this.proposals.set(p.id, p);
    return { proposal: p };
  }

  accept(by, id, now) {
    const p = this.proposals.get(id);
    if (!p || p.to !== by) return "no such proposal";
    this.proposals.delete(id);
    if (now > p.expires) return "proposal expired";
    const r = this.get(p.from, p.to);
    if (p.kind === "alliance") { r.status = "alliance"; r.since = now; }
    if (p.kind === "peace") { r.status = "peace"; r.since = now; r.treatyUntil = now + 600; }
    if (p.kind === "non_aggression") r.treatyUntil = now + (p.terms.minutes ?? 60) * 60;
    if (p.kind === "faction_invite") return this.join(this.faction(p.from), by);
    this.log.push({ t: now, type: `${p.kind}_signed`, a: p.from, b: p.to });
    return null;
  }

  leaveAlliance(a, b, now) {
    const r = this.get(a, b);
    if (r.status !== "alliance") return "not allied";
    r.status = "peace";
    r.since = now;
    r.noWarUntil = now + this.rules.betrayalCooldown;
    return null;
  }

  breakTreaty(a, b, now) {
    const r = this.get(a, b);
    if (r.treatyUntil <= now) return "no treaty";
    r.treatyUntil = 0;
    r.noWarUntil = now + this.rules.betrayalCooldown;
    this.log.push({ t: now, type: "treaty_broken", a, b });
    return null;
  }

  setEmbargo(owner, target, on) {
    const k = `${owner}>${target}`;
    if (on) this.embargo.add(k); else this.embargo.delete(k);
  }

  createFaction(founder, name) {
    if (this.faction(founder) !== null) return { error: "already in a faction" };
    const id = this.next++;
    this.factions.set(id, { id, name, leader: founder, members: new Set([founder]) });
    this.memberOf.set(founder, id);
    return { faction: id };
  }

  membersOf(fid) { return [...(this.factions.get(fid)?.members ?? [])]; }

  join(fid, nation) {
    const f = this.factions.get(fid);
    if (!f) return "no such faction";
    if (f.members.size >= this.rules.maxFactionSize) return "faction is full";
    f.members.add(nation);
    this.memberOf.set(nation, fid);
    for (const m of f.members) if (m !== nation) { const r = this.get(m, nation); r.status = "peace"; r.pendingAt = 0; }
    return null;
  }

  leave(nation, now) {
    const fid = this.faction(nation);
    if (fid === null) return "not in a faction";
    const f = this.factions.get(fid);
    f.members.delete(nation);
    this.memberOf.delete(nation);
    for (const m of f.members) this.get(m, nation).noWarUntil = now + this.rules.betrayalCooldown;
    if (!f.members.size) this.factions.delete(fid);
    else if (f.leader === nation) f.leader = [...f.members][0];
    return null;
  }

  winnerKey(nation) { return this.faction(nation) ?? `n${nation}`; }

  expire(now) { for (const [id, p] of this.proposals) if (now > p.expires) this.proposals.delete(id); }
}

export function wireToWorld(world, dip) {
  world.hostile = (a, b) => dip.hostile(a, b, world.time);
  world.passable = (a, b) => dip.passable(a, b, world.time);
}
