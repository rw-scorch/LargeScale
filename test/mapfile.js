import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export const hasMap = (dir = "public/map") => existsSync(`${dir}/meta.json`) && (existsSync(`${dir}/terrain.bin`) || existsSync(`${dir}/terrain.bin.gz`));

export function readMap(dir = "public/map") {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8"));
  const raw = existsSync(`${dir}/terrain.bin`) ? readFileSync(`${dir}/terrain.bin`) : gunzipSync(readFileSync(`${dir}/terrain.bin.gz`));
  return { meta, terrain: new Uint8Array(raw) };
}
