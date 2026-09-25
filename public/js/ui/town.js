import { el, fmt } from "./dom.js";

const pct = v => `${Math.round((v ?? 0) * 100)}%`;

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

export function createTownPanel(root, game) {
  const lines = el("div", { class: "town-lines" });
  const bars = { res: bar("Homes"), com: bar("Shops"), ind: bar("Industry") };
  const box = el("section", { id: "town-panel", class: "panel topright", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Town" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleTown(false) })),
    lines, el("b", { text: "Demand" }), ...Object.values(bars).map(b => b.row));
  root.append(box);

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; },
    update() {
      const p = game.world?.purse;
      if (box.hidden || !p?.town) return;
      const t = p.town, food = p.stock.food ?? 0;
      const lasts = t.foodUse > 0 ? food / t.foodUse : Infinity;
      const rows = [
        ["Population", `${fmt(t.pop)} of ${fmt(t.housing)} homes`],
        ["Jobs", `${fmt(t.jobs)} for ${fmt(t.workers)} workers (${pct(t.jobSat)})`],
        ["Food", `${fmt(food)}, eating ${t.foodUse < 0.1 ? t.foodUse.toFixed(2) : t.foodUse.toFixed(1)} a second${Number.isFinite(lasts) ? `, lasts ${lasts > 120 ? `${Math.round(lasts / 60)} min` : `${Math.round(lasts)} s`}` : ""}`],
        ["Goods", `${fmt(p.stock.goods ?? 0)} (${pct(t.goodsSat)} supplied)`],
        ["Needs met", pct(t.needs)],
      ];
      lines.replaceChildren(...rows.map(([k, v]) => el("div", { class: "row spread" }, el("span", { class: "muted", text: k }), el("span", { id: `town-${k.split(" ")[0].toLowerCase()}`, text: v }))));
      if (t.foodSat < 1 && t.pop > 0) lines.append(el("p", { class: "why", text: "Starving: people are leaving. Food comes from fields and fishing huts (next update)." }));
      const scale = Math.max(3, t.pop * 0.05);
      bars.res.set(t.demand.res ? 1 : 0, t.demand.res ? "wanted" : "enough");
      bars.com.set(t.demand.com / scale, t.demand.com > 0 ? `${Math.ceil(t.demand.com)} ${Math.ceil(t.demand.com) === 1 ? "job" : "jobs"} wanted` : "enough");
      bars.ind.set(t.demand.ind / scale, p.era === "T" ? "from the Medieval era" : t.demand.ind > 0 ? `${Math.ceil(t.demand.ind)} ${Math.ceil(t.demand.ind) === 1 ? "job" : "jobs"} wanted` : "enough");
    },
  };
}
