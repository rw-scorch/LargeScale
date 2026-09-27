import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installOvertime, ringOf } from "../src/sim/overtime.js";
import { cleanSchedule, phaseAt, countdown, SCHEDULE_RULES } from "../src/shared/schedule.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

const H = 3600000, now = Date.UTC(2026, 8, 27, 12);

test("a schedule keeps its events in order, within 60 days, and overtime shrinks every 30 s to an hour", () => {
  const r = cleanSchedule({ startAt: now + H, peaceUntil: now + 2 * H, overtimeAt: now + 5 * H, endAt: now + 6 * H }, now, rules.schedule);
  assert.deepEqual(r.schedule, { startAt: now + H, peaceUntil: now + 2 * H, overtimeAt: now + 5 * H, endAt: now + 6 * H, shrinkEvery: 120 });
  assert.equal(cleanSchedule({ peaceUntil: now + 2 * H, overtimeAt: now + H }, now, rules.schedule).error, "overtime begins must come after peace ends");
  assert.equal(cleanSchedule({ endAt: now + 61 * 24 * H }, now, rules.schedule).error, "the world ends: at most 60 days ahead");
  assert.equal(cleanSchedule({ startAt: "soon" }, now, rules.schedule).error, "the world starts: pick a date and time");
  assert.match(cleanSchedule({ shrinkEvery: 5 }, now, rules.schedule).error, /every 30 to 3600 seconds/);
  const kept = cleanSchedule({ endAt: now + 9 * H }, now, rules.schedule, r.schedule).schedule;
  assert.deepEqual([kept.startAt, kept.overtimeAt, kept.endAt], [now + H, now + 5 * H, now + 9 * H], "fields left out stay as they were");
  assert.equal(cleanSchedule({ startAt: null }, now, rules.schedule, r.schedule).schedule.startAt, null, "null clears an event");
  assert.deepEqual(SCHEDULE_RULES, { ...rules.schedule }, "the client's copy matches rules.json");
});

test("the phase says whether the world waits, is at peace, is in overtime or is over, and what comes next", () => {
  const s = { startAt: now + H, peaceUntil: now + 2 * H, overtimeAt: now + 5 * H, endAt: now + 6 * H };
  assert.deepEqual(phaseAt(s, now), { waiting: true, peace: true, overtime: false, over: false, next: { key: "startAt", at: now + H, name: "The world starts" } });
  assert.deepEqual(phaseAt(s, now + 3 * H).next.key, "overtimeAt");
  assert.deepEqual([phaseAt(s, now + 3 * H).peace, phaseAt(s, now + 5 * H).overtime, phaseAt(s, now + 6 * H).over, phaseAt(s, now + 6 * H).next], [false, true, true, null]);
  assert.deepEqual(phaseAt({}, now), { waiting: false, peace: false, overtime: false, over: false, next: null });
  assert.deepEqual([countdown(59000), countdown(61000), countdown(2 * H + 60000), countdown(50 * H)], ["59 s", "1 min 1 s", "2 h 1 min", "2 d 2 h"]);
});

function field() {
  const W = 50, Hh = 30, terrain = new Uint8Array(W * Hh).fill(TID.grassland);
  const w = new World({ w: W, h: Hh, terrain }, { spawnRadius: 2 });
  const ot = installOvertime(w, { every: 10 });
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 15);
  w.spawn(b, 40, 15);
  for (let y = 10; y <= 20; y++) for (let x = 5; x <= 15; x++) w.claim(g.idx(x, y), a);
  return { w, g, a, b, ot };
}

test("overtime takes every nation's outer ring of land every few seconds, never a capital, and blames nobody", () => {
  const { w, a, b, ot } = field();
  const before = [w.nations.get(a).plots, w.nations.get(b).plots];
  for (let t = 0; t < 30; t++) w.tick(1);
  assert.deepEqual([w.nations.get(a).plots, w.nations.get(b).plots], before, "nothing happens before overtime");
  ot.on = true;
  w.events.length = 0;
  const bRing = [...w.borderOf(b)].filter(i => i !== w.nations.get(b).capital).length;
  for (let t = 0; t < 10; t++) w.tick(1);
  assert.deepEqual([w.nations.get(a).plots, w.nations.get(b).plots], [81, before[1] - bRing], `the 11 by 11 square loses its 40-plot ring, and B its ${bRing}`);
  assert.equal(w.events.filter(e => e.type === "overtime_shrink").length, 1);
  assert.equal(w.events.filter(e => e.type === "plot_lost").length, 0, "no one is told another nation took the land");
  for (let t = 0; t < 200; t++) w.tick(1);
  for (const id of [a, b]) {
    const n = w.nations.get(id);
    assert.ok(n.alive && n.plots === 1 && w.owner[n.capital] === id, `${n.name} is down to its capital and still alive`);
  }
});

test("a big shrink is spread over ticks", () => {
  const { w, g, a, ot } = field();
  ot.perTick = 10;
  ot.on = true;
  for (let t = 0; t < 9; t++) w.tick(1);
  const total = () => w.nations.get(a).plots + w.nations.get(2).plots, plots = total();
  w.tick(1);
  assert.equal(plots - total(), 10, "ten plots in the first tick");
  for (let t = 0; t < 5; t++) w.tick(0.1);
  assert.equal(w.nations.get(a).plots, 81, "the rest over the next ticks");
  assert.equal(ringOf(w).length % 2, 0);
});
