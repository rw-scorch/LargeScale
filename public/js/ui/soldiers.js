import { el, fmt } from "./dom.js";
import { isLand } from "../shared/terrain.js";
import { soldierTypes, typeOfSlot } from "../shared/soldiers.js";

export function picksOf(w, picked) {
  const out = [];
  for (const [sid, slots] of picked ?? []) {
    const s = w.stacks.get(sid);
    if (!s || s.owner !== w.you || !slots.size) continue;
    const kinds = soldierTypes(s.troops, s.mix, w.soldierRules.troopsEach), take = {};
    for (const k of slots) { const id = typeOfSlot(kinds, k); if (id) take[id] = (take[id] ?? 0) + 1; }
    if (Object.keys(take).length) out.push({ stack: sid, take });
  }
  return out;
}

export function pickedText(w, picks) {
  const by = {};
  for (const p of picks) for (const [id, n] of Object.entries(p.take)) by[id] = (by[id] ?? 0) + n;
  return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${fmt(n)} ${(w.unitTypes.table[id]?.name ?? id).toLowerCase()}`).join(", ");
}

export function createSoldiersPanel(root, game) {
  const title = el("b", { id: "soldiers-title", class: "title" });
  const info = el("span", { id: "soldiers-info", class: "muted" });
  const hint = el("span", { id: "soldiers-hint" });
  const buttons = el("div", { id: "soldiers-actions", class: "row wrap" });
  let mode = null, disbandAt = -Infinity, key = "";
  const picks = () => picksOf(game.world, game.picked);
  const count = list => list.reduce((t, p) => t + Object.values(p.take).reduce((a, b) => a + b, 0), 0);

  const order = async (msg, done) => {
    const list = picks();
    if (!list.length) return game.toast("Pick some soldiers first.");
    const d = await game.conn.request({ t: "detach", picks: list });
    if (!d.ok) return game.toast(d.error ?? "those soldiers could not be picked out");
    const r = await game.conn.request({ t: "group", stacks: d.stacks, ...msg });
    mode = null;
    key = "";
    game.pickSoldiers(null);
    if (d.stacks.length === 1) game.select(d.stacks[0]);
    else game.selectGroup(d.stacks);
    if (!r.ok) return game.toast(r.error ?? "the order failed");
    done?.(r, count(list));
  };

  const act = {
    advance: () => order({ do: "advance" }, (r, n) => game.toast(`${fmt(n)} soldiers advance.`)),
    claim: () => order({ do: "advance", only: "free" }, (r, n) => game.toast(`${fmt(n)} soldiers take unclaimed land.`)),
    move: () => { mode = mode === "move" ? null : "move"; key = ""; game.updatePanels(); },
    target: () => { mode = mode === "nation" ? null : "nation"; key = ""; game.updatePanels(); },
    halt: () => order({ do: "halt" }, (r, n) => game.toast(`${fmt(n)} soldiers stop where they are.`)),
    pilot: async () => {
      const list = picks();
      if (!list.length) return game.toast("Pick some soldiers first.");
      const d = await game.conn.request({ t: "detach", picks: list });
      if (!d.ok) return game.toast(d.error ?? "those soldiers could not be picked out");
      game.pickSoldiers(null);
      await game.startPilot("s", d.stacks[0], d.stacks.slice(1));
    },
    disband: () => {
      if (performance.now() - disbandAt > 4000) { disbandAt = performance.now(); key = ""; game.updatePanels(); return game.toast("Press Disband again to send the picked soldiers home. A quarter of them are lost."); }
      disbandAt = -Infinity;
      order({ do: "disband" }, (r, n) => { game.toast(`${fmt(n)} soldiers went home.`); game.selectGroup(null); game.select(null); });
    },
  };

  const box = el("section", { id: "soldiers-panel", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", id: "soldiers-clear", text: "Clear", onclick: () => game.pickSoldiers(null) })),
    info, hint, buttons);
  root.append(box);

  return {
    get open() { return !box.hidden; },
    get choosing() { return mode !== null; },
    act,
    cancel() { mode = null; key = ""; },
    pick(plot) {
      const w = game.world;
      if (mode === "nation") {
        const o = w.owner[plot];
        if (!o || o === w.you) return game.toast("Click land that belongs to another nation.");
        return order({ do: "advance", only: o }, (r, n) => game.toast(`${fmt(n)} soldiers attack ${w.nations.get(o)?.name ?? "them"}.`));
      }
      if (!isLand(w.terrain[plot])) return game.toast("Pick a spot on land.");
      return order({ do: "move", to: plot }, (r, n) => game.toast(r.boat ? `${fmt(n)} soldiers are on their way, crossing by boat.` : `${fmt(n)} soldiers are on their way.`));
    },
    ringFor(plot) {
      const w = game.world, o = w.owner[plot], land = isLand(w.terrain[plot]), items = [];
      if (land) items.push({ id: "move", label: "Move here", icon: "cursor_move", run: () => order({ do: "move", to: plot }, (r, n) => game.toast(`${fmt(n)} soldiers are on their way.`)) });
      if (land && o && o !== w.you) items.push({ id: "attack", label: `Attack ${w.nations.get(o)?.name ?? "them"}`, icon: "dip_war", run: () => order({ do: "advance", only: o }, (r, n) => game.toast(`${fmt(n)} soldiers attack.`)) });
      if (land && !o) items.push({ id: "take", label: "Take unclaimed", icon: "ui_flag", run: act.claim });
      items.push({ id: "halt", label: "Stop", icon: "ui_pause", run: act.halt });
      items.push({ id: "pilot", label: "Pilot", icon: "cursor_attack", run: act.pilot });
      return items;
    },
    update() {
      const w = game.world, list = game.picked && w ? picks() : [];
      box.hidden = !list.length || !!w?.frozen;
      if (box.hidden) return;
      const n = count(list);
      title.textContent = `${fmt(n)} ${n === 1 ? "soldier" : "soldiers"} picked`;
      info.textContent = `${pickedText(w, list)}, from ${list.length} ${list.length === 1 ? "company" : "companies"}`;
      hint.textContent = mode === "move" ? "Click where to go." : mode === "nation" ? "Click the land of the nation to take from." : game.armies ? "Swipe to pick again; tap a picked soldier to pick all of its kind on screen. Right-click or hold a finger for orders." : "Right-click or hold a finger on the map for their orders.";
      const k = `${mode}:${performance.now() - disbandAt < 4000}`;
      if (k === key) return;
      key = k;
      const b = (id, text, fn, cls = "") => el("button", { id, class: cls, onclick: fn }, text);
      buttons.replaceChildren(
        b("soldiers-advance", "Advance", act.advance, "primary"),
        b("soldiers-claim", "Take unclaimed", act.claim),
        b("soldiers-move", mode === "move" ? "Pick a spot" : "Move", act.move, mode === "move" ? "on" : ""),
        b("soldiers-target", mode === "nation" ? "Pick a nation" : "Attack a nation", act.target, mode === "nation" ? "on" : ""),
        b("soldiers-halt", "Stop", act.halt),
        b("soldiers-pilot", "Pilot", act.pilot),
        b("soldiers-disband", performance.now() - disbandAt < 4000 ? "Disband: sure?" : "Disband", act.disband, "danger"));
    },
  };
}
