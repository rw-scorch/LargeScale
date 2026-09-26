import { PROTOCOL, MSG, ORDER_CODES, readFrame, applyPairs, pairs, PartCollector } from "./protocol.js";
import { decodeRuns, gunzip } from "./codec.js";
import { baseLayer } from "./maps.js";
import { tableFrom, decodeRows, footprintAt, placeError, costError, STATES } from "./buildings.js";
import { emptyDeposits, decodeDeposits, cropDeposits, depositIndex } from "./deposits.js";
import { lockMap, lockReason, researchError } from "./research.js";
import { ERA_ORDER } from "./buildings.js";
import { unitTable, mixFromRow, mixParts, powerOf } from "./units.js";

const LEVY_ONLY = [{ id: "levy", num: 1, name: "Levies", kind: "troop", era: "T", attack: 1, defence: 1, speed: 1, capture: 1 }];

const stackFromRow = ([id, owner, pos, troops, order, mix, xp], units) => ({ id, owner, pos, troops, order: ORDER_CODES[order] ?? "hold", mix: mixFromRow(units, mix), xp: xp ?? 0 });

const MACHINE_STATES = ["idle", "moving", "wreck"];

const machineFromRow = ([id, owner, num, at, hp, state, cargo, follow, face], units) => {
  const def = units.byNum[num];
  return def ? { id, owner, type: def.id, def, at, hp, state: MACHINE_STATES[state] ?? "idle", cargo, follow: follow || null, face: face ?? 1 } : null;
};

export class ClientWorld {
  constructor(hello) {
    this.w = hello.w;
    this.h = hello.h;
    this.you = hello.you;
    this.map = hello.map;
    this.expect = hello.hashes;
    this.frozen = !!hello.frozen;
    this.victory = hello.victory ?? null;
    this.ended = !!hello.ended;
    this.speed = hello.speed ?? 1;
    this.name = hello.name ?? null;
    this.time = 0;
    this.nations = new Map(hello.nations.map(n => [n.id, { ...n }]));
    this.unitTypes = unitTable(hello.units?.length ? hello.units : LEVY_ONLY);
    this.troopRules = { xpLevels: [0, 0.3, 1, 3], xpBonus: [0, 0.1, 0.2, 0.35], ...hello.troopRules };
    this.stacks = new Map((hello.stacks ?? []).map(r => [r[0], stackFromRow(r, this.unitTypes)]));
    this.online = new Set(hello.online ?? []);
    this.machines = new Map();
    for (const r of hello.machines ?? []) this.setMachine(r);
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
    this.consRules = { demolishRefund: 0.5, refundOnCancel: 0.5, instantPremium: 1.5, moneyForMissing: 4, ...hello.consRules };
    this.disbandLoss = hello.disbandLoss ?? 0.25;
    this.seasonRules = { dayLengthMinutes: 60, daysPerSeason: 6, ...hello.seasonRules };
    this.changed = [];
    this.depositIds = hello.depositIds ?? [];
    this.depositNames = hello.depositNames ?? [];
    this.deposits = emptyDeposits();
    this.depleted = new Set(hello.depleted ?? []);
    this.tech = hello.tech ?? { eras: [], branches: [], nodes: [] };
    this.locks = lockMap(this.tech);
    this.effects = [];
  }

  known() {
    const list = this.purse?.research?.known ?? [];
    if (this.knownCache?.list !== list) this.knownCache = { list, set: new Set(list) };
    return this.knownCache.set;
  }

  lockOf(id, kind = "buildings") { return lockReason(this.locks, this.known(), id, kind); }

  mixOf(s) { return mixParts(this.unitTypes, s.troops, s.mix); }

  setMachine(r) {
    const u = machineFromRow(r, this.unitTypes);
    if (u) this.machines.set(u.id, u);
  }

  myMachines() { return [...this.machines.values()].filter(u => u.owner === this.you); }

  powerOf(s, holding = false) { return powerOf(this.unitTypes, s.troops, s.mix, holding ? "defence" : "attack", this.troopRules.xpBonus[s.xp] ?? 0); }

  researchError(id) { return researchError(this.tech, this.locks, this.known(), this.purse?.era ?? "T", id); }

  setDeposits(dep) { this.deposits = dep; }

  loadDeposits(bytes) {
    const dep = decodeDeposits(bytes);
    this.setDeposits(this.map.rect ? cropDeposits(dep, this.map.srcW, this.map.rect) : dep);
  }

  depositKind(i) {
    const k = depositIndex(this.deposits, i);
    if (k < 0) return null;
    const t = this.deposits.type[k] - 1;
    return { id: this.depositIds[t], name: this.depositNames[t] ?? this.depositIds[t], depleted: this.depleted.has(i) };
  }

  depositAt(i) {
    const d = this.depositKind(i);
    return d && !d.depleted ? d.id : null;
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
    const view = { w: this.w, h: this.h, terrain: this.terrain, owner: this.owner, occupant: i => { const b = this.buildingAt(i); return b && b.state !== "rubble" ? b.id : 0; }, deposit: i => this.depositAt(i), lockOf: id => this.lockOf(id) };
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
    if (f.type === MSG.TERRAIN_EDIT) {
      applyPairs(this.terrain, f.body);
      const d = pairs(f.body), plots = [];
      for (let k = 0; k < d.length; k += 2) plots.push(d[k]);
      return { layer: "terrain", plots };
    }
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
    if (f.type === MSG.DEPOSITS) { this.setDeposits(decodeDeposits(whole)); return { layer: "deposits", all: true }; }
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
      for (const [id, plots, troops, alive, spawned, era] of m.n) {
        if (!this.nations.has(id)) this.nations.set(id, { id, name: `Nation ${id}`, colour: "#8a8a8a" });
        Object.assign(this.nations.get(id), { plots, troops, alive: !!alive, spawned: !!spawned, era: ERA_ORDER[era] ?? "T" });
      }
      for (const r of m.s) this.stacks.set(r[0], stackFromRow(r, this.unitTypes));
      for (const id of m.gone) this.stacks.delete(id);
      for (const r of m.m ?? []) this.setMachine(r);
      for (const id of m.mg ?? []) this.machines.delete(id);
      for (const r of m.b ?? []) { if (!this.buildingsReady) this.early.add(r[0]); this.setBuilding(r); }
      for (const id of m.bg ?? []) { if (!this.buildingsReady) this.early.add(id); this.removeBuilding(id); }
    }
    if (m.t === "purse") this.purse = { money: m.money, stock: m.stock, era: m.era, town: m.town, making: m.making ?? {}, season: m.season ?? null, research: m.research ?? null, orders: m.orders ?? [], army: m.army ?? null, machines: m.machines ?? null, vitals: m.vitals ?? null };
    if (m.t === "presence") this.online = new Set(m.online ?? []);
    if (m.t === "joined") {
      const n = this.nations.get(m.nation) ?? { id: m.nation, plots: 0, troops: 0, alive: true, spawned: false, bot: false, capital: null };
      this.nations.set(m.nation, Object.assign(n, { name: m.name, colour: m.colour ?? n.colour }));
    }
    if (m.t === "events") {
      for (const e of m.events) {
        if (e.type === "spawn" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.y * this.w + e.x;
        if (e.type === "capital_moved" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.to;
        if (e.type === "deposit_depleted") this.depleted.add(e.at);
        if (e.type === "era_up" && this.nations.has(e.nation)) {
          const n = this.nations.get(e.nation);
          n.era = e.era;
          if (n.capital != null) this.effects.push({ kind: "era_up", plot: n.capital, at: Date.now() });
        }
        this.events.push(e);
      }
      if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    }
    if (m.t === "chat") this.chat.push({ t: m.at, who: m.who, text: m.text });
    if (m.t === "victory") { this.frozen = true; this.victory = { winner: m.winner, name: m.name }; }
    if (m.t === "ended") { this.frozen = true; this.ended = true; }
    if (m.t === "reopened") { this.frozen = !!this.victory; this.ended = false; }
    if (m.t === "speed") this.speed = m.factor;
    if (m.t === "renamed") this.name = m.name;
    return m;
  }

  myStacks() { return [...this.stacks.values()].filter(s => s.owner === this.you); }
}
