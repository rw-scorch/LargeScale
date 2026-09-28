import { el, fmt } from "./dom.js";
import { costText } from "./build.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";
import { upgradeLock, upgradePrice } from "./upgrade.js";
import { storeRow, goodsText, ordersText, siteText, stuckText } from "./logistics.js";

const refundOf = (cost, share) => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.floor(v * share)]).filter(([, v]) => v > 0));

const list = parts => parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

function workText(def, town) {
  const out = [];
  if (def.producer?.kind === "convert") out.push(`Each ${def.producer.out} takes ${list(Object.entries(def.producer.in).map(([k, v]) => `${v} ${k}`))} from its store, and its store asks for more.`);
  if (def.gathers) out.push(`Gathers ${list(Object.entries(def.gathers).map(([k, v]) => `${v} ${k}`))} a second, no workers needed.`);
  if (def.producer && town) {
    const staffed = Math.round(Math.max(0.25, town.worked ?? 0) * 100);
    out.push(`${def.jobs} ${def.jobs === 1 ? "job" : "jobs"}. Your workplaces are ${staffed}% staffed${(town.worked ?? 0) < 0.25 ? ": with too few people they work at the 25% floor, so grow your town" : ""}.`);
  }
  return out.join(" ");
}

function queueText(w, q) {
  if (!q?.items.length) return "Nothing in the queue.";
  const d = w.unitTypes.table[q.items[0]], name = d?.name.toLowerCase() ?? q.items[0], rest = q.items.length - 1;
  const now = q.why ? `Waiting to start a ${name}: ${q.why}.` : `Building a ${name}, ${Math.floor(q.progress * 100)}%.`;
  return rest ? `${now} ${rest} more after it.` : now;
}

export function createBuildingPanel(root, game) {
  const title = el("b", { id: "building-title" });
  const info = el("span", { id: "building-info", class: "muted" });
  const desc = el("span", { id: "building-desc", class: "desc" });
  const work = el("span", { id: "building-work", class: "muted" });
  const actions = el("div", { class: "row wrap" });
  const queue = el("span", { id: "building-queue", class: "muted" });
  const make = el("div", { id: "building-make", class: "row wrap" });
  const upg = el("span", { id: "building-upgrade-info", class: "muted" });
  const waiting = el("span", { id: "building-wait", class: "warn-text" });
  const stored = el("span", { id: "building-goods", class: "muted" });
  const kind = el("select", { id: "store-kind", class: "small" });
  const keepIn = el("input", { id: "store-keep", class: "small", type: "number", min: 0, step: 10, value: 0, title: "never send away the last of this many" });
  const wantIn = el("input", { id: "store-want", class: "small", type: "number", min: 0, step: 10, value: 0, title: "ask for goods until this store holds this many" });
  const orders = el("div", { id: "store-orders", class: "row wrap", hidden: true },
    el("span", { class: "muted", text: "Standing orders:" }), kind, el("span", { class: "muted", text: "Want" }), wantIn, el("span", { class: "muted", text: "Keep" }), keepIn,
    el("button", { id: "store-set", text: "Set", onclick: () => setOrders() }));
  kind.addEventListener("change", () => fillOrders());
  const food = el("input", { id: "wagon-food", class: "small", type: "number", min: 1, step: 10, value: 200 });
  const wagon = el("div", { id: "building-wagon", class: "row wrap", hidden: true }, el("span", { class: "muted", text: "Supply wagon:" }), food, el("span", { class: "muted", text: "food" }),
    el("button", { id: "wagon-load", text: "Load wagon", title: "a wagon of food that follows your army and feeds it beyond supply reach", onclick: () => loadWagon() }));
  const box = el("section", { id: "building-panel", class: "panel card", hidden: true }, el("div", { class: "row" }, title, info), desc, waiting, work, stored, orders, queue, make, upg, wagon, actions);
  root.append(box);
  let key = "";

  const demolish = async b => {
    const r = await game.conn.request({ t: "demolish", building: b.id });
    if (!r.ok) return game.toast(r.error ?? "could not demolish");
    const back = costText(r.refund ?? {});
    game.toast(back ? `Demolished. Refunded ${back}.` : "Demolished.");
  };

  const produce = async (b, type) => {
    const r = await game.conn.request({ t: "produce", building: b.id, type });
    if (!r.ok) return game.toast(r.error ?? "could not queue it");
    key = "";
  };

  const clear = async b => {
    const r = await game.conn.request({ t: "produce", building: b.id, clear: true });
    if (!r.ok) return game.toast(r.error ?? "could not clear the queue");
    const back = costText(r.refund ?? {});
    game.toast(back ? `Queue cleared. Refunded ${back}.` : "Queue cleared.");
    key = "";
  };

  const loadWagon = async () => {
    const b = game.world?.buildings.get(game.selectedBuilding);
    if (!b) return;
    const r = await game.conn.request({ t: "wagon", at: b.anchor, food: Number(food.value) });
    if (!r.ok) return game.toast(r.error ?? "could not load a wagon");
    game.toast(`A supply wagon with ${fmt(r.food)} food is ready. Send it after your army with Follow a stack.`);
    game.selectBuilding(null);
    game.select(r.stack);
  };

  const fillOrders = () => {
    const w = game.world, row = storeRow(w, game.selectedBuilding);
    if (!row) return;
    keepIn.value = row[3][kind.value] ?? 0;
    wantIn.value = row[4][kind.value] ?? 0;
  };

  const setOrders = async () => {
    const w = game.world, row = storeRow(w, game.selectedBuilding);
    if (!row) return;
    const want = Math.max(0, Math.floor(Number(wantIn.value) || 0)), keep = Math.max(want, Math.floor(Number(keepIn.value) || 0));
    const r = await game.conn.request({ t: "store", building: row[0], kind: kind.value, keep, want });
    if (!r.ok) return game.toast(r.error ?? "could not set that");
    keepIn.value = r.keep;
    game.toast(r.want ? `This store asks for ${kind.value} until it holds ${fmt(r.want)}, and keeps ${fmt(r.keep)}.` : r.keep ? `This store keeps its last ${fmt(r.keep)} ${kind.value}.` : `This store's standing orders for ${kind.value} are cleared.`);
    key = "";
  };

  const upgradeOne = async (b, next) => {
    const r = await game.conn.request({ t: "upgrade", ids: [b.id] });
    if (!r.ok) return game.toast(r.error ?? "could not upgrade it");
    game.toast(r.done ? `Upgraded to ${next.name} for ${fmt(r.spent)} gold.` : `Not upgraded: ${Object.keys(r.skipped ?? {}).join(", ") || "it cannot be upgraded now"}.`);
    key = "";
  };

  const lockOf = (w, d) => (eraIdx(d.era) > eraIdx(w.purse?.era ?? "T") ? `needs the ${ERA_NAMES[d.era]} era` : w.lockOf(d.id, "units"));

  return {
    demolish() { const b = game.world?.buildings.get(game.selectedBuilding); if (b && b.owner === game.world.you && b.state !== "rubble") demolish(b); },
    update() {
      const w = game.world, b = w?.buildings.get(game.selectedBuilding);
      if (!b) {
        if (game.selectedBuilding !== null) game.selectBuilding(null);
        box.hidden = true;
        return;
      }
      box.hidden = false;
      const yours = b.owner === w.you, owner = w.nations.get(b.owner)?.name ?? "nobody";
      title.textContent = b.def.name;
      desc.textContent = b.def.description ?? "";
      desc.hidden = !desc.textContent;
      info.textContent = ` ${yours ? "yours" : owner}, ${b.state === "construction" ? `being built, ${Math.floor(b.progress * 100)}%` : b.state === "rubble" ? "rubble, clears soon" : b.state}`;
      work.textContent = yours ? workText(b.def, w.purse?.town) : "";
      work.hidden = !work.textContent;
      waiting.textContent = yours ? (b.state === "construction" ? siteText(w, b.id) : stuckText(w, b.id)) : "";
      waiting.hidden = !waiting.textContent;
      const row = yours && b.def.store && b.state === "active" ? storeRow(w, b.id) : null;
      stored.textContent = row ? `${goodsText(row)} ${ordersText(row)}`.trim() : "";
      stored.hidden = !row;
      orders.hidden = !row || w.frozen;
      if (row) {
        const kinds = [...new Set([...Object.keys(w.purse.stock ?? {}), ...Object.keys(row[1])])];
        if (kind.dataset.sig !== kinds.join()) { kind.dataset.sig = kinds.join(); const was = kind.value; kind.replaceChildren(...kinds.map(k => el("option", { value: k, text: k }))); kind.value = kinds.includes(was) ? was : kinds[0]; fillOrders(); }
        if (![keepIn, wantIn, kind].includes(document.activeElement) && orders.dataset.for !== String(b.id)) { orders.dataset.for = b.id; fillOrders(); }
      }
      const builds = yours && b.state === "active" && !w.frozen ? (b.def.builds ?? []).map(t => w.unitTypes.table[t]).filter(Boolean) : [];
      const q = w.purse?.machines?.queues?.[b.id];
      queue.textContent = builds.length ? queueText(w, q) : "";
      queue.hidden = !queue.textContent;
      const next = yours && b.state === "active" && !w.frozen && b.def.next ? w.defs.table[b.def.next] : null;
      const own = b.def.store ? storeRow(w, b.id) : null;
      const lock = next && upgradeLock(w, next), price = next && !lock ? upgradePrice(w, next.cost, own ? own[1] : undefined) : null;
      const used = price ? costText(Object.fromEntries(Object.entries(price.use).filter(([, v]) => v > 0))) : "";
      upg.textContent = !next ? "" : lock ? `Upgrade to ${next.name}: ${lock}.` : `Upgrade to ${next.name} now for ${fmt(Math.ceil(price.money))} gold${used ? ` and ${used}` : ""}${price.money > (w.purse?.money ?? 0) ? `; you have ${fmt(w.purse?.money ?? 0)} gold` : ""}.`;
      upg.hidden = !upg.textContent;
      const sup = w.purse?.supply;
      wagon.hidden = !(yours && b.state === "active" && !w.frozen && b.def.store && sup);
      if (!wagon.hidden && document.activeElement !== food) food.max = sup.wagonMax;
      const site = b.state === "construction" ? w.purse?.logistics?.sites.find(s => s[0] === b.id) : null;
      const paid = site ? Object.fromEntries(Object.entries(b.def.cost).map(([c, v]) => [c, c === "money" ? v : Math.max(0, v - (site[1][c] ?? 0))])) : b.def.cost;
      const k = `${b.id}:${b.state}:${yours}:${w.frozen}:${JSON.stringify(site?.[1] ?? null)}:${builds.map(d => lockOf(w, d)).join("|")}:${q?.items.length ?? 0}:${next?.id}:${lock}:${price ? price.money <= (w.purse?.money ?? 0) : ""}`;
      if (k === key) return;
      key = k;
      make.replaceChildren(...builds.map(d => {
        const lock = lockOf(w, d);
        return el("button", { "data-make": d.id, disabled: !!lock, title: lock ?? d.description, onclick: () => produce(b, d.id) }, `${d.name} (${costText(d.cost)}, ${d.time} s)`);
      }), ...(q?.items.length ? [el("button", { id: "building-clear", text: "Clear queue", onclick: () => clear(b) })] : []));
      make.hidden = !builds.length;
      const can = yours && !w.frozen && b.state !== "rubble";
      const back = costText(refundOf(paid, b.state === "construction" ? w.consRules.refundOnCancel : w.consRules.demolishRefund));
      actions.replaceChildren(
        ...(next ? [el("button", { id: "building-upgrade", class: "primary", disabled: !!lock || price.money > (w.purse?.money ?? 0), title: lock ?? "instant, at the upgrade menu's price", onclick: () => upgradeOne(b, next) }, `Upgrade to ${next.name}`)] : []),
        ...(can ? [el("button", { id: "building-demolish", text: b.state === "construction" ? "Cancel building" : "Demolish", title: back ? `refunds ${back}` : "", onclick: () => demolish(b) })] : []),
        el("span", { class: "muted", text: can && back ? `Refunds ${back}.` : "" }),
        el("button", { text: "Close", onclick: () => game.selectBuilding(null) }));
    },
  };
}
