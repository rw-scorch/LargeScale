import { ClientWorld } from "./shared/client.js";
import { loadAssets, terrainGz, depositsGz } from "./assets.js";
import { MapRenderer } from "./render/renderer.js";
import { attachInput } from "./input.js";
import { Connection } from "./net.js";
import { keyMap, actionFor, loadKeys } from "./keys.js";
import { api, session } from "./api.js";
import { showLogin } from "./ui/login.js";
import { showWorlds } from "./ui/worlds.js";
import { createMenu } from "./ui/menu.js";
import { createHud } from "./ui/hud.js";
import { createSpawnHint } from "./ui/spawn.js";
import { createNations } from "./ui/nations.js";
import { createFeed } from "./ui/feed.js";
import { createStackPanel } from "./ui/stack.js";
import { createNotices } from "./ui/notice.js";
import { createBuildMenu, costText } from "./ui/build.js";
import { roadPlan, routePlan, roadLine, ROAD_NAMES } from "./shared/roads.js";
import { simplifyPath } from "./shared/pathfind.js";
import { polePlan, coverOf, gridsOf } from "./shared/power.js";
import { Grid } from "./shared/grid.js";
import { soldierTypes, typeOfSlot } from "./shared/soldiers.js";
import { createBuildingPanel } from "./ui/building.js";
import { createTownPanel, nodeFor } from "./ui/town.js";
import { createResearchPanel } from "./ui/research.js";
import { createTip } from "./ui/tip.js";
import { createAdminPanel } from "./ui/admin.js";
import { createUpgradePanel } from "./ui/upgrade.js";
import { createArmyPanel } from "./ui/army.js";
import { createLogisticsPanel } from "./ui/logistics.js";
import { createPlannerPanel } from "./ui/planner.js";
import { createMachinePanel } from "./ui/machine.js";
import { createRing, ownerItems } from "./ui/ring.js";
import { createAttacks } from "./ui/attacks.js";
import { createGuide } from "./ui/guide.js";
import { createNationCard } from "./ui/nation.js";
import { createSettings, loadPrefs, savePrefs } from "./ui/settings.js";
import { createPlaceConfirm } from "./ui/place.js";
import { createAim } from "./ui/aim.js";
import { fmt } from "./ui/dom.js";
import { createAwayPanel, span } from "./ui/away.js";
import { createLayout } from "./ui/layout.js";
import { createGroupPanel } from "./ui/group.js";
import { createSoldiersPanel } from "./ui/soldiers.js";
import { createPilotPanel } from "./ui/pilot.js";
import { createWorldInfo, phaseText } from "./ui/worldinfo.js";
import { MAX_ZONE_SIDE } from "./shared/protocol.js";
import { gunzip } from "./shared/codec.js";

const screen = document.getElementById("screen");
const gameRoot = document.getElementById("game");
const overlay = document.getElementById("overlay");
const canvas = document.getElementById("map");


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
    this.roading = null;
    this.routeFrom = null;
    this.routeTo = null;
    this.ghostAt = null;
    this.selectedBuilding = null;
    this.selectedMachine = null;
    this.pinned = null;
    this.stroke = null;
    this.aimHeld = null;
    this.aimTap = false;
    this.panKeys = new Set();
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
    this.groupPanel = createGroupPanel(side, this);
    this.soldiersPanel = createSoldiersPanel(side, this);
    this.notices = createNotices(overlay, this, top);
    this.buildMenu = createBuildMenu(side, this);
    this.buildingPanel = createBuildingPanel(side, this);
    this.town = createTownPanel(side, this);
    this.planner = createPlannerPanel(side, this);
    this.research = createResearchPanel(overlay, this);
    this.upgrade = createUpgradePanel(overlay, this);
    this.army = createArmyPanel(overlay, this);
    this.logistics = createLogisticsPanel(overlay, this);
    this.machinePanel = createMachinePanel(side, this);
    this.nationCard = createNationCard(side, this);
    this.tip = createTip(overlay, this);
    this.place = createPlaceConfirm(overlay, this);
    this.aim = createAim(overlay, this);
    this.ring = createRing(overlay, this);
    this.adminPanel = this.admin ? createAdminPanel(overlay, this) : null;
    this.worldInfo = createWorldInfo(overlay, this);
    this.settings = createSettings(overlay, this);
    this.away = createAwayPanel(overlay, this);
    this.pilotPanel = createPilotPanel(overlay, this, top);
    this.piloting = null;
    this.pilotKeys = new Set();
    this.pilotSent = { json: "", at: 0 };
    canvas.addEventListener("pointerdown", e => { this.lastPointer = e.pointerType; if (this.piloting && e.pointerType === "mouse" && e.button === 0) this.mouseFire = true; });
    addEventListener("pointerup", e => { if (e.pointerType === "mouse") this.mouseFire = false; });
    this.layout = createLayout(overlay, this);
    const self = this;
    attachInput(canvas, {
      get ratio() { return self.view?.ratio ?? 1; },
      pan: (dx, dy) => this.view?.pan(dx, dy),
      zoomAt: (x, y, f) => this.view?.zoomAt(x, y, f),
    }, {
      onTap: (x, y) => this.tap(x, y),
      onSecondary: (x, y) => this.secondary(x, y),
      onHover: (x, y) => {
        if (this.prefs.crosshair) return;
        this.hover = x === null ? null : [x, y];
        this.tip.update();
        if (this.roading && this.routeFrom !== null && this.routeTo === null && x !== null) { const p = this.plotAt(x, y); if (p !== this.routeHover) { this.routeHover = p; this.previewRoute(p); this.updatePanels(); } }
      },
      dragging: () => !this.prefs.crosshair && (!!this.zoning || !!this.roading || this.painting()),
      rightPans: () => !this.prefs.crosshair && (!!this.zoning || !!this.roading || this.painting() || (this.armies && !this.picked)),
      swipeStart: (x, y, e) => this.swipeStart(x, y, e),
      onSwipe: (kind, line) => this.swiping(kind, line),
      onSwipeEnd: (kind, line) => this.swiped(kind, line),
      onDrag: (a, b) => (this.roading ? this.dragRoad(a, b) : this.building ? this.paintAt(b) : this.dragZone(a, b)),
      onDragEnd: (a, b) => (this.roading ? this.endRoadDrag(a, b) : this.building ? this.paintAt(b, true) : this.paintZone(a, b)),
      tracing: () => this.stack.drawing,
      onTrace: line => this.trace(line),
      onTraceEnd: line => this.traced(line),
    });
    this.onResize = () => { this.resize(); this.layout?.resized(); };
    addEventListener("resize", this.onResize);
    this.onKey = e => {
      const t = e.target;
      if (t.tagName === "SELECT" || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["range", "checkbox", "radio"].includes(t.type))) return;
      if (t.tagName === "INPUT" && t.type === "range" && /^(Arrow|Home$|End$|Page)/.test(e.key)) return;
      if (this.piloting && this.pilotKey(e, true)) { e.preventDefault(); return; }
      const action = actionFor(this.keys, e);
      if (!action || !this.world?.ready) return;
      e.preventDefault();
      if (e.repeat && !action.startsWith("pan")) return;
      this.key(action);
    };
    addEventListener("keydown", this.onKey);
    this.onKeyUp = e => {
      if (this.piloting && this.pilotKey(e, false)) return;
      const action = actionFor(this.keys, e);
      if (action?.startsWith("pan")) this.panKeys.delete(action);
      if (action === "select") this.aimUp();
    };
    this.onBlur = () => { this.panKeys.clear(); this.pilotKeys.clear(); this.mouseFire = this.keyFire = false; this.aimUp(); };
    addEventListener("keyup", this.onKeyUp);
    addEventListener("blur", this.onBlur);
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
        if (this.panKeys.size) {
          const s = 700 * (this.view.ratio ?? 1) * Math.min(dt, 100) / 1000, k = this.panKeys;
          this.view.pan((k.has("panLeft") ? s : 0) - (k.has("panRight") ? s : 0), (k.has("panUp") ? s : 0) - (k.has("panDown") ? s : 0));
        }
        if (this.prefs.crosshair) this.hover = this.centre();
        if (this.aimHeld) this.aimMove();
        this.updateGhost();
        this.pilotFrame();
        const t = performance.now();
        this.view.render(dt / 1000);
        this.place.position();
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
    let art;
    try {
      art = await loadAssets();
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
    this.view = new MapRenderer(canvas, art.atlas, world, art.palettes);
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
    if (m.t === "catchup") this.feed.push({ key: "catchup", text: m.left ? `The world is catching up on ${span(m.of)} while nobody played: ${span(m.left)} to go.` : `The world caught up ${span(m.of)} in ${((m.ms ?? 0) / 1000).toFixed(1)} s.`, tone: "info" });
    if (m.t === "away") this.away.summary(m);
    if (m.t === "schedule") this.worldInfo.changed(m);
    if (m.t === "phase") { const [text, tone] = phaseText(m); this.feed.push({ key: `phase${m.key}`, text, tone }); }
    if (m.t === "catchup" || m.t === "away") this.updatePanels();
  }

  onFrame(data) {
    if (!this.world) return;
    const r = this.world.frame(data);
    if (!r || !this.view) return;
    if (r.layer === "road") return r.all ? this.view.indexRoads() : this.view.updateRoads(r.plots);
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
    if (e.type === "guard_sent" && e.nation === you) say(`guard${e.threat}`, `Guard: ${fmt(e.troops)} troops are going to meet a stack of ${name(e.enemy)}.`, 10000, "warn");
    if (e.type === "stack_destroyed" && e.nation !== you) say(`kill${e.stack}`, `A stack of ${name(e.nation)} was destroyed.`, 0, "good");
    if (e.type === "eliminated") say(`elim${e.nation}`, e.nation === you ? "Your nation has been eliminated." : `${name(e.nation)} has been eliminated.`, 0, e.nation === you ? "danger" : "warn", null);
    if (e.type === "stalled" && w.stacks.get(e.stack)?.owner === you) say(`stall${e.stack}`, "A stack stopped: not enough troops to go on.", 5000, "warn");
    if (e.type === "advance_done" && w.stacks.get(e.stack)?.owner === you) {
      const what = e.only === 0 ? "unclaimed land" : e.only ? `${name(e.only)}'s land` : "land to take";
      say(`done${e.stack}`, e.sought ? `A stack stopped: it found no ${what} it can reach by land${e.only !== null ? " without going through another nation's land" : ""}.` : "A stack stopped advancing: nothing left to take within its reach.", 5000, "warn", stackAt(e.stack));
    }
    if (e.type === "plan_done" && e.nation === you) say(`pd${e.name}${e.done}`, `Plan finished: ${e.name}${e.dropped ? `, with ${e.dropped} ${e.dropped === 1 ? "piece" : "pieces"} dropped` : ""}.`, 0, "built");
    if (e.type === "plan_dropped" && e.nation === you) say(`pdrop${e.name}`, `Part of "${e.name}" was dropped: ${e.why}.`, 20000, "warn");
    if (e.type === "overtime_shrink") say("shrink", `Overtime: every nation's border shrank, ${fmt(e.plots)} plots in all.`, 0, "danger", null);
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
    if (e.type === "machine_destroyed" && e.nation === you && !w.unitTypes.table[e.kind]?.domain?.startsWith("air")) say(`md${e.machine}`, e.lost ? `Your ${machine} was sunk, and the ${Math.round(e.lost)} troops aboard were lost.` : `Your ${machine} was destroyed.`, 0, "danger");
    if (e.type === "bombed" && e.nation === you) say(`bomb${e.at}`, `${name(e.by)} bombed your land: ${e.troops ? `${fmt(e.troops)} troops lost` : "no troops lost"}${e.buildings ? `, ${e.buildings} ${e.buildings === 1 ? "building" : "buildings"} damaged` : ""}. Flak towers and fighters on patrol stop bombers.`, 0, "danger", e.at);
    if (e.type === "bombed" && e.by === you) say(`bomb${e.at}`, `Your bomber hit its target: ${fmt(e.troops)} troops lost there, ${e.buildings} ${e.buildings === 1 ? "building" : "buildings"} damaged.`, 0, "good", e.at);
    if (e.type === "plane_down" && e.nation === you) say(`pd${e.machine}`, `Your ${machine} went down: ${e.why}.`, 0, "danger", e.at);
    if (e.type === "plane_down" && e.by === you && e.nation !== you) say(`pd${e.machine}`, `You shot down a ${machine} of ${name(e.nation)}'s.`, 0, "good", e.at);
    if (e.type === "machine_captured" && e.nation === you) say(`mc${e.machine}`, `${name(e.by)} captured your ${machine}. Keep a stack beside your machines.`, 0, "danger");
    if (e.type === "machine_captured" && e.by === you) say(`mc${e.machine}`, `You captured a ${machine} from ${name(e.nation)}.`, 0, "good");
    if (e.type === "roads_connected" && e.nation === you) say(`rc${e.plots}${e.stores}`, `Roads laid by themselves: ${fmt(e.plots)} plots for ${costText(e.cost)}, linking ${e.stores} more ${e.stores === 1 ? "building" : "buildings"} to your capital.`, 0, "built");
    if (e.type === "roads_waiting" && e.nation === you) say("rwait", `New buildings are waiting for roads: they need ${costText(e.cost)}.`, 60000, "warn");
    if (e.type === "trade_captured" && e.nation === you) say(`tc${e.machine}`, `${name(e.by)} captured a trade ship of yours, worth ${fmt(e.pay)} gold. Warships near your sea lanes keep them safe.`, 0, "danger", e.at);
    if (e.type === "trade_captured" && e.by === you) say(`tc${e.machine}`, `Your warship captured a trade ship of ${name(e.nation)}'s. It sails for your nearest port, worth ${fmt(e.pay)} gold.`, 0, "good", e.at);
    if (e.type === "boat_launched" && e.nation === you) say(`boat${e.machine}`, `A boat sets off with ${Math.round(e.troops)} troops.`, 0, "info", e.at);
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

  centre() { return [canvas.width / 2, canvas.height / 2]; }

  aimDown() {
    if (!this.prefs.crosshair || !this.view) return;
    const c = this.centre();
    if (this.zoning || this.roading || this.painting()) {
      if (this.aimHeld?.sticky) return this.aimFinish();
      this.aimHeld = { start: this.view.screenToPlot(...c), sticky: true };
      if (this.roading) { this.roadStroke = null; this.dragRoad(c, c); }
      else if (this.zoning) this.dragZone(c, c);
      else { this.stroke = null; this.paintAt(c); }
      return this.updatePanels();
    }
    if (this.aimHeld) return;
    this.aimHeld = { start: this.view.screenToPlot(...c) };
    this.aimTap = true;
    this.tap(...c);
    this.aimTap = false;
  }

  aimFinish() {
    const h = this.aimHeld;
    this.aimHeld = null;
    this.updatePanels();
    if (!h || !this.view) return;
    const c = this.centre();
    if (this.roading) { this.dragRoad(c, c); return this.layRoad(); }
    if (this.zoning) return this.paintZone(this.view.plotToScreen(...h.start), c);
    if (this.painting()) this.paintAt(c, true);
  }

  aimMove() {
    const h = this.aimHeld, c = this.centre();
    if (this.roading) this.dragRoad(c, c);
    else if (this.zoning) this.dragZone(this.view.plotToScreen(...h.start), c);
    else if (this.painting()) this.paintAt(c);
  }

  aimUp() {
    if (!this.aimHeld || this.aimHeld.sticky) return;
    this.aimHeld = null;
  }

  aimOrders() {
    if (!this.prefs.crosshair) return;
    this.aimTap = true;
    this.secondary(...this.centre());
    this.aimTap = false;
  }

  key(action) {
    if (action.startsWith("pan")) { this.panKeys.add(action); return; }
    if (action === "select") return this.aimDown();
    if (action === "orders") return this.aimOrders();
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
    if (action === "info") return this.toggleInfo();
    if (action === "upgrade") return this.toggleUpgrade();
    if (action === "army") return this.toggleArmy();
    if (action === "logistics") return this.toggleLogistics();
    if (action === "plan") return this.togglePlanner();
    if (action === "deposits") return this.toggleDeposits();
    if (action === "armies") return this.toggleArmies();
    if (action === "pilot") return this.pilotSelected();
    if (this.picked && ["advance", "claim", "target", "move", "disband"].includes(action)) { this.soldiersPanel.act[action](); return this.updatePanels(); }
    if (this.group && ["advance", "claim", "target", "move", "disband"].includes(action)) { this.groupPanel.act[action](); return this.updatePanels(); }
    if (["advance", "claim", "target", "move", "draw", "split", "merge", "disband"].includes(action)) act[action]();
    if (action === "next") this.nextStack();
    if (action === "home") this.home();
    if (action === "zoomIn") this.zoom(1.6);
    if (action === "zoomOut") this.zoom(1 / 1.6);
    this.updatePanels();
    if (action === "confirm" && this.pinned !== null) return this.confirmBuild();
    if (action === "confirm" && this.routeTo !== null) return this.layRouted(this.routeTo);
    if (action === "cancel") {
      if (this.aimHeld?.sticky) { this.aimHeld = null; if (this.view) this.view.zoneRect = null; this.stroke = null; this.updatePanels(); }
      else if (this.pinned !== null) this.unpin();
      else if (this.routeFrom !== null) this.clearRoute();
      else if (this.building || this.zoning || this.roading) this.stopBuild();
      else if (this.layout.editing) this.layout.stop(true);
      else if (this.away.open) this.away.show(false);
      else if (this.settings.open) this.toggleSettings(false);
      else if (this.adminPanel?.open) this.toggleAdmin(false);
      else if (this.worldInfo.open) this.toggleInfo(false);
      else if (this.upgrade.open) this.toggleUpgrade(false);
      else if (this.army.open) this.toggleArmy(false);
      else if (this.logistics.open) this.toggleLogistics(false);
      else if (this.research.open) this.toggleResearch(false);
      else if (this.planner.open) this.togglePlanner(false);
      else if (this.buildMenu.open) this.toggleBuildMenu(false);
      else if (this.placing) this.togglePlacing(false);
      else if (this.soldiersPanel.choosing) { this.soldiersPanel.cancel(); }
      else if (this.picked) this.pickSoldiers(null);
      else if (this.armies) this.toggleArmies(false);
      else if (this.groupPanel.choosing) { this.groupPanel.cancel(); }
      else if (this.group) this.selectGroup(null);
      else if (this.stack.choosing) this.stack.cancel();
      else if (this.machinePanel.choosing) this.machinePanel.cancel();
      else { this.select(null); this.selectMachine(null); this.selectNation(null); }
    }
  }

  toggleBuildMenu(on = !this.buildMenu.open) {
    if (on && this.town.open) this.town.show(false);
    if (on && this.planner.open) this.togglePlanner(false);
    const me = this.world?.nations.get(this.world.you);
    this.buildMenu.show(on && !!me?.spawned && me.alive && !this.world.frozen);
    if (!this.buildMenu.open) this.stopBuild();
    this.updatePanels();
  }

  toggleSettings(on = !this.settings.open) {
    if (on) { this.away.show(false); this.worldInfo.show(false); this.research.show(false); this.upgrade.show(false); this.army.show(false); this.logistics.show(false); this.adminPanel?.show(false); }
    this.settings.show(on);
    this.updatePanels();
  }

  toggleResearch(on = !this.research.open) {
    if (on) { this.away.show(false); this.worldInfo.show(false); this.upgrade.show(false); this.army.show(false); this.logistics.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    this.research.show(on && !!this.world?.purse?.research);
    this.updatePanels();
  }

  toggleInfo(on = !this.worldInfo.open) {
    if (on) { this.away.show(false); this.research.show(false); this.upgrade.show(false); this.army.show(false); this.logistics.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    this.worldInfo.show(on && !!this.world?.ready);
    this.updatePanels();
  }

  toggleAdmin(on = !this.adminPanel?.open) {
    if (!this.adminPanel) return;
    if (on) { this.away.show(false); this.worldInfo.show(false); this.research.show(false); this.upgrade.show(false); this.army.show(false); this.logistics.show(false); this.settings.show(false); }
    this.adminPanel.show(on && !!this.world?.ready);
    this.updatePanels();
  }

  toggleUpgrade(on = !this.upgrade.open) {
    if (on) { this.away.show(false); this.worldInfo.show(false); this.research.show(false); this.army.show(false); this.logistics.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    const me = this.world?.nations.get(this.world.you);
    this.upgrade.show(on && !!this.world?.purse && !!me?.spawned);
    this.updatePanels();
  }

  toggleArmy(on = !this.army.open) {
    if (on) { this.away.show(false); this.worldInfo.show(false); this.research.show(false); this.upgrade.show(false); this.adminPanel?.show(false); this.settings.show(false); this.logistics.show(false); }
    const me = this.world?.nations.get(this.world.you);
    this.army.show(on && !!this.world?.purse?.army && !!me?.spawned);
    this.updatePanels();
  }

  toggleLogistics(on = !this.logistics.open) {
    if (on) { this.away.show(false); this.worldInfo.show(false); this.research.show(false); this.upgrade.show(false); this.army.show(false); this.adminPanel?.show(false); this.settings.show(false); }
    const me = this.world?.nations.get(this.world.you);
    this.logistics.show(on && !!this.world?.purse?.trade && !!me?.spawned);
    this.updatePanels();
  }

  togglePlanner(on = !this.planner.open) {
    if (on && this.buildMenu.open) this.toggleBuildMenu(false);
    if (on && this.town.open) this.town.show(false);
    const me = this.world?.nations.get(this.world.you);
    this.planner.show(on && !!this.world?.purse && !!me?.spawned && me.alive && !this.world.frozen);
    if (!this.planner.open && this.zoning === "keep") this.stopBuild();
    this.updatePanels();
  }

  toggleKeepClear() {
    if (this.zoning === "keep") return this.stopBuild();
    this.startZone("keep");
    this.toast("Drag over land the planner should leave alone.");
  }

  async keepClear(r) {
    const w = this.world, R = w.planRules ?? {}, side = R.keepSide ?? 128, rects = [...(w.purse?.plan?.keep ?? [])];
    for (let y = r.y; y < r.y + r.h; y += side) for (let x = r.x; x < r.x + r.w; x += side) rects.push([x, y, Math.min(side, r.x + r.w - x), Math.min(side, r.y + r.h - y)]);
    const res = await this.conn.request({ t: "plan", op: "keep", rects });
    if (!res.ok) return this.toast(res.error ?? "could not keep that clear");
    this.toast(`The planner leaves ${r.w} by ${r.h} plots alone.`);
    this.planner.replan(true);
  }

  toggleDeposits() {
    if (!this.view) return;
    this.view.showDeposits = !this.view.showDeposits;
    this.toast(this.view.showDeposits ? "Deposits shown at mid zoom. Grey ones are used up." : "Deposits hidden at mid zoom.");
    this.updatePanels();
  }

  toggleTown(on = !this.town.open) {
    if (on && this.buildMenu.open) this.toggleBuildMenu(false);
    if (on && this.planner.open) this.togglePlanner(false);
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
    this.view.zoneRect = { ...r, code: ["none", "res", "com", "ind", "farm"].indexOf(this.zoning), keep: this.zoning === "keep" };
  }

  async paintZone(a, b) {
    if (!this.view || !this.zoning) return;
    const r = this.zoneRectOf(a, b), zone = this.zoning;
    this.view.zoneRect = null;
    if (zone === "keep") return this.keepClear(r);
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

  startRoad(kind) {
    this.startBuild(null);
    this.roading = kind;
    this.routeFrom = null;
    this.routeTo = null;
    this.updatePanels();
  }

  endRoadDrag(a, b) {
    const pb = this.plotAt(...b);
    if (this.roading !== "none" && (this.roadStroke?.length ?? 0) <= 1 && this.plotAt(...a) === pb) {
      this.roadStroke = null;
      return pb === null ? null : this.routeTap(pb);
    }
    this.dragRoad(a, b);
    return this.layRoad();
  }

  routeTap(plot) {
    if (this.routeFrom === null || plot === this.routeFrom) {
      this.routeFrom = plot;
      this.routeTo = null;
      this.previewRoute(plot);
      return this.updatePanels();
    }
    if (plot === this.routeTo || this.placeMode() === "click") return this.layRouted(plot);
    this.routeTo = plot;
    this.previewRoute(plot);
    this.updatePanels();
  }

  previewRoute(to) {
    const w = this.world;
    if (!w || this.routeFrom === null || to === null) { this.roadPreview = null; if (this.view) this.view.roadPlan = null; return null; }
    const blocked = i => { const b = w.buildingAt(i); return !!b && b.state !== "rubble"; };
    if (this.roading === "pole") {
      const plan = to === this.routeFrom ? { plots: [], line: [to], cost: {}, start: true } : this.planPoles([this.routeFrom, to]);
      this.roadPreview = plan;
      if (this.view) this.view.roadPlan = { line: plan.line ?? [this.routeFrom], ok: !plan.error, poles: plan.plots };
      return plan;
    }
    const plan = to === this.routeFrom ? { plots: [], line: [to], cost: {}, start: true } : routePlan({ w: w.w, terrain: w.terrain, road: w.roads, owner: w.owner, blocked }, w.you, this.routeFrom, to, this.roading, w.roadRules ?? undefined, w.roadRules?.scale ?? 1);
    this.roadPreview = plan;
    if (this.view) this.view.roadPlan = { line: plan.line ?? [this.routeFrom], ok: !plan.error };
    return plan;
  }

  clearRoute() {
    this.routeFrom = null;
    this.routeTo = null;
    this.routeHover = null;
    this.roadPreview = null;
    if (this.view) this.view.roadPlan = null;
    this.updatePanels();
  }

  planPoles(pts) {
    const w = this.world, pole = w.defs.table.power_pole;
    const blocked = i => { const b = w.buildingAt(i); return !!b && b.state !== "rubble"; };
    const plan = polePlan({ w: w.w, terrain: w.terrain, owner: w.owner, road: w.roads, blocked }, w.you, pts, w.powerRules);
    if (plan.error) return { ...plan, plots: [], cost: {}, pts, line: plan.line ?? roadLine(w.w, pts) };
    return { plots: plan.poles, gaps: plan.gaps, cost: Object.fromEntries(Object.entries(pole.cost).map(([k, v]) => [k, v * plan.poles.length])), pts, line: plan.line };
  }

  async layPoles(pts) {
    const r = await this.conn.request({ t: "poles", via: pts });
    if (!r.ok) return this.toast(r.error ? r.error[0].toUpperCase() + r.error.slice(1) + "." : "Could not place the poles.");
    this.toast(`Placed ${r.placed} power ${r.placed === 1 ? "pole" : "poles"}${r.skipped ? ` (${r.total - r.placed} could not go up: ${r.skipped})` : ""}${r.gaps ? `; the line has ${r.gaps} ${r.gaps === 1 ? "gap" : "gaps"} where no pole fits` : ""}.`);
  }

  async layRouted(to) {
    const from = this.routeFrom, kind = this.roading, plan = this.previewRoute(to);
    this.clearRoute();
    if (!plan || from === null) return;
    if (kind === "pole") return plan.error ? this.toast(plan.error[0].toUpperCase() + plan.error.slice(1) + ".") : this.layPoles([from, to]);
    if (plan.error) return this.toast(plan.error[0].toUpperCase() + plan.error.slice(1) + ".");
    if (!plan.plots.length) return this.toast("That road is already there.");
    const r = await this.conn.request({ t: "road", kind, from, to });
    if (!r.ok) return this.toast(r.error ? r.error[0].toUpperCase() + r.error.slice(1) + "." : "Could not lay the road.");
    this.toast(`Laid ${r.laid} plots of ${ROAD_NAMES[kind].toLowerCase()} for ${costText(r.cost)}${r.bridges ? `, ${r.bridges} of them bridges` : ""}.`);
  }

  async connectStores(kind, dry, keep) {
    const r = await this.conn.request({ t: "connect", kind, dry, ...(keep !== undefined ? { keep } : {}) });
    if (!r.ok) { this.toast(r.error ? r.error[0].toUpperCase() + r.error.slice(1) + "." : "Could not plan the roads."); return r; }
    if (!dry) this.toast(r.laid ? `Laid ${r.laid} plots of road for ${costText(r.cost)}, linking ${r.joined} ${r.joined === 1 ? "building" : "buildings"} to your capital.` : "Your barracks, ports and stations are already on your roads.");
    return r;
  }

  dragRoad(a, b) {
    if (!this.view || !this.roading) return;
    const p = this.plotAt(...b);
    if (!this.roadStroke) { const s = this.plotAt(...a); this.roadStroke = s === null ? [] : [s]; }
    if (p !== null && this.roadStroke[this.roadStroke.length - 1] !== p) this.roadStroke.push(p);
    if (this.roadStroke.length > 1 && this.routeFrom !== null) { this.routeFrom = null; this.routeTo = null; }
    this.roadPreview = this.planRoad();
    this.view.roadPlan = this.roadPreview && { line: this.roadPreview.line, ok: !this.roadPreview.error, poles: this.roading === "pole" ? this.roadPreview.plots : null };
  }

  planRoad() {
    const w = this.world, stroke = this.roadStroke;
    if (!stroke?.length) return null;
    const pts = simplifyPath(stroke.map(i => [i % w.w, (i / w.w) | 0]), w.roadRules?.maxPoints ?? 64).map(([x, y]) => y * w.w + x);
    if (this.roading === "pole") return this.planPoles(pts);
    const blocked = i => { const b = w.buildingAt(i); return !!b && b.state !== "rubble"; };
    const plan = roadPlan({ w: w.w, terrain: w.terrain, road: w.roads, owner: w.owner, blocked }, w.you, pts, this.roading, w.roadRules ?? undefined, w.roadRules?.scale ?? 1);
    return { ...plan, pts, line: roadLine(w.w, pts) };
  }

  async layRoad() {
    const plan = this.planRoad(), kind = this.roading;
    this.roadStroke = null;
    this.roadPreview = null;
    if (this.view) this.view.roadPlan = null;
    this.updatePanels();
    if (!plan) return;
    if (plan.error) return this.toast(plan.error[0].toUpperCase() + plan.error.slice(1) + ".");
    if (kind === "pole") return this.layPoles(plan.pts);
    if (!plan.plots.length) return this.toast(kind === "none" ? "There is no road of yours there." : "That road is already there.");
    const r = await this.conn.request({ t: "road", kind, via: plan.pts });
    if (!r.ok) return this.toast(r.error ? r.error[0].toUpperCase() + r.error.slice(1) + "." : "Could not lay the road.");
    this.toast(kind === "none" ? `Removed ${r.laid} plots of road.` : `Laid ${r.laid} plots of ${ROAD_NAMES[kind].toLowerCase()} for ${costText(r.cost)}${r.bridges ? `, ${r.bridges} of them bridges` : ""}.`);
  }

  startBuild(type) {
    this.togglePlacing(false);
    if (this.aimHeld?.sticky) this.aimHeld = null;
    this.stack.cancel();
    this.select(null);
    this.zoning = null;
    this.roading = null;
    this.roadStroke = null;
    if (this.view) this.view.roadPlan = null;
    if (this.view) { this.view.showZones = false; this.view.zoneRect = null; }
    this.building = type;
    const def = type && this.world?.defs.table[type];
    this.ghostAt = def && this.buildPlot != null ? this.placeAnchor(this.buildPlot, def) : null;
    this.pinned = this.ghostAt !== null && this.placeMode() === "confirm" && !this.painting() ? this.ghostAt : null;
    this.buildPlot = null;
    this.updatePanels();
  }

  stopBuild() {
    this.building = null;
    this.routeFrom = null;
    this.routeTo = null;
    this.roadPreview = null;
    if (this.aimHeld?.sticky) this.aimHeld = null;
    this.pinned = null;
    this.stroke = null;
    this.zoning = null;
    this.roading = null;
    this.roadStroke = null;
    if (this.view) { this.view.showZones = false; this.view.zoneRect = null; this.view.roadPlan = null; }
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
    const anchor = this.pinned ?? (plot !== null ? this.placeAnchor(plot, def) : this.ghostAt);
    this.view.ghost = anchor === null ? null : { def, anchor, reason: this.world.placeError(def.id, anchor) };
  }

  placeMode() { return this.prefs.place === "click" ? "click" : "confirm"; }
  painting() { return !!this.building && !!this.prefs.paint; }

  setPref(key, value) {
    this.prefs[key] = value;
    savePrefs(this.prefs);
    if (key === "paint" || key === "place") this.pinned = null;
    if (key === "crosshair") { this.hover = null; this.aimUp(); }
    this.updatePanels();
  }

  async buildAt(plot) {
    const def = this.world.defs.table[this.building];
    const anchor = this.placeAnchor(plot, def);
    if (this.placeMode() === "confirm") {
      if (this.pinned === anchor) return this.confirmBuild();
      this.pinned = anchor;
      return this.updatePanels();
    }
    if (!this.hover && this.ghostAt !== anchor) { this.ghostAt = anchor; return; }
    await this.placeAt(anchor);
  }

  async placeAt(anchor) {
    const def = this.world.defs.table[this.building];
    const why = this.world.placeError(def.id, anchor);
    if (why) { this.toast(why); return false; }
    const r = await this.conn.request({ t: "build", type: def.id, at: anchor });
    if (!r.ok) { this.toast(r.error ?? "could not build there"); return false; }
    this.ghostAt = null;
    return true;
  }

  async confirmBuild() {
    if (this.pinned === null || !this.building) return;
    if (await this.placeAt(this.pinned)) this.pinned = null;
    this.updatePanels();
  }

  unpin() {
    this.pinned = null;
    this.ghostAt = null;
    this.updatePanels();
  }

  paintAt(pt, end = false) {
    const w = this.world, def = this.building && w?.defs.table[this.building];
    if (!def || !this.view) return;
    const s = (this.stroke ??= { last: null, tried: new Set(), pending: new Set(), queue: [], stopped: false, sending: false, placed: 0 });
    const to = pt ? this.view.screenToPlot(...pt) : null;
    if (to) {
      const from = s.last ?? to, steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) * 2));
      for (let k = 0; k <= steps; k++) {
        const x = Math.floor(from[0] + ((to[0] - from[0]) * k) / steps), y = Math.floor(from[1] + ((to[1] - from[1]) * k) / steps);
        if (x >= 0 && y >= 0 && x < w.w && y < w.h) this.paintPlot(y * w.w + x, def, s);
      }
      s.last = to;
    }
    if (end) this.stroke = null;
  }

  paintPlot(plot, def, s) {
    const w = this.world, anchor = this.placeAnchor(plot, def);
    if (s.stopped || s.tried.has(anchor)) return;
    s.tried.add(anchor);
    const fp = [];
    for (let dy = 0; dy < def.fp[1]; dy++) for (let dx = 0; dx < def.fp[0]; dx++) fp.push(anchor + dy * w.w + dx);
    if (fp.some(i => s.pending.has(i)) || w.placeError(def.id, anchor)) return;
    for (const i of fp) s.pending.add(i);
    s.queue.push(anchor);
    this.pump(s, def);
  }

  async pump(s, def) {
    if (s.sending) return;
    s.sending = true;
    while (s.queue.length && !s.stopped && !this.left) {
      const r = await this.conn.request({ t: "build", type: def.id, at: s.queue.shift() });
      if (r.ok) s.placed++;
      else if (/you have/.test(r.error ?? "")) { s.stopped = true; this.toast(`Painting stopped after ${s.placed}: ${r.error}.`); }
    }
    s.sending = false;
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
    if (!this.placing && !this.building && !this.zoning && !this.roading) this.stack.trace(line);
  }

  traced(line) {
    if (line && this.placing) return this.togglePlacing(false);
    if (line && (this.building || this.zoning || this.roading)) return this.stopBuild();
    return this.stack.traceEnd(line);
  }

  secondary(sx, sy) {
    if (this.prefs.crosshair && !this.aimTap) return;
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    if (this.placing) return this.togglePlacing(false);
    if (this.pinned !== null) return this.unpin();
    if (this.building || this.zoning || this.roading) return this.stopBuild();
    this.stack.cancel();
    this.machinePanel.cancel();
    const w = this.world, me = w.nations.get(w.you);
    if (!me?.spawned || !me.alive || w.frozen) return this.tip.pin(sx, sy);
    const u = w.machines.get(this.selectedMachine), s = w.stacks.get(this.selected);
    const items = u && u.owner === w.you ? this.machinePanel.ringFor(plot, sx, sy) : this.picked ? this.soldiersPanel.ringFor(plot) : this.group ? this.groupPanel.ringFor(plot) : s && s.owner === w.you ? this.stack.ringFor(plot, sx, sy) : ownerItems(this, plot, sx, sy);
    if (!items.length) return this.tip.pin(sx, sy);
    this.ring.show(sx, sy, [...items, { id: "info", label: "Info", icon: "ui_info", run: () => this.tip.pin(sx, sy, 5000) }]);
  }

  async attackAt(plot) {
    const w = this.world, o = w.owner[plot];
    const r = await this.conn.request({ t: "attack", at: plot, share: this.hud.share });
    if (!r.ok) return this.toast(r.error ?? "could not attack");
    const s = w.stacks.get(r.stack);
    this.toast(`${s ? `${Math.round(s.troops)} troops go` : "A stack goes"}${r.boat ? " by boat" : ""} to take ${o ? `${w.nations.get(o)?.name ?? "their"}'s land` : "unclaimed land"}${r.boat ? `, losing about ${Math.round(r.loss * 100)}% as they land` : ""}.`);
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
    if (this.piloting) {
      if (this.lastPointer !== "mouse") { const [px, py] = this.view.screenToPlot(sx, sy); this.tapAim = [px, py]; this.tapFireUntil = performance.now() + 200; }
      return;
    }
    if (this.prefs.crosshair && !this.aimTap) return;
    const w = this.world, v = this.view;
    const plot = this.plotAt(sx, sy);
    if (plot === null) return;
    const x = plot % w.w, y = (plot / w.w) | 0;
    if (this.roading && this.roading !== "none") return this.routeTap(plot);
    if (this.roading) { this.roadStroke = null; this.dragRoad([sx, sy], [sx, sy]); return this.layRoad(); }
    if (this.zoning) return this.paintZone([sx, sy], [sx, sy]);
    if (this.building) return this.buildAt(plot);
    if (this.placing) {
      if (w.owner[plot] !== w.you) return this.toast("Pick a plot of your own land.");
      return this.formAt(plot);
    }
    if (this.soldiersPanel.choosing) return this.soldiersPanel.pick(plot);
    if (this.armies) return this.armyTap(sx, sy);
    if (this.groupPanel.choosing) return this.groupPanel.pick(plot);
    if (this.stack.choosing) return this.stack.pickTarget(plot, sx, sy);
    if (this.machinePanel.choosing) return this.machinePanel.pick(plot, sx, sy);
    const hit = v.stackAt(sx, sy), mh = v.machineAt(sx, sy);
    const under = [...(hit !== null ? [["stack", hit]] : []), ...(mh !== null ? [["machine", mh]] : [])];
    if (under.length) {
      const now = under.findIndex(([kind, id]) => (kind === "stack" ? this.selected : this.selectedMachine) === id);
      const [kind, id] = under[(now + 1) % under.length];
      return kind === "stack" ? this.select(id) : this.selectMachine(id);
    }
    const me = w.nations.get(w.you);
    if (me && !me.spawned && !w.frozen) return this.spawn.tryAt(x, y);
    const b = w.buildingAt(plot);
    if (b) return this.selectBuilding(b.id);
    this.selectGroup(null);
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

  swipeStart(sx, sy, e) {
    if (this.prefs.crosshair || this.building || this.zoning || this.roading || this.placing || this.stack.choosing || this.machinePanel.choosing || this.groupPanel.choosing || this.soldiersPanel.choosing || !this.view || !this.world?.ready || this.world.frozen) return null;
    if (this.armies && this.world.soldierRules) return e.shiftKey && e.pointerType === "mouse" ? "soldierBox" : "soldiers";
    if (e.shiftKey && e.pointerType === "mouse") return "box";
    const id = this.view.stackAt(sx, sy);
    return id !== null && this.world.stacks.get(id)?.owner === this.world.you ? "swipe" : null;
  }

  stacksBy(kind, line) {
    const v = this.view, w = this.world, R = 22 * (v.ratio ?? 1), lift = v.markerLift(v.cam.scale / 16), [a, b] = [line[0], line[line.length - 1]];
    const seg = (px, py, p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - p[0]) * dx + (py - p[1]) * dy) / len)) : 0;
      return Math.hypot(px - p[0] - t * dx, py - p[1] - t * dy);
    };
    const near = (px, py) => line.some((p, n) => (n ? seg(px, py, line[n - 1], p) : Math.hypot(px - p[0], py - p[1])) <= R);
    const inBox = (px, py) => px >= Math.min(a[0], b[0]) && px <= Math.max(a[0], b[0]) && py >= Math.min(a[1], b[1]) && py <= Math.max(a[1], b[1]);
    return w.myStacks().filter(s => {
      const [mx, my] = v.plotToScreen((s.pos % w.w) + 0.5, Math.floor(s.pos / w.w) + 0.5);
      return kind === "box" ? inBox(mx, my) || inBox(mx, my - lift) : near(mx, my) || near(mx, my - lift);
    }).map(s => s.id);
  }

  soldierHit(sx, sy, test) {
    const v = this.view, w = this.world, out = new Map();
    for (const s of w.myStacks()) {
      for (const p of v.soldierSpots(s)) {
        const [px, py] = v.plotToScreen(p.x, p.y);
        if (!test(px, py)) continue;
        let set = out.get(s.id);
        if (!set) out.set(s.id, (set = new Set()));
        set.add(p.slot);
      }
    }
    return out;
  }

  soldiersBy(kind, line) {
    const v = this.view, R = Math.max(12 * (v.ratio ?? 1), v.cam.scale * 0.3), [a, b] = [line[0], line[line.length - 1]];
    if (kind === "soldierBox") return this.soldierHit(0, 0, (px, py) => px >= Math.min(a[0], b[0]) && px <= Math.max(a[0], b[0]) && py >= Math.min(a[1], b[1]) && py <= Math.max(a[1], b[1]));
    const seg = (px, py, p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - p[0]) * dx + (py - p[1]) * dy) / len)) : 0;
      return Math.hypot(px - p[0] - t * dx, py - p[1] - t * dy);
    };
    return this.soldierHit(0, 0, (px, py) => line.some((p, n) => (n ? seg(px, py, line[n - 1], p) : Math.hypot(px - p[0], py - p[1])) <= R));
  }

  pilotKey(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const dir = { w: "up", ArrowUp: "up", s: "down", ArrowDown: "down", a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" }[k];
    if (dir) { if (down) this.pilotKeys.add(dir); else this.pilotKeys.delete(dir); return true; }
    if (k === " ") { this.keyFire = down; return true; }
    if (k === "b" && down) { this.pilotBomb = true; return true; }
    if (k === "b") return true;
    if (down && (k === "Escape" || actionFor(this.keys, e) === "pilot")) { this.stopPilot(); return true; }
    return false;
  }

  reachOf(kind, id) {
    const w = this.world, scale = w.map?.scale ?? 1;
    if (kind === "s") return (w.pilotRules?.range ?? 2) * scale;
    return Math.max(1, Math.round((w.machines.get(id)?.def.range ?? 1) * scale));
  }

  async startPilot(kind, id, follow = []) {
    const r = await this.conn.request({ t: "pilot", op: "take", [kind === "s" ? "stack" : "machine"]: id, follow });
    if (!r.ok) return this.toast(r.error ?? "could not take control");
    const w = this.world;
    this.piloting = { kind, id, key: `${kind}:${id}`, since: performance.now(), reach: this.reachOf(kind, id) };
    if (this.armies) this.toggleArmies(false);
    this.pilotKeys.clear();
    this.pilotSent = { json: "", at: 0 };
    this.pilotPanel.show(true);
    const at = kind === "s" ? w.stacks.get(id)?.pos : w.machines.get(id)?.at;
    if (at !== undefined) this.focus(at, Math.max(this.view.cam.scale / (this.view.ratio ?? 1), 24));
    if (r.followers) this.toast(`${r.followers} more ${r.followers === 1 ? "company follows" : "companies follow"} it.`);
    this.updatePanels();
  }

  async stopPilot(send = true) {
    if (!this.piloting) return;
    this.piloting = null;
    this.pilotKeys.clear();
    this.mouseFire = this.keyFire = false;
    this.pilotPanel.show(false);
    this.updatePanels();
    if (send) await this.conn.request({ t: "pilot", op: "release" });
  }

  pilotSelected() {
    const w = this.world;
    if (this.piloting) return this.stopPilot();
    if (this.picked) return this.soldiersPanel.act.pilot();
    const u = w.machines.get(this.selectedMachine);
    if (u && u.owner === w.you) return this.startPilot("m", u.id);
    if (this.group) {
      const list = [...this.group].map(id => w.stacks.get(id)).filter(s => s && s.owner === w.you);
      if (list.length) { const big = list.reduce((a, b) => (b.troops > a.troops ? b : a)); return this.startPilot("s", big.id, list.filter(s => s !== big).map(s => s.id)); }
    }
    const s = w.stacks.get(this.selected);
    if (s && s.owner === w.you) return this.startPilot("s", s.id);
    this.toast("Select one of your companies or machines to pilot.");
  }

  nearestAhead(pos, p) {
    const w = this.world, v = this.view, head = w.pilots.get(p.key)?.heading ?? 0, hx = Math.cos(head), hy = Math.sin(head);
    let best = null, bd = Infinity;
    const consider = (x, y) => {
      const dx = x - pos[0], dy = y - pos[1], d = Math.hypot(dx, dy);
      if (d > p.reach + 0.5) return;
      const score = d - ((dx * hx + dy * hy) / (d || 1)) * 2;
      if (score < bd) { bd = score; best = [x, y]; }
    };
    for (const s of w.stacks.values()) if (s.owner !== w.you) consider(...v.stackPoint(s));
    for (const u of w.machines.values()) if (u.owner !== w.you && u.state !== "wreck") consider(...v.machinePoint(u));
    return best ?? [pos[0] + hx * p.reach, pos[1] + hy * p.reach];
  }

  pilotFrame() {
    const p = this.piloting, w = this.world, v = this.view;
    if (!p || !w || !v) return;
    const unit = p.kind === "s" ? w.stacks.get(p.id) : w.machines.get(p.id), now = performance.now();
    if (!unit || unit.state === "wreck" || (!w.pilots.has(p.key) && now - p.since > 2500)) {
      this.stopPilot(false);
      return this.toast(unit && unit.state !== "wreck" ? "You let go: it holds where it stands." : "What you were piloting is gone.");
    }
    const pos = w.pilotAt(p.key) ?? (p.kind === "s" ? v.stackPoint(unit) : v.machinePoint(unit));
    v.cam.x += (pos[0] - v.cam.x) * 0.15;
    v.cam.y += (pos[1] - v.cam.y) * 0.15;
    v.clampCamera();
    const k = this.pilotKeys, st = this.pilotPanel.state;
    let mx = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0), my = (k.has("down") ? 1 : 0) - (k.has("up") ? 1 : 0);
    if (st.move[0] || st.move[1]) [mx, my] = st.move;
    let aim = null, fire = false;
    if (st.aim) { const len = Math.hypot(st.aim[0], st.aim[1]) || 1; aim = [pos[0] + (st.aim[0] / len) * p.reach, pos[1] + (st.aim[1] / len) * p.reach]; fire = st.firing; }
    else if (this.pilotPanel.takeTap()) { this.tapAim = this.nearestAhead(pos, p); this.tapFireUntil = now + 200; }
    if (!aim && this.tapFireUntil > now) { aim = this.tapAim; fire = true; }
    if (!aim && this.hover && !this.prefs.crosshair) aim = v.screenToPlot(...this.hover);
    if (this.mouseFire || this.keyFire) fire = true;
    const r2 = x => Math.round(x * 100) / 100;
    const msg = { move: [r2(mx), r2(my)], aim: aim ? [r2(aim[0]), r2(aim[1])] : null, fire };
    const json = JSON.stringify(msg), since = now - this.pilotSent.at, bomb = this.pilotBomb || this.pilotPanel.takeBomb();
    this.pilotBomb = false;
    if (bomb || (json !== this.pilotSent.json && since >= 50) || ((mx || my || fire) && since >= 250) || since >= 5000) {
      this.conn.send({ t: "pilot", op: "input", ...msg, ...(bomb ? { bomb: true } : {}) });
      this.pilotSent = { json, at: now };
    }
  }

  toggleArmies(on = !this.armies) {
    const me = this.world?.nations.get(this.world.you);
    this.armies = !!on && !!me?.spawned && me.alive && !this.world.frozen && !!this.world.soldierRules;
    if (this.armies) { if (this.placing) this.togglePlacing(false); if (this.building || this.zoning || this.roading) this.stopBuild(); }
    this.updatePanels();
  }

  pickSoldiers(map) {
    this.picked = map && [...map.values()].some(s => s.size) ? map : null;
    if (this.view) this.view.picked = this.picked;
    this.soldiersPanel?.cancel();
    if (this.picked) {
      if (this.group) { this.group = null; if (this.view) this.view.group = null; }
      if (this.selected !== null) { this.selected = null; if (this.view) this.view.selected = null; }
      this.selectMachine(null);
      this.selectBuilding(null);
      this.nationCard?.show(null);
    }
    this.updatePanels();
  }

  armyTap(sx, sy) {
    const v = this.view, w = this.world, R = Math.max(14 * (v.ratio ?? 1), v.cam.scale * 0.35);
    let best = null, bd = R;
    for (const s of w.myStacks()) for (const p of v.soldierSpots(s)) {
      const [px, py] = v.plotToScreen(p.x, p.y), d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = { stack: s, slot: p.slot }; }
    }
    if (!best) return this.pickSoldiers(null);
    const picked = new Map([...(this.picked ?? [])].map(([id, set]) => [id, new Set(set)]));
    if (picked.get(best.stack.id)?.has(best.slot)) {
      const kind = this.soldierKind(best.stack, best.slot), W = canvas.width, H = canvas.height;
      const all = this.soldierHit(0, 0, (px, py) => px >= 0 && py >= 0 && px <= W && py <= H);
      for (const [id, slots] of all) {
        const s = w.stacks.get(id);
        for (const k of slots) if (this.soldierKind(s, k) === kind) { if (!picked.has(id)) picked.set(id, new Set()); picked.get(id).add(k); }
      }
    } else {
      if (!picked.has(best.stack.id)) picked.set(best.stack.id, new Set());
      picked.get(best.stack.id).add(best.slot);
    }
    this.pickSoldiers(picked);
  }

  soldierKind(s, slot) {
    return typeOfSlot(soldierTypes(s.troops, s.mix, this.world.soldierRules.troopsEach), slot);
  }

  swiping(kind, line) {
    if (!this.view) return;
    if (kind === "soldiers" || kind === "soldierBox") {
      this.view.swipe = { kind: kind === "soldierBox" ? "box" : "swipe", line };
      this.view.picked = this.soldiersBy(kind, line);
      return;
    }
    this.view.swipe = { kind, line };
    this.view.groupPreview = new Set(this.stacksBy(kind, line));
  }

  swiped(kind, line) {
    if (this.view) { this.view.swipe = null; this.view.groupPreview = null; }
    if (kind === "soldiers" || kind === "soldierBox") return this.pickSoldiers(line && this.view ? this.soldiersBy(kind, line) : this.picked);
    if (!line || !this.view) return;
    const ids = this.stacksBy(kind, line);
    if (ids.length === 1) return this.select(ids[0]);
    if (ids.length > 1) this.selectGroup(ids);
  }

  selectGroup(ids, single = null) {
    this.group = ids?.length >= 2 ? new Set(ids) : null;
    if (this.view) this.view.group = this.group;
    this.groupPanel?.cancel();
    if (this.group) {
      if (this.picked) { this.picked = null; if (this.view) this.view.picked = null; }
      this.select(null);
      this.selectMachine(null);
      this.selectBuilding(null);
      this.nationCard?.show(null);
    } else if (single !== null) this.select(single);
    this.updatePanels();
  }

  select(id) {
    if (id !== null && this.group) { this.group = null; if (this.view) this.view.group = null; }
    if (id !== null && this.picked) { this.picked = null; if (this.view) this.view.picked = null; }
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

  powerOverlay() {
    const w = this.world, v = this.view;
    if (!v || !w?.powerRules) return;
    const sel = this.selectedBuilding !== null ? w.buildings.get(this.selectedBuilding) : null, d = sel?.def;
    const show = this.roading === "pole" || (this.buildMenu?.open && this.buildMenu.tab === "energy") || (sel?.owner === w.you && !!(d?.power || d?.pole || d?.uses));
    if (!show) { v.powerCover = null; this.powerAt = 0; return; }
    if (performance.now() - (this.powerAt ?? 0) < 2000) return;
    this.powerAt = performance.now();
    this.grid ??= new Grid(w.w, w.h);
    const scale = w.powerRules.scale ?? 1, plants = w.purse?.power?.plants ?? {};
    const nodes = [...w.buildings.values()].filter(b => b.owner === w.you && b.state === "active" && (b.def?.power || b.def?.pole) && w.owner[b.anchor] === w.you)
      .map(b => ({ id: b.id, at: b.anchor, reach: (b.def.power?.reach ?? b.def.pole.reach) * scale, make: b.def.power?.make ?? 0 }));
    const { grids } = gridsOf(this.grid, nodes, []), on = new Set();
    for (const g of grids) if (g.nodes.some(n => n.make > 0 && plants[n.id]?.[0])) for (const n of g.nodes) on.add(n.id);
    v.powerCover = coverOf(this.grid, nodes, n => on.has(n.id));
  }

  updatePanels() {
    if (this.left) return;
    this.powerOverlay();
    if (this.picked && this.world) {
      for (const id of this.picked.keys()) if (this.world.stacks.get(id)?.owner !== this.world.you) this.picked.delete(id);
      if (!this.picked.size) { this.picked = null; if (this.view) this.view.picked = null; }
    }
    for (const p of [this.hud, this.spawn, this.guide, this.nations, this.feed, this.attacks, this.stack, this.groupPanel, this.soldiersPanel, this.pilotPanel, this.notices, this.buildMenu, this.buildingPanel, this.town, this.planner, this.research, this.upgrade, this.army, this.logistics, this.machinePanel, this.nationCard, this.aim, this.tip, this.adminPanel, this.worldInfo]) p?.update();
  }

  leave() {
    this.left = true;
    this.conn.close();
    this.ring.destroy();
    this.settings.destroy();
    clearInterval(this.ui);
    removeEventListener("resize", this.onResize);
    removeEventListener("keydown", this.onKey);
    removeEventListener("keyup", this.onKeyUp);
    removeEventListener("blur", this.onBlur);
    removeEventListener("wheel", this.onWheel);
    removeEventListener("gesturestart", this.onGesture);
    this.onLeave();
  }
}

function showScreen(which) {
  screen.hidden = which !== "screen";
  gameRoot.hidden = which !== "game";
}

let menu = null;
const menuShell = () => (menu ??= createMenu(screen));

async function worlds(account) {
  showScreen("screen");
  history.replaceState(null, "", location.pathname);
  const m = menuShell();
  await showWorlds(m.body, account, {
    live: m.live,
    onOpen: (id, name) => enter(id, name, account),
    onLogout: async () => { await api("/api/logout", {}); session.token = ""; start(); },
  });
}

function enter(id, name, account) {
  menu?.stop();
  menu = null;
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
  const m = menuShell();
  m.live.scenery();
  showLogin(m.body, account => worlds(account));
}

start();
