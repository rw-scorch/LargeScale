export const FLAG_W = 32;
export const FLAG_H = 20;
export const FLAG_PALETTE = [
  "#f4f1e8", "#26252d", "#c4403a", "#8e2a26", "#e0873a", "#e8c84a", "#5f9e45", "#2f6a45",
  "#3f9a95", "#3f6fb5", "#2a3f6a", "#7a4fa0", "#d86a9a", "#8b5a33", "#a9a9a9", "#4c4c55",
];
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function blankFlag(colour = 0) { return new Uint8Array(FLAG_W * FLAG_H).fill(colour); }

export function encodeFlag(px) {
  let out = "f1.";
  for (let i = 0; i < px.length; ) {
    let run = 1;
    while (i + run < px.length && px[i + run] === px[i] && run < 64) run++;
    out += B64[px[i]] + B64[run - 1];
    i += run;
  }
  return out;
}

export function decodeFlag(str) {
  if (typeof str !== "string" || !str.startsWith("f1.") || str.length > 3 + FLAG_W * FLAG_H * 2 || (str.length - 3) % 2) return null;
  const px = new Uint8Array(FLAG_W * FLAG_H);
  let i = 0;
  for (let k = 3; k < str.length; k += 2) {
    const c = B64.indexOf(str[k]), run = B64.indexOf(str[k + 1]) + 1;
    if (c < 0 || c >= FLAG_PALETTE.length || run <= 0 || i + run > px.length) return null;
    px.fill(c, i, i + run);
    i += run;
  }
  return i === px.length ? px : null;
}

export function floodFill(px, x, y, colour) {
  const target = px[y * FLAG_W + x];
  if (target === colour) return 0;
  const stack = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= FLAG_W || cy >= FLAG_H) continue;
    const i = cy * FLAG_W + cx;
    if (px[i] !== target) continue;
    px[i] = colour;
    n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}

export function flagToRGBA(px, scale = 1) {
  const w = FLAG_W * scale, h = FLAG_H * scale, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = FLAG_PALETTE[px[((y / scale) | 0) * FLAG_W + ((x / scale) | 0)]];
    const o = (y * w + x) * 4;
    out[o] = parseInt(c.slice(1, 3), 16); out[o + 1] = parseInt(c.slice(3, 5), 16); out[o + 2] = parseInt(c.slice(5, 7), 16); out[o + 3] = 255;
  }
  return { w, h, data: out };
}
