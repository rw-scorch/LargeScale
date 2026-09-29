const STORE = "ls_theme";

export const THEMES = {
  harbour: { name: "Harbour", ink: "#0f2233", deep: "#10233a", line: "#24506f", text: "#e9dcb8", mute: "#9fb3c2", accent: "#e8c84a", panel: "#0d1d2c", edge: "#467da5", btn: "#183a54", field: "#16324a", primary: "#2a5a36", primaryEdge: "#3f7f4c", on: "#3a3a1c" },
  parchment: { name: "Parchment", ink: "#efe3c8", deep: "#d8c7a2", line: "#b59b72", text: "#2b2116", mute: "#6b5a45", accent: "#8a4b12", panel: "#eee0c2", edge: "#9c8055", btn: "#dcc9a1", field: "#e8d9b6", primary: "#7f9d5c", primaryEdge: "#5b7a3c", on: "#e7c77a" },
  iron: { name: "Iron", ink: "#1f2226", deep: "#16181b", line: "#4a4f55", text: "#e6e6e6", mute: "#a0a4a8", accent: "#ff9a3c", panel: "#1c1e21", edge: "#5a6068", btn: "#34383d", field: "#2a2d31", primary: "#8a4a1c", primaryEdge: "#c2702f", on: "#4a3522" },
  forest: { name: "Forest", ink: "#14301e", deep: "#0f2417", line: "#2f5a3a", text: "#e8e2c8", mute: "#a8b89c", accent: "#e8c84a", panel: "#12281a", edge: "#3f7a4c", btn: "#24472f", field: "#1d3a27", primary: "#3f6e2a", primaryEdge: "#6a9a45", on: "#3e4a1c" },
  crimson: { name: "Crimson", ink: "#2a0f11", deep: "#1e0a0c", line: "#6a2a2a", text: "#f0dcd0", mute: "#c09a90", accent: "#ffcf6a", panel: "#280e10", edge: "#8a3a3a", btn: "#5a2024", field: "#481a1d", primary: "#7a3a1a", primaryEdge: "#b86030", on: "#5a3a18" },
  ocean: { name: "Ocean", ink: "#06293d", deep: "#041f2e", line: "#1f6f8f", text: "#dff4ff", mute: "#9cc8dc", accent: "#5ce1e6", panel: "#082c42", edge: "#2f8fb0", btn: "#0f4f6f", field: "#0c3f59", primary: "#136b6b", primaryEdge: "#2aa3a3", on: "#15505a" },
  contrast: { name: "High contrast", ink: "#000000", deep: "#000000", line: "#ffffff", text: "#ffffff", mute: "#d8d8d8", accent: "#ffe000", panel: "#000000", edge: "#ffffff", btn: "#000000", field: "#101010", primary: "#004a1a", primaryEdge: "#00d84a", on: "#4a4000" },
};

export const SECTIONS = [
  { id: "nations", name: "Leaderboard", sel: "#nations" },
  { id: "status", name: "Status line", sel: "#status-pill" },
  { id: "corner", name: "Corner buttons", sel: "#corner" },
  { id: "control", name: "Your nation", sel: "#control" },
  { id: "actions", name: "Action bar", sel: "#action-bar" },
  { id: "feed", name: "Events and chat", sel: "#feed" },
  { id: "cards", name: "Cards on the right", sel: "#side" },
  { id: "menus", name: "Big panels (research, army, settings)", sel: "#overlay > .panel.center" },
  { id: "ring", name: "Orders ring", sel: "#ring" },
  { id: "screens", name: "Menu and world list", sel: "#screen" },
];

export const PARTS = [["bg", "Background"], ["text", "Text"], ["accent", "Accent"], ["btn", "Buttons"]];

export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (t && typeof t === "object") return { preset: THEMES[t.preset] ? t.preset : "harbour", opacity: Number.isFinite(t.opacity) ? Math.min(1, Math.max(0.5, t.opacity)) : 0.86, sections: t.sections && typeof t.sections === "object" ? t.sections : {} };
  } catch {}
  return { preset: "harbour", opacity: 0.86, sections: {} };
}

export function saveTheme(t) {
  try { localStorage.setItem(STORE, JSON.stringify(t)); } catch {}
}

const HEX = /^#[0-9a-f]{6}$/i;

export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, "0")).join("")}`;
}

export function varsOf(base, opacity) {
  return {
    "--ink": base.ink, "--deep": base.deep, "--line": base.line, "--parch": base.text, "--mute": base.mute, "--signal": base.accent,
    "--panel": alpha(base.panel, opacity), "--edge": alpha(base.edge, 0.55), "--btn": base.btn, "--field": base.field,
    "--primary": base.primary, "--primary-edge": base.primaryEdge, "--on-bg": base.on,
  };
}

export function sectionVars(over, opacity) {
  const out = {};
  if (HEX.test(over.bg ?? "")) { out["--panel"] = alpha(over.bg, opacity); out["--ink"] = over.bg; }
  if (HEX.test(over.text ?? "")) { out["--parch"] = over.text; out["--mute"] = `color-mix(in srgb, ${over.text} 68%, transparent)`; }
  if (HEX.test(over.accent ?? "")) { out["--signal"] = over.accent; out["--edge"] = alpha(over.accent, 0.5); }
  if (HEX.test(over.btn ?? "")) { out["--btn"] = over.btn; out["--field"] = shade(over.btn, -0.12); out["--line"] = shade(over.btn, 0.25); }
  return out;
}

export function colourOf(t, section, part) {
  const over = t.sections[section]?.[part];
  if (HEX.test(over ?? "")) return over;
  const base = THEMES[t.preset] ?? THEMES.harbour;
  return { bg: base.panel, text: base.text, accent: base.accent, btn: base.btn }[part];
}

export function applyTheme(t = loadTheme(), doc = document) {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
  const opacity = coarse ? Math.max(t.opacity, 0.93) : t.opacity, base = THEMES[t.preset] ?? THEMES.harbour;
  const root = doc.documentElement;
  for (const [k, v] of Object.entries(varsOf(base, opacity))) root.style.setProperty(k, v);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", base.ink);
  const keys = ["--panel", "--ink", "--parch", "--mute", "--signal", "--edge", "--btn", "--field", "--line"];
  for (const s of SECTIONS) {
    const vars = sectionVars(t.sections[s.id] ?? {}, opacity);
    for (const node of doc.querySelectorAll(s.sel)) for (const k of keys) {
      if (vars[k]) node.style.setProperty(k, vars[k]);
      else node.style.removeProperty(k);
    }
  }
}
