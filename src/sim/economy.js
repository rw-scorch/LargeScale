import { effectOf } from "./effects.js";
import { installBuildings, addBuilding, footprint, removeBuilding } from "./buildings.js";
import { UNIT_TYPES } from "./units.js";
import { placeView } from "./construction.js";
import { placeError } from "../shared/buildings.js";
import rules from "../../data/rules.json" with { type: "json" };

export const ECON_RULES = rules.economy;

export function installEconomy(world, cfg = {}) {
  installBuildings(world);
  const r = { ...ECON_RULES, ...cfg };
  world.econ = { rules: r };
  const pay = (w, dt) => {
    for (const n of w.nations.values()) {
      if (!n.human || !n.spawned || !n.alive) continue;
      if (n.money === undefined) grantKit(w, n, r);
      n.money += ((n.income ?? r.baseIncome) + (n.pop ?? 0) * r.taxPerResident * (n.taxLevel ?? 1)) * (1 + effectOf(w, n, "income")) * (n.outputMult ?? 1) * dt;
    }
  };
  pay.rank = 1;
  world.hooks.postTick.push(pay);
  return world.econ;
}

export function convertToGold(world, r = ECON_RULES) {
  const worth = r.worth, table = world.bld.table, out = { gold: 0, removed: 0, wagons: 0, ships: 0 };
  const give = (n, g) => { if (n?.money !== undefined && g > 0) { n.money += g; out.gold += g; } };
  const value = goods => Object.entries(goods ?? {}).reduce((s, [k, v]) => s + Math.max(0, v) * (worth[k] ?? 1), 0);
  for (const n of world.nations.values()) {
    give(n, value(n.stock));
    for (const k of ["stock", "stored", "camp", "made", "madeEvery", "wagons"]) delete n[k];
  }
  for (const b of [...world.bld.list.values()]) {
    for (const k of ["goods", "need", "held", "want", "keep", "short"]) delete b[k];
    const d = table[b.type];
    if (!d?.retired) continue;
    if (b.state !== "rubble") give(world.nations.get(b.owner), d.cost.money ?? 0);
    removeBuilding(world, b.id);
    out.removed++;
  }
  for (const s of [...world.stacks.values()]) {
    for (const k of ["supplyMult", "outFor", "follow"]) delete s[k];
    if (s.kind !== "supply") continue;
    give(world.nations.get(s.owner), (s.supplies ?? 0) * (worth.food ?? 1));
    world.stacks.delete(s.id);
    out.wagons++;
  }
  for (const u of [...(world.units?.list.values() ?? [])]) if (UNIT_TYPES[u.type]?.freight && !u.trade) { world.units.list.delete(u.id); out.ships++; }
  out.gold = Math.round(out.gold);
  return out;
}

export function grantKit(world, n, r = ECON_RULES) {
  n.money = r.startMoney;
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
