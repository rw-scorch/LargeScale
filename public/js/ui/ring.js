import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { isLand } from "../shared/terrain.js";

const RADIUS = 78;

export function ownerItems(game, plot, sx, sy) {
  const w = game.world, me = w.nations.get(w.you), o = w.owner[plot];
  if (!isLand(w.terrain[plot])) return [];
  const share = game.hud.share, troops = fmt((me?.troops ?? 0) * share);
  if (o === w.you) return [
    { id: "form", label: "Form stack", note: troops, icon: "res_troops", run: () => game.formAt(plot) },
    { id: "build", label: "Build", icon: "build_hammer", run: () => game.buildHere(plot) },
    { id: "zone", label: "Zone", icon: "build_zone", run: () => game.zoneHere() },
  ];
  if (!o) return [{ id: "take", label: "Take land", note: troops, icon: "ui_flag", run: () => game.attackAt(plot) }];
  return [{ id: "attack", label: `Attack ${w.nations.get(o)?.name ?? "them"}`, note: troops, icon: "dip_war", run: () => game.attackAt(plot) }];
}

export function createRing(root, game) {
  const back = el("div", { id: "ring-back", hidden: true });
  const dot = el("i", { id: "ring-dot", hidden: true });
  const ring = el("div", { id: "ring", hidden: true });
  root.append(back, dot, ring);
  let items = [], centre = null;

  const close = () => { back.hidden = dot.hidden = ring.hidden = true; items = []; centre = null; };
  const choose = it => { if (!it || it.why) return; close(); it.run(); };
  const canvasAt = e => { const r = game.canvas.getBoundingClientRect(), k = game.view?.ratio ?? 1; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
  back.addEventListener("contextmenu", e => e.preventDefault());
  back.addEventListener("pointerdown", e => {
    e.preventDefault();
    close();
    if (e.button === 2) game.secondary(...canvasAt(e));
  });
  back.addEventListener("wheel", close, { passive: true });
  const onKey = e => {
    if (ring.hidden) return;
    const n = Number(e.key);
    if (e.key === "Escape") close();
    else if (e.key === "Enter" || e.key === " ") choose(centre);
    else if (n >= 1 && n <= 9) choose(items.filter(i => i !== centre)[n - 1]);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  addEventListener("keydown", onKey, true);

  const button = (it, x, y, k) => el("button", { class: `ring-item${it === centre ? " centre" : ""}`, "data-ring": it.id, style: `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px`, disabled: !!it.why, title: it.why ?? it.label, onclick: () => choose(it) },
    icon(it.icon, it === centre ? 2 : 1.5),
    el("span", { class: "label", text: it.label }),
    it.note ? el("span", { class: "note", text: it.note }) : null,
    k ? el("kbd", { class: "key", text: String(k) }) : null);

  return {
    get open() { return !ring.hidden; },
    close,
    destroy() { close(); removeEventListener("keydown", onKey, true); },
    show(sx, sy, list) {
      const k = game.view?.ratio ?? 1, x = sx / k, y = sy / k, W = root.clientWidth, H = root.clientHeight, pad = RADIUS + 44;
      items = list;
      centre = list.find(i => i.centre) ?? list[0];
      const around = list.filter(i => i !== centre);
      const cx = Math.min(Math.max(x, pad), W - pad), cy = Math.min(Math.max(y, pad), H - pad);
      ring.style.left = `${cx}px`;
      ring.style.top = `${cy}px`;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      const n = around.length, step = n >= 3 ? (2 * Math.PI) / n : (2 * Math.PI) / 3, start = -Math.PI / 2 - (n >= 3 ? 0 : ((n - 1) * step) / 2);
      ring.replaceChildren(button(centre, 0, 0, null), ...around.map((it, i) => button(it, Math.cos(start + i * step) * RADIUS, Math.sin(start + i * step) * RADIUS, i + 1)));
      back.hidden = dot.hidden = ring.hidden = false;
    },
  };
}
