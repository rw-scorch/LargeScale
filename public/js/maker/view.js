import { TERRAIN } from "../shared/terrain.js";
import { hash2 } from "../shared/rng.js";

const hexRGB = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));

export class MakerView {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lut = TERRAIN.map(t => (palette[t.name] ?? ["#888888", "#888888", "#888888", "#888888", "#888888"]).map(hexRGB));
    this.base = document.createElement("canvas");
    this.cam = { scale: 1, x: 0, y: 0 };
    this.cursor = null;
    this.radius = 1;
    this.queued = false;
  }

  swatch(t) {
    const c = this.lut[t][2];
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  load(map) {
    this.map = map;
    this.base.width = map.w;
    this.base.height = map.h;
    this.img = this.base.getContext("2d").createImageData(map.w, map.h);
    this.refresh(0, 0, map.w, map.h);
    this.fit();
  }

  rgb(i, x, y) {
    const n = hash2(x, y, 11) * 0.7 + hash2(x >> 2, y >> 2, 12) * 0.3;
    return this.lut[this.map.terrain[i]][Math.min(4, Math.max(0, Math.floor(n * 3.4 + 0.3)))];
  }

  refresh(x0, y0, x1, y1) {
    const { w, terrain } = this.map, d = this.img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, c = this.rgb(i, x, y), k = i * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    this.base.getContext("2d").putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    this.draw();
  }

  refreshPlots(idx) {
    if (!idx.length) return;
    const w = this.map.w;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const i of idx) {
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    this.refresh(x0, y0, x1 + 1, y1 + 1);
  }

  size() {
    const r = this.canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(r.width * dpr) || this.canvas.height !== Math.round(r.height * dpr)) {
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
    }
    return { w: r.width, h: r.height, dpr };
  }

  fit() {
    const { w, h } = this.size();
    const s = Math.min(w / this.map.w, h / this.map.h) * 0.96;
    this.cam = { scale: s, x: (w - this.map.w * s) / 2, y: (h - this.map.h * s) / 2 };
    this.draw();
  }

  toPlot(sx, sy) {
    return { x: Math.floor((sx - this.cam.x) / this.cam.scale), y: Math.floor((sy - this.cam.y) / this.cam.scale) };
  }

  zoomAt(sx, sy, factor) {
    const c = this.cam, s = Math.min(64, Math.max(0.05, c.scale * factor)), k = s / c.scale;
    this.cam = { scale: s, x: sx - (sx - c.x) * k, y: sy - (sy - c.y) * k };
    this.draw();
  }

  pan(dx, dy) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.draw();
  }

  draw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.paint();
    });
  }

  paint() {
    if (!this.map) return;
    const { w, h, dpr } = this.size(), ctx = this.ctx, c = this.cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07121d";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = c.scale < 1;
    ctx.drawImage(this.base, c.x, c.y, this.map.w * c.scale, this.map.h * c.scale);
    ctx.strokeStyle = "rgba(232,200,74,.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - 0.5, c.y - 0.5, this.map.w * c.scale + 1, this.map.h * c.scale + 1);
    if (this.cursor) {
      const { x, y } = this.cursor, r = Math.max(0.5, this.radius - 0.5) * c.scale;
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(c.x + (x + 0.5) * c.scale, c.y + (y + 0.5) * c.scale, Math.max(3, r), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
