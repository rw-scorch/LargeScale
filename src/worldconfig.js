import rules from "../data/rules.json" with { type: "json" };
import { CROPS } from "./shared/maps.js";

const R = rules.world;
const isInt = v => Number.isInteger(v);

export function parseWorldConfig(c = {}) {
  const m = c.map ?? "test";
  let map;
  if (m === "test") {
    const w = c.w ?? 320, h = c.h ?? 200, seed = c.seed ?? 5;
    if (![w, h, seed].every(isInt) || w < R.minMapSide || h < R.minMapSide || w > R.maxTestSide || h > R.maxTestSide)
      return { error: `test map sides must be whole numbers from ${R.minMapSide} to ${R.maxTestSide}` };
    map = { kind: "test", w, h, seed };
  } else if (m === "earth") {
    map = { kind: "earth" };
  } else if (typeof m === "string" && Object.hasOwn(CROPS, m)) {
    map = { kind: "crop", name: m, box: { ...CROPS[m] } };
  } else if (m && typeof m === "object") {
    const { west, east, north, south } = m;
    const ok = [west, east, north, south].every(Number.isFinite) && west >= -180 && east <= 180 && west < east && south >= -90 && north <= 90 && south < north;
    if (!ok) return { error: "a crop needs west < east and south < north, in degrees" };
    map = { kind: "crop", name: "custom", box: { west, east, north, south } };
  } else {
    return { error: `unknown map, use test, earth, ${Object.keys(CROPS).join(", ")} or a box` };
  }
  const bots = c.bots ?? null;
  if (bots !== null && (!isInt(bots) || bots < 0 || bots > R.maxBots)) return { error: `bots must be a whole number from 0 to ${R.maxBots}` };
  return { map, bots };
}

export function defaultBots(landPlots) {
  return Math.min(R.maxBots, Math.round((R.botsPerMillionLand * landPlots) / 1e6));
}

export const MIN_MAP_SIDE = R.minMapSide;
