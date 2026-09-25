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
  let mode = null, preview = null, key = "", trip = null, asking = false;

  const view = () => game.view;
  const cancel = () => { mode = null; preview = null; key = ""; };
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
  const orderOf = s => game.world.purse?.orders?.find(o => o.id === s.id) ?? null;

  const act = {
    advance() { const s = mine(); if (s) order({ t: "advance", stack: s.id }); },
    claim() { const s = mine(); if (s) order({ t: "advance", stack: s.id, only: "free" }); },
    target() { if (mine()) { cancel(); mode = "nation"; } },
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

  const follow = async (s, to) => {
    if (asking) return;
    asking = true;
    const r = await game.conn.request({ t: "route", stack: s.id, to });
    asking = false;
    trip = { id: s.id, to, points: r.ok ? r.points : [], seconds: r.ok ? r.seconds : null, at: performance.now() };
  };

  const drawRoute = (s, w) => {
    const v = view();
    if (!v) return;
    if (preview) return;
    const o = s && s.owner === w.you && s.order === "move" ? orderOf(s) : null;
    if (!o || o.to === null) { v.route = null; return; }
    if (!trip || trip.id !== s.id || trip.to !== o.to || performance.now() - trip.at > 3000) follow(s, o.to);
    const at = [s.pos % w.w, (s.pos / w.w) | 0], end = [o.to % w.w, (o.to / w.w) | 0];
    const left = p => Math.hypot(p[0] - end[0], p[1] - end[1]), now = left(at);
    const mid = trip?.id === s.id && trip.to === o.to ? trip.points.filter(p => left(p) < now) : [];
    const secs = trip?.id === s.id && trip.to === o.to ? trip.seconds : null;
    v.route = { points: [at, ...mid, end], label: secs ? `destination, about ${secs} s` : "destination" };
  };

  const statusOf = (s, w) => {
    const o = s.owner === w.you ? orderOf(s) : null;
    if (s.order === "advance" && o?.only === 0) return "advancing into unclaimed land";
    if (s.order === "advance" && o?.only) return `advancing into ${w.nations.get(o.only)?.name ?? "one nation"}'s land`;
    if (s.order === "move" && trip?.id === s.id && trip.seconds) return `moving, about ${trip.seconds} s to go`;
    return ORDER_TEXT[s.order] ?? s.order;
  };

  const button = (id, text, action, props = {}) => el("button", { id, onclick: () => act[action](), ...props }, text, " ", keyTag(action));
  const buttons = s => {
    if (preview) return [
      el("button", { id: "move-go", class: "primary", text: "Go", onclick: act.go }),
      el("button", { text: "Cancel", onclick: cancel }),
    ];
    if (mode) return [el("button", { text: "Cancel", onclick: cancel })];
    return [
      button("stack-advance", "Advance", "advance", { class: "primary", title: "take any land next to the stack" }),
      button("stack-claim", "Unclaimed only", "claim", { title: "take only land nobody owns" }),
      button("stack-target", "One nation", "target", { title: "take only the land of the nation you click next" }),
      button("stack-move", "Move", "move"),
      button("stack-split", "Split half", "split"),
      button("stack-merge", "Merge nearby", "merge", { disabled: !adjacent(s).length }),
      button("stack-disband", "Disband", "disband"),
    ];
  };

  return {
    get choosing() { return mode !== null; },
    cancel,
    act,
    async pickTarget(plot) {
      const w = game.world, s = w.stacks.get(game.selected);
      if (!s) return cancel();
      if (mode === "nation") {
        const o = w.owner[plot];
        if (!o || o === w.you) return game.toast("Click land that belongs to another nation.");
        cancel();
        return order({ t: "advance", stack: s.id, only: o });
      }
      const r = await game.conn.request({ t: "route", stack: s.id, to: plot });
      if (!r.ok) return game.toast(r.error ?? "no route");
      preview = { to: plot, plots: r.plots, seconds: r.seconds };
      view().route = { points: [[s.pos % w.w, (s.pos / w.w) | 0], ...r.points, [plot % w.w, (plot / w.w) | 0]], label: `about ${r.seconds} s` };
      key = "";
    },
    update() {
      const w = game.world, s = w?.stacks.get(game.selected);
      if (!s) {
        if (game.selected !== null && performance.now() - game.selectedAt > 3000) game.select(null);
        if (!preview && view()) view().route = null;
        box.hidden = true;
        return;
      }
      box.hidden = false;
      drawRoute(s, w);
      const owner = w.nations.get(s.owner), yours = s.owner === w.you;
      title.textContent = yours ? `Your stack, ${fmt(s.troops)} troops` : `${owner?.name ?? "Unknown"}'s stack, ${fmt(s.troops)} troops`;
      info.textContent = ` ${statusOf(s, w)}`;
      hint.textContent = preview ? `About ${preview.plots} plots and ${preview.seconds} s. Stacks take neutral and enemy land on the way.`
        : mode === "move" ? "Click where to go." : mode === "nation" ? "Click the land of the nation to take from." : yours && !w.frozen ? "Right-click the map to send it straight there." : "";
      hint.classList.toggle("fine-only", !preview && !mode);
      const k = `${s.id}:${yours}:${mode}:${!!preview}:${w.frozen}:${adjacent(s).length}`;
      if (k === key) return;
      key = k;
      actions.replaceChildren(...(yours && !w.frozen ? buttons(s) : []), el("button", { text: "Close", onclick: () => game.select(null) }));
    },
  };
}
