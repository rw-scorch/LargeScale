import { el } from "./dom.js";
import { ClientWorld } from "../shared/client.js";
import { PROTOCOL } from "../shared/protocol.js";
import { gunzip } from "../shared/codec.js";
import { isLand } from "../shared/terrain.js";
import { MapRenderer } from "../render/renderer.js";
import { loadAssets, terrainGz } from "../assets.js";
import { session } from "../api.js";

const MOVE = 7, HOLD = 6, NAP = 20 * 60 * 1000;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createLiveView(host) {
  const canvas = el("canvas", { class: "live-map" });
  const title = el("b", { class: "live-name" });
  const detail = el("span", { class: "live-detail" });
  const badge = el("span", { class: "live-badge", hidden: true }, el("i", {}), "Live");
  const caption = el("div", { class: "live-caption", hidden: true }, el("div", { class: "row" }, badge, title), detail);
  const nap = el("button", { class: "live-nap", hidden: true, text: "Paused so the world can rest. Watch again", onclick: () => wake() });
  host.append(canvas, caption, nap);
  let ws = null, world = null, view = null, raf = 0, last = 0, run = 0, watching = null, tour = null, retry = 0, napTimer = 0;
  const wake = () => { nap.hidden = true; if (watching) { const w = watching; watching = null; watch(w.id, w.name); } };
  const rest = () => { if (!ws) return; close(); nap.hidden = false; };
  const seen = () => {
    if (document.hidden) { clearTimeout(napTimer); if (ws) { close(); nap.hidden = false; } }
    else if (!nap.hidden && watching) wake();
  };
  document.addEventListener("visibilitychange", seen);

  const size = () => { if (view) view.resize(host.clientWidth, host.clientHeight, devicePixelRatio); };
  addEventListener("resize", size);

  const camAt = (plot, css) => ({ x: (plot % world.w) + 0.5, y: ((plot / world.w) | 0) + 0.5, scale: css * view.ratio });

  function targets() {
    const w = world, out = [];
    if (watching) {
      const nations = [...w.nations.values()].filter(n => n.alive && n.spawned && n.capital != null);
      for (const n of nations.filter(n => !n.bot)) out.push([n.capital, 20], [n.capital, 7]);
      for (const n of nations.filter(n => n.bot).sort(() => Math.random() - 0.5).slice(0, 4)) out.push([n.capital, 6]);
      for (const s of [...w.stacks.values()].sort(() => Math.random() - 0.5).slice(0, 3)) out.push([s.pos, 14]);
      for (const c of [...w.convoys.values()].slice(0, 2)) out.push([c.pos, 22]);
    }
    for (let tries = 0; out.length < 6 && tries < 4000; tries++) {
      const i = Math.floor(Math.random() * w.w * w.h);
      if (isLand(w.terrain[i]) && isLand(w.terrain[i + 3] ?? 0) && isLand(w.terrain[i - 3 * w.w] ?? 0)) out.push([i, 3 + Math.random() * 5]);
    }
    return out.sort(() => Math.random() - 0.5);
  }

  function step(dt) {
    if (still()) return;
    const c = view.cam;
    if (!tour || !tour.list.length) tour = { list: targets(), t: 0, from: { ...c }, to: null };
    if (!tour.to) {
      const next = tour.list.shift();
      if (!next) { tour = null; return; }
      tour.to = camAt(...next);
      tour.from = { ...c };
      tour.t = 0;
      tour.drift = (Math.random() - 0.5) * 0.6;
    }
    tour.t += dt;
    const { from, to } = tour, k = ease(Math.min(1, tour.t / MOVE));
    c.x = from.x + (to.x - from.x) * k + (tour.t > MOVE ? tour.drift * (tour.t - MOVE) : 0);
    c.y = from.y + (to.y - from.y) * k;
    const lift = Math.sin(Math.PI * Math.min(1, tour.t / MOVE)) * 0.6;
    c.scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * k - lift);
    cover(c);
    if (tour.t > MOVE + HOLD) tour.to = null;
  }

  function cover(c) {
    const W = view.canvas.width, H = view.canvas.height;
    c.scale = Math.max(c.scale, W / world.w, H / world.h);
    const hw = W / (2 * c.scale), hh = H / (2 * c.scale);
    c.x = Math.min(world.w - hw, Math.max(hw, c.x));
    c.y = Math.min(world.h - hh, Math.max(hh, c.y));
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (!view) return;
    step(dt);
    view.render(dt);
  }

  function describe() {
    if (!world || !watching) { caption.hidden = true; return; }
    const players = [...world.nations.values()].filter(n => !n.bot && n.spawned);
    const online = players.filter(n => world.online.has(n.id)).length;
    title.textContent = watching.name;
    badge.hidden = !!world.frozen;
    detail.textContent = world.victory ? "This world has been won." : world.frozen ? "This world has ended." : `${players.length ? `${players.length} ${players.length === 1 ? "ruler" : "rulers"}` : "No rulers yet"}${online ? `, ${online} playing now` : ""}. ${[...world.nations.values()].filter(n => n.bot && n.alive).length} bot nations.`;
    caption.hidden = false;
  }

  async function show(w) {
    const art = await loadAssets();
    if (w !== world) return;
    view = new MapRenderer(canvas, art.atlas, w, art.palettes);
    w.takeChanged?.();
    view.showNames = true;
    size();
    view.fitWorld();
    cover(view.cam);
    tour = null;
    describe();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function close() {
    run++;
    if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
    ws = null;
  }

  function onFrame(data) {
    const r = world.frame(data);
    if (!r || !view) return;
    if (r.layer === "road") return r.all ? view.indexRoads() : view.updateRoads(r.plots);
    if (r.layer === "zone" || r.layer === "deposits") return;
    if (r.layer === "terrain" && r.plots) return view.updateTerrain(r.plots);
    if (r.layer === "buildings") { world.takeChanged(); view.indexBuildings(); }
    else if (r.layer === "terrain") view.rebuildTerrain();
    else if (r.all) view.rebuildTerritory();
    else view.updatePlots(r.plots);
  }

  function watch(id, name) {
    if (watching?.id === id && ws) return;
    close();
    watching = { id, name };
    nap.hidden = true;
    clearTimeout(napTimer);
    napTimer = setTimeout(rest, NAP);
    const mine = ++run, proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = (ws = new WebSocket(`${proto}://${location.host}/ws/${id}?token=${encodeURIComponent(session.token)}&v=${PROTOCOL}&watch=1`));
    sock.binaryType = "arraybuffer";
    sock.onmessage = async e => {
      if (mine !== run) return;
      if (typeof e.data !== "string") { if (world) onFrame(e.data); return; }
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "hello") {
        const w = new ClientWorld(m);
        world = w;
        try { await w.loadBase(() => terrainGz(m.map.dir ?? "map", m.map.baseHash ?? "test")); } catch { return; }
        if (mine === run) await show(w);
        return;
      }
      if (!world) return;
      world.message(m);
      if (view && world.changed.length) view.updateBuildings(world.takeChanged());
      if (m.t === "state" && view) view.colours.clear();
      if (m.t === "state" || m.t === "presence") describe();
    };
    sock.onclose = () => {
      if (mine !== run || retry > 3) return;
      retry++;
      setTimeout(() => { if (mine === run && watching?.id === id) { ws = null; watch(id, name); } }, 3000);
    };
    sock.onopen = () => { retry = 0; };
  }

  async function scenery() {
    close();
    watching = null;
    nap.hidden = true;
    clearTimeout(napTimer);
    const mine = run;
    try {
      const meta = await (await fetch("/map/meta.json")).json();
      const w = new ClientWorld({ w: meta.w, h: meta.h, you: null, map: { kind: "earth", dir: "map" }, nations: [] });
      w.terrain = await gunzip(await terrainGz("map", "scenery"));
      w.ready = w.ownerReady = true;
      if (mine !== run) return;
      world = w;
      await show(w);
    } catch {}
  }

  return {
    get watching() { return watching?.id ?? null; },
    watch,
    scenery,
    stop() {
      close();
      clearTimeout(napTimer);
      cancelAnimationFrame(raf);
      raf = 0;
      removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", seen);
      world = view = null;
    },
  };
}
