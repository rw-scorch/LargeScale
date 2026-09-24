export function validateTree(tree, knownIds = null) {
  const errors = [];
  const byId = new Map();
  for (const n of tree.nodes) {
    if (byId.has(n.id)) errors.push(`duplicate id ${n.id}`);
    byId.set(n.id, n);
    if (!tree.eras.includes(n.era)) errors.push(`${n.id}: unknown era ${n.era}`);
    if (n.branch !== "era" && !tree.branches.includes(n.branch)) errors.push(`${n.id}: unknown branch ${n.branch}`);
    if (!(n.cost > 0)) errors.push(`${n.id}: cost must be positive`);
    if (n.advances && tree.eras.indexOf(n.advances) !== tree.eras.indexOf(n.era) + 1) errors.push(`${n.id}: advances must be the next era`);
  }
  for (const n of tree.nodes)
    for (const r of n.requires) {
      const p = byId.get(r);
      if (!p) { errors.push(`${n.id}: missing requirement ${r}`); continue; }
      if (tree.eras.indexOf(p.era) > tree.eras.indexOf(n.era)) errors.push(`${n.id}: requires later-era node ${r}`);
    }
  const state = new Map();
  const visit = id => {
    if (state.get(id) === 1) { errors.push(`cycle through ${id}`); return; }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const r of byId.get(id)?.requires ?? []) if (byId.has(r)) visit(r);
    state.set(id, 2);
  };
  for (const n of tree.nodes) visit(n.id);
  if (knownIds) for (const n of tree.nodes) for (const b of [...(n.unlocks?.buildings ?? []), ...(n.unlocks?.units ?? [])]) if (!knownIds.has(b)) errors.push(`${n.id}: unlocks unknown ${b}`);
  return errors;
}

export function eraUnlocked(tree, nationEra, nodeEra) {
  return tree.eras.indexOf(nodeEra) <= tree.eras.indexOf(nationEra);
}

export function available(tree, known, era) {
  return tree.nodes.filter(n => !known.has(n.id) && eraUnlocked(tree, era, n.era) && n.requires.every(r => known.has(r)));
}

export function eraProgress(tree, known, era) {
  const mine = tree.nodes.filter(n => n.era === era && n.branch !== "era" && known.has(n.id));
  return { nodes: mine.length, branches: new Set(mine.map(n => n.branch)).size };
}

export function canResearch(tree, nation, id) {
  const n = tree.nodes.find(v => v.id === id);
  if (!n) return "unknown";
  if (nation.known.has(id)) return "already known";
  if (!eraUnlocked(tree, nation.era, n.era)) return "era locked";
  const missing = n.requires.filter(r => !nation.known.has(r));
  if (missing.length) return `needs ${missing.join(", ")}`;
  if (n.need) {
    const p = eraProgress(tree, nation.known, n.era);
    if (p.nodes < n.need.nodes || p.branches < n.need.branches) return `needs ${n.need.nodes} ${n.era} upgrades across ${n.need.branches} branches (have ${p.nodes} across ${p.branches})`;
  }
  return null;
}

export function setResearch(tree, nation, id) {
  const why = canResearch(tree, nation, id);
  if (why) return why;
  nation.researching = id;
  nation.researchProgress = 0;
  return null;
}

export function researchTick(tree, nation, points) {
  if (!nation.researching) { nation.researchBank = Math.min((nation.researchBank ?? 0) + points, 500); return null; }
  const n = tree.nodes.find(v => v.id === nation.researching);
  nation.researchProgress += points + (nation.researchBank ?? 0);
  nation.researchBank = 0;
  if (nation.researchProgress < n.cost) return null;
  nation.researchBank = nation.researchProgress - n.cost;
  return complete(tree, nation, n.id);
}

export function complete(tree, nation, id) {
  const n = tree.nodes.find(v => v.id === id);
  nation.known.add(id);
  if (nation.researching === id) { nation.researching = null; nation.researchProgress = 0; }
  if (n.advances) nation.era = n.advances;
  for (const [k, v] of Object.entries(n.unlocks?.effects ?? {})) nation.effects[k] = (nation.effects[k] ?? 0) + v;
  return n;
}

export function unlockedBuildings(tree, known) {
  const out = new Set();
  for (const n of tree.nodes) if (known.has(n.id)) for (const b of n.unlocks?.buildings ?? []) out.add(b);
  return out;
}

export function researchRate(nation, sources) {
  let rp = 0.2 + (nation.pop ?? 0) * 0.002;
  for (const s of sources) rp += s;
  return rp * (1 + (nation.effects.research ?? 0));
}
