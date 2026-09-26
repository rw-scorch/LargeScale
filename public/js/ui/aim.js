import { el } from "./dom.js";
import { keyTag } from "./stack.js";

export function createAim(root, game) {
  const cross = el("div", { id: "crosshair", hidden: true });
  const hold = e => { e.preventDefault(); game.aimDown(); };
  const letGo = () => game.aimUp();
  const select = el("button", { id: "aim-select", class: "primary", title: "select what is under the crosshair; when zoning or painting, press once to start and again to finish", onpointerdown: hold, onpointerup: letGo, onpointercancel: letGo, onpointerleave: letGo }, "Select", " ", keyTag("select"));
  const hint = el("span", { id: "aim-hint", class: "aim-hint", hidden: true });
  const orders = el("button", { id: "aim-orders", title: "open the orders ring at the crosshair", onclick: () => game.aimOrders() }, "Orders", " ", keyTag("orders"));
  const bar = el("div", { id: "aim-bar", hidden: true }, hint, select, orders);
  root.append(cross, bar);
  return {
    update() {
      const on = !!game.prefs.crosshair && !!game.world?.ready;
      cross.hidden = bar.hidden = !on;
      select.classList.toggle("on", !!game.aimHeld);
      const shaping = game.zoning || game.painting();
      hint.hidden = !on || !shaping;
      hint.textContent = !shaping ? "" : game.aimHeld?.sticky
        ? (game.zoning ? "Move the view to size the area, then press Select to zone it." : "Move the view to paint along, then press Select to stop.")
        : (game.zoning ? "Press Select to mark one corner of the zone." : "Press Select to start painting buildings.");
    },
  };
}
