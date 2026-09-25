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
import { makeRng } from "./shared/rng.js";
import { runOrder, RateLimit, applyPresence, victory, StateFeed, publicEvents } from "./game.js";
import { NotifyQueue, formatBatch, prefsFor, wants } from "./notify.js";
import { postWebhook, directMessage, mention } from "./discord.js";

const SAVE_VERSION = 3;
const LOADS = [2, 3];
const ROW_BYTES = 1_000_000;
const SAVE_EVERY_MS = 30000;
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
    this.tickCount = 0;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
        CREATE TABLE IF NOT EXISTS chunks (layer TEXT, idx INTEGER, data BLOB, PRIMARY KEY (layer, idx));
        CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, who TEXT, text TEXT);
      `);
      await this.load();
    });
  }

  meta(k, v) {
    if (v === undefined) return JSON.parse(this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0]?.v ?? "null");
    return this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, JSON.stringify(v)).rowsWritten;
  }

  readRows(layer) {
    const rows = this.ctx.storage.sql.exec("SELECT data FROM chunks WHERE layer = ? ORDER BY idx", layer).toArray();
    (this.parts ??= {})[layer] = rows.length;
    return joinParts(rows.map(r => new Uint8Array(r.data)));
  }

  writeRows(layer, bytes) {
    const sql = this.ctx.storage.sql, parts = splitParts(bytes, ROW_BYTES);
    let written = 0;
    parts.forEach((part, idx) => { written += sql.exec("INSERT OR REPLACE INTO chunks (layer, idx, data) VALUES (?, ?, ?)", layer, idx, part).rowsWritten; });
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
    const base = { ...map, baseHash: hashBytes(terrain), srcW: meta.w, srcH: meta.h, scale: meta.w / BASE_WIDTH };
    if (map.kind === "earth") return { map: base, w: meta.w, h: meta.h, terrain };
    const rect = cropRect(meta, map.box);
    if (!rect || rect.w < MIN_MAP_SIDE || rect.h < MIN_MAP_SIDE) return { error: "the crop is outside the map or too small" };
    if (rect.w * rect.h > MAX_PLOTS) return { error: `that region is ${rect.w} by ${rect.h} plots, over the ${MAX_PLOTS} limit; pick a smaller box or normal detail` };
    return { map: { ...base, rect }, w: rect.w, h: rect.h, terrain: cropLayer(terrain, meta.w, rect) };
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
    installBots(this.sim, makeRng(((info.seed ?? 1) + Math.floor(this.sim.time)) >>> 0), BOT);
    this.frozen = !!(this.meta("victory") || this.meta("ended"));
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
    this.loaded = { buildings, upgradedFrom: this.upgradedFrom ?? null };
  }

  layerHashes(terrain = this.sim.terrain) {
    const bld = this.sim.bld;
    return { terrain: hashBytes(terrain), owner: hashRuns(this.sim.owner), zone: hashRuns(bld.zone), wood: hashRuns(bld.wood), buildings: hashBytes(encodeBuildings(bld)) };
  }

  async init(config) {
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
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
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
    if (all || this.ownerChanged || this.sim.dirty.size) {
      const runs = encodeRuns(this.sim.owner);
      rows += this.writeRows("owner", runs);
      ownerBytes = runs.length;
      this.hashes.owner = hashBytes(runs);
      this.ownerChanged = false;
    }
    const layers = saveLayers(this.sim);
    const layerBytes = {};
    for (const [name, bytes] of Object.entries(layers)) {
      rows += this.writeRows(name, bytes);
      layerBytes[name] = bytes.length;
      this.hashes[name] = hashBytes(bytes);
    }
    rows += this.meta("state", {
      time: this.sim.time, nextNation: this.sim.nextNation, nextStack: this.sim.nextStack,
      nations: [...this.sim.nations.values()], stacks: [...this.sim.stacks.values()], accounts: [...this.accounts],
      savedAt: Date.now(), hashes: this.hashes,
    });
    this.lastSave = Date.now();
    const prev = this.saveStats ?? { saves: 0, totalRows: 0, maxRows: 0 };
    this.saveStats = { rows, ownerBytes, layerBytes, ms: Date.now() - t0, saves: prev.saves + 1, totalRows: prev.totalRows + rows, maxRows: Math.max(prev.maxRows, rows) };
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }

  online(nation) {
    return this.sockets().some(ws => ws.deserializeAttachment()?.nation === nation);
  }

  updatePresence(leaving = null) {
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
    if (!this.sim) return new Response(this.stale ? "world uses an old save format" : "world not initialised", { status: 409 });
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
    server.send(JSON.stringify({
      t: "hello", v: PROTOCOL, you: nation, w: g.w, h: g.h, map: join.map,
      hashes: { terrain: this.hashes.terrain, owner: hashBytes(runs) }, frames: { terrain: terrainFrames.length, owner: ownerFrames.length },
      caughtUp: this.caughtUp ?? 0, nations: this.nationList(), stacks: this.feed.snapshot(this.sim), chat: this.recentChat(),
      victory: this.meta("victory"), frozen: this.frozen,
    }));
    for (const f of terrainFrames) server.send(f);
    for (const f of ownerFrames) server.send(f);
    const n = this.sim.nations.get(nation);
    this.broadcast({ t: "joined", nation, name: n.name, colour: n.colour });
    if (!this.frozen) this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  nationList() {
    return [...this.sim.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot, capital: n.capital ?? null }));
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
      this.step(dt);
      if (now - this.lastSave > SAVE_EVERY_MS) this.save();
    }, ms);
  }

  stopLoop() {
    if (!this.loop) return;
    clearInterval(this.loop);
    this.loop = null;
    this.save();
  }

  flushDiffs() {
    const changes = this.sim.takeDirty();
    if (!changes.length) return;
    this.ownerChanged = true;
    const flat = new Uint32Array(changes.length * 2);
    changes.forEach(([i, o], k) => { flat[k * 2] = i; flat[k * 2 + 1] = o; });
    this.broadcast(frame(MSG.DIFF, flat));
  }

  sendState() {
    const d = this.feed.delta(this.sim);
    if (d) this.broadcast({ t: "state", time: Math.floor(this.sim.time), ...d });
  }

  step(dt) {
    if (this.frozen) return;
    this.sim.tick(dt);
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
        if (!me.admin) return reply({ t: "result", of: "admin", ok: false, error: "not allowed" });
        if (m.op === "save") { this.save(true); return reply({ t: "result", of: "admin", ok: true }); }
        if (m.op === "hashes") {
          this.flushDiffs();
          return reply({ t: "result", of: "admin", op: "hashes", ok: true, ...this.layerHashes() });
        }
        return reply({ t: "result", of: "admin", ok: false, error: "unknown op" });
      }
      default: {
        if (this.frozen) return reply({ t: "result", of: String(m.t ?? "").slice(0, 20), ok: false, error: "the world has ended" });
        const r = runOrder(this.sim, me.nation, m);
        if (r) reply(r);
      }
    }
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
    const info = this.meta("info");
    return {
      initialised: !!this.sim, players: this.accounts.size, online: this.sockets().length, looping: !!this.loop, time: this.sim?.time ?? 0,
      map: info?.map ?? null, w: info?.w, h: info?.h, landPlots: info?.landPlots, bots: info?.bots,
      hashes: this.hashes ?? null, loadCheck: this.loadCheck ?? null, loaded: this.loaded ?? null, lastSave: this.saveStats ?? null, loadMs: this.loadMs ?? null,
      frozen: !!this.frozen, victory: this.meta("victory"),
    };
  }
}
