import rules from "../data/rules.json" with { type: "json" };
import { CROPS } from "./shared/maps.js";
import { RULES } from "./sim/territory.js";
import { COMBAT } from "./sim/combat.js";

const R = rules.world, D = rules.detail;
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
  const detail = c.detail ?? (map.kind === "crop" ? "fine" : "normal");
  if (detail !== "fine" && detail !== "normal") return { error: "detail must be fine or normal" };
  if (detail === "fine" && map.kind !== "crop") return { error: "fine detail is for region maps; the whole Earth uses normal detail" };
  if (detail === "fine") map.dir = D.fineDir;
  const bots = c.bots ?? null, most = maxBotsFor(detail);
  if (bots !== null && (!isInt(bots) || bots < 0 || bots > most)) return { error: `bots must be a whole number from 0 to ${most}` };
  return { map, bots };
}

export function maxBotsFor(detail) {
  return detail === "fine" ? Math.floor(R.maxBots / (D.fineScale * D.fineScale)) : R.maxBots;
}

export function defaultBots(landPlots, scale = 1) {
  return Math.min(Math.floor(R.maxBots / (scale * scale)), Math.round((R.botsPerMillionLand * landPlots) / (scale * scale) / 1e6));
}

export function scaledRules(scale = 1) {
  const out = { territory: { ...RULES, ...rules.territory }, combat: { ...COMBAT, ...rules.combat } };
  for (const [group, keys] of Object.entries(D.lengthRules)) for (const k of keys) out[group][k] *= scale;
  for (const [group, keys] of Object.entries(D.areaRules)) for (const k of keys) out[group][k] *= scale * scale;
  return out;
}

export const MAX_PLOTS = R.maxPlots;
export const BASE_WIDTH = R.baseWidth;

export const MIN_MAP_SIDE = R.minMapSide;
