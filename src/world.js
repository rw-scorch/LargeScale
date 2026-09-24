import { DurableObject } from "cloudflare:workers";
import { World as Sim } from "./sim/territory.js";
import { makeTestMap } from "./shared/testmap.js";
import { planCatchUp, runCatchUp } from "./sim/offline.js";
import { NotifyQueue, formatBatch, prefsFor, wants } from "./notify.js";
import { postWebhook, directMessage, mention } from "./discord.js";

const CHUNK = 128;
const SAVE_EVERY_MS = 30000;
const COLOURS = ["#4f8fe0", "#d94a3a", "#4fae4a", "#e0b53a", "#9a5fd0", "#3fb0a8", "#e07ab0", "#8a8a8a"];
const MSG = { TERRAIN: 1, OWNER: 2, DIFF: 3 };

function frame(type, typed) {
  const body = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const out = new Uint8Array(4 + body.length);
  out[0] = type;
  out.set(body, 4);
  return out;
}

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sim = null;
    this.loop = null;
    this.lastSave = 0;
    this.accounts = new Map();
    this.queue = new NotifyQueue();
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
        CREATE TABLE IF NOT EXISTS chunks (layer TEXT, idx INTEGER, data BLOB, PRIMARY KEY (layer, idx));
        CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, who TEXT, text TEXT);
      `);
      this.load();
    });
  }

  meta(k, v) {
    if (v === undefined) return JSON.parse(this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0]?.v ?? "null");
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, JSON.stringify(v));
  }

  load() {
    const info = this.meta("info");
    if (!info) return;
    const map = makeTestMap(info.w, info.h, info.seed);
    this.sim = new Sim(map, info.rules ?? {});
    const owner = this.sim.owner;
    for (const row of this.ctx.storage.sql.exec("SELECT idx, data FROM chunks WHERE layer = 'owner'")) {
      const data = new Uint16Array(new Uint8Array(row.data).buffer);
      this.chunkCopy(row.idx, data, owner, true);
    }
    const saved = this.meta("state");
    if (saved) {
      this.sim.time = saved.time;
      this.sim.nextNation = saved.nextNation;
      this.sim.nextStack = saved.nextStack;
      for (const n of saved.nations) this.sim.nations.set(n.id, n);
      for (const s of saved.stacks) this.sim.stacks.set(s.id, s);
      for (const [nid, acc] of saved.accounts ?? []) this.accounts.set(nid, acc);
    }
    const elapsed = (Date.now() - (this.meta("savedAt") ?? Date.now())) / 1000;
    if (elapsed > 5) {
      const job = planCatchUp(elapsed, { catchupStep: 60, maxCatchupSeconds: (info.maxCatchupHours ?? 72) * 3600 });
      runCatchUp(job, dt => { this.sim.growTroops(dt); this.sim.time += dt; }, 2000, () => Date.now());
      this.caughtUp = job.capped;
    }
    this.sim.dirty.clear();
  }

  chunkCopy(idx, data, owner, into) {
    const w = this.sim.grid.w, h = this.sim.grid.h, cw = Math.ceil(w / CHUNK);
    const cx = (idx % cw) * CHUNK, cy = Math.floor(idx / cw) * CHUNK;
    for (let y = 0; y < CHUNK && cy + y < h; y++)
      for (let x = 0; x < CHUNK && cx + x < w; x++) {
        const i = (cy + y) * w + cx + x, k = y * CHUNK + x;
        if (into) owner[i] = data[k]; else data[k] = owner[i];
      }
  }

  async init(config) {
    if (this.meta("info")) return { ok: true, existed: true };
    const info = { w: config.w ?? 320, h: config.h ?? 200, seed: config.seed ?? 5, rules: config.rules ?? {}, maxCatchupHours: config.maxCatchupHours ?? 72, name: config.name ?? "World" };
    this.meta("info", info);
    this.load();
    this.save(true);
    return { ok: true };
  }

  save(all = false) {
    if (!this.sim) return;
    const w = this.sim.grid.w, cw = Math.ceil(w / CHUNK), ch = Math.ceil(this.sim.grid.h / CHUNK);
    const idxs = new Set();
    if (all) for (let i = 0; i < cw * ch; i++) idxs.add(i);
    else for (const i of this.dirtyChunks ?? []) idxs.add(i);
    for (const idx of idxs) {
      const data = new Uint16Array(CHUNK * CHUNK);
      this.chunkCopy(idx, data, this.sim.owner, false);
      this.ctx.storage.sql.exec("INSERT OR REPLACE INTO chunks (layer, idx, data) VALUES ('owner', ?, ?)", idx, new Uint8Array(data.buffer));
    }
    this.dirtyChunks = new Set();
    this.meta("state", {
      time: this.sim.time, nextNation: this.sim.nextNation, nextStack: this.sim.nextStack,
      nations: [...this.sim.nations.values()], stacks: [...this.sim.stacks.values()], accounts: [...this.accounts],
    });
    this.meta("savedAt", Date.now());
    this.lastSave = Date.now();
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }

  online(nation) {
    return this.sockets().some(ws => ws.deserializeAttachment()?.nation === nation);
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

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!this.sim) return new Response("world not initialised", { status: 409 });
    const account = { id: Number(request.headers.get("X-Account")), name: request.headers.get("X-Name"), admin: request.headers.get("X-Admin") === "1" };
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`acc:${account.id}`]);
    let nation = [...this.accounts].find(([, a]) => a === account.id)?.[0] ?? null;
    if (nation === null) {
      nation = this.sim.addNation({ name: account.name, colour: COLOURS[this.accounts.size % COLOURS.length] });
      this.accounts.set(nation, account.id);
    }
    server.serializeAttachment({ account: account.id, name: account.name, admin: account.admin, nation });
    const g = this.sim.grid;
    server.send(JSON.stringify({ t: "hello", you: nation, w: g.w, h: g.h, caughtUp: this.caughtUp ?? 0, nations: this.nationList(), chat: this.recentChat() }));
    server.send(frame(MSG.TERRAIN, this.sim.terrain));
    server.send(frame(MSG.OWNER, this.sim.owner));
    this.broadcast({ t: "joined", nation, name: account.name });
    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  nationList() {
    return [...this.sim.nations.values()].map(n => ({ id: n.id, name: n.name, colour: n.colour, plots: n.plots, troops: Math.floor(n.troops), alive: n.alive, spawned: n.spawned, bot: n.bot }));
  }

  recentChat() {
    return this.ctx.storage.sql.exec("SELECT t, who, text FROM chat ORDER BY id DESC LIMIT 30").toArray().reverse();
  }

  broadcast(obj) {
    const s = typeof obj === "string" || obj instanceof Uint8Array ? obj : JSON.stringify(obj);
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

  step(dt) {
    this.sim.tick(dt);
    const changes = this.sim.takeDirty();
    if (changes.length) {
      const cw = Math.ceil(this.sim.grid.w / CHUNK);
      this.dirtyChunks ??= new Set();
      const flat = new Uint32Array(changes.length * 2);
      changes.forEach(([i, o], k) => {
        flat[k * 2] = i;
        flat[k * 2 + 1] = o;
        const x = i % this.sim.grid.w, y = Math.floor(i / this.sim.grid.w);
        this.dirtyChunks.add(Math.floor(y / CHUNK) * cw + Math.floor(x / CHUNK));
      });
      this.broadcast(frame(MSG.DIFF, flat));
    }
    this.tickCount = (this.tickCount ?? 0) + 1;
    if (this.tickCount % 4 === 0) {
      const stacks = [...this.sim.stacks.values()].map(s => ({ id: s.id, owner: s.owner, pos: s.pos, troops: Math.floor(s.troops), order: s.order }));
      this.broadcast({ t: "state", time: Math.floor(this.sim.time), nations: this.nationList(), stacks });
    }
    const events = this.sim.events.splice(0);
    if (events.length) {
      this.broadcast({ t: "events", events: events.slice(-50) });
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
  }

  async webSocketMessage(ws, raw) {
    const me = ws.deserializeAttachment();
    if (typeof raw !== "string" || raw.length > 4000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const sim = this.sim, g = sim.grid;
    const reply = (x) => ws.send(JSON.stringify(x));
    const n = sim.nations.get(me.nation);
    switch (m.t) {
      case "ping": return reply({ t: "pong", at: m.at });
      case "spawn": {
        const ok = Number.isInteger(m.x) && Number.isInteger(m.y) && sim.spawn(me.nation, m.x, m.y);
        return reply({ t: "result", of: "spawn", ok, error: ok ? null : "cannot spawn there" });
      }
      case "stack": {
        if (!n?.spawned) return reply({ t: "result", of: "stack", ok: false, error: "spawn first" });
        const at = Number.isInteger(m.at) ? m.at : n.capital;
        const s = sim.createStack(me.nation, at, Math.floor(n.troops * Math.min(1, Math.max(0.05, m.share ?? 0.3))));
        return reply({ t: "result", of: "stack", ok: !!s, stack: s?.id ?? null });
      }
      case "move": {
        const s = sim.stacks.get(m.stack);
        const ok = !!s && s.owner === me.nation && Number.isInteger(m.to) && m.to >= 0 && m.to < g.size && sim.orderMove(s.id, m.to);
        return reply({ t: "result", of: "move", ok });
      }
      case "advance": {
        const s = sim.stacks.get(m.stack);
        const ok = !!s && s.owner === me.nation && sim.orderAdvance(s.id);
        return reply({ t: "result", of: "advance", ok });
      }
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
        return reply({ t: "result", of: "admin", ok: false, error: "unknown op" });
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch {}
    if (this.sockets().filter(s => s !== ws).length === 0) this.stopLoop();
  }

  async webSocketError(ws) {
    if (this.sockets().filter(s => s !== ws).length === 0) this.stopLoop();
  }

  async status() {
    return { initialised: !!this.sim, players: this.accounts.size, online: this.sockets().length, looping: !!this.loop, time: this.sim?.time ?? 0 };
  }
}
