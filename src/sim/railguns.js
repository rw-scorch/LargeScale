import { wreck, canHit } from "./units.js";

export function installRailguns(world) {
  if (world.railguns) return world.railguns;
  world.railguns = { fired: 0 };
  world.hooks.postTick.push((w, dt) => railgunTick(w, dt));
  return world.railguns;
}

function targetOf(world, b, x, y, reach) {
  const g = world.grid, hostile = o => !!o && o !== b.owner && world.hostile(b.owner, o);
  let best = null, bd = Infinity;
  for (const s of world.stacks.values()) {
    if (!hostile(s.owner)) continue;
    const d = Math.hypot(g.x(s.pos) + 0.5 - x, g.y(s.pos) + 0.5 - y);
    if (d <= reach && d < bd) { bd = d; best = { s, at: s.pos }; }
  }
  for (const u of world.units?.list.values() ?? []) {
    if (u.wreck || u.air || !hostile(u.owner) || !canHit(world, null, u)) continue;
    const d = Math.hypot(g.x(u.at) + 0.5 - x, g.y(u.at) + 0.5 - y);
    if (d <= reach && d < bd) { bd = d; best = { u, at: u.at }; }
  }
  return best;
}

export function railgunTick(world, dt) {
  const bld = world.bld, g = world.grid, sc = world.machines?.scale ?? 1;
  if (!bld) return;
  for (const b of bld.list.values()) {
    const d = bld.table[b.type], gun = d?.railgun;
    if (!gun || b.state !== "active" || world.owner[b.anchor] !== b.owner) continue;
    b.railIn = (b.railIn ?? 0) - dt * (b.power ?? 1);
    if (b.railIn > 0) continue;
    const x = g.x(b.anchor) + d.fp[0] / 2, y = g.y(b.anchor) + d.fp[1] / 2, hit = targetOf(world, b, x, y, gun.range * sc);
    if (!hit) { b.railIn = Math.min(1, gun.every); continue; }
    b.railIn = gun.every;
    world.railguns.fired++;
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
