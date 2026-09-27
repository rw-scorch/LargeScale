import { el } from "./dom.js";

const KEY = "ls_layout", MIN_W = 140, MIN_H = 60, EDGE = 24;
export const PANELS = [
  { id: "nations", name: "Nations" },
  { id: "control", name: "Your nation" },
  { id: "action-bar", name: "Action bar" },
  { id: "feed", name: "Events and chat" },
  { id: "side", name: "Cards (stack, building, town)" },
  { id: "top-mid", name: "Status and guide" },
  { id: "research-panel", name: "Research" },
  { id: "army-panel", name: "Army" },
  { id: "upgrade-panel", name: "Upgrade" },
];

export const loadLayout = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; } };
const saveLayout = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

export function rectOf(entry, W, H) {
  const w = entry.w != null ? Math.max(MIN_W, Math.min(W, entry.w * W)) : null, h = entry.h != null ? Math.max(MIN_H, Math.min(H, entry.h * H)) : null;
  const x = Math.max(0, Math.min(W - EDGE * 2, entry.x * W)), y = Math.max(0, Math.min(H - EDGE, entry.y * H));
  return { x, y, w, h };
}

export function createLayout(root, game) {
  let saved = loadLayout(), editing = null;
  const byId = id => document.getElementById(id);

  const place = (id, entry) => {
    const node = byId(id);
    if (!node) return;
    const s = node.style;
    if (!entry) {
      node.classList.remove("placed");
      s.left = s.top = s.width = s.height = "";
      return;
    }
    const r = rectOf(entry, innerWidth, innerHeight);
    node.classList.add("placed");
    s.left = `${r.x}px`;
    s.top = `${r.y}px`;
    s.width = r.w != null ? `${r.w}px` : "";
    s.height = r.h != null ? `${r.h}px` : "";
  };
  const apply = () => { for (const p of PANELS) place(p.id, saved[p.id]); };

  const defaultRect = id => {
    const node = byId(id), W = innerWidth, H = innerHeight;
    if (node && !node.hidden && node.getClientRects().length) {
      const b = node.getBoundingClientRect();
      if (b.width && b.height) return { x: b.left, y: b.top, w: b.width, h: b.height };
    }
    const k = Math.max(0, PANELS.findIndex(p => p.id === id) - PANELS.findIndex(p => p.id === "research-panel"));
    const w = Math.min(420, (W - 64) / 3 - 8), h = Math.min(360, (H - 120) * 0.6);
    return { x: 32 + k * (w + 8), y: Math.min(H - h - 8, 96), w, h };
  };

  function edit() {
    if (editing) return;
    const W = () => innerWidth, H = () => innerHeight, draft = JSON.parse(JSON.stringify(saved));
    const frames = new Map();
    const layer = el("div", { id: "layout-edit" });
    const toolbar = el("div", { class: "layout-bar panel" },
      el("b", { text: "Arrange panels" }),
      el("span", { class: "muted", text: "Drag a panel to move it, or its corner to resize it." }),
      el("button", { id: "layout-reset-all", text: "Reset all", onclick: () => { for (const k of Object.keys(draft)) delete draft[k]; apply(draft); redraw(); } }),
      el("button", { id: "layout-done", class: "primary", text: "Done", onclick: () => api.stop(true) }));
    const apply = d => { for (const p of PANELS) place(p.id, d[p.id]); };
    const redraw = () => {
      for (const p of PANELS) {
        const f = frames.get(p.id), r = draft[p.id] ? { ...rectOf(draft[p.id], W(), H()) } : defaultRect(p.id);
        if (r.w == null || r.h == null) { const d = defaultRect(p.id); r.w ??= d.w; r.h ??= d.h; }
        Object.assign(f.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        f.classList.toggle("moved", !!draft[p.id]);
      }
    };
    const area = id => { const r = draft[id] ? rectOf(draft[id], W(), H()) : defaultRect(id), d = defaultRect(id); return (r.w ?? d.w) * (r.h ?? d.h); };
    for (const p of [...PANELS].sort((a, b) => area(b.id) - area(a.id))) {
      const grip = el("span", { class: "layout-grip", title: "drag to resize" });
      const reset = el("button", { class: "chip layout-reset", "data-reset": p.id, text: "Reset", onclick: e => { e.stopPropagation(); delete draft[p.id]; apply(draft); redraw(); } });
      const f = el("div", { class: "layout-frame", "data-panel": p.id }, el("span", { class: "layout-name", text: p.name }), reset, grip);
      f.addEventListener("pointerdown", e => {
        if (e.target === reset) return;
        e.preventDefault();
        const b = f.getBoundingClientRect(), resize = e.target === grip, start = { x: e.clientX, y: e.clientY, b };
        const node = byId(p.id), sized = resize || !node || node.hidden || !node.getClientRects().length;
        try { f.setPointerCapture(e.pointerId); } catch {}
        f.classList.add("active");
        const move = ev => {
          const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          let { left: x, top: y, width: w, height: h } = start.b;
          if (resize) { w = Math.max(MIN_W, Math.min(W() - x, w + dx)); h = Math.max(MIN_H, Math.min(H() - y, h + dy)); }
          else { x = Math.max(0, Math.min(W() - EDGE * 2, x + dx)); y = Math.max(0, Math.min(H() - EDGE, y + dy)); }
          const was = draft[p.id] ?? {};
          draft[p.id] = { x: x / W(), y: y / H(), w: sized || was.w != null ? w / W() : undefined, h: sized || was.h != null ? h / H() : undefined };
          Object.assign(f.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
          place(p.id, draft[p.id]);
        };
        const up = () => {
          f.removeEventListener("pointermove", move);
          f.removeEventListener("pointerup", up);
          f.removeEventListener("pointercancel", up);
          f.classList.remove("active");
          redraw();
        };
        f.addEventListener("pointermove", move);
        f.addEventListener("pointerup", up);
        f.addEventListener("pointercancel", up);
      });
      frames.set(p.id, f);
      layer.append(f);
    }
    layer.append(toolbar);
    root.append(layer);
    redraw();
    editing = { layer, draft, redraw };
  }

  const api = {
    get editing() { return !!editing; },
    apply,
    edit,
    stop(keep = true) {
      if (!editing) return;
      if (keep) { saved = Object.fromEntries(Object.entries(editing.draft).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x != null))])); saveLayout(saved); }
      editing.layer.remove();
      editing = null;
      apply();
      game.toast?.(keep ? "Layout saved in this browser." : "Layout unchanged.");
    },
    reset() { saved = {}; saveLayout(saved); apply(); },
    resized() { apply(); editing?.redraw(); },
    update() {},
  };
  apply();
  return api;
}
