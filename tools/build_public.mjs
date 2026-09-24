import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const src = "public/map/terrain.bin", out = "public/map/terrain.bin.gz";
if (existsSync(src) && !(existsSync(out) && gunzipSync(readFileSync(out)).equals(readFileSync(src)))) {
  writeFileSync(out, gzipSync(readFileSync(src), { level: 9 }));
  console.log(`build: wrote ${out} from ${src}, ${statSync(out).size} bytes`);
}
for (const f of [out, "public/map/fine/terrain.bin.gz"]) if (!existsSync(f)) console.warn(`build: ${f} is missing, so maps that use it will not load`);

mkdirSync("public/js/shared", { recursive: true });
const files = readdirSync("src/shared").filter(f => f.endsWith(".js") && !f.endsWith(".test.js"));
for (const f of files) copyFileSync(`src/shared/${f}`, `public/js/shared/${f}`);
console.log(`build: copied ${files.length} shared modules to public/js/shared`);
