import { el, fmt } from "./dom.js";

const ORDER_TEXT = { hold: "holding", move: "moving", advance: "advancing" };

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
  const order = async (msg, ok) => {
    const r = await game.conn.request(msg);
    if (!r.ok) game.toast(r.error ?? `${msg.t} failed`);
    else ok?.(r);
    key = "";
  };
  const adjacent = s => game.world.myStacks().filter(o => o.id !== s.id && Math.max(Math.abs((o.pos % game.world.w) - (s.pos % game.world.w)), Math.abs(((o.pos / game.world.w) | 0) - ((s.pos / game.world.w) | 0))) <= 1);

  const buttons = s => {
    if (preview) return [
      el("button", { id: "move-go", class: "primary", text: "Go", onclick: () => order({ t: "move", stack: s.id, to: preview.to }, cancel) }),
      el("button", { text: "Cancel", onclick: cancel }),
    ];
    if (mode === "move") return [el("button", { text: "Cancel", onclick: cancel })];
    return [
      el("button", { id: "stack-advance", class: "primary", text: "Advance", onclick: () => order({ t: "advance", stack: s.id }) }),
      el("button", { id: "stack-move", text: "Move", onclick: () => { mode = "move"; key = ""; } }),
      el("button", { id: "stack-split", text: "Split half", onclick: () => order({ t: "split", stack: s.id, share: 0.5 }) }),
      el("button", { id: "stack-merge", text: "Merge nearby", disabled: !adjacent(s).length, onclick: async () => { for (const o of adjacent(s)) await order({ t: "merge", stack: o.id, into: s.id }); } }),
      el("button", { id: "stack-disband", text: "Disband", onclick: () => order({ t: "disband", stack: s.id }, () => game.select(null)) }),
    ];
  };

  return {
    get choosing() { return mode === "move"; },
    cancel,
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
      const owner = w.nations.get(s.owner), mine = s.owner === w.you;
      title.textContent = mine ? `Your stack, ${fmt(s.troops)} troops` : `${owner?.name ?? "Unknown"}'s stack, ${fmt(s.troops)} troops`;
      info.textContent = ` ${ORDER_TEXT[s.order] ?? s.order}`;
      hint.textContent = preview ? `About ${preview.plots} plots and ${preview.seconds} s. Stacks take neutral and enemy land on the way.` : mode === "move" ? "Tap where to go." : "";
      const k = `${s.id}:${mine}:${mode}:${!!preview}:${w.frozen}:${adjacent(s).length}`;
      if (k === key) return;
      key = k;
      actions.replaceChildren(...(mine && !w.frozen ? buttons(s) : []), el("button", { text: "Close", onclick: () => game.select(null) }));
    },
  };
}
