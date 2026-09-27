import { el, fmt } from "./dom.js";
import { EVENTS, EVENT_NAMES, SCHEDULE_RULES, phaseAt, countdown } from "../shared/schedule.js";

const MAPS = { test: "Small test map", earth: "Whole Earth" };
const SHORT = { startAt: "Starts", peaceUntil: "Peace ends", overtimeAt: "Overtime", endAt: "Ends" };
const MEANS = {
  startAt: "Until then players can only pick where to start.",
  peaceUntil: "Until then players cannot attack each other. Bots can still be fought.",
  overtimeAt: "From then on every nation's outer ring of land turns unclaimed at a steady beat. Capitals are safe.",
  endAt: "Then the player with the most land wins.",
};
const TEST_RULES = { buildSpeed: "construction", produceSpeed: "production", researchSpeed: "research", trainSpeed: "training", sleepSpeed: "catch-up" };

export const when = t => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const toInput = t => (t == null ? "" : new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
const fromInput = v => (v ? new Date(v).getTime() : null);
const beat = s => (s % 60 ? countdown(s * 1000) : `${s / 60} min`);

export function nextLine(w, now) {
  if (!w || w.victory || w.ended) return null;
  const p = phaseAt(w.schedule, now);
  if (p.overtime) return { text: w.shrinkIn != null ? `Overtime: shrink in ${countdown((w.shrinkIn / (w.speed || 1)) * 1000)}` : "Overtime", tone: "danger", next: p.next };
  if (!p.next) return null;
  return { text: `${SHORT[p.next.key]} in ${countdown(p.next.at - now)}`, tone: p.waiting || p.peace ? "calm" : "warn", next: p.next };
}

export function phaseText(m) {
  if (m.key === "startAt") return ["The world has started. Orders are open.", "good"];
  if (m.key === "peaceUntil") return ["Peace is over: players can attack each other now.", "warn"];
  if (m.key === "overtimeAt") return [`Overtime has begun: every ${beat(m.shrinkEvery ?? SCHEDULE_RULES.shrinkEvery)} each nation's outer land turns unclaimed. Capitals are safe. Last player standing wins.`, "danger"];
  return ["The world has reached its end time.", "warn"];
}

export function createWorldInfo(root, game) {
  const title = el("b", { class: "title" });
  const events = el("div", { id: "info-schedule", class: "info-list" });
  const win = el("div", { id: "info-win", class: "info-list" });
  const settings = el("div", { id: "info-settings", class: "info-list" });
  const inputs = Object.fromEntries(EVENTS.map(k => [k, el("input", { id: `sched-${k}`, type: "datetime-local", oninput: () => { dirty = true; } })]));
  const every = el("input", { id: "sched-every", class: "small", type: "number", min: SCHEDULE_RULES.shrinkMin / 60, max: SCHEDULE_RULES.shrinkMax / 60, step: 0.5, oninput: () => { dirty = true; } });
  const note = el("p", { id: "sched-note", class: "muted" });
  let dirty = false, key = "", told = new Set(), seeded = null;

  const fill = () => {
    const s = game.world?.schedule ?? {};
    for (const k of EVENTS) inputs[k].value = toInput(s[k]);
    every.value = String((s.shrinkEvery ?? SCHEDULE_RULES.shrinkEvery) / 60);
    dirty = false;
  };
  const save = async () => {
    const schedule = Object.fromEntries(EVENTS.map(k => [k, fromInput(inputs[k].value)]));
    schedule.shrinkEvery = Math.round(Number(every.value) * 60);
    const r = await game.conn.request({ t: "admin", op: "schedule", schedule });
    if (!r.ok) return (note.textContent = r.error ?? "that did not work");
    note.textContent = "Saved. Everyone in the world sees the new times.";
    dirty = false;
  };
  const editor = game.admin ? el("section", { id: "sched-editor" },
    el("b", { text: "Change the schedule" }),
    el("span", { class: "muted", text: "Times are in your own time zone. Leave a time empty to skip that event." }),
    ...EVENTS.map(k => el("label", { class: "sched-row" }, el("span", { text: EVENT_NAMES[k] }), inputs[k],
      el("button", { class: "ghost", type: "button", "data-clear": k, text: "Clear", onclick: () => { inputs[k].value = ""; dirty = true; } }))),
    el("label", { class: "sched-row" }, el("span", { text: "Overtime shrinks every" }), el("span", { class: "row" }, every, el("span", { class: "muted", text: "minutes" }))),
    el("div", { class: "row" }, el("button", { id: "sched-save", class: "primary", text: "Save schedule", onclick: save }), el("button", { class: "ghost", text: "Undo changes", onclick: () => { fill(); note.textContent = ""; } })),
    note) : null;

  const box = el("section", { id: "info-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleInfo(false) })),
    el("div", { class: "admin-grid" },
      el("section", {}, el("b", { text: "Schedule" }), events),
      el("section", {}, el("b", { text: "How to win" }), win),
      el("section", {}, el("b", { text: "Settings" }), settings),
      editor));
  root.append(box);

  const line = (label, value, extra) => el("div", { class: "info-row" }, el("span", { class: "muted", text: label }), el("span", { text: value }), extra ?? null);

  function remind(w, now) {
    const s = w.schedule ?? {}, sig = JSON.stringify(s);
    const passed = (k, r) => s[k] != null && s[k] > now && s[k] - now <= r * 1000;
    if (sig !== seeded) {
      seeded = sig;
      told = new Set();
      for (const k of EVENTS) for (const r of SCHEDULE_RULES.remind) if (passed(k, r)) told.add(`${k}${r}`);
      return;
    }
    for (const k of EVENTS) for (const r of SCHEDULE_RULES.remind) {
      if (!passed(k, r) || told.has(`${k}${r}`)) continue;
      for (const q of SCHEDULE_RULES.remind) if (q >= r) told.add(`${k}${q}`);
      game.feed.push({ key: `remind${k}`, text: `${EVENT_NAMES[k]} in ${countdown(s[k] - now)}, at ${when(s[k])}. ${MEANS[k]}`, tone: k === "startAt" ? "info" : "warn" });
    }
  }

  return {
    get open() { return !box.hidden; },
    show(on) {
      box.hidden = !on;
      key = "";
      if (on) { fill(); note.textContent = ""; }
    },
    changed(m) {
      if (!box.hidden && !dirty) fill();
      const p = phaseAt(m.schedule, game.world.serverNow());
      game.feed.push({ key: "schedule", text: `${m.by} set the schedule.${p.next ? ` Next: ${p.next.name.toLowerCase()} ${when(p.next.at)}.` : " Nothing more is planned."}`, tone: "info" });
    },
    update() {
      const w = game.world;
      if (!w?.ready) return;
      const now = w.serverNow();
      remind(w, now);
      if (box.hidden) return;
      const s = w.schedule ?? {}, i = w.info ?? {}, speed = w.speed || 1;
      title.textContent = `World info: ${game.name}`;
      const sig = JSON.stringify([s, Math.floor(now / 1000), w.shrinkIn, speed, w.victory, w.ended, w.nations.size]);
      if (sig === key) return;
      key = sig;
      const any = EVENTS.some(k => s[k] != null);
      events.replaceChildren(...(any ? EVENTS.filter(k => s[k] != null).map(k => el("div", { class: `info-event${s[k] <= now ? " done" : ""}`, "data-event": k },
        el("div", { class: "row spread" }, el("b", { text: EVENT_NAMES[k] }), el("span", { class: s[k] <= now ? "muted" : "up", text: s[k] <= now ? "done" : `in ${countdown(s[k] - now)}` })),
        el("span", { text: when(s[k]) }),
        el("span", { class: "muted", text: MEANS[k] })))
        : [el("p", { class: "muted", text: "Nothing is scheduled. The world runs until one player is left." })]),
        ...(s.overtimeAt == null ? [] : [line("Overtime beat", `every ${beat(s.shrinkEvery ?? i.shrinkEvery ?? SCHEDULE_RULES.shrinkEvery)}${speed > 1 ? ` of game time (${speed}x now)` : ""}`)]));
      win.replaceChildren(...[
        el("p", { text: "Last player standing: take every other player's land. Bots do not count." }),
        s.endAt != null ? el("p", { text: `If more than one player is left at ${when(s.endAt)}, the one with the most land wins.` }) : null,
        s.overtimeAt != null ? el("p", { class: "muted", text: "Overtime makes everyone's border shrink, so holding back does not work: players have to fight for land." }) : null,
        w.victory ? el("p", { class: "up", text: w.victory.name ? `${w.victory.name} has won${w.victory.by === "time" ? " with the most land at the end time" : ""}.` : "Nobody was left standing." }) : null].filter(Boolean));
      const humans = [...w.nations.values()].filter(n => !n.bot), bots = w.nations.size - humans.length;
      const tests = Object.entries(i.rules ?? {}).filter(([k, v]) => TEST_RULES[k] && v !== 1).map(([k, v]) => `${TEST_RULES[k]} ${v}x`);
      const map = MAPS[i.map] ?? (i.crop && i.crop !== "custom" ? i.crop[0].toUpperCase() + i.crop.slice(1) : "A region of Earth");
      settings.replaceChildren(...[
        line("Map", `${map}, ${i.detail === "fine" ? "fine" : "normal"} detail`),
        line("Size", `${fmt(i.w ?? 0)} by ${fmt(i.h ?? 0)} plots, ${fmt(i.landPlots ?? 0)} of them land`),
        line("Players", `${humans.length} of 8, and ${bots} bots`),
        line("Speed", `${speed}x`),
        line("Away", `Players who are away defend at ${Math.round((i.offline?.defence ?? 0.95) * 100)}% and produce ${Math.round((i.offline?.output ?? 0.9) * 100)}%`),
        line("Catch-up", `up to ${i.maxCatchupHours ?? 72} hours while nobody is on`),
        tests.length ? line("Test speeds", tests.join(", ")) : null].filter(Boolean));
    },
  };
}
