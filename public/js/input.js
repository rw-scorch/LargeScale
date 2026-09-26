const HOLD_MS = 500;

export function attachInput(canvas, view, { onTap, onSecondary, onHover, onChange, dragging, onDrag, onDragEnd, tracing, onTrace, onTraceEnd }) {
  const pts = new Map();
  let gesture = null, right = null, swallow = false;
  const ratio = () => view.ratio ?? 1;
  const at = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * ratio(), (e.clientY - r.top) * ratio()]; };
  const far = g => g.moved >= 8 * ratio();
  const extend = (g, now) => {
    const prev = g.line.at(-1);
    g.moved += Math.hypot(now[0] - prev[0], now[1] - prev[1]);
    g.line.push(now);
  };

  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) {
      if (e.button === 2) {
        canvas.setPointerCapture(e.pointerId);
        right = { id: e.pointerId, line: [at(e)], moved: 0 };
      }
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, at(e));
    if (pts.size === 1) {
      const g = gesture = { start: at(e), t: performance.now(), moved: 0, multi: false, paint: !!dragging?.(), line: tracing?.() ? [at(e)] : null, held: false };
      if (e.pointerType !== "mouse" && !g.paint && !g.line) g.hold = setTimeout(() => {
        if (gesture !== g || g.multi || far(g)) return;
        g.held = true;
        onSecondary?.(...g.start);
      }, HOLD_MS);
    } else if (gesture) gesture.multi = true;
  });

  canvas.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") onHover?.(...at(e));
    if (right?.id === e.pointerId && !pts.has(e.pointerId)) {
      extend(right, at(e));
      if (far(right)) onTrace?.(right.line);
      return;
    }
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), now = at(e);
    if (pts.size === 1 && gesture?.line && !gesture.multi) {
      extend(gesture, now);
      onTrace?.(gesture.line);
    } else if (pts.size === 1 && gesture?.paint) {
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
    if (right?.id === e.pointerId && !pts.has(e.pointerId)) {
      const r = right;
      right = null;
      if (far(r)) onTraceEnd?.(r.line);
      else onSecondary?.(...r.line[0]);
      return;
    }
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size || !gesture) return;
    const g = gesture;
    gesture = null;
    clearTimeout(g.hold);
    if (g.held) { swallow = true; return; }
    if (g.line) return onTraceEnd?.(g.multi ? null : g.line);
    if (g.paint && !g.multi) return onDragEnd?.(g.start, at(e));
    if (!g.multi && g.moved < 8 * ratio() && performance.now() - g.t < 500) onTap?.(...at(e));
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("touchend", e => { if (swallow) { swallow = false; e.preventDefault(); } }, { passive: false });
  canvas.addEventListener("pointerleave", e => e.pointerType === "mouse" && onHover?.(null, null));
  canvas.addEventListener("pointercancel", e => {
    if (right?.id === e.pointerId) { right = null; onTraceEnd?.(null); }
    pts.delete(e.pointerId);
    clearTimeout(gesture?.hold);
    if (gesture?.line) onTraceEnd?.(null);
    gesture = null;
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const [x, y] = at(e);
    view.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    onChange?.();
  }, { passive: false });
}
