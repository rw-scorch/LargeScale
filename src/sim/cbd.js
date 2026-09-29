import rules from "../../data/rules.json" with { type: "json" };
import { CORE_RULES, coreCentre } from "../shared/tourism.js";

export const CBD = { ...CORE_RULES, weightByValue: true, every: 5, ...rules.cbd };

export function installCbd(world, { rules: r = CBD, scale = 1, hooks = true } = {}) {
  if (world.cbd) return world.cbd;
  world.cbd = { rules: { ...CBD, ...r }, scale, centres: [], field: null, sig: "", clock: Infinity };
  if (hooks) {
    installCombatHooks(world);
    const tick = (w, dt) => { const C = w.cbd; C.clock += dt; if (C.clock < C.rules.every) return; C.clock = 0; refreshCores(w); };
    tick.whole = w => refreshCores(w);
    world.hooks.postTick.push(tick);
    refreshCores(world);
  }
  return world.cbd;
}

export function refreshCores(world) {
  const bld = world.bld, list = [];
  for (const b of bld?.list.values() ?? []) {
    const d = bld.table[b.type];
    if (!d.core || b.state !== "active") continue;
    const c = coreCentre(world.grid.w, b, d);
    list.push({ at: world.grid.idx(c.x, c.y), owner: b.owner, value: c.value });
  }
  const sig = list.map(c => `${c.owner}:${c.at}:${c.value}`).join(",");
  if (sig === world.cbd.sig) return false;
  world.cbd.sig = sig;
  setCentres(world, list);
  return true;
}

export function setCentres(world, centres) {
  world.cbd.centres = centres.map(c => ({ at: c.at, owner: c.owner, value: c.value ?? 1 }));
  world.cbd.field = null;
}

export function rebuildField(world) {
  const C = world.cbd, r = C.rules, g = world.grid, fields = new Map();
  for (const c of C.centres) {
    let f = fields.get(c.owner);
    if (!f) fields.set(c.owner, (f = new Map()));
    const reach = r.radius * C.scale * (r.weightByValue ? c.value : 1), R = Math.floor(reach), cx = g.x(c.at), cy = g.y(c.at);
    for (let y = Math.max(0, cy - R); y <= Math.min(g.h - 1, cy + R); y++)
      for (let x = Math.max(0, cx - R); x <= Math.min(g.w - 1, cx + R); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > reach) continue;
        const s = r.minBonus + (r.maxBonus - r.minBonus) * (1 - d / reach), i = g.idx(x, y);
        if (s > (f.get(i) ?? 0)) f.set(i, s);
      }
  }
  C.field = fields;
  return fields;
}

export function strengthAt(world, nid, plot) {
  if (!world.cbd.centres.length) return 0;
  if (!world.cbd.field) rebuildField(world);
  return world.cbd.field.get(nid)?.get(plot) ?? 0;
}

export function defenceMultiplier(world, nid, plot) {
  return 1 + strengthAt(world, nid, plot);
}

export function attackMultiplier(world, nid, plot) {
  return 1 + strengthAt(world, nid, plot) * world.cbd.rules.attackShare;
}

export function installCombatHooks(world) {
  const baseCapture = world.captureCost.bind(world);
  world.captureCost = (i, attacker) => {
    const owner = world.owner[i];
    const base = baseCapture(i, attacker);
    if (!owner || !world.cbd.centres.length) return base;
    return base * defenceMultiplier(world, owner, i) / attackMultiplier(world, attacker, i);
  };
}
