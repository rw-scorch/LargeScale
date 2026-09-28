import { roadLine } from "./roads.js";
import { TERRAIN } from "./terrain.js";

export const POWER_DEFAULTS = { every: 5, offGrid: 0.5, stock: 60, spacing: 3, maxPoles: 60, reach: 4 };

export function gridsOf(grid, nodes, users) {
  const n = nodes.length, parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const cell = Math.max(1, ...nodes.map(v => v.reach)), buckets = new Map();
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  nodes.forEach((v, i) => {
    v.x = grid.x(v.at);
    v.y = grid.y(v.at);
    const k = key(v.x, v.y);
    (buckets.get(k) ?? buckets.set(k, []).get(k)).push(i);
  });
  const near = (x, y) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...(buckets.get(`${cx + dx},${cy + dy}`) ?? []));
    return out;
  };
  nodes.forEach((v, i) => {
    for (const j of near(v.x, v.y)) {
      if (j <= i) continue;
      const u = nodes[j];
      if (Math.hypot(v.x - u.x, v.y - u.y) <= Math.max(v.reach, u.reach)) parent[root(i)] = root(j);
    }
  });
  const byRoot = new Map();
  nodes.forEach((v, i) => {
    const r = root(i);
    if (!byRoot.has(r)) byRoot.set(r, { nodes: [], users: [] });
    byRoot.get(r).nodes.push(v);
  });
  const grids = [...byRoot.values()].filter(g => g.nodes.some(v => v.make > 0));
  const gridOf = new Map();
  grids.forEach((g, k) => g.nodes.forEach(v => gridOf.set(v, k)));
  const userGrid = new Map();
  for (const u of users) {
    let best = null, bd = Infinity;
    for (const p of u.plots) {
      const x = grid.x(p), y = grid.y(p);
      for (const j of near(x, y)) {
        const v = nodes[j], d = Math.hypot(v.x - x, v.y - y);
        if (d <= v.reach && d < bd && gridOf.has(v)) { bd = d; best = gridOf.get(v); }
      }
    }
    if (best !== null) { userGrid.set(u.id, best); grids[best].users.push(u); }
  }
  return { grids, userGrid };
}

export function coverOf(grid, nodes, powered = () => true) {
  const out = new Uint8Array(grid.w * grid.h);
  for (const v of nodes) {
    const x0 = grid.x(v.at), y0 = grid.y(v.at), r = Math.floor(v.reach), mark = powered(v) ? 1 : 2;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h || dx * dx + dy * dy > v.reach * v.reach) continue;
      const i = y * grid.w + x;
      if (out[i] !== 1) out[i] = mark;
    }
  }
  return out;
}

export function polePlan(view, nid, points, rules = POWER_DEFAULTS) {
  const { w, terrain, owner } = view;
  if (!Array.isArray(points) || points.length < 1 || points.length > 64) return { error: "a line of poles needs 1 to 64 points" };
  if (points.some(p => !Number.isInteger(p) || p < 0 || p >= terrain.length)) return { error: "a point is off the map" };
  const line = roadLine(w, points), free = i => TERRAIN[terrain[i]].land && TERRAIN[terrain[i]].build && owner[i] === nid && !view.blocked?.(i) && !view.road?.[i];
  const poles = [], taken = new Set(), dist = (a, b) => Math.hypot((a % w) - (b % w), ((a / w) | 0) - ((b / w) | 0));
  let last = null, gaps = 0;
  const ok = j => free(j) && !taken.has(j) && (last === null || dist(last, j) <= rules.reach);
  const spot = i => {
    if (ok(i)) return i;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx >= 0 && ny >= 0 && nx < w && j < terrain.length && ok(j)) return j;
    }
    return null;
  };
  for (let k = 0; k < line.length; k++) {
    const i = line[k], end = k === line.length - 1;
    if (last !== null && Math.hypot((i % w) - (last % w), ((i / w) | 0) - ((last / w) | 0)) < rules.spacing && !end) continue;
    if (last !== null && end && Math.hypot((i % w) - (last % w), ((i / w) | 0) - ((last / w) | 0)) < 1.5) continue;
    let p = spot(i);
    if (p === null && last !== null && dist(last, i) > rules.reach) {
      last = null;
      gaps++;
      p = spot(i);
    }
    if (p === null) continue;
    poles.push(p);
    taken.add(p);
    last = p;
  }
  if (!poles.length) return { error: "there is no free plot of your own land on that line for a pole", line };
  if (poles.length > rules.maxPoles) return { error: `at most ${rules.maxPoles} poles at a time`, line };
  return { poles, line, gaps };
}
