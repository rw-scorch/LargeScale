function putVarint(out, v) {
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
}

function reader(bytes) {
  let p = 0;
  return {
    get done() { return p >= bytes.length; },
    byte() { if (p >= bytes.length) throw new Error("deposit list is truncated"); return bytes[p++]; },
    varint() {
      let v = 0, scale = 1, b;
      do { b = this.byte(); v += (b & 0x7f) * scale; scale *= 128; } while (b & 0x80);
      return v;
    },
  };
}

export function emptyDeposits() {
  return { plots: new Uint32Array(0), type: new Uint8Array(0), amount: new Float64Array(0) };
}

export function encodeDeposits(dep) {
  const out = [];
  putVarint(out, dep.plots.length);
  let prev = 0;
  for (let k = 0; k < dep.plots.length; k++) {
    putVarint(out, dep.plots[k] - prev);
    prev = dep.plots[k];
    out.push(dep.type[k]);
    putVarint(out, dep.amount[k] === Infinity ? 0 : Math.max(1, Math.round(dep.amount[k])));
  }
  return Uint8Array.from(out);
}

export function decodeDeposits(bytes) {
  const r = reader(bytes), n = r.varint();
  const dep = { plots: new Uint32Array(n), type: new Uint8Array(n), amount: new Float64Array(n) };
  let plot = 0;
  for (let k = 0; k < n; k++) {
    plot += r.varint();
    dep.plots[k] = plot;
    dep.type[k] = r.byte();
    const a = r.varint();
    dep.amount[k] = a === 0 ? Infinity : a;
  }
  return dep;
}

export function cropDeposits(dep, srcW, rect) {
  const keep = [];
  for (let k = 0; k < dep.plots.length; k++) {
    const x = dep.plots[k] % srcW - rect.x, y = Math.floor(dep.plots[k] / srcW) - rect.y;
    if (x >= 0 && y >= 0 && x < rect.w && y < rect.h) keep.push([y * rect.w + x, dep.type[k], dep.amount[k]]);
  }
  keep.sort((a, b) => a[0] - b[0]);
  return { plots: Uint32Array.from(keep, v => v[0]), type: Uint8Array.from(keep, v => v[1]), amount: Float64Array.from(keep, v => v[2]) };
}

export function depositIndex(dep, plot) {
  let lo = 0, hi = dep.plots.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, v = dep.plots[mid];
    if (v === plot) return mid;
    if (v < plot) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

export function latitudeOf(map, h, plot, w) {
  if (!map || map.kind === "test") return 45;
  const north = map.north ?? 84, south = map.south ?? -60, srcH = map.srcH ?? h;
  const y = Math.floor(plot / w) + (map.rect?.y ?? 0);
  return north - ((y + 0.5) * (north - south)) / srcH;
}

export const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];

export function seasonAt(time, lat, seasonSeconds) {
  const i = Math.floor(time / seasonSeconds) % 4;
  if (Math.abs(lat) < 23.5) return i === 1 || i === 2 ? "dry" : "summer";
  return SEASON_ORDER[lat < 0 ? (i + 2) % 4 : i];
}
