import { el } from "./dom.js";

export function createNoteCard(root, game) {
  const title = el("b", { class: "title", text: "Map notes" });
  const where = el("p", { class: "muted" });
  const text = el("input", { id: "note-text", placeholder: "what to remember here", maxlength: 80 });
  const form = el("form", { id: "note-add", class: "row", onsubmit: e => { e.preventDefault(); add(); } }, text, el("button", { id: "note-save", type: "submit", class: "primary", text: "Pin note" }));
  const list = el("div", { id: "note-list", class: "note-list" });
  const box = el("section", { id: "note-card", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => api.show(false) })),
    where, form, list);
  root.append(box);
  let at = null, sig = "";

  const add = async () => {
    const r = await game.conn.request({ t: "note", op: "add", at, text: text.value });
    if (!r.ok) return game.toast(r.error ?? "the note was not pinned");
    game.toast("Note pinned. Your allies and faction see it too.");
    text.value = "";
    at = null;
    sig = "";
    game.updatePanels();
  };
  const remove = async id => {
    const r = await game.conn.request({ t: "note", op: "remove", id });
    if (!r.ok) game.toast(r.error ?? "that did not work");
  };

  const api = {
    get open() { return !box.hidden; },
    show(on, plot = null) {
      box.hidden = !on;
      at = on ? plot : null;
      sig = "";
      if (on) { this.update(); if (plot !== null) setTimeout(() => text.focus({ preventScroll: true }), 0); }
    },
    update() {
      if (box.hidden) return;
      const w = game.world;
      if (!w) return;
      const next = JSON.stringify([at, w.notesVersion, w.notes.length, w.dipVersion]);
      if (next === sig) return;
      sig = next;
      form.hidden = at === null;
      where.textContent = at === null ? "Notes you pin are shared with your allies and faction. Right-click a spot and pick Note to pin one." : `A note at ${at % w.w}, ${Math.floor(at / w.w)}, shared with your allies and faction.`;
      const mine = w.notes.filter(n => n.owner === w.you), theirs = w.notes.filter(n => n.owner !== w.you);
      const go = n => el("button", { class: "ghost", text: "Show", onclick: () => game.focus(n.at, Math.max(game.view.cam.scale / game.view.ratio, 6)) });
      list.replaceChildren(
        el("span", { class: "muted", text: `Yours: ${mine.length} of ${w.noteRules?.max ?? 20}` }),
        ...mine.map(n => el("div", { class: "row spread", "data-note": n.id }, el("span", { text: n.text }), el("span", { class: "row" }, go(n), el("button", { class: "ghost", "data-op": "remove", text: "Remove", onclick: () => remove(n.id) })))),
        ...(theirs.length ? [el("span", { class: "muted", text: "From your allies" })] : []),
        ...theirs.map(n => el("div", { class: "row spread", "data-note": n.id }, el("span", {}, el("i", { class: "swatch", style: `background:${w.nations.get(n.owner)?.colour ?? "#888"}` }), ` ${n.text}`), go(n))));
      if (!w.notes.length) list.append(el("span", { class: "muted", text: "No notes yet." }));
    },
  };
  return api;
}
