import { stackPower, COMBAT } from "./combat.js";
import rules from "../../data/rules.json" with { type: "json" };

export const GUARD = { every: 2, ratio: 1.5, reach: 6, keepHome: 0.25, lead: 4, retarget: 3, cell: 16, ...rules.guard };

export function installGuard(world, opts = {}) {
  const k = opts.scale ?? 1;
  const r = { ...GUARD, ...opts, reach: GUARD.reach * k, lead: GUARD.lead * k, retarget: GUARD.retarget * k };
  let clock = 0;
  const tick = (w, dt) => {
    clock += dt;
    if (clock < r.every) return;
    clock = 0;
    guardTick(w, r);
  };
  tick.live = true;
  world.hooks.postTick.push(tick);
  world.guard = { rules: r };
  return world.guard;
}

export function guardTick(world, r = world.guard?.rules ?? GUARD) {
  for (const n of world.nations.values()) if (n.human && n.alive && n.spawned) guardNation(world, n, r);
}

function borderCells(world, nid, cell) {
  const w = world.grid.w, cols = Math.ceil(w / cell), out = new Set();
  for (const i of world.borderOf(nid)) out.add(Math.floor(Math.floor(i / w) / cell) * cols + Math.floor((i % w) / cell));
  return { out, cols };
}

function landNear(world, nid, at, radius, cells, cell) {
  const g = world.grid, x0 = g.x(at), y0 = g.y(at);
  const cx = Math.floor(x0 / cell), cy = Math.floor(y0 / cell), span = Math.ceil(radius / cell);
  let hit = false;
  for (let dy = -span; dy <= span && !hit; dy++) for (let dx = -span; dx <= span && !hit; dx++) hit = cells.out.has((cy + dy) * cells.cols + cx + dx);
  if (!hit) return null;
  let best = null, bd = Infinity;
  for (let y = Math.max(0, y0 - radius); y <= Math.min(g.h - 1, y0 + radius); y++)
    for (let x = Math.max(0, x0 - radius); x <= Math.min(g.w - 1, x0 + radius); x++) {
      const d = (x - x0) ** 2 + (y - y0) ** 2;
      if (d < bd && d <= radius * radius && world.owner[y * g.w + x] === nid) { bd = d; best = y * g.w + x; }
    }
  return best;
}

export function findThreats(world, nid, r = GUARD) {
  const cells = borderCells(world, nid, r.cell), out = [], R = (world.rules.advanceRadius ?? 5) + r.reach;
  for (const s of world.stacks.values()) {
    if (s.owner === nid || !world.hostile(nid, s.owner)) continue;
    const goal = s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : null);
    let at = null;
    if (world.owner[s.pos] === nid) at = s.path.length ? s.path[Math.min(s.path.length - 1, Math.round(r.lead))] : s.pos;
    else if (goal !== null && world.owner[goal] === nid) at = s.path.find(i => world.owner[i] === nid) ?? goal;
    else if (s.order === "advance" && (s.only == null || s.only === nid) && landNear(world, nid, s.pos, R, cells, r.cell) !== null) at = s.pos;
    if (at !== null) out.push({ s, at, power: stackPower(world, s) });
  }
  return out.sort((a, b) => b.power - a.power);
}

const goalOf = s => s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : s.pos);

function send(world, g, t, fresh) {
  if (g.pos !== t.at && !world.orderMove(g.id, t.at, "move")) return false;
  g.guard = { ...(g.guard ?? {}), threat: t.s.id, home: g.guard?.home ?? (g.guard?.formed ? null : g.pos), formed: !!g.guard?.formed };
  if (fresh) world.emit("guard_sent", { nation: g.owner, stack: g.id, threat: t.s.id, enemy: t.s.owner, troops: Math.floor(g.troops), at: t.at });
  return true;
}

function foldHome(world, g) {
  const n = world.nations.get(g.owner), room = Math.floor(world.maxTroops(n) - n.troops);
  if (room >= g.troops) { world.disbandStack(g.id); return; }
  const part = room > 0 ? world.splitStack(g.id, room) : null;
  if (part) world.disbandStack(part.id);
  delete g.guard;
}

function release(world, g) {
  const home = g.guard?.home;
  if (g.guard?.formed) {
    if (world.owner[g.pos] === g.owner && !g.path.length) { foldHome(world, g); return; }
    const back = world.nearestOwned(g.owner, g.pos);
    if (back !== null && !g.path.length) world.orderMove(g.id, back, "move");
    g.guard = { formed: true };
    return;
  }
  delete g.guard;
  if (home != null && home !== g.pos && world.owner[home] === g.owner) world.orderMove(g.id, home, "move");
}

export function guardNation(world, n, r = GUARD) {
  const guards = [...world.stacks.values()].filter(s => s.owner === n.id && s.standing === "guard");
  if (!guards.length && !n.guard) return;
  const threats = findThreats(world, n.id, r), live = new Set(threats.map(t => t.s.id));
  for (const g of guards) {
    if (g.engaged || !g.guard) continue;
    if (g.guard.threat === undefined ? g.guard.formed && !g.path.length : !live.has(g.guard.threat)) release(world, g);
  }
  for (const t of threats) {
    const mine = guards.filter(g => world.stacks.has(g.id) && g.guard?.threat === t.s.id);
    for (const g of mine) if (!g.engaged && world.grid.dist(goalOf(g), t.at) > r.retarget) send(world, g, t, false);
    let have = mine.reduce((sum, g) => sum + stackPower(world, g), 0);
    const need = t.power * r.ratio;
    if (have >= need) continue;
    const idle = guards.filter(g => world.stacks.has(g.id) && !g.guard?.threat && !g.engaged && g.order === "hold" && !g.path.length && !g.route)
      .sort((a, b) => world.grid.dist(a.pos, t.at) - world.grid.dist(b.pos, t.at));
    for (const g of idle) {
      if (have >= need) break;
      if (send(world, g, t, true)) have += stackPower(world, g);
    }
    if (have >= need || !n.guard) continue;
    const from = world.owner[t.at] === n.id ? t.at : world.nearestOwned(n.id, t.at);
    if (from === null) continue;
    const spare = n.troops - r.keepHome * world.maxTroops(n), per = COMBAT.ownLandBonus ?? 1;
    const amount = Math.min(spare, Math.ceil((need - have) / per));
    const s = world.createStack(n.id, from, amount);
    if (!s) continue;
    s.standing = "guard";
    s.guard = { formed: true };
    guards.push(s);
    send(world, s, t, true);
  }
}
