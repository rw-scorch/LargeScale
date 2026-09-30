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
  const channel = el("select", { id: "chat-channel", title: "who reads it" });
  const typing = el("p", { id: "chat-typing", class: "muted typing", hidden: true });
  let channels = "", typedAt = 0;
  const target = () => {
    const [ch, to] = channel.value.split(":");
    return ch === "private" ? { ch, to: Number(to) } : { ch: ch || "global" };
  };
  const send = e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!game.conn.send({ t: "chat", text, ...target() })) return game.toast("not connected");
    input.value = "";
  };
  input.addEventListener("input", () => {
    if (!input.value.trim() || performance.now() - typedAt < 2000) return;
    typedAt = performance.now();
    game.conn.send({ t: "typing", ...target() });
  });
  const tag = m => {
    const w = game.world, name = id => w.nations.get(id)?.name ?? "someone";
    if (m.ch === "faction") return el("span", { class: "ch faction", text: "[faction] " });
    if (m.ch === "private") return el("span", { class: "ch private", text: m.from === w.you ? `[to ${name(m.to)}] ` : "[private] " });
    return null;
  };
  const chat = el("div", { id: "chat" }, lines, typing, el("form", { onsubmit: send }, channel, input, el("button", { id: "chat-send", type: "submit", text: "Send" })));
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
      lines.replaceChildren(...c.slice(-60).map(m => el("p", { class: m.ch && m.ch !== "global" ? `ch-${m.ch}` : "" }, tag(m), el("b", { text: `${m.who}: ` }), m.text)));
      lines.scrollTop = lines.scrollHeight;
    }
    if (w && open && tab === "chat") {
      const fac = w.factionOf?.(w.you), others = [...w.nations.values()].filter(n => !n.bot && n.id !== w.you && n.spawned);
      const key = JSON.stringify([fac?.id, fac?.name, others.map(n => [n.id, n.name])]);
      if (key !== channels) {
        channels = key;
        const keep = channel.value;
        channel.replaceChildren(el("option", { value: "global", text: "Everyone" }), fac ? el("option", { value: "faction", text: `Faction: ${fac.name}` }) : null, ...others.map(n => el("option", { value: `private:${n.id}`, text: `To ${n.name}` })));
        channel.value = [...channel.options].some(o => o.value === keep) ? keep : "global";
      }
      const now = Date.now(), who = [...(w.typing ?? new Map())].filter(([, t]) => t.until > now).map(([name]) => name);
      typing.hidden = !who.length;
      if (who.length) typing.textContent = `${who.join(", ")} ${who.length === 1 ? "is" : "are"} typing`;
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
