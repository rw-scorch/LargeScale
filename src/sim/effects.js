import rules from "../../data/rules.json" with { type: "json" };

export const EFFECT_RULES = { every: 2, cell: 16, ...rules.effects };

export const effectOf = (world, n, key) => (world?.effectOf ? world.effectOf(n, key) : (n?.effects?.[key] ?? 0));

export function buildingEffects(world, nid) {
  const bld = world.bld, count = new Map(), fx = {}, forts = [], w = world.grid.w;
  for (const id of bld?.mine.get(nid) ?? []) {
    const b = bld.list.get(id);
    if (!b || b.state !== "active") continue;
    const d = bld.table[b.type];
    if (d.fort) forts.push({ x: (b.anchor % w) + d.fp[0] / 2, y: Math.floor(b.anchor / w) + d.fp[1] / 2, r: d.fort.radius, m: d.fort.defence, id: b.id });
    if (!d.effects) continue;
    const k = (count.get(d.id) ?? 0) + 1;
    count.set(d.id, k);
    if (d.cap && k > d.cap) continue;
    for (const [e, v] of Object.entries(d.effects)) fx[e] = (fx[e] ?? 0) + v;
  }
  return { fx, forts };
}

export function installEffects(world, opts = {}) {
  const r = { ...EFFECT_RULES, ...opts }, c = r.cell, cols = Math.ceil(world.grid.w / c);
  const grids = new Map();
  let last = -Infinity;

  world.effectOf = (n, key) => (n?.effects?.[key] ?? 0) + (n?.bfx?.[key] ?? 0);

  world.fortAt = (nid, i) => {
    const cells = grids.get(nid);
    if (!cells) return 1;
    const x = (i % world.grid.w) + 0.5, y = Math.floor(i / world.grid.w) + 0.5;
    const list = cells.get(Math.floor(y / c) * cols + Math.floor(x / c));
    let best = 1;
    for (const f of list ?? []) if (f.m > best && (f.x - x) ** 2 + (f.y - y) ** 2 <= f.r * f.r) best = f.m;
    return best;
  };

  world.refreshEffects = () => {
    grids.clear();
    for (const nid of world.bld?.mine.keys() ?? []) {
      const n = world.nations.get(nid);
      if (!n) continue;
      const { fx, forts } = buildingEffects(world, nid);
      n.bfx = fx;
      if (!forts.length) continue;
      const cells = new Map();
      for (const f of forts)
        for (let cy = Math.floor((f.y - f.r) / c); cy <= Math.floor((f.y + f.r) / c); cy++)
          for (let cx = Math.floor((f.x - f.r) / c); cx <= Math.floor((f.x + f.r) / c); cx++) {
            if (cx < 0 || cy < 0 || cx >= cols) continue;
            const k = cy * cols + cx;
            if (!cells.has(k)) cells.set(k, []);
            cells.get(k).push(f);
          }
      grids.set(nid, cells);
    }
  };

  world.fortsOf = nid => {
    const out = new Map();
    for (const list of grids.get(nid)?.values() ?? []) for (const f of list) out.set(f.id, f);
    return [...out.values()];
  };

  world.hooks.postTick.push(() => {
    if (world.time - last < r.every) return;
    last = world.time;
    world.refreshEffects();
  });
  world.refreshEffects();
}
