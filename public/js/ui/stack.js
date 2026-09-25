import { el, fmt } from "./dom.js";
import { keyOf } from "../keys.js";
import { isLand } from "../shared/terrain.js";
import { simplifyPath } from "../shared/pathfind.js";
import { MAX_WAYPOINTS } from "../shared/protocol.js";

const ORDER_TEXT = { hold: "holding", move: "moving", advance: "advancing" };

export const keyTag = action => el("kbd", { class: "key", text: keyOf(action) });

export function createStackPanel(root, game) {
  const title = el("b", { id: "stack-title" });
  const info = el("span", { id: "stack-info", class: "muted" });
  const hint = el("span", { id: "stack-hint" });
  const actions = el("div", { class: "row wrap" });
  const box = el("section", { id: "stack-panel", class: "panel bottom", hidden: true }, el("div", { class: "row" }, title, info), hint, actions);
  root.append(box);
  let mode = null, preview = null, key = "", trip = null, asking = false, drawn = null;

  const view = () => game.view;
  const cancel = () => { mode = null; preview = null; drawn = null; key = ""; };
  const xy = i => [i % game.world.w, (i / game.world.w) | 0];
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
    draw() { if (mine()) { cancel(); mode = "draw"; } },
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

  const follow = async (s, to, via, sig) => {
    if (asking) return;
    asking = true;
    const r = await game.conn.request(via.length ? { t: "route", stack: s.id, to, via } : { t: "route", stack: s.id, to });
    asking = false;
    trip = { id: s.id, sig, points: r.ok ? r.points : [], seconds: r.ok ? r.seconds : null, at: performance.now() };
  };

  const take = line => {
    const w = game.world;
    drawn ??= { seen: 0, plots: [] };
    for (; drawn.seen < line.length; drawn.seen++) {
      const i = game.plotAt(...line[drawn.seen]);
      if (i === null || !isLand(w.terrain[i]) || drawn.plots.at(-1) === i) continue;
      drawn.plots.push(i);
    }
    return drawn.plots;
  };

  const aimOf = (o, w) => (o?.only === 0 ? "unclaimed land" : o?.only ? `${w.nations.get(o.only)?.name ?? "one nation"}'s land` : null);

  const drawRoute = (s, w) => {
    const v = view();
    if (!v) return;
    if (preview || drawn) return;
    const o = s && s.owner === w.you && s.order !== "hold" ? orderOf(s) : null;
    if (!o || o.to === null) { v.route = null; return; }
    const via = o.via ?? [], sig = `${o.to}:${via.join(",")}`, same = trip?.id === s.id && trip.sig === sig;
    if (!same || performance.now() - trip.at > 3000) follow(s, o.to, via, sig);
    const at = xy(s.pos), end = xy(o.to);
    const left = p => Math.hypot(p[0] - end[0], p[1] - end[1]), now = left(at);
    const mid = via.length ? via.map(xy) : same ? trip.points.filter(p => left(p) < now) : [];
    const secs = same ? trip.seconds : null;
    const name = s.order === "advance" ? aimOf(o, w) ?? "land to take" : via.length ? "end of your path" : "destination";
    v.route = { points: [at, ...mid, end], label: secs ? `${name}, about ${secs} s` : name };
  };

  const statusOf = (s, w) => {
    const o = s.owner === w.you ? orderOf(s) : null, aim = aimOf(o, w);
    if (s.order === "advance" && o?.to !== null && o?.to !== undefined) return aim ? `heading for ${aim}` : "heading for the nearest land to take";
    if (s.order === "advance" && aim) return `advancing into ${aim}`;
    if (s.order === "move" && o?.via?.length) return trip?.id === s.id && trip.seconds ? `following your path, about ${trip.seconds} s to go` : "following your path";
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
      button("stack-advance", "Advance", "advance", { class: "primary", title: "take any land; with nothing near, the stack goes to the nearest border" }),
      button("stack-claim", "Unclaimed only", "claim", { title: "take only land nobody owns; the stack goes looking for it, but never through another nation" }),
      button("stack-target", "One nation", "target", { title: "take only the land of the nation you click next; the stack goes looking for it, crossing unclaimed land but no other nation" }),
      button("stack-move", "Move", "move"),
      button("stack-draw", "Draw path", "draw", { title: "drag along the way the stack should go; with a mouse, right-drag does this without the button" }),
      button("stack-split", "Split half", "split"),
      button("stack-merge", "Merge nearby", "merge", { disabled: !adjacent(s).length }),
      button("stack-disband", "Disband", "disband"),
    ];
  };

  return {
    get choosing() { return mode !== null; },
    get drawing() { return mode === "draw"; },
    trace(line) {
      const s = mine();
      if (!s || !view()) return;
      const plots = take(line);
      view().route = { points: [xy(s.pos), ...plots.map(xy)], label: plots.length ? "your path" : "" };
    },
    async traceEnd(line) {
      const s = mine(), plots = line ? take(line) : [];
      drawn = null;
      if (!line) { if (view()) view().route = null; return; }
      if (!s) return game.toast("Select one of your stacks first, then right-drag the way it should go.");
      if (!plots.length) { view().route = null; return game.toast("Draw the path over land."); }
      if (mode === "draw") mode = null;
      key = "";
      const keep = simplifyPath(plots.map(xy), MAX_WAYPOINTS + 1).map(([x, y]) => y * game.world.w + x);
      const to = keep.at(-1), via = keep.slice(0, -1);
      await order(via.length ? { t: "move", stack: s.id, to, via } : { t: "move", stack: s.id, to });
    },
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
        : mode === "move" ? "Click where to go." : mode === "nation" ? "Click the land of the nation to take from." : mode === "draw" ? "Drag along the way the stack should go. It takes neutral and enemy land on the way."
        : yours && !w.frozen ? "Right-click the map to send it straight there, or right-drag to draw its way." : "";
      hint.classList.toggle("fine-only", !preview && !mode);
      const k = `${s.id}:${yours}:${mode}:${!!preview}:${w.frozen}:${adjacent(s).length}`;
      if (k === key) return;
      key = k;
      actions.replaceChildren(...(yours && !w.frozen ? buttons(s) : []), el("button", { text: "Close", onclick: () => game.select(null) }));
    },
  };
}
