import { el, armed } from "./dom.js";
import { api } from "../api.js";

const day = t => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "never");
const WHAT = {
  "delete world": d => `deleted world ${d.name ?? d.world}`,
  "rename world": d => `renamed a world ${d.name}`,
  "remove player": d => `removed ${d.name ?? "a player"} from a world`,
  "set password": d => `set a new password for ${d.name}`,
  "remove account": d => `removed the account ${d.name}`,
};

export function createAccounts(me, say) {
  const rows = el("div", { id: "accounts", class: "worlds" });
  const log = el("div", { id: "accounts-log", class: "admin-log" });
  const box = el("div", { id: "accounts-panel", class: "form", hidden: true }, el("h2", { text: "Accounts" }), rows, el("h2", { text: "Admin log" }), log);

  const refresh = async () => {
    const [list, entries] = await Promise.all([api("/api/admin/accounts"), api("/api/admin/log")]);
    if (list.error) return say(list.error);
    rows.replaceChildren(...list.map(a => {
      const pass = el("input", { type: "password", placeholder: "new password, 8 or more", autocomplete: "new-password", class: "small" });
      const set = el("button", { text: "Set", onclick: async () => {
        const r = await api(`/api/admin/accounts/${a.id}/password`, { password: pass.value });
        if (r.error) return say(r.error);
        pass.value = "";
        form.hidden = true;
        say(`New password set for ${r.name}. They are logged out everywhere and log in with it.`);
      } });
      const form = el("div", { class: "row", hidden: true }, pass, set);
      const self = a.id === me.id;
      return el("div", { class: "world", "data-account": a.name },
        el("div", {}, el("b", { text: a.name }), el("span", { class: "muted", text: ` ${a.admin ? "admin, " : ""}${a.worlds} world${a.worlds === 1 ? "" : "s"}, last login ${day(a.lastLogin)}` }), form),
        el("div", { class: "row" },
          el("button", { text: "New password", "data-password": a.name, onclick: () => { form.hidden = !form.hidden; if (!form.hidden) pass.focus(); } }),
          self || a.admin ? null : armed("Remove", `Remove ${a.name}?`, async () => {
            const r = await api(`/api/admin/accounts/${a.id}/remove`, {});
            if (r.error) return say(r.error);
            say(`Removed ${r.name}. Their nations stay in their worlds, offline.`);
            refresh();
          }, { "data-remove": a.name })));
    }));
    log.replaceChildren(...(Array.isArray(entries) && entries.length ? entries.map(e => el("p", {}, el("span", { class: "muted", text: `${new Date(e.t).toLocaleString()} ` }), `${e.who} ${(WHAT[e.op] ?? (() => e.op))(e.detail)}`)) : [el("p", { class: "muted", text: "Nothing yet." })]));
  };

  return {
    el: box,
    refresh,
    toggle() { box.hidden = !box.hidden; if (!box.hidden) refresh(); },
  };
}
