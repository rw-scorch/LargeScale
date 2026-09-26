export const ACTIONS = {
  form: { key: "f", label: "Form a stack where the pointer is" },
  advance: { key: "a", label: "Advance" },
  claim: { key: "c", label: "Advance into unclaimed land only" },
  target: { key: "n", label: "Advance into one nation's land: click it next" },
  move: { key: "m", label: "Move: pick a destination" },
  draw: { key: "d", label: "Draw a path: drag along the way the stack should go" },
  split: { key: "s", label: "Split half" },
  merge: { key: "g", label: "Merge nearby stacks" },
  disband: { key: "x", label: "Disband, or demolish the selected building" },
  build: { key: "b", label: "Open the build menu" },
  town: { key: "t", label: "Town: population, jobs, food and demand" },
  deposits: { key: "r", label: "Show deposits on the map" },
  research: { key: "u", label: "Research: the upgrade tree" },
  upgrade: { key: "y", label: "Upgrade buildings in bulk" },
  army: { key: "k", label: "Army: train soldiers and see your reserve" },
  admin: { key: "`", label: "Admin panel (host only)" },
  next: { key: "Tab", label: "Select your next stack" },
  home: { key: "h", label: "Go to your capital" },
  cancel: { key: "Escape", label: "Cancel" },
  zoomIn: { key: "=", label: "Zoom in" },
  zoomOut: { key: "-", label: "Zoom out" },
};

const ALIASES = { "+": "=", "_": "-" };
export const FIXED = new Set(["cancel"]);
let bound = {};

export function loadKeys() {
  try { bound = JSON.parse(localStorage.getItem("ls_keys") ?? "{}") ?? {}; } catch { bound = {}; }
  for (const k of Object.keys(bound)) if (!ACTIONS[k] || FIXED.has(k)) delete bound[k];
  return bound;
}

export function saveKeys(next) {
  bound = next;
  try { localStorage.setItem("ls_keys", JSON.stringify(next)); } catch {}
  for (const tag of document.querySelectorAll("kbd[data-action]")) tag.textContent = keyOf(tag.dataset.action);
  return bound;
}

export const keyName = e => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

export function rebind(action, key) {
  const next = { ...bound }, lower = key.toLowerCase();
  const other = Object.keys(ACTIONS).find(a => a !== action && (next[a] ?? ACTIONS[a].key).toLowerCase() === lower);
  if (other && FIXED.has(other)) return null;
  if (other) next[other] = next[action] ?? ACTIONS[action].key;
  next[action] = key;
  for (const a of Object.keys(next)) if (next[a] === ACTIONS[a].key) delete next[a];
  return { keys: saveKeys(next), swapped: other ?? null };
}

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
  const k = bound[action] ?? ACTIONS[action]?.key ?? "";
  return k.length === 1 ? k.toUpperCase() : k === "Escape" ? "Esc" : k;
};
