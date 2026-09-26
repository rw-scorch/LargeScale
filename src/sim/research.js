import { effectOf } from "./effects.js";
import { validateTree } from "./techtree.js";
import { lockMap, lockReason, researchError, planPath, dependents, nextResearch } from "../shared/research.js";
import { ERA_NAMES } from "../shared/buildings.js";
import { BUILDINGS } from "./buildings.js";
import rules from "../../data/rules.json" with { type: "json" };
import techtree from "../../data/techtree.json" with { type: "json" };

export const TREE = techtree;
export const RESEARCH_RULES = rules.research;

export function checkTree(tree = TREE, knownIds = null) {
  const errors = validateTree(tree, knownIds);
  if (errors.length) throw new Error(`data/techtree.json has ${errors.length} problems: ${errors.slice(0, 5).join("; ")}`);
  return tree;
}

checkTree();
for (const id of RESEARCH_RULES.starterQueue ?? []) if (!TREE.nodes.some(n => n.id === id)) throw new Error(`rules.json research.starterQueue names unknown research ${id}`);

export function installResearch(world, cfg = {}, tree = TREE) {
  const r = { ...RESEARCH_RULES, ...cfg };
  const locks = lockMap(tree);
  const res = { tree, locks, rules: r };
  world.research = res;
  for (const n of world.nations.values()) if (n.human) initResearch(n);
  world.unlocked = (nid, id, kind = "buildings") => {
    const n = world.nations.get(nid);
    return !n?.human || !lockReason(locks, knownOf(n), id, kind);
  };
  world.lockReason = (nid, id, kind = "buildings") => {
    const n = world.nations.get(nid);
    return n?.human ? lockReason(locks, knownOf(n), id, kind) : null;
  };
  world.hooks.postTick.push((w, dt) => {
    for (const n of w.nations.values()) if (n.human && n.spawned && n.alive) researchStep(w, n, researchRate(w, n) * dt);
  });
  return res;
}

export function initResearch(n) {
  n.era ??= "T";
  n.research ??= { known: [], queue: [], partial: {}, bank: 0, current: null };
  if (!n.research.starter) {
    const have = new Set([...n.research.known, ...n.research.queue]);
    n.research.queue.push(...(RESEARCH_RULES.starterQueue ?? []).filter(id => !have.has(id)));
    n.research.starter = true;
  }
  n.effects ??= {};
  return n.research;
}

const cache = new WeakMap();
export function knownOf(n) {
  const list = n.research?.known ?? [];
  const hit = cache.get(n);
  if (hit && hit.size === list.length) return hit;
  const set = new Set(list);
  cache.set(n, set);
  return set;
}

export function researchRate(world, n) {
  const r = world.research.rules;
  let points = r.base + (n.pop ?? 0) * r.perPerson;
  const count = new Map();
  for (const b of world.bld?.mine.get(n.id) ?? []) {
    const def = world.bld.table[world.bld.list.get(b)?.type];
    if (!def?.research || world.bld.list.get(b).state !== "active") continue;
    const k = (count.get(def.id) ?? 0) + 1;
    count.set(def.id, k);
    if (!def.cap || k <= def.cap) points += def.research;
  }
  return points * (1 + effectOf(world, n, "research")) * (n.outputMult ?? 1) * (r.speed ?? 1);
}

export function researchStep(world, n, points) {
  const res = world.research, s = initResearch(n), known = knownOf(n);
  const id = nextResearch(res.tree, res.locks, known, n.era, s.queue);
  s.current = id;
  if (!id) { s.bank = Math.min(res.rules.bankCap, s.bank + points); return null; }
  const node = res.locks.nodes.get(id);
  s.partial[id] = (s.partial[id] ?? 0) + points + s.bank;
  s.bank = 0;
  if (s.partial[id] < node.cost) return null;
  const spare = s.partial[id] - node.cost;
  complete(world, n, id);
  s.bank = Math.min(res.rules.bankCap, spare);
  return node;
}

export function complete(world, n, id) {
  const res = world.research, s = initResearch(n), node = res.locks.nodes.get(id);
  if (knownOf(n).has(id)) return node;
  s.known.push(id);
  delete s.partial[id];
  s.queue = s.queue.filter(q => q !== id);
  s.current = null;
  for (const [k, v] of Object.entries(node.unlocks?.effects ?? {})) n.effects[k] = (n.effects[k] ?? 0) + v;
  world.emit("researched", { nation: n.id, node: id });
  if (node.advances) {
    n.era = node.advances;
    world.emit("era_up", { nation: n.id, era: n.era, name: ERA_NAMES[n.era] });
  }
  return node;
}

export function orderResearch(world, nid, id, mode = "queue") {
  const res = world.research, n = world.nations.get(nid), s = initResearch(n), known = knownOf(n);
  if (mode === "clear") { s.queue = []; return { queue: s.queue }; }
  if (!res.locks.nodes.has(id)) return { error: "unknown research" };
  if (mode === "remove") {
    const drop = dependents(res.locks, id);
    s.queue = s.queue.filter(q => !drop.has(q));
    return { queue: s.queue };
  }
  if (known.has(id)) return { error: "already known" };
  const path = planPath(res.locks, known, id);
  if (mode === "first") s.queue = [...path, ...s.queue.filter(q => !path.includes(q))];
  else s.queue = [...s.queue, ...path.filter(q => !s.queue.includes(q))];
  if (s.queue.length > res.rules.maxQueue) { s.queue = s.queue.slice(0, res.rules.maxQueue); return { error: `the queue holds at most ${res.rules.maxQueue}`, queue: s.queue }; }
  const now = nextResearch(res.tree, res.locks, known, n.era, s.queue);
  return { queue: s.queue, next: now, waiting: now ? null : researchError(res.tree, res.locks, known, n.era, s.queue[0]) };
}

export function researchView(world, n) {
  if (!n?.research || !world.research) return null;
  const s = n.research, res = world.research, known = knownOf(n);
  const next = nextResearch(res.tree, res.locks, known, n.era, s.queue);
  return {
    known: s.known, queue: s.queue, current: next, progress: next ? Math.floor(s.partial[next] ?? 0) : 0,
    bank: Math.floor(s.bank), rate: Math.round(researchRate(world, n) * 100) / 100,
    waiting: !next && s.queue.length ? researchError(res.tree, res.locks, known, n.era, s.queue[0]) : null,
  };
}

export const buildingIds = () => new Set(Object.keys(BUILDINGS.table));
