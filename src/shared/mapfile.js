import { TERRAIN, isLand } from "./terrain.js";
import { gzip, hashBytes } from "./codec.js";

export const MAP_MAGIC = "LSMAP";
export const MAP_VERSION = 1;
export const MAP_EXT = ".lsmap";
const HEAD = MAP_MAGIC.length + 1 + 4;

export function landCount(terrain) {
  let n = 0;
  for (const t of terrain) if (isLand(t)) n++;
  return n;
}

export function checkMap({ name, w, h, terrain, north, south }, limits = {}) {
  const side = limits.maxSide ?? Infinity, least = limits.minSide ?? 1;
  if (typeof name !== "string" || !name.trim() || name.length > (limits.maxName ?? 40)) return `a map needs a name of 1 to ${limits.maxName ?? 40} letters`;
  if (![w, h].every(Number.isInteger) || w < least || h < least || w > side || h > side) return `map sides must be whole numbers from ${least} to ${side}`;
  if (w * h > (limits.maxPlots ?? Infinity)) return `the map is ${w} by ${h}, over the ${limits.maxPlots} plot limit`;
  if (!(terrain instanceof Uint8Array) || terrain.length !== w * h) return "the terrain does not match the map size";
  for (let i = 0; i < terrain.length; i++) if (terrain[i] >= TERRAIN.length) return `plot ${i} has an unknown terrain ${terrain[i]}`;
  if ((north !== undefined || south !== undefined) && !([north, south].every(Number.isFinite) && north <= 90 && south >= -90 && south < north)) return "latitudes need south below north, within 90 degrees";
  const land = landCount(terrain);
  if (land < (limits.minLand ?? 1)) return `the map has ${land} land plots; it needs at least ${limits.minLand ?? 1} for nations to stand on`;
  return null;
}

export async function writeMapFile(map) {
  const head = { name: map.name.trim(), w: map.w, h: map.h, ...(Number.isFinite(map.north) ? { north: map.north, south: map.south } : {}) };
  const json = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(HEAD + json.length + map.terrain.length);
  out.set(new TextEncoder().encode(MAP_MAGIC));
  out[MAP_MAGIC.length] = MAP_VERSION;
  new DataView(out.buffer).setUint32(MAP_MAGIC.length + 1, json.length, true);
  out.set(json, HEAD);
  out.set(map.terrain, HEAD + json.length);
  return gzip(out);
}

async function gunzipCapped(bytes, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error("the map file unpacks to more than a map can hold"); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function readMapFile(bytes, limits = {}) {
  let raw;
  try { raw = await gunzipCapped(bytes, HEAD + 4096 + (limits.maxPlots ?? 64e6)); } catch (e) { return { error: e.message.startsWith("the map") ? e.message : "that is not a Large Scale map file" }; }
  if (raw.length < HEAD || new TextDecoder().decode(raw.subarray(0, MAP_MAGIC.length)) !== MAP_MAGIC) return { error: "that is not a Large Scale map file" };
  if (raw[MAP_MAGIC.length] > MAP_VERSION) return { error: `the map file is version ${raw[MAP_MAGIC.length]}; this game reads up to ${MAP_VERSION}` };
  const len = new DataView(raw.buffer, raw.byteOffset).getUint32(MAP_MAGIC.length + 1, true);
  if (len > 4096 || HEAD + len > raw.length) return { error: "the map file header is damaged" };
  let head;
  try { head = JSON.parse(new TextDecoder().decode(raw.subarray(HEAD, HEAD + len))); } catch { return { error: "the map file header is damaged" }; }
  const map = { name: head.name, w: head.w, h: head.h, terrain: raw.slice(HEAD + len), ...(head.north !== undefined ? { north: head.north, south: head.south } : {}) };
  const bad = checkMap(map, limits);
  if (bad) return { error: bad };
  return { map, land: landCount(map.terrain), hash: hashBytes(map.terrain) };
}
