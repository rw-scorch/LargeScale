import { el, fmt } from "./dom.js";
import { keyTag } from "./stack.js";
import { isLand } from "../shared/terrain.js";

const STATE_TEXT = { idle: "waiting", moving: "on the move", wreck: "a wreck, cleared in a few minutes" };

export function createMachinePanel(root, game) {
  const title = el("b", { id: "machine-title" });
  const info = el("span", { id: "machine-info", class: "muted" });
  const cargo = el("span", { id: "machine-cargo" });
  const desc = el("span", { id: "machine-desc", class: "desc" });
  const hint = el("span", { id: "machine-hint" });
  const actions = el("div", { class: "row wrap" });
  const box = el("section", { id: "machine-panel", class: "panel card", hidden: true }, el("div", { class: "row" }, title, info), cargo, desc, hint, actions);
  root.append(box);
  let mode = null, key = "";

  const w = () => game.world;
  const isShip = u => u.def.domain === "sea";
  const isPlane = u => u.def.domain === "air";
  const mine = () => {
    const u = w()?.machines.get(game.selectedMachine);
    return u && u.owner === w().you && u.state !== "wreck" && !w().frozen ? u : null;
  };
  const cancel = () => { mode = null; key = ""; };
  const order = async (msg, ok) => {
    const r = await game.conn.request(msg);
    if (!r.ok) game.toast(r.error ?? "the order failed");
    else ok?.(r);
    key = "";
    return r;
  };
  const orderOf = u => w().purse?.machines?.orders?.find(o => o.id === u.id) ?? null;
  const ownStackAt = (sx, sy) => {
    const id = game.view?.stackAt(sx, sy), s = id === null || id === undefined ? null : w().stacks.get(id);
    return s && s.owner === w().you ? s : null;
  };
  const follow = (u, s) => order({ t: "machine", machine: u.id, do: "follow", stack: s.id }, () => game.toast(`The ${u.def.name.toLowerCase()} follows that stack.`));
  const land = (u, plot) => order({ t: "machine", machine: u.id, do: "land", at: plot }, () => game.toast(`The ${u.def.name.toLowerCase()} sails there to land ${fmt(u.cargo)} troops.`));

  const fly = (u, what, plot) => order({ t: "air", plane: u.id, do: what, ...(plot === undefined ? {} : { at: plot }) }, r => game.toast(what === "return" ? `The ${u.def.name.toLowerCase()} flies home.` : `The ${u.def.name.toLowerCase()} ${what === "bomb" ? "flies to bomb that spot" : "flies to patrol there"}${r.rearming ? ` once it has rearmed, in ${r.rearming} s` : ""}.`));
  const act = {
    patrol() { const u = mine(); if (u && isPlane(u) && u.def.attack > 0) { cancel(); mode = "patrol"; } },
    bomb() { const u = mine(); if (u && isPlane(u) && u.def.bomb) { cancel(); mode = "bomb"; } },
    home() { const u = mine(); if (u && isPlane(u)) fly(u, "return"); },
    move() { if (mine()) { cancel(); mode = "move"; } },
    follow() { const u = mine(); if (u && !isShip(u)) { cancel(); mode = "follow"; } },
    land() { const u = mine(); if (u && isShip(u) && u.cargo) { cancel(); mode = "land"; } },
    stop() { const u = mine(); if (u) order({ t: "machine", machine: u.id, do: "stop" }); },
  };

  const statusOf = u => {
    if (u.state === "wreck") return STATE_TEXT.wreck;
    if (u.air) {
      const A = u.air, fuel = `${fmt(A.fuel)} s of fuel`;
      if (A.landed) return A.rearm > 0 ? `at its airfield, rearming: ready in ${fmt(A.rearm)} s` : "at its airfield, ready";
      return A.mission === "patrol" ? `patrolling, ${fuel}` : A.mission === "bomb" ? `flying to bomb, ${fuel}` : `flying home, ${fuel}`;
    }
    const o = u.owner === w().you ? orderOf(u) : null;
    if (o?.land !== null && o?.land !== undefined) return "sailing to land its troops";
    if (u.follow) {
      const s = w().stacks.get(u.follow);
      return s ? `following a stack of ${fmt(s.troops)}` : "following a stack";
    }
    return STATE_TEXT[u.state];
  };

  const drawRoute = u => {
    const v = game.view;
    if (!v || game.selected !== null) return;
    const o = u.owner === w().you ? orderOf(u) : null, xy = i => [i % w().w, (i / w().w) | 0];
    const to = o?.land ?? o?.to ?? (u.follow ? w().stacks.get(u.follow)?.pos : null);
    v.route = to !== null && to !== undefined && to !== u.at ? { points: [xy(u.at), xy(to)], label: o?.land !== null && o?.land !== undefined ? "landing" : u.follow ? "following" : "destination" } : null;
  };

  return {
    get choosing() { return mode !== null; },
    cancel,
    act,
    key(action) {
      if (action !== "move" || !mine()) return false;
      act.move();
      return true;
    },
    async pick(plot, sx, sy) {
      const u = mine(), m = mode;
      cancel();
      if (!u) return;
      if (m === "follow") {
        const s = ownStackAt(sx, sy);
        return s ? follow(u, s) : game.toast("Click one of your stacks.");
      }
      if (m === "land") return land(u, plot);
      if (m === "patrol" || m === "bomb") return fly(u, m, plot);
      return order({ t: "machine", machine: u.id, do: "move", to: plot });
    },
    ringFor(plot, sx, sy) {
      const u = mine();
      if (!u || u.def.transport || u.def.freight) return [];
      if (isPlane(u)) return [
        ...(u.def.attack > 0 ? [{ id: "patrol", label: "Patrol here", icon: "ui_air_defence", run: () => fly(u, "patrol", plot) }] : []),
        ...(u.def.bomb ? [{ id: "bomb", label: "Bomb here", icon: "ui_blast_radius", run: () => fly(u, "bomb", plot) }] : []),
        { id: "home", label: "Fly home", icon: "ui_flag", run: () => fly(u, "return") },
        { id: "pilot", label: "Pilot", icon: "cursor_attack", run: () => game.startPilot("m", u.id) },
      ];
      const onLand = isLand(w().terrain[plot]), ship = isShip(u), items = [];
      const s = ship ? null : ownStackAt(sx, sy);
      if (s) items.push({ id: "follow", label: "Follow stack", note: fmt(s.troops), icon: "ui_eye", run: () => follow(u, s) });
      if (ship && onLand && u.cargo) items.push({ id: "land", label: "Land troops", note: fmt(u.cargo), icon: "ui_flag", run: () => land(u, plot) });
      if (ship !== onLand) items.push({ id: "move", label: ship ? "Sail here" : "Move here", icon: "cursor_move", run: () => order({ t: "machine", machine: u.id, do: "move", to: plot }) });
      items.push({ id: "stop", label: "Stop", icon: "ui_pause", run: () => act.stop() });
      items.push({ id: "pilot", label: "Pilot", icon: "cursor_attack", run: () => game.startPilot("m", u.id) });
      return items;
    },
    update() {
      const world = w(), u = world?.machines.get(game.selectedMachine);
      if (!u) {
        if (game.selectedMachine !== null) game.selectMachine(null);
        box.hidden = true;
        return;
      }
      box.hidden = false;
      drawRoute(u);
      const yours = u.owner === world.you, owner = world.nations.get(u.owner)?.name ?? "someone", name = u.def.name.toLowerCase();
      title.textContent = yours ? `Your ${name}` : `${owner}'s ${name}`;
      info.textContent = ` ${u.state === "wreck" ? "" : `${Math.ceil(u.hp)} of ${u.def.hp} health, `}${statusOf(u)}`;
      cargo.textContent = u.air && u.def.bomb && u.state !== "wreck" ? (u.air.bombs ? "Bombs aboard: it drops them where it is sent." : "No bombs aboard: it rearms at its airfield.") : u.def.freight && u.state !== "wreck" ? "Sailing to another port with trade: both ends earn gold when it arrives." : u.def.transport && u.state !== "wreck" ? `${fmt(u.cargo)} troops aboard.` : isShip(u) && u.def.capacity && u.state !== "wreck" ? `${fmt(u.cargo)} of ${u.def.capacity} troops aboard.` : "";
      cargo.hidden = !cargo.textContent;
      desc.textContent = u.def.description ?? "";
      hint.textContent = mode === "patrol" ? "Click where it should patrol." : mode === "bomb" ? "Click what it should bomb."
        : isPlane(u) && yours && u.state !== "wreck" && !world.frozen ? "Right-click the map for its orders. It flies home by itself when its fuel runs low."
        : mode === "move" ? (isShip(u) ? "Click the water to sail to." : "Click where it should go.")
        : mode === "follow" ? "Click one of your stacks."
        : mode === "land" ? "Click the coast to land the troops on."
        : u.def.transport ? "It sails on its own and lands where the troops were sent."
        : u.def.freight ? "It sails on its own between your ports."
        : yours && u.state !== "wreck" && !world.frozen ? (isShip(u) ? "Right-click the map for its orders: sail, or land the troops aboard on a coast." : "Right-click the map for its orders: move, or follow one of your stacks.") : "";
      hint.classList.toggle("fine-only", !mode);
      const k = `${u.id}:${yours}:${mode}:${u.state}:${!!u.cargo}:${world.frozen}:${u.air?.bombs ?? ""}`;
      if (k === key) return;
      key = k;
      const can = yours && u.state !== "wreck" && !world.frozen && !u.def.transport && !u.def.freight;
      const list = !can ? [] : mode ? [el("button", { text: "Cancel", onclick: cancel })] : isPlane(u) ? [
        ...(u.def.attack > 0 ? [el("button", { id: "plane-patrol", class: "primary", text: "Patrol", title: "click a spot: it circles there and shoots down enemy planes", onclick: () => act.patrol() })] : []),
        ...(u.def.bomb ? [el("button", { id: "plane-bomb", class: "primary", text: "Bomb", title: "click a spot: it flies there, drops its bombs and comes home", onclick: () => act.bomb() })] : []),
        el("button", { id: "plane-home", text: "Fly home", onclick: () => act.home() }),
        el("button", { id: "machine-pilot", title: "fly it yourself", onclick: () => game.startPilot("m", u.id) }, "Pilot ", keyTag("pilot")),
      ] : [
        el("button", { id: "machine-move", onclick: () => act.move() }, "Move ", keyTag("move")),
        isShip(u)
          ? el("button", { id: "machine-land", text: "Land troops", disabled: !u.cargo, title: "click the coast to put the troops ashore", onclick: () => act.land() })
          : el("button", { id: "machine-follow", text: "Follow a stack", title: "keeps beside the stack and adds its attack in battle", onclick: () => act.follow() }),
        el("button", { id: "machine-stop", text: "Stop", onclick: () => act.stop() }),
        el("button", { id: "machine-pilot", title: "steer it yourself, aim and fire", onclick: () => game.startPilot("m", u.id) }, "Pilot ", keyTag("pilot")),
      ];
      actions.replaceChildren(...list, el("button", { text: "Close", onclick: () => game.selectMachine(null) }));
    },
  };
}
