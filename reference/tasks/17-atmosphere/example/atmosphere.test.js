import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorldClock, seasonAt, daylight, nightTint, blendPalettes, nextWeather, WeatherGrid, weatherOdds, WEATHER } from "./atmosphere.js";
import { makeRng } from "../../../shared/rng.js";

const H = 3600 * 1000;

test("clock turns real time into days and seasons", () => {
  const c = new WorldClock({ startMs: 0, dayLengthMinutes: 60, daysPerSeason: 6 });
  assert.equal(c.day(5.5 * H), 5);
  assert.equal(c.seasonIndex(5.5 * H), 0);
  assert.equal(c.seasonIndex(6.5 * H), 1);
  assert.equal(c.seasonIndex(24.5 * H), 0);
  const fast = new WorldClock({ startMs: 0, speed: 2 });
  assert.equal(fast.day(3 * H), 6);
});

test("the south and the tropics get their own seasons", () => {
  const c = new WorldClock({ startMs: 0 });
  const t = 7 * H;
  assert.equal(seasonAt(c, t, 45).season, "summer");
  assert.equal(seasonAt(c, t, -45).season, "winter");
  assert.ok(["summer", "dry"].includes(seasonAt(c, t, 5).season));
});

test("daylight curve and night tint", () => {
  assert.equal(daylight(0), 0);
  assert.equal(daylight(0.5), 1);
  assert.ok(daylight(0.25) > 0 && daylight(0.25) < 1);
  assert.equal(nightTint(0.5), 0);
  assert.ok(Math.abs(nightTint(0) - 0.62) < 1e-9);
});

test("palettes blend only near the end of a season", () => {
  const pal = JSON.parse(readFileSync(new URL("../../../assets/terrain/palettes.json", import.meta.url))).seasons;
  const early = blendPalettes(pal, "autumn", "winter", 0.3);
  assert.deepEqual(early.forest, pal.autumn.forest);
  const late = blendPalettes(pal, "autumn", "winter", 0.999);
  assert.ok(late.forest.every((c, i) => Math.abs(parseInt(c.slice(1, 3), 16) - parseInt(pal.winter.forest[i].slice(1, 3), 16)) <= 1));
});

test("weather stays within each climate's options", () => {
  const rng = makeRng(9);
  let w = "clear";
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { w = nextWeather(w, "desert", "winter", rng); seen.add(w); }
  assert.ok(!seen.has("snow"));
  assert.ok(seen.has("sandstorm"));
  const g = new WeatherGrid(128, 64, 32, (x, y) => (y < 32 ? "cold" : "temperate"));
  for (let i = 0; i < 50; i++) g.update(() => "winter", rng);
  assert.ok(g.state.every(s => s in WEATHER));
  assert.ok(Object.keys(weatherOdds("cold", "winter")).includes("blizzard"));
  assert.equal(typeof g.at(100, 50).move, "number");
});
