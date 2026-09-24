export const CROPS = {
  europe: { west: -25, east: 45, north: 72, south: 34 },
};

export function cropRect(meta, box) {
  const { west, east, north, south } = box ?? {};
  if (![west, east, north, south].every(Number.isFinite) || west >= east || south >= north) return null;
  const span = meta.north - meta.south;
  const x0 = Math.round(((west + 180) / 360) * meta.w), x1 = Math.round(((east + 180) / 360) * meta.w);
  const y0 = Math.round(((meta.north - north) / span) * meta.h), y1 = Math.round(((meta.north - south) / span) * meta.h);
  if (x0 < 0 || y0 < 0 || x1 > meta.w || y1 > meta.h) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function cropLayer(src, srcW, rect) {
  const out = new src.constructor(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    const from = (rect.y + y) * srcW + rect.x;
    out.set(src.subarray(from, from + rect.w), y * rect.w);
  }
  return out;
}
