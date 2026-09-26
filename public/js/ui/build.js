import { el } from "./dom.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";

const ZONE_TOOLS = [["res", "Residential", "Homes. Huts go up while people want them."], ["com", "Commercial", "Shops and stalls give jobs."], ["ind", "Industrial", "Workshops, from the Medieval era."], ["none", "Erase", "Removes zoning. Buildings stay."]];

const CATEGORY_NAMES = { resources: "Resources", farming: "Farming", civic: "Civic", military: "Military", infrastructure: "Storage", transport: "Water", industry: "Industry" };

export const costText = cost => Object.entries(cost).map(([k, v]) => `${v} ${k === "money" ? "gold" : k}`).join(", ");

function laterNote(w, z) {
  const era = eraIdx(w.purse?.era ?? "T");
  const types = Object.values(w.defs.table).filter(d => d.civilian && d.zone === z && eraIdx(d.era) <= era).sort((a, b) => eraIdx(a.era) - eraIdx(b.era));
  if (!types.length || types.some(d => !w.lockOf(d.id))) return null;
  const node = w.locks.nodes.get(w.locks.buildings.get(types[0].id));
  return node ? `${types[0].name}s need ${node.name} research. Zone now; they go up once it is done.` : null;
}

export function createBuildMenu(root, game) {
  const tabs = el("div", { class: "row wrap tabs" });
  const list = el("div", { class: "build-list" });
  const box = el("section", { id: "build-menu", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Build" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleBuildMenu(false) })),
    tabs, list);
  root.append(box);
  let tab = null, key = "";

  const cap = t => t && t[0].toUpperCase() + t.slice(1);
  const why = (w, def) => {
    const era = w.purse?.era ?? "T";
    if (eraIdx(def.era) > eraIdx(era)) return `Needs the ${ERA_NAMES[def.era]} era`;
    return cap(w.lockOf(def.id)) ?? w.costError(def.id);
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; key = ""; },
    update() {
      const w = game.world;
      if (box.hidden || !w?.defs) return;
      const defs = Object.values(w.defs.table).filter(d => !d.civilian);
      const cats = ["zones", ...new Set(defs.map(d => d.category))];
      tab ??= "zones";
      const rows = defs.filter(d => d.category === tab).sort((a, b) => eraIdx(a.era) - eraIdx(b.era) || a.num - b.num);
      const k = `${tab}:${game.building}:${game.zoning}:${rows.map(d => why(w, d)).join("|")}:${[...w.known()].join()}`;
      if (k === key) return;
      key = k;
      tabs.replaceChildren(...cats.map(c => el("button", { class: c === tab ? "on" : "", text: c === "zones" ? "Zones" : CATEGORY_NAMES[c] ?? c, onclick: () => { tab = c; key = ""; this.update(); } })));
      if (tab === "zones") {
        list.replaceChildren(...ZONE_TOOLS.map(([z, name, text]) => {
          const locked = z !== "none" && cap(w.lockOf(z, "zones"));
          const later = !locked && z !== "none" && laterNote(w, z);
          return el("button", { class: `build-item${game.zoning === z ? " on" : ""}`, "data-zone": z, disabled: !!locked, onclick: () => game.startZone(z) },
            el("b", { text: name }), el("span", { class: "muted", text }), locked ? el("span", { class: "why", text: locked }) : null, later ? el("span", { class: "why", text: later }) : null);
        }),
          el("p", { class: "muted", text: "Drag over your land to paint. Up to 64 by 64 plots at a time." }));
        return;
      }
      list.replaceChildren(...rows.map(d => {
        const reason = why(w, d);
        return el("button", { class: `build-item${game.building === d.id ? " on" : ""}`, "data-type": d.id, title: d.description ?? "", disabled: !!reason, onclick: () => game.startBuild(d.id) },
          el("span", { class: "row spread" }, el("b", { text: d.name }), el("span", { class: "muted", text: `${d.time} s` })),
          d.description ? el("span", { class: "desc", text: d.description }) : null,
          el("span", { class: "muted", text: `${costText(d.cost)}, ${d.footprint[0]} by ${d.footprint[1]}` }),
          d.producer ? el("span", { class: "muted", text: `Makes ${d.producer.rate} ${d.producer.out ?? "ore"} a second${d.producer.kind === "farm" ? " times fertility and season" : ""}, ${d.jobs} workers` }) : null,
          reason ? el("span", { class: "why", text: reason }) : null);
      }));
    },
  };
}
