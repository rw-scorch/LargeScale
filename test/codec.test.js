import test from "node:test";
import assert from "node:assert/strict";
import { encodeRuns, decodeRuns, countRuns, splitParts, joinParts, gzip, gunzip, hashBytes, hashRuns } from "../src/shared/codec.js";
import { makeRng } from "../src/shared/rng.js";

function blocky(size, runs, rng) {
  const a = new Uint16Array(size);
  let i = 0;
  while (i < size) {
    const len = rng.int(1, Math.max(1, (size / runs) * 2)), v = rng.int(0, 65535);
    a.fill(v, i, Math.min(size, i + len));
    i += len;
  }
  return a;
}

test("run-length encoding round-trips, including long runs and large values", () => {
  const rng = makeRng(3);
  for (const [size, runs] of [[1, 1], [10, 10], [5000, 40], [5_184_000, 6000]]) {
    const a = blocky(size, runs, rng);
    const bytes = encodeRuns(a);
    const back = decodeRuns(bytes, new Uint16Array(size));
    assert.deepEqual(back, a);
    assert.ok(bytes.length <= countRuns(a) * 7);
  }
  const edge = new Uint16Array([65535, 65535, 0, 127, 128, 16383, 16384]);
  assert.deepEqual(decodeRuns(encodeRuns(edge), new Uint16Array(edge.length)), edge);
});

test("decoding refuses runs that do not fit the layer", () => {
  const bytes = encodeRuns(new Uint16Array(100).fill(7));
  assert.throws(() => decodeRuns(bytes, new Uint16Array(99)), /overflow/);
  assert.throws(() => decodeRuns(bytes, new Uint16Array(101)), /cover 100 of 101/);
  assert.throws(() => decodeRuns(bytes.subarray(0, bytes.length - 1), new Uint16Array(100)), /truncated/);
});

test("parts split and join back to the same bytes", () => {
  const b = new Uint8Array(2_500_001).map((_, i) => i * 31);
  const parts = splitParts(b, 1_000_000);
  assert.equal(parts.length, 3);
  assert.ok(parts.every(p => p.length <= 1_000_000));
  assert.deepEqual(joinParts(parts), b);
  assert.equal(splitParts(new Uint8Array(0), 10).length, 1);
});

test("gzip round-trips and the hash changes with one plot", async () => {
  const t = new Uint8Array(200_000).map((_, i) => (i >> 9) % 40);
  assert.deepEqual(await gunzip(await gzip(t)), t);
  const o = new Uint16Array(1000).fill(3);
  const h = hashRuns(o);
  assert.equal(h, hashBytes(encodeRuns(o)));
  o[500] = 4;
  assert.notEqual(hashRuns(o), h);
});
