import { el, fmt } from "./dom.js";
import { soldierCount, soldierTypes } from "../shared/soldiers.js";
import { keyTag } from "./stack.js";

const STANDING = { hold: "take only unclaimed land while you are away", fallback: "fall back when outnumbered while you are away", guard: "guard your land: they meet enemies inside it" };
const DOING = { hold: "holding", move: "moving", advance: "advancing" };

export function createTroopsPanel(root, game) {
  const title = el("b", { id: "troops-title", class: "title" });
  const info = el("p", { id: "troops-info", class: "muted" });
  const standing = el("select", { id: "troops-standing", class: "small" }, ...Object.entries(STANDING).map(([v, t]) => el("option", { value: v, text: t })));
  const actions = el("div", { id: "troops-actions", class: "row wrap" });
  const list = el("div", { id: "troops-list", class: "troops-list" });
  const box = el("section", { id: "troops-panel", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleTroops(false) })),
    info, actions,
    el("label", { class: "row wrap" }, el("span", { class: "muted", text: "All of them, and new ones:" }), standing),
    list);
  root.append(box);
  let open = false, shape = "";

  const mine = () => (game.world?.myStacks?.() ?? []).sort((a, b) => b.troops - a.troops);
  const all = async (msg, said) => {
    const ids = mine().slice(0, 100).map(s => s.id);
    if (!ids.length) return game.toast("You have no companies in the field. Form one with Form stack in the ring.");
    const r = await game.conn.request({ t: "group", stacks: ids, ...msg });
    if (!r.ok) return game.toast(r.error ?? "the order failed");
    game.toast(`${said(r)}${r.failed ? ` ${r.failed} could not: ${r.error}.` : ""}`);
  };
  const selectAll = () => {
    const ids = mine().slice(0, 100).map(s => s.id);
    if (!ids.length) return game.toast("You have no companies in the field.");
    if (ids.length === 1) game.select(ids[0]);
    else game.selectGroup(ids);
    return ids.length;
  };
  const act = {
    select: () => selectAll(),
    advance: () => all({ do: "advance" }, r => `${r.done} ${r.done === 1 ? "company advances" : "companies advance"}.`),
    claim: () => all({ do: "advance", only: "free" }, r => `${r.done} ${r.done === 1 ? "company takes" : "companies take"} unclaimed land.`),
    move: () => {
      const n = selectAll();
      if (!n) return;
      if (n === 1) game.stack.act.move();
      else game.groupPanel.act.move();
      game.toast("Click where they should go; they keep their places around that spot.");
    },
    gather: () => all({ do: "gather" }, r => `${Math.max(0, r.done - 1)} companies walk to your biggest one.`),
    halt: () => all({ do: "halt" }, r => `${r.done} ${r.done === 1 ? "company stops" : "companies stop"}.`),
    pick: () => { game.toggleTroops(false); game.toggleArmies(true); },
  };
  standing.addEventListener("change", async () => {
    const r = await game.conn.request({ t: "standing", mode: standing.value, all: true });
    game.toast(r.ok ? `All ${r.stacks} of your companies, and new ones, now ${STANDING[r.mode]}.` : r.error ?? "could not set that");
  });

  const b = (id, text, fn, cls = "", key = null) => el("button", { id, class: cls, onclick: fn }, text, ...(key ? [" ", keyTag(key)] : []));
  actions.append(
    b("troops-select", "Select all", act.select, "primary"),
    b("troops-advance", "Advance all", act.advance),
    b("troops-claim", "Take unclaimed", act.claim),
    b("troops-move", "Move all", act.move),
    b("troops-gather", "Gather", act.gather),
    b("troops-halt", "Stop all", act.halt),
    b("troops-pick", "Pick soldiers", act.pick, "", "armies"));

  const row = (s, w, each) => {
    const kinds = each ? soldierTypes(s.troops, s.mix, each) : [];
    const main = kinds[0] ? w.unitTypes?.table[kinds[0][0]]?.name ?? kinds[0][0] : null;
    const size = each ? `${fmt(soldierCount(s.troops, each))} soldiers` : `${fmt(s.troops)} troops`;
    return el("div", { class: "troops-row", "data-stack": s.id },
      el("span", { class: "grow" }, el("b", { text: size }), el("span", { class: "muted", text: ` ${main && kinds.length === 1 ? main.toLowerCase() : kinds.length > 1 ? "mixed" : ""}, ${DOING[s.order] ?? s.order}` })),
      el("button", { class: "chip", "data-go": s.id, text: "Go", onclick: () => { game.select(s.id); game.focus(s.pos, Math.max(game.view?.cam.scale ?? 16, 16)); } }));
  };

  return {
    get open() { return open; },
    act,
    show(on) { open = !!on; shape = ""; this.update(); },
    update() {
      const w = game.world;
      box.hidden = !open || !w?.ready || !!w.frozen;
      if (box.hidden) return;
      const list0 = mine(), each = w.soldierRules?.troopsEach, troops = list0.reduce((t, s) => t + s.troops, 0), field = w.purse?.field;
      title.textContent = `All troops: ${list0.length} ${list0.length === 1 ? "company" : "companies"}, ${fmt(troops)} troops`;
      const home = w.purse?.army?.reserve ?? w.nations.get(w.you)?.troops;
      info.textContent = `${list0.filter(s => s.order !== "hold").length} on the move.${field ? ` ${fmt(field.soldiers)} of ${fmt(field.cap)} soldiers in the field.` : ""}${home !== undefined ? ` ${fmt(home)} troops at home.` : ""}`;
      const shared = list0.length && list0.every(s => (s.standing ?? "hold") === (list0[0].standing ?? "hold")) ? list0[0].standing ?? "hold" : null;
      if (document.activeElement !== standing && shared) standing.value = shared;
      const k = list0.map(s => `${s.id}:${Math.round(s.troops)}:${s.order}`).join(",");
      if (k === shape) return;
      shape = k;
      list.replaceChildren(...(list0.length ? list0.map(s => row(s, w, each)) : [el("p", { class: "muted", text: "No companies in the field yet. Right-click your land and choose Form stack." })]));
    },
  };
}
