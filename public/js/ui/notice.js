import { el } from "./dom.js";

export function createNotices(root, game) {
  const toasts = el("div", { id: "toasts" });
  const banner = el("div", { id: "notice", class: "banner big", hidden: true });
  root.append(toasts, banner);
  return {
    toast(text) {
      const t = el("p", { class: "toast", text });
      toasts.append(t);
      setTimeout(() => t.remove(), 3500);
      while (toasts.children.length > 4) toasts.firstChild.remove();
    },
    update() {
      const w = game.world, c = game.conn;
      let text = null, action = null;
      if (c.status === "outdated" || w?.stale) { text = "The game has been updated."; action = el("button", { class: "primary", text: "Reload", onclick: () => location.reload() }); }
      else if (c.status === "removed" || c.status === "deleted") { text = c.endedText ?? (c.status === "removed" ? "The host removed you from this world." : "The host deleted this world."); action = el("button", { id: "notice-back", class: "primary", text: "Back to worlds", onclick: () => game.leave() }); }
      else if (c.status === "replaced") { text = "This game was opened in another tab or device."; action = el("button", { class: "primary", text: "Use it here", onclick: () => game.reconnect() }); }
      else if (w?.ended) text = "The host has ended this world. You can still look around.";
      else if (w?.victory) text = w.victory.name ? `${w.victory.name} has won. The world is frozen, but you can still look around.` : "Nobody is left standing. The world is frozen.";
      banner.hidden = !text;
      if (text && banner.dataset.text !== text) {
        banner.dataset.text = text;
        banner.replaceChildren(el("span", { id: "notice-text", text }), action ?? "");
      }
    },
  };
}
