import { el, fmt } from "./dom.js";
import { costText } from "./build.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";

const cap = t => t && t[0].toUpperCase() + t.slice(1);

export function createArmyPanel(root, game) {
  const summary = el("p", { id: "army-summary", class: "muted" });
  const guardBox = el("input", { id: "army-guard", type: "checkbox" });
  guardBox.addEventListener("change", async () => {
    const r = await game.conn.request({ t: "guard", home: guardBox.checked });
    if (!r.ok) { guardBox.checked = !guardBox.checked; return game.toast(r.error ?? "could not set that"); }
    game.toast(r.home ? "Guard is on: troops from home will form stacks to meet enemies inside your land, keeping a quarter of your cap at home." : "Guard is off: troops at home stay home.");
  });
  const guardRow = el("label", { class: "row guard-row", title: "stacks set to guard go too" }, guardBox,
    el("span", {}, el("b", { text: "Guard my land" }), el("span", { class: "muted", text: " with troops from home: they form stacks to meet enemy stacks inside your land or heading into it, and come home after. Stacks with the Guard standing order go as well." })));
  const list = el("div", { id: "army-list", class: "army-list" });
  const machines = el("div", { id: "army-machines", class: "row wrap" });
  const box = el("section", { id: "army-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Army" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleArmy(false) })),
    summary, guardRow, machines, list);
  root.append(box);
  let shape = "", fleet = "";
  const counts = new Map();

  const pickMachine = list => {
    const idle = list.filter(u => u.state === "idle" && !u.follow), pool = idle.length ? idle : list;
    const u = pool.find(m => m.id > (game.selectedMachine ?? -1)) ?? pool[0];
    game.toggleArmy(false);
    game.selectMachine(u.id);
    game.focus(u.at, Math.max(game.view.cam.scale / game.view.ratio, 6));
  };

  const showMachines = w => {
    const mine = w.myMachines().filter(u => u.state !== "wreck" && !u.def.freight);
    const next = mine.map(u => `${u.id}:${u.state}:${u.follow}:${u.cargo}`).join();
    if (next === fleet && machines.childElementCount) return;
    fleet = next;
    if (!mine.length) return machines.replaceChildren(el("span", { class: "muted", text: "No machines yet. A siege workshop builds catapults and trebuchets, and a harbour builds galleys and cogs." }));
    const types = [...new Set(mine.map(u => u.type))];
    machines.replaceChildren(el("span", { class: "muted", text: "Machines:" }), ...types.map(t => {
      const group = mine.filter(u => u.type === t), idle = group.filter(u => u.state === "idle" && !u.follow).length, aboard = group.reduce((s, u) => s + (u.cargo ?? 0), 0);
      const name = group[0].def.name.toLowerCase();
      return el("button", { "data-machines": t, title: "select one, idle ones first", onclick: () => pickMachine(group) },
        `${group.length} ${name}${group.length === 1 ? "" : "s"}${idle ? `, ${idle} idle` : ""}${aboard ? `, ${fmt(aboard)} troops aboard` : ""}`);
    }));
  };

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
    if (document.activeElement !== guardBox) guardBox.checked = !!w.purse?.guard;
    const types = w.unitTypes.troops;
    const next = JSON.stringify([w.purse?.era, types.map(d => why(w, d)), army?.keep]);
    if (next !== shape) {
      shape = next;
      counts.clear();
      list.replaceChildren(...types.map(d => row(w, d, army)));
    }
    showMachines(w);
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
    show(on) { box.hidden = !on; shape = ""; fleet = ""; update(); },
    update,
  };
}
