import test from "node:test";
import assert from "node:assert/strict";
import { playerColour, PICKED, MAX_NATION_ID } from "../src/colours.js";

function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test("the first eight players keep the hand-picked colours", () => {
  for (let k = 0; k < PICKED.length; k++) assert.equal(playerColour(k), PICKED[k]);
});

test("colours past eight are valid, distinct and stay off grass and sea", () => {
  const seen = new Set();
  for (let k = 0; k < 200; k++) {
    const c = playerColour(k);
    assert.match(c, /^#[0-9a-f]{6}$/);
    seen.add(c);
    if (k < PICKED.length) continue;
    const h = hueOf(c);
    assert.ok(h !== null && !(h > 82 && h < 158) && !(h > 182 && h < 248), `player ${k} ${c} hue ${h}`);
  }
  assert.equal(seen.size, 200);
});

test("very high player numbers still give a colour", () => {
  assert.match(playerColour(MAX_NATION_ID), /^#[0-9a-f]{6}$/);
});
