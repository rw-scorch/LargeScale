export const KINDS = ["attack", "missile", "war", "message", "eliminated", "world", "digest"];
export const DEFAULT_PREFS = { attack: true, missile: true, war: true, message: true, eliminated: true, world: true, digest: false, quietFrom: null, quietTo: null };

export function prefsFor(row) {
  return { ...DEFAULT_PREFS, ...(row ?? {}) };
}

export function inQuietHours(prefs, date = new Date()) {
  const { quietFrom, quietTo } = prefs;
  if (quietFrom === null || quietTo === null) return false;
  const h = date.getUTCHours();
  return quietFrom <= quietTo ? h >= quietFrom && h < quietTo : h >= quietFrom || h < quietTo;
}

export function wants(prefs, kind, date) {
  if (kind === "missile") return prefs.missile !== false;
  if (!prefs[kind]) return false;
  return !inQuietHours(prefs, date);
}

export class NotifyQueue {
  constructor(rules = {}) {
    this.rules = { batchSeconds: 60, perKindCooldown: 300, maxLines: 12, ...rules };
    this.pending = new Map();
    this.lastSent = new Map();
  }

  add(target, kind, text, now) {
    const key = `${target}:${kind}`;
    if (!this.pending.has(target)) this.pending.set(target, []);
    const lines = this.pending.get(target);
    const same = lines.find(l => l.kind === kind);
    if (same) {
      same.count += 1;
      same.text = text;
      return "merged";
    }
    const last = this.lastSent.get(key) ?? -Infinity;
    const cooled = kind === "missile" ? now : Math.max(now, last + this.rules.perKindCooldown - this.rules.batchSeconds);
    lines.push({ kind, text, count: 1, at: cooled });
    return "queued";
  }

  dueAt() {
    let soonest = Infinity;
    for (const lines of this.pending.values()) for (const l of lines) {
      const wait = l.kind === "missile" ? 0 : this.rules.batchSeconds;
      soonest = Math.min(soonest, l.at + wait);
    }
    return soonest === Infinity ? null : soonest;
  }

  take(now) {
    const out = [];
    for (const [target, lines] of [...this.pending]) {
      const ready = lines.filter(l => now >= l.at + (l.kind === "missile" ? 0 : this.rules.batchSeconds));
      if (!ready.length) continue;
      const rest = lines.filter(l => !ready.includes(l));
      if (rest.length) this.pending.set(target, rest); else this.pending.delete(target);
      for (const l of ready) this.lastSent.set(`${target}:${l.kind}`, now);
      out.push({ target, lines: ready.slice(0, this.rules.maxLines), more: Math.max(0, ready.length - this.rules.maxLines) });
    }
    return out;
  }
}

export function formatBatch(worldName, batch) {
  const head = `**${worldName}**`;
  const body = batch.lines.map(l => (l.count > 1 ? `${l.text} (x${l.count})` : l.text)).join("\n");
  const tail = batch.more ? `\n…and ${batch.more} more` : "";
  return `${head}\n${body}${tail}`;
}
