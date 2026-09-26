import { el } from "./dom.js";
import { icon } from "./icons.js";
import { ERA_NAMES } from "../shared/buildings.js";

const num = v => Math.round(v).toLocaleString("en-GB");
const signed = v => `${v < 0 ? "-" : "+"}${num(Math.abs(v))}`;
const cap = t => t && t[0].toUpperCase() + t.slice(1);
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? "" : word.endsWith("s") ? "es" : "s"}`;
const RES_ICON = { gold: "res_money", concrete: "res_stone" };

export const span = s => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.round((s % 3600) / 60);
  if (d) return `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} h` : ""}`;
  if (h) return `${h} h${m ? ` ${m} min` : ""}`;
  return s < 60 ? `${Math.round(s)} s` : `${m} min`;
};

export function awayLines(w, s) {
  const lines = [], name = id => w.nations.get(Number(id))?.name ?? "someone";
  const nodeName = id => w.tech.nodes.find(n => n.id === id)?.name ?? id;
  const bName = id => (w.defs.table[id]?.name ?? id).toLowerCase(), uName = id => (w.unitTypes[id]?.name ?? id).toLowerCase();
  const counted = (map, nameOf) => Object.entries(map).map(([k, v]) => `${num(v)} ${nameOf(k)}${v === 1 ? "" : "s"}`).join(", ");
  const add = (ic, text, tone = "") => lines.push({ icon: ic, text, tone });
  if (s.eliminated) add("alert_attack", "Your nation was eliminated.", "bad");
  const stock = Object.entries(s.stock ?? {}).filter(([, v]) => v).map(([k, v]) => `${cap(k)} ${signed(v)}`);
  add("res_money", `Gold ${signed(s.gold)}${stock.length ? `. ${stock.join(", ")}` : ""}`, s.gold >= 0 ? "good" : "bad");
  if (s.pop[0] || s.pop[1]) add("ui_score_pop", `People ${num(s.pop[0])} to ${num(s.pop[1])}`, s.pop[1] >= s.pop[0] ? "good" : "bad");
  if (s.town || s.upgraded) add("alert_built", `Your towns started ${plural(s.town, "building")}${s.upgraded ? ` and upgraded ${num(s.upgraded)}` : ""}`);
  if (Object.keys(s.built).length) add("alert_built", `Finished: ${counted(s.built, bName)}`);
  if (Object.keys(s.machines).length) add("ui_army", `Built: ${counted(s.machines, uName)}`);
  if (s.researched.length) add("alert_research_done", `Research done: ${s.researched.map(nodeName).join(", ")}`, "good");
  if (s.era[1] !== s.era[0]) add(`era_badge_${s.era[1]}`, `You reached the ${ERA_NAMES[s.era[1]] ?? s.era[1]} era`, "good");
  if (s.troops[1] !== s.troops[0]) add("res_troops", `Troops at home ${num(s.troops[0])} to ${num(s.troops[1])}`);
  const lost = Object.entries(s.lost);
  if (s.plots[1] !== s.plots[0] || lost.length) add("ui_score_plots", `Land ${num(s.plots[0])} to ${num(s.plots[1])} plots`, s.plots[1] < s.plots[0] ? "bad" : "");
  for (const [by, n] of lost.sort((a, b) => b[1] - a[1])) add("alert_attack", `${name(by)} took ${plural(n, "plot")}`, "bad");
  if (s.stacksLost) add("alert_attack", `${plural(s.stacksLost, "stack")} destroyed`, "bad");
  if (Object.keys(s.machinesLost).length) add("alert_attack", `Machines lost: ${counted(s.machinesLost, uName)}`, "bad");
  if (s.capitalMoved) add("alert_attack", "Your capital moved after the old one fell", "bad");
  if (s.depleted) add("res_stone", `${plural(s.depleted, "deposit")} ran out`);
  return lines;
}

export function createAwayPanel(root, game) {
  const title = el("b", { class: "title" });
  const when = el("p", { id: "away-when", class: "muted" });
  const list = el("div", { id: "away-list", class: "away-list" });
  const note = el("p", { id: "away-note", class: "muted" });
  const box = el("section", { id: "away-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("span", { class: "row" }, icon("alert_offline", 1), title), el("button", { class: "ghost", text: "Close", onclick: () => api.show(false) })),
    when, list, note,
    el("div", { class: "row" }, el("button", { id: "away-ok", class: "primary", text: "Back to the game", onclick: () => api.show(false) })));
  root.append(box);

  const api = {
    open: false,
    last: null,
    show(on) {
      this.open = !!on;
      box.hidden = !on;
    },
    summary(s) {
      const w = game.world;
      if (!w) return;
      this.last = s;
      title.textContent = `While you were away (${span(s.seconds)})`;
      when.textContent = s.caught
        ? `The world slept while nobody played, and caught up ${span(s.caught)} of towns, farms, mines and research when you came back.${s.dropped ? ` Catch-up stops at 72 hours, so ${span(s.dropped)} more did not count.` : ""}`
        : "The world kept running while you were gone.";
      const lines = awayLines(w, s);
      list.replaceChildren(...lines.map(l => el("p", { class: `away-line ${l.tone}` }, icon(l.icon, 1), el("span", { text: l.text }))));
      note.textContent = `While you are away your nation makes ${Math.round(s.share * 100)}% of its usual gold, goods and research${s.defence ? `, and your land defends at ${Math.round(s.defence * 100)}%` : ""}.`;
      game.feed?.push({ key: "away", text: `Welcome back. ${lines.slice(0, 2).map(l => l.text).join(". ")}.`, tone: "good" });
      this.show(true);
    },
    update() {},
  };
  return api;
}
