import { ERA_NAMES, eraIdx } from "./buildings.js";

export function lockMap(tree) {
  const buildings = new Map(), zones = new Map(), units = new Map(), anyOf = new Map();
  for (const n of tree.nodes) {
    for (const b of n.unlocks?.buildings ?? []) { if (!buildings.has(b)) buildings.set(b, n.id); else anyOf.set(b, [...(anyOf.get(b) ?? [buildings.get(b)]), n.id]); }
    for (const z of n.unlocks?.zones ?? []) if (!zones.has(z)) zones.set(z, n.id);
    for (const u of n.unlocks?.units ?? []) if (!units.has(u)) units.set(u, n.id);
  }
  return { buildings, zones, units, anyOf, nodes: new Map(tree.nodes.map(n => [n.id, n])) };
}

export function lockReason(locks, known, id, kind = "buildings") {
  const node = locks[kind].get(id);
  if (!node || known.has(node)) return null;
  const any = kind === "buildings" ? locks.anyOf?.get(id) : null;
  if (any?.some(k => known.has(k))) return null;
  return any ? `needs ${any.map(k => locks.nodes.get(k).name).join(" or ")} research` : `needs ${locks.nodes.get(node).name} research`;
}

export function eraProgress(tree, known, era) {
  const mine = tree.nodes.filter(n => n.era === era && n.branch !== "era" && known.has(n.id));
  return { nodes: mine.length, branches: new Set(mine.map(n => n.branch)).size };
}

export function researchError(tree, locks, known, era, id) {
  const n = locks.nodes.get(id);
  if (!n) return "unknown research";
  if (known.has(id)) return "already known";
  if (eraIdx(n.era) > eraIdx(era)) return `needs the ${ERA_NAMES[n.era]} era`;
  const missing = n.requires.filter(r => !known.has(r));
  if (missing.length) return `needs ${missing.map(r => locks.nodes.get(r)?.name ?? r).join(" and ")} first`;
  if (n.need) {
    const p = eraProgress(tree, known, n.era);
    if (p.nodes < n.need.nodes || p.branches < n.need.branches)
      return `needs ${n.need.nodes} ${ERA_NAMES[n.era]} upgrades across ${n.need.branches} branches (you have ${p.nodes} across ${p.branches})`;
  }
  return null;
}

export function planPath(locks, known, id) {
  const out = [], seen = new Set();
  const missing = v => {
    const acc = new Set();
    const walk = u => {
      if (acc.has(u) || known.has(u) || seen.has(u)) return;
      acc.add(u);
      for (const r of locks.nodes.get(u)?.requires ?? []) walk(r);
    };
    walk(v);
    return acc;
  };
  const meet = age => {
    const later = dependents(locks, age.id);
    const pool = [...locks.nodes.values()].filter(x => x.era === age.era && x.branch !== "era" && !later.has(x.id));
    for (;;) {
      const have = pool.filter(x => known.has(x.id) || seen.has(x.id)), branches = new Set(have.map(x => x.branch));
      if (have.length >= age.need.nodes && branches.size >= age.need.branches) return;
      const short = branches.size < age.need.branches;
      let best = null, bestCost = Infinity;
      for (const x of pool) {
        if (known.has(x.id) || seen.has(x.id) || (short && branches.has(x.branch))) continue;
        let cost = 0;
        for (const u of missing(x.id)) cost += locks.nodes.get(u)?.cost ?? 0;
        if (cost < bestCost) { best = x; bestCost = cost; }
      }
      if (!best) return;
      visit(best.id);
    }
  };
  const visit = v => {
    if (seen.has(v) || known.has(v)) return;
    seen.add(v);
    const n = locks.nodes.get(v);
    if (!n) return;
    for (const r of n.requires) visit(r);
    if (n.need) meet(n);
    out.push(v);
  };
  visit(id);
  return out;
}

export function dependents(locks, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of locks.nodes.values()) if (!out.has(n.id) && n.requires.some(r => out.has(r))) { out.add(n.id); grew = true; }
  }
  return out;
}

export function nextResearch(tree, locks, known, era, queue) {
  return queue.find(id => !researchError(tree, locks, known, era, id)) ?? null;
}
