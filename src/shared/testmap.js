import { TID } from "./terrain.js";
import { hash2 } from "./rng.js";

function valueNoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export function elevationAt(x, y, w, h, seed) {
  let e = valueNoise(x, y, w / 6, seed) * 0.55 + valueNoise(x, y, w / 15, seed + 1) * 0.3 + valueNoise(x, y, w / 40, seed + 2) * 0.15;
  const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2);
  return e - Math.sqrt(dx * dx + dy * dy) * 0.45 + 0.12;
}

export function makeTestMap(w, h, seed = 5) {
  const terrain = new Uint8Array(w * h);
  const elevation = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = y / h;
    for (let x = 0; x < w; x++) {
      const e = elevationAt(x, y, w, h, seed);
      const m = valueNoise(x, y, w / 8, seed + 7);
      let t;
      if (e < 0.18) t = "deep_ocean";
      else if (e < 0.26) t = "ocean";
      else if (e < 0.3) t = "shallows";
      else if (e < 0.315) t = "beach";
      else if (e > 0.62) t = "snow_peak";
      else if (e > 0.56) t = "high_mountain";
      else if (e > 0.5) t = "mountain";
      else if (e > 0.45) t = "hills";
      else if (lat < 0.12) t = "tundra";
      else if (m < 0.3) t = lat > 0.55 ? "desert" : "steppe";
      else if (m < 0.42) t = lat > 0.55 ? "savanna" : "plains";
      else if (m < 0.55) t = "grassland";
      else if (m < 0.68) t = lat < 0.6 ? "forest" : "jungle";
      else if (m < 0.75) t = "pine_forest";
      else t = "swamp";
      terrain[y * w + x] = TID[t];
      elevation[y * w + x] = e;
    }
  }
  return { w, h, terrain, elevation, seed };
}
