import { PROTOCOL, MSG, ORDER_CODES, readFrame, applyPairs, pairs, PartCollector } from "./protocol.js";
import { decodeRuns, gunzip } from "./codec.js";
import { baseLayer } from "./maps.js";
import { tableFrom, decodeRows, footprintAt, placeError, costError, STATES } from "./buildings.js";
import { emptyDeposits, decodeDeposits, cropDeposits, depositIndex } from "./deposits.js";
import { lockMap, lockReason, researchError } from "./research.js";
import { ERA_ORDER } from "./buildings.js";
import { unitTable, mixFromRow, mixParts, powerOf } from "./units.js";
import { piecePlots } from "./planner.js";

const LEVY_ONLY = [{ id: "levy", num: 1, name: "Levies", kind: "troop", era: "T", attack: 1, defence: 1, speed: 1, capture: 1 }];

const stackFromRow = ([id, owner, pos, troops, order, mix, xp], units) => ({ id, owner, pos, troops, order: ORDER_CODES[order] ?? "hold", mix: mixFromRow(units, mix), xp: xp ?? 0 });

const MACHINE_STATES = ["idle", "moving", "wreck"];

const MISSIONS = [null, "patrol", "bomb", "return", "drop"];

const machineFromRow = ([id, owner, num, at, hp, state, cargo, follow, face, air, navy], units) => {
  const def = units.byNum[num];
  if (!def) return null;
  const u = { id, owner, type: def.id, def, at, hp, state: MACHINE_STATES[state] ?? "idle", cargo, follow: follow || null, face: face ?? 1, dive: navy?.[0] ?? 0, firing: navy && navy[1] >= 0 ? navy[1] : null };
  if (air) u.air = { x: air[0] / 10, y: air[1] / 10, heading: air[2] / 100, landed: !!air[3], bombs: air[4], fuel: air[5], mission: MISSIONS[air[6]] ?? null, rearm: air[7] ?? 0, queued: !!air[8], target: air.length > 10 ? [air[9] / 10, air[10] / 10] : null };
  return u;
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
    this.convoys = new Map();
    for (const r of hello.convoys ?? []) this.setConvoy(r);
    this.chat = [...(hello.chat ?? [])];
    this.owner = new Uint16Array(this.w * this.h);
    this.zone = new Uint8Array(this.w * this.h);
    this.roads = new Uint8Array(this.w * this.h);
    this.roadRules = hello.roadRules ?? null;
    this.powerRules = hello.powerRules ?? null;
    this.goldRules = hello.goldRules ?? null;
    this.soldierRules = hello.soldierRules ?? null;
    this.pilotRules = hello.pilotRules ?? null;
    this.planRules = hello.planRules ?? null;
    this.planQueue = hello.plan ?? [];
    this.pilots = new Map();
    this.shots = [];
    this.setPilots(hello.pilots ?? [], []);
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
    this.powers = hello.powers ?? [];
    this.consRules = { demolishRefund: 0.5, refundOnCancel: 0.5, instantPremium: 1.5, moneyForMissing: 4, ...hello.consRules };
    this.disbandLoss = hello.disbandLoss ?? 0.25;
    this.seasonRules = { dayLengthMinutes: 60, daysPerSeason: 6, ...hello.seasonRules };
    this.time = hello.time ?? 0;
    this.changed = [];
    this.depositIds = hello.depositIds ?? [];
    this.depositNames = hello.depositNames ?? [];
    this.deposits = emptyDeposits();
    this.depleted = new Set(hello.depleted ?? []);
    this.tech = hello.tech ?? { eras: [], branches: [], nodes: [] };
    this.policyRules = hello.policyRules ?? null;
    this.schedule = hello.schedule ?? {};
    this.info = hello.info ?? null;
    this.skew = (hello.now ?? Date.now()) - Date.now();
    this.shrinkIn = null;
    this.locks = lockMap(this.tech);
    this.effects = [];
  }

  serverNow() { return Date.now() + (this.skew ?? 0); }

  known() {
    const list = this.purse?.research?.known ?? [];
    if (this.knownCache?.list !== list) this.knownCache = { list, set: new Set(list) };
    return this.knownCache.set;
  }

  lockOf(id, kind = "buildings") { return lockReason(this.locks, this.known(), id, kind); }

  mixOf(s) { return mixParts(this.unitTypes, s.troops, s.mix); }

  setMachine(r) {
    const u = machineFromRow(r, this.unitTypes), old = u && this.machines.get(u.id);
    if (u?.air) { u.air.px = old?.air ? old.air.x : u.air.x; u.air.py = old?.air ? old.air.y : u.air.y; u.air.at = Date.now(); }
    if (u) this.machines.set(u.id, u);
  }

  planeAt(u) {
    const A = u.air;
    if (!A) return null;
    const t = Math.min(1, (Date.now() - A.at) / 1000);
    return [A.px + (A.x - A.px) * t, A.py + (A.y - A.py) * t, A.heading];
  }

  myMachines() { return [...this.machines.values()].filter(u => u.owner === this.you); }

  samOf(kind, id) {
    const r = this.purse?.sams?.find(r => r[0] === kind && r[1] === id);
    return r ? { missiles: r[2], max: r[3], reloadIn: r[4] } : null;
  }

  setConvoy([id, owner, pos, kind, amount, era, dest, ship = 0, train = 0]) {
    const old = this.convoys.get(id), moved = old && old.pos !== pos && !!old.ship === !!ship;
    this.convoys.set(id, { id, owner, pos, kind, amount, era, dest, ship: ship || null, train: !!train, prev: moved ? old.pos : old && !!old.ship !== !!ship ? pos : old?.prev ?? pos, movedAt: moved ? Date.now() : old?.movedAt ?? 0 });
  }


  setPilots(rows, shots) {
    const now = Date.now(), seen = new Set();
    for (const [kind, id, owner, x, y, heading] of rows) {
      const key = `${kind ? "m" : "s"}:${id}`, old = this.pilots.get(key);
      seen.add(key);
      this.pilots.set(key, { key, kind: kind ? "m" : "s", id, owner, x, y, heading, px: old ? old.x : x, py: old ? old.y : y, at: now });
    }
    for (const key of [...this.pilots.keys()]) if (!seen.has(key)) this.pilots.delete(key);
    for (const [x0, y0, x1, y1, shell, by, hit] of shots ?? []) this.shots.push({ x0, y0, x1, y1, shell: !!shell, by, hit, at: now });
    if (this.shots.length) this.shots = this.shots.filter(s => now - s.at < 1000);
  }

  pilotAt(key) {
    const p = this.pilots.get(key);
    if (!p) return null;
    const t = Math.min(1, (Date.now() - p.at) / (this.pilotRules?.sendEvery ?? 100));
    return [p.px + (p.x - p.px) * t, p.py + (p.y - p.py) * t, p.heading];
  }

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
    this.forts = null;
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
    this.forts = null;
  }

  removeBuilding(id) {
    const b = this.buildings.get(id);
    if (!b) return;
    this.dropBuilding(b);
    this.changed.push({ added: null, removed: b });
  }

  fortAt(owner, i) {
    if (!owner) return 1;
    if (!this.forts) {
      this.forts = new Map();
      for (const b of this.buildings.values()) {
        if (!b.def.fort || b.state !== "active") continue;
        if (!this.forts.has(b.owner)) this.forts.set(b.owner, []);
        this.forts.get(b.owner).push({ x: (b.anchor % this.w) + b.def.fp[0] / 2, y: Math.floor(b.anchor / this.w) + b.def.fp[1] / 2, r: b.def.fort.radius, m: b.def.fort.defence });
      }
    }
    const x = (i % this.w) + 0.5, y = Math.floor(i / this.w) + 0.5;
    let best = 1;
    for (const f of this.forts.get(owner) ?? []) if (f.m > best && (f.x - x) ** 2 + (f.y - y) ** 2 <= f.r * f.r) best = f.m;
    return best;
  }

  buildingAt(i) {
    const id = this.at.get(i);
    return id === undefined ? null : this.buildings.get(id);
  }

  placeError(type, anchor) {
    const def = this.defs.table[type], me = this.nations.get(this.you);
    if (!def || !me) return "unknown building";
    const view = { w: this.w, h: this.h, terrain: this.terrain, owner: this.owner, occupant: i => { const b = this.buildingAt(i); return b && b.state !== "rubble" ? b.id : 0; }, deposit: i => this.depositAt(i), lockOf: id => this.lockOf(id), road: this.roads };
    const nation = { id: this.you, era: this.purse?.era ?? "T", money: this.purse?.money ?? 0 };
    return placeError(view, nation, def, anchor) ?? costError(def, nation);
  }

  planView(extra = {}) {
    const p = this.purse, me = this.nations.get(this.you);
    const occupant = i => { const b = this.buildingAt(i); return b && b.state !== "rubble" ? b.id : 0; };
    const view = {
      w: this.w, h: this.h, terrain: this.terrain, owner: this.owner, zone: this.zone, road: this.roads, occupant, blocked: i => !!occupant(i),
      deposit: i => this.depositAt(i), depositPlots: this.deposits.plots, depositName: k => this.depositNames[this.depositIds.indexOf(k)] ?? k,
      lockOf: (id, kind) => this.lockOf(id, kind), buildings: [...this.buildings.values()], defs: this.defs.table,
      me: { id: this.you, era: p?.era ?? "T", money: p?.money ?? 0, capital: me?.capital ?? null }, town: p?.town ?? {},
      nations: [...this.nations.values()], power: p?.power ?? null, roadRules: this.roadRules, powerRules: this.powerRules,
      worth: this.goldRules?.worth, keep: p?.plan?.keep ?? [], premium: this.consRules.instantPremium, reserved: [],
    };
    for (const q of this.planQueue) for (const piece of q.pieces) if (piece.t === "build" || piece.t === "zone") view.reserved.push(...piecePlots(view, piece));
    return Object.assign(view, extra);
  }

  costError(type) {
    const def = this.defs.table[type];
    return def ? costError(def, { money: this.purse?.money ?? 0 }) : "unknown building";
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
    if (f.type === MSG.ROAD_DIFF) {
      applyPairs(this.roads, f.body);
      const d = pairs(f.body), plots = [];
      for (let k = 0; k < d.length; k += 2) plots.push(d[k]);
      return { layer: "road", plots };
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
    if (f.type === MSG.ROAD) { decodeRuns(whole, this.roads); return { layer: "road", all: true }; }
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
      this.shrinkIn = m.shrinkIn ?? null;
      for (const [id, plots, troops, alive, spawned, era] of m.n) {
        if (!this.nations.has(id)) this.nations.set(id, { id, name: `Nation ${id}`, colour: "#8a8a8a" });
        Object.assign(this.nations.get(id), { plots, troops, alive: !!alive, spawned: !!spawned, era: ERA_ORDER[era] ?? "T" });
      }
      for (const r of m.s) {
        const old = this.stacks.get(r[0]), s = stackFromRow(r, this.unitTypes);
        if (old && old.pos !== s.pos) { s.prev = old.pos; s.movedAt = Date.now(); }
        else if (old) { s.prev = old.prev; s.movedAt = old.movedAt; }
        this.stacks.set(r[0], s);
      }
      for (const id of m.gone) this.stacks.delete(id);
      for (const r of m.m ?? []) this.setMachine(r);
      for (const id of m.mg ?? []) this.machines.delete(id);
      for (const r of m.c ?? []) this.setConvoy(r);
      for (const id of m.cg ?? []) this.convoys.delete(id);
      for (const r of m.b ?? []) { if (!this.buildingsReady) this.early.add(r[0]); this.setBuilding(r); }
      for (const id of m.bg ?? []) { if (!this.buildingsReady) this.early.add(id); this.removeBuilding(id); }
    }
    if (m.t === "purse") this.purse = { money: m.money, era: m.era, town: m.town, making: m.making ?? {}, season: m.season ?? null, research: m.research ?? null, orders: m.orders ?? [], army: m.army ?? null, field: m.field ?? null, machines: m.machines ?? null, vitals: m.vitals ?? null, policy: m.policy ?? null, guard: !!m.guard, autoRoads: m.autoRoads ?? null, trade: m.trade ?? null, power: m.power ?? null, plan: m.plan ?? null, sams: m.sams ?? null, cheats: m.cheats ?? null };
    if (m.t === "presence") this.online = new Set(m.online ?? []);
    if (m.t === "plan") this.planQueue = m.queue ?? [];
    if (m.t === "pilots") this.setPilots(m.p ?? [], m.shots ?? []);
    if (m.t === "schedule") { this.schedule = m.schedule ?? {}; if (m.info) this.info = m.info; }
    if (m.t === "phase") this.lastPhase = m;
    if (m.t === "joined") {
      const n = this.nations.get(m.nation) ?? { id: m.nation, plots: 0, troops: 0, alive: true, spawned: false, bot: false, capital: null };
      this.nations.set(m.nation, Object.assign(n, { name: m.name, colour: m.colour ?? n.colour }));
    }
    if (m.t === "powers") this.powers = m.powers ?? [];
    if (m.t === "events") {
      for (const e of m.events) {
        if (e.type === "spawn" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.y * this.w + e.x;
        if (e.type === "capital_moved" && this.nations.has(e.nation)) this.nations.get(e.nation).capital = e.to;
        if (e.type === "deposit_depleted") this.depleted.add(e.at);
        if (e.type === "bombed") this.effects.push({ kind: "bomb", plot: e.at, at: Date.now(), bombs: e.bombs ?? 1, heading: this.machines.get(e.machine)?.air?.heading ?? 0 });
        if (e.type === "sam_fired" && e.from && e.to) this.effects.push({ kind: "sam", from: e.from, to: e.to, at: Date.now() });
        if (e.type === "landed" && this.machines.get(e.machine)?.def.domain === "air") this.effects.push({ kind: this.machines.get(e.machine).def.paraOnly ? "chute" : "heli", plot: e.at, at: Date.now(), n: Math.max(1, Math.min(6, Math.round(e.troops / 30))) });
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
    if (m.t === "victory") { this.frozen = true; this.victory = { winner: m.winner, name: m.name, by: m.by ?? null }; }
    if (m.t === "ended") { this.frozen = true; this.ended = true; }
    if (m.t === "reopened") { this.frozen = !!this.victory; this.ended = false; }
    if (m.t === "speed") this.speed = m.factor;
    if (m.t === "renamed") this.name = m.name;
    return m;
  }

  myStacks() { return [...this.stacks.values()].filter(s => s.owner === this.you); }
}
