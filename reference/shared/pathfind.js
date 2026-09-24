import { MinHeap } from "./heap.js";

export function findPath(grid, start, goal, cost, maxNodes = 200000) {
  if (start === goal) return [start];
  const g = new Map([[start, 0]]);
  const from = new Map();
  const open = new MinHeap();
  const gx = grid.x(goal), gy = grid.y(goal);
  const h = i => Math.abs(grid.x(i) - gx) + Math.abs(grid.y(i) - gy);
  const minStep = cost.minStep ?? 0.1;
  open.push(h(start) * minStep, start);
  let seen = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const path = [cur];
      let p = cur;
      while (from.has(p)) { p = from.get(p); path.push(p); }
      return path.reverse();
    }
    if (++seen > maxNodes) return null;
    const gc = g.get(cur);
    for (const n of grid.neighbours4(cur)) {
      const c = cost(cur, n);
      if (!(c < Infinity)) continue;
      const ng = gc + c;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        from.set(n, cur);
        open.push(ng + h(n) * minStep, n);
      }
    }
  }
  return null;
}

export function costField(grid, sources, cost, limit = Infinity) {
  const dist = new Float32Array(grid.size).fill(Infinity);
  const src = new Int32Array(grid.size).fill(-1);
  const open = new MinHeap();
  for (const s of sources) {
    dist[s.i] = s.d ?? 0;
    src[s.i] = s.id ?? s.i;
    open.push(dist[s.i], s.i);
  }
  while (open.size) {
    const d = open.peekKey();
    const cur = open.pop();
    if (d > dist[cur] || d > limit) continue;
    for (const n of grid.neighbours4(cur)) {
      const c = cost(cur, n);
      if (!(c < Infinity)) continue;
      const nd = d + c;
      if (nd < dist[n] && nd <= limit) {
        dist[n] = nd;
        src[n] = src[cur];
        open.push(nd, n);
      }
    }
  }
  return { dist, src };
}
