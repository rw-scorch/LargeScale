import { TERRAIN, TID } from "./terrain.js";
import { MinHeap } from "./heap.js";

export const ROAD_TYPES = ["none", "dirt", "cobble", "paved", "highway", "rail", "tunnel"];
export const ROAD_MULT = [1, 0.6, 0.45, 0.3, 0.2, 0.12, 0.4];
export const ROAD_NAMES = { dirt: "Dirt road", cobble: "Cobbled road", paved: "Paved road", highway: "Highway", rail: "Railway", tunnel: "Tunnel" };
export const TUNNEL = ROAD_TYPES.indexOf("tunnel");
export const BRIDGE_NAMES = { dirt: "Wooden bridge", cobble: "Stone bridge", rail: "Railway bridge" };
export const ROAD_RULES = {
  types: { dirt: { cost: { money: 1 } }, cobble: { cost: { money: 6 }, needs: "road_cobble" }, rail: { cost: { money: 12 }, needs: "rail" } },
  bridge: 5, rough: 4, roughMove: 3, maxPoints: 64, maxPlots: 400, routeNodes: 40000, connectMax: 2000, autoEvery: 20,
};

const DIRS = [[1, "N"], [2, "E"], [4, "S"], [8, "W"]];
const maskName = m => DIRS.filter(([b]) => m & b).map(d => d[1]).join("") || "dot";

export function roadLine(w, points) {
  const out = [];
  const add = i => { if (out[out.length - 1] !== i) out.push(i); };
  for (let k = 0; k < points.length; k++) {
    const b = points[k];
    if (k === 0) { add(b); continue; }
    const a = points[k - 1];
    let x = a % w, y = (a / w) | 0, ix = 0, iy = 0;
    const bx = b % w, by = (b / w) | 0, dx = Math.abs(bx - x), dy = Math.abs(by - y), sx = Math.sign(bx - x), sy = Math.sign(by - y);
    while (ix < dx || iy < dy) {
      if ((1 + 2 * ix) * dy < (1 + 2 * iy) * dx) { x += sx; ix++; } else { y += sy; iy++; }
      add(y * w + x);
    }
  }
  return out;
}

export const bridgeAt = (terrain, i) => terrain[i] === TID.river;
export const roughAt = (terrain, i, rules = ROAD_RULES) => TERRAIN[terrain[i]].move >= rules.roughMove;

export function roadPrice(kind, terrain, plots, rules = ROAD_RULES, scale = 1) {
  const base = rules.types[kind]?.cost ?? {}, out = {};
  let bridges = 0;
  for (const i of plots) {
    const f = (bridgeAt(terrain, i) ? rules.bridge : 1) * (roughAt(terrain, i, rules) ? rules.rough : 1);
    if (bridgeAt(terrain, i)) bridges++;
    for (const [k, v] of Object.entries(base)) out[k] = (out[k] ?? 0) + (v * f) / scale;
  }
  for (const k of Object.keys(out)) out[k] = Math.ceil(out[k]);
  return { cost: out, bridges };
}

export function roadPlan(view, nid, points, kind, rules = ROAD_RULES, scale = 1) {
  const { w, terrain, road, owner } = view;
  if (!Array.isArray(points) || points.length < 1 || points.length > rules.maxPoints) return { error: `a road needs 1 to ${rules.maxPoints} points` };
  if (points.some(p => !Number.isInteger(p) || p < 0 || p >= terrain.length)) return { error: "a road point is off the map" };
  const line = roadLine(w, points);
  if (line.length > rules.maxPlots) return { error: `at most ${rules.maxPlots} plots of road at a time` };
  const level = ROAD_TYPES.indexOf(kind);
  if (kind === "none") {
    const plots = line.filter(i => road[i] && owner[i] === nid);
    return { plots, cost: {}, bridges: 0, skipped: line.length - plots.length };
  }
  if (!rules.types[kind]) return { error: kind === "paved" || kind === "highway" || kind === "rail" ? "that road comes with a later era" : "unknown road type" };
  for (const i of line) {
    const t = TERRAIN[terrain[i]];
    if (!t.land) return { error: "a road cannot cross water; build it along the shore", at: i };
    if (t.move === Infinity) return { error: `a road cannot cross ${t.name.replace(/_/g, " ")}`, at: i };
    if (owner[i] !== nid) return { error: "roads go on your own land", at: i };
    if (view.blocked?.(i)) return { error: "a building stands in the way", at: i };
  }
  const plots = line.filter(i => road[i] < level);
  return { plots, ...roadPrice(kind, terrain, plots, rules, scale), skipped: line.length - plots.length };
}

export function roadRoute(view, nid, starts, isGoal, kind, rules = ROAD_RULES, target = null) {
  const { w, terrain, road, owner } = view, size = terrain.length, level = Math.max(1, ROAD_TYPES.indexOf(kind));
  const blocked = i => !!view.blocked?.(i);
  const step = i => {
    const t = TERRAIN[terrain[i]];
    if (!t.land || t.move === Infinity || owner[i] !== nid) return Infinity;
    if (road[i] >= level) return 0.25;
    return (bridgeAt(terrain, i) ? rules.bridge : 1) * (roughAt(terrain, i, rules) ? rules.rough : 1);
  };
  const tx = target === null ? 0 : target % w, ty = target === null ? 0 : (target / w) | 0;
  const h = target === null ? () => 0 : i => (Math.abs((i % w) - tx) + Math.abs(((i / w) | 0) - ty)) * 0.25;
  const g = new Map(), from = new Map(), open = new MinHeap();
  for (const s of starts) if (!g.has(s)) { g.set(s, 0); open.push(h(s), s); }
  let seen = 0;
  while (open.size) {
    const cur = open.pop();
    if (isGoal(cur) && !starts.includes(cur)) {
      const path = [cur];
      for (let p = cur; from.has(p); ) { p = from.get(p); path.push(p); }
      return path.reverse();
    }
    if (++seen > (rules.routeNodes ?? 40000)) return null;
    const gc = g.get(cur), x = cur % w;
    for (const n of [cur - w, x < w - 1 ? cur + 1 : -1, cur + w, x > 0 ? cur - 1 : -1]) {
      if (n < 0 || n >= size) continue;
      const goal = isGoal(n);
      if (blocked(n) && !goal) continue;
      const c = step(n);
      if (!(c < Infinity) && !(goal && blocked(n))) continue;
      const ng = gc + (c < Infinity ? c : 0);
      if (ng < (g.get(n) ?? Infinity)) { g.set(n, ng); from.set(n, cur); open.push(ng + h(n), n); }
    }
  }
  return null;
}

export function routePlan(view, nid, from, to, kind, rules = ROAD_RULES, scale = 1) {
  const { terrain, road } = view;
  if (![from, to].every(p => Number.isInteger(p) && p >= 0 && p < terrain.length)) return { error: "a road point is off the map" };
  if (!rules.types[kind]) return { error: "unknown road type" };
  if (from === to) return { error: "pick two different points" };
  const path = roadRoute(view, nid, [from], i => i === to, kind, rules, to);
  if (!path) return { error: "there is no way to lay a road between those points over your own land" };
  const level = ROAD_TYPES.indexOf(kind), line = path.filter(i => !view.blocked?.(i));
  const plots = line.filter(i => road[i] < level);
  if (plots.length > rules.maxPlots) return { error: `that road would be ${plots.length} plots; at most ${rules.maxPlots} at a time` };
  return { plots, line, ...roadPrice(kind, terrain, plots, rules, scale), skipped: line.length - plots.length };
}

export function roadSprite(road, terrain, w, i) {
  const x = i % w;
  let m = 0;
  if (i >= w && road[i - w]) m |= 1;
  if (x < w - 1 && road[i + 1]) m |= 2;
  if (i + w < road.length && road[i + w]) m |= 4;
  if (x > 0 && road[i - 1]) m |= 8;
  const kind = ROAD_TYPES[road[i]];
  if (kind === "tunnel") return [i - w, i + 1, i + w, i - 1].filter(j => j >= 0 && j < road.length && road[j] === road[i]).length <= 1 ? "tunnel_entrance" : null;
  const across = m & 10 && !(m & 5) ? "h" : "v";
  if (kind === "rail") return terrain[i] === TID.river ? `bridge_steel_${across}` : `rail_${maskName(m)}`;
  if (terrain[i] === TID.river) return `bridge_${road[i] >= 2 ? "stone" : "wood"}_${across}`;
  if (TERRAIN[terrain[i]].move >= ROAD_RULES.roughMove) return `road_mountain_${maskName(m)}`;
  return `road_${kind}_${maskName(m)}`;
}

export function roadName(road, terrain, i) {
  const kind = ROAD_TYPES[road[i]];
  if (!road[i]) return null;
  return terrain[i] === TID.river && BRIDGE_NAMES[kind] ? BRIDGE_NAMES[kind] : ROAD_NAMES[kind];
}
