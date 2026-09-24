import { PROTOCOL, MSG, ORDER_CODES, readFrame, applyPairs, pairs, PartCollector } from "./protocol.js";
import { decodeRuns, gunzip } from "./codec.js";
import { baseLayer } from "./maps.js";

const stackFromRow = ([id, owner, pos, troops, order]) => ({ id, owner, pos, troops, order: ORDER_CODES[order] ?? "hold" });

export class ClientWorld {
  constructor(hello) {
    this.w = hello.w;
    this.h = hello.h;
    this.you = hello.you;
    this.map = hello.map;
    this.expect = hello.hashes;
    this.frozen = !!hello.frozen;
    this.victory = hello.victory ?? null;
    this.time = 0;
    this.nations = new Map(hello.nations.map(n => [n.id, { ...n }]));
    this.stacks = new Map((hello.stacks ?? []).map(r => [r[0], stackFromRow(r)]));
    this.chat = [...(hello.chat ?? [])];
    this.owner = new Uint16Array(this.w * this.h);
    this.terrain = null;
    this.parts = new PartCollector();
    this.queue = [];
    this.events = [];
    this.ready = false;
    this.ownerReady = false;
    this.stale = false;
  }

  async loadBase(loadGzip) {
    const base = await baseLayer(this.map, this.w, this.h, async () => gunzip(await loadGzip()));
    if (base.hash && base.hash !== this.map.baseHash) throw new Error("The map file is out of date. Reload the page.");
    this.terrain = base.terrain.slice();
    this.ready = true;
    const changes = [];
    for (const f of this.queue.splice(0)) changes.push(this.frame(f));
    return changes;
  }

  frame(data) {
    const f = data instanceof Uint8Array || data instanceof ArrayBuffer ? readFrame(data) : data;
    if (f.version !== PROTOCOL) { this.stale = true; return null; }
    if (!this.ready) { this.queue.push(f); return null; }
    if (f.type === MSG.DIFF) {
      if (!this.ownerReady) return null;
      applyPairs(this.owner, f.body);
      const d = pairs(f.body), plots = [];
      for (let k = 0; k < d.length; k += 2) plots.push(d[k]);
      return { layer: "owner", plots };
    }
    const whole = this.parts.add(f);
    if (!whole) return null;
    if (f.type === MSG.TERRAIN_DIFF) { applyPairs(this.terrain, whole); return { layer: "terrain", all: true }; }
    if (f.type === MSG.OWNER) { decodeRuns(whole, this.owner); this.ownerReady = true; return { layer: "owner", all: true }; }
    return null;
  }

  message(m) {
    if (m.v !== undefined && m.v !== PROTOCOL) { this.stale = true; return m; }
    if (m.t === "state") {
      this.time = m.time;
      for (const [id, plots, troops, alive, spawned] of m.n) {
        if (!this.nations.has(id)) this.nations.set(id, { id, name: `Nation ${id}`, colour: "#8a8a8a" });
        Object.assign(this.nations.get(id), { plots, troops, alive: !!alive, spawned: !!spawned });
      }
      for (const r of m.s) this.stacks.set(r[0], stackFromRow(r));
      for (const id of m.gone) this.stacks.delete(id);
    }
    if (m.t === "joined") {
      const n = this.nations.get(m.nation) ?? { id: m.nation, plots: 0, troops: 0, alive: true, spawned: false, bot: false, capital: null };
      this.nations.set(m.nation, Object.assign(n, { name: m.name, colour: m.colour ?? n.colour }));
    }
    if (m.t === "events") {
      for (const e of m.events) {
        if (e.type === "spawn" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.y * this.w + e.x;
        if (e.type === "capital_moved" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.to;
        this.events.push(e);
      }
      if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    }
    if (m.t === "chat") this.chat.push({ t: m.at, who: m.who, text: m.text });
    if (m.t === "victory") { this.frozen = true; this.victory = { winner: m.winner, name: m.name }; }
    return m;
  }

  myStacks() { return [...this.stacks.values()].filter(s => s.owner === this.you); }
}
