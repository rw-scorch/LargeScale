import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

function duplicateKeys(text) {
  const found = [];
  let i = 0;
  const ws = () => { while (/\s/.test(text[i])) i++; };
  const str = () => {
    let s = "";
    i++;
    while (text[i] !== '"') { if (text[i] === "\\") { s += text[i] + text[i + 1]; i += 2; } else s += text[i++]; }
    i++;
    return s;
  };
  const value = path => {
    ws();
    if (text[i] === "{") {
      i++;
      const keys = new Set();
      ws();
      if (text[i] === "}") { i++; return; }
      for (;;) {
        ws();
        const k = str();
        if (keys.has(k)) found.push(`${path}.${k}`);
        keys.add(k);
        ws();
        i++;
        value(`${path}.${k}`);
        ws();
        if (text[i++] === "}") return;
      }
    }
    if (text[i] === "[") {
      i++;
      ws();
      if (text[i] === "]") { i++; return; }
      for (let k = 0; ; k++) {
        value(`${path}[${k}]`);
        ws();
        if (text[i++] === "]") return;
      }
    }
    if (text[i] === '"') return void str();
    while (i < text.length && !/[,}\]\s]/.test(text[i])) i++;
  };
  value("");
  return found;
}

test("no data file repeats a key, which JSON would silently drop", () => {
  assert.deepEqual(duplicateKeys('{"a":1,"b":{"c":2,"c":3},"d":[{"e":1,"e":2}],"a":4}'), [".b.c", ".d[0].e", ".a"], "the checker finds repeats at any depth");
  const dir = new URL("../data/", import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  assert.ok(files.length >= 5);
  for (const f of files) assert.deepEqual(duplicateKeys(readFileSync(new URL(f, dir), "utf8")), [], f);
});
