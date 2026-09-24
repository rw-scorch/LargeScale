import { MinHeap } from "./heap.js";

export function search(grid, start, isGoal, h, cost, maxNodes = 200000) {
  if (isGoal(start)) return [start];
  const g = new Map([[start, 0]]);
  const from = new Map();
  const open = new MinHeap();
  open.push(h(start), start);
  let seen = 0;
  while (open.size) {
    const cur = open.pop();
    if (isGoal(cur)) {
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
        open.push(ng + h(n), n);
      }
    }
  }
  return null;
}

export function findPath(grid, start, goal, cost, maxNodes = 200000) {
  const gx = grid.x(goal), gy = grid.y(goal), minStep = cost.minStep ?? 0.1;
  return search(grid, start, i => i === goal, i => (Math.abs(grid.x(i) - gx) + Math.abs(grid.y(i) - gy)) * minStep, cost, maxNodes);
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

export function buildRegions(grid, terrain, moveByType, size = 16) {
  const moveOf = i => moveByType[terrain[i]];
  const { w, h } = grid, cw = Math.ceil(w / size), ch = Math.ceil(h / size), ncell = cw * ch;
  const label = new Uint8Array(grid.size), base = new Uint32Array(ncell + 1), stack = new Int32Array(size * size);
  const land = [], sum = [], cellOfRegion = [];
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      const c = cy * cw + cx, x0 = cx * size, y0 = cy * size, x1 = Math.min(w, x0 + size), y1 = Math.min(h, y0 + size);
      base[c] = land.length;
      let local = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (label[i] || !(moveOf(i) < Infinity)) continue;
          label[i] = ++local;
          let top = 0, n = 0, total = 0;
          stack[top++] = i;
          while (top) {
            const p = stack[--top], px = p % w, py = (p / w) | 0;
            n++;
            total += moveOf(p);
            for (let k = 0; k < 4; k++) {
              const qx = px + (k === 1) - (k === 3), qy = py + (k === 2) - (k === 0);
              if (qx < x0 || qy < y0 || qx >= x1 || qy >= y1) continue;
              const q = qy * w + qx;
              if (label[q] || !(moveOf(q) < Infinity)) continue;
              label[q] = local;
              stack[top++] = q;
            }
          }
          land.push(n);
          sum.push(total);
          cellOfRegion.push(c);
        }
    }
  const regions = land.length;
  base[ncell] = regions;
  const cellOf = i => ((i / w / size) | 0) * cw + (((i % w) / size) | 0);
  const regionOf = i => (label[i] ? base[cellOf(i)] + label[i] - 1 : -1);
  const pairs = new Set();
  for (let x = size - 1; x + 1 < w; x += size)
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (label[i] && label[i + 1]) pairs.add(regionOf(i) * regions + regionOf(i + 1));
    }
  for (let y = size - 1; y + 1 < h; y += size)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (label[i] && label[i + w]) pairs.add(regionOf(i) * regions + regionOf(i + w));
    }
  const degree = new Uint32Array(regions + 1);
  for (const p of pairs) { degree[Math.floor(p / regions)]++; degree[p % regions]++; }
  const off = new Uint32Array(regions + 1);
  for (let r = 0; r < regions; r++) off[r + 1] = off[r] + degree[r];
  const to = new Uint32Array(off[regions]), fill = off.slice(0, regions);
  for (const p of pairs) {
    const a = Math.floor(p / regions), b = p % regions;
    to[fill[a]++] = b;
    to[fill[b]++] = a;
  }
  const mean = Float32Array.from(sum, (t, r) => t / land[r]);
  return { size, cw, ch, regions, label, mean, off, to, cellOfRegion: Uint32Array.from(cellOfRegion), cellOf, regionOf };
}

export function coarseRoute(co, from, to, minStep = 0.9) {
  if (from < 0 || to < 0) return null;
  if (from === to) return { regions: [from], cost: 0 };
  const { cw, size, mean, off, cellOfRegion } = co;
  const dist = new Float32Array(co.regions).fill(Infinity), prev = new Int32Array(co.regions).fill(-1), open = new MinHeap();
  const tc = cellOfRegion[to], tx = tc % cw, ty = Math.floor(tc / cw);
  const h = r => { const c = cellOfRegion[r]; return (Math.abs((c % cw) - tx) + Math.abs(Math.floor(c / cw) - ty)) * size * minStep; };
  dist[from] = 0;
  open.push(h(from), from);
  while (open.size) {
    const cur = open.pop();
    if (cur === to) break;
    for (let k = off[cur]; k < off[cur + 1]; k++) {
      const nb = co.to[k], d = dist[cur] + (size * (mean[cur] + mean[nb])) / 2;
      if (d < dist[nb]) { dist[nb] = d; prev[nb] = cur; open.push(d + h(nb), nb); }
    }
  }
  if (!(dist[to] < Infinity)) return null;
  const route = [to];
  for (let r = to; r !== from; ) { r = prev[r]; route.push(r); }
  return { regions: route.reverse(), cost: dist[to] };
}

export function planSegment(grid, co, start, regions, goal, cost, { ahead = 8, radius = 1, maxNodes = 60000 } = {}) {
  const last = Math.min(ahead, regions.length - 1), target = regions[last];
  const allowed = new Set();
  for (let k = 0; k <= last; k++) {
    const c = co.cellOfRegion[regions[k]], cx = c % co.cw, cy = Math.floor(c / co.cw);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < co.cw && cy + dy < co.ch) allowed.add((cy + dy) * co.cw + cx + dx);
  }
  const inside = (a, b) => (allowed.has(co.cellOf(b)) ? cost(a, b) : Infinity);
  const minStep = cost.minStep ?? 0.1;
  if (last === regions.length - 1) {
    const gx = grid.x(goal), gy = grid.y(goal);
    return search(grid, start, i => i === goal, i => (Math.abs(grid.x(i) - gx) + Math.abs(grid.y(i) - gy)) * minStep, inside, maxNodes);
  }
  const tc = co.cellOfRegion[target], x0 = (tc % co.cw) * co.size, y0 = Math.floor(tc / co.cw) * co.size, x1 = x0 + co.size - 1, y1 = y0 + co.size - 1;
  const h = i => {
    const x = grid.x(i), y = grid.y(i);
    return (Math.max(0, x0 - x, x - x1) + Math.max(0, y0 - y, y - y1)) * minStep;
  };
  return search(grid, start, i => co.regionOf(i) === target, h, inside, maxNodes);
}
