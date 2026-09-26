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
  const box = el("section", { id: "machine-panel", class: "panel bottom", hidden: true }, el("div", { class: "row" }, title, info), cargo, desc, hint, actions);
  root.append(box);
  let mode = null, key = "";

  const w = () => game.world;
  const isShip = u => u.def.domain === "sea";
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

  const act = {
    move() { if (mine()) { cancel(); mode = "move"; } },
    follow() { const u = mine(); if (u && !isShip(u)) { cancel(); mode = "follow"; } },
    land() { const u = mine(); if (u && isShip(u) && u.cargo) { cancel(); mode = "land"; } },
    stop() { const u = mine(); if (u) order({ t: "machine", machine: u.id, do: "stop" }); },
  };

  const statusOf = u => {
    if (u.state === "wreck") return STATE_TEXT.wreck;
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
      return order({ t: "machine", machine: u.id, do: "move", to: plot });
    },
    async secondary(plot, sx, sy) {
      const u = mine();
      if (!u) return;
      cancel();
      const s = isShip(u) ? null : ownStackAt(sx, sy);
      if (s) return follow(u, s);
      if (isShip(u) && u.cargo && isLand(w().terrain[plot])) return land(u, plot);
      return order({ t: "machine", machine: u.id, do: "move", to: plot });
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
      cargo.textContent = isShip(u) && u.def.capacity && u.state !== "wreck" ? `${fmt(u.cargo)} of ${u.def.capacity} troops aboard.` : "";
      cargo.hidden = !cargo.textContent;
      desc.textContent = u.def.description ?? "";
      hint.textContent = mode === "move" ? (isShip(u) ? "Click the water to sail to." : "Click where it should go.")
        : mode === "follow" ? "Click one of your stacks."
        : mode === "land" ? "Click the coast to land the troops on."
        : yours && u.state !== "wreck" && !world.frozen ? (isShip(u) ? "Right-click water to sail there. With troops aboard, right-click the coast to land them." : "Right-click to send it, or right-click one of your stacks to follow it.") : "";
      hint.classList.toggle("fine-only", !mode);
      const k = `${u.id}:${yours}:${mode}:${u.state}:${!!u.cargo}:${world.frozen}`;
      if (k === key) return;
      key = k;
      const can = yours && u.state !== "wreck" && !world.frozen;
      const list = !can ? [] : mode ? [el("button", { text: "Cancel", onclick: cancel })] : [
        el("button", { id: "machine-move", onclick: () => act.move() }, "Move ", keyTag("move")),
        isShip(u)
          ? el("button", { id: "machine-land", text: "Land troops", disabled: !u.cargo, title: "click the coast to put the troops ashore", onclick: () => act.land() })
          : el("button", { id: "machine-follow", text: "Follow a stack", title: "keeps beside the stack and adds its attack in battle", onclick: () => act.follow() }),
        el("button", { id: "machine-stop", text: "Stop", onclick: () => act.stop() }),
      ];
      actions.replaceChildren(...list, el("button", { text: "Close", onclick: () => game.selectMachine(null) }));
    },
  };
}
