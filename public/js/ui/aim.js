import { el } from "./dom.js";
import { keyTag } from "./stack.js";

export function createAim(root, game) {
  const cross = el("div", { id: "crosshair", hidden: true });
  const hold = e => { e.preventDefault(); game.aimDown(); };
  const letGo = () => game.aimUp();
  const select = el("button", { id: "aim-select", class: "primary", title: "select what is under the crosshair; hold to paint or zone", onpointerdown: hold, onpointerup: letGo, onpointercancel: letGo, onpointerleave: letGo }, "Select", " ", keyTag("select"));
  const orders = el("button", { id: "aim-orders", title: "open the orders ring at the crosshair", onclick: () => game.aimOrders() }, "Orders", " ", keyTag("orders"));
  const bar = el("div", { id: "aim-bar", hidden: true }, select, orders);
  root.append(cross, bar);
  return {
    update() {
      const on = !!game.prefs.crosshair && !!game.world?.ready;
      cross.hidden = bar.hidden = !on;
      select.classList.toggle("on", !!game.aimHeld);
    },
  };
}
