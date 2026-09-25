import { joinParts, splitParts, bytesOf } from "./codec.js";

export const PROTOCOL = 5;
export const MSG = { OWNER: 2, DIFF: 3, TERRAIN_DIFF: 4, BUILDINGS: 5, ZONE: 6, ZONE_DIFF: 7, TERRAIN_EDIT: 8, DEPOSITS: 9 };
export const MAX_ZONE_SIDE = 64;
export const MAX_WAYPOINTS = 32;
export const FRAME_BYTES = 256 * 1024;
export const CLOSE = { PROTOCOL: 4000, REPLACED: 4001, REMOVED: 4002, DELETED: 4003 };
export const ORDER_CODES = ["hold", "move", "advance"];

export function frame(type, typed, part = 0, parts = 1) {
  const body = bytesOf(typed);
  const out = new Uint8Array(4 + body.length);
  out[0] = type;
  out[1] = PROTOCOL;
  out[2] = part;
  out[3] = parts;
  out.set(body, 4);
  return out;
}

export function partFrames(type, bytes) {
  const parts = splitParts(bytes, FRAME_BYTES);
  if (parts.length > 255) throw new Error("too many parts for one frame header");
  return parts.map((p, k) => frame(type, p, k, parts.length));
}

export function readFrame(data) {
  const u8 = new Uint8Array(data);
  return { type: u8[0], version: u8[1], part: u8[2], parts: u8[3], body: u8.slice(4) };
}

export function pairs(body) {
  return new Uint32Array(body.buffer, body.byteOffset, body.byteLength >> 2);
}

export function applyPairs(layer, body) {
  const d = pairs(body);
  for (let k = 0; k < d.length; k += 2) layer[d[k]] = d[k + 1];
}

export class PartCollector {
  constructor() { this.got = new Map(); }
  add(f) {
    let e = this.got.get(f.type);
    if (!e || e.list.length !== f.parts) this.got.set(f.type, (e = { list: new Array(f.parts), n: 0 }));
    if (!e.list[f.part]) { e.list[f.part] = f.body; e.n++; }
    if (e.n < f.parts) return null;
    this.got.delete(f.type);
    return joinParts(e.list);
  }
}
