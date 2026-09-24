import { TERRAIN, TID } from "../shared/terrain.js";

export const ENGINEERING = {
  baseHp: { rock: 300, hard: 180, soft: 90, made: 40 },
  digRate: 6,
  blastPower: 150,
  chargeCost: { money: 200 },
  rebuildRate: 5,
  repairCost: { stone: 20 },
  regenPerHour: 0,
  workRadius: 1,
};

export const CLASS_OF = {
  high_mountain: "rock", snow_peak: "rock", mountain: "rock", cliff: "rock", volcano: "rock", canyon: "rock", escarpment: "rock",
  highlands: "hard", hills: "hard", boulders: "hard", glacier: "hard", ice_field: "hard", badlands: "hard", scree: "hard",
  forest: "soft", pine_forest: "soft", jungle: "soft", thicket: "soft", bamboo: "soft", swamp: "soft", marsh: "soft", bog: "soft", dunes: "soft", mudflat: "soft",
  urban: "made", rubble: "made",
};

export const BECOMES = {
  rock: "rubble", hard: "scree", soft: "cleared", made: "rubble",
};

export const BUILD_RECIPES = {
  causeway: { from: ["swamp", "marsh", "bog", "mudflat", "shallows"], to: "cleared", cost: { stone: 40 }, work: 400 },
  levelled_ground: { from: ["hills", "boulders", "scree", "badlands", "rubble"], to: "plains", cost: { stone: 15 }, work: 300 },
  embankment: { from: ["plains", "grassland", "cleared"], to: "hills", cost: { stone: 60 }, work: 500 },
  quarry_cut: { from: ["mountain", "highlands"], to: "scree", cost: { explosives: 8 }, work: 600 },
  reforest: { from: ["cleared", "grassland"], to: "forest", cost: { wood: 30 }, work: 450 },
};

export function installEngineering(world, rules = {}) {
  world.eng = {
    rules: { ...ENGINEERING, ...rules },
    hp: new Map(),
    jobs: new Map(),
    next: 1,
    original: new Map(),
  };
  return world.eng;
}

export function terrainClass(world, i) {
  return CLASS_OF[TERRAIN[world.terrain[i]].name] ?? null;
}

export function maxHp(world, i) {
  const c = terrainClass(world, i);
  return c ? world.eng.rules.baseHp[c] : 0;
}

export function hpOf(world, i) {
  const cur = world.eng.hp.get(i);
  return cur === undefined ? maxHp(world, i) : cur;
}

export function canWork(world, nid, i, kind = "dig") {
  const eng = world.eng;
  const o = world.owner[i];
  if (kind === "dig" && !terrainClass(world, i)) return "nothing to dig here";
  if (o && o !== nid && !world.hostile(nid, o)) return "not at war with the owner";
  if (!o && !world.grid.neighbours4(i).some(n => world.owner[n] === nid || world.hostile(nid, world.owner[n]) === false && world.owner[n] === nid)) {
    if (![...world.stacks.values()].some(s => s.owner === nid && world.grid.cheb(s.pos, i) <= eng.rules.workRadius)) return "no engineers nearby";
  }
  return null;
}

export function startJob(world, nid, i, kind, opts = {}) {
  const eng = world.eng;
  const why = canWork(world, nid, i, kind);
  if (why) return { error: why };
  if (kind === "build") {
    const r = BUILD_RECIPES[opts.recipe];
    if (!r) return { error: "unknown build" };
    if (!r.from.includes(TERRAIN[world.terrain[i]].name)) return { error: `cannot build ${opts.recipe} on ${TERRAIN[world.terrain[i]].name}` };
  }
  const id = eng.next++;
  const job = { id, nation: nid, at: i, kind, recipe: opts.recipe ?? null, done: 0, engineers: opts.engineers ?? 1, charges: 0 };
  eng.jobs.set(id, job);
  world.emit("engineering_started", { nation: nid, at: i, kind, recipe: job.recipe });
  return { job };
}

export function addCharge(world, jobId, nation) {
  const job = world.eng.jobs.get(jobId);
  if (!job || job.kind !== "dig") return { error: "no digging job there" };
  const cost = world.eng.rules.chargeCost;
  for (const [k, v] of Object.entries(cost)) {
    const have = k === "money" ? (nation.money ?? 0) : (nation.stock?.[k] ?? 0);
    if (have < v) return { error: `needs ${v} ${k}` };
  }
  for (const [k, v] of Object.entries(cost)) {
    if (k === "money") nation.money -= v; else nation.stock[k] -= v;
  }
  job.charges += 1;
  return { charges: job.charges };
}

function finishDig(world, i) {
  const c = terrainClass(world, i);
  const before = world.terrain[i];
  world.eng.original.set(i, world.eng.original.get(i) ?? before);
  world.terrain[i] = TID[BECOMES[c]];
  world.eng.hp.delete(i);
  world.dirty.add(i);
  world.emit("terrain_broken", { at: i, from: TERRAIN[before].name, to: BECOMES[c] });
}

export function tickEngineering(world, dt, nations = null) {
  const eng = world.eng, r = eng.rules;
  for (const job of [...eng.jobs.values()]) {
    const n = nations?.get?.(job.nation) ?? world.nations.get(job.nation);
    if (!n?.alive) { eng.jobs.delete(job.id); continue; }
    if (job.kind === "dig") {
      let damage = r.digRate * job.engineers * dt;
      if (job.charges > 0) {
        damage += r.blastPower * job.charges;
        job.charges = 0;
        world.emit("charge_detonated", { at: job.at, nation: job.nation });
      }
      const left = hpOf(world, job.at) - damage;
      if (left <= 0) {
        finishDig(world, job.at);
        eng.jobs.delete(job.id);
      } else {
        eng.hp.set(job.at, left);
        world.emit("terrain_damaged", { at: job.at, hp: left, max: maxHp(world, job.at), nation: job.nation });
      }
    } else {
      const recipe = BUILD_RECIPES[job.recipe];
      if (!job.paid) {
        for (const [k, v] of Object.entries(recipe.cost)) if ((n.stock?.[k] ?? 0) < v) { job.waiting = k; continue; }
        if (Object.entries(recipe.cost).every(([k, v]) => (n.stock?.[k] ?? 0) >= v)) {
          for (const [k, v] of Object.entries(recipe.cost)) n.stock[k] -= v;
          job.paid = true;
          job.waiting = null;
        } else continue;
      }
      job.done += r.rebuildRate * job.engineers * dt;
      if (job.done >= recipe.work) {
        world.eng.original.set(job.at, world.eng.original.get(job.at) ?? world.terrain[job.at]);
        world.terrain[job.at] = TID[recipe.to];
        world.eng.hp.delete(job.at);
        world.dirty.add(job.at);
        eng.jobs.delete(job.id);
        world.emit("terrain_built", { at: job.at, to: recipe.to, nation: job.nation });
      }
    }
  }
}

export function damageState(world, i) {
  const max = maxHp(world, i);
  if (!max) return null;
  const hp = hpOf(world, i);
  if (hp >= max) return "intact";
  if (hp > max * 0.6) return "cracked";
  if (hp > max * 0.25) return "damaged";
  return "crumbling";
}

export function changedPlots(world) {
  return [...world.eng.original.keys()];
}
