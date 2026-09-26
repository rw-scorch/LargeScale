import { ClientWorld } from "./shared/client.js";
import { loadAtlas } from "./render/atlas.js";
import { MapRenderer } from "./render/renderer.js";
import { attachInput } from "./input.js";
import { Connection } from "./net.js";
import { keyMap, actionFor, loadKeys } from "./keys.js";
import { api, session } from "./api.js";
import { showLogin } from "./ui/login.js";
import { showWorlds } from "./ui/worlds.js";
import { createHud } from "./ui/hud.js";
import { createSpawnHint } from "./ui/spawn.js";
import { createNations } from "./ui/nations.js";
import { createFeed } from "./ui/feed.js";
import { createStackPanel } from "./ui/stack.js";
import { createNotices } from "./ui/notice.js";
import { createBuildMenu } from "./ui/build.js";
import { createBuildingPanel } from "./ui/building.js";
import { createTownPanel, nodeFor } from "./ui/town.js";
import { createResearchPanel } from "./ui/research.js";
import { createTip } from "./ui/tip.js";
import { createAdminPanel } from "./ui/admin.js";
import { createUpgradePanel } from "./ui/upgrade.js";
import { createArmyPanel } from "./ui/army.js";
import { createMachinePanel } from "./ui/machine.js";
import { createRing, ownerItems } from "./ui/ring.js";
import { createAttacks } from "./ui/attacks.js";
import { createGuide } from "./ui/guide.js";
import { createNationCard } from "./ui/nation.js";
import { createSettings, loadPrefs } from "./ui/settings.js";
import { MAX_ZONE_SIDE } from "./shared/protocol.js";
import { gunzip } from "./shared/codec.js";

const screen = document.getElementById("screen");
const gameRoot = document.getElementById("game");
const overlay = document.getElementById("overlay");
const canvas = document.getElementById("map");

let assets = null;
const loadAssets = async () => (assets ??= await Promise.all([
  loadAtlas("/assets/sheets", ["markers", "mapicons", "terrain", "overlays", "civic", "military", "industry", "transport", "housing", "commercial", "resources", "agriculture", "effects", "people", "units", "vehicles", "ships"]),
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
  constructor(worldId, name, onLeave, account = null) {
    this.worldId = worldId;
    this.canvas = canvas;
    this.admin = !!account?.admin;
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
    this.selectedMachine = null;
    this.hover = null;
    this.keys = keyMap(loadKeys());
    this.prefs = loadPrefs();
    this.frameTimes = [];
    this.lastToast = new Map();
    overlay.replaceChildren();
    this.connect();
    this.hud = createHud(overlay, this);
    const { left, side, top } = this.hud.cols;
    this.spawn = createSpawnHint(top, this);
    this.guide = createGuide(top, this);
    this.nations = createNations(left, this);
    this.feed = createFeed(side, this);
    this.attacks = createAttacks(overlay, side, this);
    this.stack = createStackPanel(side, this);
    this.notices = createNotices(overlay, this, top);
    this.buildMenu = createBuildMenu(side, this);
    this.buildingPanel = createBuildingPanel(side, this);
    this.town = createTownPanel(side, this);
    this.research = createResearchPanel(overlay, this);
    this.upgrade = createUpgradePanel(overlay, this);
    this.army = createArmyPanel(overlay, this);
    this.machinePanel = createMachinePanel(side, this);
    this.nationCard = createNationCard(side, this);
    this.tip = createTip(overlay, this);
    this.ring = createRing(overlay, this);
    this.adminPanel = this.admin ? createAdminPanel(overlay, this) : null;
    this.settings = createSettings(overlay, this);
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
      tracing: () => this.stack.drawing,
      onTrace: line => this.trace(line),
      onTraceEnd: line => this.traced(line),
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
    this.view.selectedMachine = this.selectedMachine;
    this.view.showNames = this.prefs.names !== false;
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
    if (m.t === "events") for (const e of m.events) { this.announce(e); this.attacks.event(e); this.guide.event(e); }
    if (m.t === "state" && this.view) this.view.colours.clear();
    if (m.t === "purse" && this.view && m.season && m.season !== this.view.season) this.view.setSeason(m.season);
    if (m.t === "purse" && this.townOnPurse) { this.townOnPurse = false; this.toggleTown(true); }
    const note = text => this.feed.push({ text, tone: "warn" });
    if (m.t === "ended") note(`${m.by} ended this world. Orders are off, but you can still look around.`);
    if (m.t === "reopened") note(`${m.by} reopened this world.`);
    if (m.t === "speed") note(m.factor > 1 ? `${m.by} set the world to ${m.factor} times speed.` : `${m.by} set the world back to normal speed.`);
    if (m.t === "renamed") { this.name = m.name; note(`${m.by} renamed the world ${m.name}.`); }
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
    const capital = id => w.nations.get(id)?.capital ?? null, stackAt = id => w.stacks.get(id)?.pos ?? e.at ?? null, machineAt = id => e.at ?? w.machines.get(id)?.at ?? null;
    const say = (key, text, every = 5000, tone = "info", at = e.at ?? null) => {
      if (performance.now() - (this.lastToast.get(key) ?? -1e9) < every) return;
      this.lastToast.set(key, performance.now());
      this.feed.push({ key, text, tone, at });
    };
    if (e.type === "plot_lost" && e.nation === you) say(`lost${e.by}`, `${name(e.by)} is taking your land.`, 5000, "danger");
    if (e.type === "plot_lost" && e.by === you && !w.nations.get(e.nation)?.bot) say(`took${e.nation}`, `You are taking land from ${name(e.nation)}.`, 5000, "good");
    if (e.type === "stack_destroyed" && e.nation === you) say(`gone${e.stack}`, "One of your stacks was destroyed.", 0, "danger");
    if (e.type === "stack_destroyed" && e.nation !== you) say(`kill${e.stack}`, `A stack of ${name(e.nation)} was destroyed.`, 0, "good");
    if (e.type === "eliminated") say(`elim${e.nation}`, e.nation === you ? "Your nation has been eliminated." : `${name(e.nation)} has been eliminated.`, 0, e.nation === you ? "danger" : "warn", null);
    if (e.type === "stalled" && w.stacks.get(e.stack)?.owner === you) say(`stall${e.stack}`, "A stack stopped: not enough troops to go on.", 5000, "warn");
    if (e.type === "advance_done" && w.stacks.get(e.stack)?.owner === you) {
      const what = e.only === 0 ? "unclaimed land" : e.only ? `${name(e.only)}'s land` : "land to take";
      say(`done${e.stack}`, e.sought ? `A stack stopped: it found no ${what} it can reach by land${e.only !== null ? " without going through another nation's land" : ""}.` : "A stack stopped advancing: nothing left to take within its reach.", 5000, "warn", stackAt(e.stack));
    }
    if (e.type === "capital_moved" && e.nation === you) say("capital", "Your capital fell. It moved to the nearest land you still hold.", 0, "danger", e.to);
    if (e.type === "built" && e.nation === you) say(`built${e.building}`, `${w.defs.table[e.kind]?.name ?? "A building"} is finished.`, 0, "built", w.buildings.get(e.building)?.anchor ?? null);
    if (e.type === "deposit_depleted" && e.nation === you) say(`dep${e.at}`, `A ${e.kind} deposit has run dry.`, 5000, "warn");
    if (e.type === "era_up") say(`era${e.nation}${e.era}`, e.nation === you ? `Your nation enters the ${e.name} era.` : `${name(e.nation)} has reached the ${e.name} era.`, 0, "era", capital(e.nation));
    if (e.type === "researched" && e.nation === you) {
      const node = w.locks.nodes.get(e.node), builds = [...(node?.unlocks?.buildings ?? []).map(b => w.defs.table[b]?.name), ...(node?.unlocks?.units ?? []).map(u => w.unitTypes.table[u]?.name)].filter(Boolean);
      say(`res${e.node}`, `Researched ${node?.name ?? e.node}.${builds.length ? ` You can now build or train: ${builds.join(", ")}.` : ""}`, 0, "research");
    }
    const machine = e.kind && w.unitTypes.table[e.kind]?.name.toLowerCase();
    if (e.type === "machine_built" && e.nation === you) say(`mb${e.machine}`, `A ${machine} is ready.`, 0, "built", machineAt(e.machine));
    if (e.type === "machine_destroyed" && e.nation === you) say(`md${e.machine}`, e.lost ? `Your ${machine} was sunk, and the ${Math.round(e.lost)} troops aboard were lost.` : `Your ${machine} was destroyed.`, 0, "danger");
    if (e.type === "machine_captured" && e.nation === you) say(`mc${e.machine}`, `${name(e.by)} captured your ${machine}. Keep a stack beside your machines.`, 0, "danger");
    if (e.type === "machine_captured" && e.by === you) say(`mc${e.machine}`, `You captured a ${machine} from ${name(e.nation)}.`, 0, "good");
    if (e.type === "embarked" && e.nation === you) say(`em${e.stack}`, e.left ? `${Math.round(e.troops)} troops boarded. The ship is full, so ${Math.round(e.left)} stay ashore.` : `${Math.round(e.troops)} troops boarded.`, 0, "info", machineAt(e.machine));
    if (e.type === "board_failed" && e.nation === you) say(`bf${e.stack}`, `A stack could not board: ${e.why}.`, 0, "warn", stackAt(e.stack));
    if (e.type === "landed" && e.nation === you) say(`ld${e.stack}`, e.lost > 0.5 ? `${Math.round(e.troops)} troops landed. ${Math.round(e.lost)} were lost in the landing.` : `${Math.round(e.troops)} troops landed without loss.`, 0, "good");
    if (e.type === "landing_failed" && e.nation === you) say(`lf${e.machine}`, e.why ? `The landing did not happen: ${e.why}.` : `The landing failed: all ${Math.round(e.lost)} troops were lost against the defenders.`, 0, "danger");
    if (e.type === "machine_blocked" && e.nation === you) say(`mbk${e.machine}`, "A machine's way is blocked. Give it a new order.", 5000, "warn", machineAt(e.machine));
    if (e.type === "kit" && e.nation === you) {
      say("kit", "Your chieftain hut stands at the capital. The Town panel says what to do next.", 0, "built", capital(you));
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
    if (this.selectedMachine !== null && this.machinePanel.key(action)) return this.updatePanels();
    if (action === "form") {
      const plot = this.hover && this.plotAt(...this.hover);
      if (plot !== null && w.owner[plot] === w.you) this.formAt(plot);
      else this.togglePlacing();
    }
    if (action === "disband" && this.selectedBuilding !== null) return this.buildingPanel.demolish();
    if (action === "build") return this.toggleBuildMenu();
    if (action === "town") return this.toggleTown();
    if (action === "research") return this.toggleResearch();
    if (action === "admin") return this.toggleAdmin();
    if (action === "upgrade") return this.toggleUpgrade();
    if (action === "army") return this.toggleArmy();
    if (action === "deposits") return this.toggleDeposits();
    if (["advance", "claim", "target", "move", "draw", "split", "merge", "disband"].includes(action)) act[action]();
    if (action === "next") this.nextStack();
    if (action === "home") this.home();
    if (action === "zoomIn") this.zoom(1.6);
    if (action === "zoomOut") this.zoom(1 / 1.6);
    this.updatePanels();
    if (action === "cancel") {
      if (this.building || this.zoning) this.stopBuild();
      else if (this.settings.open) this.toggleSettings(false);
      else if (this.adminPanel?.open) this.toggleAdmin(false);
      else if (this.upgrade.open) this.toggleUpgrade(false);
      else if (this.army.open) this.toggleArmy(false);
      else if (this.research.open) this.toggleResearch(false);
      else if (this.buildMenu.open) this.toggleBuildMenu(false);
      else if (this.placing) this.togglePlacing(false);
      else if (this.stack.choosing) this.stack.cancel();
      else if (this.machinePanel.choosing) this.machinePanel.cancel();
      else { this.select(null); this.selectMachine(null); this.selectNation(null); }
    }
  }

  toggleBuildMenu(on = !this.buildMenu.open) {
    if (on && this.town.open) this.town.show(false);
    const me = this.world?.nations.get(this.world.you);
    this.buildMenu.show(on && !!me?.spawned && me.alive && !this.world.frozen);
    if (!this.buildMenu.open) this.stopBuild();
    this.updatePanels();
  }

  toggleSettings(on = !this.settings.open) {
    if (on) { this.research.show(false); this.upgrade.show(false); this.army.show(false); this.adminPanel?.show(false); }
    this.settings.show(on);
    this.updatePanels();
  }

  toggleResearch(on = !this.research.open) {
    if (on) { this.upgrade.show(false); this.army.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    this.research.show(on && !!this.world?.purse?.research);
    this.updatePanels();
  }

  toggleAdmin(on = !this.adminPanel?.open) {
    if (!this.adminPanel) return;
    if (on) { this.research.show(false); this.upgrade.show(false); this.army.show(false); this.settings.show(false); }
    this.adminPanel.show(on && !!this.world?.ready);
    this.updatePanels();
  }

  toggleUpgrade(on = !this.upgrade.open) {
    if (on) { this.research.show(false); this.army.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    const me = this.world?.nations.get(this.world.you);
    this.upgrade.show(on && !!this.world?.purse && !!me?.spawned);
    this.updatePanels();
  }

  toggleArmy(on = !this.army.open) {
    if (on) { this.research.show(false); this.upgrade.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    const me = this.world?.nations.get(this.world.you);
    this.army.show(on && !!this.world?.purse?.army && !!me?.spawned);
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
    const def = type && this.world?.defs.table[type];
    this.ghostAt = def && this.buildPlot != null ? this.placeAnchor(this.buildPlot, def) : null;
    this.buildPlot = null;
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
    if (id !== null) this.nationCard?.show(null);
    if (id !== null && this.selectedMachine !== null) { this.selectedMachine = null; if (this.view) this.view.selectedMachine = null; }
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

  trace(line) {
    if (!this.placing && !this.building && !this.zoning) this.stack.trace(line);
  }

  traced(line) {
    if (line && this.placing) return this.togglePlacing(false);
    if (line && (this.building || this.zoning)) return this.stopBuild();
    return this.stack.traceEnd(line);
  }

  secondary(sx, sy) {
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    if (this.placing) return this.togglePlacing(false);
    if (this.building || this.zoning) return this.stopBuild();
    this.stack.cancel();
    this.machinePanel.cancel();
    const w = this.world, me = w.nations.get(w.you);
    if (!me?.spawned || !me.alive || w.frozen) return this.tip.pin(sx, sy);
    const u = w.machines.get(this.selectedMachine), s = w.stacks.get(this.selected);
    const items = u && u.owner === w.you ? this.machinePanel.ringFor(plot, sx, sy) : s && s.owner === w.you ? this.stack.ringFor(plot, sx, sy) : ownerItems(this, plot, sx, sy);
    if (!items.length) return this.tip.pin(sx, sy);
    this.ring.show(sx, sy, [...items, { id: "info", label: "Info", icon: "ui_info", run: () => this.tip.pin(sx, sy, 5000) }]);
  }

  async attackAt(plot) {
    const w = this.world, o = w.owner[plot];
    const r = await this.conn.request({ t: "attack", at: plot, share: this.hud.share });
    if (!r.ok) return this.toast(r.error ?? "could not attack");
    const s = w.stacks.get(r.stack);
    this.toast(`${s ? `${Math.round(s.troops)} troops go` : "A stack goes"} to take ${o ? `${w.nations.get(o)?.name ?? "their"}'s land` : "unclaimed land"}.`);
  }

  buildHere(plot) {
    this.buildPlot = plot;
    this.toggleBuildMenu(true);
    if (this.buildMenu.tab === "zones") this.buildMenu.setTab(null);
  }

  zoneHere() {
    this.toggleBuildMenu(true);
    this.buildMenu.setTab("zones");
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
    if (this.stack.choosing) return this.stack.pickTarget(plot, sx, sy);
    if (this.machinePanel.choosing) return this.machinePanel.pick(plot, sx, sy);
    const hit = v.stackAt(sx, sy);
    if (hit !== null) return this.select(hit);
    const mh = v.machineAt(sx, sy);
    if (mh !== null) return this.selectMachine(mh);
    const me = w.nations.get(w.you);
    if (me && !me.spawned && !w.frozen) return this.spawn.tryAt(x, y);
    const b = w.buildingAt(plot);
    if (b) return this.selectBuilding(b.id);
    this.select(null);
    this.selectBuilding(null);
    this.selectNation(w.owner[plot] && w.owner[plot] !== w.you ? w.owner[plot] : null, plot);
    this.tip.pin(sx, sy);
  }

  selectNation(id, plot = null) {
    if (id !== null) {
      if (this.selected !== null) this.select(null);
      if (this.selectedBuilding !== null) this.selectBuilding(null);
      if (this.selectedMachine !== null) this.selectMachine(null);
    }
    this.nationCard.show(id, plot ?? this.world?.nations.get(id)?.capital ?? null);
    this.updatePanels();
  }

  selectMachine(id) {
    if (id !== null) this.nationCard?.show(null);
    this.selectedMachine = id;
    if (this.view) this.view.selectedMachine = id;
    if (id !== null) {
      if (this.selected !== null) this.select(null);
      if (this.selectedBuilding !== null) this.selectBuilding(null);
      this.selectedMachine = id;
      if (this.view) { this.view.selectedMachine = id; this.view.route = null; }
    }
    this.machinePanel?.cancel();
    this.updatePanels();
  }

  select(id) {
    if (id !== null) this.nationCard?.show(null);
    if (id !== null && this.selectedMachine !== null) { this.selectedMachine = null; if (this.view) this.view.selectedMachine = null; }
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
    for (const p of [this.hud, this.spawn, this.guide, this.nations, this.feed, this.attacks, this.stack, this.notices, this.buildMenu, this.buildingPanel, this.town, this.research, this.upgrade, this.army, this.machinePanel, this.nationCard, this.tip, this.adminPanel]) p?.update();
  }

  leave() {
    this.left = true;
    this.conn.close();
    this.ring.destroy();
    this.settings.destroy();
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
  new Game(id, name, () => worlds(account), account);
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
