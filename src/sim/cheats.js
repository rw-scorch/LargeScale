import rules from "../../data/rules.json" with { type: "json" };
import { complete, knownOf } from "./research.js";
import { researchError } from "../shared/research.js";
import { finishBuilding } from "./construction.js";

export const CHEATS = ["gold", "troops", "build", "research"];
export const CHEAT_RULES = { gold: 1e9, troops: 100000, ...rules.admin.cheats };

export function installCheats(world) {
  if (world.cheats) return world.cheats;
  world.cheats = { rules: CHEAT_RULES };
  const tick = w => cheatTick(w);
  tick.whole = tick;
  tick.rank = 100;
  world.hooks.postTick.push(tick);
  return world.cheats;
}

export function setCheat(world, n, cheat, on) {
  if (!CHEATS.includes(cheat)) return { error: `the cheats are ${CHEATS.join(", ")}` };
  const list = new Set(n.cheats ?? []);
  if (on) list.add(cheat);
  else list.delete(cheat);
  if (list.size) n.cheats = [...list];
  else delete n.cheats;
  if (on) cheatNation(world, n);
  return { ok: true, cheats: n.cheats ?? [] };
}

export function researchAll(world, n) {
  const res = world.research;
  if (!res || !n.research) return [];
  const done = [];
  for (let pass = 0; pass < res.tree.nodes.length; pass++) {
    let moved = false;
    for (const node of res.tree.nodes) {
      if (knownOf(n).has(node.id) || researchError(res.tree, res.locks, knownOf(n), n.era, node.id)) continue;
      complete(world, n, node.id);
      done.push(node.id);
      moved = true;
    }
    if (!moved) break;
  }
  return done;
}

function cheatNation(world, n) {
  const on = new Set(n.cheats ?? []), r = world.cheats?.rules ?? CHEAT_RULES;
  if (!n.alive) return;
  if (on.has("gold") && n.money !== undefined && n.money < r.gold) n.money = r.gold;
  if (on.has("troops") && n.troops < r.troops) n.troops = r.troops;
  if (on.has("build")) {
    for (const id of world.bld?.mine.get(n.id) ?? []) {
      const b = world.bld.list.get(id);
      if (b?.state === "construction" && !b.civilian) finishBuilding(world, b);
    }
    for (const q of world.machines?.queues.values() ?? []) if (q.owner === n.id && q.paid) q.progress = 1;
  }
  if (on.has("research") && world.research && n.research?.queue.length) {
    for (const id of [...n.research.queue]) if (!researchError(world.research.tree, world.research.locks, knownOf(n), n.era, id)) complete(world, n, id);
  }
}

export function cheatTick(world) {
  for (const n of world.nations.values()) if (n.cheats?.length) cheatNation(world, n);
}
