import { TERRAIN } from "../shared/terrain.js";
import { hash2 } from "../shared/rng.js";
import { areaAround } from "../shared/buildings.js";
import { People } from "./people.js";
import { placeLabels } from "./labels.js";
import { roadSprite } from "../shared/roads.js";
import { soldierCount, soldierTypes, typeOfSlot, rankSlots } from "../shared/soldiers.js";

export const ZOOM = { max: 64, sprites: 10, icons: 3, maxRatio: 2, out: 0.5 };
export const CHUNK = 256;
export const NIGHT = "rgba(12,18,52,0.62)";
const FORMATION = [[0, 0], [-0.32, 0.12], [0.32, 0.12], [-0.18, -0.2], [0.18, -0.2]];
const RANKS = new Map();
const ranksOf = (n, spacing) => {
  const key = `${n}:${spacing}`;
  let list = RANKS.get(key);
  if (!list) { if (RANKS.size > 400) RANKS.clear(); RANKS.set(key, (list = rankSlots(n, spacing))); }
  return list;
};
const noise = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
const dirOf = a => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) >= Math.abs(s) ? (c > 0 ? "e" : "w") : s > 0 ? "s" : "n"; };
const ROAD_COLOUR = [null, "#e2c38a", "#d9d4c8", "#b8b8b8", "#f0f0f0", "#8a6a4a"];
const DIRS = [[1, "N"], [2, "E"], [4, "S"], [8, "W"]];
const ZONE_SPRITE = [null, "ov_zone_residential", "ov_zone_commercial", "ov_zone_industrial", "ov_zone_farmland"];
const DEPOSIT_COLOUR = { stone: "#b8b0a0", clay: "#c07850", iron: "#a05a4a", copper: "#d08a40", tin: "#c8c8d0", coal: "#303030", gold: "#f0c840", silver: "#e0e0f0", gems: "#c060e0", oil: "#101010", gas: "#80c0c0", uranium: "#80f060", bauxite: "#d06040", lithium: "#f0f0f0", sulfur: "#f0f040", salt: "#ffffff", fish: "#50a0f0" };
export const ZONE_COLOUR = [null, "rgba(111,207,122,.35)", "rgba(90,160,230,.35)", "rgba(232,200,74,.35)", "rgba(190,150,90,.35)"];
const ZONE_RGB = { res: "111,207,122", com: "90,160,230", ind: "232,200,74", farm: "190,150,90" };
const maskName = m => DIRS.filter(([b]) => m & b).map(d => d[1]).join("") || "dot";
const ICON_FOR = { resources: "mapicon_industry", farming: "mapicon_agriculture", housing: "mapicon_housing", res: "mapicon_housing", commercial: "mapicon_commercial", com: "mapicon_commercial", industry: "mapicon_industry", ind: "mapicon_industry", infrastructure: "mapicon_industry", agriculture: "mapicon_agriculture", farm: "mapicon_agriculture", energy: "mapicon_energy", civic: "mapicon_civic", transport: "mapicon_transport", tourism: "mapicon_tourism", military: "mapicon_military" };

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class MapRenderer {
  constructor(canvas, atlas, state, palettes) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.atlas = atlas;
    this.state = state;
    state.buildings ??= new Map();
    state.units ??= [];
    state.roads ??= new Uint8Array(0);
    this.palettes = palettes;
    this.season = "summer";
    this.night = false;
    this.era = "M";
    this.cam = { x: state.w / 2, y: state.h / 2, scale: 4 };
    this.minScale = 0.1;
    this.time = 0;
    this.selected = null;
    this.route = null;
    this.ghost = null;
    this.zoneRect = null;
    this.showZones = false;
    this.showDeposits = false;
    this.showNames = true;
    this.names = null;
    this.namesAt = -Infinity;
    this.selectedBuilding = null;
    this.selectedMachine = null;
    this.terrainCanvas = document.createElement("canvas");
    this.terrainCanvas.width = state.w;
    this.terrainCanvas.height = state.h;
    this.cw = Math.ceil(state.w / CHUNK);
    this.ch = Math.ceil(state.h / CHUNK);
    this.chunks = new Array(this.cw * this.ch).fill(null);
    this.colours = new Map();
    this.occupied = new Uint8Array(state.w * state.h);
    this.lotAt = new Map();
    this.people = new People(state);
    this.facing = new Map();
    this.indexRoads();
    this.indexBuildings();
    this.rebuildTerrain();
    this.rebuildTerritory();
  }

  resize(cssW, cssH, ratio) {
    const r = Math.min(ZOOM.maxRatio, ratio || 1);
    this.ratio = r;
    this.canvas.width = Math.max(1, Math.round(cssW * r));
    this.canvas.height = Math.max(1, Math.round(cssH * r));
    this.fitScale = Math.min(this.canvas.width / this.state.w, this.canvas.height / this.state.h);
    this.minScale = this.fitScale * ZOOM.out;
    this.clampCamera();
  }

  fitWorld() {
    this.cam.x = this.state.w / 2;
    this.cam.y = this.state.h / 2;
    this.cam.scale = this.fitScale;
  }

  clampCamera() {
    const c = this.cam, s = this.state;
    c.scale = Math.min(ZOOM.max * (this.ratio ?? 1), Math.max(this.minScale, c.scale));
    c.x = Math.min(s.w, Math.max(0, c.x));
    c.y = Math.min(s.h, Math.max(0, c.y));
  }

  indexBuildings() {
    const s = this.state;
    this.occupied.fill(0);
    this.lotAt.clear();
    for (const b of s.buildings.values()) this.placeBuilding(b);
    for (const i of this.roadSet ?? []) this.occupied[i] = 1;
  }

  indexRoads() {
    const r = this.state.roads;
    this.roadSet = new Set();
    for (let i = 0; i < r.length; i++) if (r[i]) { this.roadSet.add(i); this.occupied[i] = 1; }
  }

  updateRoads(plots) {
    const r = this.state.roads;
    this.roadSet ??= new Set();
    for (const i of plots) {
      if (r[i]) { this.roadSet.add(i); this.occupied[i] = 1; }
      else { this.roadSet.delete(i); this.occupied[i] = this.state.at?.has(i) ? 1 : 0; }
    }
  }

  placeBuilding(b) {
    b.fp = b.def?.fp ?? [1, 1];
    b.sprite = this.atlas.get(b.def?.sprite ?? b.type) ?? null;
    for (const i of b.plots ?? []) this.occupied[i] = 1;
  }

  updateBuildings(changes) {
    for (const { added, removed } of changes) {
      if (removed) for (const i of removed.plots ?? []) if (!this.state.at?.has(i)) this.occupied[i] = 0;
      if (added) this.placeBuilding(added);
    }
  }

  spriteFor(b) {
    const a = this.atlas, d = b.def;
    if (d?.sprite) {
      if (b.state === "active") return d.sam && b.owner === this.state.you && this.state.samOf?.(0, b.id)?.missiles === 0 && a.has(`${d.sprite}_empty`) ? `${d.sprite}_empty` : d.seasonSprites?.[this.season] ?? d.sprite;
      return a.has(`${d.sprite}_${b.state}`) ? `${d.sprite}_${b.state}` : a.has(`${b.type}_${b.state}`) ? `${b.type}_${b.state}` : d.seasonSprites?.winter ?? d.sprite;
    }
    if (d?.variants) {
      const base = d.variants[b.id % d.variants.length];
      return b.state && b.state !== "active" && a.has(`${base}_${b.state}`) ? `${base}_${b.state}` : base;
    }
    if (b.state && b.state !== "active" && a.has(`${b.type}_${b.state}`)) return `${b.type}_${b.state}`;
    if (d?.abm && b.state === "active" && b.owner === this.state.you && this.state.abmOf?.(b.id)?.interceptors === 0 && a.has(`${b.type}_empty`)) return `${b.type}_empty`;
    return this.frameFor(b.type);
  }

  drawParts(b, ax, ay, px, colour) {
    const a = this.atlas;
    for (const p of b.def.parts) {
      const id = b.state === "active" ? p.sprite : a.has(`${p.sprite}_${b.state}`) ? `${p.sprite}_${b.state}` : null;
      if (!id) continue;
      const [sx, sy] = this.plotToScreen(ax + p.at[0], ay + p.at[1]);
      a.draw(this.ctx, id, sx, sy - this.riseOf(id, p.fp) * px, px, colour);
    }
  }

  riseOf(id, fp) {
    const sp = this.atlas.get(id);
    if (!sp) return 0;
    const rise = sp.h - fp[1] * 16;
    return /_(construction|damaged|rubble)$/.test(id) ? rise - this.atlas.bottomPad(id) : Math.max(0, rise);
  }

  setSeason(season) { this.season = season; this.rebuildTerrain(); }

  rebuildTerrain() {
    const s = this.state, pal = this.palettes[this.season] ?? this.palettes.summer;
    const ctx = this.terrainCanvas.getContext("2d");
    const img = ctx.createImageData(s.w, s.h);
    this.lut = TERRAIN.map(t => pal[t.name].map(hexRGB));
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x, c = this.terrainRGB(i, x, y);
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }

  terrainRGB(i, x, y) {
    const n = hash2(x, y, 11) * 0.7 + hash2(x >> 2, y >> 2, 12) * 0.3;
    return this.lut[this.state.terrain[i]][Math.min(4, Math.max(0, Math.floor(n * 3.4 + 0.3)))];
  }

  updateTerrain(plots) {
    const ctx = this.terrainCanvas.getContext("2d"), w = this.state.w;
    for (const i of plots) {
      const x = i % w, y = (i / w) | 0, c = this.terrainRGB(i, x, y);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  depositsIn(r, each) {
    const d = this.state.deposits, w = this.state.w;
    if (!d?.plots.length) return;
    for (let y = r.y0; y <= r.y1; y++) {
      const lo = y * w + r.x0, hi = y * w + r.x1;
      let a = 0, b = d.plots.length;
      while (a < b) { const m = (a + b) >> 1; if (d.plots[m] < lo) a = m + 1; else b = m; }
      for (let k = a; k < d.plots.length && d.plots[k] <= hi; k++) each(d.plots[k], k);
    }
  }

  drawDeposits(r) {
    const s = this.state, px = this.cam.scale / 16;
    this.depositsIn(r, (i, k) => {
      if (this.occupied[i]) return;
      const id = s.depositIds[s.deposits.type[k] - 1];
      const [sx, sy] = this.plotToScreen(i % s.w, (i / s.w) | 0);
      this.atlas.draw(this.ctx, `deposit_${id}${s.depleted.has(i) ? "_depleted" : ""}`, sx, sy, px);
    });
  }

  drawDepositDots(r) {
    const ctx = this.ctx, s = this.state, sc = this.cam.scale, k0 = this.ratio ?? 1, d = Math.max(4 * k0, sc * 0.9);
    ctx.lineWidth = k0;
    ctx.strokeStyle = "rgba(15,34,51,.9)";
    this.depositsIn(r, (i, k) => {
      const [sx, sy] = this.plotToScreen((i % s.w) + 0.5, ((i / s.w) | 0) + 0.5);
      ctx.fillStyle = s.depleted.has(i) ? "rgba(90,90,90,.8)" : DEPOSIT_COLOUR[s.depositIds[s.deposits.type[k] - 1]] ?? "#fff";
      ctx.fillRect(sx - d / 2, sy - d / 2, d, d);
      ctx.strokeRect(sx - d / 2, sy - d / 2, d, d);
    });
  }

  colourOf(o) {
    let c = this.colours.get(o);
    if (!c) {
      c = hexRGB(this.state.nations.get(o)?.colour ?? "#ffffff");
      this.colours.set(o, c);
    }
    return c;
  }

  chunkAt(i, create) {
    const s = this.state, x = i % s.w, y = (i / s.w) | 0, k = ((y / CHUNK) | 0) * this.cw + ((x / CHUNK) | 0);
    let c = this.chunks[k];
    if (!c && create) {
      const cx = (k % this.cw) * CHUNK, cy = ((k / this.cw) | 0) * CHUNK;
      const w = Math.min(CHUNK, s.w - cx), h = Math.min(CHUNK, s.h - cy);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      c = this.chunks[k] = { canvas, ctx: canvas.getContext("2d"), img: new ImageData(w, h), x: cx, y: cy, w, dirty: true };
    }
    return c;
  }

  rebuildTerritory() {
    this.chunks.fill(null);
    this.colours.clear();
    const o = this.state.owner;
    for (let i = 0; i < o.length; i++) if (o[i]) this.paintPlot(i);
  }

  paintPlot(i) {
    const s = this.state, o = s.owner[i];
    const c = this.chunkAt(i, o !== 0);
    if (!c) return;
    const x = i % s.w, y = (i / s.w) | 0, k = ((y - c.y) * c.w + (x - c.x)) * 4, d = c.img.data;
    c.dirty = true;
    if (!o) { d[k + 3] = 0; return; }
    const border = (x > 0 && s.owner[i - 1] !== o) || (x < s.w - 1 && s.owner[i + 1] !== o) || (y > 0 && s.owner[i - s.w] !== o) || (y < s.h - 1 && s.owner[i + s.w] !== o);
    const rgb = this.colourOf(o);
    d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = border ? 235 : 90;
  }

  updatePlots(list) {
    const s = this.state, n = s.owner.length;
    for (const i of list) {
      this.paintPlot(i);
      if (i >= s.w) this.paintPlot(i - s.w);
      if (i + s.w < n) this.paintPlot(i + s.w);
      if (i % s.w) this.paintPlot(i - 1);
      if ((i + 1) % s.w) this.paintPlot(i + 1);
    }
  }

  flushChunks() {
    for (const c of this.chunks) if (c?.dirty) { c.ctx.putImageData(c.img, 0, 0); c.dirty = false; }
  }

  screenToPlot(sx, sy) {
    const c = this.cam, W = this.canvas.width, H = this.canvas.height;
    return [(sx - W / 2) / c.scale + c.x, (sy - H / 2) / c.scale + c.y];
  }

  plotToScreen(x, y) {
    const c = this.cam, W = this.canvas.width, H = this.canvas.height;
    return [(x - c.x) * c.scale + W / 2, (y - c.y) * c.scale + H / 2];
  }

  zoomAt(sx, sy, factor) {
    const [px, py] = this.screenToPlot(sx, sy);
    const c = this.cam;
    c.scale = Math.min(ZOOM.max * (this.ratio ?? 1), Math.max(this.minScale, c.scale * factor));
    const [nx, ny] = this.screenToPlot(sx, sy);
    c.x += px - nx;
    c.y += py - ny;
    this.clampCamera();
  }

  pan(dx, dy) {
    this.cam.x -= dx / this.cam.scale;
    this.cam.y -= dy / this.cam.scale;
    this.clampCamera();
  }

  markers() {
    const s = this.state, out = [], showBots = this.cam.scale >= ZOOM.icons * (this.ratio ?? 1);
    for (const st of s.stacks.values()) {
      if (!showBots && s.nations.get(st.owner)?.bot) continue;
      const state = st.id === this.selected || this.group?.has(st.id) || this.groupPreview?.has(st.id) || this.picked?.get(st.id)?.size ? "selected" : st.order === "hold" ? "idle" : "moving";
      const [cx, cy] = this.stackPoint(st), [x, y] = this.leaderAt?.get(st.id) ?? [cx, cy];
      out.push({ id: st.id, owner: st.owner, x, y, cx, cy, troops: st.troops, soldiers: this.soldiersIn(st), era: s.nations.get(st.owner)?.era ?? "T", state, xp: st.xp ?? 0 });
    }
    return out;
  }

  stackAt(sx, sy, radius = 14 * (this.ratio ?? 1)) {
    let best = null, bestD = radius;
    const lift = this.markerLift(this.cam.scale / 16);
    for (const m of this.markers()) {
      const [mx, my] = this.plotToScreen(m.x, m.y), [ox, oy] = this.plotToScreen(m.cx, m.cy);
      const d = Math.min(Math.hypot(mx - sx, my - sy), Math.hypot(mx - sx, my - lift - sy), Math.hypot(ox - sx, oy - sy));
      if (d <= bestD) { bestD = d; best = m.id; }
    }
    return best;
  }

  roadSprite(i) { return roadSprite(this.state.roads, this.state.terrain, this.state.w, i); }

  drawRoadLines() {
    const s = this.state, r = s.roads, w = s.w, ctx = this.ctx, c = this.cam, R = this.ratio ?? 1, v = this.visibleRange(1);
    if (!this.roadSet?.size) return;
    const paths = new Map();
    const path = k => { let p = paths.get(k); if (!p) paths.set(k, (p = new Path2D())); return p; };
    for (const i of this.roadSet) {
      const x = i % w, y = (i / w) | 0;
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const k = r[i], p = path(k);
      let joined = false;
      if (x < w - 1 && r[i + 1]) { p.moveTo(x + 0.5, y + 0.5); p.lineTo(x + 1.5, y + 0.5); joined = true; }
      if (i + w < r.length && r[i + w]) { p.moveTo(x + 0.5, y + 0.5); p.lineTo(x + 0.5, y + 1.5); joined = true; }
      if (!joined && !(x > 0 && r[i - 1]) && !(i >= w && r[i - w])) { p.moveTo(x + 0.3, y + 0.5); p.lineTo(x + 0.7, y + 0.5); }
    }
    ctx.save();
    ctx.lineCap = "round";
    const width = Math.max((2 * R) / c.scale, 0.3);
    ctx.strokeStyle = "rgba(30,22,14,.75)";
    ctx.lineWidth = width + (1.6 * R) / c.scale;
    for (const p of paths.values()) ctx.stroke(p);
    ctx.lineWidth = width;
    for (const [k, p] of paths) { ctx.strokeStyle = ROAD_COLOUR[k] ?? ROAD_COLOUR[1]; ctx.stroke(p); }
    ctx.restore();
  }

  drawPowerCover() {
    const cover = this.powerCover, s = this.state, ctx = this.ctx, c = this.cam, W = this.canvas.width, H = this.canvas.height, v = this.visibleRange(1);
    if (!cover) return;
    ctx.save();
    ctx.setTransform(c.scale, 0, 0, c.scale, W / 2 - c.x * c.scale, H / 2 - c.y * c.scale);
    for (const [mark, colour] of [[1, "rgba(255,236,120,.42)"], [2, "rgba(200,200,200,.38)"]]) {
      ctx.fillStyle = colour;
      for (let y = Math.max(0, v.y0); y <= Math.min(s.h - 1, v.y1); y++) for (let x = Math.max(0, v.x0); x <= Math.min(s.w - 1, v.x1); x++) if (cover[y * s.w + x] === mark) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  drawRoadPlan() {
    const p = this.roadPlan, s = this.state, ctx = this.ctx, c = this.cam, W = this.canvas.width, H = this.canvas.height;
    if (!p?.line?.length) return;
    ctx.save();
    ctx.setTransform(c.scale, 0, 0, c.scale, W / 2 - c.x * c.scale, H / 2 - c.y * c.scale);
    ctx.fillStyle = p.ok ? "rgba(111,207,122,.72)" : "rgba(224,106,90,.72)";
    for (const i of p.line) ctx.fillRect(i % s.w, (i / s.w) | 0, 1, 1);
    ctx.fillStyle = "rgba(30,30,30,.9)";
    for (const i of p.poles ?? []) ctx.fillRect((i % s.w) + 0.3, ((i / s.w) | 0) + 0.3, 0.4, 0.4);
    ctx.restore();
  }

  lotSprite(i, type) {
    const s = this.state, w = s.w, x = i % w;
    let m = 0;
    if (this.lotAt.get(i - w) === type) m |= 1;
    if (x < w - 1 && this.lotAt.get(i + 1) === type) m |= 2;
    if (this.lotAt.get(i + w) === type) m |= 4;
    if (x > 0 && this.lotAt.get(i - 1) === type) m |= 8;
    return `lot_${type}_${maskName(m)}`;
  }

  decoFor(i, x, y) {
    const t = TERRAIN[this.state.terrain[i]].name, r = hash2(x, y, 99);
    const winter = this.season === "winter";
    const s = this.season === "dry" ? "summer" : this.season;
    if (t === "forest" && r < 0.55) return r < 0.12 ? `deco_birch_${s}` : `deco_oak_${s}`;
    if (t === "pine_forest" && r < 0.65) return `deco_pine_${winter ? "winter" : "summer"}`;
    if (t === "jungle" && r < 0.7) return r < 0.2 ? "deco_palm" : "deco_jungle_tree";
    if (t === "desert" && r < 0.03) return "deco_cactus";
    if ((t === "hills" || t === "highlands") && r < 0.08) return "deco_rock_small";
    if (t === "mountain" && r < 0.15) return "deco_rock_large";
    if ((t === "grassland" || t === "meadow") && r < 0.04) return r < 0.02 ? "deco_flowers" : `deco_bush_${s}`;
    if ((t === "swamp" || t === "marsh") && r < 0.3) return "deco_reeds";
    if (t === "ocean" && r < 0.01) return "deco_waves";
    return null;
  }

  visibleRange(pad = 2) {
    const c = this.cam, W = this.canvas.width, H = this.canvas.height, s = this.state;
    return {
      x0: Math.max(0, Math.floor(c.x - W / 2 / c.scale) - pad), x1: Math.min(s.w - 1, Math.ceil(c.x + W / 2 / c.scale) + pad),
      y0: Math.max(0, Math.floor(c.y - H / 2 / c.scale) - pad), y1: Math.min(s.h - 1, Math.ceil(c.y + H / 2 / c.scale) + pad + 4),
    };
  }

  render(dt = 0) {
    this.time += dt;
    this.flushChunks();
    const ctx = this.ctx, c = this.cam, W = this.canvas.width, H = this.canvas.height, R = this.ratio ?? 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#10233a";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(c.scale, 0, 0, c.scale, W / 2 - c.x * c.scale, H / 2 - c.y * c.scale);
    ctx.drawImage(this.terrainCanvas, 0, 0);
    if (c.scale < ZOOM.sprites * R) {
      const r = this.visibleRange(0);
      for (const k of this.chunks) if (k && k.x <= r.x1 && k.y <= r.y1 && k.x + CHUNK >= r.x0 && k.y + CHUNK >= r.y0) ctx.drawImage(k.canvas, k.x, k.y);
      this.drawRoadLines();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showNames && c.scale < ZOOM.sprites * R) this.drawNames();
    if (c.scale >= ZOOM.sprites * R) this.drawSprites();
    else if (c.scale >= ZOOM.icons * R) this.drawIcons();
    else this.drawDots();
    if (c.scale >= ZOOM.icons * R && c.scale < ZOOM.sprites * R && (this.showZones || this.zoneRect)) this.drawZoneFill(this.visibleRange(0));
    if (this.showDeposits && c.scale >= ZOOM.icons * R && c.scale < ZOOM.sprites * R) this.drawDepositDots(this.visibleRange(0));
    this.drawPlan();
    this.drawDigs();
    this.drawNotes();
    this.drawZoneRect();
    this.drawPowerCover();
    this.drawShieldDomes();
    this.drawRoadPlan();
    this.drawGhost();
    this.drawEffects();
    this.drawNukes();
    this.drawFlak();
    this.drawShots();
    this.drawRoute();
    this.drawSwipe();
    this.drawFortRing();
    this.drawGuide();
    if (this.night) this.drawNight();
  }

  drawNames() {
    const s = this.state, c = this.cam, ctx = this.ctx, R = this.ratio ?? 1, W = this.canvas.width, H = this.canvas.height, now = performance.now();
    if (!s.ownerReady) return;
    if (now - this.namesAt > 2000) { this.names = placeLabels(s); this.namesAt = now; }
    const short = n => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.globalAlpha = c.scale < ZOOM.icons * R ? 0.95 : 0.75;
    for (const L of this.names) {
      const n = s.nations.get(L.id);
      if (!n?.spawned || n.alive === false) continue;
      const r = L.r * c.scale, size = Math.min(r * 0.6, (1.8 * r) / (0.6 * Math.max(4, n.name.length)), 40 * R);
      if (size < 9 * R) continue;
      const [x, y] = this.plotToScreen(L.x, L.y);
      if (x + r < 0 || y + r < 0 || x - r > W || y - r > H) continue;
      ctx.lineWidth = Math.max(2, size / 5);
      ctx.strokeStyle = "rgba(10,22,34,.7)";
      ctx.fillStyle = L.id === s.you ? "#ffe9a0" : "#ffffff";
      ctx.font = `700 ${Math.round(size)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
      ctx.strokeText(n.name, x, y - size * 0.35);
      ctx.fillText(n.name, x, y - size * 0.35);
      ctx.font = `600 ${Math.round(size * 0.75)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
      ctx.strokeText(short(n.troops ?? 0), x, y + size * 0.55);
      ctx.fillText(short(n.troops ?? 0), x, y + size * 0.55);
    }
    ctx.restore();
  }

  drawFortRing() {
    const s = this.state, b = this.selectedBuilding !== null ? s.buildings.get(this.selectedBuilding) : null;
    const def = this.ghost?.def?.fort ? this.ghost.def : b?.def?.fort && b.state === "active" ? b.def : null;
    if (!def) return this.drawSamRing(b);
    const at = this.ghost?.def?.fort ? this.ghost.anchor : b.anchor, R = this.ratio ?? 1, ctx = this.ctx;
    const [x, y] = this.plotToScreen((at % s.w) + def.fp[0] / 2, Math.floor(at / s.w) + def.fp[1] / 2);
    const r = def.fort.radius * this.cam.scale;
    ctx.save();
    ctx.strokeStyle = "rgba(232,200,74,.85)";
    ctx.fillStyle = "rgba(232,200,74,.08)";
    ctx.lineWidth = 2 * R;
    ctx.setLineDash([6 * R, 5 * R]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.label(`defends at ${def.fort.defence} times`, x, y + r + 4 * R, 12 * R, "#e8c84a");
  }

  drawSamRing(b) {
    const s = this.state, m = this.selectedMachine != null ? s.machines?.get(this.selectedMachine) : null;
    const ghost = this.ghost?.def?.sam ? this.ghost : null, sam = ghost?.def.sam ?? (b?.state === "active" ? b.def?.sam : null) ?? (m?.state !== "wreck" ? m?.def.sam : null);
    if (!sam) return this.drawCoverRing(b);
    const R = this.ratio ?? 1, ctx = this.ctx, fp = ghost?.def.fp ?? b?.def.fp;
    const [x, y] = ghost || (b && b.def?.sam) ? this.plotToScreen(((ghost?.anchor ?? b.anchor) % s.w) + fp[0] / 2, Math.floor((ghost?.anchor ?? b.anchor) / s.w) + fp[1] / 2) : this.plotToScreen(...this.machinePoint(m));
    const r = sam.radius * (s.map?.scale ?? 1) * this.cam.scale;
    ctx.save();
    ctx.strokeStyle = "rgba(120,200,255,.85)";
    ctx.fillStyle = "rgba(120,200,255,.08)";
    ctx.lineWidth = 2 * R;
    ctx.setLineDash([6 * R, 5 * R]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.label(`missiles reach ${sam.radius * (s.map?.scale ?? 1)} plots`, x, y + r + 4 * R, 12 * R, "#9fd4ff");
  }

  drawCoverRing(b) {
    const s = this.state, ghost = this.ghost?.def?.shield || this.ghost?.def?.railgun ? this.ghost : null;
    const def = ghost?.def ?? (b?.state === "active" ? b.def : null), cover = def?.shield ?? def?.railgun;
    if (!cover) return;
    const R = this.ratio ?? 1, ctx = this.ctx, at = ghost?.anchor ?? b.anchor, reach = (cover.radius ?? cover.range) * (s.map?.scale ?? 1);
    const [x, y] = this.plotToScreen((at % s.w) + def.fp[0] / 2, Math.floor(at / s.w) + def.fp[1] / 2), r = reach * this.cam.scale;
    const [line, fill, text, words] = def.shield ? ["rgba(110,230,230,.85)", "rgba(110,230,230,.1)", "#8ff0f0", `shield covers ${reach} plots`] : ["rgba(240,110,90,.85)", "rgba(240,110,90,.06)", "#f09080", `railgun reaches ${reach} plots`];
    ctx.save();
    ctx.strokeStyle = line;
    ctx.fillStyle = fill;
    ctx.lineWidth = 2 * R;
    ctx.setLineDash([6 * R, 5 * R]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.label(words, x, y + r + 4 * R, 12 * R, text);
  }

  drawShieldDomes() {
    const s = this.state, now = Date.now();
    if (!this.domes || now - this.domesAt > 1000) {
      this.domesAt = now;
      this.domes = [];
      for (const b of s.buildings?.values() ?? []) if (b.def?.shield && b.state === "active") this.domes.push(b);
    }
    if (!this.domes.length || this.cam.scale < ZOOM.icons * (this.ratio ?? 1)) return;
    const ctx = this.ctx, R = this.ratio ?? 1, sc = s.map?.scale ?? 1, pulse = 0.75 + 0.25 * Math.sin(now / 900);
    ctx.save();
    ctx.lineWidth = 1.5 * R;
    for (const b of this.domes) {
      const [x, y] = this.plotToScreen((b.anchor % s.w) + b.def.fp[0] / 2, Math.floor(b.anchor / s.w) + b.def.fp[1] / 2), r = b.def.shield.radius * sc * this.cam.scale;
      if (x + r < 0 || y + r < 0 || x - r > this.canvas.width || y - r > this.canvas.height) continue;
      const grad = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
      grad.addColorStop(0, "rgba(110,230,230,0)");
      grad.addColorStop(1, `rgba(110,230,230,${0.16 * pulse})`);
      ctx.fillStyle = grad;
      ctx.strokeStyle = `rgba(140,240,240,${0.45 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGuide() {
    const g = this.guide;
    if (!g) return;
    const s = this.state, R = this.ratio ?? 1, ctx = this.ctx, t = (performance.now() % 1400) / 1400;
    const [x, y] = this.plotToScreen((g.plot % s.w) + 0.5, ((g.plot / s.w) | 0) + 0.5);
    ctx.save();
    ctx.strokeStyle = `rgba(232,200,74,${(1 - t).toFixed(2)})`;
    ctx.lineWidth = 3 * R;
    ctx.beginPath();
    ctx.arc(x, y, (8 + 16 * t) * R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#e8c84a";
    ctx.beginPath();
    ctx.arc(x, y, 4 * R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (g.label) this.label(g.label, x, y + 14 * R, 13 * R, "#e8c84a");
  }

  drawEffects() {
    const list = this.state.effects;
    if (!list?.length) return;
    const now = Date.now(), R = this.ratio ?? 1, s = this.state;
    for (let k = list.length - 1; k >= 0; k--) if (now - list[k].at > 4000) list.splice(k, 1);
    for (const fx of list) {
      const age = now - fx.at;
      if (fx.kind === "bomb") {
        if (age > 1200) continue;
        const n = fx.bombs ?? 1, gap = 1.5 * (s.map?.scale ?? 1), frame = `${fx.shielded ? "shield_impact" : "flak_burst"}_${Math.min(2, Math.floor(age / 400))}`, size = Math.max(40 * R, this.cam.scale * 3.2) * (fx.shielded ? 0.5 : 1);
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * gap, [sx, sy] = this.plotToScreen((fx.plot % s.w) + 0.5 + Math.cos(fx.heading ?? 0) * off, ((fx.plot / s.w) | 0) + 0.5 + Math.sin(fx.heading ?? 0) * off);
          this.atlas.draw(this.ctx, frame, sx - size / 2, sy - size / 2, size / 16);
        }
        continue;
      }
      if (fx.kind === "sam") {
        if (age > 900) continue;
        const t = Math.min(1, age / 600), x = fx.from[0] + (fx.to[0] - fx.from[0]) * t, y = fx.from[1] + (fx.to[1] - fx.from[1]) * t, [sx, sy] = this.plotToScreen(x, y);
        const k = Math.max(R, this.cam.scale / 16), ctx = this.ctx;
        if (t < 1) {
          const [fx0, fy0] = this.plotToScreen(fx.from[0] + (fx.to[0] - fx.from[0]) * Math.max(0, t - 0.3), fx.from[1] + (fx.to[1] - fx.from[1]) * Math.max(0, t - 0.3));
          ctx.save();
          ctx.strokeStyle = "rgba(235,235,235,.7)";
          ctx.lineWidth = 2.5 * R;
          ctx.beginPath();
          ctx.moveTo(fx0, fy0);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.translate(sx, sy);
          ctx.rotate(Math.atan2(fx.to[1] - fx.from[1], fx.to[0] - fx.from[0]));
          this.atlas.draw(ctx, "proj_sam_missile", -8 * k, -8 * k, k);
          ctx.restore();
        } else {
          const size = Math.max(28 * R, this.cam.scale * 2);
          this.atlas.draw(this.ctx, `flak_burst_${Math.min(2, Math.floor((age - 600) / 100))}`, sx - size / 2, sy - size / 2, size / 16);
        }
        continue;
      }
      if (fx.kind === "rail") {
        if (age > 500) continue;
        const ctx = this.ctx, [ax, ay] = this.plotToScreen(...fx.from), [bx, by] = this.plotToScreen(...fx.to), fade = 1 - age / 500;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "#9fe8ff";
        ctx.lineWidth = 3 * R;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2 * R;
        ctx.stroke();
        ctx.restore();
        const size = Math.max(24 * R, this.cam.scale * 1.6);
        this.atlas.draw(ctx, `flak_burst_${Math.min(2, Math.floor(age / 170))}`, bx - size / 2, by - size / 2, size / 16);
        continue;
      }
      if (fx.kind === "charge" || fx.kind === "breach") {
        const frames = fx.kind === "charge" ? 3 : 4, life = fx.kind === "charge" ? 600 : 900;
        if (age > life) continue;
        const frame = `${fx.kind === "charge" ? "charge_blast" : "explosion_small"}_${Math.min(frames - 1, Math.floor((age / life) * frames))}`, size = Math.max(28 * R, this.cam.scale * (fx.kind === "charge" ? 1.6 : 2.2));
        const [sx, sy] = this.plotToScreen((fx.plot % s.w) + 0.5, ((fx.plot / s.w) | 0) + 0.5);
        this.atlas.draw(this.ctx, frame, sx - size / 2, sy - size / 2, size / 16);
        continue;
      }
      if (fx.kind === "chute" || fx.kind === "heli") {
        if (fx.kind === "heli" || age > 3000) continue;
        const k = Math.max(R, this.cam.scale / 16), fall = 1 - age / 3000;
        this.ctx.globalAlpha = Math.min(1, fall * 3);
        for (let j = 0; j < fx.n; j++) {
          const [sx, sy] = this.plotToScreen((fx.plot % s.w) + 0.5 + Math.sin(j * 2.4) * 0.8, ((fx.plot / s.w) | 0) + 0.5 + Math.cos(j * 1.7) * 0.5 - fall * 2.5);
          this.atlas.draw(this.ctx, "parachute", sx - 8 * k, sy - 8 * k + Math.sin(now / 300 + j) * 2 * R, k);
        }
        this.ctx.globalAlpha = 1;
        continue;
      }
      if (fx.kind !== "era_up") continue;
      const frame = `era_up_${Math.floor((now - fx.at) / 180) % 3}`;
      const size = Math.max(48 * R, this.cam.scale * 3), k = size / 32;
      const [sx, sy] = this.plotToScreen((fx.plot % s.w) + 0.5, ((fx.plot / s.w) | 0) + 0.5);
      this.atlas.draw(this.ctx, frame, sx - size / 2, sy - size / 2, k);
    }
  }

  nukeRings(plot, radius, inner, alpha) {
    const s = this.state, ctx = this.ctx, R = this.ratio ?? 1, k = this.cam.scale;
    const [sx, sy] = this.plotToScreen((plot % s.w) + 0.5, ((plot / s.w) | 0) + 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,60,30,.25)";
    ctx.strokeStyle = "#ff4a2a";
    ctx.lineWidth = 2 * R;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(3 * R, inner * k), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([8 * R, 6 * R]);
    ctx.strokeStyle = "#ffae3a";
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(6 * R, radius * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawNukes() {
    const s = this.state, ctx = this.ctx, R = this.ratio ?? 1, now = Date.now(), k = this.cam.scale;
    const aim = this.nukeAim;
    if (aim) this.nukeRings(aim.plot, aim.radius, aim.inner, 0.9);
    if (!s.nukes?.length && !s.blasts?.length) return;
    const pulse = 0.55 + 0.3 * Math.sin(now / 250), sim = s.simNow?.() ?? s.time;
    const centre = p => [(p % s.w) + 0.5, ((p / s.w) | 0) + 0.5];
    for (const f of s.nukes ?? []) {
      this.nukeRings(f.target, f.radius, f.inner, pulse);
      const orbital = f.kind === "orbital", [ax, ay] = orbital ? [centre(f.target)[0], centre(f.target)[1] - 40] : centre(f.from), [bx, by] = centre(f.target), span = Math.max(1, f.due - f.launched);
      const lift = orbital ? 0 : Math.hypot(bx - ax, by - ay) * 0.25 + 4, at = t => [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(Math.PI * t) * lift];
      const t = Math.max(0, Math.min(1, (sim - f.launched) / span)), m = Math.max(R * 1.5, k / 12);
      ctx.save();
      ctx.strokeStyle = "rgba(240,240,240,.55)";
      ctx.lineWidth = 2 * R;
      ctx.beginPath();
      for (let j = 0; j <= 24; j++) {
        const [x, y] = at(Math.max(0, t - 0.25) + (Math.min(t, 0.25) * j) / 24), [px, py] = this.plotToScreen(x, y);
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.01)), [px, py] = this.plotToScreen(x, y);
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(y2 - y, x2 - x));
      this.atlas.draw(ctx, orbital ? "proj_plasma_bolt" : "proj_ballistic_missile", -8 * m, -8 * m, m);
      ctx.restore();
      if (sim - f.launched < 6 && !orbital) {
        const [lx, ly] = this.plotToScreen(ax, ay), size = Math.max(24 * R, k * 2);
        this.atlas.draw(ctx, `launch_smoke_${Math.floor((now / 200) % 3)}`, lx - size / 2, ly - size, size / 16);
      }
    }
    const list = s.blasts ?? [];
    for (let j = list.length - 1; j >= 0; j--) if (now - list[j].at > 7000) list.splice(j, 1);
    for (const b of list) {
      const age = now - b.at, [sx, sy] = this.plotToScreen(...centre(b.plot));
      if (b.kind === "intercept") {
        if (age > 1500) continue;
        const size = Math.max(40 * R, k * 4) * (b.with === "shield" ? 2 : 1);
        this.atlas.draw(ctx, `${b.with === "shield" ? "shield_impact" : "flak_burst"}_${Math.min(2, Math.floor(age / 500))}`, sx - size / 2, sy - size / 2, size / (b.with === "shield" ? 32 : 16));
        continue;
      }
      if (age < 400) {
        ctx.save();
        ctx.globalAlpha = 1 - age / 400;
        ctx.fillStyle = "#fff8e0";
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(20 * R, b.radius * k * 1.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (age < 3000) {
        const size = Math.max(64 * R, b.radius * 2 * k);
        this.atlas.draw(ctx, `nuke_${Math.min(4, Math.floor(age / 600))}`, sx - size / 2, sy - size * 0.75, size / 48);
      }
      this.nukeRings(b.plot, b.radius, b.inner, Math.max(0, 1 - age / 7000) * 0.6);
    }
  }

  drawZones(r) {
    const s = this.state, z = s.zone, px = this.cam.scale / 16;
    if (!z) return;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * s.w + x;
      if (!z[i] || this.occupied[i]) continue;
      const [sx, sy] = this.plotToScreen(x, y);
      this.atlas.draw(this.ctx, ZONE_SPRITE[z[i]], sx, sy, px);
    }
  }

  drawZoneFill(r) {
    const ctx = this.ctx, s = this.state, z = s.zone, sc = this.cam.scale;
    if (!z) return;
    for (let y = r.y0; y <= r.y1; y++) {
      let x = r.x0;
      while (x <= r.x1) {
        const v = z[y * s.w + x];
        let e = x + 1;
        while (e <= r.x1 && z[y * s.w + e] === v) e++;
        if (v) {
          const [sx, sy] = this.plotToScreen(x, y);
          ctx.fillStyle = ZONE_COLOUR[v];
          ctx.fillRect(sx, sy, (e - x) * sc, sc);
        }
        x = e;
      }
    }
  }

  drawDigs() {
    const s = this.state, E = s?.eng;
    if (!E || (!E.hp.size && !E.jobs.length && !E.roads.size)) return;
    const ctx = this.ctx, k = this.ratio ?? 1, v = this.visibleRange(1), px = this.cam.scale, close = px >= ZOOM.sprites * k;
    if (px < ZOOM.icons * k) return;
    const inView = i => { const x = i % s.w, y = (i / s.w) | 0; return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1; };
    if (close) for (const [i, [hp, max]] of E.hp) {
      if (!inView(i)) continue;
      const f = hp / max, sprite = f > 0.6 ? "feat_rockfall" : f > 0.25 ? "feat_landslide" : "feat_rubble_pass";
      const [sx, sy] = this.plotToScreen(i % s.w, (i / s.w) | 0);
      this.atlas.draw(ctx, sprite, sx, sy, px / 16);
    }
    for (const j of E.jobs) {
      if (!inView(j.at)) continue;
      const [sx, sy] = this.plotToScreen((j.at % s.w) + 0.5, ((j.at / s.w) | 0) + 0.5);
      const d = s.digOf?.(j.at), max = j.kind === "dig" ? d?.max || 1 : s.engRules?.recipes?.[j.recipe]?.work ?? 1, f = j.kind === "dig" ? (d?.hp ?? max) / max : 1 - j.done / max;
      const bw = Math.max(14 * k, px * 0.9), bh = Math.max(3 * k, px / 10), y = sy - Math.max(10 * k, px * 0.6);
      ctx.fillStyle = "rgba(15,34,51,.8)";
      ctx.fillRect(sx - bw / 2 - k, y - k, bw + 2 * k, bh + 2 * k);
      ctx.fillStyle = j.kind === "dig" ? (j.nation === s.you ? "#e8c84a" : "#e0503a") : "#7fd07f";
      ctx.fillRect(sx - bw / 2, y, bw * Math.max(0, Math.min(1, f)), bh);
      if (close && j.crew > 0) this.atlas.draw(ctx, "build_hammer", sx - 6 * k, y - 14 * k, k * 0.75);
    }
  }

  drawNotes() {
    const s = this.state, notes = s?.notes;
    if (!notes?.length) return;
    const ctx = this.ctx, k = this.ratio ?? 1, v = this.visibleRange(1), close = this.cam.scale >= ZOOM.icons * k;
    for (const n of notes) {
      const x = n.at % s.w, y = (n.at / s.w) | 0;
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const [sx, sy] = this.plotToScreen(x + 0.5, y + 0.5);
      ctx.fillStyle = "rgba(15,34,51,.85)";
      ctx.fillRect(sx - k, sy - 14 * k, 2 * k, 14 * k);
      ctx.beginPath();
      ctx.arc(sx, sy - 14 * k, 5 * k, 0, Math.PI * 2);
      ctx.fillStyle = s.nations.get(n.owner)?.colour ?? "#e8c84a";
      ctx.fill();
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      if (close) this.label(n.text, sx, sy - 34 * k, 12 * k);
    }
  }

  drawPlan() {
    const p = this.plan;
    if (!p) return;
    const s = this.state, ctx = this.ctx, c = this.cam, W = this.canvas.width, H = this.canvas.height, v = this.visibleRange(1), line = 1 / c.scale;
    const seen = i => { const x = i % s.w, y = (i / s.w) | 0; return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1; };
    ctx.save();
    ctx.setTransform(c.scale, 0, 0, c.scale, W / 2 - c.x * c.scale, H / 2 - c.y * c.scale);
    ctx.fillStyle = "rgba(150,150,170,.3)";
    ctx.strokeStyle = "rgba(200,200,220,.8)";
    ctx.lineWidth = 2 * line;
    for (const [x, y, w, h] of p.keep ?? []) { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
    for (const item of p.items) {
      const hot = item.key === p.hover, a = item.queued ? 0.5 : hot ? 0.75 : 0.4;
      for (const d of item.draw) {
        if (!d.plots.some(seen)) continue;
        if (d.t === "zone") { ctx.fillStyle = `rgba(${ZONE_RGB[d.zone] ?? "255,255,255"},${a})`; for (const i of d.plots) ctx.fillRect(i % s.w, (i / s.w) | 0, 1, 1); continue; }
        if (d.t === "road") { ctx.fillStyle = `rgba(226,195,138,${a + 0.2})`; for (const i of d.plots) ctx.fillRect((i % s.w) + 0.2, ((i / s.w) | 0) + 0.2, 0.6, 0.6); continue; }
        if (d.t === "pole") { ctx.fillStyle = `rgba(40,40,40,${a + 0.3})`; for (const i of d.plots) ctx.fillRect((i % s.w) + 0.35, ((i / s.w) | 0) + 0.35, 0.3, 0.3); continue; }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const i of d.plots) { const x = i % s.w, y = (i / s.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        ctx.fillStyle = item.queued ? `rgba(120,170,240,${a * 0.6})` : `rgba(255,255,255,${a * 0.5})`;
        ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        ctx.setLineDash(item.queued ? [4 * line, 3 * line] : []);
        ctx.strokeStyle = d.t === "upgrade" ? "#e8c84a" : item.queued ? "#78aaf0" : hot ? "#ffffff" : "rgba(255,255,255,.85)";
        ctx.lineWidth = (hot ? 3 : 2) * line;
        ctx.strokeRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  drawZoneRect() {
    const q = this.zoneRect;
    if (!q) return;
    const ctx = this.ctx, k = this.ratio ?? 1, sc = this.cam.scale;
    const [sx, sy] = this.plotToScreen(q.x, q.y);
    ctx.fillStyle = q.keep ? "rgba(150,150,170,.4)" : q.code ? ZONE_COLOUR[q.code] : "rgba(224,106,90,.3)";
    ctx.fillRect(sx, sy, q.w * sc, q.h * sc);
    ctx.save();
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = "#e8c84a";
    ctx.strokeRect(sx, sy, q.w * sc, q.h * sc);
    ctx.restore();
    this.label(`${q.w} by ${q.h}`, sx + (q.w * sc) / 2, sy + q.h * sc + 4 * k, 13 * k);
  }

  drawGhost() {
    const g = this.ghost;
    if (!g?.def) return;
    const ctx = this.ctx, s = this.state, c = this.cam, R = this.ratio ?? 1, fp = g.def.fp;
    const ax = g.anchor % s.w, ay = (g.anchor / s.w) | 0, ok = !g.reason;
    const px = c.scale / 16, sprites = c.scale >= ZOOM.sprites * R;
    if (sprites && ok) {
      ctx.globalAlpha = 0.7;
      const [sx, sy] = this.plotToScreen(ax, ay);
      const id = g.def.sprite ?? g.def.id;
      this.atlas.draw(ctx, id, sx, sy - this.riseOf(id, fp) * px, px, s.nations.get(s.you)?.colour);
      ctx.globalAlpha = 1;
    }
    for (let dy = 0; dy < fp[1]; dy++) for (let dx = 0; dx < fp[0]; dx++) {
      const [sx, sy] = this.plotToScreen(ax + dx, ay + dy);
      if (sprites) this.atlas.draw(ctx, ok ? "ov_ghost_valid" : "ov_ghost_invalid", sx, sy, px);
      else {
        ctx.fillStyle = ok ? "rgba(111,207,122,.55)" : "rgba(224,106,90,.6)";
        ctx.fillRect(sx, sy, Math.max(2, c.scale), Math.max(2, c.scale));
      }
    }
    const [lx, ly] = this.plotToScreen(ax + fp[0] / 2, ay + fp[1]);
    this.label(ok ? g.def.name : g.reason, lx, ly + 4 * R, 13 * R, ok ? "#e9dcb8" : "#f0a090");
  }

  drawFill(r) {
    const ctx = this.ctx, s = this.state, sc = this.cam.scale;
    ctx.globalAlpha = 0.35;
    for (let y = r.y0; y <= r.y1; y++) {
      let x = r.x0;
      while (x <= r.x1) {
        const o = s.owner[y * s.w + x];
        let e = x + 1;
        while (e <= r.x1 && s.owner[y * s.w + e] === o) e++;
        if (o) {
          const [sx, sy] = this.plotToScreen(x, y);
          ctx.fillStyle = s.nations.get(o)?.colour ?? "#fff";
          ctx.fillRect(sx, sy, (e - x) * sc, sc);
        }
        x = e;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawShots() {
    const s = this.state, now = Date.now(), ctx = this.ctx, R = this.ratio ?? 1;
    if (!s.shots?.length) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const sh of s.shots) {
      const age = (now - sh.at) / 1000;
      if (age > 0.35) continue;
      const [ax, ay] = this.plotToScreen(sh.x0, sh.y0), [bx, by] = this.plotToScreen(sh.x1, sh.y1), fade = 1 - age / 0.35;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = sh.shell ? "#ff9a3c" : "#ffe27a";
      ctx.lineWidth = (sh.shell ? 3 : 1.6) * R;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (sh.hit) {
        ctx.fillStyle = sh.shell ? "rgba(255,120,40,.8)" : "rgba(255,230,140,.8)";
        ctx.beginPath();
        ctx.arc(bx, by, (sh.shell ? 7 : 4) * R * (1.4 - fade * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawSwipe() {
    const sw = this.swipe;
    if (!sw?.line?.length) return;
    const ctx = this.ctx, k = this.ratio ?? 1;
    ctx.save();
    ctx.strokeStyle = "rgba(232,200,74,.9)";
    ctx.fillStyle = "rgba(232,200,74,.12)";
    ctx.lineWidth = 2 * k;
    if (sw.kind === "box") {
      const [a, b] = [sw.line[0], sw.line[sw.line.length - 1]];
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    } else {
      ctx.lineWidth = 14 * k;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(232,200,74,.35)";
      ctx.beginPath();
      sw.line.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRoute() {
    const rt = this.route;
    if (!rt?.points?.length) return;
    const ctx = this.ctx, k = this.ratio ?? 1;
    ctx.save();
    ctx.lineWidth = 3 * k;
    ctx.setLineDash([8 * k, 6 * k]);
    ctx.strokeStyle = "rgba(232,200,74,.95)";
    ctx.beginPath();
    rt.points.forEach(([x, y], n) => { const [sx, sy] = this.plotToScreen(x + 0.5, y + 0.5); n ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.stroke();
    ctx.restore();
    if (rt.label) {
      const [lx, ly] = rt.points.at(-1);
      const [sx, sy] = this.plotToScreen(lx + 0.5, ly + 0.5);
      this.label(rt.label, sx, sy + 10 * k, 13 * k);
    }
  }

  drawSprites() {
    const ctx = this.ctx, s = this.state, a = this.atlas, px = this.cam.scale / 16, r = this.visibleRange();
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * s.w + x;
      const [sx, sy] = this.plotToScreen(x, y);
      const lot = this.lotAt.get(i);
      if (lot) a.draw(ctx, this.lotSprite(i, lot), sx, sy, px);
    }
    this.drawFill(r);
    this.drawDeposits(r);
    this.drawZones(r);
    for (const i of this.roadSet ?? []) {
      const x = i % s.w, y = (i / s.w) | 0;
      if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
      const [sx, sy] = this.plotToScreen(x, y);
      a.draw(ctx, this.roadSprite(i), sx, sy, px);
    }
    this.drawBorders(r);
    const items = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * s.w + x;
      if (this.occupied[i]) continue;
      const d = this.decoFor(i, x, y);
      if (d) items.push({ key: y + 1, x, draw: () => { const [sx, sy] = this.plotToScreen(x, y); a.draw(ctx, d, sx, sy, px); } });
    }
    for (const b of s.buildings.values()) {
      if (!b.sprite) continue;
      const ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0;
      if (ax + b.fp[0] < r.x0 || ax > r.x1 || ay > r.y1 || ay + b.fp[1] < r.y0) continue;
      items.push({ key: ay + b.fp[1], x: ax, draw: () => {
        const [sx, sy] = this.plotToScreen(ax, ay);
        const id = this.spriteFor(b), dry = this.dryDeposit(b), colour = s.nations.get(b.owner)?.colour;
        if (dry) ctx.globalAlpha = 0.55;
        if (b.def?.parts) this.drawParts(b, ax, ay, px, colour);
        else a.draw(ctx, id, sx, sy - this.riseOf(id, b.fp) * px, px, colour);
        ctx.globalAlpha = 1;
        if (dry) for (const i of b.plots) { const [dx, dy] = this.plotToScreen(i % s.w, (i / s.w) | 0); a.draw(ctx, `deposit_${dry}_depleted`, dx, dy, px); }
        if (b.state === "construction") this.progressBar(sx, sy + (this.ratio ?? 1), b.fp[0] * this.cam.scale, b.progress);
        if (b.id === this.selectedBuilding) this.outline(sx, sy, b.fp);
      } });
    }
    for (const f of this.people.figures(r, this.time)) items.push({ key: f.y + 0.1, x: f.x, draw: () => this.drawPerson(f, px) });
    for (const f of this.soldiers(r)) items.push({ key: f.y + 0.05, x: f.x, draw: () => this.drawPerson(f, px) });
    const now = performance.now();
    for (const f of this.fallen ?? []) items.push({ key: f.y - 0.3, x: f.x, draw: () => { this.ctx.globalAlpha = Math.max(0, 1 - (now - f.at) / 3000); this.drawPerson({ ...f, size: 0.62 }, px); this.ctx.globalAlpha = 1; } });
    for (const f of this.convoyFigures(r)) items.push({ key: f.y + 0.05, x: f.x, draw: () => this.drawPerson(f, px) });
    const shown = [];
    for (const u of s.machines?.values() ?? []) {
      const x = u.at % s.w, y = (u.at / s.w) | 0;
      if (x < r.x0 - 2 || x > r.x1 + 2 || y < r.y0 - 2 || y > r.y1 + 2) continue;
      shown.push(u);
      items.push({ key: u.air ? 1e9 + y : y + 0.95, x, draw: () => this.drawMachine(u, px) });
    }
    for (const u of s.units) {
      if (u.x < r.x0 - 4 || u.x > r.x1 + 4 || u.y < r.y0 - 4 || u.y > r.y1 + 4) continue;
      items.push({ key: u.air ? 1e9 : u.y + 1, x: u.x, draw: () => this.drawUnit(u, px) });
    }
    items.sort((p, q) => p.key - q.key || p.x - q.x);
    for (const it of items) it.draw();
    for (const u of shown) this.machineOverlay(u, px);
    for (const m of this.markers()) this.drawMarker(m, px);
  }

  dryDeposit(b) {
    const p = b.def?.producer, s = this.state;
    if (p?.kind !== "deposit" || b.state !== "active" || !s.depositKind) return null;
    let dry = null;
    for (const i of areaAround(s, b.plots, p.radius ?? 0)) {
      const d = s.depositKind(i);
      if (!d || !p.deposits.includes(d.id)) continue;
      if (!d.depleted) return null;
      dry = d.id;
    }
    return dry;
  }

  progressBar(x, y, w, p, colour = "#e8c84a") {
    const ctx = this.ctx, k = this.ratio ?? 1, h = 4 * k, pad = 2 * k;
    ctx.fillStyle = "rgba(15,34,51,.85)";
    ctx.fillRect(x + pad, y, w - pad * 2, h);
    ctx.fillStyle = colour;
    ctx.fillRect(x + pad + k, y + k, Math.max(0, (w - pad * 2 - 2 * k) * Math.min(1, p)), h - 2 * k);
  }

  outline(sx, sy, fp) {
    const ctx = this.ctx, k = this.ratio ?? 1, sc = this.cam.scale;
    ctx.strokeStyle = "#e8c84a";
    ctx.lineWidth = 2 * k;
    ctx.strokeRect(sx + k, sy + k, fp[0] * sc - 2 * k, fp[1] * sc - 2 * k);
  }

  drawBorders(r) {
    const ctx = this.ctx, s = this.state, sc = this.cam.scale, t = Math.max(2, Math.round(sc / 10));
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * s.w + x, o = s.owner[i];
      if (!o) continue;
      const [sx, sy] = this.plotToScreen(x, y);
      ctx.fillStyle = s.nations.get(o)?.colour ?? "#fff";
      if (y === 0 || s.owner[i - s.w] !== o) ctx.fillRect(sx, sy, sc, t);
      if (y === s.h - 1 || s.owner[i + s.w] !== o) ctx.fillRect(sx, sy + sc - t, sc, t);
      if (x === 0 || s.owner[i - 1] !== o) ctx.fillRect(sx, sy, t, sc);
      if (x === s.w - 1 || s.owner[i + 1] !== o) ctx.fillRect(sx + sc - t, sy, t, sc);
    }
  }

  frameFor(type) {
    const frames = this.state.animated?.[type];
    if (!frames) return type;
    return frames[Math.floor(this.time * 4) % frames.length];
  }

  drawUnit(u, px) {
    const ctx = this.ctx, a = this.atlas, s = this.state;
    const colour = s.nations.get(u.owner)?.colour;
    const [sx, sy] = this.plotToScreen(u.x, u.y);
    let id = u.sprite;
    if (u.frames) id = u.frames[Math.floor(this.time * 5 + u.x) % u.frames.length];
    if (u.air && a.has(u.sprite + "_shadow")) {
      const sp = a.get(u.sprite);
      a.draw(ctx, u.sprite + "_shadow", sx - sp.w * px / 2 + 6 * px, sy - sp.h * px / 2 + 10 * px, px);
    }
    const sp = a.get(id);
    if (!sp) return;
    a.draw(ctx, id, sx - sp.w * px / 2, sy - sp.h * px / 2 - (u.air ? 6 * px : 0), px, colour, u.flip);
  }

  machineScale() {
    const R = this.ratio ?? 1, px = this.cam.scale / 16;
    return this.cam.scale >= ZOOM.sprites * R ? px : Math.max(px, 0.8 * R);
  }

  machineSprite(u) {
    const era = this.state.nations.get(u.owner)?.era ?? "T", base = u.def.sprites?.[era] ?? u.def.sprite ?? u.type;
    const id = u.dive && this.atlas.has(`${base}_submerged`) ? `${base}_submerged` : base;
    return u.state === "wreck" && this.atlas.has(`${id}_wreck`) ? `${id}_wreck` : id;
  }

  machinePoint(u) {
    const s = this.state, p = s.pilotAt?.(`m:${u.id}`) ?? s.planeAt?.(u);
    return p ? [p[0], p[1]] : [(u.at % s.w) + 0.5, ((u.at / s.w) | 0) + 0.5];
  }

  drawPlane(u, k) {
    const s = this.state, sp = this.atlas.get(this.machineSprite(u)), p = s.pilotAt?.(`m:${u.id}`) ?? s.planeAt?.(u);
    if (!sp || !p) return;
    const [sx, sy] = this.plotToScreen(p[0], p[1]), R = this.ratio ?? 1, landed = u.air?.landed && !s.pilots?.has(`m:${u.id}`), size = landed ? 0.8 : 1.2;
    if (sx < -80 || sy < -80 || sx > this.canvas.width + 80 || sy > this.canvas.height + 80) return;
    const ctx = this.ctx, kk = Math.max(k, R) * size, lift = landed ? 0 : 10 * R;
    const off = landed ? ((u.id % 5) - 2) * 6 * R : 0, shadow = `${this.machineSprite(u)}_shadow`;
    ctx.save();
    ctx.translate(sx + off, sy);
    ctx.rotate(p[2]);
    if (!landed && this.atlas.has(shadow)) { ctx.globalAlpha = 0.35; this.atlas.draw(ctx, shadow, (-sp.w * kk) / 2 + lift * 0.4, (-sp.h * kk) / 2 + lift, kk); ctx.globalAlpha = 1; }
    this.atlas.draw(ctx, this.machineSprite(u), (-sp.w * kk) / 2, (-sp.h * kk) / 2, kk, s.nations.get(u.owner)?.colour);
    const rotor = `${this.machineSprite(u)}_rotor${1 + (Math.floor(Date.now() / 70) % 2)}`;
    if (u.state !== "wreck" && this.atlas.has(rotor)) this.atlas.draw(ctx, rotor, (-sp.w * kk) / 2, (-sp.h * kk) / 2, kk);
    ctx.restore();
    const t = u.air?.target;
    if (t && !landed && Math.floor(Date.now() / 120) % 3) {
      const [tx, ty] = this.plotToScreen(t[0] + Math.sin(Date.now() / 90) * 0.25, t[1] + Math.cos(Date.now() / 110) * 0.25);
      ctx.save();
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = 1.6 * R;
      ctx.beginPath();
      ctx.moveTo(sx + off, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,200,90,.85)";
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5 * R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFlak() {
    const s = this.state, now = Date.now(), R = this.ratio ?? 1;
    let sites = null;
    for (const u of s.machines?.values() ?? []) {
      if (!u.air || u.air.landed || u.state === "wreck") continue;
      sites ??= [...s.buildings.values()].filter(b => b.def?.antiAir && b.state === "active");
      const [x, y] = this.machinePoint(u);
      if (!sites.some(b => b.owner !== u.owner && Math.hypot((b.anchor % s.w) + b.fp[0] / 2 - x, ((b.anchor / s.w) | 0) + b.fp[1] / 2 - y) <= b.def.antiAir.radius * (s.map?.scale ?? 1))) continue;
      const beat = Math.floor(now / 150 + u.id), frame = `flak_burst_${beat % 3}`, size = Math.max(14 * R, this.cam.scale * 0.9);
      const [sx, sy] = this.plotToScreen(x + Math.sin(beat * 1.7) * 0.7, y + Math.cos(beat * 2.3) * 0.7);
      this.atlas.draw(this.ctx, frame, sx - size / 2, sy - size / 2, size / 16);
    }
  }

  machineBox(u, k) {
    const s = this.state, sp = this.atlas.get(this.machineSprite(u));
    if (!sp) return null;
    const [sx, sy] = this.plotToScreen(...this.machinePoint(u));
    if (sx < -80 || sy < -80 || sx > this.canvas.width + 80 || sy > this.canvas.height + 80) return null;
    return { sx, sy, w: sp.w * k, h: sp.h * k };
  }

  drawMachine(u, k) {
    if (u.air) return this.drawPlane(u, k);
    const m = this.machineBox(u, k);
    const p = this.state.pilotAt?.(`m:${u.id}`), left = p ? Math.cos(p[2]) < 0 : u.face < 0;
    if (!m) return;
    if (u.dive === 2) this.ctx.globalAlpha = 0.35;
    this.atlas.draw(this.ctx, this.machineSprite(u), m.sx - m.w / 2, m.sy - m.h / 2, k, this.state.nations.get(u.owner)?.colour, left);
    this.ctx.globalAlpha = 1;
  }

  drawNavalFire(u, k) {
    const s = this.state, ctx = this.ctx, R = this.ratio ?? 1, now = Date.now();
    const [ax, ay] = this.machinePoint(u), bx = (u.firing % s.w) + 0.5, by = ((u.firing / s.w) | 0) + 0.5;
    if (u.def.sub) {
      const t = ((now + u.id * 373) % 1500) / 800;
      if (t > 1) return;
      const [sx, sy] = this.plotToScreen(ax + (bx - ax) * t, ay + (by - ay) * t), kk = Math.max(R, k);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.atan2(by - ay, bx - ax));
      this.atlas.draw(ctx, "proj_torpedo", -8 * kk, -8 * kk, kk);
      ctx.restore();
      return;
    }
    const beat = Math.floor(now / 600 + u.id), phase = (now % 600) / 600;
    const ox = Math.sin(beat * 1.9) * 0.6, oy = Math.cos(beat * 2.7) * 0.6, [sx, sy] = this.plotToScreen(ax, ay), [tx, ty] = this.plotToScreen(bx + ox, by + oy);
    if (phase < 0.25) {
      ctx.save();
      ctx.globalAlpha = 1 - phase * 4;
      ctx.strokeStyle = "#ff9a3c";
      ctx.lineWidth = 2.5 * R;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    }
    const size = Math.max(22 * R, this.cam.scale * 1.8);
    this.atlas.draw(ctx, `flak_burst_${Math.min(2, Math.floor(phase * 3))}`, tx - size / 2, ty - size / 2, size / 16);
  }

  machineOverlay(u, k) {
    const m = this.machineBox(u, k), ctx = this.ctx, R = this.ratio ?? 1;
    if (!m) return;
    const { sx, sy, w, h } = m;
    if (u.id === this.selectedMachine) {
      ctx.strokeStyle = "#e8c84a";
      ctx.lineWidth = 2 * R;
      ctx.strokeRect(sx - w / 2 - 2 * R, sy - h / 2 - 2 * R, w + 4 * R, h + 4 * R);
    }
    if (u.state !== "wreck" && u.hp < u.def.hp) this.progressBar(sx - w / 2, sy + h / 2 + R, w, u.hp / u.def.hp, u.hp < u.def.hp / 3 ? "#e06a5a" : "#6fcf7a");
    if (u.cargo) this.label(String(u.cargo), sx, sy + h / 2 + 8 * R, 11 * R);
  }

  drawMachines() {
    const k = this.machineScale();
    for (const u of this.state.machines?.values() ?? []) this.drawMachine(u, k);
    for (const u of this.state.machines?.values() ?? []) this.machineOverlay(u, k);
    for (const u of this.state.machines?.values() ?? []) if (u.firing != null && u.state !== "wreck") this.drawNavalFire(u, k);
    this.drawConvoys(k);
  }

  convoyFigures(r) {
    const s = this.state, out = [], now = Date.now();
    for (const c of s.convoys?.values() ?? []) {
      if (c.ship) continue;
      const t = Math.min(1, (now - (c.movedAt ?? 0)) / 1000);
      const px = c.prev % s.w, py = (c.prev / s.w) | 0, qx = c.pos % s.w, qy = (c.pos / s.w) | 0;
      const x = px + (qx - px) * t, y = py + (qy - py) * t;
      if (r && (x < r.x0 - 2 || x > r.x1 + 2 || y < r.y0 - 2 || y > r.y1 + 2)) continue;
      out.push({ x: x + 0.5, y: y + 0.8, sprite: "loco_steam", flip: qx < px, owner: c.owner, size: 0.9, convoy: c });
    }
    return out;
  }

  drawConvoys(k) {
    const a = this.atlas;
    for (const f of this.convoyFigures(null)) {
      const sp = a.get(f.sprite);
      if (!sp) continue;
      const [sx, sy] = this.plotToScreen(f.x, f.y - 0.3);
      if (sx < -40 || sy < -40 || sx > this.canvas.width + 40 || sy > this.canvas.height + 40) continue;
      a.draw(this.ctx, f.sprite, sx - (sp.w * k) / 2, sy - (sp.h * k) / 2, k, this.state.nations.get(f.owner)?.colour, f.flip);
    }
  }

  machineAt(sx, sy) {
    const s = this.state, R = this.ratio ?? 1, k = this.machineScale();
    let best = null, bd = Infinity;
    for (const u of s.machines?.values() ?? []) {
      const sp = this.atlas.get(this.machineSprite(u));
      if (!sp) continue;
      const [mx, my] = this.plotToScreen(...this.machinePoint(u));
      if (Math.abs(sx - mx) > Math.max((sp.w * k) / 2, 8 * R) || Math.abs(sy - my) > Math.max((sp.h * k) / 2, 8 * R)) continue;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd) { bd = d; best = u.id; }
    }
    return best;
  }

  drawPerson(f, px) {
    const k = px * (f.size ?? 0.85), sp = this.atlas.get(f.sprite);
    if (!sp) return;
    const [sx, sy] = this.plotToScreen(f.x, f.y);
    if (f.picked) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(232,200,74,.95)";
      ctx.lineWidth = Math.max(1, (this.ratio ?? 1) * 1.5);
      ctx.beginPath();
      ctx.ellipse(sx, sy - k, Math.max(3, sp.w * k * 0.45), Math.max(1.5, sp.w * k * 0.2), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    this.atlas.draw(this.ctx, f.sprite, sx - (sp.w * k) / 2, sy - sp.h * k, k, this.state.nations.get(f.owner)?.colour, f.flip);
  }

  drawMarker(m, px) {
    const ctx = this.ctx, a = this.atlas, colour = this.state.nations.get(m.owner)?.colour;
    const [sx, sy0] = this.plotToScreen(m.x, m.y);
    const size = Math.max(16 * (this.ratio ?? 1), 16 * px);
    const k = size / 16, sy = sy0 - this.markerLift(px);
    a.draw(ctx, `army_${m.era}_${m.state ?? "idle"}`, sx - size / 2, sy - size / 2, k, colour);
    this.label(String(m.soldiers ?? Math.round(m.troops)), sx, sy + size / 2 + 2, Math.max(11, 6 * k));
    if (m.xp) this.rank(sx, sy - size / 2 - 2 * k, m.xp, Math.max(this.ratio ?? 1, k * 0.6));
  }

  markerLift(px) {
    return px >= 1 ? Math.max(16 * (this.ratio ?? 1), 16 * px) * 1.5 : 0;
  }

  rank(x, y, level, k) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 2 * k;
    ctx.lineJoin = "round";
    for (let i = 0; i < level; i++) {
      const cy = y - i * 3.5 * k;
      ctx.beginPath();
      ctx.moveTo(x - 4 * k, cy - 2 * k);
      ctx.lineTo(x, cy + 1 * k);
      ctx.lineTo(x + 4 * k, cy - 2 * k);
      ctx.strokeStyle = "rgba(15,34,51,.9)";
      ctx.lineWidth = 3.5 * k;
      ctx.stroke();
      ctx.strokeStyle = "#e8c84a";
      ctx.lineWidth = 2 * k;
      ctx.stroke();
    }
    ctx.restore();
  }

  stackPoint(st) {
    const piloted = this.state.pilotAt?.(`s:${st.id}`);
    if (piloted) return [piloted[0], piloted[1]];
    const w = this.state.w, t = st.movedAt && st.prev != null ? Math.min(1, (Date.now() - st.movedAt) / 1000) : 1, a = st.prev ?? st.pos;
    return [(a % w) + ((st.pos % w) - (a % w)) * t + 0.5, ((a / w) | 0) + (((st.pos / w) | 0) - ((a / w) | 0)) * t + 0.5];
  }

  soldiersIn(st) {
    const rules = this.state.soldierRules;
    return rules && !this.state.nations.get(st.owner)?.bot ? soldierCount(st.troops, rules.troopsEach) : null;
  }

  oneByOne() {
    const rules = this.state.soldierRules;
    return !!rules && this.cam.scale >= rules.drawZoom * (this.ratio ?? 1);
  }

  soldierSpots(st, share = 1, dt = 0) {
    const s = this.state, rules = s.soldierRules, n = soldierCount(st.troops, rules.troopsEach), out = [];
    if (!n) return out;
    const [cx, cy] = this.stackPoint(st), m = Math.max(1, Math.min(n, Math.round(n * share)));
    const face = this.facing.get(st.id), ang = face?.angle ?? Math.PI / 2, fight = !!face?.fighting;
    const gap = rules.spacing * (fight ? 1.35 : 1), c = Math.cos(ang), sn = Math.sin(ang), list = ranksOf(m, gap);
    const land = (x, y) => { const i = Math.floor(y) * s.w + Math.floor(x); return x >= 0 && y >= 0 && x < s.w && y < s.h && TERRAIN[s.terrain?.[i]]?.land; };
    this.troopPos ??= new Map();
    for (let k = 0; k < m; k++) {
      const slot = m === n ? k : Math.floor((k * n) / m), [fw, side] = list[k], wob = fight && k ? Math.sin(this.time * 3 + slot * 1.7) * gap * 0.18 : 0;
      let x = cx + c * (fw + wob * 0.5) - sn * (side + wob), y = cy + sn * (fw + wob * 0.5) + c * (side + wob);
      if (!land(x, y)) { x = cx + (x - cx) * 0.4; y = cy + (y - cy) * 0.4; if (!land(x, y)) { x = cx + (x - cx) * 0.25; y = cy + (y - cy) * 0.25; } }
      const key = `${st.id}:${slot}`;
      let p = this.troopPos.get(key);
      if (!p || Math.hypot(p.x - x, p.y - y) > 4) this.troopPos.set(key, (p = { x, y, t: this.time }));
      else if (dt > 0) {
        const d = Math.hypot(x - p.x, y - p.y), step = Math.min(d, (1.2 + 0.9 * noise(slot, st.id)) * dt);
        if (d > 1e-3) { p.x += ((x - p.x) / d) * step; p.y += ((y - p.y) / d) * step; }
        p.t = this.time;
      }
      out.push({ slot, x: p.x, y: p.y, leader: k === 0, moving: Math.hypot(x - p.x, y - p.y) > 0.04 });
    }
    return out;
  }

  soldiers(r) {
    const s = this.state, types = s.unitTypes, out = [];
    if (!types) return out;
    const near = [...s.stacks.values()].filter(st => { const x = st.pos % s.w, y = (st.pos / s.w) | 0; return x >= r.x0 - 8 && x <= r.x1 + 8 && y >= r.y0 - 8 && y <= r.y1 + 8; });
    const one = this.oneByOne(), lines = new Set();
    let total = 0;
    for (const st of near) {
      if (one && this.soldiersIn(st) !== null) { lines.add(st); total += this.soldiersIn(st); }
    }
    const R = this.ratio ?? 1, budget = Math.max(60, Math.floor((this.canvas.width * this.canvas.height) / (R * R) / (s.soldierRules?.drawArea ?? 900)));
    const share = total > budget ? budget / total : 1, clock = performance.now(), dt = this.soldierClock ? Math.min(0.1, (clock - this.soldierClock) / 1000) : 0;
    this.soldierClock = clock;
    this.soldierShare = share;
    this.leaderAt = new Map();
    this.soldierCounts ??= new Map();
    this.fallen = (this.fallen ?? []).filter(f => clock - f.at < 3000);
    if (this.troopPos && clock > (this.purgeAt ?? 0)) {
      this.purgeAt = clock + 5000;
      for (const [k, p] of this.troopPos) if (this.time - p.t > 5) this.troopPos.delete(k);
      for (const id of this.soldierCounts.keys()) if (!s.stacks.has(id)) this.soldierCounts.delete(id);
    }
    for (const st of near) {
      const x = st.pos % s.w, y = (st.pos / s.w) | 0;
      let seen = this.facing.get(st.id);
      if (!seen) this.facing.set(st.id, (seen = { pos: st.pos, dir: "s", angle: Math.PI / 2 }));
      else if (seen.pos !== st.pos) {
        seen.angle = Math.atan2(y - ((seen.pos / s.w) | 0), x - (seen.pos % s.w));
        seen.pos = st.pos;
      }
      const foe = near.find(o => o.owner !== st.owner && Math.max(Math.abs((o.pos % s.w) - x), Math.abs(((o.pos / s.w) | 0) - y)) <= 1);
      seen.fighting = !!foe;
      if (foe && foe.pos !== st.pos) seen.angle = Math.atan2(((foe.pos / s.w) | 0) - y, (foe.pos % s.w) - x);
      const pl = s.pilots?.get(`s:${st.id}`), steering = !!pl && (pl.x !== pl.px || pl.y !== pl.py);
      if (steering) seen.angle = pl.heading;
      const dir = (seen.dir = dirOf(seen.angle));
      let main = "levy", most = st.troops - Object.values(st.mix ?? {}).reduce((a, b) => a + b, 0);
      for (const [id, n] of Object.entries(st.mix ?? {})) if (n > most) { most = n; main = id; }
      const base = types.table[main]?.sprite ?? "hunter";
      const fighting = !!foe;
      if (lines.has(st)) {
        const rules = s.soldierRules, kinds = soldierTypes(st.troops, st.mix, rules.troopsEach), walking = pl ? steering : st.order !== "hold" || (st.movedAt && Date.now() - st.movedAt < 1000);
        const whole = st.id === this.selected || this.group?.has(st.id) || this.groupPreview?.has(st.id), picked = this.picked?.get(st.id);
        const count = soldierCount(st.troops, rules.troopsEach), before = this.soldierCounts.get(st.id) ?? count;
        if (count < before && this.troopPos) for (let slot = count; slot < before && this.fallen.length < 200; slot++) {
          const p = this.troopPos.get(`${st.id}:${slot}`);
          if (p) this.fallen.push({ x: p.x, y: p.y + 0.2, sprite: `${base}_dead`, owner: st.owner, at: clock });
        }
        this.soldierCounts.set(st.id, count);
        for (const p of this.soldierSpots(st, share, dt)) {
          const kind = typeOfSlot(kinds, p.slot) ?? "levy", sprite = types.table[kind]?.sprite ?? "hunter", beat = Math.floor(this.time * 4 + p.slot * 0.37 + st.id) % 2;
          const frame = fighting ? (beat ? "attack" : "idle") : walking || p.moving ? (beat ? "walk1" : "walk2") : "idle";
          if (p.leader) this.leaderAt.set(st.id, [p.x, p.y]);
          out.push({ x: p.x, y: p.y + 0.2, sprite: `${sprite}_${dir === "w" ? "e" : dir}_${frame}`, flip: dir === "w", owner: st.owner, stack: st.id, slot: p.slot, size: p.leader ? 0.74 : 0.62, picked: whole || !!picked?.has(p.slot) });
        }
        continue;
      }
      const count = Math.max(1, Math.min(5, Math.floor(1 + Math.log2(Math.max(1, st.troops / 40)))));
      for (let k = 0; k < count; k++) {
        const [ox, oy] = FORMATION[k], beat = Math.floor(this.time * 4 + k + st.id) % 2;
        const frame = fighting ? (beat ? "attack" : "idle") : st.order !== "hold" ? (beat ? "walk1" : "walk2") : "idle";
        out.push({ x: x + 0.5 + ox, y: y + 0.75 + oy, sprite: `${base}_${dir === "w" ? "e" : dir}_${frame}`, flip: dir === "w", owner: st.owner, stack: st.id, size: 1.1 });
      }
    }
    return out;
  }

  label(text, x, y, size, colour = "#e9dcb8") {
    const ctx = this.ctx;
    ctx.font = `600 ${Math.round(size)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(15,34,51,.9)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  drawIcons() {
    const ctx = this.ctx, s = this.state, a = this.atlas, c = this.cam;
    const size = Math.max(6, Math.min(16, c.scale * 1.5)), k = size / 8;
    for (const b of s.buildings.values()) {
      const icon = ICON_FOR[b.def?.category ?? b.def?.zone];
      if (!icon || b.state === "rubble") continue;
      const ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0;
      const [sx, sy] = this.plotToScreen(ax + b.fp[0] / 2, ay + b.fp[1] / 2);
      if (sx < -20 || sy < -20 || sx > this.canvas.width + 20 || sy > this.canvas.height + 20) continue;
      if (b.def.civilian && b.fp[0] * c.scale < size && hash2(ax, ay, 5) > 0.35) continue;
      ctx.globalAlpha = b.state === "construction" ? 0.5 : 1;
      a.draw(ctx, icon, sx - size / 2, sy - size / 2, k);
    }
    ctx.globalAlpha = 1;
    const rk = this.ratio ?? 1;
    this.drawMachines();
    for (const m of this.markers()) {
      const [sx, sy] = this.plotToScreen(m.x, m.y);
      a.draw(ctx, `army_${m.era}_${m.state ?? "idle"}`, sx - 8 * rk, sy - 8 * rk, rk, s.nations.get(m.owner)?.colour);
      this.label(String(m.soldiers ?? Math.round(m.troops)), sx, sy + 9 * rk, 11 * rk);
    }
  }

  drawDots() {
    const ctx = this.ctx, s = this.state, k = this.ratio ?? 1;
    for (const n of s.nations.values()) {
      if (n.capital === undefined || n.capital === null || n.bot || !n.alive) continue;
      const [sx, sy] = this.plotToScreen(n.capital % s.w + 0.5, ((n.capital / s.w) | 0) + 0.5);
      this.atlas.draw(ctx, "mapicon_capital", sx - 4 * k, sy - 4 * k, k);
    }
    this.drawMachines();
    for (const m of this.markers()) {
      const [sx, sy] = this.plotToScreen(m.x, m.y);
      this.atlas.draw(ctx, `army_${m.era}_${m.state}`, sx - 6 * k, sy - 6 * k, 0.75 * k, s.nations.get(m.owner)?.colour);
      this.label(String(Math.round(m.troops)), sx, sy + 7 * k, 10 * k);
    }
  }

  drawNight() {
    const ctx = this.ctx, s = this.state, a = this.atlas, c = this.cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const px = c.scale / 16;
    for (const b of s.buildings.values()) {
      if (!b.sprite || (b.state && b.state !== "active")) continue;
      const lights = `${b.type}_lights`;
      if (!a.has(lights)) continue;
      const ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0;
      const [sx, sy] = this.plotToScreen(ax, ay);
      if (sx > this.canvas.width + 50 || sy > this.canvas.height + 80 || sx + b.fp[0] * c.scale < -50 || sy + b.fp[1] * c.scale < -50) continue;
      if (c.scale >= ZOOM.sprites) a.draw(ctx, lights, sx, sy - this.riseOf(b.type, b.fp) * px, px);
      else {
        ctx.fillStyle = "rgba(248,220,130,0.85)";
        const d = Math.max(1, c.scale * 0.6);
        ctx.fillRect(sx + (b.fp[0] * c.scale - d) / 2, sy + (b.fp[1] * c.scale - d) / 2, d, d);
      }
    }
  }
}
