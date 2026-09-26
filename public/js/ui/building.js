import { el, fmt } from "./dom.js";
import { costText } from "./build.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";
import { upgradeLock, upgradePrice } from "./upgrade.js";

const refundOf = (cost, share) => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.floor(v * share)]).filter(([, v]) => v > 0));

const list = parts => parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

function workText(def, town) {
  const out = [];
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
  const box = el("section", { id: "building-panel", class: "panel card", hidden: true }, el("div", { class: "row" }, title, info), desc, work, queue, make, upg, actions);
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
      const builds = yours && b.state === "active" && !w.frozen ? (b.def.builds ?? []).map(t => w.unitTypes.table[t]).filter(Boolean) : [];
      const q = w.purse?.machines?.queues?.[b.id];
      queue.textContent = builds.length ? queueText(w, q) : "";
      queue.hidden = !queue.textContent;
      const next = yours && b.state === "active" && !w.frozen && b.def.next ? w.defs.table[b.def.next] : null;
      const lock = next && upgradeLock(w, next), price = next && !lock ? upgradePrice(w, next.cost) : null;
      const used = price ? costText(Object.fromEntries(Object.entries(price.use).filter(([, v]) => v > 0))) : "";
      upg.textContent = !next ? "" : lock ? `Upgrade to ${next.name}: ${lock}.` : `Upgrade to ${next.name} now for ${fmt(Math.ceil(price.money))} gold${used ? ` and ${used}` : ""}${price.money > (w.purse?.money ?? 0) ? `; you have ${fmt(w.purse?.money ?? 0)} gold` : ""}.`;
      upg.hidden = !upg.textContent;
      const k = `${b.id}:${b.state}:${yours}:${w.frozen}:${builds.map(d => lockOf(w, d)).join("|")}:${q?.items.length ?? 0}:${next?.id}:${lock}:${price ? price.money <= (w.purse?.money ?? 0) : ""}`;
      if (k === key) return;
      key = k;
      make.replaceChildren(...builds.map(d => {
        const lock = lockOf(w, d);
        return el("button", { "data-make": d.id, disabled: !!lock, title: lock ?? d.description, onclick: () => produce(b, d.id) }, `${d.name} (${costText(d.cost)}, ${d.time} s)`);
      }), ...(q?.items.length ? [el("button", { id: "building-clear", text: "Clear queue", onclick: () => clear(b) })] : []));
      make.hidden = !builds.length;
      const can = yours && !w.frozen && b.state !== "rubble";
      const back = costText(refundOf(b.def.cost, b.state === "construction" ? w.consRules.refundOnCancel : w.consRules.demolishRefund));
      actions.replaceChildren(
        ...(next ? [el("button", { id: "building-upgrade", class: "primary", disabled: !!lock || price.money > (w.purse?.money ?? 0), title: lock ?? "instant, at the upgrade menu's price", onclick: () => upgradeOne(b, next) }, `Upgrade to ${next.name}`)] : []),
        ...(can ? [el("button", { id: "building-demolish", text: b.state === "construction" ? "Cancel building" : "Demolish", title: back ? `refunds ${back}` : "", onclick: () => demolish(b) })] : []),
        el("span", { class: "muted", text: can && back ? `Refunds ${back}.` : "" }),
        el("button", { text: "Close", onclick: () => game.selectBuilding(null) }));
    },
  };
}
