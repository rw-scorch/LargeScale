import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTree, available, setResearch, researchTick, canResearch, unlockedBuildings } from "./techtree.js";

const tree = JSON.parse(readFileSync(new URL("./techtree.sample.json", import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL("../../../assets/manifest.json", import.meta.url)));
const spriteIds = new Set(manifest.sprites.map(s => s.family));
for (const s of manifest.sprites) if (s.tags?.includes("autotile")) spriteIds.add(s.group);
["crop_wheat", "crop_rice"].forEach(v => spriteIds.add(v));

const nation = () => ({ era: "T", known: new Set(), effects: {}, pop: 0 });

test("sample tree is valid and every unlock has a sprite", () => {
  assert.deepEqual(validateTree(tree, spriteIds), []);
});

test("validator catches cycles and missing links", () => {
  const bad = structuredClone(tree);
  bad.nodes.find(n => n.id === "stone_tools").requires = ["palisades"];
  bad.nodes.push({ id: "x", branch: "civic", era: "T", cost: 1, requires: ["nope"] });
  const errs = validateTree(bad);
  assert.ok(errs.some(e => e.startsWith("cycle")));
  assert.ok(errs.some(e => e.includes("missing requirement nope")));
});

test("era node waits for enough upgrades across branches", () => {
  const n = nation();
  for (const id of ["farming", "chieftains", "foraging", "stone_tools", "barter"]) n.known.add(id);
  assert.match(canResearch(tree, n, "age_medieval"), /needs 8 T upgrades/);
  for (const id of ["fire_keeping", "clubs", "palisades"]) n.known.add(id);
  assert.equal(canResearch(tree, n, "age_medieval"), null);
});

test("research spends points, carries overflow and advances the era", () => {
  const n = nation();
  for (const id of ["farming", "chieftains", "foraging", "stone_tools", "barter", "fire_keeping", "clubs", "palisades"]) n.known.add(id);
  assert.equal(setResearch(tree, n, "age_medieval"), null);
  let done = null;
  for (let i = 0; i < 30 && !done; i++) done = researchTick(tree, n, 30);
  assert.equal(done.id, "age_medieval");
  assert.equal(n.era, "M");
  assert.equal(n.researchBank, 20);
  assert.ok(available(tree, n.known, n.era).some(v => v.id === "masonry"));
});

test("medieval nodes are hidden in the tribal era", () => {
  const n = nation();
  assert.ok(available(tree, n.known, "T").every(v => v.era === "T"));
  assert.equal(canResearch(tree, n, "masonry"), "era locked");
  n.known.add("fire_keeping");
  assert.ok(unlockedBuildings(tree, n.known).has("hut_grass"));
});
