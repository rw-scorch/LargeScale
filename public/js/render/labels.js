export function placeLabels(state, budget = 250000) {
  const W = state.w, H = state.h, own = state.owner;
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / budget)));
  const w = Math.ceil(W / k), h = Math.ceil(H / k), cell = new Uint16Array(w * h), d = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.min(H - 1, y * k + (k >> 1)) * W;
    for (let x = 0; x < w; x++) cell[y * w + x] = own[row + Math.min(W - 1, x * k + (k >> 1))];
  }
  const near = (i, o) => (cell[i] === o ? d[i] : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = cell[i];
    if (!o) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { d[i] = 1; continue; }
    d[i] = Math.min(near(i - 1, o), near(i - w - 1, o), near(i - w, o), near(i - w + 1, o)) + 1;
  }
  const best = new Map();
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x, o = cell[i];
    if (!o) continue;
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) d[i] = Math.min(d[i], Math.min(near(i + 1, o), near(i + w + 1, o), near(i + w, o), near(i + w - 1, o)) + 1);
    const b = best.get(o);
    if (!b || d[i] > b.d) best.set(o, { d: d[i], i });
  }
  return [...best].map(([id, b]) => ({ id, x: ((b.i % w) + 0.5) * k, y: (Math.floor(b.i / w) + 0.5) * k, r: b.d * k }));
}
