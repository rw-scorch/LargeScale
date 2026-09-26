import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { isLand } from "../shared/terrain.js";
import { ERA_NAMES } from "../shared/buildings.js";

export function createNationCard(root, game) {
  const swatch = el("i", { class: "swatch" });
  const title = el("b", { id: "nation-title" });
  const badge = el("span");
  const facts = el("div", { id: "nation-facts", class: "facts" });
  const attack = el("button", { id: "nation-attack", class: "primary", onclick: () => pick && game.attackAt(pick.plot) });
  const box = el("section", { id: "nation-card", class: "panel card", hidden: true },
    el("div", { class: "row" }, swatch, title, badge), facts,
    el("div", { class: "row wrap" }, attack,
      el("button", { id: "nation-capital", text: "Their capital", onclick: () => { const n = game.world?.nations.get(pick?.id); if (n?.capital != null) game.focus(n.capital, Math.max(game.view.cam.scale / game.view.ratio, 5)); } }),
      el("button", { text: "Close", onclick: () => game.selectNation(null) })));
  root.append(box);
  let pick = null, land = 0, key = "";

  return {
    get id() { return pick?.id ?? null; },
    show(id, plot) { pick = id === null ? null : { id, plot }; key = ""; this.update(); },
    update() {
      const w = game.world, n = pick && w?.nations.get(pick.id);
      if (!n || !n.spawned) { box.hidden = true; if (pick) pick = null; return; }
      box.hidden = false;
      if (!land) for (let i = 0; i < w.terrain.length; i++) if (isLand(w.terrain[i])) land++;
      const ranked = [...w.nations.values()].filter(x => x.spawned).sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0));
      const me = w.nations.get(w.you), online = !n.bot && w.online?.has(n.id), share = ((n.plots ?? 0) / Math.max(1, land)) * 100;
      const k = `${n.id}:${n.plots}:${fmt(n.troops ?? 0)}:${n.era}:${n.alive}:${online}:${fmt((me?.troops ?? 0) * game.hud.share)}:${w.frozen}`;
      if (k === key) return;
      key = k;
      swatch.style.background = n.colour;
      title.textContent = n.name;
      badge.replaceChildren(n.bot ? el("span", { class: "muted", text: "bot" }) : el("i", { class: `dot ${online ? "on" : "off"}`, title: online ? "online now" : "away" }), n.bot ? "" : el("span", { class: "muted", text: online ? "online" : "away" }));
      facts.replaceChildren(...[
        el("span", {}, icon(`era_badge_${n.era ?? "T"}`, 1), ` ${ERA_NAMES[n.era ?? "T"] ?? n.era} era`),
        el("span", { text: `Rank ${ranked.indexOf(n) + 1} of ${ranked.length}` }),
        el("span", { text: `${fmt(n.plots ?? 0)} plots, ${share >= 0.1 ? share.toFixed(1) : share.toFixed(2)}% of the land` }),
        el("span", {}, icon("res_troops", 1), ` ${fmt(n.troops ?? 0)} troops${me?.troops ? `, you have ${fmt(me.troops)}` : ""}`),
        n.alive === false ? el("span", { class: "why", text: "Eliminated" }) : null].filter(Boolean));
      const can = n.id !== w.you && n.alive !== false && me?.spawned && me.alive && !w.frozen;
      attack.hidden = !can;
      attack.textContent = `Attack with ${fmt((me?.troops ?? 0) * game.hud.share)}`;
      attack.title = "forms a stack at your land nearest this nation, sized by the Stack slider, that takes only their land";
    },
  };
}
