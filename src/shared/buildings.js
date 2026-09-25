import { TERRAIN } from "./terrain.js";

export const ERA_ORDER = ["T", "M", "G", "I", "Mo", "F"];
export const ERA_NAMES = { T: "Tribal", M: "Medieval", G: "Gunpowder", I: "Industrial", Mo: "Modern", F: "Future" };
export const STATES = ["construction", "active", "damaged", "rubble"];
export const eraIdx = e => ERA_ORDER.indexOf(e);

export function tableFrom(list) {
  const table = {}, byNum = [];
  for (const d of list) {
    if (table[d.id] || byNum[d.num]) throw new Error(`building ${d.id} (number ${d.num}) is listed twice`);
    const def = { ...d, fp: d.footprint, cat: d.category };
    table[d.id] = def;
    byNum[d.num] = def;
  }
  for (const d of Object.values(table)) if (d.next && !table[d.next]) throw new Error(`${d.id} upgrades to unknown ${d.next}`);
  return { table, byNum };
}

export function footprintAt(w, h, anchor, fp) {
  const x0 = anchor % w, y0 = (anchor / w) | 0, out = [];
  for (let dy = 0; dy < fp[1]; dy++) for (let dx = 0; dx < fp[0]; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    out.push(y * w + x);
  }
  return out;
}

function nearOwned(v, i, nid, r) {
  const x0 = i % v.w, y0 = (i / v.w) | 0;
  for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (x >= 0 && y >= 0 && x < v.w && y < v.h && v.owner[y * v.w + x] === nid) return true;
  return false;
}

export function placeError(v, nation, def, anchor, self = 0) {
  if (!def || def.civilian) return "unknown building";
  if (eraIdx(def.era) > eraIdx(nation.era ?? "T")) return `needs the ${ERA_NAMES[def.era]} era`;
  const plots = footprintAt(v.w, v.h, anchor, def.fp);
  if (!plots) return "off the edge of the map";
  if (plots.some(i => { const id = v.occupant(i); return id && id !== self; })) return "something is already there";
  const nid = nation.id, land = plots.filter(i => TERRAIN[v.terrain[i]].land), water = plots.length - land.length;
  if (def.rule === "coast") {
    if (!land.length || !water) return "must sit on the coast";
    if (land.some(i => v.owner[i] !== nid)) return "not your land";
  } else if (def.rule === "shallows") {
    if (land.length || plots.some(i => TERRAIN[v.terrain[i]].water !== "shallow")) return "must sit in shallow water";
    if (!plots.some(i => nearOwned(v, i, nid, 3))) return "too far from your coast";
  } else {
    if (water) return "cannot build on water";
    if (plots.some(i => v.owner[i] !== nid)) return "not your land";
    if (def.producer?.kind !== "deposit" && plots.some(i => !TERRAIN[v.terrain[i]].build)) return "the ground is too rough to build on";
  }
  return def.producer ? producerError(v, def.producer, plots) : null;
}

const GRAZING = new Set(["grassland", "plains", "meadow", "steppe", "savanna"]);

export function areaAround(v, plots, r) {
  if (!r) return plots;
  const out = new Set();
  for (const i of plots) {
    const x0 = i % v.w, y0 = (i / v.w) | 0;
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (x >= 0 && y >= 0 && x < v.w && y < v.h) out.add(y * v.w + x);
  }
  return [...out];
}

export function producerError(v, p, plots) {
  const r = p.radius ?? 0, area = areaAround(v, plots, r);
  if (p.kind === "deposit") {
    if (area.some(i => p.deposits.includes(v.deposit(i)))) return null;
    const what = p.deposits.length > 1 ? "ore" : p.deposits[0];
    if (what === "fish") return `needs fishing water within ${r} plots`;
    const an = /^[aeiou]/.test(what) ? "an" : "a";
    return r ? `needs ${an} ${what} deposit within ${r} plots` : `must sit on ${an} ${what} deposit`;
  }
  if (p.kind === "forest") return area.some(i => TERRAIN[v.terrain[i]].forest) ? null : `needs forest within ${r} plots`;
  if (p.kind === "farm") return plots.every(i => TERRAIN[v.terrain[i]].fertility > 0.1) ? null : "the soil is too poor to farm";
  if (p.kind === "pasture") return plots.every(i => GRAZING.has(TERRAIN[v.terrain[i]].name)) ? null : "needs grassland";
  return null;
}

export function costError(def, nation) {
  for (const [k, v] of Object.entries(def.cost)) {
    if (k === "money") continue;
    const have = nation.stock?.[k] ?? 0;
    if (have < v) return `needs ${v} ${k}, you have ${Math.floor(have)}`;
  }
  const money = def.cost.money ?? 0;
  if ((nation.money ?? 0) < money) return `needs ${money} gold, you have ${Math.floor(nation.money ?? 0)}`;
  return null;
}

function putVarint(out, v) {
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
}

export function encodeRows(rows) {
  const sorted = [...rows].sort((a, b) => a[3] - b[3]), out = [];
  let prev = 0;
  putVarint(out, sorted.length);
  for (const [id, num, owner, anchor, state, pct] of sorted) {
    putVarint(out, anchor - prev);
    prev = anchor;
    putVarint(out, id);
    putVarint(out, num);
    putVarint(out, owner);
    out.push(state, pct);
  }
  return Uint8Array.from(out);
}

export function decodeRows(bytes) {
  let p = 0;
  const next = () => {
    let v = 0, scale = 1, b;
    do {
      if (p >= bytes.length) throw new Error("building rows are truncated");
      b = bytes[p++];
      v += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return v;
  };
  const count = next(), rows = [];
  let anchor = 0;
  for (let k = 0; k < count; k++) {
    anchor += next();
    const id = next(), num = next(), owner = next();
    rows.push([id, num, owner, anchor, bytes[p++], bytes[p++]]);
  }
  return rows;
}

export function rowOf(b, table) {
  return [b.id, table[b.type].num, b.owner, b.anchor, STATES.indexOf(b.state), Math.min(100, Math.floor(b.progress * 100))];
}
