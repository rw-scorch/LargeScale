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
import { createBuildMenu } from "./ui/build.js";
import { createBuildingPanel } from "./ui/building.js";
import { createTownPanel, nodeFor } from "./ui/town.js";
import { createResearchPanel } from "./ui/research.js";
import { createTip } from "./ui/tip.js";
import { MAX_ZONE_SIDE } from "./shared/protocol.js";
import { gunzip } from "./shared/codec.js";

const screen = document.getElementById("screen");
const gameRoot = document.getElementById("game");
const overlay = document.getElementById("overlay");
const canvas = document.getElementById("map");

let assets = null;
const loadAssets = async () => (assets ??= await Promise.all([
  loadAtlas("/assets/sheets", ["markers", "mapicons", "terrain", "overlays", "civic", "military", "industry", "transport", "housing", "commercial", "resources", "agriculture", "effects", "people"]),
  fetch("/assets/terrain/palettes.json").then(r => r.json()),
]).then(([atlas, pal]) => ({ atlas, palettes: pal.seasons })));
const gzCache = new Map(), depCache = new Map();
const depositsGz = async (dir, hash) => {
  if (!depCache.has(hash)) {
    const r = await fetch(`/${dir}/deposits.bin.gz?v=${hash}`);
    depCache.set(hash, r.ok ? new Uint8Array(await r.arrayBuffer()) : null);
  }
  return depCache.get(hash);
};
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
    this.building = null;
    this.zoning = null;
    this.ghostAt = null;
    this.selectedBuilding = null;
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
    this.buildMenu = createBuildMenu(overlay, this);
    this.buildingPanel = createBuildingPanel(overlay, this);
    this.town = createTownPanel(overlay, this);
    this.research = createResearchPanel(overlay, this);
    this.tip = createTip(overlay, this);
    const self = this;
    attachInput(canvas, {
      get ratio() { return self.view?.ratio ?? 1; },
      pan: (dx, dy) => this.view?.pan(dx, dy),
      zoomAt: (x, y, f) => this.view?.zoomAt(x, y, f),
    }, {
      onTap: (x, y) => this.tap(x, y),
      onSecondary: (x, y) => this.secondary(x, y),
      onHover: (x, y) => { this.hover = x === null ? null : [x, y]; this.tip.update(); },
      dragging: () => !!this.zoning,
      onDrag: (a, b) => this.dragZone(a, b),
      onDragEnd: (a, b) => this.paintZone(a, b),
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
    this.onWheel = e => { if (e.ctrlKey) e.preventDefault(); };
    this.onGesture = e => e.preventDefault();
    addEventListener("wheel", this.onWheel, { passive: false });
    addEventListener("gesturestart", this.onGesture);
    this.ui = setInterval(() => this.updatePanels(), 250);
    let last = performance.now();
    const loop = now => {
      if (this.left) return;
      const dt = now - last;
      last = now;
      if (this.view) {
        this.updateGhost();
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
      if (m.map.kind !== "test") {
        const gz = await depositsGz(m.map.dir ?? "map", m.map.baseHash);
        if (gz) world.loadDeposits(await gunzip(gz));
      }
    } catch (e) {
      this.toast(e.message);
      return;
    }
    if (this.world !== world) return;
    const cam = this.view?.cam;
    this.view = new MapRenderer(canvas, assets.atlas, world, assets.palettes);
    world.takeChanged();
    this.view.selected = this.selected;
    this.view.selectedBuilding = this.selectedBuilding;
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
    if (this.view && this.world.changed.length) this.view.updateBuildings(this.world.takeChanged());
    if (m.t === "events") for (const e of m.events) this.announce(e);
    if (m.t === "state" && this.view) this.view.colours.clear();
    if (m.t === "purse" && this.view && m.season && m.season !== this.view.season) this.view.setSeason(m.season);
    if (m.t === "purse" && this.townOnPurse) { this.townOnPurse = false; this.toggleTown(true); }
  }

  onFrame(data) {
    if (!this.world) return;
    const r = this.world.frame(data);
    if (!r || !this.view) return;
    if (r.layer === "zone" || r.layer === "deposits") return;
    if (r.layer === "terrain" && r.plots) return this.view.updateTerrain(r.plots);
    if (r.layer === "buildings") { this.world.takeChanged(); this.view.indexBuildings(); }
    else if (r.layer === "terrain") this.view.rebuildTerrain();
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
    if (e.type === "advance_done" && w.stacks.get(e.stack)?.owner === you) say(`done${e.stack}`, "A stack stopped advancing: nothing left to take within its reach.");
    if (e.type === "capital_moved" && e.nation === you) say("capital", "Your capital fell. It moved to the nearest land you still hold.", 0);
    if (e.type === "built" && e.nation === you) say(`built${e.building}`, `${w.defs.table[e.kind]?.name ?? "A building"} is finished.`, 0);
    if (e.type === "deposit_depleted" && e.nation === you) say(`dep${e.at}`, `A ${e.kind} deposit has run dry.`);
    if (e.type === "era_up") say(`era${e.nation}${e.era}`, e.nation === you ? `Your nation enters the ${e.name} era.` : `${name(e.nation)} has reached the ${e.name} era.`, 0);
    if (e.type === "researched" && e.nation === you) {
      const node = w.locks.nodes.get(e.node), builds = (node?.unlocks?.buildings ?? []).map(b => w.defs.table[b]?.name).filter(Boolean);
      say(`res${e.node}`, `Researched ${node?.name ?? e.node}.${builds.length ? ` You can now build: ${builds.join(", ")}.` : ""}`, 0);
    }
    if (e.type === "kit" && e.nation === you) {
      say("kit", "Your chieftain hut stands at the capital. The Town panel says what to do next.", 0);
      if (w.purse) this.toggleTown(true);
      else this.townOnPurse = true;
    }
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
    if (action === "disband" && this.selectedBuilding !== null) return this.buildingPanel.demolish();
    if (action === "build") return this.toggleBuildMenu();
    if (action === "town") return this.toggleTown();
    if (action === "research") return this.toggleResearch();
    if (action === "deposits") return this.toggleDeposits();
    if (["advance", "claim", "target", "move", "split", "merge", "disband"].includes(action)) act[action]();
    if (action === "next") this.nextStack();
    if (action === "home") this.home();
    if (action === "zoomIn") this.zoom(1.6);
    if (action === "zoomOut") this.zoom(1 / 1.6);
    this.updatePanels();
    if (action === "cancel") {
      if (this.building || this.zoning) this.stopBuild();
      else if (this.research.open) this.toggleResearch(false);
      else if (this.buildMenu.open) this.toggleBuildMenu(false);
      else if (this.placing) this.togglePlacing(false);
      else if (this.stack.choosing) this.stack.cancel();
      else this.select(null);
    }
  }

  toggleBuildMenu(on = !this.buildMenu.open) {
    if (on && this.town.open) this.town.show(false);
    const me = this.world?.nations.get(this.world.you);
    this.buildMenu.show(on && !!me?.spawned && me.alive && !this.world.frozen);
    if (!this.buildMenu.open) this.stopBuild();
    this.updatePanels();
  }

  toggleResearch(on = !this.research.open) {
    this.research.show(on && !!this.world?.purse?.research);
    this.updatePanels();
  }

  toggleDeposits() {
    if (!this.view) return;
    this.view.showDeposits = !this.view.showDeposits;
    this.toast(this.view.showDeposits ? "Deposits shown at mid zoom. Grey ones are used up." : "Deposits hidden at mid zoom.");
    this.updatePanels();
  }

  toggleTown(on = !this.town.open) {
    if (on && this.buildMenu.open) this.toggleBuildMenu(false);
    this.town.show(on && !!this.world?.purse);
    this.updatePanels();
  }

  startZone(zone) {
    this.startBuild(null);
    this.zoning = zone;
    if (this.view) this.view.showZones = true;
    this.updatePanels();
  }

  zoneRectOf(a, b) {
    const w = this.world, p = this.view.screenToPlot(...a), q = this.view.screenToPlot(...b);
    const clamp = (v, hi) => Math.max(0, Math.min(hi - 1, Math.floor(v)));
    const x0 = clamp(Math.min(p[0], q[0]), w.w), x1 = clamp(Math.max(p[0], q[0]), w.w);
    const y0 = clamp(Math.min(p[1], q[1]), w.h), y1 = clamp(Math.max(p[1], q[1]), w.h);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  dragZone(a, b) {
    if (!this.view || !this.zoning) return;
    const r = this.zoneRectOf(a, b);
    this.view.zoneRect = { ...r, code: ["none", "res", "com", "ind", "farm"].indexOf(this.zoning) };
  }

  async paintZone(a, b) {
    if (!this.view || !this.zoning) return;
    const r = this.zoneRectOf(a, b), zone = this.zoning;
    this.view.zoneRect = null;
    let painted = 0;
    for (let y = r.y; y < r.y + r.h; y += MAX_ZONE_SIDE) for (let x = r.x; x < r.x + r.w; x += MAX_ZONE_SIDE) {
      const res = await this.conn.request({ t: "zone", zone, x, y, w: Math.min(MAX_ZONE_SIDE, r.x + r.w - x), h: Math.min(MAX_ZONE_SIDE, r.y + r.h - y) });
      if (!res.ok) return this.toast(res.error ?? "could not zone there");
      painted += res.plots;
    }
    if (!painted) return this.toast(zone === "none" ? "Nothing to erase there." : "Zones go on your own open land.");
    const node = zone === "res" && nodeFor(this.world, "hut_grass");
    if (node) this.toast(`Homes zoned. Huts go up once you know ${node.name}; it is in your research (U).`);
  }

  startBuild(type) {
    this.togglePlacing(false);
    this.stack.cancel();
    this.select(null);
    this.zoning = null;
    if (this.view) { this.view.showZones = false; this.view.zoneRect = null; }
    this.building = type;
    this.ghostAt = null;
    this.updatePanels();
  }

  stopBuild() {
    this.building = null;
    this.zoning = null;
    if (this.view) { this.view.showZones = false; this.view.zoneRect = null; }
    this.ghostAt = null;
    if (this.view) this.view.ghost = null;
    this.updatePanels();
  }

  anchorFor(plot, def) {
    const w = this.world, x = plot % w.w, y = (plot / w.w) | 0;
    const ax = Math.max(0, Math.min(w.w - def.fp[0], x - ((def.fp[0] - 1) >> 1)));
    const ay = Math.max(0, Math.min(w.h - def.fp[1], y - ((def.fp[1] - 1) >> 1)));
    return ay * w.w + ax;
  }

  placeAnchor(plot, def) {
    const w = this.world, base = this.anchorFor(plot, def);
    if (def.rule !== "coast" || !w.placeError(def.id, base)) return base;
    const x = plot % w.w, y = (plot / w.w) | 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const at = this.anchorFor(ny * w.w + nx, def);
      if (!w.placeError(def.id, at)) return at;
    }
    return base;
  }

  updateGhost() {
    const def = this.building && this.world?.defs.table[this.building];
    if (!def) { this.view.ghost = null; return; }
    const plot = this.hover ? this.plotAt(...this.hover) : null;
    const anchor = plot !== null ? this.placeAnchor(plot, def) : this.ghostAt;
    this.view.ghost = anchor === null ? null : { def, anchor, reason: this.world.placeError(def.id, anchor) };
  }

  async buildAt(plot) {
    const def = this.world.defs.table[this.building];
    const anchor = this.placeAnchor(plot, def);
    if (!this.hover && this.ghostAt !== anchor) { this.ghostAt = anchor; return; }
    const why = this.world.placeError(def.id, anchor);
    if (why) return this.toast(why);
    const r = await this.conn.request({ t: "build", type: def.id, at: anchor });
    if (!r.ok) return this.toast(r.error ?? "could not build there");
    this.ghostAt = null;
  }

  selectBuilding(id) {
    this.selectedBuilding = id;
    if (this.view) this.view.selectedBuilding = id;
    if (id !== null && this.selected !== null) this.select(null);
    this.updatePanels();
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
    if (this.building || this.zoning) return this.stopBuild();
    const s = this.world.stacks.get(this.selected);
    if (!s || s.owner !== this.world.you) return this.toast("Select one of your stacks first, then right-click where it should go.");
    await this.stack.act.moveNow(plot);
  }

  tap(sx, sy) {
    const w = this.world, v = this.view;
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    const x = plot % w.w, y = (plot / w.w) | 0;
    if (this.zoning) return this.paintZone([sx, sy], [sx, sy]);
    if (this.building) return this.buildAt(plot);
    if (this.placing) {
      if (w.owner[plot] !== w.you) return this.toast("Pick a plot of your own land.");
      return this.formAt(plot);
    }
    if (this.stack.choosing) return this.stack.pickTarget(plot);
    const hit = v.stackAt(sx, sy);
    if (hit !== null) return this.select(hit);
    const me = w.nations.get(w.you);
    if (me && !me.spawned && !w.frozen) return this.spawn.tryAt(x, y);
    const b = w.buildingAt(plot);
    if (b) return this.selectBuilding(b.id);
    this.select(null);
    this.selectBuilding(null);
    this.tip.pin(sx, sy);
  }

  select(id) {
    if (id !== null && this.selectedBuilding !== null) { this.selectedBuilding = null; if (this.view) this.view.selectedBuilding = null; }
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
    for (const p of [this.hud, this.spawn, this.nations, this.chat, this.stack, this.notices, this.buildMenu, this.buildingPanel, this.town, this.research, this.tip]) p?.update();
  }

  leave() {
    this.left = true;
    this.conn.close();
    clearInterval(this.ui);
    removeEventListener("resize", this.onResize);
    removeEventListener("keydown", this.onKey);
    removeEventListener("wheel", this.onWheel);
    removeEventListener("gesturestart", this.onGesture);
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
