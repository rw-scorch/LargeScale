import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const src = "public/map/terrain.bin", out = "public/map/terrain.bin.gz";
if (!existsSync(src)) {
  console.warn(`build: ${src} is missing, so only test maps will work`);
} else if (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs) {
  writeFileSync(out, gzipSync(readFileSync(src), { level: 9 }));
  console.log(`build: wrote ${out}, ${statSync(out).size} bytes`);
}

mkdirSync("public/js/shared", { recursive: true });
const files = readdirSync("src/shared").filter(f => f.endsWith(".js") && !f.endsWith(".test.js"));
for (const f of files) copyFileSync(`src/shared/${f}`, `public/js/shared/${f}`);
console.log(`build: copied ${files.length} shared modules to public/js/shared`);
