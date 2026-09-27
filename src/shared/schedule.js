export const EVENTS = ["startAt", "peaceUntil", "overtimeAt", "endAt"];
export const EVENT_NAMES = { startAt: "The world starts", peaceUntil: "Peace ends", overtimeAt: "Overtime begins", endAt: "The world ends" };
export const SCHEDULE_RULES = { maxDays: 60, shrinkEvery: 120, shrinkMin: 30, shrinkMax: 3600, remind: [3600, 600, 60] };

export function cleanSchedule(input, now, rules = SCHEDULE_RULES, before = {}) {
  if (!input || typeof input !== "object") return { error: "send a schedule" };
  const out = {};
  for (const key of EVENTS) {
    const v = input[key] === undefined ? before[key] ?? null : input[key];
    if (v === null) { out[key] = null; continue; }
    if (!Number.isInteger(v) || v < 0) return { error: `${EVENT_NAMES[key].toLowerCase()}: pick a date and time` };
    if (v > now + rules.maxDays * 86400000) return { error: `${EVENT_NAMES[key].toLowerCase()}: at most ${rules.maxDays} days ahead` };
    out[key] = v;
  }
  const set = EVENTS.filter(k => out[k] !== null);
  for (let k = 1; k < set.length; k++) if (out[set[k]] <= out[set[k - 1]]) return { error: `${EVENT_NAMES[set[k]].toLowerCase()} must come after ${EVENT_NAMES[set[k - 1]].toLowerCase()}` };
  const every = input.shrinkEvery === undefined ? before.shrinkEvery ?? rules.shrinkEvery : input.shrinkEvery;
  if (!Number.isInteger(every) || every < rules.shrinkMin || every > rules.shrinkMax) return { error: `overtime shrinks every ${rules.shrinkMin} to ${rules.shrinkMax} seconds` };
  out.shrinkEvery = every;
  return { schedule: out };
}

export function phaseAt(schedule, now) {
  const s = schedule ?? {};
  const next = EVENTS.filter(k => s[k] != null && s[k] > now).sort((a, b) => s[a] - s[b])[0] ?? null;
  return {
    waiting: s.startAt != null && now < s.startAt,
    peace: s.peaceUntil != null && now < s.peaceUntil,
    overtime: s.overtimeAt != null && now >= s.overtimeAt,
    over: s.endAt != null && now >= s.endAt,
    next: next ? { key: next, at: s[next], name: EVENT_NAMES[next] } : null,
  };
}

export function countdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}
