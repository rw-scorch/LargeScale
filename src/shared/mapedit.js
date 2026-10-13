export class Edit {
  constructor(terrain) {
    this.terrain = terrain;
    this.idx = [];
    this.old = [];
  }
  set(i, t) {
    const was = this.terrain[i];
    if (was === t) return false;
    this.idx.push(i);
    this.old.push(was);
    this.terrain[i] = t;
    return true;
  }
  get size() { return this.idx.length; }
  done(t) {
    return { idx: Int32Array.from(this.idx), old: Uint8Array.from(this.old), t };
  }
}

export function undo(terrain, step) {
  for (let k = step.idx.length - 1; k >= 0; k--) terrain[step.idx[k]] = step.old[k];
  return step.idx;
}

export function redo(terrain, step) {
  for (const i of step.idx) terrain[i] = step.t;
  return step.idx;
}

export function paintDisc(edit, w, h, cx, cy, r, t, only = null) {
  const r2 = (r - 0.5) * (r - 0.5) + 0.5;
  for (let y = Math.max(0, Math.ceil(cy - r)); y <= Math.min(h - 1, Math.floor(cy + r)); y++)
    for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(w - 1, Math.floor(cx + r)); x++) {
      const dx = x - cx, dy = y - cy, i = y * w + x;
      if (dx * dx + dy * dy <= r2 && (only === null || only(edit.terrain[i]))) edit.set(i, t);
    }
}

export function paintLine(edit, w, h, x0, y0, x1, y1, r, t, only = null) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(0.5, r / 2)));
  for (let s = 0; s <= steps; s++) paintDisc(edit, w, h, Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), r, t, only);
}

export function fill(edit, w, h, x, y, t) {
  const terrain = edit.terrain, from = terrain[y * w + x];
  if (from === t) return;
  const stack = [y * w + x];
  while (stack.length) {
    const i = stack.pop();
    if (terrain[i] !== from) continue;
    const row = i - (i % w);
    let a = i, b = i;
    while (a > row && terrain[a - 1] === from) a--;
    while (b < row + w - 1 && terrain[b + 1] === from) b++;
    for (let j = a; j <= b; j++) {
      edit.set(j, t);
      if (j >= w && terrain[j - w] === from) stack.push(j - w);
      if (j + w < terrain.length && terrain[j + w] === from) stack.push(j + w);
    }
  }
}
