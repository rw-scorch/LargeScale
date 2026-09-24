export function countRuns(a) {
  if (!a.length) return 0;
  let runs = 1;
  for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1]) runs++;
  return runs;
}

function putVarint(buf, p, v) {
  while (v >= 0x80) {
    buf[p++] = (v & 0x7f) | 0x80;
    v = Math.floor(v / 128);
  }
  buf[p++] = v;
  return p;
}

export function encodeRuns(a) {
  let buf = new Uint8Array(1 << 16), p = 0;
  for (let i = 0; i < a.length;) {
    const v = a[i];
    let j = i + 1;
    while (j < a.length && a[j] === v) j++;
    if (p + 10 > buf.length) {
      const bigger = new Uint8Array(buf.length * 2);
      bigger.set(buf);
      buf = bigger;
    }
    p = putVarint(buf, p, j - i);
    p = putVarint(buf, p, v);
    i = j;
  }
  return buf.slice(0, p);
}

export function decodeRuns(bytes, out) {
  let p = 0, i = 0;
  const next = () => {
    let v = 0, scale = 1, b;
    do {
      if (p >= bytes.length) throw new Error("runs are truncated");
      b = bytes[p++];
      v += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return v;
  };
  while (p < bytes.length) {
    const len = next(), v = next();
    if (i + len > out.length) throw new Error("runs overflow the layer");
    out.fill(v, i, i + len);
    i += len;
  }
  if (i !== out.length) throw new Error(`runs cover ${i} of ${out.length} plots`);
  return out;
}

export function splitParts(bytes, max) {
  const parts = [];
  for (let p = 0; p < bytes.length; p += max) parts.push(bytes.subarray(p, Math.min(bytes.length, p + max)));
  return parts.length ? parts : [new Uint8Array(0)];
}

export function joinParts(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

export function bytesOf(typed) {
  return new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
}

export function hashBytes(typed) {
  const b = bytesOf(typed);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const hashRuns = layer => hashBytes(encodeRuns(layer));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export const gzip = bytes => pipe(bytes, new CompressionStream("gzip"));
export const gunzip = bytes => pipe(bytes, new DecompressionStream("gzip"));
