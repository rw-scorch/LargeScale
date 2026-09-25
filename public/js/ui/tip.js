import { el } from "./dom.js";
import { TERRAIN } from "../shared/terrain.js";

const pretty = s => s.replace(/_/g, " ");

export function createTip(root, game) {
  const swatch = el("i", { class: "swatch" });
  const name = el("b");
  const more = el("span", { class: "muted" });
  const box = el("div", { id: "plot-tip", class: "tip", hidden: true }, swatch, name, more);
  root.append(box);
  let pinnedUntil = 0, pinnedAt = null;

  const describe = plot => {
    const w = game.world, t = TERRAIN[w.terrain[plot]], o = w.owner[plot], n = o ? w.nations.get(o) : null;
    const b = w.buildingAt(plot), extra = [pretty(t.name), b?.def?.name].filter(Boolean).join(", ");
    if (!t.land) return { colour: null, title: "Water", extra: pretty(t.name) };
    if (!n) return { colour: null, title: "Unclaimed", extra };
    return { colour: n.colour, title: o === w.you ? "Your land" : `${n.name}${n.bot ? " (bot)" : ""}`, extra };
  };

  return {
    pin(sx, sy, ms = 2500) { pinnedAt = [sx, sy]; pinnedUntil = performance.now() + ms; this.update(); },
    update() {
      const w = game.world, v = game.view;
      const at = game.hover ?? (performance.now() < pinnedUntil ? pinnedAt : null);
      const plot = at && !game.building && !game.zoning && !game.placing && !game.stack.choosing ? game.plotAt(...at) : null;
      if (plot === null || !w?.ready || !v) { box.hidden = true; return; }
      const d = describe(plot);
      swatch.hidden = !d.colour;
      if (d.colour) swatch.style.background = d.colour;
      name.textContent = d.title;
      more.textContent = d.extra ?? "";
      box.hidden = false;
      const r = v.ratio ?? 1, x = at[0] / r + 14, y = at[1] / r + 16;
      box.style.left = `${Math.min(x, innerWidth - box.offsetWidth - 4)}px`;
      box.style.top = `${Math.min(y, innerHeight - box.offsetHeight - 4)}px`;
    },
  };
}
