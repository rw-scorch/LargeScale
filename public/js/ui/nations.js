import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { isLand } from "../shared/terrain.js";

const SHOW = 8;

export function createNations(root, game) {
  const rows = el("tbody");
  const small = matchMedia("(max-height: 500px)").matches;
  let bots = !!game.prefs?.bots, land = 0;
  const botButton = el("button", { id: "nations-bots", class: `chip${bots ? " on" : ""}`, title: "show bots too", text: "Bots", onclick: () => { api.bots = !bots; } });
  const fold = el("button", { class: "ghost title", onclick: () => { box.classList.toggle("shut"); last = ""; } }, icon("ui_trophy", 1), " Nations");
  const box = el("section", { id: "nations", class: `panel${small ? " shut" : ""}` },
    el("div", { class: "row spread title-row" }, fold, botButton),
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "#" }), el("th", { text: "Nation" }), el("th", { text: "" }), el("th", { text: "Land" }), el("th", { text: "Troops" }))), rows));
  root.append(box);
  let last = "";
  const api = {
    get bots() { return bots; },
    set bots(v) { bots = !!v; botButton.classList.toggle("on", bots); last = ""; },
    update() {
      const w = game.world;
      if (!w?.ready || box.classList.contains("shut")) return;
      if (!land) for (let i = 0; i < w.terrain.length; i++) if (isLand(w.terrain[i])) land++;
      const ranked = [...w.nations.values()].filter(n => n.spawned).sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0));
      const rank = new Map(ranked.map((n, i) => [n.id, i + 1]));
      const listed = [...w.nations.values()].filter(n => (n.spawned || !n.bot) && (bots || !n.bot || n.id === w.you)).sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0));
      const top = listed.slice(0, bots ? SHOW * 2 : SHOW);
      const me = w.nations.get(w.you);
      if (me && !top.includes(me)) top.push(me);
      const share = n => { const s = land ? ((n.plots ?? 0) / land) * 100 : 0; return `${s >= 10 ? s.toFixed(0) : s >= 0.1 ? s.toFixed(1) : s.toFixed(2)}%`; };
      const sig = top.map(n => `${n.id}:${rank.get(n.id)}:${n.plots}:${fmt(n.troops ?? 0)}:${n.era}:${n.alive}:${w.online?.has(n.id)}`).join();
      if (sig === last) return;
      last = sig;
      rows.replaceChildren(...top.map(n => el("tr", { class: `${n.id === w.you ? "me" : ""} ${n.alive === false ? "dead" : ""}`, "data-nation": n.id, onclick: () => { if (n.capital != null) game.focus(n.capital, Math.max(game.view.cam.scale / game.view.ratio, 3)); if (n.id !== w.you) game.selectNation(n.id); } },
        el("td", { class: "rank", text: rank.has(n.id) ? String(rank.get(n.id)) : "" }),
        el("td", { class: "who" }, el("i", { class: "swatch", style: `background:${n.colour}` }), n.bot ? null : el("i", { class: `dot ${w.online?.has(n.id) ? "on" : "off"}`, title: w.online?.has(n.id) ? "online now" : "away" }), el("span", { class: "name", text: n.name, title: n.name })),
        el("td", {}, n.spawned ? icon(`era_badge_${n.era ?? "T"}`, 1) : null),
        el("td", { text: n.spawned ? share(n) : "" }),
        el("td", { text: fmt(n.troops ?? 0) }))));
    },
  };
  return api;
}
