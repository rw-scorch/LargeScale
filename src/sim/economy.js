import { effectOf } from "./effects.js";
import { installBuildings, addBuilding, footprint } from "./buildings.js";
import { placeView } from "./construction.js";
import { placeError } from "../shared/buildings.js";
import rules from "../../data/rules.json" with { type: "json" };

export const ECON_RULES = rules.economy;

export function installEconomy(world, cfg = {}) {
  installBuildings(world);
  const r = { ...ECON_RULES, ...cfg };
  world.econ = { rules: r };
  world.hooks.postTick.push((w, dt) => {
    for (const n of w.nations.values()) {
      if (!n.human || !n.spawned || !n.alive) continue;
      if (n.money === undefined) grantKit(w, n, r);
      n.money += ((n.income ?? r.baseIncome) + (n.pop ?? 0) * (n.tax ?? r.taxPerResident)) * (1 + effectOf(w, n, "income")) * dt;
    }
  });
  return world.econ;
}

export function grantKit(world, n, r = ECON_RULES) {
  n.money = r.startMoney;
  n.stock = { ...rules.civilians.startStock, ...n.stock };
  n.era ??= "T";
  const at = kitSpot(world, n, r);
  if (at === null) return null;
  const b = addBuilding(world, { type: r.kit, owner: n.id, anchor: at, plots: footprint(world, at, world.bld.table[r.kit].fp), state: "active", progress: 1 });
  world.emit("kit", { nation: n.id, building: b.id });
  return b;
}

function kitSpot(world, n, r) {
  if (n.capital === undefined || n.capital === null) return null;
  const g = world.grid, cx = g.x(n.capital), cy = g.y(n.capital), spots = [];
  for (let dy = -r.kitSearch; dy <= r.kitSearch; dy++) for (let dx = -r.kitSearch; dx <= r.kitSearch; dx++) {
    if (g.inside(cx + dx, cy + dy)) spots.push([Math.abs(dx + 0.5) + Math.abs(dy + 0.5), g.idx(cx + dx, cy + dy)]);
  }
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const view = { ...placeView(world, n.id), lockOf: null }, def = world.bld.table[r.kit];
  for (const [, at] of spots) if (!placeError(view, n, def, at)) return at;
  return null;
}
