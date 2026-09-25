import { el, fmt } from "./dom.js";
import { ERA_NAMES, eraIdx, levelsOf, planBatch } from "../shared/buildings.js";
import { costText } from "./build.js";

const FILTERS = [["all", "Everything"], ["player", "Your buildings"], ["civilian", "Civilian"]];

export function createUpgradePanel(root, game) {
  const chips = el("div", { class: "row wrap tabs" });
  const list = el("div", { id: "upgrade-list", class: "upgrade-list" });
  const total = el("span", { id: "upgrade-total", class: "muted" });
  const summary = el("p", { id: "upgrade-summary", hidden: true });
  const go = el("button", { id: "upgrade-go", class: "primary", onclick: () => run() });
  const box = el("section", { id: "upgrade-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Upgrade buildings" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleUpgrade(false) })),
    el("p", { class: "muted", id: "upgrade-rule" }),
    chips, list,
    el("div", { class: "row wrap" }, el("button", { id: "upgrade-all", text: "Select all", onclick: () => selectAll() }), el("button", { text: "Clear", onclick: () => { picked.clear(); render(); } }), go, total),
    summary);
  root.append(box);
  let filter = "all", groups = [], shape = "", levels = null, drag = null;
  const picked = new Map();

  const rules = () => game.world.consRules;
  const groupsOf = w => {
    levels ??= levelsOf(w.defs.table);
    const count = new Map(), era = w.purse?.era ?? "T";
    for (const b of w.buildings.values()) {
      if (b.owner !== w.you || b.state !== "active" || !b.def?.next) continue;
      if ((filter === "civilian" && !b.def.civilian) || (filter === "player" && b.def.civilian)) continue;
      count.set(b.type, (count.get(b.type) ?? 0) + 1);
    }
    return [...count].map(([type, n]) => {
      const def = w.defs.table[type], next = w.defs.table[def.next], lv = levels.get(type);
      const why = eraIdx(next.era) > eraIdx(era) ? `needs the ${ERA_NAMES[next.era]} era` : w.lockOf(next.id);
      return { type, def, next, count: n, level: lv.level, base: lv.base, why };
    }).sort((a, b) => a.level - b.level || eraIdx(a.def.era) - eraIdx(b.def.era) || a.base.localeCompare(b.base) || a.type.localeCompare(b.type));
  };

  const plan = () => {
    const costs = [];
    for (const g of groups) for (let k = Math.min(picked.get(g.type) ?? 0, g.count); k > 0; k--) costs.push(g.next.cost);
    return { count: costs.length, ...planBatch(costs, game.world.purse ?? {}, rules().instantPremium, rules().moneyForMissing) };
  };

  const refreshTotal = () => {
    const p = plan();
    go.textContent = p.count ? `Upgrade ${p.count}` : "Upgrade";
    go.disabled = !p.count || !p.done;
    const used = costText(p.used);
    total.textContent = !p.count ? "Pick rows, or drag down the boxes on the left to pick a run of them."
      : `${fmt(p.spent)} gold${used ? ` and ${used}` : ""}${p.bought >= 1 ? ` (${fmt(p.bought)} of the gold buys materials you lack)` : ""}. ${p.short ? `You can afford ${p.done} of the ${p.count} now; the rest will be skipped.` : "You can afford them all."}`;
  };

  const thumb = def => {
    const c = el("canvas", { width: 32, height: 32, class: "thumb" }), a = game.view?.atlas, id = def.sprite ?? def.id, sp = a?.get(id);
    if (sp) { const k = 32 / Math.max(sp.w, sp.h); a.draw(c.getContext("2d"), id, (32 - sp.w * k) / 2, 32 - sp.h * k, k, game.world.nations.get(game.world.you)?.colour); }
    return c;
  };

  const each = next => costText({ ...next.cost, ...(next.cost.money ? { money: next.cost.money * rules().instantPremium } : {}) });

  const render = () => {
    chips.replaceChildren(...FILTERS.map(([f, name]) => el("button", { class: f === filter ? "on" : "", "data-filter": f, text: name, onclick: () => { filter = f; picked.clear(); shape = ""; update(); } })));
    list.replaceChildren(...(groups.length ? groups.map((g, i) => {
      const on = picked.has(g.type);
      const count = el("input", { type: "number", min: 1, max: g.count, value: picked.get(g.type) ?? g.count, class: "small", title: "how many of these to upgrade", hidden: !on,
        onclick: e => e.stopPropagation(), oninput: () => { picked.set(g.type, Math.max(1, Math.min(g.count, Math.round(Number(count.value)) || 1))); refreshTotal(); } });
      return el("div", { class: `upgrade-row${on ? " on" : ""}${g.why ? " locked" : ""}`, "data-row": i, "data-type": g.type, onclick: () => toggle(g) },
        el("span", { class: "tick", "data-tick": i }),
        thumb(g.next),
        el("span", { class: "upgrade-name" }, el("b", { text: `${g.def.name} to ${g.next.name}` }), el("span", { class: "muted", text: ` ${g.count} of them, each ${each(g.next)}` }), g.why ? el("span", { class: "why", text: ` ${g.why[0].toUpperCase()}${g.why.slice(1)}` }) : null, g.next.description ? el("span", { class: "desc", text: g.next.description }) : null),
        count);
    }) : [el("p", { class: "muted", text: filter === "civilian" ? "No finished homes, shops or workshops to upgrade yet." : "Nothing finished to upgrade yet. Buildings appear here once they are built." })]));
    refreshTotal();
  };

  const toggle = g => {
    if (g.why) return game.toast(`${g.def.name}: ${g.why}.`);
    if (picked.has(g.type)) picked.delete(g.type); else picked.set(g.type, g.count);
    render();
  };
  const selectAll = () => { for (const g of groups) if (!g.why) picked.set(g.type, g.count); render(); };
  const span = (from, to) => {
    const next = new Map(drag.base);
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) if (!groups[i].why) next.set(groups[i].type, groups[i].count);
    picked.clear();
    for (const [k, v] of next) picked.set(k, v);
    for (const row of list.children) row.classList.toggle("on", picked.has(row.dataset.type));
    refreshTotal();
  };

  list.addEventListener("pointerdown", e => {
    const i = e.target.dataset?.tick;
    if (i === undefined) return;
    e.preventDefault();
    drag = { from: Number(i), base: new Map(picked), moved: false };
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", e => {
    if (!drag) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".upgrade-row");
    if (!row || row.dataset.row === undefined) return;
    if (Number(row.dataset.row) !== drag.from) drag.moved = true;
    if (drag.moved) span(drag.from, Number(row.dataset.row));
  });
  const end = () => { if (drag?.moved) render(); drag = null; };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);

  const run = async () => {
    const picks = groups.filter(g => picked.has(g.type) && !g.why).map(g => [g.type, Math.min(g.count, picked.get(g.type))]);
    if (!picks.length) return;
    go.disabled = true;
    const r = await game.conn.request({ t: "upgrade", filter, picks });
    summary.hidden = false;
    if (!r.ok) { summary.textContent = `Nothing upgraded: ${r.error}.`; refreshTotal(); return; }
    const skipped = Object.entries(r.skipped ?? {}).map(([why, n]) => `${why} (${n})`);
    summary.textContent = `Upgraded ${r.done} for ${fmt(r.spent)} gold.${skipped.length ? ` Skipped ${Object.values(r.skipped).reduce((s, n) => s + n, 0)}: ${skipped.join(", ")}.` : ""}${r.missing ? ` ${r.missing} were no longer there to upgrade.` : ""}`;
    picked.clear();
    shape = "";
    update();
  };

  const update = () => {
    const w = game.world;
    if (box.hidden || !w?.defs) return;
    const r = rules();
    box.querySelector("#upgrade-rule").textContent = `Upgrades here happen at once and cost ${r.instantPremium} times the normal gold; materials you have are used, and any you lack are bought at ${r.moneyForMissing * r.instantPremium} gold each. Civilians also upgrade their own homes over time at the normal price.`;
    groups = groupsOf(w);
    for (const t of [...picked.keys()]) if (!groups.some(g => g.type === t && !g.why)) picked.delete(t);
    const next = JSON.stringify([filter, groups.map(g => [g.type, g.count, g.why])]);
    if (next !== shape && !drag) { shape = next; render(); }
    else refreshTotal();
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; shape = ""; if (!on) { picked.clear(); summary.hidden = true; } update(); },
    update,
  };
}
