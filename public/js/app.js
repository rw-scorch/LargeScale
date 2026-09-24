import { ClientWorld } from "./shared/client.js";
import { loadAtlas } from "./render/atlas.js";
import { MapRenderer } from "./render/renderer.js";
import { attachInput } from "./input.js";
import { Connection } from "./net.js";
import { keyMap, actionFor } from "./keys.js";
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
const terrainGz = async (dir, hash) => {
  if (!gzCache.has(hash)) {
    const r = await fetch(`/${dir}/terrain.bin.gz?v=${hash}`);
    if (!r.ok) throw new Error(`The map file ${dir}/terrain.bin.gz is missing on the server.`);
    gzCache.set(hash, new Uint8Array(await r.arrayBuffer()));
  }
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
    this.placing = false;
    this.hover = null;
    this.keys = keyMap();
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
    }, {
      onTap: (x, y) => this.tap(x, y),
      onSecondary: (x, y) => this.secondary(x, y),
      onHover: (x, y) => (this.hover = x === null ? null : [x, y]),
    });
    this.onResize = () => this.resize();
    addEventListener("resize", this.onResize);
    this.onKey = e => {
      if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
      const action = actionFor(this.keys, e);
      if (!action || !this.world?.ready) return;
      e.preventDefault();
      this.key(action);
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
      await world.loadBase(() => terrainGz(m.map.dir ?? "map", m.map.baseHash ?? "test"));
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
    if (e.type === "capital_moved" && e.nation === you) say("capital", "Your capital fell. It moved to the nearest land you still hold.", 0);
  }

  plotAt(sx, sy) {
    const w = this.world, v = this.view;
    if (!w?.ready || !v || sx === null || sx === undefined) return null;
    const [fx, fy] = v.screenToPlot(sx, sy), x = Math.floor(fx), y = Math.floor(fy);
    return x < 0 || y < 0 || x >= w.w || y >= w.h ? null : y * w.w + x;
  }

  key(action) {
    const act = this.stack.act, w = this.world;
    if (action === "form") {
      const plot = this.hover && this.plotAt(...this.hover);
      if (plot !== null && w.owner[plot] === w.you) this.formAt(plot);
      else this.togglePlacing();
    }
    if (action === "advance" || action === "move" || action === "split" || action === "merge" || action === "disband") act[action]();
    if (action === "next") this.nextStack();
    if (action === "home") this.home();
    if (action === "zoomIn") this.zoom(1.6);
    if (action === "zoomOut") this.zoom(1 / 1.6);
    if (action === "cancel") {
      if (this.placing) this.togglePlacing(false);
      else if (this.stack.choosing) this.stack.cancel();
      else this.select(null);
    }
  }

  togglePlacing(on = !this.placing) {
    const me = this.world?.nations.get(this.world.you);
    this.placing = on && !!me?.spawned && me.alive && !this.world.frozen;
    if (this.placing) this.stack.cancel();
    this.updatePanels();
  }

  async formAt(plot) {
    const r = await this.conn.request({ t: "stack", share: this.hud.share, at: plot });
    if (!r.ok) return this.toast(r.error ?? "could not form a stack");
    this.placing = false;
    this.select(r.stack);
  }

  nextStack() {
    const mine = this.world.myStacks().sort((a, b) => a.id - b.id);
    if (!mine.length) return this.toast("You have no stacks. Press F to form one.");
    const next = mine.find(s => s.id > (this.selected ?? -1)) ?? mine[0];
    this.select(next.id);
    this.focus(next.pos, Math.max(this.view.cam.scale / this.view.ratio, 4));
  }

  async secondary(sx, sy) {
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    if (this.placing) return this.togglePlacing(false);
    const s = this.world.stacks.get(this.selected);
    if (!s || s.owner !== this.world.you) return this.toast("Select one of your stacks first, then right-click where it should go.");
    await this.stack.act.moveNow(plot);
  }

  tap(sx, sy) {
    const w = this.world, v = this.view;
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    const x = plot % w.w, y = (plot / w.w) | 0;
    if (this.placing) {
      if (w.owner[plot] !== w.you) return this.toast("Pick a plot of your own land.");
      return this.formAt(plot);
    }
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
