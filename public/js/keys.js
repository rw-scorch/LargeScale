export const ACTIONS = {
  form: { key: "f", label: "Form a stack where the pointer is" },
  advance: { key: "a", label: "Advance" },
  claim: { key: "c", label: "Advance into unclaimed land only" },
  target: { key: "n", label: "Advance into one nation's land: click it next" },
  move: { key: "m", label: "Move: pick a destination" },
  split: { key: "s", label: "Split half" },
  merge: { key: "g", label: "Merge nearby stacks" },
  disband: { key: "x", label: "Disband, or demolish the selected building" },
  build: { key: "b", label: "Open the build menu" },
  town: { key: "t", label: "Town: population, jobs, food and demand" },
  deposits: { key: "r", label: "Show deposits on the map" },
  research: { key: "u", label: "Research: the upgrade tree" },
  admin: { key: "`", label: "Admin panel (host only)" },
  next: { key: "Tab", label: "Select your next stack" },
  home: { key: "h", label: "Go to your capital" },
  cancel: { key: "Escape", label: "Cancel" },
  zoomIn: { key: "=", label: "Zoom in" },
  zoomOut: { key: "-", label: "Zoom out" },
};

const ALIASES = { "+": "=", "_": "-" };

export function keyMap(overrides = {}) {
  const map = new Map();
  for (const [action, a] of Object.entries(ACTIONS)) map.set((overrides[action] ?? a.key).toLowerCase(), action);
  return map;
}

export function actionFor(map, e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  return map.get(ALIASES[k] ?? k) ?? null;
}

export const keyOf = action => {
  const k = ACTIONS[action]?.key ?? "";
  return k.length === 1 ? k.toUpperCase() : k === "Escape" ? "Esc" : k;
};
