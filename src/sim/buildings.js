import { TERRAIN } from "../shared/terrain.js";
import { encodeRuns, decodeRuns } from "../shared/codec.js";
import data from "../../data/buildings.json" with { type: "json" };
import rules from "../../data/rules.json" with { type: "json" };

export const ERA_ORDER = ["T", "M", "G", "I", "Mo", "F"];
export const ZONES = { none: 0, res: 1, com: 2, ind: 3, farm: 4 };
export const STATES = ["construction", "active", "damaged", "rubble"];
export const WOOD_FULL = 255;
export const LAYERS = ["zone", "wood", "buildings"];
const FORMAT = 1, HEAD = 9, REC = 22;

export function loadTable(src = data) {
  const table = {}, byNum = [];
  for (const d of src.buildings) {
    if (table[d.id] || byNum[d.num]) throw new Error(`building ${d.id} (number ${d.num}) is listed twice`);
    const def = { ...d, fp: d.footprint, cat: d.category };
    table[d.id] = def;
    byNum[d.num] = def;
  }
  for (const d of Object.values(table)) if (d.next && !table[d.next]) throw new Error(`${d.id} upgrades to unknown ${d.next}`);
  return { table, byNum };
}

export const BUILDINGS = loadTable();

export function installBuildings(world, { defs = BUILDINGS, keep = rules.buildings.capturedResidentsKept } = {}) {
  if (world.bld) return world.bld;
  const size = world.grid.size;
  const bld = {
    table: defs.table, byNum: defs.byNum, list: new Map(), at: new Map(), mine: new Map(), next: 1,
    zone: new Uint8Array(size), wood: new Uint8Array(size), changed: new Set(), keep,
  };
  fillWood(world.terrain, bld.wood);
  world.bld = bld;
  const claim = world.claim;
  world.claim = function (i, nid) {
    const old = this.owner[i];
    claim.call(this, i, nid);
    if (old !== nid && bld.at.size) captured(this, i, nid);
  };
  return bld;
}

export function fillWood(terrain, wood) {
  for (let i = 0; i < terrain.length; i++) wood[i] = TERRAIN[terrain[i]].forest ? WOOD_FULL : 0;
}

function captured(world, i, nid) {
  const bld = world.bld, b = bld.list.get(bld.at.get(i));
  if (!b || b.anchor !== i || b.owner === nid) return;
  setOwner(world, b, nid);
  if (b.residents) b.residents *= bld.keep;
}

export function footprint(world, anchor, fp) {
  const g = world.grid, x0 = g.x(anchor), y0 = g.y(anchor), out = [];
  for (let dy = 0; dy < fp[1]; dy++) for (let dx = 0; dx < fp[0]; dx++) {
    if (!g.inside(x0 + dx, y0 + dy)) return null;
    out.push(g.idx(x0 + dx, y0 + dy));
  }
  return out;
}

function mineOf(bld, nid) {
  let set = bld.mine.get(nid);
  if (!set) bld.mine.set(nid, (set = new Set()));
  return set;
}

export function addBuilding(world, { id, type, owner, anchor, plots, state = "construction", progress = 0, residents = 0, upgrading = false, nuked = false }) {
  const bld = world.bld, def = bld.table[type];
  if (!def) throw new Error(`unknown building ${type}`);
  plots ??= footprint(world, anchor, def.fp);
  id ??= bld.next++;
  if (id >= bld.next) bld.next = id + 1;
  const b = { id, type, owner, anchor, plots, state, progress, residents, civilian: def.civilian };
  if (upgrading) b.upgrading = true;
  if (nuked) b.nuked = true;
  bld.list.set(id, b);
  for (const i of plots) bld.at.set(i, id);
  mineOf(bld, owner).add(id);
  bld.changed.add("buildings");
  return b;
}

export function removeBuilding(world, id) {
  const bld = world.bld, b = bld.list.get(id);
  if (!b) return null;
  for (const i of b.plots) if (bld.at.get(i) === id) bld.at.delete(i);
  bld.mine.get(b.owner)?.delete(id);
  bld.list.delete(id);
  bld.changed.add("buildings");
  return b;
}

export function setPlots(world, b, plots) {
  const at = world.bld.at;
  for (const i of b.plots) if (at.get(i) === b.id) at.delete(i);
  for (const i of plots) at.set(i, b.id);
  b.plots = plots;
  world.bld.changed.add("buildings");
}

export function setOwner(world, b, nid) {
  const bld = world.bld;
  bld.mine.get(b.owner)?.delete(b.id);
  b.owner = nid;
  mineOf(bld, nid).add(b.id);
  bld.changed.add("buildings");
}

export function buildingAt(world, i) {
  const id = world.bld.at.get(i);
  return id === undefined ? null : world.bld.list.get(id);
}

export function* nationBuildings(world, nid) {
  const ids = world.bld.mine.get(nid);
  if (!ids) return;
  for (const id of ids) yield world.bld.list.get(id);
}

export function touch(world, layer) { world.bld.changed.add(layer); }

export function encodeBuildings(bld) {
  const out = new Uint8Array(HEAD + bld.list.size * REC), v = new DataView(out.buffer);
  v.setUint8(0, FORMAT);
  v.setUint32(1, bld.next, true);
  v.setUint32(5, bld.list.size, true);
  let p = HEAD;
  for (const b of bld.list.values()) {
    v.setUint32(p, b.id, true);
    v.setUint16(p + 4, bld.table[b.type].num, true);
    v.setUint16(p + 6, b.owner, true);
    v.setUint32(p + 8, b.anchor, true);
    v.setUint8(p + 12, STATES.indexOf(b.state));
    v.setUint8(p + 13, (b.upgrading ? 1 : 0) | (b.nuked ? 2 : 0));
    v.setFloat32(p + 14, b.progress, true);
    v.setFloat32(p + 18, b.residents ?? 0, true);
    p += REC;
  }
  return out;
}

export function decodeBuildings(world, bytes) {
  if (!bytes.length) return 0;
  const bld = world.bld, v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint8(0) !== FORMAT) throw new Error(`building list format ${v.getUint8(0)} is not known`);
  const count = v.getUint32(5, true);
  if (bytes.length !== HEAD + count * REC) throw new Error(`building list is ${bytes.length} bytes, expected ${HEAD + count * REC}`);
  for (let k = 0, p = HEAD; k < count; k++, p += REC) {
    const def = bld.byNum[v.getUint16(p + 4, true)];
    if (!def) throw new Error(`saved building type ${v.getUint16(p + 4, true)} is not in data/buildings.json`);
    const flags = v.getUint8(p + 13);
    addBuilding(world, {
      id: v.getUint32(p, true), type: def.id, owner: v.getUint16(p + 6, true), anchor: v.getUint32(p + 8, true),
      state: STATES[v.getUint8(p + 12)], upgrading: !!(flags & 1), nuked: !!(flags & 2),
      progress: v.getFloat32(p + 14, true), residents: v.getFloat32(p + 18, true),
    });
  }
  bld.next = Math.max(bld.next, v.getUint32(1, true));
  return count;
}

export function saveLayers(world, all = false) {
  const bld = world.bld, out = {};
  if (all || bld.changed.has("zone")) out.zone = encodeRuns(bld.zone);
  if (all || bld.changed.has("wood")) out.wood = encodeRuns(bld.wood);
  if (all || bld.changed.has("buildings")) out.buildings = encodeBuildings(bld);
  bld.changed.clear();
  return out;
}

export function restoreLayers(world, { zone, wood, buildings } = {}) {
  const bld = world.bld;
  if (zone?.length) decodeRuns(zone, bld.zone);
  if (wood?.length) decodeRuns(wood, bld.wood);
  const count = buildings ? decodeBuildings(world, buildings) : 0;
  bld.changed.clear();
  return count;
}
