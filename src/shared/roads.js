import { TERRAIN, TID } from "./terrain.js";

export const ROAD_TYPES = ["none", "dirt", "cobble", "paved", "highway", "rail"];
export const ROAD_MULT = [1, 0.6, 0.45, 0.3, 0.2, 0.12];
export const ROAD_NAMES = { dirt: "Dirt road", cobble: "Cobbled road", paved: "Paved road", highway: "Highway", rail: "Railway" };
export const BRIDGE_NAMES = { dirt: "Wooden bridge", cobble: "Stone bridge" };
export const ROAD_RULES = {
  types: { dirt: { cost: { money: 1 } }, cobble: { cost: { money: 3, stone: 1 }, needs: "road_cobble" } },
  bridge: 5, rough: 4, roughMove: 3, maxPoints: 64, maxPlots: 400,
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
  }
  const plots = line.filter(i => road[i] < level);
  return { plots, ...roadPrice(kind, terrain, plots, rules, scale), skipped: line.length - plots.length };
}

export function roadSprite(road, terrain, w, i) {
  const x = i % w;
  let m = 0;
  if (i >= w && road[i - w]) m |= 1;
  if (x < w - 1 && road[i + 1]) m |= 2;
  if (i + w < road.length && road[i + w]) m |= 4;
  if (x > 0 && road[i - 1]) m |= 8;
  const kind = ROAD_TYPES[road[i]];
  if (kind === "rail") return `rail_${maskName(m)}`;
  if (terrain[i] === TID.river) return `bridge_${road[i] >= 2 ? "stone" : "wood"}_${m & 10 && !(m & 5) ? "h" : "v"}`;
  if (TERRAIN[terrain[i]].move >= ROAD_RULES.roughMove) return `road_mountain_${maskName(m)}`;
  return `road_${kind}_${maskName(m)}`;
}

export function roadName(road, terrain, i) {
  const kind = ROAD_TYPES[road[i]];
  if (!road[i]) return null;
  return terrain[i] === TID.river && BRIDGE_NAMES[kind] ? BRIDGE_NAMES[kind] : ROAD_NAMES[kind];
}
