import { PROTOCOL, MSG, ORDER_CODES, readFrame, applyPairs, pairs, PartCollector } from "./protocol.js";
import { decodeRuns, gunzip } from "./codec.js";
import { baseLayer } from "./maps.js";
import { tableFrom, decodeRows, footprintAt, placeError, costError, STATES } from "./buildings.js";

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
    this.zone = new Uint8Array(this.w * this.h);
    this.terrain = null;
    this.parts = new PartCollector();
    this.queue = [];
    this.events = [];
    this.ready = false;
    this.ownerReady = false;
    this.stale = false;
    this.defs = tableFrom(hello.defs ?? []);
    this.buildings = new Map();
    this.at = new Map();
    this.buildingsReady = !hello.frames?.buildings;
    this.early = new Set();
    this.purse = hello.purse ?? null;
    this.consRules = hello.consRules ?? { demolishRefund: 0.5, refundOnCancel: 0.5 };
    this.changed = [];
  }

  setBuilding([id, num, owner, anchor, state, pct]) {
    const def = this.defs.byNum[num];
    if (!def) return;
    const old = this.buildings.get(id);
    if (old) this.dropBuilding(old);
    const b = { id, type: def.id, def, owner, anchor, state: STATES[state] ?? "active", progress: pct / 100 };
    b.plots = footprintAt(this.w, this.h, anchor, def.fp) ?? [anchor];
    this.buildings.set(id, b);
    for (const i of b.plots) this.at.set(i, id);
    this.changed.push({ added: b, removed: old ?? null });
  }

  dropBuilding(b) {
    for (const i of b.plots) if (this.at.get(i) === b.id) this.at.delete(i);
    this.buildings.delete(b.id);
  }

  removeBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return;
    this.dropBuilding(b);
    this.changed.push({ added: null, removed: b });
  }

  buildingAt(i) {
    const id = this.at.get(i);
    return id === undefined ? null : this.buildings.get(id);
  }

  placeError(type, anchor) {
    const def = this.defs.table[type], me = this.nations.get(this.you);
    if (!def || !me) return "unknown building";
    const view = { w: this.w, h: this.h, terrain: this.terrain, owner: this.owner, occupant: i => { const b = this.buildingAt(i); return b && b.state !== "rubble" ? b.id : 0; } };
    const nation = { id: this.you, era: this.purse?.era ?? "T", money: this.purse?.money ?? 0, stock: this.purse?.stock ?? {} };
    return placeError(view, nation, def, anchor) ?? costError(def, nation);
  }

  costError(type) {
    const def = this.defs.table[type];
    return def ? costError(def, { money: this.purse?.money ?? 0, stock: this.purse?.stock ?? {} }) : "unknown building";
  }

  takeChanged() { return this.changed.splice(0); }

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
    if (f.type === MSG.ZONE_DIFF) {
      applyPairs(this.zone, f.body);
      const d = pairs(f.body), plots = [];
      for (let k = 0; k < d.length; k += 2) plots.push(d[k]);
      return { layer: "zone", plots };
    }
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
    if (f.type === MSG.ZONE) { decodeRuns(whole, this.zone); return { layer: "zone", all: true }; }
    if (f.type === MSG.BUILDINGS) {
      for (const r of decodeRows(whole)) if (!this.early.has(r[0])) this.setBuilding(r);
      this.buildingsReady = true;
      this.early.clear();
      return { layer: "buildings", all: true };
    }
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
      for (const r of m.b ?? []) { if (!this.buildingsReady) this.early.add(r[0]); this.setBuilding(r); }
      for (const id of m.bg ?? []) { if (!this.buildingsReady) this.early.add(id); this.removeBuilding(id); }
    }
    if (m.t === "purse") this.purse = { money: m.money, stock: m.stock, era: m.era, town: m.town };
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
