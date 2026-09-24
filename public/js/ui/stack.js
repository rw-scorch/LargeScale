import { el, fmt } from "./dom.js";
import { keyOf } from "../keys.js";

const ORDER_TEXT = { hold: "holding", move: "moving", advance: "advancing" };

export const keyTag = action => el("kbd", { class: "key", text: keyOf(action) });

export function createStackPanel(root, game) {
  const title = el("b", { id: "stack-title" });
  const info = el("span", { id: "stack-info", class: "muted" });
  const hint = el("span", { id: "stack-hint" });
  const actions = el("div", { class: "row wrap" });
  const box = el("section", { id: "stack-panel", class: "panel bottom", hidden: true }, el("div", { class: "row" }, title, info), hint, actions);
  root.append(box);
  let mode = null, preview = null, key = "";

  const view = () => game.view;
  const clearPreview = () => { preview = null; if (view()) view().route = null; };
  const cancel = () => { mode = null; clearPreview(); key = ""; };
  const mine = () => {
    const s = game.world?.stacks.get(game.selected);
    return s && s.owner === game.world.you && !game.world.frozen ? s : null;
  };
  const order = async (msg, ok) => {
    const r = await game.conn.request(msg);
    if (!r.ok) game.toast(r.error ?? `${msg.t} failed`);
    else ok?.(r);
    key = "";
    return r;
  };
  const adjacent = s => game.world.myStacks().filter(o => o.id !== s.id && Math.max(Math.abs((o.pos % game.world.w) - (s.pos % game.world.w)), Math.abs(((o.pos / game.world.w) | 0) - ((s.pos / game.world.w) | 0))) <= 1);

  const act = {
    advance() { const s = mine(); if (s) order({ t: "advance", stack: s.id }); },
    move() { if (mine()) { cancel(); mode = "move"; } },
    split() { const s = mine(); if (s) order({ t: "split", stack: s.id, share: 0.5 }); },
    async merge() {
      const s = mine();
      if (!s) return;
      const near = adjacent(s);
      if (!near.length) return game.toast("No stacks of yours right next to this one.");
      for (const o of near) await order({ t: "merge", stack: o.id, into: s.id });
    },
    disband() { const s = mine(); if (s) order({ t: "disband", stack: s.id }, () => game.select(null)); },
    go() { const s = mine(); if (s && preview) order({ t: "move", stack: s.id, to: preview.to }, cancel); },
    async moveNow(plot) {
      const s = mine();
      if (!s) return false;
      cancel();
      await order({ t: "move", stack: s.id, to: plot });
      return true;
    },
  };

  const button = (id, text, action, props = {}) => el("button", { id, onclick: () => act[action](), ...props }, text, " ", keyTag(action));
  const buttons = s => {
    if (preview) return [
      el("button", { id: "move-go", class: "primary", text: "Go", onclick: act.go }),
      el("button", { text: "Cancel", onclick: cancel }),
    ];
    if (mode === "move") return [el("button", { text: "Cancel", onclick: cancel })];
    return [
      button("stack-advance", "Advance", "advance", { class: "primary" }),
      button("stack-move", "Move", "move"),
      button("stack-split", "Split half", "split"),
      button("stack-merge", "Merge nearby", "merge", { disabled: !adjacent(s).length }),
      button("stack-disband", "Disband", "disband"),
    ];
  };

  return {
    get choosing() { return mode === "move"; },
    cancel,
    act,
    async pickTarget(plot) {
      const s = game.world.stacks.get(game.selected);
      if (!s) return cancel();
      const r = await game.conn.request({ t: "route", stack: s.id, to: plot });
      if (!r.ok) return game.toast(r.error ?? "no route");
      const w = game.world.w;
      preview = { to: plot, plots: r.plots, seconds: r.seconds };
      view().route = { points: [[s.pos % w, (s.pos / w) | 0], ...r.points, [plot % w, (plot / w) | 0]], label: `about ${r.seconds} s` };
      key = "";
    },
    update() {
      const w = game.world, s = w?.stacks.get(game.selected);
      if (!s) {
        if (game.selected !== null && performance.now() - game.selectedAt > 3000) game.select(null);
        box.hidden = true;
        return;
      }
      box.hidden = false;
      const owner = w.nations.get(s.owner), yours = s.owner === w.you;
      title.textContent = yours ? `Your stack, ${fmt(s.troops)} troops` : `${owner?.name ?? "Unknown"}'s stack, ${fmt(s.troops)} troops`;
      info.textContent = ` ${ORDER_TEXT[s.order] ?? s.order}`;
      hint.textContent = preview ? `About ${preview.plots} plots and ${preview.seconds} s. Stacks take neutral and enemy land on the way.`
        : mode === "move" ? "Click where to go." : yours && !w.frozen ? "Right-click the map to send it straight there." : "";
      hint.classList.toggle("fine-only", !preview && mode !== "move");
      const k = `${s.id}:${yours}:${mode}:${!!preview}:${w.frozen}:${adjacent(s).length}`;
      if (k === key) return;
      key = k;
      actions.replaceChildren(...(yours && !w.frozen ? buttons(s) : []), el("button", { text: "Close", onclick: () => game.select(null) }));
    },
  };
}
