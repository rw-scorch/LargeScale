import test from "node:test";
import assert from "node:assert/strict";
import { placeLabels } from "../public/js/render/labels.js";

const map = (w, h, paint) => {
  const owner = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) owner[y * w + x] = paint(x, y);
  return { w, h, owner };
};

test("a nation's name goes where its land is widest", () => {
  const s = map(100, 60, (x, y) => (x >= 10 && x < 50 && y >= 10 && y < 50 ? 1 : x >= 60 && x < 64 && y < 60 ? 2 : x >= 64 && x < 94 && y >= 20 && y < 40 ? 2 : 0));
  const byId = Object.fromEntries(placeLabels(s).map(l => [l.id, l]));
  assert.ok(Math.abs(byId[1].x - 30) <= 1 && Math.abs(byId[1].y - 30) <= 1, `square centre, got ${byId[1].x}, ${byId[1].y}`);
  assert.equal(byId[1].r, 20);
  assert.ok(byId[2].x > 70 && Math.abs(byId[2].y - 30) <= 1, `the wide block, not the thin strip: ${byId[2].x}, ${byId[2].y}`);
  assert.equal(byId[2].r, 10);
});

test("big maps are sampled coarsely and still land inside the territory", () => {
  const s = map(3600, 1440, (x, y) => (x >= 1000 && x < 1400 && y >= 300 && y < 700 ? 7 : 0));
  const t = performance.now();
  const [l] = placeLabels(s);
  const ms = performance.now() - t;
  assert.equal(l.id, 7);
  assert.ok(l.x > 1150 && l.x < 1250 && l.y > 450 && l.y < 550, `${l.x}, ${l.y}`);
  assert.ok(l.r > 180 && l.r <= 205, `radius ${l.r}`);
  assert.ok(ms < 100, `placing took ${ms.toFixed(1)} ms`);
});
