import { el } from "./dom.js";
import { TERRAIN } from "../shared/terrain.js";
import { ERA_ORDER } from "../shared/buildings.js";

const pretty = s => s.replace(/_/g, " ");
const eraRank = e => ERA_ORDER.indexOf(e);

export function createTip(root, game) {
  const swatch = el("i", { class: "swatch" });
  const name = el("b");
  const more = el("span", { class: "muted" });
  const box = el("div", { id: "plot-tip", class: "tip", hidden: true }, swatch, name, more);
  root.append(box);
  let pinnedUntil = 0, pinnedAt = null, diggers = null;

  const digger = (w, id) => {
    if (!diggers) {
      diggers = new Map();
      const defs = Object.values(w.defs.table).filter(d => d.producer?.kind === "deposit").sort((a, b) => a.num - b.num);
      for (const d of defs) for (const dep of d.producer.deposits) if (!diggers.has(dep) || eraRank(d.era) < eraRank(diggers.get(dep).era)) diggers.set(dep, d);
    }
    return diggers.get(id) ?? null;
  };
  const oreText = (w, plot, b) => {
    const d = w.depositKind?.(plot);
    if (!d) return null;
    if (d.depleted) return `${d.name}, used up`;
    const by = !b && digger(w, d.id);
    return by ? `${d.name}, for a ${by.name}` : d.name;
  };

  const machineTip = (w, u) => {
    const n = w.nations.get(u.owner), whose = u.owner === w.you ? "Your" : `${n?.name ?? "Someone"}'s`;
    const bits = u.state === "wreck" ? ["wreck"] : [`${Math.ceil(u.hp)} of ${u.def.hp} health`, ...(u.def.capacity ? [`${u.cargo} of ${u.def.capacity} troops aboard`] : [])];
    return { colour: n?.colour ?? null, title: `${whose} ${u.def.name.toLowerCase()}`, extra: bits.join(", ") };
  };

  const describe = plot => {
    const w = game.world, t = TERRAIN[w.terrain[plot]], o = w.owner[plot], n = o ? w.nations.get(o) : null;
    const b = w.buildingAt(plot), ore = oreText(w, plot, b), fort = o ? w.fortAt(o, plot) : 1;
    const extra = [pretty(t.name), b?.def?.name, ore, fort > 1 ? `fortified, defends at ${fort} times` : null].filter(Boolean).join(", ");
    if (!t.land) return { colour: null, title: "Water", extra: [pretty(t.name), ore].filter(Boolean).join(", ") };
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
      const mid = v.machineAt?.(...at), u = mid === null || mid === undefined ? null : w.machines.get(mid);
      const d = u ? machineTip(w, u) : describe(plot);
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
