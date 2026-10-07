import rules from "../../data/rules.json" with { type: "json" };
import { wreck, canHit } from "./units.js";

export const RAILGUN_RULES = { cell: 8, every: 2, ...rules.railguns };

export function installRailguns(world, { rules: r = RAILGUN_RULES } = {}) {
  if (world.railguns) return world.railguns;
  world.railguns = { rules: r, fired: 0, guns: null, at: -Infinity };
  world.hooks.postTick.push((w, dt) => railgunTick(w, dt));
  return world.railguns;
}

function gunsOf(world) {
  const R = world.railguns;
  if (R.guns && world.time - R.at < R.rules.every) return R.guns;
  R.at = world.time;
  R.guns = [];
  for (const b of world.bld.list.values()) if (world.bld.table[b.type]?.railgun) R.guns.push(b);
  return R.guns;
}

function bucketsOf(items, posOf, cell, g) {
  const map = new Map();
  for (const it of items) {
    const p = posOf(it);
    if (p === null) continue;
    const k = Math.floor(g.x(p) / cell) * 65536 + Math.floor(g.y(p) / cell);
    let list = map.get(k);
    if (!list) map.set(k, (list = []));
    list.push(it);
  }
  return map;
}

function targetOf(world, b, x, y, reach, near) {
  const g = world.grid, cell = world.railguns.rules.cell, hostile = o => !!o && o !== b.owner && world.hostile(b.owner, o);
  let best = null, bd = Infinity;
  for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx++)
    for (let cy = Math.floor((y - reach) / cell); cy <= Math.floor((y + reach) / cell); cy++) {
      const k = cx * 65536 + cy;
      for (const s of near.stacks.get(k) ?? []) {
        if (!hostile(s.owner) || !world.stacks.has(s.id)) continue;
        const d = Math.hypot(g.x(s.pos) + 0.5 - x, g.y(s.pos) + 0.5 - y);
        if (d <= reach && d < bd) { bd = d; best = { s, at: s.pos }; }
      }
      for (const u of near.units.get(k) ?? []) {
        if (u.wreck || !hostile(u.owner) || !canHit(world, null, u)) continue;
        const d = Math.hypot(g.x(u.at) + 0.5 - x, g.y(u.at) + 0.5 - y);
        if (d <= reach && d < bd) { bd = d; best = { u, at: u.at }; }
      }
    }
  return best;
}

export function railgunTick(world, dt) {
  const bld = world.bld, g = world.grid, sc = world.machines?.scale ?? 1, R = world.railguns;
  if (!bld || !R) return;
  const due = [];
  for (const b of gunsOf(world)) {
    if (!bld.list.has(b.id) || b.state !== "active" || world.owner[b.anchor] !== b.owner) continue;
    b.railIn = (b.railIn ?? 0) - dt * (b.power ?? 1);
    if (b.railIn <= 0) due.push(b);
  }
  if (!due.length) return;
  const near = {
    stacks: bucketsOf(world.stacks.values(), s => s.pos, R.rules.cell, g),
    units: bucketsOf(world.units?.list.values() ?? [], u => (u.wreck || u.air ? null : u.at), R.rules.cell, g),
  };
  for (const b of due) {
    const d = bld.table[b.type], gun = d.railgun;
    const x = g.x(b.anchor) + d.fp[0] / 2, y = g.y(b.anchor) + d.fp[1] / 2, hit = targetOf(world, b, x, y, gun.range * sc, near);
    if (!hit) { b.railIn = Math.min(1, gun.every); continue; }
    b.railIn = gun.every;
    R.fired++;
    let lost = 0, owner;
    if (hit.s) {
      owner = hit.s.owner;
      lost = Math.min(hit.s.troops, gun.troops);
      world.loseTroops(hit.s, lost);
      if (hit.s.troops <= 0.5) { world.stacks.delete(hit.s.id); world.emit("stack_destroyed", { stack: hit.s.id, nation: owner, at: hit.at, by: b.owner }); }
    } else {
      owner = hit.u.owner;
      hit.u.hp -= gun.machine;
      hit.u.hitBy = b.owner;
      if (hit.u.hp <= 0) wreck(world, hit.u);
    }
    world.emit("railgun_fired", { by: b.owner, nation: owner, building: b.id, at: hit.at, from: [x, y], to: [g.x(hit.at) + 0.5, g.y(hit.at) + 0.5], troops: Math.round(lost), ...(hit.u ? { machine: hit.u.id, kind: hit.u.type } : {}) });
  }
}
