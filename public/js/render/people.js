import { TERRAIN } from "../shared/terrain.js";
import { hash2 } from "../shared/rng.js";

const WALKER = { T: "walker_tribal", M: "walker_medieval", G: "walker_gunpowder", I: "walker_industrial", Mo: "walker_modern", F: "walker_future" };
const MAX = 160;
const PERIOD = 14;

function kindOf(def) {
  const p = def.producer;
  if (def.gathers) return "gather";
  if (!p) return null;
  if (p.kind === "deposit") return p.deposits.includes("fish") ? "fish" : "mine";
  return p.kind;
}

function pose(base, a, b, t, seed, back = base) {
  const ph = (((t / PERIOD + seed) % 1) + 1) % 1;
  const going = ph < 0.4, coming = ph >= 0.5 && ph < 0.9;
  const u = going ? ph / 0.4 : ph < 0.5 ? 1 : coming ? 1 - (ph - 0.5) / 0.4 : 0;
  const dx = (b[0] - a[0]) * (going ? 1 : -1), dy = (b[1] - a[1]) * (going ? 1 : -1);
  const moving = (going || coming) && Math.hypot(dx, dy) > 0.05;
  const dir = !moving ? "s" : Math.abs(dx) >= Math.abs(dy) ? "e" : dy > 0 ? "s" : "n";
  const frame = moving ? (Math.floor(t * 6 + seed * 7) % 2 ? "walk1" : "walk2") : "idle";
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, sprite: `${coming ? back : base}_${dir}_${frame}`, flip: moving && dir === "e" && dx < 0 };
}

export class People {
  constructor(state) {
    this.state = state;
    this.spots = new Map();
  }

  near(b, r, test, k) {
    const s = this.state, ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0, out = [];
    for (let y = ay - r; y < ay + b.fp[1] + r; y++) for (let x = ax - r; x < ax + b.fp[0] + r; x++) {
      if (x < 0 || y < 0 || x >= s.w || y >= s.h || !test(y * s.w + x)) continue;
      out.push([(x - ax - b.fp[0] / 2) ** 2 + (y - ay - b.fp[1] / 2) ** 2, x, y]);
    }
    out.sort((p, q) => p[0] - q[0]);
    return out.length ? [out[k % Math.min(out.length, 6)][1] + 0.5, out[k % Math.min(out.length, 6)][2] + 0.8] : null;
  }

  workSpot(b, kind, k, now) {
    const key = `${b.id}:${k}`, hit = this.spots.get(key);
    if (hit && now - hit.at < 20) return hit.at2;
    const s = this.state, p = b.def.producer, r = p?.radius ?? 1, ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0;
    let spot = null;
    if (kind === "forest") spot = this.near(b, r, i => TERRAIN[s.terrain[i]].forest, k);
    else if (kind === "gather") spot = this.near(b, 4, i => TERRAIN[s.terrain[i]].forest || (TERRAIN[s.terrain[i]].land && !this.state.at?.has(i) && hash2(i, k, 61) < 0.08), k * 3);
    else if (kind === "fish") spot = this.near(b, Math.max(1, r), i => !TERRAIN[s.terrain[i]].land, k);
    if (!spot) {
      const h = hash2(b.id, k, 31), g = hash2(b.id, k, 37);
      const spread = kind === "farm" || kind === "pasture" ? 0 : 1.2;
      spot = [ax + b.fp[0] * (0.2 + 0.6 * h) + (h - 0.5) * spread * 2, ay + b.fp[1] * (0.3 + 0.6 * g) + (g - 0.5) * spread * 2];
    }
    this.spots.set(key, { at: now, at2: spot });
    return spot;
  }

  figures(r, t) {
    const s = this.state, out = [], me = s.nations.get(s.you), town = s.purse?.town;
    const staffed = Math.max(0.25, town?.worked ?? 0), filled = town?.housing ? Math.min(1, town.pop / town.housing) : 0;
    for (const b of s.buildings.values()) {
      if (out.length >= MAX) break;
      const def = b.def, ax = b.anchor % s.w, ay = (b.anchor / s.w) | 0;
      if (!def || b.state === "rubble" || b.state === "damaged" || ax + b.fp[0] < r.x0 || ax > r.x1 || ay > r.y1 || ay + b.fp[1] < r.y0) continue;
      const door = [ax + b.fp[0] / 2, ay + b.fp[1] - 0.05], owner = b.owner;
      const era = s.nations.get(owner)?.era ?? me?.era ?? "T", walker = WALKER[era] ?? WALKER.T;
      if (b.state === "construction") {
        const side = [ax + b.fp[0] + 0.1, ay + b.fp[1] - 0.05], seed = hash2(b.id, 1, 41);
        out.push({ ...pose("builder", door, side, t * 1.6, seed), owner });
        continue;
      }
      const kind = kindOf(def);
      if (kind) {
        const n = kind === "gather" ? 2 : Math.min(3, def.jobs ?? 1), count = kind === "gather" ? n : owner === s.you ? Math.max(1, Math.round(n * staffed)) : Math.min(2, n);
        const base = kind === "forest" || kind === "gather" ? walker : kind === "mine" ? "miner" : kind === "fish" ? "fisher" : kind === "farm" ? "farmer" : "herder";
        const back = kind === "forest" || kind === "gather" ? "worker_carrying" : base;
        for (let k = 0; k < count; k++) out.push({ ...pose(base, door, this.workSpot(b, kind, k, t), t, hash2(b.id, k, 43), back), owner });
        continue;
      }
      if (def.civilian && def.zone === "res") {
        const share = owner === s.you ? filled : 0.6, seed = hash2(b.id, 2, 47);
        if (seed >= share) continue;
        const cycle = Math.floor(t / PERIOD + seed);
        const h = hash2(b.id, cycle, 53), g = hash2(b.id, cycle, 59);
        out.push({ ...pose(walker, door, [door[0] + (h - 0.5) * 6, door[1] + (g - 0.5) * 6], t, seed), owner });
      }
    }
    return out;
  }
}
