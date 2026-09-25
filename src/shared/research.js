import { ERA_NAMES, eraIdx } from "./buildings.js";

export function lockMap(tree) {
  const buildings = new Map(), zones = new Map();
  for (const n of tree.nodes) {
    for (const b of n.unlocks?.buildings ?? []) if (!buildings.has(b)) buildings.set(b, n.id);
    for (const z of n.unlocks?.zones ?? []) if (!zones.has(z)) zones.set(z, n.id);
  }
  return { buildings, zones, nodes: new Map(tree.nodes.map(n => [n.id, n])) };
}

export function lockReason(locks, known, id, kind = "buildings") {
  const node = locks[kind].get(id);
  return node && !known.has(node) ? `needs ${locks.nodes.get(node).name} research` : null;
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
  const visit = v => {
    if (seen.has(v) || known.has(v)) return;
    seen.add(v);
    const n = locks.nodes.get(v);
    if (!n) return;
    for (const r of n.requires) visit(r);
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
