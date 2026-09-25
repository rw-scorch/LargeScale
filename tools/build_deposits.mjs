import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { generateDeposits, DEPOSIT_IDS } from "../src/sim/resources.js";
import { encodeDeposits, decodeDeposits } from "../src/shared/deposits.js";
import { makeRng } from "../src/shared/rng.js";

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["public/map", "public/map/fine"];
for (const dir of dirs) {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8"));
  const terrain = gunzipSync(readFileSync(`${dir}/terrain.bin.gz`));
  if (terrain.length !== meta.w * meta.h) throw new Error(`${dir}: terrain does not match meta.json`);
  const t0 = Date.now();
  const dep = generateDeposits({ w: meta.w, h: meta.h, terrain }, makeRng(meta.w));
  const bytes = encodeDeposits(dep), gz = gzipSync(bytes, { level: 9 });
  const back = decodeDeposits(gunzipSync(gz));
  if (back.plots.length !== dep.plots.length || back.plots.some((p, k) => p !== dep.plots[k] || back.type[k] !== dep.type[k])) throw new Error(`${dir}: deposits do not round trip`);
  writeFileSync(`${dir}/deposits.bin.gz`, gz);
  const counts = {};
  for (const t of dep.type) counts[DEPOSIT_IDS[t - 1]] = (counts[DEPOSIT_IDS[t - 1]] ?? 0) + 1;
  console.log(`${dir}: ${dep.plots.length} deposit plots, ${bytes.length} bytes, ${gz.length} gzipped, ${Date.now() - t0} ms`);
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
