import { el } from "./dom.js";

export function createChat(root, game) {
  const lines = el("div", { class: "lines" });
  const input = el("input", { id: "chat-input", placeholder: "say something", maxlength: 280 });
  const badge = el("span", { class: "badge", hidden: true });
  let seen = 0;
  const send = e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!game.conn.send({ t: "chat", text })) return game.toast("not connected");
    input.value = "";
  };
  const box = el("section", { id: "chat", class: "panel right shut" },
    el("button", { class: "ghost title", onclick: () => { box.classList.toggle("shut"); seen = game.world?.chat.length ?? 0; }, }, "Chat ", badge),
    lines,
    el("form", { onsubmit: send }, input, el("button", { id: "chat-send", type: "submit", text: "Send" })));
  root.append(box);
  let shown = -1;
  return {
    update() {
      const chat = game.world?.chat ?? [];
      const open = !box.classList.contains("shut");
      if (open) seen = chat.length;
      badge.hidden = chat.length <= seen;
      badge.textContent = String(chat.length - seen);
      if (!open || shown === chat.length) return;
      shown = chat.length;
      lines.replaceChildren(...chat.slice(-40).map(c => el("p", {}, el("b", { text: `${c.who}: ` }), c.text)));
      lines.scrollTop = lines.scrollHeight;
    },
  };
}
