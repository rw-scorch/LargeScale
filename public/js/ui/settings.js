import { el } from "./dom.js";
import { ACTIONS, FIXED, keyOf, keyName, rebind, saveKeys, keyMap } from "../keys.js";
import { THEMES, SECTIONS, PARTS, loadTheme, saveTheme, applyTheme, colourOf } from "./theme.js";

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
  const colours = el("div", { id: "theme-box", class: "theme-box" });
  const said = el("p", { id: "settings-note", class: "muted" });
  const panel = el("section", { id: "settings-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Settings" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleSettings(false) })),
    el("h2", { text: "Display" }), boxes,
    el("h2", { text: "Building" }), building,
    el("h2", { text: "Accessibility" }), access,
    el("h2", { text: "Colours" }), colours,
    el("h2", { text: "Layout" }),
    el("p", { class: "muted", text: "Move and resize the panels: the leaderboard, your nation, the action bar, events and chat, the cards, the status line, and the Research, Army and Upgrade panels. The layout is kept in this browser." }),
    el("div", { class: "row wrap" },
      el("button", { id: "layout-arrange", class: "primary", text: "Arrange panels", onclick: () => { game.toggleSettings(false); game.layout.edit(); } }),
      el("button", { id: "layout-reset", text: "Put every panel back", onclick: () => { game.layout.reset(); note = "Every panel is back in its usual place."; draw(); } })),
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
    keys.replaceChildren(...Object.entries(ACTIONS).filter(([a]) => a !== "admin" || game.canAdmin).map(([a, def]) => el("div", { class: "key-row" },
      el("span", { text: def.label }),
      el("button", { class: `chip${waiting === a ? " on" : ""}`, "data-bind": a, disabled: FIXED.has(a), text: waiting === a ? "Press a key" : keyOf(a), onclick: () => { waiting = waiting === a ? null : a; note = ""; draw(); } }))));
  };

  const drawColours = () => {
    const t = loadTheme();
    const set = (fn, redraw = true) => { fn(t); saveTheme(t); applyTheme(t); if (redraw) drawColours(); };
    colours.replaceChildren(
      el("p", { class: "muted", text: "Pick a theme, then colour any part on its own. A part keeps its own colours when you change the theme; Reset gives it the theme's again. Kept in this browser." }),
      el("div", { class: "row wrap" }, ...Object.entries(THEMES).map(([id, th]) => el("button", { class: `chip theme-chip${t.preset === id ? " on" : ""}`, "data-theme": id, onclick: () => set(x => { x.preset = id; }) },
        el("i", { class: "swatch", style: `background:${th.panel};outline:2px solid ${th.accent}` }), th.name))),
      el("label", { class: "row" }, "Panel opacity", el("input", { id: "theme-opacity", type: "range", min: 50, max: 100, value: Math.round(t.opacity * 100), oninput: e => set(x => { x.opacity = Number(e.target.value) / 100; }, false) })),
      ...SECTIONS.map(sec => el("div", { class: "theme-row", "data-section": sec.id },
        el("span", { class: "theme-name", text: sec.name }),
        el("div", { class: "row" },
          ...PARTS.map(([p, label]) => el("label", { class: "theme-pick", title: `${sec.name}: ${label.toLowerCase()}` },
            el("input", { type: "color", value: colourOf(t, sec.id, p), "data-part": p, onchange: e => set(x => { (x.sections[sec.id] ??= {})[p] = e.target.value; }) }),
            el("small", { text: label }))),
          el("button", { class: "ghost chip", text: "Reset", disabled: !t.sections[sec.id], onclick: () => set(x => { delete x.sections[sec.id]; }) })))),
      el("button", { id: "theme-reset", text: "Back to the usual colours", onclick: () => set(x => { x.preset = "harbour"; x.opacity = 0.86; x.sections = {}; }) }));
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
    show(on) { panel.hidden = !on; waiting = null; note = ""; if (on) { draw(); drawColours(); } },
    destroy() { removeEventListener("keydown", onKey, true); },
    update() {},
  };
}
