import { TERRAIN } from "./terrain.js";
import { ROAD_MULT } from "./roads.js";
import { costMap } from "./pathfind.js";

export function supplyCostOf({ terrain, owner, road }, nid, passable = () => false) {
  return (a, b) => {
    const o = owner[b];
    if (o !== nid && !(o && passable(nid, o))) return Infinity;
    const t = TERRAIN[terrain[b]];
    return t.land && t.move < Infinity ? t.move * ROAD_MULT[road?.[b] ?? 0] : Infinity;
  };
}

export function reachMap(grid, view, nid, sources, range, passable) {
  return sources.length ? costMap(grid, sources, supplyCostOf(view, nid, passable), range) : new Map();
}
