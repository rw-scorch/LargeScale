import { el } from "./dom.js";
import { ACTIONS, FIXED, keyOf, keyName, rebind, saveKeys, keyMap } from "../keys.js";

const PREFS = "ls_prefs";
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"]);

export const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) ?? "{}") ?? {}; } catch { return {}; } };
export const savePrefs = p => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch {} };

export function createSettings(root, game) {
  const prefs = game.prefs;
  let waiting = null, note = "";
  const toggles = [
    { id: "names", label: "Nation names and troops on the map", get: () => prefs.names !== false, set: v => { prefs.names = v; if (game.view) game.view.showNames = v; } },
    { id: "bots", label: "Bots on the leaderboard", get: () => !!prefs.bots, set: v => { prefs.bots = v; game.nations.bots = v; } },
    { id: "guide", label: "The guide for new players", get: () => game.guide.on, set: v => game.guide.show(v) },
  ];
  const boxes = el("div", { class: "settings-toggles" });
  const building = el("div", { class: "settings-toggles" });
  const access = el("div", { class: "settings-toggles" });
  const keys = el("div", { class: "key-grid" });
  const said = el("p", { id: "settings-note", class: "muted" });
  const panel = el("section", { id: "settings-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Settings" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleSettings(false) })),
    el("h2", { text: "Display" }), boxes,
    el("h2", { text: "Building" }), building,
    el("h2", { text: "Accessibility" }), access,
    el("div", { class: "row spread" }, el("h2", { text: "Keys" }), el("button", { id: "keys-reset", class: "chip", text: "Back to the usual keys", onclick: () => { game.keys = keyMap(saveKeys({})); note = "Every key is back to the usual one."; draw(); } })),
    el("p", { class: "muted", text: "Click a key, then press the new one. A key already in use swaps with it." }),
    said, keys);
  root.append(panel);

  const draw = () => {
    boxes.replaceChildren(...toggles.map(t => {
      const box = el("input", { type: "checkbox", id: `set-${t.id}`, checked: t.get(), onchange: () => { t.set(box.checked); savePrefs(prefs); } });
      return el("label", { class: "row" }, box, t.label);
    }));
    const place = el("select", { id: "set-place", onchange: () => game.setPref("place", place.value) },
      el("option", { value: "confirm", text: "Click a spot, then press Build here" }),
      el("option", { value: "click", text: "One click builds at once (the old way)" }));
    place.value = game.placeMode();
    const paint = el("input", { type: "checkbox", id: "set-paint", checked: !!prefs.paint, onchange: () => game.setPref("paint", paint.checked) });
    building.replaceChildren(
      el("label", { class: "row" }, "Placing a building:", place),
      el("label", { class: "row" }, paint, "Paint: drag to place a building on every free spot you pass. The same switch sits in the building bar."));
    const cross = el("input", { type: "checkbox", id: "set-crosshair", checked: !!prefs.crosshair, onchange: () => game.setPref("crosshair", cross.checked) });
    access.replaceChildren(el("label", { class: "row" }, cross, "Crosshair: act at the middle of the screen and aim by moving the view. Select and Orders buttons appear; on a keyboard the arrow keys move, Space selects and E opens the orders."));
    said.textContent = note;
    keys.replaceChildren(...Object.entries(ACTIONS).filter(([a]) => a !== "admin" || game.admin).map(([a, def]) => el("div", { class: "key-row" },
      el("span", { text: def.label }),
      el("button", { class: `chip${waiting === a ? " on" : ""}`, "data-bind": a, disabled: FIXED.has(a), text: waiting === a ? "Press a key" : keyOf(a), onclick: () => { waiting = waiting === a ? null : a; note = ""; draw(); } }))));
  };

  const onKey = e => {
    if (!waiting || panel.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (MODIFIERS.has(e.key)) return;
    const action = waiting;
    waiting = null;
    if (e.key === "Escape") { note = ""; return draw(); }
    const r = rebind(action, keyName(e));
    if (!r) note = `${keyOf("cancel")} stays as Cancel.`;
    else {
      game.keys = keyMap(r.keys);
      note = r.swapped ? `${ACTIONS[action].label} is now ${keyOf(action)}; ${ACTIONS[r.swapped].label.toLowerCase()} moved to ${keyOf(r.swapped)}.` : `${ACTIONS[action].label} is now ${keyOf(action)}.`;
    }
    draw();
  };
  addEventListener("keydown", onKey, true);

  return {
    get open() { return !panel.hidden; },
    show(on) { panel.hidden = !on; waiting = null; note = ""; if (on) draw(); },
    destroy() { removeEventListener("keydown", onKey, true); },
    update() {},
  };
}
