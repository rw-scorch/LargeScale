import { el } from "./dom.js";
import { icon } from "./icons.js";

const KEEP = 100, MERGE = 20, PEEK = 15000;
const TONE_ICON = { danger: "alert_attack", good: "ui_toast_good", warn: "ui_toast_warn", info: "ui_toast_info", built: "alert_built", research: "alert_research_done", era: "alert_era_up" };

const ago = t => {
  const s = (Date.now() - t) / 1000;
  return s < 45 ? "now" : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};

export function createFeed(root, game) {
  const small = matchMedia("(max-height: 500px)").matches;
  const items = [];
  let tab = "events", open = !small, unread = 0, seenChat = game.world?.chat.length ?? 0, dirty = true, drawnAt = 0, shownChat = -1;

  const badge = () => el("span", { class: "badge", hidden: true });
  const eventsBadge = badge(), chatBadge = badge();
  const eventsTab = el("button", { id: "feed-events", class: "tab", onclick: () => show("events") }, icon("ui_toast_info", 1), " Events ", eventsBadge);
  const chatTab = el("button", { id: "feed-chat", class: "tab", onclick: () => show("chat") }, icon("chat_bubble", 1), " Chat ", chatBadge);
  const fold = el("button", { id: "feed-fold", class: "ghost chip", title: "fold or unfold", onclick: () => show(open ? null : tab) });
  const peek = el("p", { id: "feed-peek", class: "peek", hidden: true, onclick: () => show("events") });
  const list = el("div", { id: "feed-list", class: "lines" });
  const lines = el("div", { class: "lines" });
  const input = el("input", { id: "chat-input", placeholder: "say something", maxlength: 280 });
  const send = e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!game.conn.send({ t: "chat", text })) return game.toast("not connected");
    input.value = "";
  };
  const chat = el("div", { id: "chat" }, lines, el("form", { onsubmit: send }, input, el("button", { id: "chat-send", type: "submit", text: "Send" })));
  const box = el("section", { id: "feed", class: "panel" }, el("div", { class: "row tabs" }, eventsTab, chatTab, el("span", { class: "grow" }), fold), peek, list, chat);
  root.append(box);

  function show(which) {
    open = which !== null;
    if (which) tab = which;
    if (open && tab === "events") unread = 0;
    if (open && tab === "chat") { seenChat = game.world?.chat.length ?? 0; setTimeout(() => input.focus({ preventScroll: true }), 0); }
    dirty = true;
    update();
  }

  function focusOn(item) {
    if (item.at == null || !game.view) return;
    game.focus(item.at, Math.max(game.view.cam.scale / game.view.ratio, 6));
  }

  function draw() {
    list.replaceChildren(...(items.length ? items.map(it => el("p", { class: `item ${it.tone}${it.at != null ? " go" : ""}`, title: it.at != null ? "show on the map" : "", onclick: () => focusOn(it) },
      icon(TONE_ICON[it.tone] ?? TONE_ICON.info, 1),
      el("span", { class: "text", text: it.text }),
      it.count > 1 ? el("span", { class: "count", text: `x${it.count}` }) : null,
      el("time", { text: ago(it.t) }))) : [el("p", { class: "muted", text: "Nothing has happened yet." })]));
    drawnAt = Date.now();
    dirty = false;
  }

  function update() {
    const w = game.world, c = w?.chat ?? [];
    box.classList.toggle("folded", !open);
    eventsTab.classList.toggle("on", open && tab === "events");
    chatTab.classList.toggle("on", open && tab === "chat");
    fold.textContent = open ? "Hide" : "Show";
    list.hidden = !open || tab !== "events";
    chat.hidden = !open || tab !== "chat";
    if (open && tab === "chat") seenChat = c.length;
    eventsBadge.hidden = !unread;
    eventsBadge.textContent = String(unread);
    chatBadge.hidden = c.length <= seenChat;
    chatBadge.textContent = String(c.length - seenChat);
    const newest = items[0];
    peek.hidden = open || !newest || Date.now() - newest.t > PEEK;
    if (!peek.hidden) peek.replaceChildren(icon(TONE_ICON[newest.tone] ?? TONE_ICON.info, 1), el("span", { text: newest.text }));
    if (dirty || Date.now() - drawnAt > 20000) draw();
    if (shownChat !== c.length) {
      shownChat = c.length;
      lines.replaceChildren(...c.slice(-60).map(m => el("p", {}, el("b", { text: `${m.who}: ` }), m.text)));
      lines.scrollTop = lines.scrollHeight;
    }
  }

  return {
    get open() { return open; },
    show,
    push({ key = null, text, at = null, tone = "info" }) {
      const i = key === null ? -1 : items.findIndex((it, k) => k < MERGE && it.key === key);
      const count = i >= 0 ? items[i].count + 1 : 1;
      if (i >= 0) items.splice(i, 1);
      items.unshift({ key, text, at, tone, count, t: Date.now() });
      if (items.length > KEEP) items.length = KEEP;
      if (!open || tab !== "events") unread++;
      dirty = true;
    },
    update,
  };
}
