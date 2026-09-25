import { DurableObject } from "cloudflare:workers";
import { World as Sim } from "./sim/territory.js";
import { makeTestMap } from "./shared/testmap.js";
import { isLand } from "./shared/terrain.js";
import { cropRect, cropLayer, baseLayer, terrainDiff } from "./shared/maps.js";
import { PROTOCOL, MSG, CLOSE, frame, partFrames } from "./shared/protocol.js";
import { encodeRuns, decodeRuns, splitParts, joinParts, gzip, gunzip, hashBytes, hashRuns } from "./shared/codec.js";
import { parseWorldConfig, defaultBots, scaledRules, MIN_MAP_SIDE, MAX_PLOTS, BASE_WIDTH } from "./worldconfig.js";
import rules from "../data/rules.json" with { type: "json" };
import { planCatchUp, runCatchUp } from "./sim/offline.js";
import { installCombat } from "./sim/combat.js";
import { installBots, spawnBots, BOT } from "./sim/bots.js";
import { installBuildings, saveLayers, restoreLayers, encodeBuildings } from "./sim/buildings.js";
import { installConstruction } from "./sim/construction.js";
import { installEconomy } from "./sim/economy.js";
import { installCivilians, takeZoneNews } from "./sim/civilians.js";
import { installResources, restoreLand, encodeLand, takeTerrainNews, depletedPlots, generateDeposits, DEPOSIT_IDS, DEPOSIT_TABLE } from "./sim/resources.js";
import { installResearch, researchView, TREE } from "./sim/research.js";
import { decodeDeposits, cropDeposits, encodeDeposits, emptyDeposits, latitudeOf, seasonAt } from "./shared/deposits.js";
import { encodeRows } from "./shared/buildings.js";
import buildingData from "../data/buildings.json" with { type: "json" };
import { makeRng } from "./shared/rng.js";
import { runOrder, RateLimit, applyPresence, victory, StateFeed, BuildingFeed, purseOf, publicEvents, ordersOf } from "./game.js";
import { NotifyQueue, formatBatch, prefsFor, wants } from "./notify.js";
import { runAdmin, parseSpeed, cleanName, ADMIN_RULES } from "./admin.js";
import { postWebhook, directMessage, mention } from "./discord.js";

const SAVE_VERSION = 3;
const LOADS = [2, 3];
const ROW_BYTES = 1_000_000;
const SAVE_EVERY_MS = 30000;
const SEASON_SECONDS = rules.seasons.dayLengthMinutes * 60 * rules.seasons.daysPerSeason;
const COLOURS = ["#e0413a", "#f08a24", "#d63fbf", "#f2d02b", "#8e4fe0", "#f4f4f4", "#ff7ab8", "#1f1f1f"];

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sim = null;
    this.loop = null;
    this.lastSave = 0;
    this.accounts = new Map();
    this.queue = new NotifyQueue();
    this.limiter = new RateLimit(rules.world.messagesPerSecond, rules.world.messageBurst);
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
      `);
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
    installConstruction(this.sim, { speed: info.rules?.buildSpeed ?? 1 });
    installEconomy(this.sim);
    installCivilians(this.sim, makeRng(((info.seed ?? 1) + 7919 + Math.floor(this.sim.time)) >>> 0));
    this.info = info;
    installResources(this.sim, await this.loadDeposits(info, terrain), {
      seasonOf: i => this.seasonOf(i), rules: { speed: info.rules?.produceSpeed ?? 1 },
      rng: makeRng(((info.seed ?? 1) + 104729 + Math.floor(this.sim.time)) >>> 0),
    });
    this.landLoaded = restoreLand(this.sim, this.readRows("land"));
    installResearch(this.sim, { speed: info.rules?.researchSpeed ?? 1 });
    installBots(this.sim, makeRng(((info.seed ?? 1) + Math.floor(this.sim.time)) >>> 0), BOT);
    this.frozen = !!(this.meta("victory") || this.meta("ended"));
    this.speed = this.meta("speed") ?? 1;
    this.updatePresence();
    this.hashes = this.layerHashes(terrain);
    this.loadCheck = { saved: saved?.hashes ?? null, loaded: { ...this.hashes } };
    const elapsed = (Date.now() - (saved?.savedAt ?? Date.now())) / 1000;
    if (elapsed > 5) {
      const job = planCatchUp(elapsed, { catchupStep: 60, maxCatchupSeconds: (info.maxCatchupHours ?? 72) * 3600 });
      runCatchUp(job, dt => { this.sim.growTroops(dt); this.sim.time += dt; }, 2000, () => Date.now());
      this.caughtUp = job.capped;
    }
    this.sim.dirty.clear();
    this.loadMs = Date.now() - t0;
    this.loaded = { buildings, upgradedFrom: this.upgradedFrom ?? null, deposits: this.sim.res.dep.plots.length, ...this.landLoaded };
  }

  currentHashes() {
    this.hashes.terrain ??= hashBytes(this.sim.terrain);
    return this.hashes;
  }

  layerHashes(terrain = this.sim.terrain) {
    const bld = this.sim.bld;
    return { terrain: hashBytes(terrain), owner: hashRuns(this.sim.owner), zone: hashRuns(bld.zone), wood: hashRuns(bld.wood), buildings: hashBytes(encodeBuildings(bld)), land: hashBytes(encodeLand(this.sim)) };
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
      savedAt: Date.now(), hashes: this.currentHashes(),
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
    const online = new Set(this.sockets().filter(ws => ws !== leaving).map(ws => ws.deserializeAttachment()?.nation));
    applyPresence(this.sim, online, rules.offline.defenceMult);
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
    this.ctx.acceptWebSocket(server, [`acc:${account.id}`]);
    for (const old of this.ctx.getWebSockets(`acc:${account.id}`)) {
      if (old === server) continue;
      try { old.send(JSON.stringify({ t: "replaced", v: PROTOCOL, text: "This game was opened somewhere else." })); old.close(CLOSE.REPLACED, "opened somewhere else"); } catch {}
    }
    let nation = [...this.accounts].find(([, a]) => a === account.id)?.[0] ?? null;
    if (nation === null) {
      nation = this.sim.addNation({ name: account.name, colour: COLOURS[this.accounts.size % COLOURS.length] });
      this.accounts.set(nation, account.id);
    }
    server.serializeAttachment({ account: account.id, name: account.name, admin: account.admin, nation });
    this.updatePresence();
    const g = this.sim.grid, runs = encodeRuns(this.sim.owner);
    const terrainFrames = partFrames(MSG.TERRAIN_DIFF, join.pairs), ownerFrames = partFrames(MSG.OWNER, runs);
    const buildingFrames = partFrames(MSG.BUILDINGS, encodeRows(this.bfeed.rows(this.sim)));
    const zoneFrames = partFrames(MSG.ZONE, encodeRuns(this.sim.bld.zone));
    const depositFrames = this.info.map.kind === "test" ? partFrames(MSG.DEPOSITS, encodeDeposits(this.sim.res.dep)) : [];
    server.send(JSON.stringify({
      t: "hello", v: PROTOCOL, you: nation, w: g.w, h: g.h, map: join.map,
      hashes: { terrain: this.currentHashes().terrain, owner: hashBytes(runs) }, frames: { terrain: terrainFrames.length, owner: ownerFrames.length, buildings: buildingFrames.length, zone: zoneFrames.length, deposits: depositFrames.length },
      depositIds: DEPOSIT_IDS, depositNames: DEPOSIT_TABLE.map(d => d.name ?? d.id), depleted: depletedPlots(this.sim), tech: TREE,
      defs: buildingData.buildings, purse: this.purse(this.sim.nations.get(nation)), consRules: { demolishRefund: this.sim.cons.rules.demolishRefund, refundOnCancel: this.sim.cons.rules.refundOnCancel, instantPremium: this.sim.cons.rules.instantPremium, moneyForMissing: this.sim.cons.rules.moneyForMissing }, disbandLoss: this.sim.rules.disbandLoss,
      caughtUp: this.caughtUp ?? 0, nations: this.nationList(), stacks: this.feed.snapshot(this.sim), chat: this.recentChat(), name: this.info.name, ended: !!this.meta("ended"), speed: this.speed,
      victory: this.meta("victory"), frozen: this.frozen,
    }));
    for (const f of terrainFrames) server.send(f);
    for (const f of ownerFrames) server.send(f);
    for (const f of buildingFrames) server.send(f);
    for (const f of zoneFrames) server.send(f);
    for (const f of depositFrames) server.send(f);
    const n = this.sim.nations.get(nation);
    this.broadcast({ t: "joined", nation, name: n.name, colour: n.colour });
    if (!this.frozen) this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  nationList() {
    return [...this.sim.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot, capital: n.capital ?? null, era: n.era ?? "T" }));
  }

  recentChat() {
    return this.ctx.storage.sql.exec("SELECT t, who, text FROM chat ORDER BY id DESC LIMIT 30").toArray().reverse();
  }

  broadcast(obj) {
    const s = typeof obj === "string" || obj instanceof Uint8Array ? obj : JSON.stringify({ v: PROTOCOL, ...obj });
    for (const ws of this.sockets()) { try { ws.send(s); } catch {} }
  }

  startLoop() {
    if (this.loop) return;
    const ms = Number(this.env.TICK_MS ?? 250);
    let last = Date.now();
    this.loop = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      try {
        this.step(dt);
        if (now - this.lastSave > SAVE_EVERY_MS) this.save();
      } catch (e) {
        this.errors = (this.errors ?? 0) + 1;
        if (this.lastError?.message !== e.message) console.error(`world tick failed: ${e.stack}`);
        this.lastError = { message: e.message, stack: String(e.stack).split(/\r?\n/).slice(0, 6).join(" | "), at: Date.now() };
      }
    }, ms);
  }

  stopLoop() {
    if (!this.loop) return;
    clearInterval(this.loop);
    this.loop = null;
    this.save();
  }

  flushDiffs() {
    const zones = takeZoneNews(this.sim);
    if (zones) this.broadcast(frame(MSG.ZONE_DIFF, zones));
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
    return purseOf(n, { season: n?.capital != null ? this.seasonOf(n.capital) : null, research: researchView(this.sim, n), orders: n ? ordersOf(this.sim, n.id) : [] });
  }

  sendState() {
    const d = this.feed.delta(this.sim), bd = this.bfeed.delta(this.sim);
    if (d || bd) this.broadcast({ t: "state", time: Math.floor(this.sim.time), n: [], s: [], gone: [], ...d, ...(bd ? { b: bd.up, bg: bd.gone } : {}) });
    for (const ws of this.sockets()) {
      const me = ws.deserializeAttachment();
      const p = this.purse(this.sim.nations.get(me?.nation));
      if (!p) continue;
      const key = JSON.stringify(p);
      if (this.purses.get(me.account) === key) continue;
      this.purses.set(me.account, key);
      try { ws.send(JSON.stringify({ v: PROTOCOL, t: "purse", ...p })); } catch {}
    }
  }

  step(dt) {
    if (this.frozen) return;
    for (let left = dt * this.speed; left > 1e-9; left -= 1) this.sim.tick(Math.min(1, left));
    this.flushDiffs();
    if (++this.tickCount % 4 === 0) this.sendState();
    const events = this.sim.events.splice(0);
    if (events.length) {
      const shown = publicEvents(this.sim, events);
      if (shown.length) this.broadcast({ t: "events", events: shown });
      for (const e of events) {
        if (e.type === "plot_lost" && e.nation !== undefined && !this.online(e.nation)) {
          const by = this.sim.nations.get(e.by)?.name ?? "someone";
          this.notify(e.nation, "attack", `${by} is taking your land.`);
        }
        if (e.type === "eliminated" && e.nation !== undefined) this.notify(e.nation, "eliminated", "Your nation has been eliminated. You can still watch, or join a faction.");
        if (e.type === "nuke_launched" && e.target !== undefined) {
          const owner = this.sim.owner[e.target];
          if (owner) this.notify(owner, "missile", "A missile is inbound. Impact in about a minute.");
        }
      }
    }
    const v = victory(this.sim);
    if (v) this.finish(v);
  }

  finish(v) {
    const info = this.meta("info") ?? {};
    this.frozen = true;
    this.meta("victory", { ...v, at: Date.now() });
    this.sendState();
    this.broadcast({ t: "victory", winner: v.winner, name: v.name });
    const text = v.name ? `${v.name} has won ${info.name ?? "the world"}.` : `Nobody is left standing in ${info.name ?? "the world"}.`;
    for (const nation of this.accounts.keys()) this.notify(nation, "world", text);
    if (this.env.DISCORD_WEBHOOK_URL) postWebhook(this.env.DISCORD_WEBHOOK_URL, `**${text}**`).catch(() => {});
    this.stopLoop();
  }

  async webSocketMessage(ws, raw) {
    const me = ws.deserializeAttachment();
    if (typeof raw !== "string" || raw.length > 4000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    const reply = (x) => ws.send(JSON.stringify({ v: PROTOCOL, ...x }));
    if (!this.limiter.take(me.account, Date.now())) return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "slow down" });
    switch (m.t) {
      case "ping": return reply({ t: "pong", at: m.at });
      case "chat": {
        const text = String(m.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 280);
        if (!text) return;
        const now = Date.now();
        if (now - (this.lastChat?.get(me.account) ?? 0) < 400) return reply({ t: "result", of: "chat", ok: false, error: "slow down" });
        (this.lastChat ??= new Map()).set(me.account, now);
        this.ctx.storage.sql.exec("INSERT INTO chat (t, who, text) VALUES (?, ?, ?)", now, me.name, text);
        return this.broadcast({ t: "chat", who: me.name, text, at: now });
      }
      case "admin": {
        const op = String(m.op ?? "").slice(0, 20);
        if (!me.admin) return reply({ t: "result", of: "admin", op, ok: false, error: "not allowed" });
        let r;
        try { r = await this.adminOp(me, m); } catch (e) { r = { ok: false, error: e.message }; }
        return reply({ t: "result", of: "admin", op, ...r });
      }
      default: {
        if (this.frozen) return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "the world has ended" });
        const r = runOrder(this.sim, me.nation, m);
        if (r) reply(r);
      }
    }
  }

  async adminOp(me, m) {
    const fail = error => ({ ok: false, error }), dir = () => this.env.DIRECTORY.getByName("directory");
    switch (m.op) {
      case "save": this.save(true); return { ok: true };
      case "hashes": this.flushDiffs(); return { ok: true, ...this.layerHashes() };
      case "log": return { ok: true, log: this.adminLog() };
      case "give":
      case "finish": {
        const r = runAdmin(this.sim, m);
        if (!r.ok) return r;
        this.logAdmin(me, m.op, r);
        this.flushDiffs();
        this.sendState();
        return r;
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

  logAdmin(me, op, detail = {}) {
    this.ctx.storage.sql.exec("INSERT INTO admin_log (t, who, op, detail) VALUES (?, ?, ?, ?)", Date.now(), me.name, op, JSON.stringify(detail));
  }

  adminLog() {
    return this.ctx.storage.sql.exec("SELECT t, who, op, detail FROM admin_log ORDER BY id DESC LIMIT ?", ADMIN_RULES.logShown).toArray().map(r => ({ ...r, detail: JSON.parse(r.detail) }));
  }

  dropAccount(account, text) {
    for (const ws of this.ctx.getWebSockets(`acc:${account}`)) {
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

  async webSocketClose(ws, code, reason) {
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
      frozen: !!this.frozen, victory: this.meta("victory"), tickErrors: this.errors ?? 0, lastError: this.lastError ?? null,
    };
  }
}
