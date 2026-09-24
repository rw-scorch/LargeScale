export const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.size = w * h;
  }
  idx(x, y) { return y * this.w + x; }
  x(i) { return i % this.w; }
  y(i) { return (i / this.w) | 0; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  neighbours4(i) {
    const x = i % this.w, y = (i / this.w) | 0, out = [];
    if (y > 0) out.push(i - this.w);
    if (x < this.w - 1) out.push(i + 1);
    if (y < this.h - 1) out.push(i + this.w);
    if (x > 0) out.push(i - 1);
    return out;
  }
  dist(a, b) { return Math.hypot(this.x(a) - this.x(b), this.y(a) - this.y(b)); }
  cheb(a, b) { return Math.max(Math.abs(this.x(a) - this.x(b)), Math.abs(this.y(a) - this.y(b))); }
}

export function disc(grid, cx, cy, r) {
  const out = [];
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(grid.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(grid.w - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.push(grid.idx(x, y));
  return out;
}
