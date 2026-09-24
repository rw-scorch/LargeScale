import { el, fmt } from "./dom.js";
import { keyTag } from "./stack.js";

const STATUS = { online: "Online", connecting: "Connecting", reconnecting: "Reconnecting", waiting: "Offline", replaced: "Opened elsewhere", outdated: "Needs reload", closed: "Closed" };

export function createHud(root, game) {
  const dot = el("span", { class: "dot" });
  const status = el("span", { id: "status-text" });
  const mine = el("span", { id: "my-nation", class: "muted" });
  const share = el("input", { id: "stack-share", type: "range", min: 10, max: 100, step: 5, value: 30, title: "share of your garrison" });
  const shareLabel = el("span", { class: "muted", text: "30%" });
  share.oninput = () => (shareLabel.textContent = `${share.value}%`);
  const form = el("button", { id: "form-stack", class: "primary", onclick: () => game.togglePlacing() }, "Form stack", " ", keyTag("form"));
  const placeHint = el("div", { id: "place-hint", class: "banner", hidden: true }, "Click your own land to place the stack. ", el("span", { class: "fine-only", text: "Or point and press F. " }), "Esc cancels.");
  const bar = el("header", { class: "hud" },
    el("button", { class: "ghost", text: "Worlds", onclick: () => game.leave() }),
    el("b", { class: "world-name", text: game.name }),
    el("span", { class: "status" }, dot, status),
    mine,
    el("span", { class: "grow" }),
    el("span", { class: "stackform" }, share, shareLabel, form),
    el("span", { class: "zoom" },
      el("button", { title: "zoom out (-)", text: "-", onclick: () => game.zoom(1 / 1.6) }),
      el("button", { title: "zoom in (+)", text: "+", onclick: () => game.zoom(1.6) }),
      el("button", { title: "whole map", text: "Map", onclick: () => game.fit() }),
      el("button", { title: "your capital (H)", onclick: () => game.home() }, "Home", " ", keyTag("home"))));
  root.append(bar, placeHint);

  return {
    update() {
      const c = game.conn;
      dot.className = `dot ${c.status}`;
      status.textContent = STATUS[c.status] ?? c.status;
      const n = game.world?.nations.get(game.world.you);
      mine.textContent = n?.spawned ? `${fmt(n.plots)} plots, ${fmt(n.troops)} troops` : n ? "not placed yet" : "";
      form.disabled = !n?.spawned || !n.alive || game.world.frozen;
      form.classList.toggle("on", !!game.placing);
      placeHint.hidden = !game.placing;
    },
    get share() { return Number(share.value) / 100; },
  };
}
