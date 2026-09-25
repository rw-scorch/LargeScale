import { Grid, disc } from "../shared/grid.js";
import { TERRAIN, isLand } from "../shared/terrain.js";
import { buildRegions, coarseRoute, planSegment } from "../shared/pathfind.js";

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
  pathCell: 16,
  pathAhead: 8,
  pathLookahead: 24,
  pathMaxNodes: 60000,
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
    const area = new Set(disc(this.grid, x, y, this.rules.spawnRadius)), start = this.grid.idx(x, y), todo = [start];
    area.delete(start);
    while (todo.length) {
      const c = todo.pop();
      this.claim(c, nid);
      for (const i of this.grid.neighbours4(c)) if (area.has(i) && isLand(this.terrain[i])) { area.delete(i); todo.push(i); }
    }
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
    return Math.max(1, density * this.rules.enemyCostFactor * t.defence * (d.defenceMult ?? 1) * (1 + (d.effects?.defence ?? 0)));
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
    const c = { ...s, id: this.nextStack++, troops: amount, path: [], route: null, progress: 0, order: "hold" };
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

  pathGraph() {
    if (!this.coarse) this.coarse = buildRegions(this.grid, this.terrain, Float32Array.from({ length: 256 }, (_, t) => (TERRAIN[t] && isLand(t) ? TERRAIN[t].move : Infinity)), this.rules.pathCell);
    return this.coarse;
  }

  route(from, target) {
    if (!isLand(this.terrain[from]) || !isLand(this.terrain[target])) return null;
    const co = this.pathGraph();
    return coarseRoute(co, co.regionOf(from), co.regionOf(target));
  }

  extendPath(s) {
    const co = this.pathGraph(), r = s.route, from = s.path.length ? s.path[s.path.length - 1] : s.pos;
    let k = r.regions.indexOf(co.regionOf(from));
    if (k < 0) {
      const fresh = this.route(from, r.goal);
      if (!fresh) return false;
      r.regions = fresh.regions;
      k = 0;
    }
    r.regions.splice(0, k);
    const cost = (a, b) => this.moveCost(a, b);
    cost.minStep = 0.9;
    const seg = planSegment(this.grid, co, from, r.regions, r.goal, cost, { ahead: this.rules.pathAhead, maxNodes: this.rules.pathMaxNodes });
    if (!seg) return false;
    for (let j = 1; j < seg.length; j++) s.path.push(seg[j]);
    if (seg[seg.length - 1] === r.goal) s.route = null;
    return true;
  }

  orderMove(sid, target, order = "move") {
    const s = this.stacks.get(sid);
    if (!s || !isLand(this.terrain[target])) return false;
    const r = this.route(s.pos, target);
    if (!r) return false;
    const keep = { path: s.path, route: s.route, progress: s.progress, order: s.order };
    s.path = [];
    s.route = { regions: r.regions, goal: target };
    s.progress = 0;
    if (target !== s.pos && !this.extendPath(s)) { Object.assign(s, keep); return false; }
    if (target === s.pos) s.route = null;
    s.order = order;
    return true;
  }

  orderAdvance(sid) {
    const s = this.stacks.get(sid);
    if (!s) return false;
    s.path = [];
    s.route = null;
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
    if (s.route && s.path.length < this.rules.pathLookahead && !this.extendPath(s)) {
      s.route = null;
      this.emit("path_blocked", { stack: s.id, at: s.pos });
      if (!s.path.length && s.order === "move") s.order = "hold";
    }
    if (s.path.length) {
      s.progress += (this.rules.stackSpeed * (s.speedMult ?? 1) * dt) / this.moveCost(s.pos, s.path[0]);
      while (s.progress >= 1 && s.path.length) {
        s.progress -= 1;
        if (!this.enter(s, s.path[0])) { s.path = []; s.route = null; s.progress = 0; if (s.order === "move") s.order = "hold"; break; }
        s.path.shift();
      }
      if (!s.path.length && s.order === "move") s.order = "hold";
    } else if (s.order === "advance") {
      this.advance(s, dt);
    }
  }

  discOffsets() {
    const R = this.rules.advanceRadius;
    if (this.disc?.R === R) return this.disc.list;
    const list = [];
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= R + 0.5) list.push([d, dy, dx]);
      }
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    this.disc = { R, list };
    return list;
  }

  frontier(s, limit = Infinity) {
    const g = this.grid, ow = this.owner, w = g.w, me = s.owner;
    const sx = g.x(s.pos), sy = g.y(s.pos), out = [];
    for (const [, dy, dx] of this.discOffsets()) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= g.h) continue;
      const i = y * w + x, o = ow[i];
      if (o === me || !isLand(this.terrain[i])) continue;
      if (o && !this.hostile(me, o)) continue;
      if (!((y > 0 && ow[i - w] === me) || (x < w - 1 && ow[i + 1] === me) || (y < g.h - 1 && ow[i + w] === me) || (x > 0 && ow[i - 1] === me))) continue;
      out.push(i);
      if (out.length >= limit) break;
    }
    return out;
  }

  advance(s, dt) {
    s.carry = (s.carry ?? 0) + this.rules.advanceRate * (s.speedMult ?? 1) * dt;
    let budget = Math.floor(s.carry);
    s.carry -= budget;
    if (!budget) return;
    const f = this.frontier(s, budget);
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
    const g = this.grid, lim = this.rules.enclaveLimit, ow = this.owner, w = g.w, h = g.h, opened = [];
    for (const start of g.neighbours4(i)) {
      if (ow[start] === nid || opened.some(set => set.has(start))) continue;
      const seen = new Set([start]), stack = [start];
      let open = false;
      while (stack.length && !open) {
        const c = stack.pop();
        const x = c % w, y = (c / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { open = true; break; }
        for (let k = 0; k < 4; k++) {
          const n = k === 0 ? c - w : k === 1 ? c + 1 : k === 2 ? c + w : c - 1;
          const o = ow[n];
          if (o === nid || seen.has(n)) continue;
          if (o && !this.hostile(nid, o)) { open = true; break; }
          seen.add(n);
          stack.push(n);
          if (seen.size > lim) { open = true; break; }
        }
      }
      if (open) { opened.push(seen); continue; }
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
    this.checkCapitals();
    for (const f of this.hooks.postTick) f(this, dt);
  }

  checkCapitals() {
    for (const n of this.nations.values()) {
      if (!n.alive || !n.spawned || n.capital === undefined || this.owner[n.capital] === n.id) continue;
      const to = this.nearestOwned(n.id, n.capital);
      if (to === null) continue;
      this.emit("capital_moved", { nation: n.id, from: n.capital, to });
      n.capital = to;
    }
  }

  nearestOwned(nid, from) {
    const g = this.grid, ow = this.owner, fx = g.x(from), fy = g.y(from);
    for (let r = 1, near = Math.min(64, Math.max(g.w, g.h)); r <= near; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx += Math.abs(dy) === r ? 1 : 2 * r) {
          const x = fx + dx, y = fy + dy;
          if (x < 0 || y < 0 || x >= g.w || y >= g.h || ow[y * g.w + x] !== nid) continue;
          if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = y * g.w + x; }
        }
      if (best !== null) return best;
    }
    let best = null, bd = Infinity;
    const border = this.borderOf(nid);
    for (const i of border.size ? border : ow.keys()) {
      if (ow[i] !== nid) continue;
      const d = (g.x(i) - fx) ** 2 + (g.y(i) - fy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  takeDirty() {
    const out = [...this.dirty].map(i => [i, this.owner[i]]);
    this.dirty.clear();
    return out;
  }
}
