import { el, fmt, armed } from "./dom.js";

const GIVE = [["money", "Gold"], ["troops", "Troops"]];
const SPEEDS = [1, 2, 4, 8];
const POWER_NAMES = [["world", "World"], ["speed", "Speed"], ["schedule", "Schedule"], ["kick", "Remove players"], ["give", "Give and research"], ["cheats", "Cheats"]];
const CHEAT_NAMES = [["gold", "Infinite gold"], ["troops", "Infinite troops"], ["build", "Instant building"], ["research", "Instant research"]];
const when = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const WHAT = {
  give: d => `gave ${d.name} ${fmt(d.amount)} ${d.what === "money" ? "gold" : d.what}`,
  finish: d => `finished ${d.done.length} research for ${d.name}`,
  researchAll: d => `researched everything (${d.done.length}) for ${d.name}`,
  cheat: d => `turned ${d.on ? "on" : "off"} ${CHEAT_NAMES.find(c => c[0] === d.cheat)?.[1].toLowerCase() ?? d.cheat} for ${d.name}`,
  powers: d => d.powers.length ? `gave ${d.name} these powers: ${d.powers.map(p => POWER_NAMES.find(n => n[0] === p)?.[1] ?? p).join(", ")}` : `took every power from ${d.name}`,
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
  const cheats = el("div", { id: "admin-cheats", class: "settings-toggles" });
  const log = el("div", { id: "admin-log", class: "admin-log" });
  let key = {}, logged = 0, powers = {}, cheatsOf = {};
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
    if (r.powers) powers = r.powers;
    if (r.cheats) cheatsOf = r.cheats;
    log.replaceChildren(...(r.log.length ? r.log.map(e => el("p", {}, el("span", { class: "muted", text: `${when(e.t)} ` }), `${e.who} ${(WHAT[e.op] ?? (() => e.op))(e.detail)}`)) : [el("p", { class: "muted", text: "Nothing done yet." })]));
    logged = performance.now();
  };
  const setPowers = (n, list) => op({ op: "powers", nation: n.id, powers: list }, r => r.powers.length ? `${r.name} can now use: ${r.powers.map(p => POWER_NAMES.find(x => x[0] === p)[1]).join(", ")}.` : `${r.name} has no admin powers now.`).then(r => { if (r.ok) { powers[n.id] = r.powers; key.players = null; } });
  const setCheat = (nid, cheat, on) => op({ op: "cheat", nation: nid, cheat, on }, r => `${CHEAT_NAMES.find(c => c[0] === cheat)[1]} ${on ? "on" : "off"} for ${r.name}.`).then(r => { if (r.ok) { cheatsOf[nid] = r.cheats; key.cheats = null; } });

  const worldPart = el("section", { id: "admin-world" },
    el("b", { text: "World" }),
    el("div", { class: "row" }, name, el("button", { id: "admin-rename", text: "Rename", onclick: () => op({ op: "rename", name: name.value }, r => `Renamed to ${r.name}.`) })),
    el("div", { class: "row wrap" }, el("button", { id: "admin-save", text: "Save now", onclick: () => op({ op: "save" }, () => "Saved.") }), endSlot));
  const speedPart = el("section", { id: "admin-speed" }, el("b", { text: "Speed" }), el("span", { class: "muted", text: "For everyone in this world:" }), speeds);
  const playerPart = el("section", { id: "admin-people" },
    el("b", { text: "Players" }),
    el("span", { id: "admin-people-note", class: "muted" }),
    players);
  const givePart = el("section", { id: "admin-testing" },
    el("b", { text: "Give and research" }),
    el("div", { class: "row wrap" }, target, amount),
    el("div", { class: "row wrap" }, ...GIVE.map(([what, label]) => el("button", { "data-give": what, text: `+ ${label}`, onclick: () => op({ op: "give", nation: Number(target.value), what, amount: Math.round(Number(amount.value)) }, r => `${r.name} now has ${fmt(r.now)} ${label.toLowerCase()}.`) }))),
    el("div", { class: "row wrap" },
      el("button", { id: "admin-finish", text: "Finish research queue", onclick: () => op({ op: "finish", nation: Number(target.value) }, r => `Finished ${r.done.length} for ${r.name}${r.waiting ? `; the rest waits: ${r.waiting}` : ""}.`) }),
      el("button", { id: "admin-research-all", class: "primary", text: "Research all", onclick: () => op({ op: "researchAll", nation: Number(target.value) }, r => `${r.name} now knows everything: ${r.done.length} researched.`) })),
    el("span", { class: "muted", text: "A negative amount takes away." }));
  const cheatPart = el("section", { id: "admin-cheat" }, el("b", { text: "Cheats" }), el("span", { class: "muted", text: "For the player picked under Give and research, or yourself." }), cheats);

  const box = el("section", { id: "admin-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleAdmin(false) })),
    el("div", { class: "admin-grid" }, worldPart, speedPart, playerPart, givePart, cheatPart, el("section", {}, el("b", { text: "Log" }), log)));
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
      const can = p => game.can(p);
      title.textContent = game.admin ? `Admin: ${game.name}` : `Helper: ${game.name}`;
      worldPart.hidden = !can("world");
      speedPart.hidden = !can("speed");
      givePart.hidden = !can("give") && !can("cheats");
      cheatPart.hidden = !can("cheats");
      for (const b of givePart.querySelectorAll("button")) b.hidden = !can("give");
      amount.hidden = !can("give");
      playerPart.hidden = !can("kick") && !game.admin;
      const living = [...w.nations.values()].filter(n => n.spawned && n.alive !== false);
      const humans = [...w.nations.values()].filter(n => !n.bot && n.id !== w.you);
      if (performance.now() - logged > 10000) loadLog();
      const where = n => ` ${n.name}, ${!n.spawned ? "not placed yet" : n.alive === false ? "eliminated" : `${fmt(n.plots ?? 0)} plots`}`;
      for (const n of humans) { const s = counts.get(n.id); if (s) s.textContent = where(n); }
      if (changed("speed", w.speed)) speeds.replaceChildren(...SPEEDS.map(f => el("button", { class: w.speed === f ? "on" : "", "data-speed": f, text: `${f}x`, onclick: () => op({ op: "speed", factor: f }, r => `Speed set to ${r.factor}x.`) })));
      if (changed("end", [w.ended, !!w.victory])) endSlot.replaceChildren(w.victory ? el("span", { class: "muted", text: "This world is won and stays frozen." })
        : w.ended ? el("button", { id: "admin-reopen", text: "Reopen world", onclick: () => op({ op: "reopen" }, () => "Reopened.") })
        : armed("End world", "Really end it?", () => op({ op: "end" }, () => "Ended. Everyone can still look around."), { id: "admin-end" }));
      if (changed("players", [humans.map(n => [n.id, n.name]), powers, game.admin, can("kick")])) {
        playerPart.querySelector("#admin-people-note").textContent = game.admin ? "Tick what each player may do here as a helper. Removing someone keeps their nation as it is, offline, and they cannot come back into this world." : "Removing someone keeps their nation as it is, offline. They cannot come back into this world.";
        players.replaceChildren(...(humans.length ? humans.map(n => el("div", { class: "admin-row", "data-player": n.id },
          el("div", { class: "row spread" },
            el("span", {}, el("i", { class: "swatch", style: `background:${n.colour}` }), counts.set(n.id, el("span", { text: where(n) })).get(n.id)),
            can("kick") ? armed("Remove", `Remove ${n.name}?`, () => op({ op: "kick", nation: n.id }, r => `${r.name} was removed.`), { "data-kick": n.id }) : null),
          game.admin ? el("div", { class: "power-ticks" }, ...POWER_NAMES.map(([p, label]) => {
            const tick = el("input", { type: "checkbox", "data-power": p, checked: (powers[n.id] ?? []).includes(p), onchange: () => setPowers(n, POWER_NAMES.map(x => x[0]).filter(q => q === p ? tick.checked : (powers[n.id] ?? []).includes(q))) });
            return el("label", { class: "tick-label" }, tick, label);
          })) : null)) : [el("span", { class: "muted", text: "No other players here." })]));
      }
      if (changed("target", living.map(n => [n.id, n.bot]))) {
        const pick = target.value;
        target.replaceChildren(...living.sort((a, b) => (a.id === w.you ? -1 : b.id === w.you ? 1 : 0) || (a.bot - b.bot) || a.name.localeCompare(b.name)).map(n => el("option", { value: n.id, text: n.id === w.you ? `${n.name} (you)` : n.bot ? `${n.name} (bot)` : n.name })));
        if ([...target.options].some(o => o.value === pick)) target.value = pick;
        key.cheats = null;
      }
      const nid = Number(target.value), on = nid === w.you ? w.purse?.cheats ?? [] : cheatsOf[nid] ?? [];
      if (can("cheats") && changed("cheats", [nid, on])) cheats.replaceChildren(...CHEAT_NAMES.map(([c, label]) => {
        const tick = el("input", { type: "checkbox", "data-cheat": c, checked: on.includes(c), onchange: () => setCheat(nid, c, tick.checked) });
        return el("label", { class: "row" }, tick, label);
      }));
    },
  };
}
