import { el } from "./dom.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";
import { ROAD_NAMES } from "../shared/roads.js";

const ROAD_TOOLS = [["dirt", "Tracks anyone can lay from the start. Troops, machines and carts cross them faster."], ["cobble", "Faster than dirt. Needs Paved roads research and stone."], ["none", "Takes up your roads. Nothing is refunded."]];

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
  let tab = null, key = "", plan = null;

  const connectText = r => {
    if (!r) return "Plan first to see what it costs.";
    const parts = [`${r.stores} ${r.stores === 1 ? "store" : "stores"}, ${r.already} already on your roads.`];
    parts.push(r.plots ? `Linking ${r.joined} more takes ${r.plots} plots for ${costText(r.cost)}${r.bridges ? `, with ${r.bridges} bridge plots` : ""}.` : "Nothing more to lay.");
    if (r.unreachable) parts.push(`${r.unreachable} cannot be reached over your own land.`);
    return parts.join(" ");
  };

  const connectBox = w => {
    const r = w.roadRules, cobble = r.types.cobble, kind = cobble && !(cobble.needs && w.lockOf(cobble.needs)) ? "cobble" : "dirt";
    const auto = w.purse?.logistics?.autoRoads ?? null;
    const lay = el("button", { id: "connect-lay", class: "primary", text: "Lay them", hidden: !plan?.plots, onclick: async () => { const res = await game.connectStores(kind, false); plan = null; key = ""; if (res.ok) game.updatePanels(); } });
    const box = el("input", { id: "auto-roads", type: "checkbox", checked: !!auto });
    box.addEventListener("change", async () => {
      const res = await game.connectStores(kind, true, box.checked);
      if (!res.ok) { box.checked = !box.checked; return; }
      game.toast(box.checked ? `New stores will be linked to your roads with ${ROAD_NAMES[kind].toLowerCase()}s, paid as they are laid.` : "New stores are no longer linked by themselves.");
      plan = res;
      key = "";
    });
    return el("div", { id: "connect-box", class: "connect-box" },
      el("b", { text: "Connect stores" }),
      el("span", { class: "desc", text: `Lays ${ROAD_NAMES[kind].toLowerCase()}s from every store to your capital's roads along the cheapest way round buildings and water, so carts and armies move faster.` }),
      el("div", { class: "row wrap" }, el("button", { id: "connect-plan", text: "Plan the roads", onclick: async () => { const res = await game.connectStores(kind, true); if (res.ok) { plan = res; key = ""; game.updatePanels(); } } }), lay),
      el("span", { id: "connect-text", class: "muted", text: connectText(plan) }),
      el("label", { class: "row" }, box, el("span", { text: "Keep new stores connected: roads are laid and paid for by themselves." })));
  };


  const cap = t => t && t[0].toUpperCase() + t.slice(1);
  const why = (w, def) => {
    const era = w.purse?.era ?? "T";
    if (eraIdx(def.era) > eraIdx(era)) return `Needs the ${ERA_NAMES[def.era]} era`;
    return cap(w.lockOf(def.id)) ?? w.costError(def.id);
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; key = ""; },
    get tab() { return tab; },
    setTab(t) {
      const w = game.world;
      tab = t ?? Object.values(w?.defs.table ?? {}).find(d => !d.civilian && !w.lockOf(d.id))?.category ?? "zones";
      key = "";
      this.update();
    },
    update() {
      const w = game.world;
      if (box.hidden || !w?.defs) return;
      const defs = Object.values(w.defs.table).filter(d => !d.civilian);
      const cats = ["zones", ...(w.roadRules ? ["roads"] : []), ...new Set(defs.map(d => d.category))];
      tab ??= "zones";
      const rows = defs.filter(d => d.category === tab).sort((a, b) => eraIdx(a.era) - eraIdx(b.era) || a.num - b.num);
      const k = `${tab}:${game.building}:${game.zoning}:${game.roading}:${rows.map(d => why(w, d)).join("|")}:${[...w.known()].join()}:${w.purse?.logistics?.autoRoads}`;
      if (k === key) return;
      key = k;
      tabs.replaceChildren(...cats.map(c => el("button", { class: c === tab ? "on" : "", text: c === "zones" ? "Zones" : c === "roads" ? "Roads" : CATEGORY_NAMES[c] ?? c, onclick: () => { tab = c; key = ""; this.update(); } })));
      if (tab === "roads") {
        const r = w.roadRules, scale = r.scale ?? 1;
        list.replaceChildren(...ROAD_TOOLS.map(([kind, text]) => {
          const t = r.types[kind], locked = t?.needs && cap(w.lockOf(t.needs));
          const cost = t ? costText(Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, +(v / scale).toFixed(2)]))) : null;
          return el("button", { class: `build-item${game.roading === kind ? " on" : ""}`, "data-road": kind, disabled: !!locked, onclick: () => game.startRoad(kind) },
            el("span", { class: "row spread" }, el("b", { text: kind === "none" ? "Remove road" : ROAD_NAMES[kind] }), cost ? el("span", { class: "muted", text: `${cost} a plot` }) : null),
            el("span", { class: "desc", text }), locked ? el("span", { class: "why", text: locked }) : null);
        }),
          el("p", { class: "muted", text: `Click where a road starts and where it ends, and it finds its own way; or drag to draw it. Bridges over rivers cost ${r.bridge} times as much, and roads on mountains ${r.rough} times. Roads stay when land changes hands.` }),
          connectBox(w));
        return;
      }
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
