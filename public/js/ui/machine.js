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
  const low = s => (/^[A-Z]{2}/.test(s) ? s : s.toLowerCase());
  const carrier = u => u.def.domain === "land" && !!u.def.capacity;
  const lift = u => isPlane(u) && !!u.def.capacity;
  const striker = u => isPlane(u) && !!u.def.strike;
  const dropWord = u => (u.def.paraOnly ? "Drop paratroopers" : "Land troops");
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
  const follow = (u, s) => order({ t: "machine", machine: u.id, do: "follow", stack: s.id }, () => game.toast(`The ${low(u.def.name)} follows that stack.`));
  const land = (u, plot) => order({ t: "machine", machine: u.id, do: "land", at: plot }, () => game.toast(carrier(u) ? `The ${u.def.name} drives there and sets ${fmt(u.cargo)} troops down.` : `The ${low(u.def.name)} sails there to land ${fmt(u.cargo)} troops.`));

  const flyText = { bomb: "flies to bomb that spot", patrol: "flies to patrol there", strike: "flies there to hover and fire on enemy troops and vehicles", drop: "flies there to drop its paratroopers", land: "flies there to set its troops down" };
  const fly = (u, what, plot) => order({ t: "air", plane: u.id, do: what, ...(plot === undefined ? {} : { at: plot }) }, r => game.toast(what === "return" ? `The ${low(u.def.name)} flies home.` : `The ${low(u.def.name)} ${flyText[what === "patrol" && striker(u) ? "strike" : what === "drop" && !u.def.paraOnly ? "land" : what]}${r.rearming ? ` once it has rearmed, in ${r.rearming} s` : ""}.`));
  const act = {
    patrol() { const u = mine(); if (u && isPlane(u) && u.def.attack > 0) { cancel(); mode = "patrol"; } },
    bomb() { const u = mine(); if (u && isPlane(u) && u.def.bomb) { cancel(); mode = "bomb"; } },
    drop() { const u = mine(); if (u && lift(u) && u.cargo) { cancel(); mode = "drop"; } },
    home() { const u = mine(); if (u && isPlane(u)) fly(u, "return"); },
    move() { if (mine()) { cancel(); mode = "move"; } },
    follow() { const u = mine(); if (u && !isShip(u)) { cancel(); mode = "follow"; } },
    land() { const u = mine(); if (u && (isShip(u) || carrier(u)) && u.cargo) { cancel(); mode = "land"; } },
    stop() { const u = mine(); if (u) order({ t: "machine", machine: u.id, do: "stop" }); },
  };

  const statusOf = u => {
    if (u.state === "wreck") return STATE_TEXT.wreck;
    if (u.air) {
      const A = u.air, fuel = `${fmt(A.fuel)} s of fuel`;
      if (A.landed) return A.queued ? "at its airfield, waiting for a free place to rearm" : A.rearm > 0 ? `at its airfield, rearming: ready in ${fmt(A.rearm)} s` : "at its airfield, ready";
      if (A.mission === "patrol" && striker(u)) return A.target ? `firing on the enemy, ${fuel}` : `hovering over the front, ${fuel}`;
      return A.mission === "patrol" ? `patrolling, ${fuel}` : A.mission === "bomb" ? `flying to bomb, ${fuel}` : A.mission === "drop" ? `flying to ${u.def.paraOnly ? "drop its paratroopers" : "set its troops down"}, ${fuel}` : `flying home, ${fuel}`;
    }
    const o = u.owner === w().you ? orderOf(u) : null;
    if (o?.land !== null && o?.land !== undefined) return carrier(u) ? "driving to set its troops down" : "sailing to land its troops";
    if (u.follow) {
      const s = w().stacks.get(u.follow);
      return s ? `following a stack of ${fmt(s.troops)}` : "following a stack";
    }
    return STATE_TEXT[u.state];
  };

  const cargoText = (u, yours) => {
    if (u.air && u.def.bomb) return u.air.bombs ? `${u.air.bombs === 1 ? "A bomb" : `${u.air.bombs} bombs`} aboard: it drops ${u.air.bombs === 1 ? "it" : "them"} where it is sent.` : "No bombs aboard: it rearms at its airfield.";
    if (u.def.freight) return "Sailing to another port with trade: both ends earn gold when it arrives.";
    if (u.def.transport) return `${fmt(u.cargo)} troops aboard.`;
    if (lift(u)) return `${fmt(u.cargo)} of ${u.def.capacity} troops aboard${u.def.paraOnly ? ", paratroopers only" : ""}.${u.cargo ? "" : " Select a company and right-click this while it is at its airfield to board it."}`;
    if ((isShip(u) || carrier(u)) && u.def.capacity) return `${fmt(u.cargo)} of ${u.def.capacity} troops aboard.${carrier(u) && u.cargo ? " They get off where it stops." : ""}`;
    const sam = u.def.sam && yours ? w().samOf(1, u.id) : null;
    if (sam) return `${sam.missiles} of ${sam.max} missiles${sam.reloadIn ? `, the next ready in ${sam.reloadIn} s` : ""}. It fires at enemy planes within ${u.def.sam.radius} plots.`;
    return "";
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
      if (m === "patrol" || m === "bomb" || m === "drop") return fly(u, m, plot);
      return order({ t: "machine", machine: u.id, do: "move", to: plot });
    },
    ringFor(plot, sx, sy) {
      const u = mine();
      if (!u || u.def.transport || u.def.freight) return [];
      if (isPlane(u)) return [
        ...(u.def.attack > 0 ? [{ id: "patrol", label: striker(u) ? "Strike here" : "Patrol here", icon: "ui_air_defence", run: () => fly(u, "patrol", plot) }] : []),
        ...(u.def.bomb ? [{ id: "bomb", label: "Bomb here", icon: "ui_blast_radius", run: () => fly(u, "bomb", plot) }] : []),
        ...(lift(u) && u.cargo && isLand(w().terrain[plot]) ? [{ id: "drop", label: `${dropWord(u)} here`, note: fmt(u.cargo), icon: "ui_flag", run: () => fly(u, "drop", plot) }] : []),
        { id: "home", label: "Fly home", icon: "ui_flag", run: () => fly(u, "return") },
        { id: "pilot", label: "Pilot", icon: "cursor_attack", run: () => game.startPilot("m", u.id) },
      ];
      const onLand = isLand(w().terrain[plot]), ship = isShip(u), items = [];
      const s = ship ? null : ownStackAt(sx, sy);
      if (s) items.push({ id: "follow", label: "Follow stack", note: fmt(s.troops), icon: "ui_eye", run: () => follow(u, s) });
      if (ship && onLand && u.cargo) items.push({ id: "land", label: "Land troops", note: fmt(u.cargo), icon: "ui_flag", run: () => land(u, plot) });
      if (carrier(u) && onLand && u.cargo) items.push({ id: "land", label: "Unload here", note: fmt(u.cargo), icon: "ui_flag", run: () => land(u, plot) });
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
      const yours = u.owner === world.you, owner = world.nations.get(u.owner)?.name ?? "someone", name = low(u.def.name);
      title.textContent = yours ? `Your ${name}` : `${owner}'s ${name}`;
      info.textContent = ` ${u.state === "wreck" ? "" : `${Math.ceil(u.hp)} of ${u.def.hp} health, `}${statusOf(u)}`;
      cargo.textContent = u.state === "wreck" ? "" : cargoText(u, yours);
      cargo.hidden = !cargo.textContent;
      desc.textContent = u.def.description ?? "";
      hint.textContent = mode === "patrol" ? (striker(u) ? "Click where it should hover and fire." : "Click where it should patrol.") : mode === "bomb" ? "Click what it should bomb." : mode === "drop" ? (u.def.paraOnly ? "Click where the paratroopers should jump." : "Click where to set the troops down.")
        : isPlane(u) && yours && u.state !== "wreck" && !world.frozen ? "Right-click the map for its orders. It flies home by itself when its fuel runs low."
        : mode === "move" ? (isShip(u) ? "Click the water to sail to." : "Click where it should go.")
        : mode === "follow" ? "Click one of your stacks."
        : mode === "land" ? (carrier(u) ? "Click where to set the troops down." : "Click the coast to land the troops on.")
        : u.def.transport ? "It sails on its own and lands where the troops were sent."
        : u.def.freight ? "It sails on its own between your ports."
        : yours && u.state !== "wreck" && !world.frozen ? (isShip(u) ? "Right-click the map for its orders: sail, or land the troops aboard on a coast." : carrier(u) ? "Right-click the map for its orders: move, unload, or follow one of your stacks. Select a stack and right-click this to board it." : "Right-click the map for its orders: move, or follow one of your stacks.") : "";
      hint.classList.toggle("fine-only", !mode);
      const k = `${u.id}:${yours}:${mode}:${u.state}:${!!u.cargo}:${world.frozen}:${u.air?.bombs ?? ""}:${u.air?.landed ?? ""}`;
      if (k === key) return;
      key = k;
      const can = yours && u.state !== "wreck" && !world.frozen && !u.def.transport && !u.def.freight;
      const list = !can ? [] : mode ? [el("button", { text: "Cancel", onclick: cancel })] : isPlane(u) ? [
        ...(u.def.attack > 0 ? [el("button", { id: "plane-patrol", class: "primary", text: striker(u) ? "Strike" : "Patrol", title: striker(u) ? "click a spot: it hovers there and fires on enemy companies and vehicles" : "click a spot: it circles there and shoots down enemy planes", onclick: () => act.patrol() })] : []),
        ...(lift(u) ? [el("button", { id: "plane-drop", class: "primary", text: dropWord(u), disabled: !u.cargo, title: u.def.paraOnly ? "click a spot: it flies there and the paratroopers jump" : "click a spot: it flies there and sets the troops down", onclick: () => act.drop() })] : []),
        ...(u.def.bomb ? [el("button", { id: "plane-bomb", class: "primary", text: "Bomb", title: "click a spot: it flies there, drops its bombs and comes home", onclick: () => act.bomb() })] : []),
        el("button", { id: "plane-home", text: "Fly home", onclick: () => act.home() }),
        el("button", { id: "machine-pilot", title: "fly it yourself", onclick: () => game.startPilot("m", u.id) }, "Pilot ", keyTag("pilot")),
      ] : [
        el("button", { id: "machine-move", onclick: () => act.move() }, "Move ", keyTag("move")),
        isShip(u)
          ? el("button", { id: "machine-land", text: "Land troops", disabled: !u.cargo, title: "click the coast to put the troops ashore", onclick: () => act.land() })
          : el("button", { id: "machine-follow", text: "Follow a stack", title: "keeps beside the stack and adds its attack in battle", onclick: () => act.follow() }),
        carrier(u) ? el("button", { id: "machine-unload", text: "Unload", disabled: !u.cargo, title: "click where the troops aboard should get off", onclick: () => act.land() }) : null,
        el("button", { id: "machine-stop", text: "Stop", onclick: () => act.stop() }),
        el("button", { id: "machine-pilot", title: "steer it yourself, aim and fire", onclick: () => game.startPilot("m", u.id) }, "Pilot ", keyTag("pilot")),
      ];
      actions.replaceChildren(...list, el("button", { text: "Close", onclick: () => game.selectMachine(null) }));
    },
  };
}
