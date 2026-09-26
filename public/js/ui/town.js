import { el, fmt } from "./dom.js";

const pct = v => `${Math.round((v ?? 0) * 100)}%`;
const secs = s => (s < 90 ? `about ${Math.max(1, Math.round(s))} s` : `about ${Math.round(s / 60)} min`);

function bar(label) {
  const fill = el("span", { class: "fill" });
  const text = el("span", { class: "muted" });
  const row = el("div", { class: "demand" }, el("span", { class: "label", text: label }), el("span", { class: "bar" }, fill), text);
  return {
    row,
    set(v, words) {
      const k = Math.max(-1, Math.min(1, v));
      fill.style.width = `${Math.abs(k) * 50}%`;
      fill.style.left = k >= 0 ? "50%" : `${50 - Math.abs(k) * 50}%`;
      fill.className = `fill ${k > 0 ? "up" : "down"}`;
      text.textContent = words;
    },
  };
}

export function nodeFor(w, building) {
  const id = w.locks?.buildings.get(building);
  return id && !w.known().has(id) ? w.locks.nodes.get(id) : null;
}

export function nextStep(w) {
  const p = w.purse, t = p?.town, r = p?.research;
  if (!t) return null;
  const known = w.known(), [res, com] = t.zoned ?? [0, 0];
  const researching = id => {
    const node = w.locks.nodes.get(id);
    if (r?.current === id && r.rate > 0) return `${node.name} research is under way, ${secs((node.cost - r.progress) / r.rate)} left`;
    return r?.queue.includes(id) ? `${node.name} is in your research queue` : `queue ${node.name} in Research (U)`;
  };
  const mine = type => [...w.buildings.values()].some(b => b.owner === w.you && b.type === type && b.state !== "rubble");
  if (!res) return "Zone homes next to your capital: Build (B), Zones, Residential, then drag over your land.";
  const hut = nodeFor(w, "hut_grass");
  if (hut) return `Homes need ${hut.name}: ${researching(hut.id)}. Huts go up on your zones as soon as it is done.`;
  if (!t.housing && (p.stock.wood ?? 0) < 4) return "Huts cost 4 wood each. Your chieftain hut gathers a little; a Woodcutter camp near forest gathers more.";
  if (!t.housing) return "Huts are going up on your home zones. People move in when they finish.";
  if (t.foodCap < 1 || (t.foodUse > 0 && (p.stock.food ?? 0) / t.foodUse < 300)) {
    const fish = nodeFor(w, "fishing_hut"), farm = nodeFor(w, "crop_wheat");
    const ways = [fish ? `Fishing huts need ${fish.name}` : "Fishing huts by fishing water (Farming tab)", farm ? `wheat fields need ${farm.name}` : "wheat fields on fertile land"];
    return `Food limits your town to about ${fmt(t.fed)} people. More food: ${ways.join("; ")}.`;
  }
  const saw = nodeFor(w, "woodcutter_camp");
  if (!mine("woodcutter_camp") && !mine("sawmill")) return saw ? `Wood is slow. Woodcutter camps need ${saw.name}: ${researching(saw.id)}.` : "Wood is slow: build a Woodcutter camp near forest (Resources tab).";
  if (!com && !w.lockOf("com", "zones")) return "Zone shops (Commercial) so your people have jobs. Jobs raise how many move in.";
  if (p.era !== "T" && (t.goodsSat ?? 1) < 0.9) {
    const play = nodeFor(w, "theatre");
    if (!play && !mine("theatre")) return "Your people lack goods, which holds back home upgrades: a Theatre (Build, Civic) supplies them.";
    if (play && p.era === "G") return `Your people lack goods, which holds back home upgrades. Theatres supply them: ${researching(play.id)}.`;
  }
  if (r && !r.queue.length) return "Your research queue is empty: pick what to research next (U).";
  return "Your town is growing. Zone more homes when Homes demand is up, and keep food ahead of it.";
}

export function createTownPanel(root, game) {
  const lines = el("div", { class: "town-lines" });
  const next = el("p", { id: "town-next", class: "next-step" });
  const bars = { res: bar("Homes"), com: bar("Shops"), ind: bar("Industry") };
  const box = el("section", { id: "town-panel", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Town" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleTown(false) })),
    next, lines, el("b", { text: "Demand" }), ...Object.values(bars).map(b => b.row));
  root.append(box);

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; },
    update() {
      const w = game.world, p = w?.purse;
      if (box.hidden || !p?.town) return;
      const t = p.town, food = p.stock.food ?? 0;
      const lasts = t.foodUse > 0 ? food / t.foodUse : Infinity;
      const step = nextStep(w);
      next.hidden = !step;
      next.textContent = step ? `Next: ${step}` : "";
      const rows = [
        ["Population", `${fmt(t.pop)} of ${fmt(t.housing)} homes`],
        ["Workers", `${fmt(t.workers)}, half the people; ${fmt(Math.min(t.jobs, t.workers))} of ${fmt(t.jobs)} jobs filled`],
        ["Food", `${fmt(food)}, eating ${t.foodUse < 0.1 ? t.foodUse.toFixed(2) : t.foodUse.toFixed(1)} a second${Number.isFinite(lasts) ? `, lasts ${lasts > 120 ? `${Math.round(lasts / 60)} min` : `${Math.round(lasts)} s`}` : ""}`],
        ["Feeds", `about ${fmt(t.fed ?? 0)} people${(t.foodCap ?? 1) < 1 ? ", holding growth back" : ""}`],
        ["Goods", `${fmt(p.stock.goods ?? 0)} (${pct(t.goodsSat)} supplied)`],
        ["Needs met", pct(t.needs)],
        ["Making", Object.entries(p.making ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ") + (Object.keys(p.making ?? {}).length ? " a second" : "nothing yet")],
      ];
      lines.replaceChildren(...rows.map(([k, v]) => el("div", { class: "row spread" }, el("span", { class: "muted", text: k }), el("span", { id: `town-${k.split(" ")[0].toLowerCase()}`, text: v }))));
      if (t.foodSat < 1 && t.pop > 0) lines.append(el("p", { class: "why", text: "Starving: people are leaving. Food comes from the chieftain hut, fishing huts and fields." }));
      const scale = Math.max(3, t.pop * 0.05);
      bars.res.set(t.demand.res ? 1 : 0, t.demand.res ? "wanted" : (t.foodCap ?? 1) < 1 ? "food-limited" : "enough");
      bars.com.set(t.demand.com / scale, t.demand.com > 0 ? `${Math.ceil(t.demand.com)} ${Math.ceil(t.demand.com) === 1 ? "job" : "jobs"} wanted` : "enough");
      bars.ind.set(t.demand.ind / scale, p.era === "T" ? "from the Medieval era" : t.demand.ind > 0 ? `${Math.ceil(t.demand.ind)} ${Math.ceil(t.demand.ind) === 1 ? "job" : "jobs"} wanted` : "enough");
    },
  };
}
