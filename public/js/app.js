import { ClientWorld } from "./shared/client.js";
import { loadAtlas } from "./render/atlas.js";
import { MapRenderer } from "./render/renderer.js";
import { attachInput } from "./input.js";
import { Connection } from "./net.js";
import { api, session } from "./api.js";
import { showLogin } from "./ui/login.js";
import { showWorlds } from "./ui/worlds.js";
import { createHud } from "./ui/hud.js";
import { createSpawnHint } from "./ui/spawn.js";
import { createNations } from "./ui/nations.js";
import { createChat } from "./ui/chat.js";
import { createStackPanel } from "./ui/stack.js";
import { createNotices } from "./ui/notice.js";

const screen = document.getElementById("screen");
const gameRoot = document.getElementById("game");
const overlay = document.getElementById("overlay");
const canvas = document.getElementById("map");

let assets = null;
const loadAssets = async () => (assets ??= await Promise.all([
  loadAtlas("/assets/sheets", ["markers", "mapicons", "terrain"]),
  fetch("/assets/terrain/palettes.json").then(r => r.json()),
]).then(([atlas, pal]) => ({ atlas, palettes: pal.seasons })));
const gzCache = new Map();
const terrainGz = async hash => {
  if (!gzCache.has(hash)) gzCache.set(hash, new Uint8Array(await (await fetch(`/map/terrain.bin.gz?v=${hash}`)).arrayBuffer()));
  return gzCache.get(hash);
};

class Game {
  constructor(worldId, name, onLeave) {
    this.worldId = worldId;
    this.name = name;
    this.onLeave = onLeave;
    this.world = null;
    this.view = null;
    this.selected = null;
    this.frameTimes = [];
    this.lastToast = new Map();
    overlay.replaceChildren();
    this.connect();
    this.hud = createHud(overlay, this);
    this.spawn = createSpawnHint(overlay, this);
    this.nations = createNations(overlay, this);
    this.chat = createChat(overlay, this);
    this.stack = createStackPanel(overlay, this);
    this.notices = createNotices(overlay, this);
    const self = this;
    attachInput(canvas, {
      get ratio() { return self.view?.ratio ?? 1; },
      pan: (dx, dy) => this.view?.pan(dx, dy),
      zoomAt: (x, y, f) => this.view?.zoomAt(x, y, f),
    }, { onTap: (x, y) => this.tap(x, y) });
    this.onResize = () => this.resize();
    addEventListener("resize", this.onResize);
    this.onKey = e => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "Escape") { this.stack.cancel(); this.select(null); }
      if (e.key === "+" || e.key === "=") this.zoom(1.6);
      if (e.key === "-") this.zoom(1 / 1.6);
    };
    addEventListener("keydown", this.onKey);
    this.ui = setInterval(() => this.updatePanels(), 250);
    let last = performance.now();
    const loop = now => {
      if (this.left) return;
      const dt = now - last;
      last = now;
      if (this.view) {
        const t = performance.now();
        this.view.render(dt / 1000);
        this.frameTimes.push({ gap: dt, draw: performance.now() - t, scale: this.view.cam.scale });
        if (this.frameTimes.length > 600) this.frameTimes.splice(0, 300);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__ls = { game: this };
  }

  connect() {
    this.conn = new Connection(this.worldId, session.token, {
      message: m => this.onMessage(m),
      frame: d => this.onFrame(d),
      status: () => this.updatePanels(),
    });
  }

  reconnect() {
    this.conn.close();
    this.connect();
  }

  async onHello(m) {
    const world = new ClientWorld(m);
    this.world = world;
    try {
      await loadAssets();
      await world.loadBase(() => terrainGz(m.map.baseHash ?? "test"));
    } catch (e) {
      this.toast(e.message);
      return;
    }
    if (this.world !== world) return;
    const cam = this.view?.cam;
    this.view = new MapRenderer(canvas, assets.atlas, world, assets.palettes);
    this.view.selected = this.selected;
    this.resize();
    if (cam) Object.assign(this.view.cam, cam);
    else if (world.nations.get(world.you)?.capital != null) this.home();
    else this.fit();
    this.view.clampCamera();
    this.updatePanels();
  }

  onMessage(m) {
    if (m.t === "hello") return this.onHello(m);
    if (!this.world) return;
    this.world.message(m);
    if (m.t === "events") for (const e of m.events) this.announce(e);
    if (m.t === "state" && this.view) this.view.colours.clear();
  }

  onFrame(data) {
    if (!this.world) return;
    const r = this.world.frame(data);
    if (!r || !this.view) return;
    if (r.layer === "terrain") this.view.rebuildTerrain();
    else if (r.all) this.view.rebuildTerritory();
    else this.view.updatePlots(r.plots);
  }

  announce(e) {
    const w = this.world, you = w.you, name = id => w.nations.get(id)?.name ?? "someone";
    const say = (key, text, every = 5000) => {
      if (performance.now() - (this.lastToast.get(key) ?? -1e9) < every) return;
      this.lastToast.set(key, performance.now());
      this.toast(text);
    };
    if (e.type === "plot_lost" && e.nation === you) say(`lost${e.by}`, `${name(e.by)} is taking your land.`);
    if (e.type === "plot_lost" && e.by === you && !w.nations.get(e.nation)?.bot) say(`took${e.nation}`, `You are taking land from ${name(e.nation)}.`);
    if (e.type === "stack_destroyed" && e.nation === you) say(`gone${e.stack}`, "One of your stacks was destroyed.", 0);
    if (e.type === "stack_destroyed" && e.nation !== you) say(`kill${e.stack}`, `A stack of ${name(e.nation)} was destroyed.`, 0);
    if (e.type === "eliminated") say(`elim${e.nation}`, e.nation === you ? "Your nation has been eliminated." : `${name(e.nation)} has been eliminated.`, 0);
    if (e.type === "stalled" && w.stacks.get(e.stack)?.owner === you) say(`stall${e.stack}`, "A stack stopped: not enough troops to go on.");
  }

  tap(sx, sy) {
    const w = this.world, v = this.view;
    if (!w?.ready || !v) return;
    const [fx, fy] = v.screenToPlot(sx, sy), x = Math.floor(fx), y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
    const plot = y * w.w + x;
    if (this.stack.choosing) return this.stack.pickTarget(plot);
    const hit = v.stackAt(sx, sy);
    if (hit !== null) return this.select(hit);
    const me = w.nations.get(w.you);
    if (me && !me.spawned && !w.frozen) return this.spawn.tryAt(x, y);
    this.select(null);
  }

  select(id) {
    this.selected = id;
    this.selectedAt = performance.now();
    if (this.view) this.view.selected = id;
    this.stack.cancel();
    this.updatePanels();
  }

  zoom(f) { if (this.view) this.view.zoomAt(canvas.width / 2, canvas.height / 2, f); }
  fit() { this.view?.fitWorld(); }
  home() {
    const cap = this.world?.nations.get(this.world.you)?.capital;
    if (cap != null) this.focus(cap, 5);
    else this.fit();
  }
  focus(plot, scale) {
    const v = this.view;
    if (!v) return;
    v.cam.x = (plot % this.world.w) + 0.5;
    v.cam.y = Math.floor(plot / this.world.w) + 0.5;
    v.cam.scale = scale * v.ratio;
    v.clampCamera();
  }

  resize() {
    this.view?.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
  }

  toast(text) { this.notices?.toast(text); }

  updatePanels() {
    if (this.left) return;
    for (const p of [this.hud, this.spawn, this.nations, this.chat, this.stack, this.notices]) p?.update();
  }

  leave() {
    this.left = true;
    this.conn.close();
    clearInterval(this.ui);
    removeEventListener("resize", this.onResize);
    removeEventListener("keydown", this.onKey);
    this.onLeave();
  }
}

function showScreen(which) {
  screen.hidden = which !== "screen";
  gameRoot.hidden = which !== "game";
}

async function worlds(account) {
  showScreen("screen");
  history.replaceState(null, "", location.pathname);
  await showWorlds(screen, account, {
    onOpen: (id, name) => enter(id, name, account),
    onLogout: async () => { await api("/api/logout", {}); session.token = ""; start(); },
  });
}

function enter(id, name, account) {
  showScreen("game");
  history.replaceState(null, "", `#w=${id}`);
  new Game(id, name, () => worlds(account));
}

async function start() {
  if (session.token) {
    const me = await api("/api/me");
    if (!me.error) {
      const want = new URLSearchParams(location.hash.slice(1)).get("w");
      if (want) {
        const list = await api("/api/worlds");
        const w = Array.isArray(list) && list.find(x => x.id === want && x.member);
        if (w) return enter(w.id, w.name, me);
      }
      return worlds(me);
    }
  }
  showScreen("screen");
  showLogin(screen, account => worlds(account));
}

start();
