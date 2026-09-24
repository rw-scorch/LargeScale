import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

mkdirSync("public/map/fine", { recursive: true });
writeFileSync("public/map/fine/terrain.bin.gz", gzipSync(readFileSync("data/map/fine/terrain.bin"), { level: 9 }));
copyFileSync("data/map/fine/meta.json", "public/map/fine/meta.json");
console.log(`pack: wrote public/map/fine/terrain.bin.gz, ${statSync("public/map/fine/terrain.bin.gz").size} bytes`);
