import { el } from "./dom.js";
import { api } from "../api.js";

export async function showWorlds(root, account, { onOpen, onLogout }) {
  const msg = el("p", { class: "msg" });
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

  const refresh = async () => {
    const worlds = await api("/api/worlds");
    if (worlds.error) return (msg.textContent = worlds.error);
    list.replaceChildren(...(worlds.length ? worlds.map(w => el("div", { class: "world" },
      el("div", {}, el("b", { text: w.name }), el("span", { class: "muted", text: ` ${w.players} player${w.players === 1 ? "" : "s"}${w.host ? ", yours" : ""}` })),
      el("button", { class: "primary", "data-world": w.id, onclick: () => open(w), text: w.member ? "Open" : "Join" }))) : [el("p", { class: "muted", text: account.admin ? "No worlds yet. Create one below." : "No worlds yet. The host creates them." })]));
  };
  const open = async w => {
    if (!w.member) {
      const r = await api(`/api/worlds/${w.id}/join`, {});
      if (r.error) return (msg.textContent = r.error);
    }
    onOpen(w.id, w.name);
  };
  const create = async () => {
    msg.textContent = "Creating the world...";
    const config = { map: map.value, ...(auto.checked ? {} : { bots: Number(bots.value) }) };
    const r = await api("/api/worlds", { name: name.value.trim() || "New world", config });
    if (r.error) return (msg.textContent = r.error);
    msg.textContent = "";
    onOpen(r.id, name.value.trim() || "New world");
  };

  root.replaceChildren(el("div", { class: "card wide" },
    el("div", { class: "row spread" }, el("h1", { text: "Worlds" }), el("span", { class: "muted" }, `${account.name} `, el("button", { onclick: onLogout, text: "Log out" }))),
    list,
    ...(account.admin ? [
      el("h2", { text: "New world" }),
      el("div", { class: "form" },
        name,
        el("label", {}, "Map ", map),
        el("label", {}, auto, " Bots scaled to land"),
        el("label", {}, "Bots ", bots, " ", botsLabel),
        el("button", { id: "world-create", class: "primary", onclick: create, text: "Create and open" })),
    ] : [el("p", { id: "host-only", class: "muted", text: "Only the host can create worlds. Join one above." })]),
    msg));
  await refresh();
}
