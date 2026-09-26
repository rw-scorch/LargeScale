import { el, fmt, armed } from "./dom.js";

const GIVE = [["money", "Gold"], ["food", "Food"], ["wood", "Wood"], ["stone", "Stone"], ["clay", "Clay"], ["iron", "Iron"], ["troops", "Troops"]];
const SPEEDS = [1, 2, 4, 8];
const when = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const WHAT = {
  give: d => `gave ${d.name} ${fmt(d.amount)} ${d.what === "money" ? "gold" : d.what}`,
  finish: d => `finished ${d.done.length} research for ${d.name}`,
  speed: d => `set the speed to ${d.factor}x`,
  end: () => "ended the world",
  reopen: () => "reopened the world",
  rename: d => `renamed the world ${d.name}`,
  kick: d => `removed ${d.name} from the world`,
  "account removed": d => `removed account ${d.account}`,
};

export function createAdminPanel(root, game) {
  const title = el("b", { class: "title" });
  const name = el("input", { id: "admin-name", maxlength: 40 });
  const speeds = el("div", { class: "row wrap" });
  const endSlot = el("span");
  const players = el("div", { id: "admin-players", class: "admin-list" });
  const target = el("select", { id: "admin-target" });
  const amount = el("input", { id: "admin-amount", class: "small", type: "number", value: 1000, step: 100 });
  const log = el("div", { id: "admin-log", class: "admin-log" });
  let key = {}, logged = 0;
  const counts = new Map();
  const changed = (part, value) => { const k = JSON.stringify(value); if (key[part] === k) return false; key[part] = k; return true; };

  const op = async (msg, done) => {
    const r = await game.conn.request({ t: "admin", ...msg });
    if (!r.ok) game.toast(r.error ?? "that did not work");
    else if (done) game.toast(done(r));
    loadLog();
    return r;
  };
  const loadLog = async () => {
    const r = await game.conn.request({ t: "admin", op: "log" });
    if (!r.ok) return;
    log.replaceChildren(...(r.log.length ? r.log.map(e => el("p", {}, el("span", { class: "muted", text: `${when(e.t)} ` }), `${e.who} ${(WHAT[e.op] ?? (() => e.op))(e.detail)}`)) : [el("p", { class: "muted", text: "Nothing done yet." })]));
    logged = performance.now();
  };

  const box = el("section", { id: "admin-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleAdmin(false) })),
    el("div", { class: "admin-grid" },
      el("section", {},
        el("b", { text: "World" }),
        el("div", { class: "row" }, name, el("button", { id: "admin-rename", text: "Rename", onclick: () => op({ op: "rename", name: name.value }, r => `Renamed to ${r.name}.`) })),
        el("div", { class: "row wrap" }, el("button", { id: "admin-save", text: "Save now", onclick: () => op({ op: "save" }, () => "Saved.") }), endSlot),
        el("span", { class: "muted", text: "Speed, for everyone in this world:" }),
        speeds),
      el("section", {},
        el("b", { text: "Players" }),
        el("span", { class: "muted", text: "Removing someone keeps their nation as it is, offline. They cannot come back into this world." }),
        players),
      el("section", {},
        el("b", { text: "Testing" }),
        el("div", { class: "row wrap" }, target, amount),
        el("div", { class: "row wrap" }, ...GIVE.map(([what, label]) => el("button", { "data-give": what, text: `+ ${label}`, onclick: () => op({ op: "give", nation: Number(target.value), what, amount: Math.round(Number(amount.value)) }, r => `${r.name} now has ${fmt(r.now)} ${label.toLowerCase()}.`) }))),
        el("button", { id: "admin-finish", text: "Finish research queue", onclick: () => op({ op: "finish", nation: Number(target.value) }, r => `Finished ${r.done.length} for ${r.name}${r.waiting ? `; the rest waits: ${r.waiting}` : ""}.`) }),
        el("span", { class: "muted", text: "A negative amount takes away." })),
      el("section", {}, el("b", { text: "Log" }), log)));
  root.append(box);

  return {
    get open() { return !box.hidden; },
    show(on) {
      box.hidden = !on;
      key = {};
      if (on) { name.value = game.name; loadLog(); }
    },
    update() {
      const w = game.world;
      if (box.hidden || !w) return;
      title.textContent = `Admin: ${game.name}`;
      const living = [...w.nations.values()].filter(n => n.spawned && n.alive !== false);
      const humans = [...w.nations.values()].filter(n => !n.bot && n.id !== w.you);
      if (performance.now() - logged > 10000) loadLog();
      const where = n => ` ${n.name}, ${!n.spawned ? "not placed yet" : n.alive === false ? "eliminated" : `${fmt(n.plots ?? 0)} plots`}`;
      for (const n of humans) { const s = counts.get(n.id); if (s) s.textContent = where(n); }
      if (changed("speed", w.speed)) speeds.replaceChildren(...SPEEDS.map(f => el("button", { class: w.speed === f ? "on" : "", "data-speed": f, text: `${f}x`, onclick: () => op({ op: "speed", factor: f }, r => `Speed set to ${r.factor}x.`) })));
      if (changed("end", [w.ended, !!w.victory])) endSlot.replaceChildren(w.victory ? el("span", { class: "muted", text: "This world is won and stays frozen." })
        : w.ended ? el("button", { id: "admin-reopen", text: "Reopen world", onclick: () => op({ op: "reopen" }, () => "Reopened.") })
        : armed("End world", "Really end it?", () => op({ op: "end" }, () => "Ended. Everyone can still look around."), { id: "admin-end" }));
      if (changed("players", humans.map(n => [n.id, n.name]))) players.replaceChildren(...(humans.length ? humans.map(n => el("div", { class: "admin-row" },
        el("span", {}, el("i", { class: "swatch", style: `background:${n.colour}` }), counts.set(n.id, el("span", { text: where(n) })).get(n.id)),
        armed("Remove", `Remove ${n.name}?`, () => op({ op: "kick", nation: n.id }, r => `${r.name} was removed.`), { "data-kick": n.id }))) : [el("span", { class: "muted", text: "No other players here." })]));
      if (!changed("target", living.map(n => [n.id, n.bot]))) return;
      const pick = target.value;
      target.replaceChildren(...living.sort((a, b) => (a.id === w.you ? -1 : b.id === w.you ? 1 : 0) || (a.bot - b.bot) || a.name.localeCompare(b.name)).map(n => el("option", { value: n.id, text: n.id === w.you ? `${n.name} (you)` : n.bot ? `${n.name} (bot)` : n.name })));
      if ([...target.options].some(o => o.value === pick)) target.value = pick;
    },
  };
}
