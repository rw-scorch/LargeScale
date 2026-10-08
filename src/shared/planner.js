import { TERRAIN } from "./terrain.js";
import { footprintAt, placeError, areaAround, eraIdx, wonderErrorOf, growError } from "./buildings.js";
import { roadRoute, roadPrice, roadLine, ROAD_TYPES } from "./roads.js";
import { polePlan } from "./power.js";

export const PLAN_KINDS = ["towns", "economy", "civic", "defence"];
export const PLAN_DEFAULTS = {
  every: 1, perTick: 6, maxPieces: 400, maxProjectPieces: 60, maxProjects: 40, keepMax: 32, keepSide: 128,
  block: 7, search: 30, freeRes: 6, freeCom: 4, freeInd: 4, indFrom: 6, towns: 6, townCell: 12,
  farms: 12, farmRing: [3, 16], perDeposit: 12, towers: 8, airNear: 20, powerNear: 40, civicEach: 2, scale: 1, tradeMin: 12, sams: 3, samNear: 5, abms: 2, abmNear: 6, tourism: 2, tourismNear: 10, shields: 2, shieldNear: 5,
};

const EFFECT_WORDS = { income: "income", research: "research", pop_growth: "town growth", troop_cap: "troop limit", defence: "defence" };
const CIVIC_ORDER = ["income", "research", "pop_growth", "troop_cap"];
const ZONE_WORDS = { res: "housing", com: "shops", ind: "works" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

function* ring(w, h, c, r0, r1) {
  const cx = c % w, cy = (c / w) | 0;
  for (let r = r0; r <= r1; r++) {
    if (r === 0) { yield c; continue; }
    for (let d = -r; d <= r; d++) {
      for (const y of [cy - r, cy + r]) { const x = cx + d; if (x >= 0 && y >= 0 && x < w && y < h) yield y * w + x; }
      if (d === -r || d === r) continue;
      for (const x of [cx - r, cx + r]) { const y = cy + d; if (x >= 0 && y >= 0 && x < w && y < h) yield y * w + x; }
    }
  }
}

export function rectPlots(w, h, [x, y, rw, rh]) {
  const out = [];
  for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) out.push(yy * w + xx);
  return out;
}

export function piecePlots(v, p) {
  if (p.t === "build") { const d = v.defs[p.type]; return (d && footprintAt(v.w, v.h, p.at, d.fp)) ?? [p.at]; }
  if (p.t === "zone") return rectPlots(v.w, v.h, [p.x, p.y, p.w, p.h]);
  if (p.t === "road" || p.t === "poles") return roadLine(v.w, p.via ?? [p.from, p.to]);
  if (p.t === "upgrade") return p.ids.flatMap(id => v.buildings.find?.(b => b.id === id)?.plots ?? []);
  return [];
}

function context(v, rules) {
  const R = { ...PLAN_DEFAULTS, ...rules }, me = v.me.id, w = v.w, h = v.h, size = w * h;
  const L = n => Math.max(1, Math.round(n * (R.scale ?? 1)));
  const taken = new Set(v.reserved ?? []);
  const keep = (v.keep ?? []).slice(0, R.keepMax);
  const kept = i => { const x = i % w, y = (i / w) | 0; return keep.some(([kx, ky, kw, kh]) => x >= kx && y >= ky && x < kx + kw && y < ky + kh); };
  const busy = i => taken.has(i) || kept(i);
  const mine = [], shore = [], contact = new Map();
  let roads = 0;
  for (let i = 0; i < size; i++) {
    if (v.owner[i] !== me) continue;
    mine.push(i);
    if (v.road[i]) roads++;
    const x = i % w, land = TERRAIN[v.terrain[i]].land;
    let wet = false;
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= size) continue;
      const o = v.owner[j];
      if (o && o !== me) { let c = contact.get(o); if (!c) contact.set(o, (c = [])); if (c.length < 4000) c.push(i); }
      const t = TERRAIN[v.terrain[j]];
      if (land && !t.land && t.name !== "lake") wet = true;
    }
    if (wet) shore.push(i);
  }
  const mineBuildings = v.buildings.filter(b => b.owner === me && b.state !== "rubble");
  const ctx = {
    v, R, L, me, w, h, taken, kept, busy, mine, shore, contact, roads, mineBuildings, projects: [],
    free: i => v.owner[i] === me && TERRAIN[v.terrain[i]].land && TERRAIN[v.terrain[i]].build && !v.zone[i] && !v.road[i] && !v.occupant(i) && !busy(i),
    take: plots => { for (const i of plots) taken.add(i); },
    placeOk(def, anchor, zoned = false) {
      const plots = footprintAt(w, h, anchor, def.fp);
      if (!plots || plots.some(i => busy(i) || (!zoned && v.zone[i]))) return null;
      return placeError(v, v.me, def, anchor) ? null : plots;
    },
    findSpot(def, centre, r0, r1) {
      const [fw, fh] = def.fp;
      for (const p of ring(w, h, centre, r0, r1)) {
        const ax = (p % w) - (fw >> 1), ay = ((p / w) | 0) - (fh >> 1);
        if (ax < 0 || ay < 0) continue;
        const anchor = ay * w + ax, plots = this.placeOk(def, anchor);
        if (plots) return { anchor, plots };
      }
      return null;
    },
    best(filter) {
      let out = null;
      for (const d of Object.values(v.defs)) {
        if (d.civilian || d.retired || !filter(d) || eraIdx(d.era) > eraIdx(v.me.era ?? "T") || v.lockOf(d.id)) continue;
        if (!out || eraIdx(d.era) > eraIdx(out.era) || (d.era === out.era && (d.cost?.money ?? 0) > (out.cost?.money ?? 0))) out = d;
      }
      return out;
    },
    roadKind() {
      for (const k of ["cobble", "dirt"]) {
        const t = v.roadRules?.types?.[k];
        if (t && !(t.needs && v.lockOf(t.needs))) return k;
      }
      return null;
    },
    roadCost(kind, plots) {
      const level = ROAD_TYPES.indexOf(kind), need = plots.filter(i => v.road[i] < level);
      return need.length ? roadPrice(kind, v.terrain, need, v.roadRules, R.scale).cost.money ?? 0 : 0;
    },
    route(kind, starts, isGoal, avoid = () => false) {
      const view = { w, terrain: v.terrain, road: v.road, owner: v.owner, blocked: i => !!v.occupant(i) || kept(i) || avoid(i) };
      return roadRoute(view, me, starts, isGoal, kind, { ...v.roadRules, routeNodes: Math.min(v.roadRules?.routeNodes ?? 40000, 20000) });
    },
    add(p) {
      if (v.skip?.has(p.key) || !p.pieces.length) return false;
      p.pieces = p.pieces.slice(0, R.maxProjectPieces);
      this.projects.push(p);
      return true;
    },
  };
  return ctx;
}

function townsOf(ctx) {
  const { v, w, me, R, L } = ctx, cell = L(R.townCell), cells = new Map();
  const keyOf = i => `${Math.floor((i % w) / cell)},${Math.floor(((i / w) | 0) / cell)}`;
  for (const b of ctx.mineBuildings) if (b.def.civilian) { const k = keyOf(b.anchor); (cells.get(k) ?? cells.set(k, []).get(k)).push(b); }
  const seen = new Set(), towns = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const keys = new Set([start]), todo = [start], list = [];
    seen.add(start);
    while (todo.length) {
      const k = todo.pop(), [cx, cy] = k.split(",").map(Number);
      list.push(...cells.get(k));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = `${cx + dx},${cy + dy}`;
        if (cells.has(n) && !seen.has(n)) { seen.add(n); keys.add(n); todo.push(n); }
      }
    }
    const mx = list.reduce((s, b) => s + (b.anchor % w), 0) / list.length, my = list.reduce((s, b) => s + ((b.anchor / w) | 0), 0) / list.length;
    const centre = list.reduce((best, b) => (Math.hypot((b.anchor % w) - mx, ((b.anchor / w) | 0) - my) < Math.hypot((best % w) - mx, ((best / w) | 0) - my) ? b.anchor : best), list[0].anchor);
    towns.push({ centre, size: list.length, keys });
  }
  const cap = v.me.capital;
  if (cap != null && v.owner[cap] === me) {
    const [kx, ky] = keyOf(cap).split(",").map(Number);
    const t = towns.find(t => [...t.keys].some(k => { const [x, y] = k.split(",").map(Number); return Math.abs(x - kx) <= 1 && Math.abs(y - ky) <= 1; }));
    if (t) { t.capital = true; t.centre = cap; } else towns.push({ centre: cap, size: 0, keys: new Set(), capital: true });
  }
  towns.sort((a, b) => b.size - a.size || (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
  for (const t of towns) t.name = t.capital ? "the capital" : `the town at ${t.centre % w}, ${(t.centre / w) | 0}`;
  return towns.slice(0, R.towns);
}

const STREETS = { 7: [[[0, 3], [6, 3]], [[3, 0], [3, 6]]], 5: [[[0, 2], [4, 2]]] };
const LOTS = { 7: [[0, 0, 3, 3], [4, 0, 3, 3], [0, 4, 3, 3], [4, 4, 3, 3]], 5: [[0, 0, 5, 2], [0, 3, 5, 2]] };
const onStreet = (B, dx, dy) => (B === 7 ? dx === 3 || dy === 3 : dy === 2);

function findBlock(ctx, town, zone) {
  const { v, w, h, me, R, L } = ctx;
  const ok = (i, street) => v.owner[i] === me && ((street && v.road[i]) || (TERRAIN[v.terrain[i]].land && TERRAIN[v.terrain[i]].build && !v.zone[i] && !v.road[i] && !v.occupant(i))) && !ctx.busy(i);
  for (const B of [7, 5].filter(b => b <= R.block)) {
    const half = B >> 1, from = zone === "ind" ? L(R.indFrom) + half : half + 1;
    for (const p of ring(w, h, town.centre, from, L(R.search))) {
      const x0 = (p % w) - half, y0 = ((p / w) | 0) - half;
      if (x0 < 0 || y0 < 0 || x0 + B > w || y0 + B > h) continue;
      let good = true;
      for (let dy = 0; dy < B && good; dy++) for (let dx = 0; dx < B && good; dx++) good = ok((y0 + dy) * w + x0 + dx, onStreet(B, dx, dy));
      if (good) return { x0, y0, B };
    }
  }
  return null;
}

function planTowns(ctx, towns) {
  const { v, w, h, me, R } = ctx, town = v.town ?? {}, kind = ctx.roadKind();
  const freeZoned = [0, 0, 0, 0, 0];
  for (const i of ctx.mine) if (v.zone[i] && !v.occupant(i) && TERRAIN[v.terrain[i]].build) freeZoned[v.zone[i]]++;
  const codes = { res: 1, com: 2, ind: 3 }, demand = town.demand ?? {};
  const want = {
    res: freeZoned[1] < R.freeRes,
    com: (demand.com ?? 0) > 0 && freeZoned[2] < R.freeCom,
    ind: (v.me.era ?? "T") !== "T" && (demand.ind ?? 0) > 0 && freeZoned[3] < R.freeInd,
  };
  for (const zone of ["res", "com", "ind"]) {
    if (!want[zone] || v.lockOf(zone, "zones")) continue;
    for (const t of towns) {
      const b = findBlock(ctx, t, zone);
      if (!b) continue;
      const pieces = [], draw = [], plots = [];
      let price = 0;
      const streets = [];
      if (kind) for (const [[ax, ay], [bx, by]] of STREETS[b.B]) {
        const a = (b.y0 + ay) * w + b.x0 + ax, e = (b.y0 + by) * w + b.x0 + bx, line = roadLine(w, [a, e]);
        streets.push(...line);
        if (line.every(i => v.road[i] >= ROAD_TYPES.indexOf(kind))) continue;
        pieces.push({ t: "road", kind, via: [a, e] });
        draw.push({ t: "road", plots: line });
      }
      price += ctx.roadCost(kind, [...new Set(streets)]);
      for (const [dx, dy, rw, rh] of LOTS[b.B]) {
        const rect = [b.x0 + dx, b.y0 + dy, rw, rh];
        pieces.push({ t: "zone", zone, x: rect[0], y: rect[1], w: rw, h: rh });
        const lot = rectPlots(w, h, rect);
        draw.push({ t: "zone", zone, plots: lot });
        plots.push(...lot);
      }
      ctx.take(plots);
      ctx.take(streets);
      if (kind && streets.length && ctx.roads > 0) {
        const own = new Set(streets), inBlock = i => { const x = i % w, y = (i / w) | 0; return x >= b.x0 && y >= b.y0 && x < b.x0 + b.B && y < b.y0 + b.B; };
        const path = ctx.route(kind, streets, i => v.road[i] > 0 && !inBlock(i), i => (!own.has(i) && ctx.taken.has(i)) || (!!v.zone[i] && !inBlock(i)));
        if (path && path.length > 1) {
          const line = path.filter(i => !inBlock(i));
          pieces.push({ t: "road", kind, from: path[0], to: path[path.length - 1] });
          draw.push({ t: "road", plots: line });
          price += ctx.roadCost(kind, line);
          ctx.take(line);
        }
      }
      const lots = plots.length, free = freeZoned[codes[zone]];
      ctx.add({
        key: `block:${zone}:${b.x0},${b.y0}`, kind: "towns", title: `A block of ${ZONE_WORDS[zone]} by ${t.name}`,
        reason: `${lots} ${zone} plots${kind ? " with streets" : ""}. ${free ? `Only ${plural(free, "free plot")} ${free === 1 ? "is" : "are"} left for ${ZONE_WORDS[zone]}.` : `No free plots are left for ${ZONE_WORDS[zone]}.`}`,
        price, pieces, draw, at: (b.y0 + (b.B >> 1)) * w + b.x0 + (b.B >> 1),
      });
      break;
    }
  }
  if (!kind || ctx.roads === 0 || towns.length < 2) return;
  const capTown = towns.find(t => t.capital);
  if (!capTown) return;
  const near = (c, r) => { for (const i of ring(w, h, c, 0, r)) if (v.owner[i] === me && v.road[i]) return i; return null; };
  const reach = start => {
    const seen = new Set([start]), todo = [start];
    while (todo.length && seen.size < 20000) {
      const i = todo.pop(), x = i % w;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < w * h && v.road[j] && v.owner[j] === me && !seen.has(j)) { seen.add(j); todo.push(j); }
    }
    return seen;
  };
  const capRoad = near(capTown.centre, 4);
  if (capRoad === null) return;
  const capNet = reach(capRoad);
  for (const t of towns) {
    if (t === capTown) continue;
    const start = near(t.centre, 6);
    if (start === null || capNet.has(start)) continue;
    const path = ctx.route(kind, [start], i => capNet.has(i), i => ctx.taken.has(i) || !!v.zone[i]);
    if (!path) continue;
    ctx.take(path);
    ctx.add({ key: `link:${t.centre}`, kind: "towns", title: `A road from ${t.name} to the capital`, reason: `${plural(path.length, "plot")} of ${kind} road joins its streets to the capital's.`, price: ctx.roadCost(kind, path), pieces: [{ t: "road", kind, from: path[0], to: path[path.length - 1] }], draw: [{ t: "road", plots: path }], at: start });
  }
}

function planDeposits(ctx) {
  const { v, R } = ctx, covered = new Set(), byKind = new Map();
  for (const b of ctx.mineBuildings) {
    const p = b.def.producer;
    if (p?.kind === "deposit") for (const i of areaAround(v, b.plots, p.radius ?? 0)) covered.add(i);
  }
  for (const i of v.depositPlots ?? []) {
    if (v.owner[i] !== ctx.me || covered.has(i) || ctx.busy(i)) continue;
    const k = v.deposit(i);
    if (k) (byKind.get(k) ?? byKind.set(k, []).get(k)).push(i);
  }
  const worth = v.worth ?? {};
  for (const [kind, list] of [...byKind].sort((a, b) => (worth[b[0]] ?? 1) - (worth[a[0]] ?? 1))) {
    const def = ctx.best(d => d.producer?.kind === "deposit" && d.producer.deposits.includes(kind) && !d.rule);
    if (!def) continue;
    const r = def.producer.radius ?? 0, [fw, fh] = def.fp, pieces = [], draw = [], offsets = [];
    for (let dy = -r - fh + 1; dy <= r; dy++) for (let dx = -r - fw + 1; dx <= r; dx++) offsets.push([dx, dy, Math.hypot(dx + (fw - 1) / 2, dy + (fh - 1) / 2)]);
    offsets.sort((p, q) => p[2] - q[2]);
    for (const i of list) {
      if (pieces.length >= R.perDeposit) break;
      if (covered.has(i)) continue;
      const x = i % ctx.w, y = (i / ctx.w) | 0;
      let spot = null;
      for (const [dx, dy] of offsets) {
        const ax = x + dx, ay = y + dy;
        if (ax < 0 || ay < 0 || ax + fw > ctx.w) continue;
        const plots = ctx.placeOk(def, ay * ctx.w + ax);
        if (plots) { spot = { anchor: ay * ctx.w + ax, plots }; break; }
      }
      if (!spot) continue;
      ctx.take(spot.plots);
      for (const j of areaAround(v, spot.plots, r)) covered.add(j);
      pieces.push({ t: "build", type: def.id, at: spot.anchor });
      draw.push({ t: "build", type: def.id, plots: spot.plots });
    }
    const name = v.depositName?.(kind) ?? kind;
    ctx.add({ key: `mines:${kind}`, kind: "economy", title: `${plural(pieces.length, lower(def.name))} on your ${lower(name)}`, reason: `${plural(list.length, "plot")} of ${lower(name)} that nothing works yet. Each earns gold as it digs.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0]?.at });
  }
}

function planFarms(ctx, towns) {
  const { v, R, L } = ctx, t = v.town ?? {}, idle = (t.workers ?? 0) - (t.jobs ?? 0);
  const def = ctx.best(d => d.producer?.kind === "farm");
  if (!def || !towns.length || idle < (def.jobs ?? 1)) return;
  const count = Math.min(R.farms, Math.floor(idle / (def.jobs ?? 1))), pieces = [], draw = [];
  for (const p of ring(ctx.w, ctx.h, towns[0].centre, L(R.farmRing[0]), L(R.farmRing[1]))) {
    if (pieces.length >= count) break;
    if (!ctx.free(p)) continue;
    const plots = ctx.placeOk(def, p);
    if (!plots) continue;
    ctx.take(plots);
    pieces.push({ t: "build", type: def.id, at: p });
    draw.push({ t: "build", type: def.id, plots });
  }
  ctx.add({ key: `farms:${towns[0].centre}`, kind: "economy", title: `${plural(pieces.length, lower(def.name))} by ${towns[0].name}`, reason: `${plural(Math.floor(idle), "worker")} ${Math.floor(idle) === 1 ? "has" : "have"} no job. Fields give them work and earn gold.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0]?.at });
}

function planPower(ctx) {
  const { v, R, L, w } = ctx, P = v.power;
  if (!P) return;
  const plant = ctx.best(d => !!d.power), pole = v.defs.power_pole && !v.lockOf("power_pole") ? v.defs.power_pole : null;
  const off = ctx.mineBuildings.filter(b => b.def.uses && b.state === "active" && P.users?.[b.id] === -1);
  const nodes = ctx.mineBuildings.filter(b => (b.def.power || b.def.pole) && b.state === "active");
  const dist = (a, b) => Math.hypot((a % w) - (b % w), ((a / w) | 0) - ((b / w) | 0));
  const left = [...off];
  let k = 0;
  while (left.length && k++ < 3) {
    const head = left.shift(), group = [head, ...left.filter(b => dist(b.anchor, head.anchor) <= L(8))];
    for (const b of group.slice(1)) left.splice(left.indexOf(b), 1);
    const node = nodes.filter(n => dist(n.anchor, head.anchor) <= L(R.powerNear)).sort((a, b) => dist(a.anchor, head.anchor) - dist(b.anchor, head.anchor))[0];
    const title = `Power for ${plural(group.length, "building")}`, reason = `${group.map(b => b.def.name).slice(0, 3).join(", ")}${group.length > 3 ? " and more" : ""} ${group.length === 1 ? "runs" : "run"} at half rate off the grid.`;
    if (node && pole) {
      const view = { ...v, blocked: i => !!v.occupant(i) || ctx.busy(i) };
      const plan = polePlan(view, ctx.me, [node.anchor, head.anchor], { ...v.powerRules, reach: pole.pole.reach * (R.scale ?? 1) });
      if (plan.error || plan.gaps) continue;
      ctx.take(plan.poles);
      ctx.add({ key: `power:${head.id}`, kind: "economy", title, reason: `${reason} A line of ${plural(plan.poles.length, "pole")} joins ${lower(node.def.name)}'s grid.`, price: plan.poles.length * (pole.cost?.money ?? 0), pieces: [{ t: "poles", via: [node.anchor, head.anchor] }], draw: [{ t: "pole", plots: plan.poles }], at: head.anchor });
    } else if (plant) {
      const spot = ctx.findSpot(plant, head.anchor, 1, Math.max(2, Math.floor(plant.power.reach * (R.scale ?? 1)) - 2));
      if (!spot) continue;
      ctx.take(spot.plots);
      ctx.add({ key: `power:${head.id}`, kind: "economy", title, reason: `${reason} A ${lower(plant.name)} beside them powers them.`, price: plant.cost?.money ?? 0, pieces: [{ t: "build", type: plant.id, at: spot.anchor }], draw: [{ t: "build", type: plant.id, plots: spot.plots }], at: spot.anchor });
    }
  }
  if (!plant) return;
  for (const [g, row] of (P.grids ?? []).entries()) {
    if (!(row[2] < 100) || !row[1]) continue;
    const user = ctx.mineBuildings.find(b => P.users?.[b.id] === g);
    if (!user) continue;
    const spot = ctx.findSpot(plant, user.anchor, 1, Math.max(2, Math.floor(plant.power.reach * (R.scale ?? 1)) - 2));
    if (!spot) continue;
    ctx.take(spot.plots);
    ctx.add({ key: `plant:${g}:${user.id}`, kind: "economy", title: `Another ${lower(plant.name)}`, reason: `A grid makes ${row[0]} power of the ${row[1]} its buildings need, so they run at ${row[2]}%.`, price: plant.cost?.money ?? 0, pieces: [{ t: "build", type: plant.id, at: spot.anchor }], draw: [{ t: "build", type: plant.id, plots: spot.plots }], at: spot.anchor });
  }
}

function planPorts(ctx) {
  const { v, R, L, w } = ctx;
  const def = ctx.best(d => d.port && d.rule === "coast" && !d.builds);
  if (!def || !ctx.shore.length) return;
  const ports = ctx.mineBuildings.filter(b => b.def.port);
  if (ports.length > 1) return;
  const dist = (a, b) => Math.hypot((a % w) - (b % w), ((a / w) | 0) - ((b / w) | 0));
  const from = ports.length ? ports[0].anchor : v.me.capital ?? ctx.shore[0];
  const list = ports.length ? ctx.shore.filter(i => dist(i, from) >= L(R.tradeMin)).sort((a, b) => dist(b, from) - dist(a, from)) : [...ctx.shore].sort((a, b) => dist(a, from) - dist(b, from));
  for (const i of list.slice(0, 300)) {
    const plots = ctx.placeOk(def, i);
    if (!plots) continue;
    ctx.take(plots);
    ctx.add({
      key: ports.length ? "port:second" : "port:first", kind: "economy", title: ports.length ? `A second ${lower(def.name)}` : `A ${lower(def.name)} on your coast`,
      reason: ports.length ? `Trade ships also sail between two of your own ports ${L(R.tradeMin)} or more plots apart, and both ends earn.` : "It sends free trade ships to other ports. Both ends earn gold when one arrives.",
      price: def.cost?.money ?? 0, pieces: [{ t: "build", type: def.id, at: i }], draw: [{ t: "build", type: def.id, plots }], at: i,
    });
    return;
  }
}

function planRail(ctx, towns) {
  const { v, w, h } = ctx, def = v.defs.station_large, rail = v.roadRules?.types?.rail;
  if (!def || !rail || v.lockOf(def.id) || (rail.needs && v.lockOf(rail.needs)) || towns.length < 2) return;
  const stations = ctx.mineBuildings.filter(b => b.def.station);
  if (stations.length >= 2) return;
  const ends = [], pieces = [], draw = [];
  let price = 0;
  for (const t of towns.slice(0, 2)) {
    const have = stations.find(s => Math.hypot((s.anchor % w) - (t.centre % w), ((s.anchor / w) | 0) - ((t.centre / w) | 0)) < 12);
    if (have) { ends.push(have.plots); continue; }
    const spot = ctx.findSpot(def, t.centre, 3, ctx.L(14));
    if (!spot) return;
    ctx.take(spot.plots);
    ends.push(spot.plots);
    pieces.push({ t: "build", type: def.id, at: spot.anchor });
    draw.push({ t: "build", type: def.id, plots: spot.plots });
    price += def.cost?.money ?? 0;
  }
  const beside = plots => {
    const set = new Set(plots), out = [];
    for (const i of plots) for (const j of [i - w, i + w, i % w > 0 ? i - 1 : -1, i % w < w - 1 ? i + 1 : -1]) if (j >= 0 && j < w * h && !set.has(j) && ctx.free(j)) out.push(j);
    return out;
  };
  const a = beside(ends[0]), b = new Set(beside(ends[1]));
  if (!a.length || !b.size) return;
  const path = ctx.route("rail", a, i => b.has(i), i => ctx.taken.has(i) || !!v.zone[i]);
  if (!path) return;
  ctx.take(path);
  pieces.push({ t: "road", kind: "rail", from: path[0], to: path[path.length - 1] });
  draw.push({ t: "road", plots: path });
  price += ctx.roadCost("rail", path);
  ctx.add({ key: "rail:first", kind: "economy", title: `Railway between ${towns[0].name} and ${towns[1].name}`, reason: `${plural(path.length, "plot")} of rail between two stations. Trains between them earn gold on every trip.`, price, pieces, draw, at: path[0] });
}

function effectText(d) {
  if (d.research !== undefined) return `+${d.research} research a second`;
  return Object.entries(d.effects ?? {}).map(([k, x]) => `+${Math.round(x * 100)}% ${EFFECT_WORDS[k] ?? k}`).join(", ");
}

function planCivic(ctx, towns) {
  const { v, R, L } = ctx;
  if (!towns.length) return;
  const count = new Map();
  for (const b of ctx.mineBuildings) count.set(b.type, (count.get(b.type) ?? 0) + 1);
  const rank = d => { const k = d.research !== undefined ? "research" : Object.keys(d.effects ?? {})[0]; const i = CIVIC_ORDER.indexOf(k); return i < 0 ? 9 : i; };
  const defs = Object.values(v.defs).filter(d => !d.civilian && !d.retired && d.cap && (d.effects || d.research !== undefined) && !d.fort && !d.producer && eraIdx(d.era) <= eraIdx(v.me.era ?? "T") && !v.lockOf(d.id)).sort((a, b) => rank(a) - rank(b) || (a.cost?.money ?? 0) - (b.cost?.money ?? 0));
  for (const d of defs) {
    const have = count.get(d.id) ?? 0, want = Math.min(d.cap - have, R.civicEach);
    if (want <= 0) continue;
    const pieces = [], draw = [];
    for (const t of towns) {
      while (pieces.length < want) {
        const spot = ctx.findSpot(d, t.centre, 2, L(R.search));
        if (!spot) break;
        ctx.take(spot.plots);
        pieces.push({ t: "build", type: d.id, at: spot.anchor });
        draw.push({ t: "build", type: d.id, plots: spot.plots });
      }
      if (pieces.length >= want) break;
    }
    ctx.add({ key: `civic:${d.id}`, kind: "civic", title: pieces.length === 1 ? `A ${lower(d.name)}` : `${plural(pieces.length, lower(d.name))}`, reason: `Each gives ${effectText(d)}. You have ${have} of the ${d.cap} that count.`, price: pieces.length * (d.cost?.money ?? 0), pieces, draw, at: pieces[0]?.at });
  }
}

function planUpgrades(ctx) {
  const { v } = ctx, premium = v.premium ?? 1.5, ids = [], draw = [];
  let price = 0;
  for (const b of ctx.mineBuildings) {
    const d = b.def, nd = d.next && v.defs[d.next];
    if (d.civilian || b.state !== "active" || !nd || eraIdx(nd.era) > eraIdx(v.me.era ?? "T") || v.lockOf(nd.id) || growError(v, v.me, { id: b.id, anchor: b.anchor, civilian: false }, nd)) continue;
    if (ids.length >= 60) break;
    ids.push(b.id);
    draw.push({ t: "upgrade", plots: b.plots });
    price += (nd.cost?.money ?? 0) * premium;
  }
  if (!ids.length) return;
  ctx.add({ key: "upgrade", kind: "civic", title: `Upgrade ${plural(ids.length, "building")}`, reason: `Each goes up a level at once, for its next level's price and half again.`, price: Math.round(price), pieces: [{ t: "upgrade", ids }], draw, at: v.buildings.find(b => b.id === ids[0])?.anchor });
}

function planDefence(ctx) {
  const { v, R, L, w } = ctx;
  let top = null, threat = 0;
  for (const [o, border] of ctx.contact) {
    const n = v.nations?.find(n => n.id === o);
    if (!n?.alive) continue;
    const t = (n.troops ?? 0) * Math.sqrt(border.length);
    if (t > threat) { threat = t; top = { n, border }; }
  }
  if (!top) return;
  const def = ctx.best(d => !!d.fort && d.fp[0] === 1 && d.fp[1] === 1);
  const forts = ctx.mineBuildings.filter(b => b.def.fort).map(b => ({ x: (b.anchor % w) + b.def.fp[0] / 2, y: ((b.anchor / w) | 0) + b.def.fp[1] / 2, r: b.def.fort.radius }));
  const covered = i => { const x = (i % w) + 0.5, y = ((i / w) | 0) + 0.5; return forts.some(f => (f.x - x) ** 2 + (f.y - y) ** 2 <= f.r * f.r); };
  if (def) {
    let open = top.border.filter(i => !covered(i));
    const pieces = [], draw = [], r = def.fort.radius;
    while (open.length && pieces.length < R.towers) {
      const u = open[0];
      const spot = ctx.findSpot(def, u, 1, Math.max(1, r - 1));
      if (!spot) { open = open.slice(1); continue; }
      ctx.take(spot.plots);
      pieces.push({ t: "build", type: def.id, at: spot.anchor });
      draw.push({ t: "build", type: def.id, plots: spot.plots });
      forts.push({ x: (spot.anchor % w) + 0.5, y: ((spot.anchor / w) | 0) + 0.5, r });
      open = open.filter(i => !covered(i));
    }
    const name = top.n.name ?? "Your neighbour";
    ctx.add({ key: `towers:${top.n.id}`, kind: "defence", title: `${plural(pieces.length, lower(def.name))} facing ${name}`, reason: `${name} has ${Math.round(top.n.troops ?? 0).toLocaleString("en-GB")} troops along ${plural(top.border.length, "plot")} of your border. Land within ${r} plots of a ${lower(def.name)} holds ${Math.round((def.fort.defence - 1) * 100)}% better.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0]?.at });
  }
  const air = v.defs.airfield;
  if (air && !v.lockOf(air.id) && eraIdx(air.era) <= eraIdx(v.me.era ?? "T")) {
    const mid = top.border[top.border.length >> 1];
    const near = ctx.mineBuildings.some(b => b.def.airbase && !b.def.airbase.only && Math.hypot((b.anchor % w) - (mid % w), ((b.anchor / w) | 0) - ((mid / w) | 0)) <= L(R.airNear));
    if (!near) {
      const spot = ctx.findSpot(air, mid, L(4), L(R.airNear) - 2);
      if (spot) {
        ctx.take(spot.plots);
        ctx.add({ key: `airfield:${top.n.id}`, kind: "defence", title: `An airfield near the ${top.n.name ?? "enemy"} border`, reason: "Planes reach only so far from an airfield. This one puts the border in range.", price: air.cost?.money ?? 0, pieces: [{ t: "build", type: air.id, at: spot.anchor }], draw: [{ t: "build", type: air.id, plots: spot.plots }], at: spot.anchor });
      }
    }
  }
}

function planAirDefence(ctx, towns) {
  const { v, R, L, w } = ctx, def = v.defs.sam_site;
  if (!def?.sam || v.lockOf(def.id) || eraIdx(def.era) > eraIdx(v.me.era ?? "T")) return;
  const reach = def.sam.radius * (R.scale ?? 1), centre = (b, d = b.def) => [(b.anchor % w) + d.fp[0] / 2, ((b.anchor / w) | 0) + d.fp[1] / 2];
  const cover = ctx.mineBuildings.filter(b => b.def.sam).map(b => [...centre(b), b.def.sam.radius * (R.scale ?? 1)]);
  const covered = i => cover.some(([x, y, r]) => Math.hypot(x - (i % w) - 0.5, y - ((i / w) | 0) - 0.5) <= r - 1);
  const targets = [...towns.slice(0, 2).map(t => ({ at: t.centre, name: t.name })), ...ctx.mineBuildings.filter(b => b.def.airbase && b.state === "active").map(b => ({ at: b.anchor, name: `your ${lower(b.def.name)}` }))];
  const pieces = [], draw = [], names = [];
  for (const t of targets) {
    if (pieces.length >= R.sams) break;
    if (covered(t.at)) continue;
    const spot = ctx.findSpot(def, t.at, 1, L(R.samNear));
    if (!spot) continue;
    ctx.take(spot.plots);
    pieces.push({ t: "build", type: def.id, at: spot.anchor });
    draw.push({ t: "build", type: def.id, plots: spot.plots });
    names.push(t.name);
    cover.push([...centre({ anchor: spot.anchor }, def), reach]);
  }
  if (!pieces.length) return;
  const named = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  ctx.add({ key: "sams", kind: "defence", title: `${plural(pieces.length, "SAM site")} over ${named}`, reason: `Enemy planes within ${reach} plots of a SAM site are shot at. Each holds ${def.sam.missiles} missiles and reloads them for ${def.sam.reloadCost} gold each.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0].at });
}

function planMissileDefence(ctx, towns) {
  const { v, R, L, w } = ctx, def = v.defs.abm_silo;
  if (!def?.abm || v.lockOf(def.id) || eraIdx(def.era) > eraIdx(v.me.era ?? "T")) return;
  const reach = def.abm.radius * (R.scale ?? 1), centre = (b, d = b.def) => [(b.anchor % w) + d.fp[0] / 2, ((b.anchor / w) | 0) + d.fp[1] / 2];
  const cover = ctx.mineBuildings.filter(b => b.def.abm).map(b => [...centre(b), reach]);
  const covered = i => cover.some(([x, y, r]) => Math.hypot(x - (i % w) - 0.5, y - ((i / w) | 0) - 0.5) <= r - 1);
  const pieces = [], draw = [], names = [];
  for (const t of towns.slice(0, R.abms)) {
    if (covered(t.centre)) continue;
    const spot = ctx.findSpot(def, t.centre, 1, L(R.abmNear));
    if (!spot) continue;
    ctx.take(spot.plots);
    pieces.push({ t: "build", type: def.id, at: spot.anchor });
    draw.push({ t: "build", type: def.id, plots: spot.plots });
    names.push(t.name);
    cover.push([...centre({ anchor: spot.anchor }, def), reach]);
  }
  if (!pieces.length) return;
  const named = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  ctx.add({ key: "abms", kind: "defence", title: `${plural(pieces.length, "ABM silo")} over ${named}`, reason: `A nuclear warhead falling within ${reach} plots of an ABM silo has a ${Math.round(def.abm.chance * 100)}% chance of being shot down. Each holds ${def.abm.interceptors} interceptors and makes more for ${def.abm.reloadCost} gold each.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0].at });
}

function planShields(ctx, towns) {
  const { v, R, L, w } = ctx, def = v.defs.shield_generator;
  if (!def?.shield || v.lockOf(def.id) || eraIdx(def.era) > eraIdx(v.me.era ?? "T")) return;
  const centre = (b, d = b.def) => [(b.anchor % w) + d.fp[0] / 2, ((b.anchor / w) | 0) + d.fp[1] / 2];
  const cover = ctx.mineBuildings.filter(b => b.def.shield).map(b => [...centre(b), b.def.shield.radius * (R.scale ?? 1)]);
  const covered = i => cover.some(([x, y, r]) => Math.hypot(x - (i % w) - 0.5, y - ((i / w) | 0) - 0.5) <= r - 1);
  const reach = def.shield.radius * (R.scale ?? 1), pieces = [], draw = [], names = [];
  for (const t of towns.slice(0, R.shields)) {
    if (covered(t.centre)) continue;
    const spot = ctx.findSpot(def, t.centre, 1, L(R.shieldNear));
    if (!spot) continue;
    ctx.take(spot.plots);
    pieces.push({ t: "build", type: def.id, at: spot.anchor });
    draw.push({ t: "build", type: def.id, plots: spot.plots });
    names.push(t.name);
    cover.push([...centre({ anchor: spot.anchor }, def), reach]);
  }
  if (!pieces.length) return;
  const named = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  ctx.add({ key: "shields", kind: "defence", title: `${plural(pieces.length, "shield generator")} over ${named}`, reason: `A missile or warhead falling within ${reach} plots of a shield generator is stopped ${Math.round(def.shield.chance * 100)}% of the time, and bombs there do half harm. Nothing else stops an orbital strike. It needs power.`, price: pieces.length * (def.cost?.money ?? 0), pieces, draw, at: pieces[0].at });
}

function planTourism(ctx, towns) {
  const { v, R, L } = ctx;
  if (!towns.length) return;
  const have = new Set(ctx.mineBuildings.filter(b => b.def.tourism).map(b => b.type));
  const open = d => d.tourism && !d.retired && !have.has(d.id) && !v.lockOf(d.id) && eraIdx(d.era) <= eraIdx(v.me.era ?? "T");
  const byValue = (a, b) => b.tourism.value - a.tourism.value;
  let added = 0;
  for (const def of Object.values(v.defs).filter(d => open(d) && !d.wonder).sort(byValue)) {
    if (added >= R.tourism) break;
    for (const t of towns) {
      const spot = ctx.findSpot(def, t.centre, 2, L(R.tourismNear));
      if (!spot) continue;
      ctx.take(spot.plots);
      ctx.add({ key: `tourism:${def.id}`, kind: "civic", title: `A ${lower(def.name)} near ${t.name}`, reason: `Visitors pay ${def.tourism.value} gold a second${def.tourism.season ? ", more or less with the season" : ""}. A kind you do not have yet also raises what the others earn.`, price: def.cost?.money ?? 0, pieces: [{ t: "build", type: def.id, at: spot.anchor }], draw: [{ t: "build", type: def.id, plots: spot.plots }], at: spot.anchor });
      added++;
      break;
    }
  }
  for (const def of Object.values(v.defs).filter(d => open(d) && d.wonder && !wonderErrorOf(v.buildings ?? [], d.id, v.me.id)).sort(byValue)) {
    const spot = ctx.findSpot(def, towns[0].centre, 3, L(R.tourismNear));
    if (!spot) continue;
    ctx.take(spot.plots);
    ctx.add({ key: `wonder:${def.id}`, kind: "civic", title: `The ${lower(def.name)}, a wonder`, reason: `One per world, owned by whoever finishes it first; a rival's site is cleared and refunded. ${def.tourism.value} gold a second from visitors, 10% more for all your tourism, and ${Math.round(def.time / 60)} minutes to build.`, price: def.cost?.money ?? 0, pieces: [{ t: "build", type: def.id, at: spot.anchor }], draw: [{ t: "build", type: def.id, plots: spot.plots }], at: spot.anchor });
    break;
  }
}

export function proposePlan(v, rules = {}) {
  if (v.me?.capital == null || v.owner[v.me.capital] !== v.me.id) return [];
  const ctx = context(v, rules), towns = townsOf(ctx);
  planTowns(ctx, towns);
  planDeposits(ctx);
  planFarms(ctx, towns);
  planPower(ctx);
  planPorts(ctx);
  planRail(ctx, towns);
  planCivic(ctx, towns);
  planTourism(ctx, towns);
  planUpgrades(ctx);
  planDefence(ctx);
  planAirDefence(ctx, towns);
  planMissileDefence(ctx, towns);
  planShields(ctx, towns);
  return ctx.projects.slice(0, ctx.R.maxProjects);
}
