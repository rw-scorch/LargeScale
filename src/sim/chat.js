export const CHAT = { maxLength: 280, burst: 5, refillPerSec: 0.5, historyPerChannel: 200, typingTtl: 4 };

export class TokenBucket {
  constructor(burst, refill) { this.burst = burst; this.refill = refill; this.tokens = burst; this.at = 0; }
  take(now) {
    this.tokens = Math.min(this.burst, this.tokens + (now - this.at) * this.refill);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export function cleanText(s, max = CHAT.maxLength) {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return [...t].slice(0, max).join("");
}

export function channelFor(msg, sender, dip) {
  if (msg.channel === "global") return { kind: "global", key: "global" };
  if (msg.channel === "faction") {
    const f = dip?.faction(sender);
    return f === null || f === undefined ? null : { kind: "faction", key: `f${f}` };
  }
  if (msg.channel === "private") {
    const to = Number(msg.to);
    if (!Number.isInteger(to) || to === sender) return null;
    return { kind: "private", key: sender < to ? `p${sender}-${to}` : `p${to}-${sender}`, to };
  }
  return null;
}

export function recipients(ch, sender, nations, dip) {
  if (ch.kind === "global") return nations.filter(n => n.human).map(n => n.id);
  if (ch.kind === "faction") return dip.membersOf(dip.faction(sender));
  return [sender, ch.to];
}

export class ChatHub {
  constructor(rules = CHAT) { this.rules = rules; this.buckets = new Map(); this.history = new Map(); this.typing = new Map(); this.next = 1; }
  post(sender, raw, now, nations, dip) {
    const text = cleanText(raw.text, this.rules.maxLength);
    if (!text) return { error: "empty message" };
    const ch = channelFor(raw, sender, dip);
    if (!ch) return { error: "no such channel" };
    if (!this.buckets.has(sender)) this.buckets.set(sender, new TokenBucket(this.rules.burst, this.rules.refillPerSec));
    if (!this.buckets.get(sender).take(now)) return { error: "slow down" };
    const m = { id: this.next++, ch: ch.key, from: sender, text, t: now };
    const h = this.history.get(ch.key) ?? [];
    h.push(m);
    if (h.length > this.rules.historyPerChannel) h.shift();
    this.history.set(ch.key, h);
    this.typing.delete(`${ch.key}:${sender}`);
    return { message: m, to: recipients(ch, sender, nations, dip) };
  }
  setTyping(sender, raw, now, dip) {
    const ch = channelFor(raw, sender, dip);
    if (!ch) return null;
    this.typing.set(`${ch.key}:${sender}`, now + this.rules.typingTtl);
    return ch.key;
  }
  whoIsTyping(key, now) {
    const out = [];
    for (const [k, until] of this.typing) {
      if (until < now) { this.typing.delete(k); continue; }
      const [ch, who] = k.split(":");
      if (ch === key) out.push(Number(who));
    }
    return out;
  }
}
