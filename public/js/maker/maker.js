import { TERRAIN, TID } from "../shared/terrain.js";
import { makeTestMap } from "../shared/testmap.js";
import { cropRect, cropLayer } from "../shared/maps.js";
import { gunzip } from "../shared/codec.js";
import { writeMapFile, readMapFile, checkMap, landCount, MAP_EXT } from "../shared/mapfile.js";
import { Edit, paintDisc, paintLine, fill, undo, redo } from "../shared/mapedit.js";
import { session } from "../api.js";
import { el } from "../ui/dom.js";
import { MakerView } from "./view.js";

const GROUPS = [
  ["Water", ["deep_ocean", "ocean", "shallows", "lake", "coral_reef", "sea_ice", "river"]],
  ["Open land", ["plains", "grassland", "meadow", "steppe", "savanna", "farmland", "cleared", "dry_earth", "scrub", "beach"]],
  ["Dry", ["desert", "dunes", "rocky_desert", "salt_flat", "badlands", "canyon"]],
  ["Forest", ["forest", "pine_forest", "jungle", "thicket", "bamboo"]],
  ["Wet", ["swamp", "marsh", "bog", "mangrove", "mudflat"]],
  ["Hills and mountains", ["hills", "highlands", "highland_pass", "escarpment", "boulders", "scree", "mountain", "high_mountain", "snow_peak", "cliff", "volcano", "lava"]],
  ["Cold", ["tundra", "snow", "glacier", "ice_field"]],
  ["Ruin and town", ["urban", "rubble", "scorched", "crater"]],
];
const DRAFT = "ls_map_draft";
const $ = id => document.getElementById(id);
const nice = s => s.replace(/_/g, " ");

const state = { tool: "brush", t: TID.grassland, steps: [], undone: [], published: null, limits: null, stroke: null };
let view, map;

const say = text => { $("msg").textContent = text; };
const authed = () => !!session.token;

async function request(path, opts = {}) {
  try {
    const r = await fetch(path, { ...opts, headers: { authorization: `Bearer ${session.token}`, ...(opts.headers ?? {}) } });
    return r;
  } catch {
    return null;
  }
}

function only() {
  const v = $("only").value;
  return v === "land" ? t => TERRAIN[t].land : v === "water" ? t => !TERRAIN[t].land : null;
}

function stats() {
  const land = landCount(map.terrain), min = state.limits?.minLand ?? 0;
  $("s-size").replaceChildren("Size ", el("b", { text: `${map.w} by ${map.h}` }));
  $("s-land").replaceChildren("Land ", el("b", { text: `${land.toLocaleString()} plots (${Math.round((100 * land) / map.terrain.length)}%)` }), land < min ? ` - needs ${min.toLocaleString()} to play` : "");
  $("undo").disabled = !state.steps.length;
  $("redo").disabled = !state.undone.length;
}

function setMap(m, { published = null, fresh = true } = {}) {
  map = m;
  state.published = published;
  if (fresh) { state.steps = []; state.undone = []; }
  $("map-name").value = m.name;
  view.load(m);
  stats();
  saveDraft();
}

function pickTool(tool) {
  state.tool = tool;
  for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("on", b.dataset.tool === tool);
  $("canvas").style.cursor = tool === "pan" ? "grab" : "crosshair";
}

function pickTerrain(t) {
  state.t = t;
  for (const b of document.querySelectorAll("[data-t]")) b.classList.toggle("on", Number(b.dataset.t) === t);
}

function buildPalette() {
  const used = new Set(GROUPS.flatMap(g => g[1]));
  const rest = TERRAIN.map(t => t.name).filter(n => !used.has(n));
  const groups = rest.length ? [...GROUPS, ["Other", rest]] : GROUPS;
  $("palette").replaceChildren(...groups.flatMap(([title, names]) => [
    el("h3", { text: title }),
    el("div", { class: "swatches" }, ...names.map(n => el("button", { class: "swatch", "data-t": TID[n], title: nice(n), onclick: () => pickTerrain(TID[n]) }, el("i", { style: `background:${view.swatch(TID[n])}` }), nice(n)))),
  ]));
  pickTerrain(state.t);
}

function commit(edit) {
  if (!edit.size) return;
  state.steps.push(edit.done(state.t));
  if (state.steps.length > 200) state.steps.shift();
  state.undone = [];
  stats();
  saveDraft();
}

function step(back) {
  const from = back ? state.steps : state.undone, to = back ? state.undone : state.steps, s = from.pop();
  if (!s) return;
  view.refreshPlots(back ? undo(map.terrain, s) : redo(map.terrain, s));
  to.push(s);
  stats();
  saveDraft();
}

let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    if (map.terrain.length > 1_500_000) return;
    try {
      const bytes = await writeMapFile({ ...map, name: map.name || "Draft" });
      let s = "";
      for (let k = 0; k < bytes.length; k += 32768) s += String.fromCharCode(...bytes.subarray(k, k + 32768));
      localStorage.setItem(DRAFT, JSON.stringify({ file: btoa(s), published: state.published }));
    } catch {}
  }, 800);
}

async function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null");
    if (!d) return false;
    const r = await readMapFile(Uint8Array.from(atob(d.file), c => c.charCodeAt(0)));
    if (r.error) return false;
    setMap(r.map, { published: d.published });
    say("Picked up your last map where you left it.");
    return true;
  } catch {
    return false;
  }
}

function wireCanvas() {
  const canvas = $("canvas"), pointers = new Map();
  let panning = null, pinch = null, space = false;
  const local = e => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const inside = p => p.x >= 0 && p.y >= 0 && p.x < map.w && p.y < map.h;

  const startStroke = p => {
    if (state.tool === "pick") {
      if (inside(p)) { pickTerrain(map.terrain[p.y * map.w + p.x]); say(`Picked ${nice(TERRAIN[state.t].name)}.`); }
      return;
    }
    if (!inside(p)) return;
    const edit = new Edit(map.terrain);
    if (state.tool === "fill") {
      fill(edit, map.w, map.h, p.x, p.y, state.t);
      view.refreshPlots(edit.idx);
      commit(edit);
      return;
    }
    paintDisc(edit, map.w, map.h, p.x, p.y, view.radius, state.t, only());
    view.refreshPlots(edit.idx);
    state.stroke = { edit, last: p, seen: edit.size };
  };

  const moveStroke = p => {
    const s = state.stroke;
    if (!s || (p.x === s.last.x && p.y === s.last.y)) return;
    paintLine(s.edit, map.w, map.h, s.last.x, s.last.y, p.x, p.y, view.radius, state.t, only());
    view.refreshPlots(s.edit.idx.slice(s.seen));
    s.seen = s.edit.size;
    s.last = p;
  };

  const endStroke = () => {
    if (!state.stroke) return;
    commit(state.stroke.edit);
    state.stroke = null;
  };

  const cancelStroke = () => {
    if (!state.stroke) return;
    view.refreshPlots(undo(map.terrain, state.stroke.edit.done(state.t)));
    state.stroke = null;
  };

  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      cancelStroke();
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
      return;
    }
    const { sx, sy } = local(e);
    if (e.button === 1 || e.button === 2 || space || state.tool === "pan") {
      panning = { sx, sy };
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button === 0) startStroke(view.toPlot(sx, sy));
  });
  canvas.addEventListener("pointermove", e => {
    const at = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, at);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      view.pan(mx - pinch.mx, my - pinch.my);
      if (pinch.d > 0) view.zoomAt(mx, my, d / pinch.d);
      pinch = { d, mx, my };
      return;
    }
    const p = view.toPlot(at.sx, at.sy);
    view.cursor = inside(p) && state.tool === "brush" ? p : null;
    $("s-at").replaceChildren(...(inside(p) ? ["At ", el("b", { text: `${p.x}, ${p.y}` }), ` ${nice(TERRAIN[map.terrain[p.y * map.w + p.x]].name)}`] : []));
    if (panning) {
      view.pan(at.sx - panning.sx, at.sy - panning.sy);
      panning = at;
      return;
    }
    if (state.stroke) moveStroke(p);
    else view.draw();
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (panning && !pointers.size) { panning = null; canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair"; }
    endStroke();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", () => { view.cursor = null; view.draw(); });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const { sx, sy } = local(e);
    view.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  addEventListener("keydown", e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); return step(!e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); return step(false); }
    if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); return saveFile(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === " ") { space = true; canvas.style.cursor = "grab"; e.preventDefault(); }
    else if (k === "b") pickTool("brush");
    else if (k === "f") pickTool("fill");
    else if (k === "i") pickTool("pick");
    else if (k === "h") pickTool("pan");
    else if (k === "[" || k === "]") setSize(view.radius + (k === "]" ? 1 : -1));
    else if (k === "0") view.fit();
    else if (k === "+" || k === "=") view.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25);
    else if (k === "-") view.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 0.8);
  });
  addEventListener("keyup", e => { if (e.key === " ") { space = false; canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair"; } });
  addEventListener("resize", () => view.draw());
  canvas.addEventListener("dragover", e => e.preventDefault());
  canvas.addEventListener("drop", e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) openFile(f);
  });
}

function setSize(r) {
  const s = $("size");
  view.radius = Math.max(Number(s.min), Math.min(Number(s.max), r));
  s.value = String(view.radius);
  $("size-text").textContent = `${view.radius * 2 - 1} plots`;
  view.draw();
}

async function earthPart(box, fine) {
  const dir = fine ? "map/fine" : "map";
  const meta = await (await fetch(`/${dir}/meta.json`)).json();
  const rect = cropRect(meta, box);
  if (!rect) return { error: "that box is outside the map" };
  const side = state.limits?.maxSide ?? Infinity, least = state.limits?.minSide ?? 1;
  if (rect.w > side || rect.h > side) return { error: `that box is ${rect.w} by ${rect.h} plots; the most is ${side} a side. Make it smaller${fine ? " or turn off fine detail" : ""}.` };
  if (rect.w < least || rect.h < least) return { error: `that box is ${rect.w} by ${rect.h} plots; the least is ${least} a side.` };
  say("Fetching the Earth map...");
  const full = await gunzip(new Uint8Array(await (await fetch(`/${dir}/terrain.bin.gz`)).arrayBuffer()));
  const span = meta.north - meta.south;
  return { w: rect.w, h: rect.h, terrain: cropLayer(full, meta.w, rect), north: +(meta.north - (rect.y * span) / meta.h).toFixed(3), south: +(meta.north - ((rect.y + rect.h) * span) / meta.h).toFixed(3) };
}

function wireNew() {
  const dlg = $("new-dialog"), note = $("new-note");
  $("new").onclick = () => { note.textContent = ""; dlg.showModal(); };
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "ok") return;
    const start = new FormData($("new-form")).get("start");
    const w = Math.round(Number($("new-w").value)), h = Math.round(Number($("new-h").value));
    let made;
    if (start === "earth") {
      made = await earthPart({ west: Number($("new-west").value), east: Number($("new-east").value), north: Number($("new-north").value), south: Number($("new-south").value) }, $("new-fine").checked);
    } else {
      const bad = checkMap({ name: "x", w, h, terrain: new Uint8Array(w * h).fill(TID.grassland) }, { ...state.limits, minLand: 0 });
      made = bad ? { error: bad } : { w, h, terrain: start === "random" ? makeTestMap(w, h, Math.round(Number($("new-seed").value)) || 1).terrain : new Uint8Array(w * h).fill(TID.deep_ocean) };
    }
    if (made.error) { note.textContent = made.error; return dlg.showModal(); }
    setMap({ name: $("map-name").value.trim() || "New map", ...made });
    say(`A new ${made.w} by ${made.h} map.`);
  });
}

async function saveFile() {
  const name = $("map-name").value.trim() || "map";
  map.name = name;
  const bytes = await writeMapFile(map);
  const a = el("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), download: name.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-") + MAP_EXT });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  say(`Saved ${name}${MAP_EXT}, ${(bytes.length / 1024).toFixed(0)} KB. Send it to a friend, or open it here later.`);
}

async function openFile(file) {
  const r = await readMapFile(new Uint8Array(await file.arrayBuffer()), { ...state.limits, minLand: 0 });
  if (r.error) return say(r.error);
  setMap(r.map);
  say(`Opened ${r.map.name}.`);
}

async function publish() {
  if (!authed()) return say("Log in to the game first; then come back here to publish.");
  map.name = $("map-name").value.trim();
  const bad = checkMap(map, state.limits ?? {});
  if (bad) return say(bad);
  say("Publishing...");
  const bytes = await writeMapFile(map);
  const r = await request(state.published ? `/api/maps/${state.published}` : "/api/maps", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: bytes });
  const out = r ? await r.json().catch(() => ({ error: `server error ${r.status}` })) : { error: "cannot reach the server" };
  if (out.error) return say(out.error);
  state.published = out.id;
  saveDraft();
  say(`Published ${out.name}. The host can pick it when making a world.`);
}

async function library() {
  const list = $("lib-list");
  if (!authed()) list.replaceChildren(el("p", { class: "muted", text: "Log in to the game to see the saved maps." }));
  else {
    const r = await request("/api/maps"), out = r ? await r.json().catch(() => ({})) : {};
    const maps = out.maps ?? [];
    list.replaceChildren(...(maps.length ? maps.map(m => el("div", { class: "map", "data-map": m.id },
      el("span", {}, el("b", { text: m.name }), el("span", { class: "muted", text: ` ${m.w} by ${m.h}, ${Math.round((100 * m.land) / (m.w * m.h))}% land, by ${m.author ?? "someone gone"}` })),
      el("span", { class: "row" },
        el("button", { text: "Open", onclick: async () => {
          const f = await request(`/api/maps/${m.id}/file`);
          if (!f?.ok) return say("Could not fetch that map.");
          const got = await readMapFile(new Uint8Array(await f.arrayBuffer()));
          if (got.error) return say(got.error);
          setMap(got.map, { published: m.mine ? m.id : null });
          $("lib-dialog").close();
          say(m.mine ? `Opened ${m.name}. Publish again to update it.` : `Opened a copy of ${m.name}. Publishing saves it as your own.`);
        } }),
        m.mine || out.admin ? el("button", { class: "danger", text: "Delete", onclick: async () => {
          if (!confirm(`Delete ${m.name}? Worlds already made from it keep going.`)) return;
          const d = await request(`/api/maps/${m.id}/delete`, { method: "POST" });
          const res = d ? await d.json().catch(() => ({})) : {};
          if (res.error) return say(res.error);
          if (state.published === m.id) state.published = null;
          library();
        } }) : null))) : [el("p", { class: "muted", text: "No saved maps yet. Publish one." })]));
  }
  if (!$("lib-dialog").open) $("lib-dialog").showModal();
}

async function main() {
  const pal = await (await fetch("/assets/terrain/palettes.json")).json();
  view = new MakerView($("canvas"), pal.seasons.summer ?? pal.seasons.spring);
  try { state.limits = await (await fetch("/api/maps/limits")).json(); } catch {}
  buildPalette();
  pickTool("brush");
  setSize(6);
  wireCanvas();
  wireNew();
  $("size").oninput = e => setSize(Number(e.target.value));
  for (const b of document.querySelectorAll("[data-tool]")) b.onclick = () => pickTool(b.dataset.tool);
  $("undo").onclick = () => step(true);
  $("redo").onclick = () => step(false);
  $("fit").onclick = () => view.fit();
  $("save").onclick = saveFile;
  $("open").onclick = () => $("file").click();
  $("file").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) openFile(f); };
  $("publish").onclick = publish;
  $("library").onclick = library;
  $("back").onclick = () => location.assign("/");
  $("map-name").oninput = e => { map.name = e.target.value; saveDraft(); };
  if (!(await loadDraft())) setMap({ name: "New map", ...(({ w, h }) => ({ w, h, terrain: makeTestMap(w, h, 7).terrain }))({ w: 600, h: 400 }) });
  window.maker = { get map() { return map; }, state, view };
}

main();
