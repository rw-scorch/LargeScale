export const SEASONS = ["spring", "summer", "autumn", "winter"];

export class WorldClock {
  constructor({ startMs, speed = 1, dayLengthMinutes = 60, daysPerSeason = 6 }) {
    Object.assign(this, { startMs, speed, dayLengthMinutes, daysPerSeason });
  }
  seconds(nowMs) { return Math.max(0, (nowMs - this.startMs) / 1000) * this.speed; }
  dayLength() { return this.dayLengthMinutes * 60; }
  day(nowMs) { return Math.floor(this.seconds(nowMs) / this.dayLength()); }
  dayFraction(nowMs) { return (this.seconds(nowMs) / this.dayLength()) % 1; }
  seasonIndex(nowMs) { return Math.floor(this.day(nowMs) / this.daysPerSeason) % 4; }
  seasonProgress(nowMs) {
    const d = this.seconds(nowMs) / this.dayLength();
    return (d / this.daysPerSeason) % 1;
  }
}

export function seasonAt(clock, nowMs, latitude) {
  if (Math.abs(latitude) < 23.5) {
    const i = clock.seasonIndex(nowMs);
    return { season: i === 1 || i === 2 ? "dry" : "summer", next: i === 0 || i === 1 ? "dry" : "summer", t: clock.seasonProgress(nowMs) };
  }
  let i = clock.seasonIndex(nowMs);
  if (latitude < 0) i = (i + 2) % 4;
  return { season: SEASONS[i], next: SEASONS[(i + 1) % 4], t: clock.seasonProgress(nowMs) };
}

export function paletteBlendAmount(t, start = 0.75) { return t < start ? 0 : (t - start) / (1 - start); }

export function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export function blendPalettes(palettes, season, next, t) {
  const k = paletteBlendAmount(t), out = {};
  for (const [name, shades] of Object.entries(palettes[season])) out[name] = shades.map((c, i) => mixHex(c, palettes[next][name][i], k));
  return out;
}

export function daylight(f) {
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const s = x => x * x * (3 - 2 * x);
  if (f < 0.5) return s(ramp(f, 0.2, 0.3));
  return 1 - s(ramp(f, 0.72, 0.82));
}

export function nightTint(f, max = 0.62) { return max * (1 - daylight(f)); }

export const WEATHER = {
  clear: { move: 1, farm: 1, air: true, vision: 1, sprite: null },
  cloudy: { move: 1, farm: 0.95, air: true, vision: 0.9, sprite: "cloud_shadow" },
  rain: { move: 1.25, farm: 1.1, air: true, vision: 0.8, sprite: "weather_rain_0" },
  storm: { move: 1.6, farm: 0.9, air: false, vision: 0.5, sprite: "weather_rain_0", lightning: true },
  snow: { move: 1.7, farm: 0.5, air: true, vision: 0.7, sprite: "weather_snow_0" },
  blizzard: { move: 2.5, farm: 0.3, air: false, vision: 0.4, sprite: "weather_snow_0" },
  fog: { move: 1.1, farm: 1, air: false, vision: 0.4, sprite: "weather_fog" },
  sandstorm: { move: 2, farm: 0.6, air: false, vision: 0.3, sprite: "weather_sandstorm" },
};

const M = (o) => o;
export const CLIMATE_WEATHER = {
  temperate: {
    spring: M({ clear: 0.45, cloudy: 0.25, rain: 0.22, storm: 0.04, fog: 0.04 }),
    summer: M({ clear: 0.6, cloudy: 0.2, rain: 0.12, storm: 0.08 }),
    autumn: M({ clear: 0.35, cloudy: 0.3, rain: 0.25, storm: 0.04, fog: 0.06 }),
    winter: M({ clear: 0.35, cloudy: 0.3, snow: 0.25, blizzard: 0.04, fog: 0.06 }),
  },
  desert: { any: M({ clear: 0.8, cloudy: 0.08, sandstorm: 0.12 }) },
  cold: {
    summer: M({ clear: 0.45, cloudy: 0.35, rain: 0.15, fog: 0.05 }),
    any: M({ clear: 0.3, cloudy: 0.3, snow: 0.3, blizzard: 0.1 }),
  },
  tropical: {
    summer: M({ clear: 0.35, cloudy: 0.2, rain: 0.3, storm: 0.15 }),
    dry: M({ clear: 0.75, cloudy: 0.2, rain: 0.05 }),
    any: M({ clear: 0.5, cloudy: 0.25, rain: 0.2, storm: 0.05 }),
  },
};

export function weatherOdds(climate, season) {
  const c = CLIMATE_WEATHER[climate];
  return c[season] ?? c.any;
}

export function nextWeather(current, climate, season, rng, stay = 0.6) {
  const odds = weatherOdds(climate, season);
  if (odds[current] && rng.chance(stay)) return current;
  let r = rng.next(), acc = 0;
  for (const [k, p] of Object.entries(odds)) { acc += p; if (r < acc) return k; }
  return "clear";
}

export class WeatherGrid {
  constructor(w, h, cell, climateAt) {
    this.cell = cell;
    this.cw = Math.ceil(w / cell);
    this.ch = Math.ceil(h / cell);
    this.state = new Array(this.cw * this.ch).fill("clear");
    this.climate = [];
    for (let y = 0; y < this.ch; y++) for (let x = 0; x < this.cw; x++) this.climate.push(climateAt(x * cell + cell / 2, y * cell + cell / 2));
  }
  update(seasonForCell, rng) {
    for (let i = 0; i < this.state.length; i++) this.state[i] = nextWeather(this.state[i], this.climate[i], seasonForCell(i), rng);
  }
  at(x, y) { return WEATHER[this.state[Math.floor(y / this.cell) * this.cw + Math.floor(x / this.cell)]]; }
}
