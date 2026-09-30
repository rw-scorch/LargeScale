import { DurableObject } from "cloudflare:workers";
import { World as Sim } from "./sim/territory.js";
import { makeTestMap } from "./shared/testmap.js";
import { isLand } from "./shared/terrain.js";
import { cropRect, cropLayer, baseLayer, terrainDiff } from "./shared/maps.js";
import { PROTOCOL, MSG, CLOSE, frame, partFrames } from "./shared/protocol.js";
import { encodeRuns, decodeRuns, splitParts, joinParts, gzip, gunzip, hashBytes, hashRuns } from "./shared/codec.js";
import { parseWorldConfig, defaultBots, scaledRules, MIN_MAP_SIDE, MAX_PLOTS, BASE_WIDTH } from "./worldconfig.js";
import rules from "../data/rules.json" with { type: "json" };
import { planCatchUp, runCatchUp, standingOrders, startAway, endAway, recordAway, awaySummary, OFFLINE } from "./sim/offline.js";
import { installCombat } from "./sim/combat.js";
import { installTroops, TROOP_RULES, armyView } from "./sim/troops.js";
import unitData from "../data/units.json" with { type: "json" };
import { installBots, spawnBots, BOT } from "./sim/bots.js";
import { installGuard } from "./sim/guard.js";
import { installOvertime } from "./sim/overtime.js";
import { cleanSchedule, phaseAt, EVENTS, EVENT_NAMES } from "./shared/schedule.js";
import { installBuildings, saveLayers, restoreLayers, encodeBuildings } from "./sim/buildings.js";
import { installConstruction } from "./sim/construction.js";
import { installEconomy, convertToGold } from "./sim/economy.js";
import { installSoldiers, trimField, fieldOf } from "./sim/soldiers.js";
import { installPilot, pilotStep, pilotRows, takeShots, steer, pilotOf, release as releasePilot } from "./sim/pilot.js";
import { installAir, samView } from "./sim/air.js";
import { installCivilians, takeZoneNews } from "./sim/civilians.js";
import { installRoads, restoreRoads, takeRoadNews } from "./sim/logistics.js";
import { installBoats } from "./sim/boats.js";
import { installTrade, tradeView } from "./sim/trade.js";
import { installPower, powerView } from "./sim/power.js";
import { installAutoRoads } from "./sim/autoroads.js";
import { installPlanner, planSummary, planQueue, takePlanNews, PLAN_RULES } from "./sim/planner.js";
import { installResources, restoreLand, encodeLand, takeTerrainNews, depletedPlots, generateDeposits, DEPOSIT_IDS, DEPOSIT_TABLE } from "./sim/resources.js";
import { installResearch, researchView, TREE } from "./sim/research.js";
import { installMachines, saveMachines, machineOrdersOf } from "./sim/units.js";
import { installEffects } from "./sim/effects.js";
import { decodeDeposits, cropDeposits, encodeDeposits, emptyDeposits, latitudeOf, seasonAt } from "./shared/deposits.js";
import { encodeRows } from "./shared/buildings.js";
import buildingData from "../data/buildings.json" with { type: "json" };
import { makeRng } from "./shared/rng.js";
import { runOrder, RateLimit, applyPresence, victory, mostLand, DIPLO_EVENTS, StateFeed, BuildingFeed, purseOf, publicEvents, ordersOf, vitalsOf } from "./game.js";
import { NotifyQueue, formatBatch, prefsFor, wants } from "./notify.js";
import { runAdmin, parseSpeed, cleanName, ADMIN_RULES, adminAllowed, cleanPowers, POWERS } from "./admin.js";
import { installCheats } from "./sim/cheats.js";
import { installNavy } from "./sim/navy.js";
import { installNukes, nukeView, flightsOf, NUKE_RULES } from "./sim/nukes.js";
import { installTourism, tourismView, TOURISM_RULES } from "./sim/tourism.js";
import { installCbd } from "./sim/cbd.js";
import { installDiplomacy, DIPLO } from "./sim/diplomacy.js";
import { installNotes, notesFor, NOTES } from "./sim/notes.js";
import { postWebhook, directMessage, mention } from "./discord.js";

const SAVE_VERSION = 4;
const LOADS = [2, 3, 4];
const ROW_BYTES = 1_000_000;
const SAVE_EVERY_MS = 30000;
const SEASON_SECONDS = rules.seasons.dayLengthMinutes * 60 * rules.seasons.daysPerSeason;
const COLOURS = ["#e0413a", "#f08a24", "#d63fbf", "#f2d02b", "#8e4fe0", "#f4f4f4", "#ff7ab8", "#1f1f1f"];

const RECORD = new Set([...DIPLO_EVENTS, "eliminated", "era_up", "wonder_built", "nuke_launched", "nuke_detonated", "capital_moved", "victory"]);

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sim = null;
    this.loop = null;
    this.lastSave = 0;
    this.accounts = new Map();
    this.queue = new NotifyQueue();
    this.limiter = new RateLimit(rules.world.messagesPerSecond, rules.world.messageBurst);
    this.pilotLimiter = new RateLimit(rules.pilot.inputsPerSecond, rules.pilot.inputsPerSecond);
    this.feed = new StateFeed(rules.world.botTroopShare, rules.world.botStateEvery);
    this.bfeed = new BuildingFeed();
    this.purses = new Map();
    this.tickCount = 0;
    this.speed = 1;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
        CREATE TABLE IF NOT EXISTS chunks (layer TEXT, idx INTEGER, data BLOB, PRIMARY KEY (layer, idx));
        CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, who TEXT, text TEXT);
        CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, who TEXT, op TEXT, detail TEXT);
        CREATE TABLE IF NOT EXISTS record (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, g REAL, type TEXT, data TEXT);
        CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, g REAL, w INTEGER, h INTEGER, names TEXT, data BLOB);
      `);
      const cols = new Set(ctx.storage.sql.exec("PRAGMA table_info(chat)").toArray().map(r => r.name));
      for (const [c, type] of [["ch", "TEXT"], ["fid", "INTEGER"], ["a", "INTEGER"], ["b", "INTEGER"]]) if (!cols.has(c)) ctx.storage.sql.exec(`ALTER TABLE chat ADD COLUMN ${c} ${type}`);
      await this.load();
    });
  }

  meta(k, v) {
    if (this.deleted) return v === undefined ? null : 0;
    if (v === undefined) return JSON.parse(this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0]?.v ?? "null");
    return this.ctx.storage.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v)).rowsWritten;
  }

  readRows(layer) {
    const rows = this.ctx.storage.sql.exec("SELECT data FROM chunks WHERE layer = ? ORDER BY idx", layer).toArray();
    (this.parts ??= {})[layer] = rows.length;
    return joinParts(rows.map(r => new Uint8Array(r.data)));
  }

  writeRows(layer, bytes) {
    const sql = this.ctx.storage.sql, parts = splitParts(bytes, ROW_BYTES);
    let written = 0;
    parts.forEach((part, idx) => { written += sql.exec("INSERT INTO chunks (layer, idx, data) VALUES (?, ?, ?) ON CONFLICT (layer, idx) DO UPDATE SET data = excluded.data", layer, idx, part).rowsWritten; });
    if ((this.parts?.[layer] ?? Infinity) > parts.length) written += sql.exec("DELETE FROM chunks WHERE layer = ? AND idx >= ?", layer, parts.length).rowsWritten;
    (this.parts ??= {})[layer] = parts.length;
    return written;
  }

  async asset(path) {
    const r = await this.env.ASSETS.fetch(new Request(`https://assets.local/${path}`));
    if (!r.ok) throw new Error(`${path} returned ${r.status}`);
    return r;
  }

  async baseTerrain(dir = "map") {
    return gunzip(new Uint8Array(await (await this.asset(`${dir}/terrain.bin.gz`)).arrayBuffer()));
  }

  async buildMap(map) {
    if (map.kind === "test") return { map, w: map.w, h: map.h, terrain: makeTestMap(map.w, map.h, map.seed).terrain };
    const dir = map.dir ?? "map";
    const meta = await (await this.asset(`${dir}/meta.json`)).json();
    const terrain = await this.baseTerrain(dir);
    if (terrain.length !== meta.w * meta.h) return { error: `${dir}/terrain.bin.gz does not match ${dir}/meta.json` };
    const base = { ...map, baseHash: hashBytes(terrain), srcW: meta.w, srcH: meta.h, scale: meta.w / BASE_WIDTH, north: meta.north, south: meta.south };
    if (map.kind === "earth") return { map: base, w: meta.w, h: meta.h, terrain };
    const rect = cropRect(meta, map.box);
    if (!rect || rect.w < MIN_MAP_SIDE || rect.h < MIN_MAP_SIDE) return { error: "the crop is outside the map or too small" };
    if (rect.w * rect.h > MAX_PLOTS) return { error: `that region is ${rect.w} by ${rect.h} plots, over the ${MAX_PLOTS} limit; pick a smaller box or normal detail` };
    return { map: { ...base, rect }, w: rect.w, h: rect.h, terrain: cropLayer(terrain, meta.w, rect) };
  }

  async loadDeposits(info, terrain) {
    const map = info.map;
    if (map.kind === "test") return generateDeposits({ w: info.w, h: info.h, terrain }, makeRng(map.seed ?? 1));
    try {
      const dep = decodeDeposits(await gunzip(new Uint8Array(await (await this.asset(`${map.dir ?? "map"}/deposits.bin.gz`)).arrayBuffer())));
      return map.rect ? cropDeposits(dep, map.srcW, map.rect) : dep;
    } catch (e) {
      console.warn(`no deposits for this world: ${e.message}`);
      return emptyDeposits();
    }
  }

  seasonOf(i) {
    return seasonAt(this.sim.time, latitudeOf(this.info.map, this.info.h, i, this.info.w), SEASON_SECONDS);
  }

  async load() {
    const info = this.meta("info");
    if (!info) return;
    if (!LOADS.includes(info.save)) { this.stale = true; return; }
    const t0 = Date.now();
    const terrain = await gunzip(this.readRows("terrain"));
    if (terrain.length !== info.w * info.h) throw new Error(`saved terrain has ${terrain.length} plots, expected ${info.w * info.h}`);
    const scaled = scaledRules(info.map.scale ?? 1);
    this.sim = new Sim({ w: info.w, h: info.h, terrain }, { ...scaled.territory, ...info.rules });
    const owner = this.readRows("owner");
    if (owner.length) decodeRuns(owner, this.sim.owner);
    installBuildings(this.sim);
    const buildings = restoreLayers(this.sim, { zone: this.readRows("zone"), wood: this.readRows("wood"), buildings: this.readRows("buildings") });
    if (info.save !== SAVE_VERSION) { this.upgradedFrom = info.save; info.save = SAVE_VERSION; this.meta("info", info); }
    this.sim.rebuildBorders();
    this.sim.pathGraph();
    const saved = this.meta("state");
    if (saved) {
      this.sim.time = saved.time;
      this.sim.nextNation = saved.nextNation;
      this.sim.nextStack = saved.nextStack;
      for (const n of saved.nations) this.sim.nations.set(n.id, n);
      for (const s of saved.stacks) this.sim.stacks.set(s.id, s);
      for (const [nid, acc] of saved.accounts ?? []) this.accounts.set(nid, acc);
    }
    installCombat(this.sim, scaled.combat);
    installTroops(this.sim, { speed: info.rules?.trainSpeed ?? 1 });
    installConstruction(this.sim, { speed: info.rules?.buildSpeed ?? 1 });
    installEconomy(this.sim);
    installCivilians(this.sim, makeRng(((info.seed ?? 1) + 7919 + Math.floor(this.sim.time)) >>> 0));
    this.info = info;
    installResources(this.sim, await this.loadDeposits(info, terrain), {
      seasonOf: i => this.seasonOf(i), rules: { speed: info.rules?.produceSpeed ?? 1 },
      rng: makeRng(((info.seed ?? 1) + 104729 + Math.floor(this.sim.time)) >>> 0),
    });
    this.landLoaded = restoreLand(this.sim, this.readRows("land"));
    installRoads(this.sim, { scale: info.map.scale ?? 1, rules: rules.roads });
    this.roadsLoaded = restoreRoads(this.sim, this.readRows("road"));
    installResearch(this.sim, { speed: info.rules?.researchSpeed ?? 1 });
    installEffects(this.sim);
    installMachines(this.sim, { speed: info.rules?.buildSpeed ?? 1, scale: info.map.scale ?? 1, saved: saved?.machines });
    installBoats(this.sim, { scale: info.map.scale ?? 1 });
    installSoldiers(this.sim);
    installPilot(this.sim);
    installAir(this.sim);
    installNavy(this.sim);
    installNukes(this.sim, { speed: info.rules?.buildSpeed ?? 1, rng: makeRng((info.seed ?? 1) + 13) }).on = info.nukes !== false;
    installTourism(this.sim);
    installCbd(this.sim, { scale: info.map.scale ?? 1 });
    const trimmed = trimField(this.sim);
    if (trimmed.size) this.fieldTrimmed = Object.fromEntries(trimmed);
    if (this.upgradedFrom && this.upgradedFrom < 4) this.goldLoaded = convertToGold(this.sim);
    installTrade(this.sim, { scale: info.map.scale ?? 1, seed: (info.seed ?? 1) + 15485863 + Math.floor(this.sim.time) });
    installPower(this.sim, { scale: info.map.scale ?? 1 });
    installAutoRoads(this.sim);
    installPlanner(this.sim, { run: (nid, m) => runOrder(this.sim, nid, m), scale: info.map.scale ?? 1 });
    installDiplomacy(this.sim, { incomeOf: n => vitalsOf(this.sim, n)?.income ?? 0, rules: { warNotice: info.warNotice ?? info.rules?.warNotice ?? DIPLO.warNotice, maxFactionSize: info.factionSize ?? DIPLO.maxFactionSize }, saved: saved?.diplomacy ?? null, fresh: !saved });
    installNotes(this.sim);
    installBots(this.sim, makeRng(((info.seed ?? 1) + Math.floor(this.sim.time)) >>> 0), BOT);
    installGuard(this.sim, { scale: info.map.scale ?? 1 });
    installOvertime(this.sim, { every: this.schedule().shrinkEvery ?? rules.schedule.shrinkEvery });
    installCheats(this.sim);
    const hostile = this.sim.hostile;
    this.sim.hostile = (a, b) => hostile(a, b) && !(this.sim.peace && this.sim.nations.get(a)?.human && this.sim.nations.get(b)?.human);
    this.sim.peace = phaseAt(this.schedule(), Date.now()).peace;
    this.frozen = !!(this.meta("victory") || this.meta("ended"));
    this.speed = this.meta("speed") ?? 1;
    this.updatePresence();
    this.hashes = this.layerHashes(terrain);
    this.loadCheck = { saved: saved?.hashes ?? null, loaded: { ...this.hashes } };
    this.sleptAt = this.frozen ? null : saved?.savedAt ?? null;
    for (const nid of this.accounts.keys()) {
      const n = this.sim.nations.get(nid);
      if (n && !n.away) startAway(this.sim, n, saved?.savedAt ?? Date.now(), rules.offline.offlineOutputShare);
    }
    this.present = new Set();
    this.sim.dirty.clear();
    this.loadMs = Date.now() - t0;
    this.loaded = { buildings, upgradedFrom: this.upgradedFrom ?? null, deposits: this.sim.res.dep.plots.length, roads: this.roadsLoaded, ...(this.goldLoaded ? { gold: this.goldLoaded } : {}), ...(this.fieldTrimmed ? { fieldTrimmed: this.fieldTrimmed } : {}), ...this.landLoaded };
  }

  currentHashes() {
    this.hashes.terrain ??= hashBytes(this.sim.terrain);
    return this.hashes;
  }

  layerHashes(terrain = this.sim.terrain) {
    const bld = this.sim.bld;
    return { terrain: hashBytes(terrain), owner: hashRuns(this.sim.owner), zone: hashRuns(bld.zone), wood: hashRuns(bld.wood), buildings: hashBytes(encodeBuildings(bld)), land: hashBytes(encodeLand(this.sim)), road: hashRuns(this.sim.log.road) };
  }

  async init(config) {
    if (this.deleted) return { error: "this world was deleted" };
    if (this.meta("info")) return { ok: true, existed: true };
    const cfg = parseWorldConfig(config);
    if (cfg.error) return { error: cfg.error };
    let base;
    try { base = await this.buildMap(cfg.map); } catch (e) { return { error: `map files are missing: ${e.message}` }; }
    if (base.error) return base;
    let land = 0;
    for (const t of base.terrain) if (isLand(t)) land++;
    const info = {
      save: SAVE_VERSION, name: config.name ?? "World", map: base.map, w: base.w, h: base.h, landPlots: land,
      bots: cfg.bots ?? defaultBots(land, base.map.scale ?? 1), rules: config.rules ?? {}, maxCatchupHours: config.maxCatchupHours ?? 72,
      seed: crypto.getRandomValues(new Uint32Array(1))[0], id: config.id ?? null,
      ...(DIPLO.noticeChoices.includes(config.warNotice) ? { warNotice: config.warNotice } : {}),
    };
    this.writeRows("terrain", await gzip(base.terrain));
    this.meta("info", info);
    await this.load();
    const bots = spawnBots(this.sim, info.bots, makeRng(info.seed)).length;
    this.sim.takeDirty();
    this.sim.events.length = 0;
    this.save(true);
    return { ok: true, map: info.map.kind, w: info.w, h: info.h, bots };
  }

  save(all = false) {
    if (!this.sim) return;
    const t0 = Date.now();
    let rows = 0, ownerBytes = 0;
    const detail = {}, known = new Set(Object.entries(this.parts ?? {}).filter(([, n]) => n > 0).map(([k]) => k));
    if (all || this.ownerChanged || this.sim.dirty.size) {
      const runs = encodeRuns(this.sim.owner);
      rows += detail.owner = this.writeRows("owner", runs);
      ownerBytes = runs.length;
      this.hashes.owner = hashBytes(runs);
      this.ownerChanged = false;
    }
    const layers = saveLayers(this.sim);
    const layerBytes = {};
    for (const [name, bytes] of Object.entries(layers)) {
      rows += detail[name] = this.writeRows(name, bytes);
      layerBytes[name] = bytes.length;
      this.hashes[name] = hashBytes(bytes);
    }
    rows += detail.state = this.meta("state", {
      time: this.sim.time, nextNation: this.sim.nextNation, nextStack: this.sim.nextStack,
      nations: [...this.sim.nations.values()], stacks: [...this.sim.stacks.values()], accounts: [...this.accounts],
      machines: saveMachines(this.sim), diplomacy: this.sim.dip.save(), savedAt: Date.now(), hashes: this.currentHashes(),
    });
    this.lastSave = Date.now();
    const prev = this.saveStats ?? { saves: 0, totalRows: 0, maxRows: 0 };
    const fresh = Object.keys(detail).some(k => k !== "state" && !known.has(k)) || !prev.saves;
    this.saveStats = { rows, ownerBytes, layerBytes, detail, ms: Date.now() - t0, saves: prev.saves + 1, totalRows: prev.totalRows + rows, maxRows: Math.max(prev.maxRows, rows), worst: rows >= prev.maxRows ? detail : prev.worst, maxSteady: fresh ? prev.maxSteady ?? 0 : Math.max(prev.maxSteady ?? 0, rows) };
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }

  online(nation) {
    return this.sockets().some(ws => ws.deserializeAttachment()?.nation === nation);
  }

  updatePresence(leaving = null) {
    if (!this.sim) return;
    const online = new Set(this.sockets().filter(ws => ws !== leaving).map(ws => ws.deserializeAttachment()?.nation).filter(n => n !== undefined && n !== null));
    applyPresence(this.sim, online, rules.offline.defenceMult);
    for (const nid of this.present ?? []) if (!online.has(nid) && !this.sim.nations.get(nid)?.away) startAway(this.sim, this.sim.nations.get(nid), Date.now(), rules.offline.offlineOutputShare);
    this.present = online;
    const list = [...online].sort((a, b) => a - b), key = list.join(",");
    if (key === this.presenceKey) return;
    this.presenceKey = key;
    const msg = JSON.stringify({ v: PROTOCOL, t: "presence", online: list });
    for (const ws of this.sockets()) if (ws !== leaving) try { ws.send(msg); } catch {}
  }

  onlineList() {
    return [...new Set(this.sockets().map(ws => ws.deserializeAttachment()?.nation).filter(n => n !== undefined && n !== null))].sort((a, b) => a - b);
  }

  notify(nation, kind, text) {
    const account = this.accounts.get(nation);
    if (account === undefined) return;
    this.queue.add(account, kind, text, Date.now() / 1000);
    this.scheduleFlush();
  }

  async scheduleFlush() {
    const due = this.queue.dueAt();
    if (due === null) return;
    const at = Math.max(Date.now() + 1000, due * 1000);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now() / 1000;
    const batches = this.queue.take(now);
    if (batches.length) {
      const info = this.meta("info") ?? {};
      const targets = await this.env.DIRECTORY.getByName("directory").notifyTargets(batches.map(b => b.target));
      const byAccount = new Map(targets.map(t => [t.account, t]));
      for (const b of batches) {
        const t = byAccount.get(b.target);
        const prefs = prefsFor(t?.prefs);
        const kind = b.lines[0].kind;
        if (!wants(prefs, kind)) continue;
        const text = formatBatch(info.name ?? "World", b);
        if (t?.discord && this.env.DISCORD_TOKEN) await directMessage(this.env.DISCORD_TOKEN, t.discord, text);
        else if (this.env.DISCORD_WEBHOOK_URL) await postWebhook(this.env.DISCORD_WEBHOOK_URL, `${mention(t?.discord)} ${text}`.trim());
      }
    }
    await this.scheduleFlush();
  }

  async heartbeat(now = Date.now()) {
    const info = this.meta("info");
    if (!info || !this.sim) return { skipped: true };
    if (!this.frozen && phaseAt(this.schedule(), now).over) this.endBySchedule();
    const ends = this.meta("endsAt");
    if (ends && now >= ends && !this.meta("ended")) {
      this.meta("ended", true);
      for (const nation of this.accounts.keys()) this.notify(nation, "world", "The world has ended. The full log and map history are now public.");
      if (this.env.DISCORD_WEBHOOK_URL) await postWebhook(this.env.DISCORD_WEBHOOK_URL, `**${info.name}** has ended.`);
    }
    await this.scheduleFlush();
    return { ok: true, players: this.accounts.size, online: this.sockets().length, ended: !!this.meta("ended") };
  }

  async report(accountId) {
    if (!this.sim) return { error: "world not started" };
    const nation = [...this.accounts].find(([, acc]) => acc === accountId)?.[0];
    const info = this.meta("info") ?? {};
    const rows = this.nationList().sort((a, b) => b.plots - a.plots);
    const mine = rows.find(n => n.id === nation);
    return {
      world: info.name ?? "World",
      time: Math.floor(this.sim.time),
      online: this.sockets().length,
      you: mine ? { name: mine.name, plots: mine.plots, troops: mine.troops, alive: mine.alive } : null,
      top: rows.slice(0, 5).map(n => ({ name: n.name, plots: n.plots, bot: n.bot })),
    };
  }

  async joinData() {
    if (!this.terrainJoin) {
      const info = this.meta("info");
      const base = await baseLayer(info.map, info.w, info.h, () => this.baseTerrain(info.map.dir));
      this.terrainJoin = { map: base.hash ? { ...info.map, baseHash: base.hash } : info.map, pairs: terrainDiff(base.terrain, this.sim.terrain) };
    }
    return this.terrainJoin;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (this.deleted) return new Response("world deleted", { status: 404 });
    if (!this.sim) return new Response(this.stale ? "world uses an old save format" : "world not initialised", { status: 409 });
    if (!this.info.id) {
      this.info.id = decodeURIComponent(new URL(request.url).pathname.split("/").pop());
      this.meta("info", this.info);
    }
    const account = { id: Number(request.headers.get("X-Account")), name: request.headers.get("X-Name"), admin: request.headers.get("X-Admin") === "1" };
    const watch = request.headers.get("X-Watch") === "1";
    const [client, server] = Object.values(new WebSocketPair());
    if (Number(new URL(request.url).searchParams.get("v")) !== PROTOCOL) {
      server.accept();
      server.send(JSON.stringify({ t: "error", v: PROTOCOL, code: "protocol", text: "The game has been updated. Reload the page." }));
      server.close(CLOSE.PROTOCOL, "protocol mismatch");
      return new Response(null, { status: 101, webSocket: client });
    }
    let join;
    try { join = await this.joinData(); } catch (e) { return new Response(`map files are missing: ${e.message}`, { status: 503 }); }
    this.flushDiffs();
    this.sendState();
    const tag = `${watch ? "watch" : "acc"}:${account.id}`;
    this.ctx.acceptWebSocket(server, [tag]);
    for (const old of this.ctx.getWebSockets(tag)) {
      if (old === server) continue;
      try { old.send(JSON.stringify({ t: "replaced", v: PROTOCOL, text: "This game was opened somewhere else." })); old.close(CLOSE.REPLACED, "opened somewhere else"); } catch {}
    }
    let nation = watch ? null : [...this.accounts].find(([, a]) => a === account.id)?.[0] ?? null;
    if (nation === null && !watch) {
      nation = this.sim.addNation({ name: account.name, colour: COLOURS[this.accounts.size % COLOURS.length] });
      this.accounts.set(nation, account.id);
    }
    const self = nation, led = nation === null ? undefined : this.sim.dip?.commanders.get(nation);
    if (led !== undefined && this.sim.nations.get(led)?.alive) nation = led;
    server.serializeAttachment({ account: account.id, name: account.name, admin: account.admin, nation, self, watch });
    this.updatePresence();
    const g = this.sim.grid, runs = encodeRuns(this.sim.owner);
    const terrainFrames = partFrames(MSG.TERRAIN_DIFF, join.pairs), ownerFrames = partFrames(MSG.OWNER, runs);
    const buildingFrames = partFrames(MSG.BUILDINGS, encodeRows(this.bfeed.rows(this.sim)));
    const zoneFrames = partFrames(MSG.ZONE, encodeRuns(this.sim.bld.zone));
    const roadFrames = partFrames(MSG.ROAD, encodeRuns(this.sim.log.road));
    const depositFrames = this.info.map.kind === "test" ? partFrames(MSG.DEPOSITS, encodeDeposits(this.sim.res.dep)) : [];
    server.send(JSON.stringify({
      t: "hello", v: PROTOCOL, you: nation, self, w: g.w, h: g.h, map: join.map,
      hashes: { terrain: this.currentHashes().terrain, owner: hashBytes(runs) }, frames: { terrain: terrainFrames.length, owner: ownerFrames.length, buildings: buildingFrames.length, zone: zoneFrames.length, road: roadFrames.length, deposits: depositFrames.length },
      depositIds: DEPOSIT_IDS, depositNames: DEPOSIT_TABLE.map(d => d.name ?? d.id), depleted: depletedPlots(this.sim), tech: TREE,
      watch, defs: buildingData.buildings, purse: nation === null ? null : this.purse(this.sim.nations.get(nation)), consRules: { demolishRefund: this.sim.cons.rules.demolishRefund, refundOnCancel: this.sim.cons.rules.refundOnCancel, instantPremium: this.sim.cons.rules.instantPremium, moneyForMissing: this.sim.cons.rules.moneyForMissing }, disbandLoss: this.sim.rules.disbandLoss, roadRules: { ...this.sim.log.rules, scale: this.sim.log.scale }, powerRules: this.sim.power ? { ...this.sim.power.rules, reach: buildingData.buildings.find(d => d.id === "power_pole").pole.reach * this.sim.power.scale, scale: this.sim.power.scale } : null,
      units: unitData.units, troopRules: { xpLevels: TROOP_RULES.xpLevels, xpBonus: TROOP_RULES.xpBonus }, policyRules: { ...rules.policy, taxPerResident: rules.economy.taxPerResident, conscriptDefault: rules.civilians.conscriptShare }, seasonRules: rules.seasons, goldRules: { worth: rules.economy.worth, yield: rules.economy.yield }, soldierRules: this.sim.soldiers?.rules ?? null, pilotRules: this.sim.pilot?.rules ?? null, pilots: this.sim.pilot ? pilotRows(this.sim) : [], time: Math.floor(this.sim.time),
      caughtUp: this.caughtUp ?? 0, schedule: this.schedule(), info: this.worldInfo(), now: Date.now(), nations: this.nationList(), online: this.onlineList(), stacks: this.feed.snapshot(this.sim), machines: this.feed.machineSnapshot(this.sim), convoys: this.feed.convoySnapshot(this.sim), chat: this.recentChat(nation), notes: notesFor(this.sim, nation), name: this.info.name, ended: !!this.meta("ended"), speed: this.speed,
      victory: this.meta("victory"), frozen: this.frozen, powers: account.admin ? POWERS : this.powersOf(account.id),
      tourismRules: TOURISM_RULES, cbdRules: { ...this.sim.cbd.rules, scale: this.sim.cbd.scale },
      diplomacy: this.dipView(nation), dipRules: this.dipRules(), noteRules: NOTES,
      nukes: flightsOf(this.sim), nukeRules: { warheads: NUKE_RULES.warheads, samChance: NUKE_RULES.samChance, overlap: NUKE_RULES.overlap, outerLoss: NUKE_RULES.outerLoss, scale: this.info.map.scale ?? 1 },
      plan: nation === null ? [] : planQueue(this.sim.nations.get(nation)), planRules: { ...PLAN_RULES, scale: this.info.map.scale ?? 1, tradeMin: rules.trade.minPlots * (this.info.map.scale ?? 1) },
    }));
    for (const f of terrainFrames) server.send(f);
    for (const f of ownerFrames) server.send(f);
    for (const f of buildingFrames) server.send(f);
    for (const f of zoneFrames) server.send(f);
    for (const f of roadFrames) server.send(f);
    for (const f of depositFrames) server.send(f);
    if (!this.frozen) this.startLoop();
    if (watch) return new Response(null, { status: 101, webSocket: client });
    const n = this.sim.nations.get(nation);
    this.broadcast({ t: "joined", nation, name: n.name, colour: n.colour });
    if (this.catching) server.send(JSON.stringify({ v: PROTOCOL, t: "catchup", left: Math.round(this.catching.job.steps * this.catching.job.step + this.catching.job.rest), of: Math.round(this.catching.of) }));
    else this.sendAway(nation);
    return new Response(null, { status: 101, webSocket: client });
  }

  nationList() {
    return [...this.sim.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot, capital: n.capital ?? null, era: n.era ?? "T" }));
  }

  recentChat(nation = null) {
    const fid = nation === null || nation === undefined ? -1 : this.sim.dip?.faction(nation) ?? -1, me = nation ?? -1;
    return this.ctx.storage.sql.exec("SELECT t, who, text, ch, a, b FROM chat WHERE ch IS NULL OR ch = 'global' OR (ch = 'faction' AND fid = ?) OR (ch = 'private' AND (a = ? OR b = ?)) ORDER BY id DESC LIMIT ?", fid, me, me, rules.chat.history)
      .toArray().reverse().map(r => ({ t: r.t, who: r.who, text: r.text, ch: r.ch ?? "global", from: r.a ?? null, to: r.b ?? null }));
  }

  sendTo(nations, msg) {
    const json = JSON.stringify({ v: PROTOCOL, ...msg });
    for (const ws of this.sockets()) if (nations.has(ws.deserializeAttachment()?.nation)) try { ws.send(json); } catch {}
  }

  chatReach(me, m) {
    const ch = m.ch === "faction" || m.ch === "private" ? m.ch : "global", from = me.nation ?? null;
    if (ch === "global") return { ch, from };
    if (from === null) return { error: "join the world first" };
    if (ch === "faction") {
      const fid = this.sim.dip?.faction(from) ?? null;
      return fid === null ? { error: "you are not in a faction" } : { ch, from, fid, reach: new Set(this.sim.dip.membersOf(fid)) };
    }
    const to = Number(m.to), t = this.sim.nations.get(to);
    return !t?.human || to === from ? { error: "pick a player to write to" } : { ch, from, to, reach: new Set([from, to]) };
  }

  broadcast(obj) {
    const s = typeof obj === "string" || obj instanceof Uint8Array ? obj : JSON.stringify({ v: PROTOCOL, ...obj });
    for (const ws of this.sockets()) { try { ws.send(s); } catch {} }
  }

  schedule() { return (this.sched ??= this.meta("schedule") ?? {}); }

  announced(list) {
    if (list) { this.told = list; this.meta("announced", list); }
    return (this.told ??= this.meta("announced") ?? []);
  }

  dipRules() {
    const r = this.sim.dip.rules;
    return { warNotice: r.warNotice, peaceMinWar: r.peaceMinWar, peaceTreaty: r.peaceTreaty, betrayalCooldown: r.betrayalCooldown, treatyMinutes: r.treatyMinutes, maxFactionSize: r.maxFactionSize, noticeChoices: r.noticeChoices, factionSizes: r.factionSizes };
  }

  dipView(nation) {
    const dip = this.sim.dip;
    return { ...dip.view(this.sim.time), proposals: nation === null || nation === undefined ? [] : dip.proposalsOf(nation) };
  }

  sendDiplomacy() {
    const dip = this.sim.dip;
    if (this.dipSent === dip.version) return;
    this.dipSent = dip.version;
    const view = dip.view(this.sim.time);
    for (const ws of this.sockets()) {
      const me = ws.deserializeAttachment();
      const proposals = me?.nation === null || me?.nation === undefined ? [] : dip.proposalsOf(me.nation);
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "diplomacy", ...view, proposals })); } catch {}
    }
  }

  worldInfo() {
    const i = this.info ?? {}, s = this.schedule();
    return {
      map: i.map?.kind ?? "test", crop: i.map?.name ?? null, detail: i.map?.scale > 1 ? "fine" : "normal", w: i.w, h: i.h, landPlots: i.landPlots, bots: i.bots,
      speed: this.speed ?? 1, rules: i.rules ?? {}, maxCatchupHours: i.maxCatchupHours ?? 72, shrinkEvery: s.shrinkEvery ?? rules.schedule.shrinkEvery,
      offline: { defence: rules.offline.defenceMult, output: rules.offline.offlineOutputShare }, win: "last", nukes: i.nukes !== false, warNotice: this.sim?.dip?.rules.warNotice ?? i.warNotice ?? DIPLO.warNotice, factionSize: this.sim?.dip?.rules.maxFactionSize ?? i.factionSize ?? DIPLO.maxFactionSize,
    };
  }

  applyPhase(now = Date.now()) {
    const s = this.schedule(), p = phaseAt(s, now), ot = this.sim.overtime;
    this.sim.peace = p.peace;
    if (ot) {
      ot.every = s.shrinkEvery ?? rules.schedule.shrinkEvery;
      if (p.overtime && !ot.on) { ot.on = true; ot.clock = 0; }
      if (!p.overtime && ot.on) { ot.on = false; ot.queue = []; }
    }
    const told = this.announced(), fresh = EVENTS.filter(k => s[k] != null && now >= s[k] && !told.includes(k));
    if (fresh.length) {
      this.announced([...told, ...fresh]);
      for (const key of fresh) this.broadcast({ t: "phase", key, name: EVENT_NAMES[key], at: s[key], shrinkEvery: ot?.every });
    }
    if (p.over && !this.frozen) this.endBySchedule();
    return p;
  }

  endBySchedule() {
    this.finish(mostLand(this.sim));
  }

  wake() {
    const since = this.sleptAt;
    this.sleptAt = null;
    if (since == null || this.frozen || this.catching) return;
    const start = this.schedule().startAt ?? 0;
    const elapsed = ((Date.now() - Math.max(since, start)) / 1000) * (this.info.rules?.sleepSpeed ?? 1);
    if (elapsed <= 5) return;
    const job = planCatchUp(elapsed, { ...OFFLINE, ...rules.offline, maxCatchupSeconds: (this.info.maxCatchupHours ?? 72) * 3600 });
    this.catching = { job, of: job.capped, started: Date.now(), told: 0 };
    this.caughtUp = job.capped;
    for (const n of this.sim.nations.values()) if (n.away) { n.away.caught += job.capped; n.away.dropped += job.dropped; }
  }

  catchUpSlice() {
    const c = this.catching;
    const done = runCatchUp(c.job, dt => this.sim.catchUp(dt), rules.offline.catchupBudgetMs, () => Date.now());
    recordAway(this.sim, this.sim.events.splice(0));
    if (!done) {
      if (Date.now() - c.told > 500) { c.told = Date.now(); this.broadcast({ t: "catchup", left: Math.round(c.job.steps * c.job.step + c.job.rest), of: Math.round(c.of) }); }
      return;
    }
    this.catching = null;
    this.catchStats = { seconds: Math.round(c.of), dropped: Math.round(c.job.dropped), ms: Date.now() - c.started, at: Date.now() };
    this.flushDiffs();
    this.sendState();
    this.broadcast({ t: "catchup", left: 0, of: Math.round(c.of), ms: this.catchStats.ms });
    for (const nid of this.onlineList()) this.sendAway(nid);
  }

  sendAway(nid) {
    const n = this.sim.nations.get(nid);
    if (!n?.away) return;
    const s = awaySummary(this.sim, n, Date.now(), rules.offline);
    endAway(n);
    if (!s) return;
    const msg = JSON.stringify({ v: PROTOCOL, t: "away", ...s });
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.nation === nid) try { ws.send(msg); } catch {}
  }

  startLoop() {
    if (this.loop) return;
    this.wake();
    const ms = Number(this.env.TICK_MS ?? 250);
    let last = Date.now();
    this.loop = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      try {
        if (this.catching) this.catchUpSlice();
        else this.step(dt);
        if (!this.catching && now - this.lastSave > SAVE_EVERY_MS) this.save();
      } catch (e) {
        this.errors = (this.errors ?? 0) + 1;
        if (this.lastError?.message !== e.message) console.error(`world tick failed: ${e.stack}`);
        this.lastError = { message: e.message, stack: String(e.stack).split(/\r?\n/).slice(0, 6).join(" | "), at: Date.now() };
      }
    }, ms);
  }

  stopLoop() {
    if (this.pilotLoop) { clearInterval(this.pilotLoop); this.pilotLoop = null; }
    if (!this.loop) return;
    clearInterval(this.loop);
    this.loop = null;
    if (this.catching) {
      while (!runCatchUp(this.catching.job, dt => this.sim.catchUp(dt), Infinity)) {}
      recordAway(this.sim, this.sim.events.splice(0));
      this.catching = null;
    }
    this.save();
    this.sleptAt = this.frozen ? null : Date.now();
  }

  flushDiffs() {
    const zones = takeZoneNews(this.sim);
    if (zones) this.broadcast(frame(MSG.ZONE_DIFF, zones));
    const roads = takeRoadNews(this.sim);
    if (roads) this.broadcast(frame(MSG.ROAD_DIFF, roads));
    const land = takeTerrainNews(this.sim);
    if (land) { this.terrainJoin = null; this.hashes.terrain = null; this.broadcast(frame(MSG.TERRAIN_EDIT, land)); }
    const changes = this.sim.takeDirty();
    if (!changes.length) return;
    this.ownerChanged = true;
    const flat = new Uint32Array(changes.length * 2);
    changes.forEach(([i, o], k) => { flat[k * 2] = i; flat[k * 2 + 1] = o; });
    this.broadcast(frame(MSG.DIFF, flat));
  }

  purse(n) {
    return purseOf(n, { season: n?.capital != null ? this.seasonOf(n.capital) : null, research: researchView(this.sim, n), orders: n ? ordersOf(this.sim, n.id) : [], army: armyView(this.sim, n), field: n?.human ? fieldOf(this.sim, n.id) : null, machines: n ? machineOrdersOf(this.sim, n.id) : null, vitals: vitalsOf(this.sim, n), trade: tradeView(this.sim, n), power: powerView(this.sim, n), plan: planSummary(n), sams: n ? samView(this.sim, n.id) : null, cheats: n?.cheats ?? null, nukes: n ? nukeView(this.sim, n.id) : null, tourism: tourismView(this.sim, n) });
  }

  sendState() {
    const d = this.feed.delta(this.sim), bd = this.bfeed.delta(this.sim);
    const ot = this.sim.overtime?.on ? { shrinkIn: Math.max(0, Math.round(this.sim.overtime.every - this.sim.overtime.clock)) } : {};
    if (d || bd || ot.shrinkIn !== undefined) this.broadcast({ t: "state", time: Math.floor(this.sim.time), n: [], s: [], gone: [], ...d, ...(bd ? { b: bd.up, bg: bd.gone } : {}), ...ot });
    for (const ws of this.sockets()) {
      const me = ws.deserializeAttachment();
      const p = this.purse(this.sim.nations.get(me?.nation));
      if (!p) continue;
      const key = JSON.stringify(p);
      if (this.purses.get(me.account) === key) continue;
      this.purses.set(me.account, key);
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "purse", ...p })); } catch {}
    }
    this.sendDiplomacy();
    const noteKey = `${this.sim.notes.version}:${this.sim.dip.version}`;
    if (noteKey !== this.notesSent) {
      this.notesSent = noteKey;
      for (const ws of this.sockets()) {
        const me = ws.deserializeAttachment();
        if (me?.nation === null || me?.nation === undefined) continue;
        const list = notesFor(this.sim, me.nation), key = JSON.stringify(list);
        if (this.noteLists?.get(me.account) === key) continue;
        (this.noteLists ??= new Map()).set(me.account, key);
        try { ws.send(JSON.stringify({ v: PROTOCOL, t: "notes", notes: list })); } catch {}
      }
    }
    const planNews = takePlanNews(this.sim);
    if (planNews) for (const ws of this.sockets()) {
      const me = ws.deserializeAttachment();
      if (!planNews.includes(me?.nation)) continue;
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "plan", queue: planQueue(this.sim.nations.get(me.nation)) })); } catch {}
    }
  }

  step(dt) {
    if (this.frozen) return;
    const phase = this.applyPhase();
    if (this.frozen) return;
    if (phase.waiting) {
      this.flushDiffs();
      if (++this.tickCount % 4 === 0) this.sendState();
      return;
    }
    for (let left = dt * this.speed; left > 1e-9; left -= 1) this.sim.tick(Math.min(1, left));
    this.standingClock = (this.standingClock ?? 0) + dt * this.speed;
    if (this.standingClock >= rules.offline.standingEvery) {
      this.standingClock = 0;
      const online = new Set(this.onlineList());
      standingOrders(this.sim, { isOnline: nid => online.has(nid) }, { ...OFFLINE, ...rules.offline, threatRadius: rules.offline.threatRadius * (this.info.map.scale ?? 1) });
    }
    this.flushDiffs();
    if (++this.tickCount % 4 === 0) this.sendState();
    this.historyClock = (this.historyClock ?? 0) + dt * this.speed;
    if (this.historyClock >= rules.history.every || (this.historyRows ??= this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM history").one().n) === 0 && [...this.sim.nations.values()].some(n => n.human && n.spawned)) { this.historyClock = 0; this.snapshot(); }
    const events = this.sim.events.splice(0);
    if (events.length) {
      recordAway(this.sim, events);
      this.keepRecord(events);
      for (const e of events) if ((e.type === "commander_joined" || e.type === "commander_left") && this.accounts.has(e.a)) this.reconnect(this.accounts.get(e.a));
      const shown = publicEvents(this.sim, events);
      if (shown.length) this.broadcast({ t: "events", events: shown });
      for (const e of events) {
        if (e.type === "plot_lost" && e.nation !== undefined && !this.online(e.nation)) {
          const by = this.sim.nations.get(e.by)?.name ?? "someone";
          this.notify(e.nation, "attack", `${by} is taking your land.`);
        }
        if (e.type === "eliminated" && e.nation !== undefined) this.notify(e.nation, "eliminated", "Your nation has been eliminated. You can still watch, or join a faction.");
        if (e.type === "war_declared" && !this.online(e.b)) {
          const by = this.sim.nations.get(e.a)?.name ?? "someone";
          this.notify(e.b, "war", `${by} declared war on you. The war starts in ${Math.max(1, Math.round((e.at - this.sim.time) / 60))} min.`);
        }
        if (e.type === "nuke_launched" && e.toward) {
          const by = this.sim.nations.get(e.nation)?.name ?? "someone";
          this.notify(e.toward, "missile", `${by} launched a nuclear warhead at your land. Impact in ${e.seconds} s.`);
        }
      }
    }
    const v = victory(this.sim);
    if (v) this.finish(v);
  }

  keepRecord(events) {
    const sql = this.ctx.storage.sql, now = Date.now();
    for (const e of events) {
      if (!RECORD.has(e.type)) continue;
      const { t, type, ...data } = e;
      sql.exec("INSERT INTO record (t, g, type, data) VALUES (?, ?, ?, ?)", now, t ?? this.sim.time, type, JSON.stringify(data));
    }
  }

  snapshot() {
    const s = this.sim, k = rules.history.scale, W = s.grid.w, H = s.grid.h, w = Math.ceil(W / k), h = Math.ceil(H / k), small = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) small[y * w + x] = s.owner[Math.min(H - 1, y * k + (k >> 1)) * W + Math.min(W - 1, x * k + (k >> 1))];
    const ids = new Set(small);
    ids.delete(0);
    const names = [...ids].map(id => { const n = s.nations.get(id); return [id, n?.name ?? "?", n?.colour ?? "#888888", n?.bot ? 1 : 0]; });
    this.ctx.storage.sql.exec("INSERT INTO history (t, g, w, h, names, data) VALUES (?, ?, ?, ?, ?, ?)", Date.now(), s.time, w, h, JSON.stringify(names), encodeRuns(small));
    this.historyRows = (this.historyRows ?? 0) + 1;
  }

  historyOpen(admin) {
    return !!this.sim && !!(admin || this.meta("victory") || this.meta("ended"));
  }

  history({ admin = false } = {}) {
    if (!this.historyOpen(admin)) return { error: "the record opens when the world ends" };
    const sql = this.ctx.storage.sql;
    const events = sql.exec("SELECT t, g, type, data FROM record ORDER BY id DESC LIMIT ?", rules.history.events).toArray().reverse().map(r => ({ t: r.t, g: r.g, type: r.type, ...JSON.parse(r.data) }));
    const frames = sql.exec("SELECT id, t, g FROM history ORDER BY id").toArray();
    const nations = [...this.sim.nations.values()].filter(n => n.spawned).map(n => ({ id: n.id, name: n.name, colour: n.colour, bot: !!n.bot }));
    return { ok: true, name: this.info.name, w: this.sim.grid.w, h: this.sim.grid.h, victory: this.meta("victory") ?? null, events, frames, nations };
  }

  historyFrame(id, { admin = false } = {}) {
    if (!this.historyOpen(admin)) return { error: "the record opens when the world ends" };
    const r = this.ctx.storage.sql.exec("SELECT id, t, g, w, h, names, data FROM history WHERE id = ?", Number(id)).toArray()[0];
    if (!r) return { error: "no such picture" };
    const bytes = new Uint8Array(r.data);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ok: true, id: r.id, t: r.t, g: r.g, w: r.w, h: r.h, names: JSON.parse(r.names), runs: btoa(bin) };
  }

  reconnect(account) {
    for (const ws of this.ctx.getWebSockets(`acc:${account}`)) try { ws.send(JSON.stringify({ v: PROTOCOL, t: "role", text: "Your role in this world changed. Reconnecting." })); ws.close(CLOSE.ROLE, "role changed"); } catch {}
  }

  finish(v) {
    const info = this.meta("info") ?? {};
    this.keepRecord([{ type: "victory", ...v }]);
    this.snapshot();
    this.frozen = true;
    this.meta("victory", { ...v, at: Date.now() });
    this.sendState();
    this.broadcast({ t: "victory", winner: v.winner, name: v.name, by: v.by ?? null, members: v.members ?? null });
    const text = v.name ? `${v.name} has won ${info.name ?? "the world"}.` : `Nobody is left standing in ${info.name ?? "the world"}.`;
    for (const nation of this.accounts.keys()) this.notify(nation, "world", text);
    if (this.env.DISCORD_WEBHOOK_URL) postWebhook(this.env.DISCORD_WEBHOOK_URL, `**${text}**`).catch(() => {});
    this.stopLoop();
  }

  async webSocketMessage(ws, raw) {
    const me = ws.deserializeAttachment();
    if (me?.watch) return;
    if (typeof raw !== "string" || raw.length > 4000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    const reply = (x) => ws.send(JSON.stringify({ v: PROTOCOL, ...x }));
    if (m.t === "pilot" && m.op === "input") {
      if (!this.frozen && this.sim?.pilot && this.pilotLimiter.take(me.account, Date.now())) steer(this.sim, me.nation, m);
      return;
    }
    if (!this.limiter.take(me.account, Date.now())) return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "slow down" });
    switch (m.t) {
      case "ping": return reply({ t: "pong", at: m.at });
      case "chat": {
        const text = String(m.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 280);
        if (!text) return;
        const now = Date.now();
        if (now - (this.lastChat?.get(me.account) ?? 0) < 400) return reply({ t: "result", of: "chat", ok: false, error: "slow down" });
        const c = this.chatReach(me, m);
        if (c.error) return reply({ t: "result", of: "chat", ok: false, error: c.error });
        (this.lastChat ??= new Map()).set(me.account, now);
        this.ctx.storage.sql.exec("INSERT INTO chat (t, who, text, ch, fid, a, b) VALUES (?, ?, ?, ?, ?, ?, ?)", now, me.name, text, c.ch, c.fid ?? null, c.from, c.to ?? null);
        const msg = { t: "chat", who: me.name, text, at: now, ch: c.ch, from: c.from, ...(c.to !== undefined ? { to: c.to } : {}) };
        if (c.ch === "private" && !this.online(c.to)) this.notify(c.to, "message", `${me.name}: ${text}`);
        return c.reach ? this.sendTo(c.reach, msg) : this.broadcast(msg);
      }
      case "typing": {
        const now = Date.now();
        if (now - (this.lastTyping?.get(me.account) ?? 0) < rules.chat.typingEvery * 1000) return;
        const c = this.chatReach(me, m);
        if (c.error) return;
        (this.lastTyping ??= new Map()).set(me.account, now);
        const msg = { t: "typing", who: me.name, from: c.from, ch: c.ch, ...(c.to !== undefined ? { to: c.to } : {}) };
        return c.reach ? this.sendTo(c.reach, msg) : this.broadcast(msg);
      }
      case "admin": {
        const op = String(m.op ?? "").slice(0, 20);
        if (!adminAllowed(me, this.powersOf(me.account), op)) return reply({ t: "result", of: "admin", op, ok: false, error: "not allowed" });
        let r;
        try { r = await this.adminOp(me, m); } catch (e) { r = { ok: false, error: e.message }; }
        return reply({ t: "result", of: "admin", op, ...r });
      }
      default: {
        if (this.frozen) return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "the world has ended" });
        const startAt = this.schedule().startAt;
        if (startAt && Date.now() < startAt && m.t !== "spawn") return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: `the world starts at ${new Date(startAt).toISOString().slice(0, 16).replace("T", " ")} UTC; until then you can only pick where to start` });
        const r = runOrder(this.sim, m.t === "diplo" && m.op === "resign" ? me.self ?? me.nation : me.nation, m);
        reply(r ?? { t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "unknown order" });
        if (m.t === "diplo" && r?.ok && r.proposal && !this.online(r.to)) this.notify(r.to, "message", `${this.sim.nations.get(me.nation)?.name ?? "Someone"} ${{ peace: "proposes peace", alliance: "proposes an alliance", non_aggression: "proposes a non-aggression treaty", faction_invite: "invites you to their faction", surrender: "offers to surrender and become your vassal", commander: "invites you to command their nation" }[r.kind] ?? "has a proposal"}.`);
        if (m.t === "diplo" && r?.ok) this.sendDiplomacy();
        if (m.t === "pilot" && r?.ok) this.startPilots();
      }
    }
  }

  async adminOp(me, m) {
    const fail = error => ({ ok: false, error }), dir = () => this.env.DIRECTORY.getByName("directory");
    switch (m.op) {
      case "save": this.save(true); return { ok: true };
      case "hashes": this.flushDiffs(); return { ok: true, ...this.layerHashes() };
      case "log": return { ok: true, log: this.adminLog(), ...(me.admin ? { powers: this.powerList() } : {}), ...(adminAllowed(me, this.powersOf(me.account), "cheat") ? { cheats: this.cheatList() } : {}) };
      case "powers": {
        if (!me.admin) return fail("only an admin gives powers");
        const account = Number.isInteger(m.nation) ? this.accounts.get(m.nation) : undefined;
        if (account === undefined) return fail("that nation has no player");
        const list = cleanPowers(m.powers);
        if (!list) return fail(`powers are some of ${POWERS.join(", ")}`);
        const all = { ...(this.meta("powers") ?? {}) }, name = this.sim.nations.get(m.nation)?.name ?? "someone";
        if (list.length) all[account] = list;
        else delete all[account];
        this.meta("powers", all);
        this.logAdmin(me, "powers", { nation: m.nation, name, powers: list });
        for (const ws of this.ctx.getWebSockets(`acc:${account}`)) try { ws.send(JSON.stringify({ v: PROTOCOL, t: "powers", powers: list, by: me.name })); } catch {}
        return { ok: true, nation: m.nation, name, powers: list };
      }
      case "give":
      case "finish":
      case "researchAll":
      case "cheat": {
        const r = runAdmin(this.sim, m);
        if (!r.ok) return r;
        this.logAdmin(me, m.op, r);
        this.flushDiffs();
        this.sendState();
        return r;
      }
      case "schedule": {
        const r = await this.setSchedule(m.schedule, me.name);
        return r.error ? fail(r.error) : r;
      }
      case "speed": {
        const factor = parseSpeed(m.factor);
        if (factor === null) return fail(`speed is a whole number from 1 to ${ADMIN_RULES.maxSpeed}`);
        this.speed = factor;
        this.meta("speed", factor);
        this.logAdmin(me, "speed", { factor });
        this.broadcast({ t: "speed", factor, by: me.name });
        return { ok: true, factor };
      }
      case "end": {
        if (this.meta("victory")) return fail("the world is already won");
        if (this.meta("ended")) return fail("the world has already ended");
        this.meta("ended", true);
        this.frozen = true;
        this.logAdmin(me, "end");
        this.broadcast({ t: "ended", by: me.name });
        this.stopLoop();
        this.sleptAt = null;
        return { ok: true };
      }
      case "reopen": {
        if (this.meta("victory")) return fail("a won world stays frozen");
        if (!this.meta("ended")) return fail("the world has not ended");
        this.meta("ended", false);
        this.meta("endsAt", null);
        this.frozen = false;
        this.logAdmin(me, "reopen");
        this.broadcast({ t: "reopened", by: me.name });
        this.startLoop();
        return { ok: true };
      }
      case "diplomacy": {
        const r = this.sim.dip.rules, notice = m.warNotice === undefined ? null : Number(m.warNotice), size = m.factionSize === undefined ? null : Number(m.factionSize);
        if (notice === null && size === null) return fail("set warNotice or factionSize");
        if (notice !== null && !r.noticeChoices.includes(notice)) return fail(`the war notice is one of ${r.noticeChoices.join(", ")} seconds`);
        if (size !== null && !r.factionSizes.includes(size)) return fail(`a faction holds ${r.factionSizes.join(", ")} players at most`);
        if (size !== null && [...this.sim.dip.factions.values()].some(f => f.members.size > size)) return fail("a faction already has more members than that");
        if (notice !== null) { this.info.warNotice = notice; r.warNotice = notice; }
        if (size !== null) { this.info.factionSize = size; r.maxFactionSize = size; }
        this.meta("info", this.info);
        this.logAdmin(me, "diplomacy", { warNotice: notice, factionSize: size });
        this.broadcast({ t: "dipRules", rules: this.dipRules(), info: this.worldInfo(), by: me.name, changed: notice !== null ? "notice" : "size" });
        return { ok: true, warNotice: r.warNotice, factionSize: r.maxFactionSize };
      }
      case "nukes": {
        if (typeof m.on !== "boolean") return fail("say on or off");
        this.info.nukes = m.on;
        this.meta("info", this.info);
        this.sim.nukes.on = m.on;
        this.logAdmin(me, "nukes", { on: m.on });
        this.broadcast({ t: "nukes", on: m.on, info: this.worldInfo(), by: me.name });
        return { ok: true, on: m.on };
      }
      case "rename": {
        const name = cleanName(m.name);
        if (!name) return fail(`a name is 1 to ${ADMIN_RULES.nameLength} characters`);
        if (this.info.id) await dir().renameWorld(this.info.id, name, me.name);
        this.info.name = name;
        this.meta("info", this.info);
        this.logAdmin(me, "rename", { name });
        this.broadcast({ t: "renamed", name, by: me.name });
        return { ok: true, name };
      }
      case "kick": {
        const account = Number.isInteger(m.nation) ? this.accounts.get(m.nation) : undefined;
        if (account === undefined) return fail("that nation has no player");
        if (account === me.account) return fail("you cannot remove yourself");
        if (!this.info.id) return fail("this world does not know its id yet");
        const name = this.sim.nations.get(m.nation)?.name ?? "someone";
        await dir().banMember(this.info.id, account, me.name);
        this.dropAccount(account, `${me.name} removed you from this world.`);
        this.logAdmin(me, "kick", { nation: m.nation, name });
        this.broadcast({ t: "chat", who: "Host", text: `${name} was removed from this world.`, at: Date.now() });
        return { ok: true, nation: m.nation, name };
      }
      default: return fail("unknown op");
    }
  }

  async setSchedule(schedule, by) {
    if (!this.sim) return { error: "world not initialised" };
    const r = cleanSchedule(schedule, Date.now(), rules.schedule, this.schedule());
    if (r.error) return r;
    const now = Date.now();
    this.meta("schedule", r.schedule);
    this.sched = r.schedule;
    if (this.info.id) await this.env.DIRECTORY.getByName("directory").scheduleWorld(this.info.id, r.schedule);
    this.announced(this.announced().filter(k => r.schedule[k] != null && r.schedule[k] <= now));
    this.logAdmin({ name: by }, "schedule", r.schedule);
    this.applyPhase(now);
    this.broadcast({ t: "schedule", schedule: r.schedule, info: this.worldInfo(), by });
    return { ok: true, schedule: r.schedule };
  }

  powersOf(account) {
    return (this.meta("powers") ?? {})[account] ?? [];
  }

  cheatList() {
    const out = {};
    for (const n of this.sim.nations.values()) if (n.cheats?.length) out[n.id] = n.cheats;
    return out;
  }

  powerList() {
    const all = this.meta("powers") ?? {}, out = {};
    for (const [nation, account] of this.accounts) if (all[account]?.length) out[nation] = all[account];
    return out;
  }

  logAdmin(me, op, detail = {}) {
    this.ctx.storage.sql.exec("INSERT INTO admin_log (t, who, op, detail) VALUES (?, ?, ?, ?)", Date.now(), me.name, op, JSON.stringify(detail));
  }

  adminLog() {
    return this.ctx.storage.sql.exec("SELECT t, who, op, detail FROM admin_log ORDER BY id DESC LIMIT ?", ADMIN_RULES.logShown).toArray().map(r => ({ ...r, detail: JSON.parse(r.detail) }));
  }

  dropAccount(account, text) {
    for (const ws of [...this.ctx.getWebSockets(`acc:${account}`), ...this.ctx.getWebSockets(`watch:${account}`)]) {
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "removed", text })); ws.close(CLOSE.REMOVED, "removed by the host"); } catch {}
    }
    this.updatePresence();
  }

  async accountRemoved(account, by) {
    if (this.deleted || !this.sim) return { ok: true };
    this.dropAccount(account, `${by} removed your account.`);
    this.logAdmin({ name: by }, "account removed", { account, nation: [...this.accounts].find(([, a]) => a === account)?.[0] ?? null });
    return { ok: true };
  }

  async wipe(by) {
    if (this.loop) { clearInterval(this.loop); this.loop = null; }
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "deleted", text: `${by} deleted this world.` })); ws.close(CLOSE.DELETED, "world deleted"); } catch {}
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.deleted = true;
    this.sim = null;
    this.info = null;
    this.accounts.clear();
    return { ok: true };
  }

  startPilots() {
    if (this.pilotLoop || !this.sim?.pilot?.list.size) return;
    let last = Date.now(), sent = 0;
    this.pilotLoop = setInterval(() => {
      const now = Date.now(), T = this.sim?.pilot;
      if (!T || this.frozen || !T.list.size) {
        clearInterval(this.pilotLoop);
        this.pilotLoop = null;
        this.broadcast({ t: "pilots", p: [], shots: T ? takeShots(this.sim) ?? [] : [] });
        return;
      }
      try {
        if (!this.catching) pilotStep(this.sim, Math.min(0.2, (now - last) / 1000) * this.speed);
      } catch (e) {
        this.errors = (this.errors ?? 0) + 1;
        this.lastError = { message: e.message, stack: String(e.stack).split(/\r?\n/).slice(0, 6).join(" | "), at: now };
      }
      last = now;
      if (now - sent >= T.rules.sendEvery) {
        sent = now;
        this.broadcast({ t: "pilots", p: pilotRows(this.sim), shots: takeShots(this.sim) ?? [] });
      }
    }, rules.pilot.every);
  }

  async webSocketClose(ws, code, reason) {
    const gone = ws.deserializeAttachment?.();
    if (gone?.nation != null && !gone.watch && this.sim?.pilot) {
      const still = this.sockets().some(s => s !== ws && s.deserializeAttachment()?.nation === gone.nation && !s.deserializeAttachment()?.watch);
      const P = still ? null : pilotOf(this.sim, gone.nation);
      if (P) releasePilot(this.sim, P);
    }
    try { ws.close(code, reason); } catch {}
    this.updatePresence(ws);
    if (this.sockets().filter(s => s !== ws).length === 0) this.stopLoop();
  }

  async webSocketError(ws) {
    this.updatePresence(ws);
    if (this.sockets().filter(s => s !== ws).length === 0) this.stopLoop();
  }

  async status() {
    if (this.deleted) return { deleted: true };
    const info = this.meta("info");
    return {
      initialised: !!this.sim, players: this.accounts.size, online: this.sockets().length, looping: !!this.loop, time: this.sim?.time ?? 0,
      map: info?.map ?? null, w: info?.w, h: info?.h, landPlots: info?.landPlots, bots: info?.bots,
      hashes: this.sim ? this.currentHashes() : null, loadCheck: this.loadCheck ?? null, loaded: this.loaded ?? null, lastSave: this.saveStats ?? null, loadMs: this.loadMs ?? null,
      frozen: !!this.frozen, victory: this.meta("victory"), tickErrors: this.errors ?? 0, lastError: this.lastError ?? null, catchingUp: !!this.catching, lastCatchUp: this.catchStats ?? null,
    };
  }
}
