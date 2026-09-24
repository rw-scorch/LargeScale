import { el, fmt } from "./dom.js";

export function createNations(root, game) {
  const rows = el("tbody");
  const small = matchMedia("(max-height: 500px)").matches;
  const box = el("section", { id: "nations", class: `panel left${small ? " shut" : ""}` },
    el("button", { class: "ghost title", text: "Nations", onclick: () => box.classList.toggle("shut") }),
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "" }), el("th", { text: "Nation" }), el("th", { text: "Plots" }), el("th", { text: "Troops" }))), rows));
  root.append(box);
  return {
    update() {
      const w = game.world;
      if (!w || box.classList.contains("shut")) return;
      const all = [...w.nations.values()].filter(n => n.spawned || !n.bot).sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0));
      const top = all.slice(0, 12);
      const me = w.nations.get(w.you);
      if (me && !top.includes(me)) top.push(me);
      rows.replaceChildren(...top.map(n => el("tr", { class: `${n.id === w.you ? "me" : ""} ${n.alive === false ? "dead" : ""}` },
        el("td", {}, el("i", { class: "swatch", style: `background:${n.colour}` })),
        el("td", { text: `${n.name}${n.bot ? "" : " *"}` }),
        el("td", { text: fmt(n.plots ?? 0) }),
        el("td", { text: fmt(n.troops ?? 0) }))));
    },
  };
}
