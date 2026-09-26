import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";

const WINDOW = 15000, FRAME = 4000;

export function createAttacks(root, side, game) {
  const frame = el("div", { id: "alert-frame", hidden: true });
  const list = el("div", { class: "attack-list" });
  const box = el("section", { id: "attacks", class: "panel", hidden: true }, el("div", { class: "title" }, icon("alert_attack", 1), " Attacks"), list);
  root.append(frame);
  side.append(box);
  const seen = { in: new Map(), out: new Map() };
  let key = "";

  const bump = (m, id, e) => {
    const r = m.get(id) ?? { hits: [], at: null };
    r.hits.push([Date.now(), e.count ?? 1]);
    r.at = e.at ?? r.at;
    m.set(id, r);
  };
  const recent = m => {
    const cut = Date.now() - WINDOW, out = [];
    for (const [id, r] of m) {
      while (r.hits.length && r.hits[0][0] < cut) r.hits.shift();
      if (!r.hits.length) { m.delete(id); continue; }
      out.push({ id, plots: r.hits.reduce((a, h) => a + h[1], 0), at: r.at, last: r.hits.at(-1)[0] });
    }
    return out.sort((a, b) => b.plots - a.plots);
  };
  const show = at => at != null && game.focus(at, Math.max(game.view.cam.scale / game.view.ratio, 6));
  const halt = async s => {
    const r = await game.conn.request({ t: "halt", stack: s.id });
    if (!r.ok) game.toast(r.error ?? "could not stop the stack");
    key = "";
  };

  return {
    event(e) {
      const you = game.world?.you;
      if (e.type !== "plot_lost" || you === undefined) return;
      if (e.nation === you && e.by) bump(seen.in, e.by, e);
      else if (e.by === you && e.nation) bump(seen.out, e.nation, e);
    },
    update() {
      const w = game.world;
      if (!w?.ready) return;
      const now = Date.now(), incoming = recent(seen.in), outgoing = recent(seen.out);
      frame.hidden = !incoming.some(a => now - a.last < FRAME);
      const orders = new Map((w.purse?.orders ?? []).map(o => [o.id, o]));
      const mine = w.myStacks().filter(s => s.order === "advance").sort((a, b) => b.troops - a.troops);
      const took = new Map(outgoing.map(a => [a.id, a.plots]));
      const name = id => w.nations.get(id)?.name ?? "someone", colour = id => w.nations.get(id)?.colour ?? "#888";
      const k = [...incoming.map(a => `i${a.id}:${a.plots}`), ...mine.map(s => `o${s.id}:${fmt(s.troops)}:${orders.get(s.id)?.only}:${took.get(orders.get(s.id)?.only) ?? 0}`)].join();
      box.hidden = !incoming.length && !mine.length;
      if (k === key) return;
      key = k;
      list.replaceChildren(
        ...incoming.map(a => el("div", { class: "attack in", "data-attacker": a.id },
          el("i", { class: "swatch", style: `background:${colour(a.id)}` }),
          el("span", { class: "what", text: `${name(a.id)} took ${a.plots} of your plots` }),
          el("button", { class: "chip", text: "Show", onclick: () => show(a.at) }))),
        ...mine.map(s => {
          const only = orders.get(s.id)?.only ?? null, gain = only ? took.get(only) : null;
          const aim = only === 0 ? "unclaimed land" : only ? name(only) : "any land";
          return el("div", { class: "attack out", "data-stack": s.id },
            el("i", { class: "swatch", style: `background:${only ? colour(only) : "transparent"}` }),
            el("span", { class: "what", text: `${fmt(s.troops)} into ${aim}${gain ? `, ${gain} plots` : ""}`, onclick: () => show(s.pos) }),
            el("button", { class: "chip", "data-halt": s.id, text: "Stop", onclick: () => halt(s) }));
        }));
    },
  };
}
