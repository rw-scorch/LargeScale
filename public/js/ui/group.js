import { el, fmt } from "./dom.js";
import { isLand } from "../shared/terrain.js";

const STANDING = { hold: "take only unclaimed land while you are away", fallback: "fall back when outnumbered while you are away", guard: "guard your land" };

export function createGroupPanel(root, game) {
  const title = el("b", { id: "group-title", class: "title" });
  const info = el("span", { id: "group-info", class: "muted" });
  const hint = el("span", { id: "group-hint" });
  const standing = el("select", { id: "group-standing", class: "small" }, ...Object.entries(STANDING).map(([v, t]) => el("option", { value: v, text: t })));
  let mode = null, disbandAt = -Infinity, key = "";
  const ids = () => [...(game.group ?? [])];
  const order = async (msg, done) => {
    const r = await game.conn.request({ t: "group", stacks: ids(), ...msg });
    if (!r.ok) return game.toast(r.error ?? "the group order failed");
    if (r.failed) game.toast(`${r.done} of ${r.done + r.failed} stacks did it${r.error ? `; the rest: ${r.error}` : ""}.`);
    done?.(r);
    key = "";
  };
  const act = {
    advance: () => order({ do: "advance" }),
    claim: () => order({ do: "advance", only: "free" }),
    move: () => { mode = mode === "move" ? null : "move"; key = ""; game.updatePanels(); },
    target: () => { mode = mode === "nation" ? null : "nation"; key = ""; game.updatePanels(); },
    gather: () => order({ do: "gather" }, r => game.toast(`${r.done - 1} stacks are walking to your biggest one.`)),
    halt: () => order({ do: "halt" }),
    disband: () => {
      if (performance.now() - disbandAt > 4000) { disbandAt = performance.now(); key = ""; game.updatePanels(); return game.toast("Press Disband again to send every stack in the group home. Each loses a quarter of its troops."); }
      disbandAt = -Infinity;
      order({ do: "disband" }, r => { game.toast(`${r.done} stacks went home.`); game.selectGroup(null); });
    },
  };
  standing.addEventListener("change", () => order({ do: "standing", mode: standing.value }, r => game.toast(`${r.done} stacks will now ${STANDING[standing.value]}.`)));
  const buttons = el("div", { id: "group-actions", class: "row wrap" });
  const box = el("section", { id: "group-panel", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", id: "group-clear", text: "Clear", onclick: () => game.selectGroup(null) })),
    info, el("div", { class: "row wrap" }, el("span", { class: "muted", text: "Standing order: they" }), standing), hint, buttons);
  root.append(box);

  return {
    get open() { return !box.hidden; },
    get choosing() { return mode !== null; },
    act,
    cancel() { mode = null; key = ""; },
    async pick(plot) {
      const w = game.world;
      if (mode === "nation") {
        const o = w.owner[plot];
        if (!o || o === w.you) return game.toast("Click land that belongs to another nation.");
        mode = null;
        return order({ do: "advance", only: o });
      }
      if (!isLand(w.terrain[plot])) return game.toast("Pick a spot on land.");
      mode = null;
      return order({ do: "move", to: plot }, r => game.toast(r.boat ? `${r.done} stacks are on their way. There is no way by land, so they cross together by boat and keep their places on the far side.` : `${r.done} stacks are on their way, keeping their places around that spot.`));
    },
    ringFor(plot) {
      const w = game.world, o = w.owner[plot], land = isLand(w.terrain[plot]), items = [];
      if (land) items.push({ id: "move", label: "Move here", icon: "cursor_move", run: () => order({ do: "move", to: plot }) });
      if (land && o && o !== w.you) items.push({ id: "attack", label: `Attack ${w.nations.get(o)?.name ?? "them"}`, icon: "dip_war", run: () => order({ do: "advance", only: o }) });
      if (land && !o) items.push({ id: "take", label: "Take unclaimed", icon: "ui_flag", run: () => order({ do: "advance", only: "free" }) });
      items.push({ id: "gather", label: "Gather", icon: "ui_army", run: act.gather });
      items.push({ id: "halt", label: "Stop", icon: "ui_pause", run: act.halt });
      return items;
    },
    update() {
      const w = game.world, list = ids().map(id => w?.stacks.get(id)).filter(s => s && s.owner === w.you);
      if (game.group && list.length !== game.group.size) {
        if (list.length >= 2) game.group = new Set(list.map(s => s.id));
        else return game.selectGroup(null, list[0]?.id ?? null);
      }
      box.hidden = !game.group || list.length < 2 || !!w?.frozen;
      if (box.hidden) return;
      const troops = list.reduce((t, s) => t + s.troops, 0), moving = list.filter(s => s.order !== "hold").length;
      title.textContent = `${list.length} stacks, ${fmt(troops)} troops`;
      info.textContent = moving ? `${moving} on the move, ${list.length - moving} holding` : "all holding";
      hint.textContent = mode === "move" ? "Click where to go; they keep their places around that spot." : mode === "nation" ? "Click the land of the nation to take from." : "Right-click or tap the map for their orders.";
      const shared = list.every(s => (s.standing ?? "hold") === (list[0].standing ?? "hold")) ? list[0].standing ?? "hold" : null;
      if (document.activeElement !== standing && shared) standing.value = shared;
      const k = `${mode}:${performance.now() - disbandAt < 4000}`;
      if (k === key) return;
      key = k;
      const b = (id, text, fn, cls = "") => el("button", { id, class: cls, onclick: fn }, text);
      buttons.replaceChildren(
        b("group-advance", "Advance", act.advance, "primary"),
        b("group-claim", "Take unclaimed", act.claim),
        b("group-move", mode === "move" ? "Pick a spot" : "Move", act.move, mode === "move" ? "on" : ""),
        b("group-target", mode === "nation" ? "Pick a nation" : "Attack a nation", act.target, mode === "nation" ? "on" : ""),
        b("group-gather", "Gather", act.gather),
        b("group-halt", "Stop", act.halt),
        b("group-disband", performance.now() - disbandAt < 4000 ? "Disband: sure?" : "Disband", act.disband, "danger"));
    },
  };
}
