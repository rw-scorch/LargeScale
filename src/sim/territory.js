import { Grid, disc } from "../shared/grid.js";
import { TERRAIN, isLand } from "../shared/terrain.js";
import { findPath } from "../shared/pathfind.js";

export const RULES = {
  spawnRadius: 4,
  troopBase: 1000,
  troopPerPlot: 4,
  growthRate: 0.03,
  growthFloor: 2,
  stackSpeed: 1.5,
  advanceRate: 6,
  advanceRadius: 5,
  unownedCost: 0.6,
  enemyCostFactor: 1.2,
  defenderLossShare: 0.5,
  minStack: 10,
  enclaveLimit: 96,
  spawnMinGap: 12,
};

export class World {
  constructor(map, rules = {}) {
    this.grid = new Grid(map.w, map.h);
    this.terrain = map.terrain;
    this.owner = new Uint16Array(this.grid.size);
    this.nations = new Map();
    this.stacks = new Map();
    this.rules = { ...RULES, ...rules };
    this.nextNation = 1;
    this.nextStack = 1;
    this.time = 0;
    this.events = [];
    this.dirty = new Set();
    this.border = new Map();
    this.lost = new Map();
    this.hostile = (a, b) => a !== b;
    this.passable = (a, b) => a === b;
    this.hooks = { preTick: [], postMove: [], postTick: [] };
  }

  emit(type, data) { this.events.push({ t: this.time, type, ...data }); }

  addNation({ name, colour = "#4f8fe0", bot = false, human = !bot }) {
    const id = this.nextNation++;
    this.nations.set(id, { id, name, colour, bot, human, plots: 0, troops: 0, alive: true, spawned: false });
    return id;
  }

  claim(i, nid) {
    const old = this.owner[i];
    if (old === nid) return;
    if (old) { this.nations.get(old).plots--; this.border.get(old)?.delete(i); }
    if (nid) this.nations.get(nid).plots++;
    this.owner[i] = nid;
    this.dirty.add(i);
    this.touchBorder(i);
    for (const n of this.grid.neighbours4(i)) this.touchBorder(n);
  }

  isBorder(i) {
    const o = this.owner[i], ow = this.owner, t = this.terrain, w = this.grid.w, x = i % w;
    return (i >= w && ow[i - w] !== o && isLand(t[i - w])) || (i + w < ow.length && ow[i + w] !== o && isLand(t[i + w]))
      || (x > 0 && ow[i - 1] !== o && isLand(t[i - 1])) || (x < w - 1 && ow[i + 1] !== o && isLand(t[i + 1]));
  }

  touchBorder(i) {
    const o = this.owner[i];
    if (!o) return;
    let set = this.border.get(o);
    if (!set) this.border.set(o, (set = new Set()));
    if (this.isBorder(i)) set.add(i); else set.delete(i);
  }

  borderOf(nid) { return this.border.get(nid) ?? new Set(); }

  rebuildBorders() {
    this.border.clear();
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i];
      if (!o || !this.isBorder(i)) continue;
      let set = this.border.get(o);
      if (!set) this.border.set(o, (set = new Set()));
      set.add(i);
    }
  }

  plotLost(o, by, at) {
    const e = this.lost.get(o);
    if (e) { e.count++; return; }
    this.emit("plot_lost", { nation: o, by, at, count: 1 });
    this.lost.set(o, this.events[this.events.length - 1]);
  }

  canSpawnAt(x, y) {
    const g = this.grid, r = this.rules;
    if (!g.inside(x, y) || !isLand(this.terrain[g.idx(x, y)])) return false;
    for (const i of disc(g, x, y, r.spawnMinGap)) if (this.owner[i]) return false;
    return true;
  }

  spawn(nid, x, y) {
    const n = this.nations.get(nid);
    if (n.spawned || !this.canSpawnAt(x, y)) return false;
    for (const i of disc(this.grid, x, y, this.rules.spawnRadius)) if (isLand(this.terrain[i])) this.claim(i, nid);
    n.spawned = true;
    n.troops = this.rules.troopBase * 0.5;
    n.capital = this.grid.idx(x, y);
    this.emit("spawn", { nation: nid, x, y });
    return true;
  }

  maxTroops(n) { return this.rules.troopBase + this.rules.troopPerPlot * n.plots; }

  growTroops(dt) {
    const r = this.rules;
    for (const n of this.nations.values()) {
      if (!n.alive || !n.spawned) continue;
      const max = this.maxTroops(n);
      if (n.troops < max) n.troops = Math.min(max, n.troops + (r.growthFloor + r.growthRate * n.troops * (1 - n.troops / max)) * dt);
    }
  }

  moveCost(from, to) {
    const t = TERRAIN[this.terrain[to]];
    return t.land ? t.move : Infinity;
  }

  captureCost(i, attacker) {
    const t = TERRAIN[this.terrain[i]];
    const o = this.owner[i];
    if (!o) return this.rules.unownedCost * t.capture;
    const d = this.nations.get(o);
    const density = d.troops / Math.max(1, d.plots);
    return Math.max(1, density * this.rules.enemyCostFactor * t.defence * (d.defenceMult ?? 1));
  }

  createStack(nid, i, amount) {
    const n = this.nations.get(nid);
    amount = Math.floor(amount);
    if (!n?.alive || this.owner[i] !== nid || amount < this.rules.minStack || amount > n.troops) return null;
    n.troops -= amount;
    const s = { id: this.nextStack++, owner: nid, pos: i, troops: amount, path: [], progress: 0, order: "hold", engaged: false };
    this.stacks.set(s.id, s);
    this.emit("stack_created", { stack: s.id, nation: nid, troops: amount });
    return s;
  }

  disbandStack(sid) {
    const s = this.stacks.get(sid);
    if (!s || this.owner[s.pos] !== s.owner) return false;
    const n = this.nations.get(s.owner);
    n.troops = Math.min(this.maxTroops(n) * 1.25, n.troops + s.troops);
    this.stacks.delete(sid);
    return true;
  }

  splitStack(sid, amount) {
    const s = this.stacks.get(sid);
    amount = Math.floor(amount);
    if (!s || amount < this.rules.minStack || s.troops - amount < this.rules.minStack) return null;
    s.troops -= amount;
    const c = { ...s, id: this.nextStack++, troops: amount, path: [], progress: 0, order: "hold" };
    this.stacks.set(c.id, c);
    return c;
  }

  mergeStacks(aId, bId) {
    const a = this.stacks.get(aId), b = this.stacks.get(bId);
    if (!a || !b || a.owner !== b.owner || this.grid.cheb(a.pos, b.pos) > 1) return false;
    a.troops += b.troops;
    this.stacks.delete(bId);
    return true;
  }

  orderMove(sid, target, order = "move") {
    const s = this.stacks.get(sid);
    if (!s || !isLand(this.terrain[target])) return false;
    const cost = (a, b) => this.moveCost(a, b);
    cost.minStep = 0.9;
    const path = findPath(this.grid, s.pos, target, cost, 60000);
    if (!path) return false;
    s.path = path.slice(1);
    s.progress = 0;
    s.order = order;
    return true;
  }

  orderAdvance(sid) {
    const s = this.stacks.get(sid);
    if (!s) return false;
    s.path = [];
    s.order = "advance";
    s.carry = 0;
    return true;
  }

  enter(s, next) {
    const o = this.owner[next];
    if (o === s.owner || (o && this.passable(s.owner, o))) { s.pos = next; return true; }
    if (o && !this.hostile(s.owner, o)) return false;
    const cost = this.captureCost(next, s.owner);
    if (s.troops <= cost) {
      this.emit("stalled", { stack: s.id, at: next });
      return false;
    }
    s.troops -= cost;
    if (o) {
      const d = this.nations.get(o);
      d.troops = Math.max(0, d.troops - cost * this.rules.defenderLossShare);
      this.plotLost(o, s.owner, next);
    }
    this.claim(next, s.owner);
    s.pos = next;
    this.fillEnclaves(next, s.owner);
    return true;
  }

  stepStack(s, dt) {
    if (s.engaged) return;
    if (s.path.length) {
      s.progress += (this.rules.stackSpeed * (s.speedMult ?? 1) * dt) / this.moveCost(s.pos, s.path[0]);
      while (s.progress >= 1 && s.path.length) {
        s.progress -= 1;
        if (!this.enter(s, s.path[0])) { s.path = []; s.progress = 0; if (s.order === "move") s.order = "hold"; break; }
        s.path.shift();
      }
      if (!s.path.length && s.order === "move") s.order = "hold";
    } else if (s.order === "advance") {
      this.advance(s, dt);
    }
  }

  frontier(s) {
    const g = this.grid, R = this.rules.advanceRadius;
    const sx = g.x(s.pos), sy = g.y(s.pos), out = [];
    for (let y = Math.max(0, sy - R); y <= Math.min(g.h - 1, sy + R); y++)
      for (let x = Math.max(0, sx - R); x <= Math.min(g.w - 1, sx + R); x++) {
        const i = g.idx(x, y), o = this.owner[i];
        const d = Math.hypot(x - sx, y - sy);
        if (d > R + 0.5 || o === s.owner || !isLand(this.terrain[i])) continue;
        if (o && !this.hostile(s.owner, o)) continue;
        if (!g.neighbours4(i).some(n => this.owner[n] === s.owner)) continue;
        out.push([d, i]);
      }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out.map(v => v[1]);
  }

  advance(s, dt) {
    s.carry = (s.carry ?? 0) + this.rules.advanceRate * (s.speedMult ?? 1) * dt;
    let budget = Math.floor(s.carry);
    s.carry -= budget;
    if (!budget) return;
    const f = this.frontier(s);
    if (!f.length) { s.order = "hold"; this.emit("advance_done", { stack: s.id }); return; }
    for (const i of f) {
      if (budget-- <= 0) break;
      const o = this.owner[i];
      const cost = this.captureCost(i, s.owner);
      if (s.troops <= cost + this.rules.minStack) { s.order = "hold"; this.emit("stalled", { stack: s.id, at: i }); break; }
      s.troops -= cost;
      if (o) {
        const d = this.nations.get(o);
        d.troops = Math.max(0, d.troops - cost * this.rules.defenderLossShare);
        this.plotLost(o, s.owner, i);
      }
      this.claim(i, s.owner);
      this.fillEnclaves(i, s.owner);
    }
  }

  fillEnclaves(i, nid) {
    const g = this.grid, lim = this.rules.enclaveLimit;
    for (const start of g.neighbours4(i)) {
      if (this.owner[start] === nid) continue;
      const seen = new Set([start]), stack = [start];
      let open = false;
      while (stack.length && !open) {
        const c = stack.pop();
        const x = g.x(c), y = g.y(c);
        if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) { open = true; break; }
        for (const n of g.neighbours4(c)) {
          if (this.owner[n] === nid || seen.has(n)) continue;
          const o = this.owner[n];
          if (o && !this.hostile(nid, o)) { open = true; break; }
          seen.add(n);
          stack.push(n);
          if (seen.size > lim) { open = true; break; }
        }
      }
      if (open) continue;
      let land = 0;
      for (const c of seen) if (isLand(this.terrain[c])) land++;
      if (!land) continue;
      for (const c of seen) if (isLand(this.terrain[c])) this.claim(c, nid);
      this.emit("enclave", { nation: nid, plots: land });
    }
  }

  checkEliminations() {
    for (const n of this.nations.values()) {
      if (!n.alive || !n.spawned || n.plots > 0) continue;
      n.alive = false;
      for (const s of [...this.stacks.values()]) if (s.owner === n.id) this.stacks.delete(s.id);
      this.emit("eliminated", { nation: n.id });
    }
  }

  tick(dt) {
    this.time += dt;
    this.lost.clear();
    for (const f of this.hooks.preTick) f(this, dt);
    this.growTroops(dt);
    for (const s of this.stacks.values()) this.stepStack(s, dt);
    for (const f of this.hooks.postMove) f(this, dt);
    this.checkEliminations();
    for (const f of this.hooks.postTick) f(this, dt);
  }

  takeDirty() {
    const out = [...this.dirty].map(i => [i, this.owner[i]]);
    this.dirty.clear();
    return out;
  }
}
