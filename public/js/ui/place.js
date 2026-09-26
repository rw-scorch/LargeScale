import { el } from "./dom.js";

export function createPlaceConfirm(root, game) {
  const why = el("span", { class: "why", hidden: true });
  const go = el("button", { id: "place-go", class: "primary", text: "Build here", onclick: () => game.confirmBuild() });
  const box = el("div", { id: "place-confirm", class: "place-confirm", hidden: true }, go, el("button", { id: "place-cancel", text: "Cancel", onclick: () => game.unpin() }), why);
  root.append(box);
  let said = null;

  return {
    position() {
      const w = game.world, v = game.view, def = game.building && w?.defs.table[game.building];
      if (!def || game.pinned === null || !v) { box.hidden = true; return; }
      const x = game.pinned % w.w, y = (game.pinned / w.w) | 0;
      const [sx, sy] = v.plotToScreen(x + def.fp[0] / 2, y + def.fp[1]);
      box.hidden = false;
      box.style.left = `${Math.round(sx / v.ratio)}px`;
      box.style.top = `${Math.round(sy / v.ratio) + 10}px`;
      const reason = w.placeError(def.id, game.pinned);
      if (reason === said) return;
      said = reason;
      go.disabled = !!reason;
      why.hidden = !reason;
      why.textContent = reason ?? "";
    },
    update() {},
  };
}
