import { el, fmt } from "./dom.js";
import { costText } from "./build.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";

const cap = t => t && t[0].toUpperCase() + t.slice(1);

export function createArmyPanel(root, game) {
  const summary = el("p", { id: "army-summary", class: "muted" });
  const list = el("div", { id: "army-list", class: "army-list" });
  const box = el("section", { id: "army-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Army" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleArmy(false) })),
    summary, list);
  root.append(box);
  let shape = "";
  const counts = new Map();

  const why = (w, d) => (eraIdx(d.era) > eraIdx(w.purse?.era ?? "T") ? `Needs the ${ERA_NAMES[d.era]} era` : cap(w.lockOf(d.id, "units")));

  const fielded = w => {
    const out = { levy: 0 };
    for (const s of w.myStacks()) {
      let trained = 0;
      for (const [id, n] of Object.entries(s.mix ?? {})) {
        out[id] = (out[id] ?? 0) + n;
        trained += n;
      }
      out.levy += Math.max(0, s.troops - trained);
    }
    return out;
  };

  const send = async (id, input) => {
    const v = Math.max(0, Math.min(1000000, Math.round(Number(input.value)) || 0));
    input.value = v;
    const r = await game.conn.request({ t: "army", keep: { [id]: v } });
    if (!r.ok) game.toast(r.error ?? "could not set that");
  };

  const row = (w, d, army) => {
    const locked = d.id === "levy" ? null : why(w, d);
    const line = el("span", { class: "muted", "data-count": d.id });
    counts.set(d.id, line);
    const stats = `attack ${d.attack}, defence ${d.defence}${d.speed !== 1 ? `, speed ${d.speed}` : ""}${d.capture !== 1 ? `, takes land ${d.capture} times as fast` : ""}`;
    let keep = null;
    if (!locked && d.id !== "levy") {
      const input = el("input", { type: "number", min: 0, max: 1000000, step: 10, value: army?.keep?.[d.id] ?? 0, class: "small", "data-keep": d.id });
      input.addEventListener("change", () => send(d.id, input));
      keep = el("label", { class: "row" }, "Keep at home ", input);
    }
    return el("div", { class: `army-row${locked ? " locked" : ""}`, "data-unit": d.id },
      el("div", { class: "row spread" }, el("b", { text: d.name }), el("span", { class: "muted", text: stats })),
      el("span", { class: "desc", text: d.description }),
      line,
      d.id === "levy" ? null : el("span", { class: "muted", text: `Each costs ${costText(d.cost)}.` }),
      locked ? el("span", { class: "why", text: locked }) : keep);
  };

  const update = () => {
    const w = game.world, army = w?.purse?.army;
    if (box.hidden || !w?.unitTypes) return;
    const types = w.unitTypes.troops;
    const next = JSON.stringify([w.purse?.era, types.map(d => why(w, d)), army?.keep]);
    if (next !== shape) {
      shape = next;
      counts.clear();
      list.replaceChildren(...types.map(d => row(w, d, army)));
    }
    const field = fielded(w);
    for (const d of types) {
      const home = d.id === "levy" ? army?.levies ?? 0 : army?.reserve?.[d.id] ?? 0;
      counts.get(d.id).textContent = `${fmt(home)} at home, ${fmt(field[d.id] ?? 0)} in stacks.`;
    }
    const held = army?.why && army.why !== "build a war camp to train soldiers" ? ` Held up: ${army.why}.` : "";
    summary.textContent = !army ? "" : army.rate
      ? `Training ${army.rate} a second at your war camps and barracks, from ${fmt(army.levies)} levies at home.${held}`
      : `Build a war camp (Build, Military) to train soldiers. Training turns levies at home into the types you set below.${held}`;
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; shape = ""; update(); },
    update,
  };
}
