import { TERRAIN } from "../shared/terrain.js";
import { hash2 } from "../shared/rng.js";
import { areaAround } from "../shared/buildings.js";
import { People } from "./people.js";

export const ZOOM = { max: 64, sprites: 10, icons: 3, maxRatio: 2, out: 0.5 };
export const CHUNK = 256;
export const NIGHT = "rgba(12,18,52,0.62)";
const ROAD_NAMES = ["none", "dirt", "cobble", "paved", "highway", "rail"];
const DIRS = [[1, "N"], [2, "E"], [4, "S"], [8, "W"]];
const ZONE_SPRITE = [null, "ov_zone_residential", "ov_zone_commercial", "ov_zone_industrial", "ov_zone_farmland"];
const DEPOSIT_COLOUR = { stone: "#b8b0a0", clay: "#c07850", iron: "#a05a4a", copper: "#d08a40", tin: "#c8c8d0", coal: "#303030", gold: "#f0c840", silver: "#e0e0f0", gems: "#c060e0", oil: "#101010", gas: "#80c0c0", uranium: "#80f060", bauxite: "#d06040", lithium: "#f0f0f0", sulfur: "#f0f040", salt: "#ffffff", fish: "#50a0f0" };
export const ZONE_COLOUR = [null, "rgba(111,207,122,.35)", "rgba(90,160,230,.35)", "rgba(232,200,74,.35)", "rgba(190,150,90,.35)"];
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
    this.selectedBuilding = null;
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
    for (let i = 0; i < s.roads.length; i++) if (s.roads[i]) this.occupied[i] = 1;
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
    if (d?.sprite) return b.state === "active" ? d.seasonSprites?.[this.season] ?? d.sprite : a.has(`${b.type}_${b.state}`) ? `${b.type}_${b.state}` : d.seasonSprites?.winter ?? d.sprite;
    if (b.state && b.state !== "active" && a.has(`${b.type}_${b.state}`)) return `${b.type}_${b.state}`;
    return this.frameFor(b.type);
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
      const state = st.id === this.selected ? "selected" : st.order === "hold" ? "idle" : "moving";
      out.push({ id: st.id, owner: st.owner, x: (st.pos % s.w) + 0.5, y: ((st.pos / s.w) | 0) + 0.5, troops: st.troops, era: s.nations.get(st.owner)?.era ?? "T", state });
    }
    return out;
  }

  stackAt(sx, sy, radius = 14 * (this.ratio ?? 1)) {
    let best = null, bestD = radius;
    for (const m of this.markers()) {
      const [mx, my] = this.plotToScreen(m.x, m.y);
      const d = Math.hypot(mx - sx, my - sy);
      if (d <= bestD) { bestD = d; best = m.id; }
    }
    return best;
  }

  roadSprite(i) {
    const s = this.state, r = s.roads, w = s.w, x = i % w;
    let m = 0;
    if (i >= w && r[i - w]) m |= 1;
    if (x < w - 1 && r[i + 1]) m |= 2;
    if (i + w < r.length && r[i + w]) m |= 4;
    if (x > 0 && r[i - 1]) m |= 8;
    const kind = ROAD_NAMES[r[i]];
    return kind === "rail" ? `rail_${maskName(m)}` : `road_${kind}_${maskName(m)}`;
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
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (c.scale >= ZOOM.sprites * R) this.drawSprites();
    else if (c.scale >= ZOOM.icons * R) this.drawIcons();
    else this.drawDots();
    if (c.scale >= ZOOM.icons * R && c.scale < ZOOM.sprites * R && (this.showZones || this.zoneRect)) this.drawZoneFill(this.visibleRange(0));
    if (this.showDeposits && c.scale >= ZOOM.icons * R && c.scale < ZOOM.sprites * R) this.drawDepositDots(this.visibleRange(0));
    this.drawZoneRect();
    this.drawGhost();
    this.drawEffects();
    this.drawRoute();
    if (this.night) this.drawNight();
  }

  drawEffects() {
    const list = this.state.effects;
    if (!list?.length) return;
    const now = Date.now(), R = this.ratio ?? 1, s = this.state;
    for (let k = list.length - 1; k >= 0; k--) if (now - list[k].at > 4000) list.splice(k, 1);
    for (const fx of list) {
      if (fx.kind !== "era_up") continue;
      const frame = `era_up_${Math.floor((now - fx.at) / 180) % 3}`;
      const size = Math.max(48 * R, this.cam.scale * 3), k = size / 32;
      const [sx, sy] = this.plotToScreen((fx.plot % s.w) + 0.5, ((fx.plot / s.w) | 0) + 0.5);
      this.atlas.draw(this.ctx, frame, sx - size / 2, sy - size / 2, k);
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

  drawZoneRect() {
    const q = this.zoneRect;
    if (!q) return;
    const ctx = this.ctx, k = this.ratio ?? 1, sc = this.cam.scale;
    const [sx, sy] = this.plotToScreen(q.x, q.y);
    ctx.fillStyle = q.code ? ZONE_COLOUR[q.code] : "rgba(224,106,90,.3)";
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
      if (s.roads[i]) a.draw(ctx, this.roadSprite(i), sx, sy, px);
    }
    this.drawFill(r);
    this.drawDeposits(r);
    this.drawZones(r);
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
        const id = this.spriteFor(b), dry = this.dryDeposit(b);
        if (dry) ctx.globalAlpha = 0.55;
        a.draw(ctx, id, sx, sy - this.riseOf(id, b.fp) * px, px, s.nations.get(b.owner)?.colour);
        ctx.globalAlpha = 1;
        if (dry) for (const i of b.plots) { const [dx, dy] = this.plotToScreen(i % s.w, (i / s.w) | 0); a.draw(ctx, `deposit_${dry}_depleted`, dx, dy, px); }
        if (b.state === "construction") this.progressBar(sx, sy + (this.ratio ?? 1), b.fp[0] * this.cam.scale, b.progress);
        if (b.id === this.selectedBuilding) this.outline(sx, sy, b.fp);
      } });
    }
    for (const f of this.people.figures(r, this.time)) items.push({ key: f.y + 0.1, x: f.x, draw: () => this.drawPerson(f, px) });
    for (const u of s.units) {
      if (u.x < r.x0 - 4 || u.x > r.x1 + 4 || u.y < r.y0 - 4 || u.y > r.y1 + 4) continue;
      items.push({ key: u.air ? 1e9 : u.y + 1, x: u.x, draw: () => this.drawUnit(u, px) });
    }
    items.sort((p, q) => p.key - q.key || p.x - q.x);
    for (const it of items) it.draw();
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

  progressBar(x, y, w, p) {
    const ctx = this.ctx, k = this.ratio ?? 1, h = 4 * k, pad = 2 * k;
    ctx.fillStyle = "rgba(15,34,51,.85)";
    ctx.fillRect(x + pad, y, w - pad * 2, h);
    ctx.fillStyle = "#e8c84a";
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

  drawPerson(f, px) {
    const k = px * 0.85, sp = this.atlas.get(f.sprite);
    if (!sp) return;
    const [sx, sy] = this.plotToScreen(f.x, f.y);
    this.atlas.draw(this.ctx, f.sprite, sx - (sp.w * k) / 2, sy - sp.h * k, k, this.state.nations.get(f.owner)?.colour, f.flip);
  }

  drawMarker(m, px) {
    const ctx = this.ctx, a = this.atlas, colour = this.state.nations.get(m.owner)?.colour;
    const [sx, sy] = this.plotToScreen(m.x, m.y);
    const size = Math.max(16 * (this.ratio ?? 1), 16 * px);
    const k = size / 16;
    a.draw(ctx, `army_${m.era}_${m.state ?? "idle"}`, sx - size / 2, sy - size / 2, k, colour);
    this.label(String(Math.round(m.troops)), sx, sy + size / 2 + 2, Math.max(11, 6 * k));
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
    for (const m of this.markers()) {
      const [sx, sy] = this.plotToScreen(m.x, m.y);
      a.draw(ctx, `army_${m.era}_${m.state ?? "idle"}`, sx - 8 * rk, sy - 8 * rk, rk, s.nations.get(m.owner)?.colour);
      this.label(String(Math.round(m.troops)), sx, sy + 9 * rk, 11 * rk);
    }
  }

  drawDots() {
    const ctx = this.ctx, s = this.state, k = this.ratio ?? 1;
    for (const n of s.nations.values()) {
      if (n.capital === undefined || n.capital === null || n.bot || !n.alive) continue;
      const [sx, sy] = this.plotToScreen(n.capital % s.w + 0.5, ((n.capital / s.w) | 0) + 0.5);
      this.atlas.draw(ctx, "mapicon_capital", sx - 4 * k, sy - 4 * k, k);
    }
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
