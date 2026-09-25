import { el } from "./dom.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";

const CATEGORY_NAMES = { civic: "Civic", military: "Military", infrastructure: "Storage", transport: "Water", industry: "Industry" };

export const costText = cost => Object.entries(cost).map(([k, v]) => `${v} ${k === "money" ? "gold" : k}`).join(", ");

export function createBuildMenu(root, game) {
  const tabs = el("div", { class: "row wrap tabs" });
  const list = el("div", { class: "build-list" });
  const box = el("section", { id: "build-menu", class: "panel topright", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Build" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleBuildMenu(false) })),
    tabs, list);
  root.append(box);
  let tab = null, key = "";

  const why = (w, def) => {
    const era = w.purse?.era ?? "T";
    if (eraIdx(def.era) > eraIdx(era)) return `Needs the ${ERA_NAMES[def.era]} era`;
    return w.costError(def.id);
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; key = ""; },
    update() {
      const w = game.world;
      if (box.hidden || !w?.defs) return;
      const defs = Object.values(w.defs.table).filter(d => !d.civilian);
      const cats = [...new Set(defs.map(d => d.category))];
      tab ??= cats[0];
      const rows = defs.filter(d => d.category === tab).sort((a, b) => eraIdx(a.era) - eraIdx(b.era) || a.num - b.num);
      const k = `${tab}:${game.building}:${rows.map(d => why(w, d)).join("|")}`;
      if (k === key) return;
      key = k;
      tabs.replaceChildren(...cats.map(c => el("button", { class: c === tab ? "on" : "", text: CATEGORY_NAMES[c] ?? c, onclick: () => { tab = c; key = ""; this.update(); } })));
      list.replaceChildren(...rows.map(d => {
        const reason = why(w, d);
        return el("button", { class: `build-item${game.building === d.id ? " on" : ""}`, "data-type": d.id, disabled: !!reason, onclick: () => game.startBuild(d.id) },
          el("span", { class: "row spread" }, el("b", { text: d.name }), el("span", { class: "muted", text: `${d.time} s` })),
          el("span", { class: "muted", text: `${costText(d.cost)}, ${d.footprint[0]} by ${d.footprint[1]}` }),
          reason ? el("span", { class: "why", text: reason }) : null);
      }));
    },
  };
}
