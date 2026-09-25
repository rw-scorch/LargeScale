import { el } from "./dom.js";
import { costText } from "./build.js";

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

export function createBuildingPanel(root, game) {
  const title = el("b", { id: "building-title" });
  const info = el("span", { id: "building-info", class: "muted" });
  const work = el("span", { id: "building-work", class: "muted" });
  const actions = el("div", { class: "row wrap" });
  const box = el("section", { id: "building-panel", class: "panel bottom", hidden: true }, el("div", { class: "row" }, title, info), work, actions);
  root.append(box);
  let key = "";

  const demolish = async b => {
    const r = await game.conn.request({ t: "demolish", building: b.id });
    if (!r.ok) return game.toast(r.error ?? "could not demolish");
    const back = costText(r.refund ?? {});
    game.toast(back ? `Demolished. Refunded ${back}.` : "Demolished.");
  };

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
      info.textContent = ` ${yours ? "yours" : owner}, ${b.state === "construction" ? `being built, ${Math.floor(b.progress * 100)}%` : b.state === "rubble" ? "rubble, clears soon" : b.state}`;
      work.textContent = yours ? workText(b.def, w.purse?.town) : "";
      work.hidden = !work.textContent;
      const k = `${b.id}:${b.state}:${yours}:${w.frozen}`;
      if (k === key) return;
      key = k;
      const can = yours && !w.frozen && b.state !== "rubble";
      const back = costText(refundOf(b.def.cost, b.state === "construction" ? w.consRules.refundOnCancel : w.consRules.demolishRefund));
      actions.replaceChildren(
        ...(can ? [el("button", { id: "building-demolish", text: b.state === "construction" ? "Cancel building" : "Demolish", title: back ? `refunds ${back}` : "", onclick: () => demolish(b) })] : []),
        el("span", { class: "muted", text: can && back ? `Refunds ${back}.` : "" }),
        el("button", { text: "Close", onclick: () => game.selectBuilding(null) }));
    },
  };
}
