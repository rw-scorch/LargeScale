import { el, fmt } from "./dom.js";
import { ERA_NAMES, eraIdx, levelsOf, planBatch, priceOf } from "../shared/buildings.js";
import { costText } from "./build.js";

const cap = s => s && s[0].toUpperCase() + s.slice(1);

export function upgradeLock(w, next) {
  return eraIdx(next.era) > eraIdx(w.purse?.era ?? "T") ? `needs the ${ERA_NAMES[next.era]} era` : w.lockOf(next.id);
}

export function upgradePrice(w, cost) {
  const r = w.consRules, n = w.purse ?? {};
  return priceOf(cost, n.stock, r.instantPremium, r.moneyForMissing);
}

export function createUpgradePanel(root, game) {
  const ready = el("div", { id: "upgrade-list", class: "upgrade-list" });
  const lockedList = el("div", { class: "upgrade-locked" });
  const lockedBox = el("details", { id: "upgrade-locked", hidden: true }, el("summary", {}), lockedList);
  const total = el("p", { id: "upgrade-total", class: "muted" });
  const summary = el("p", { id: "upgrade-summary", hidden: true });
  const go = el("button", { id: "upgrade-go", class: "primary", onclick: () => run() });
  const box = el("section", { id: "upgrade-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Upgrade buildings" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleUpgrade(false) })),
    el("p", { class: "muted", id: "upgrade-rule" }),
    ready, lockedBox,
    el("div", { class: "row wrap upgrade-foot" },
      el("button", { id: "upgrade-all", text: "Pick all", onclick: () => { for (const g of groups) if (!g.why) picked.set(g.type, g.count); refresh(); } }),
      el("button", { id: "upgrade-none", text: "Pick none", onclick: () => { picked.clear(); refresh(); } }),
      el("span", { class: "grow" }), go),
    total, summary);
  root.append(box);
  let groups = [], shape = "", levels = null, pressing = false, busy = false;
  const picked = new Map(), rows = new Map();
  ready.addEventListener("pointerdown", () => { pressing = true; });
  addEventListener("pointerup", () => { pressing = false; });

  const groupsOf = w => {
    levels ??= levelsOf(w.defs.table);
    const count = new Map();
    for (const b of w.buildings.values()) if (b.owner === w.you && b.state === "active" && b.def?.next) count.set(b.type, (count.get(b.type) ?? 0) + 1);
    return [...count].map(([type, n]) => {
      const def = w.defs.table[type], next = w.defs.table[def.next], lv = levels.get(type);
      return { type, def, next, count: n, level: lv.level, base: lv.base, civilian: !!def.civilian, why: upgradeLock(w, next) };
    }).sort((a, b) => a.civilian - b.civilian || a.level - b.level || eraIdx(a.def.era) - eraIdx(b.def.era) || a.base.localeCompare(b.base) || a.type.localeCompare(b.type));
  };

  const thumb = def => {
    const c = el("canvas", { width: 32, height: 32, class: "thumb" }), a = game.view?.atlas, id = def.sprite ?? def.id, sp = a?.get(id);
    if (sp) { const k = 32 / Math.max(sp.w, sp.h); a.draw(c.getContext("2d"), id, (32 - sp.w * k) / 2, 32 - sp.h * k, k, game.world.nations.get(game.world.you)?.colour); }
    return c;
  };

  const eachText = next => {
    const r = game.world.consRules;
    return costText({ ...next.cost, ...(next.cost.money ? { money: next.cost.money * r.instantPremium } : {}) });
  };

  const setPick = (g, v) => {
    const n = Math.max(0, Math.min(g.count, Math.round(Number(v)) || 0));
    if (n) picked.set(g.type, n); else picked.delete(g.type);
    refresh();
  };

  const makeRow = g => {
    const val = el("input", { type: "number", min: 0, max: g.count, value: 0, class: "count", "data-count": g.type, "aria-label": `how many ${g.def.name} to upgrade`,
      oninput: () => setPick(g, val.value) });
    const have = el("span", { class: "muted" });
    const row = el("div", { class: "upgrade-row", "data-type": g.type },
      thumb(g.next),
      el("span", { class: "upgrade-name" }, el("b", { text: `${g.def.name} to ${g.next.name}` }), have, g.next.description ? el("span", { class: "desc", text: g.next.description }) : null),
      el("span", { class: "stepper" },
        el("button", { class: "chip", "data-minus": g.type, text: "-", "aria-label": "one fewer", onclick: () => setPick(g, (picked.get(g.type) ?? 0) - 1) }),
        val,
        el("button", { class: "chip", "data-plus": g.type, text: "+", "aria-label": "one more", onclick: () => setPick(g, (picked.get(g.type) ?? 0) + 1) }),
        el("button", { class: "chip", "data-max": g.type, text: "All", onclick: () => setPick(g, g.count) })));
    return { row, val, have, g };
  };

  const plan = () => {
    const costs = [];
    for (const g of groups) for (let k = Math.min(picked.get(g.type) ?? 0, g.count); k > 0; k--) costs.push(g.next.cost);
    const r = game.world.consRules;
    return { count: costs.length, first: costs[0], ...planBatch(costs, game.world.purse ?? {}, r.instantPremium, r.moneyForMissing) };
  };

  const refresh = () => {
    const w = game.world;
    for (const { row, val, have, g } of rows.values()) {
      const n = picked.get(g.type) ?? 0;
      row.classList.toggle("on", n > 0);
      if (document.activeElement !== val) val.value = String(n);
      val.max = String(g.count);
      have.textContent = ` You have ${g.count}. Each: ${eachText(g.next)}.`;
    }
    const p = plan();
    const money = w.purse?.money ?? 0;
    go.disabled = busy || !p.done;
    if (!p.count) {
      go.textContent = "Upgrade";
      total.textContent = "Choose how many of each to upgrade with - and +, or All.";
    } else if (!p.done) {
      const need = Math.ceil(upgradePrice(w, p.first).money - money);
      go.textContent = "Not enough gold";
      total.textContent = `Even one costs ${fmt(Math.ceil(upgradePrice(w, p.first).money))} gold with the materials you lack; you have ${fmt(money)}. ${fmt(need)} more gold needed.`;
    } else {
      const used = costText(p.used), bought = p.bought >= 1 ? ` ${fmt(p.bought)} of that gold buys materials you lack.` : "";
      go.textContent = p.short ? `Upgrade ${p.done} of ${p.count}` : `Upgrade ${p.count}`;
      total.textContent = `${p.short ? `You can afford ${p.done} of the ${p.count} you picked: ` : ""}${fmt(p.spent)} gold${used ? ` and ${used}` : ""}.${bought}`;
    }
  };

  const build = () => {
    rows.clear();
    const now = groups.filter(g => !g.why), later = groups.filter(g => g.why);
    const part = (list, label) => list.length ? [el("p", { class: "upgrade-head", text: label }), ...list.map(g => { const r = makeRow(g); rows.set(g.type, r); return r.row; })] : [];
    const player = now.filter(g => !g.civilian), civ = now.filter(g => g.civilian);
    ready.replaceChildren(...(now.length ? [...part(player, "Your buildings"), ...part(civ, "Homes and shops. Your people also upgrade these slowly on their own, at the normal price.")]
      : [el("p", { class: "muted", text: groups.length ? "Nothing can be upgraded yet: see what each needs below." : "Nothing finished to upgrade yet. Buildings appear here once they are built." })]));
    lockedBox.hidden = !later.length;
    lockedBox.querySelector("summary").textContent = `Not yet (${later.length})`;
    lockedList.replaceChildren(...later.map(g => el("div", { class: "upgrade-row locked", "data-type": g.type }, thumb(g.next),
      el("span", { class: "upgrade-name" }, el("b", { text: `${g.def.name} to ${g.next.name}` }), el("span", { class: "muted", text: ` ${g.count} of them.` }), el("span", { class: "why", text: ` ${cap(g.why)}.` })))));
  };

  const run = async () => {
    const picks = groups.filter(g => picked.has(g.type) && !g.why).map(g => [g.type, Math.min(g.count, picked.get(g.type))]);
    if (!picks.length) return;
    busy = true;
    refresh();
    const r = await game.conn.request({ t: "upgrade", filter: "all", picks });
    busy = false;
    summary.hidden = false;
    if (!r.ok) { summary.textContent = `Nothing upgraded: ${r.error}.`; refresh(); return; }
    const skipped = Object.entries(r.skipped ?? {}).map(([why, n]) => `${n} ${why}`);
    summary.textContent = `Upgraded ${r.done} for ${fmt(r.spent)} gold.${skipped.length ? ` Not upgraded: ${skipped.join(", ")}.` : ""}`;
    game.toast(summary.textContent);
    picked.clear();
    update();
  };

  const update = () => {
    const w = game.world;
    if (box.hidden || !w?.defs) return;
    const r = w.consRules;
    box.querySelector("#upgrade-rule").textContent = `Upgrades here are instant and cost ${r.instantPremium} times the build price. Materials you lack are bought with gold, ${r.moneyForMissing * r.instantPremium} gold each.`;
    const fresh = groupsOf(w);
    const next = JSON.stringify(fresh.map(g => [g.type, g.why]));
    const counts = new Map(fresh.map(g => [g.type, g]));
    for (const [t, n] of [...picked]) { const g = counts.get(t); if (!g || g.why) picked.delete(t); else if (n > g.count) picked.set(t, g.count); }
    groups = fresh;
    if (next !== shape && !pressing) { shape = next; build(); }
    else for (const row of rows.values()) row.g = counts.get(row.g.type) ?? row.g;
    refresh();
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; shape = ""; if (!on) { picked.clear(); summary.hidden = true; } update(); },
    update,
  };
}
