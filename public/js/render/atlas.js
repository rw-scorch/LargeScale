const KEYS = [[255, 0, 255], [192, 0, 192], [128, 0, 128]];

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Atlas {
  constructor(pack) {
    this.pack = pack;
    this.byId = new Map(pack.sprites.map(s => [s.id, s]));
    this.sheets = {};
    this.tinted = new Map();
  }

  async load() {
    await Promise.all(Object.entries(this.pack.sheets).map(async ([cat, src]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      this.sheets[cat] = c;
    }));
    return this;
  }

  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id); }

  sheet(cat, colour) {
    if (!colour) return this.sheets[cat];
    const key = cat + colour;
    if (this.tinted.has(key)) return this.tinted.get(key);
    const src = this.sheets[cat];
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data;
    const base = hexRGB(colour);
    const to = [1, 0.7, 0.45].map(f => base.map(v => Math.round(v * f)));
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      for (let k = 0; k < 3; k++) {
        if (a[i] === KEYS[k][0] && a[i + 1] === KEYS[k][1] && a[i + 2] === KEYS[k][2]) {
          a[i] = to[k][0]; a[i + 1] = to[k][1]; a[i + 2] = to[k][2];
          break;
        }
      }
    }
    ctx.putImageData(d, 0, 0);
    this.tinted.set(key, c);
    return c;
  }

  draw(ctx, id, x, y, px, colour = null, flip = false) {
    const s = this.byId.get(id);
    if (!s) return false;
    const w = s.w * px, h = s.h * px;
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(x + w), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(this.sheet(s.category, colour), s.x, s.y, s.w, s.h, 0, 0, Math.round(w), Math.round(h));
      ctx.restore();
    } else {
      ctx.drawImage(this.sheet(s.category, colour), s.x, s.y, s.w, s.h, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    return true;
  }
}

export async function loadAtlas(base, categories) {
  const pack = { sheets: {}, sprites: [] };
  await Promise.all(categories.map(async cat => {
    const sheet = await (await fetch(`${base}/${cat}.json`)).json();
    pack.sheets[cat] = `${base}/${sheet.image}`;
    for (const [id, f] of Object.entries(sheet.frames)) pack.sprites.push({ id, category: cat, ...f });
  }));
  return new Atlas(pack).load();
}
