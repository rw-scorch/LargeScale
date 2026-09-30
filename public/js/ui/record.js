import { el } from "./dom.js";
import { api } from "../api.js";
import { decodeRuns } from "../shared/codec.js";
import { isLand } from "../shared/terrain.js";

const LINES = {
  war_declared: (e, n) => `${n(e.a)} declared war on ${n(e.b)}`,
  war_started: (e, n) => `${n(e.a)} and ${n(e.b)} went to war`,
  peace_signed: (e, n) => `${n(e.a)} and ${n(e.b)} made peace`,
  alliance_signed: (e, n) => `${n(e.a)} and ${n(e.b)} became allies`,
  alliance_left: (e, n) => `${n(e.a)} left their alliance with ${n(e.b)}`,
  non_aggression_signed: (e, n) => `${n(e.a)} and ${n(e.b)} signed a treaty`,
  treaty_broken: (e, n) => `${n(e.a)} broke their treaty with ${n(e.b)}`,
  embargo: (e, n) => `${n(e.a)} ${e.on ? "put an embargo on" : "lifted their embargo on"} ${n(e.b)}`,
  faction_created: (e, n) => `${n(e.a)} founded ${e.name}`,
  faction_joined: (e, n) => `${n(e.a)} joined ${e.name}`,
  faction_left: (e, n) => (e.by !== undefined ? `${n(e.by)} expelled ${n(e.a)} from ${e.name}` : `${n(e.a)} left ${e.name}`),
  faction_renamed: (e, n) => `${n(e.a)} renamed their faction ${e.name}`,
  surrendered: (e, n) => `${n(e.a)} surrendered to ${n(e.b)}`,
  vassal_freed: (e, n) => `${n(e.a)} was freed by ${n(e.b)}`,
  commander_joined: (e, n) => `${n(e.a)} began commanding ${n(e.b)}'s nation`,
  commander_left: (e, n) => `${n(e.a)} stopped commanding ${n(e.b)}'s nation`,
  eliminated: (e, n) => `${n(e.nation)} was eliminated`,
  era_up: (e, n) => `${n(e.nation)} entered a new era`,
  wonder_built: (e, n) => `${n(e.nation)} finished a wonder`,
  nuke_launched: (e, n) => `${n(e.nation)} launched a nuclear warhead at ${n(e.toward)}`,
  nuke_detonated: (e, n) => `A warhead of ${n(e.by)} struck ${n(e.nation)}`,
  capital_moved: (e, n) => `${n(e.nation)} lost its capital`,
  victory: e => (e.name ? `${e.name} won${e.by === "time" ? " with the most land at the end" : ""}` : "Nobody was left standing"),
};

const hexRgb = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c ?? ""); const v = m ? parseInt(m[1], 16) : 0x888888; return [v >> 16, (v >> 8) & 255, v & 255]; };

export function createRecordPanel(root, game) {
  const title = el("b", { class: "title", text: "The record" });
  const note = el("p", { class: "muted" });
  const canvas = el("canvas", { id: "record-map", class: "record-map" });
  const slider = el("input", { id: "record-slider", type: "range", min: 0, max: 0, step: 1, value: 0 });
  const when = el("span", { id: "record-when", class: "muted" });
  const legend = el("div", { id: "record-legend", class: "row wrap" });
  const list = el("div", { id: "record-events", class: "record-events" });
  const box = el("section", { id: "record-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => api_.show(false) })),
    note, canvas, el("div", { class: "row" }, slider, when), legend, el("b", { text: "What happened" }), list);
  root.append(box);
  let data = null, loaded = new Map(), shown = -1;

  const gameTime = g => {
    const day = (game.world?.seasonRules?.dayLengthMinutes ?? 60) * 60;
    const m = Math.floor(((g % day) / day) * 1440);
    return `day ${Math.floor(g / day) + 1}, ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  async function frame(k) {
    const f = data?.frames[k];
    if (!f) return;
    shown = k;
    when.textContent = `${k + 1} of ${data.frames.length}: ${gameTime(f.g)}, ${new Date(f.t).toLocaleString()}`;
    let pic = loaded.get(f.id);
    if (!pic) {
      pic = await api(`/api/worlds/${game.worldId}/history/${f.id}`);
      if (pic.error) { note.textContent = pic.error; return; }
      loaded.set(f.id, pic);
    }
    if (shown !== k) return;
    const owner = new Uint16Array(pic.w * pic.h), bin = atob(pic.runs), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decodeRuns(bytes, owner);
    const colours = new Map(pic.names.map(([id, , c]) => [id, hexRgb(c)])), terrain = game.world?.terrain, W = game.world?.w, kx = W ? W / pic.w : 1;
    canvas.width = pic.w;
    canvas.height = pic.h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(pic.w, pic.h);
    for (let i = 0; i < owner.length; i++) {
      const x = i % pic.w, y = (i / pic.w) | 0, t = terrain ? terrain[Math.min(terrain.length - 1, Math.floor(y * kx) * W + Math.floor(x * kx))] : 7;
      const rgb = owner[i] ? colours.get(owner[i]) ?? [136, 136, 136] : isLand(t) ? [58, 74, 52] : [22, 42, 68];
      img.data.set([...rgb, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    const counts = new Map();
    for (const v of owner) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    const top = pic.names.filter(([id, , , bot]) => !bot && counts.has(id)).sort((a, b) => counts.get(b[0]) - counts.get(a[0])).slice(0, 8);
    legend.replaceChildren(...top.map(([id, name, c]) => el("span", { class: "chip" }, el("i", { class: "swatch", style: `background:${c}` }), ` ${name}`)));
  }

  const api_ = {
    get open() { return !box.hidden; },
    async show(on) {
      box.hidden = !on;
      if (!on) return;
      note.textContent = "Loading the record...";
      data = await api(`/api/worlds/${game.worldId}/history`);
      if (data.error) { note.textContent = data.error; list.replaceChildren(); return; }
      const name = id => data.nations.find(n => n.id === id)?.name ?? "someone";
      title.textContent = `The record of ${data.name ?? "this world"}`;
      note.textContent = data.frames.length ? `A picture of who held what was kept every game hour: ${data.frames.length} in all. Drag the slider to watch the map change.` : "No pictures were kept.";
      slider.max = String(Math.max(0, data.frames.length - 1));
      slider.value = slider.max;
      slider.oninput = () => frame(Number(slider.value));
      list.replaceChildren(...(data.events.length ? data.events.map(e => el("p", { class: "record-line" }, el("span", { class: "muted", text: `${gameTime(e.g)}: ` }), (LINES[e.type] ?? (x => x.type))(e, name))) : [el("p", { class: "muted", text: "Nothing was recorded." })]));
      list.scrollTop = list.scrollHeight;
      if (data.frames.length) frame(data.frames.length - 1);
    },
    update() {},
  };
  return api_;
}
