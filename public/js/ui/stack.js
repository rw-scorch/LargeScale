import { el, fmt } from "./dom.js";
import { keyOf } from "../keys.js";
import { isLand } from "../shared/terrain.js";
import { simplifyPath } from "../shared/pathfind.js";
import { MAX_WAYPOINTS } from "../shared/protocol.js";
import { XP_NAMES } from "../shared/units.js";

const ORDER_TEXT = { hold: "holding", move: "moving", advance: "advancing" };

export const keyTag = action => el("kbd", { class: "key", "data-action": action, text: keyOf(action) });

export function createStackPanel(root, game) {
  const title = el("b", { id: "stack-title" });
  const info = el("span", { id: "stack-info", class: "muted" });
  const mixLine = el("span", { id: "stack-mix", class: "muted" });
  const supplyLine = el("span", { id: "stack-supply", class: "muted" });
  const hint = el("span", { id: "stack-hint" });
  const actions = el("div", { class: "row wrap" });
  const STANDING = { hold: "take only unclaimed land and start no fights while you are away", fallback: "fall back when outnumbered while you are away", guard: "guard your land: they go to meet enemies inside it" };
  const standing = el("select", { id: "stack-standing", class: "small" },
    el("option", { value: "hold", text: "takes only unclaimed land and starts no fights while you are away" }),
    el("option", { value: "fallback", text: "falls back when outnumbered while you are away" }),
    el("option", { value: "guard", text: "guards your land: meets enemies inside it" }));
  const away = el("div", { class: "row wrap", id: "stack-away" }, el("span", { class: "muted", text: "Standing order: this stack" }), standing,
    el("button", { class: "ghost", id: "stack-standing-all", text: "Same for all my stacks", onclick: () => order({ t: "standing", mode: standing.value, all: true }, r => game.toast(`All ${r.stacks} of your stacks, and new ones, now ${STANDING[r.mode]}.`)) }));
  const box = el("section", { id: "stack-panel", class: "panel card", hidden: true }, el("div", { class: "row" }, title, info), mixLine, supplyLine, away, hint, actions);
  root.append(box);
  let mode = null, preview = null, key = "", trip = null, asking = false, drawn = null, disbandAt = -Infinity;
  const confirming = () => performance.now() - disbandAt < 4000;

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
    else {
      if (r.boat) game.toast(`No way there by land: they will cross ${r.crossing} plots of water by boat, and lose about ${Math.round(r.loss * 100)}% landing.`);
      ok?.(r);
    }
    key = "";
    return r;
  };
  const adjacent = s => s.kind === "supply" ? [] : game.world.myStacks().filter(o => o.id !== s.id && o.kind !== "supply" && Math.max(Math.abs((o.pos % game.world.w) - (s.pos % game.world.w)), Math.abs(((o.pos / game.world.w) | 0) - ((s.pos / game.world.w) | 0))) <= 1);
  const orderOf = s => game.world.purse?.orders?.find(o => o.id === s.id) ?? null;
  standing.addEventListener("change", () => { const s = mine(); if (s) order({ t: "standing", stack: s.id, mode: standing.value }); });

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
    disband() {
      const s = mine();
      if (!s) return;
      const share = Math.round(game.world.disbandLoss * 100);
      if (!confirming()) {
        disbandAt = performance.now();
        key = "";
        return game.toast(s.kind === "supply" ? `Disband again to confirm: on your land the wagon's ${fmt(s.supplies)} food goes back to your stock.` : `Disband again to confirm: ${share}% of the ${fmt(s.troops)} troops are lost, and only as many go home as your troop cap has room for.`);
      }
      disbandAt = -Infinity;
      order({ t: "disband", stack: s.id }, r => {
        if (r.food) game.toast(`The wagon's ${fmt(r.food)} food went back to your stock.`);
        else game.toast(r.left ? `${fmt(r.back)} troops went home and ${fmt(r.lost)} were lost. ${fmt(r.left)} stay in the stack: your troops are at their cap.` : `${fmt(r.back)} troops went home and ${fmt(r.lost)} were lost.`);
        if (!r.left) game.select(null);
      });
    },
    go() { const s = mine(); if (s && preview) order({ t: "move", stack: s.id, to: preview.to }, cancel); },
    board() { if (mine()) { cancel(); mode = "board"; } },
    follow() { if (mine()?.kind === "supply") { cancel(); mode = "follow"; } },
    followNow(target) {
      const s = mine();
      if (!s) return;
      cancel();
      return order({ t: "follow", stack: s.id, target }, () => game.toast("The wagon follows that stack and feeds it."));
    },
    boardNow(ship) {
      const s = mine();
      if (!s) return;
      cancel();
      return order({ t: "board", stack: s.id, ship }, () => game.toast("The stack marches to the ship and boards it."));
    },
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

  const supplyText = (s, w) => {
    const sup = w.purse?.supply;
    if (s.kind === "supply") return s.owner === w.you && sup ? `It feeds your stacks within ${sup.radius} plots while its food lasts.` : "";
    if (s.owner !== w.you || !sup) return "";
    const row = sup.stacks.find(r => r[0] === s.id);
    if (!row) return "In supply.";
    const [, carry, pct] = row;
    return carry > 0 ? `Beyond supply: about ${Math.ceil(carry / 60)} min of supplies left.` : `Out of supply: ${pct}% strength, and troops are deserting. Bring it back near a store, or send a supply wagon.`;
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
    if (o?.guarding) return "guarding: on its way to meet an enemy stack";
    if (s.order === "advance" && o?.to !== null && o?.to !== undefined) return aim ? `heading for ${aim}` : "heading for the nearest land to take";
    if (s.order === "advance" && aim) return `advancing into ${aim}`;
    if (s.order === "move" && o?.via?.length) return trip?.id === s.id && trip.seconds ? `following your path, about ${trip.seconds} s to go` : "following your path";
    if (s.order === "move" && trip?.id === s.id && trip.seconds) return `moving, about ${trip.seconds} s to go`;
    return ORDER_TEXT[s.order] ?? s.order;
  };

  const button = (id, text, action, props = {}) => el("button", { id, onclick: () => act[action](), ...props }, text, " ", keyTag(action));
  const ships = () => game.world.myMachines().filter(u => u.def.capacity && u.state !== "wreck" && u.cargo < u.def.capacity);
  const buttons = s => {
    if (preview) return [
      el("button", { id: "move-go", class: "primary", text: "Go", onclick: act.go }),
      el("button", { text: "Cancel", onclick: cancel }),
    ];
    if (mode) return [el("button", { text: "Cancel", onclick: cancel })];
    if (s.kind === "supply") return [
      button("stack-move", "Move", "move"),
      el("button", { id: "stack-follow", class: "primary", text: "Follow a stack", title: "click one of your stacks; the wagon keeps beside it and feeds it", onclick: () => act.follow() }),
      button("stack-disband", confirming() ? "Sure? Disband" : "Disband", "disband", { class: confirming() ? "danger" : "", title: "on your land its food goes back to your stock" }),
    ];
    return [
      button("stack-advance", "Advance", "advance", { class: "primary", title: "take any land; with nothing near, the stack goes to the nearest border" }),
      button("stack-claim", "Unclaimed only", "claim", { title: "take only land nobody owns; the stack goes looking for it, but never through another nation" }),
      button("stack-target", "One nation", "target", { title: "take only the land of the nation you click next; the stack goes looking for it, crossing unclaimed land but no other nation" }),
      button("stack-move", "Move", "move"),
      button("stack-draw", "Draw path", "draw", { title: "drag along the way the stack should go; with a mouse, right-drag does this without the button" }),
      button("stack-split", "Split half", "split"),
      button("stack-merge", "Merge nearby", "merge", { disabled: !adjacent(s).length }),
      ...(ships().length ? [el("button", { id: "stack-board", text: "Board a ship", title: "click one of your ships; the stack marches to the coast beside it and goes aboard", onclick: () => act.board() })] : []),
      button("stack-disband", confirming() ? "Sure? Disband" : "Disband", "disband", { class: confirming() ? "danger" : "", title: `send the troops home; ${Math.round(game.world.disbandLoss * 100)}% of them are lost` }),
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
    ringFor(plot, sx, sy) {
      const s = mine(), w = game.world;
      if (!s) return [];
      const o = w.owner[plot], onLand = isLand(w.terrain[plot]), items = [];
      if (s.kind === "supply") {
        const t = w.stacks.get(game.view?.stackAt(sx, sy));
        if (t && t.owner === w.you && t.kind !== "supply") items.push({ id: "follow", label: "Follow this stack", note: fmt(t.troops), icon: "ui_map_supply", run: () => act.followNow(t.id) });
        if (onLand) items.push({ id: "move", label: "Move here", icon: "cursor_move", run: () => act.moveNow(plot) });
        return items;
      }
      const ship = w.machines.get(game.view?.machineAt(sx, sy));
      if (ship && ship.owner === w.you && ship.def.capacity && ship.state !== "wreck") items.push({ id: "board", label: "Board ship", note: `${fmt(ship.cargo)} of ${ship.def.capacity}`, icon: "ui_map_supply", run: () => act.boardNow(ship.id) });
      if (onLand) items.push({ id: "move", label: "Move here", icon: "cursor_move", run: () => act.moveNow(plot) });
      if (onLand && o && o !== w.you) items.push({ id: "attack", label: `Attack ${w.nations.get(o)?.name ?? "them"}`, icon: "dip_war", run: () => order({ t: "advance", stack: s.id, only: o }) });
      if (onLand && !o) items.push({ id: "take", label: "Take unclaimed", icon: "ui_flag", run: () => order({ t: "advance", stack: s.id, only: "free" }) });
      return items;
    },
    async pickTarget(plot, sx, sy) {
      const w = game.world, s = w.stacks.get(game.selected);
      if (!s) return cancel();
      if (mode === "board") {
        const u = w.machines.get(game.view?.machineAt(sx, sy));
        if (!u || u.owner !== w.you || !u.def.capacity) return game.toast("Click one of your ships.");
        return act.boardNow(u.id);
      }
      if (mode === "follow") {
        const t = w.stacks.get(game.view?.stackAt(sx, sy));
        if (!t || t.owner !== w.you || t.kind === "supply") return game.toast("Click one of your stacks of troops.");
        return act.followNow(t.id);
      }
      if (mode === "nation") {
        const o = w.owner[plot];
        if (!o || o === w.you) return game.toast("Click land that belongs to another nation.");
        cancel();
        return order({ t: "advance", stack: s.id, only: o });
      }
      const r = await game.conn.request({ t: "route", stack: s.id, to: plot });
      if (!r.ok) return game.toast(r.error ?? "no route");
      preview = { to: plot, plots: r.plots, seconds: r.seconds, boat: r.boat ? { crossing: r.crossing, loss: r.loss } : null };
      view().route = { points: [[s.pos % w.w, (s.pos / w.w) | 0], ...r.points, [plot % w.w, (plot / w.w) | 0]], label: r.boat ? `by boat, about ${r.seconds} s` : `about ${r.seconds} s` };
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
      const rank = s.xp ? `, ${XP_NAMES[s.xp] ?? "Veteran"}` : "";
      const wagon = s.kind === "supply";
      title.textContent = wagon ? (yours ? `Your supply wagon, ${fmt(s.supplies)} food` : `${owner?.name ?? "Unknown"}'s supply wagon, ${fmt(s.supplies)} food`) : yours ? `Your stack, ${fmt(s.troops)} troops${rank}` : `${owner?.name ?? "Unknown"}'s stack, ${fmt(s.troops)} troops${rank}`;
      supplyLine.textContent = supplyText(s, w);
      supplyLine.hidden = !supplyLine.textContent;
      const parts = w.mixOf(s);
      mixLine.textContent = parts.length > 1 || parts[0]?.id !== "levy" ? parts.map(p => `${fmt(p.count)} ${p.name.toLowerCase()}`).join(", ") : "";
      mixLine.hidden = !mixLine.textContent;
      away.hidden = !yours || w.frozen;
      if (yours && document.activeElement !== standing) standing.value = orderOf(s)?.standing ?? "hold";
      info.textContent = ` ${statusOf(s, w)}`;
      hint.textContent = preview?.boat ? `No way by land: they walk to your coast and cross ${preview.boat.crossing} plots of water in a free boat, losing about ${Math.round(preview.boat.loss * 100)}% as they land. About ${preview.seconds} s in all.`
        : preview ? `About ${preview.plots} plots and ${preview.seconds} s. Stacks take neutral and enemy land on the way.`
        : mode === "follow" ? "Click one of your stacks for the wagon to follow."
        : mode === "move" ? "Click where to go." : mode === "nation" ? "Click the land of the nation to take from." : mode === "board" ? "Click one of your ships." : mode === "draw" ? "Drag along the way the stack should go. It takes neutral and enemy land on the way."
        : yours && !w.frozen ? "Right-click the map for its orders, or right-drag to draw its way." : "";
      hint.classList.toggle("fine-only", !preview && !mode);
      const k = `${s.id}:${yours}:${mode}:${!!preview}:${w.frozen}:${adjacent(s).length}:${confirming()}:${ships().length > 0}`;
      if (k === key) return;
      key = k;
      actions.replaceChildren(...(yours && !w.frozen ? buttons(s) : []), el("button", { text: "Close", onclick: () => game.select(null) }));
    },
  };
}
