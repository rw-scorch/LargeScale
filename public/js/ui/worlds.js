import { el, armed } from "./dom.js";
import { api } from "../api.js";
import { createAccounts } from "./accounts.js";
import { createPasswordForm } from "./password.js";
import { phaseAt, countdown, EVENTS, EVENT_NAMES, SCHEDULE_RULES } from "../shared/schedule.js";
import { when, toInput, fromInput } from "./worldinfo.js";

const SOON = { startAt: "starts", peaceUntil: "peace ends", overtimeAt: "overtime", endAt: "ends" };
const MAPS = { europe: "Europe", earth: "Whole Earth", test: "Test map", area: "Map area" };
const LAST = "ls_last_world";
const planOf = s => {
  const p = phaseAt(s, Date.now());
  return p.next ? `, ${SOON[p.next.key]} in ${countdown(p.next.at - Date.now())} (${when(p.next.at)})` : p.over ? ", time is up" : p.overtime ? ", in overtime" : "";
};
const remember = id => { try { localStorage.setItem(LAST, id); } catch {} };
const lastWorld = () => { try { return localStorage.getItem(LAST); } catch { return null; } };

function scheduleFields(prefix, s = {}) {
  const inputs = Object.fromEntries(EVENTS.map(k => [k, el("input", { id: `${prefix}-${k}`, type: "datetime-local", value: toInput(s[k]) })]));
  const every = el("input", { id: `${prefix}-every`, class: "small", type: "number", min: SCHEDULE_RULES.shrinkMin / 60, max: SCHEDULE_RULES.shrinkMax / 60, step: 0.5, value: String((s.shrinkEvery ?? SCHEDULE_RULES.shrinkEvery) / 60) });
  const rows = [
    ...EVENTS.map(k => el("label", { class: "sched-row" }, el("span", { text: EVENT_NAMES[k] }), inputs[k])),
    el("label", { class: "sched-row" }, el("span", { text: "Overtime shrinks every" }), el("span", { class: "row" }, every, el("span", { class: "muted", text: "min" }))),
  ];
  const read = () => {
    const out = Object.fromEntries(EVENTS.map(k => [k, fromInput(inputs[k].value)]));
    out.shrinkEvery = Math.round(Number(every.value) * 60);
    return out;
  };
  const empty = () => EVENTS.every(k => !inputs[k].value);
  return { rows, read, empty };
}

export async function showWorlds(root, account, { onOpen, onLogout, live }) {
  const msg = el("p", { class: "msg" });
  const say = text => { msg.textContent = text; msg.scrollIntoView({ block: "nearest" }); };
  const accounts = account.admin ? createAccounts(account, say) : null;
  const password = createPasswordForm(say);
  const list = el("div", { class: "worlds" });
  const name = el("input", { id: "world-name", placeholder: "world name", maxlength: 40, value: "New world" });
  const map = el("select", { id: "world-map" },
    el("option", { value: "europe", text: "Europe (fine detail)" }), el("option", { value: "earth", text: "Whole Earth" }), el("option", { value: "test", text: "Small test map" }));
  const auto = el("input", { id: "bots-auto", type: "checkbox", checked: true });
  const bots = el("input", { id: "bots", type: "range", min: 0, max: 400, step: 5, value: 50, disabled: true });
  const botsLabel = el("span", { class: "muted", text: "scaled to land" });
  const syncBots = () => { bots.disabled = auto.checked; botsLabel.textContent = auto.checked ? "scaled to land" : `${bots.value} bots`; };
  auto.onchange = bots.oninput = syncBots;
  map.onchange = () => {
    bots.max = map.value === "europe" ? 100 : 400;
    if (Number(bots.value) > Number(bots.max)) bots.value = bots.max;
    syncBots();
  };
  map.onchange();
  const plan = scheduleFields("new-sched");
  let shown = [];

  const watch = w => {
    live?.watch(w.id, w.name);
    for (const c of list.querySelectorAll(".world")) c.classList.toggle("on", c.dataset.id === w.id);
  };

  const card = w => {
    const edit = account.admin ? scheduleFields(`sched-${w.id}`, w.schedule ?? {}) : null;
    const note = el("span", { class: "sched-note" });
    const form = edit ? el("div", { class: "sched-form", hidden: true },
      ...edit.rows,
      el("div", { class: "row" }, el("button", { class: "primary", "data-sched-save": w.id, text: "Save schedule", onclick: async e => {
        e.stopPropagation();
        const r = await api(`/api/admin/worlds/${w.id}/schedule`, { schedule: edit.read() });
        if (r.error) return (note.textContent = r.error);
        say(`Saved the schedule for ${w.name}. Everyone in it sees the new times.`);
        await refresh();
      } }), el("button", { class: "ghost", text: "Cancel", onclick: e => { e.stopPropagation(); form.hidden = true; } })),
      note) : null;
    const tags = [MAPS[w.map] ?? null, w.host ? "yours" : null].filter(Boolean);
    const c = el("div", { class: `world${live?.watching === w.id ? " on" : ""}`, "data-id": w.id, title: "Watch this world", onclick: () => watch(w) },
      el("div", { class: "world-main" },
        el("div", { class: "row" }, el("b", { class: "world-name", text: w.name }), ...tags.map(t => el("span", { class: "tag", text: t }))),
        el("span", { class: "muted", text: ` ${w.players} player${w.players === 1 ? "" : "s"}${w.host ? ", yours" : ""}${w.removed ? ", the host removed you" : ""}${planOf(w.schedule)}` })),
      el("div", { class: "row world-actions" },
        edit ? el("button", { class: "ghost", "data-schedule": w.id, text: "Schedule", onclick: e => { e.stopPropagation(); form.hidden = !form.hidden; } }) : null,
        account.admin ? armed("Delete", "Really delete?", () => remove(w), { "data-delete": w.id }) : null,
        w.removed ? null : el("button", { class: "primary", "data-world": w.id, onclick: e => { e.stopPropagation(); open(w); }, text: w.member ? "Open" : "Join" })),
      form);
    form?.addEventListener("click", e => e.stopPropagation());
    return c;
  };

  const refresh = async () => {
    const worlds = await api("/api/worlds");
    if (worlds.error) return (msg.textContent = worlds.error);
    shown = worlds;
    list.replaceChildren(...(worlds.length ? worlds.map(card) : [el("p", { class: "muted", text: account.admin ? "No worlds yet. Create one below." : "No worlds yet. The host creates them." })]));
    const pick = worlds.find(w => w.id === live?.watching) ?? worlds.find(w => w.id === lastWorld() && !w.removed) ?? worlds.find(w => !w.removed);
    if (pick) watch(pick);
    else live?.scenery();
  };
  const remove = async w => {
    const r = await api(`/api/admin/worlds/${w.id}/delete`, {});
    if (r.error) return say(r.error);
    say(`Deleted ${w.name}.`);
    await refresh();
    accounts?.refresh();
  };
  const open = async w => {
    if (!w.member) {
      const r = await api(`/api/worlds/${w.id}/join`, {});
      if (r.error) return (msg.textContent = r.error);
    }
    remember(w.id);
    onOpen(w.id, w.name);
  };
  const create = async () => {
    msg.textContent = "Creating the world...";
    const config = { map: map.value, ...(auto.checked ? {} : { bots: Number(bots.value) }), ...(plan.empty() ? {} : { schedule: plan.read() }) };
    const r = await api("/api/worlds", { name: name.value.trim() || "New world", config });
    if (r.error) return (msg.textContent = r.error);
    msg.textContent = "";
    remember(r.id);
    onOpen(r.id, name.value.trim() || "New world");
  };

  root.replaceChildren(
    el("div", { class: "account-bar" },
      el("span", {}, el("span", { class: "muted", text: "Ruling as " }), el("b", { text: account.name })),
      el("span", { class: "row wrap" },
        accounts ? el("button", { id: "open-accounts", class: "ghost", onclick: () => accounts.toggle(), text: "Accounts" }) : null,
        el("button", { id: "open-password", class: "ghost", onclick: () => password.toggle(), text: "Password" }),
        el("button", { class: "ghost", onclick: onLogout, text: "Log out" }))),
    password.el,
    accounts?.el ?? null,
    el("h2", { text: "Worlds" }),
    el("p", { class: "hint muted", text: "Pick a world to watch it live." }),
    list,
    ...(account.admin ? [
      el("h2", { text: "New world" }),
      el("div", { class: "form new-world" },
        name,
        el("label", { class: "row" }, "Map ", map),
        el("label", { class: "row" }, auto, " Bots scaled to land"),
        el("label", { class: "row" }, "Bots ", bots, " ", botsLabel),
        el("details", { id: "new-schedule" }, el("summary", { text: "Schedule (optional)" }),
          el("p", { class: "muted", text: "Times are in your own time zone. Leave them empty and set them later with Schedule." }), ...plan.rows),
        el("button", { id: "world-create", class: "primary", onclick: create, text: "Create and open" })),
    ] : [el("p", { id: "host-only", class: "muted", text: "Only the host can create worlds. Join one above." })]),
    msg);
  await refresh();
  return { refresh, get worlds() { return shown; } };
}
