export function attachInput(canvas, view, { onTap, onSecondary, onHover, onChange, dragging, onDrag, onDragEnd }) {
  const pts = new Map();
  let gesture = null;
  const ratio = () => view.ratio ?? 1;
  const at = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * ratio(), (e.clientY - r.top) * ratio()]; };

  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) {
      if (e.button === 2) onSecondary?.(...at(e));
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, at(e));
    if (pts.size === 1) gesture = { start: at(e), t: performance.now(), moved: 0, multi: false, paint: !!dragging?.() };
    else if (gesture) gesture.multi = true;
  });

  canvas.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") onHover?.(...at(e));
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), now = at(e);
    if (pts.size === 1 && gesture?.paint) {
      gesture.moved += Math.hypot(now[0] - prev[0], now[1] - prev[1]);
      onDrag?.(gesture.start, now);
    } else if (pts.size === 1) {
      view.pan(now[0] - prev[0], now[1] - prev[1]);
      if (gesture) gesture.moved += Math.hypot(now[0] - prev[0], now[1] - prev[1]);
    } else if (pts.size === 2) {
      const [other] = [...pts.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      const before = Math.hypot(prev[0] - other[0], prev[1] - other[1]), after = Math.hypot(now[0] - other[0], now[1] - other[1]);
      const mx = (now[0] + other[0]) / 2, my = (now[1] + other[1]) / 2;
      view.pan((now[0] - prev[0]) / 2, (now[1] - prev[1]) / 2);
      if (before > 0) view.zoomAt(mx, my, after / before);
    }
    pts.set(e.pointerId, now);
    onChange?.();
  });

  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size || !gesture) return;
    const g = gesture;
    gesture = null;
    if (g.paint && !g.multi) return onDragEnd?.(g.start, at(e));
    if (!g.multi && g.moved < 8 * ratio() && performance.now() - g.t < 500) onTap?.(...at(e));
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointerleave", e => e.pointerType === "mouse" && onHover?.(null, null));
  canvas.addEventListener("pointercancel", e => { pts.delete(e.pointerId); gesture = null; });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const [x, y] = at(e);
    view.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    onChange?.();
  }, { passive: false });
}
