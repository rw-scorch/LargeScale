import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, SECTIONS, varsOf, sectionVars, alpha, shade, colourOf, applyTheme } from "../public/js/ui/theme.js";

test("every theme sets every colour, and a section's own colours override only that section", () => {
  const keys = Object.keys(THEMES.harbour);
  for (const [id, t] of Object.entries(THEMES)) {
    assert.deepEqual(Object.keys(t), keys, `${id} has every colour`);
    for (const k of keys) if (k !== "name") assert.match(t[k], /^#[0-9a-f]{6}$/i, `${id}.${k}`);
  }
  assert.equal(varsOf(THEMES.harbour, 0.84)["--panel"], "rgba(13,29,44,0.84)", "the default panel colour is what it was");
  assert.equal(alpha("#ff8000", 0.5), "rgba(255,128,0,0.5)");
  assert.equal(shade("#808080", -0.5), "#404040");
  assert.equal(shade("#000000", 0.5), "#808080");
  assert.deepEqual(sectionVars({}, 0.9), {}, "nothing picked, nothing changed");
  assert.deepEqual(Object.keys(sectionVars({ bg: "#112233", text: "#ffffff", accent: "#ff0000", btn: "#333333" }, 0.9)).sort(), ["--btn", "--edge", "--field", "--ink", "--line", "--mute", "--panel", "--parch", "--signal"]);
  assert.deepEqual(sectionVars({ bg: "red", text: "javascript:x" }, 0.9), {}, "only real colours are used");
  const t = { preset: "forest", opacity: 0.9, sections: { feed: { accent: "#123456" } } };
  assert.equal(colourOf(t, "feed", "accent"), "#123456");
  assert.equal(colourOf(t, "feed", "bg"), THEMES.forest.panel, "the rest comes from the theme");
  assert.ok(SECTIONS.length >= 8 && new Set(SECTIONS.map(s => s.id)).size === SECTIONS.length);
});

test("applying a theme sets the page colours and each section's own", () => {
  const style = () => { const m = new Map(); return { m, setProperty: (k, v) => m.set(k, v), removeProperty: k => m.delete(k) }; };
  const root = style(), feed = style(), nations = style();
  const doc = { documentElement: { style: root }, querySelector: () => null, querySelectorAll: sel => sel === "#feed" ? [{ style: feed }] : sel === "#nations" ? [{ style: nations }] : [] };
  nations.setProperty("--signal", "#000000");
  applyTheme({ preset: "iron", opacity: 0.8, sections: { feed: { bg: "#102030" } } }, doc);
  assert.equal(root.m.get("--signal"), THEMES.iron.accent);
  assert.equal(root.m.get("--panel"), alpha(THEMES.iron.panel, 0.8));
  assert.equal(feed.m.get("--panel"), "rgba(16,32,48,0.8)");
  assert.equal(nations.m.has("--signal"), false, "a section reset loses its old colour");
});
