export const MAX_NATION_ID = 65535;

export const PICKED = ["#e0413a", "#f08a24", "#d63fbf", "#f2d02b", "#8e4fe0", "#f4f4f4", "#ff7ab8", "#1f1f1f"];

const BANDS = [[0, 80], [160, 180], [250, 360]];
const SPAN = BANDS.reduce((s, [a, b]) => s + b - a, 0);
const SHADES = [[85, 55], [75, 40], [90, 68]];

function hue(t) {
  for (const [a, b] of BANDS) {
    if (t < b - a) return a + t;
    t -= b - a;
  }
  return 0;
}

function hex(h, s, l) {
  s /= 100; l /= 100;
  const f = n => {
    const k = (n + h / 30) % 12, c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function playerColour(k) {
  if (k < PICKED.length) return PICKED[k];
  const n = k - PICKED.length, [s, l] = SHADES[n % SHADES.length];
  return hex(hue((n * 137.508) % SPAN), s, l);
}
