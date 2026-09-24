export const STAT_RULES = {
  buildings: { cost: "costmap", time: [1, 36000], housing: [0, 100000], jobs: [0, 100000], hp: [1, 1e6], upkeep: [0, 1e5] },
  units: { attack: [0, 1000], defence: [0, 1000], hp: [1, 1e6], speed: [0.05, 50], range: [0, 500], capacity: [0, 100000], cost: "costmap" },
  terrain: { move: [0.1, 20], defence: [0.1, 10], capture: [0.1, 20], fertility: [0, 3] },
  combat: { lethality: [0.001, 1], holdBonus: [1, 3], ownLandBonus: [1, 3] },
  market: { elasticity: [0.1, 2], fee: [0, 0.5], reversionHours: [0.1, 168] },
};

export class StatStore {
  constructor(stats) { this.stats = structuredClone(stats); this.version = 1; this.audit = []; }

  check(table, id, field, value) {
    const rule = STAT_RULES[table]?.[field];
    if (!rule) return `${table}.${field} is not editable`;
    if (!(id in (this.stats[table] ?? {}))) return `${table}.${id} does not exist`;
    if (rule === "costmap") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return "cost must be an object";
      for (const [k, v] of Object.entries(value)) if (!/^[a-z_]{2,20}$/.test(k) || !(typeof v === "number" && v >= 0 && v <= 1e7)) return `bad cost entry ${k}`;
      return null;
    }
    if (!(typeof value === "number" && Number.isFinite(value) && value >= rule[0] && value <= rule[1])) return `${field} must be between ${rule[0]} and ${rule[1]}`;
    return null;
  }

  apply(account, changes, now = Date.now()) {
    if (!account?.admin) return { error: "not allowed" };
    if (!Array.isArray(changes) || !changes.length || changes.length > 200) return { error: "send 1 to 200 changes" };
    const errors = changes.map(c => this.check(c.table, c.id, c.field, c.value)).map((e, i) => (e ? `#${i}: ${e}` : null)).filter(Boolean);
    if (errors.length) return { error: "rejected", errors };
    const before = [];
    for (const c of changes) {
      before.push({ ...c, value: structuredClone(this.stats[c.table][c.id][c.field]) });
      this.stats[c.table][c.id][c.field] = structuredClone(c.value);
    }
    this.version++;
    this.audit.push({ version: this.version, by: account.id, at: now, changes, before });
    return { version: this.version };
  }

  undo(account) {
    if (!account?.admin) return { error: "not allowed" };
    const last = this.audit.pop();
    if (!last) return { error: "nothing to undo" };
    for (const b of last.before) this.stats[b.table][b.id][b.field] = b.value;
    this.version++;
    return { version: this.version, undid: last.version };
  }

  diffSince(version) {
    return this.audit.filter(a => a.version > version).flatMap(a => a.changes);
  }
}
