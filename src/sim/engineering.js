import { TERRAIN, TID, isLand } from "../shared/terrain.js";
import rules from "../../data/rules.json" with { type: "json" };
import { setTerrain } from "./resources.js";
import { setRoad } from "./logistics.js";
import { roadLine, TUNNEL } from "../shared/roads.js";
import { UNIT_TYPES } from "./units.js";

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
  highlands: "hard", hills: "hard", boulders: "hard", glacier: "hard", ice_field: "hard", badlands: "hard", scree: "hard", rocky_desert: "hard",
  forest: "soft", pine_forest: "soft", jungle: "soft", thicket: "soft", bamboo: "soft", swamp: "soft", marsh: "soft", bog: "soft", dunes: "soft", mudflat: "soft", mangrove: "soft",
  urban: "made", rubble: "made",
};

export const BECOMES = {
  rock: "rubble", hard: "scree", soft: "cleared", made: "rubble",
};

const BECOMES_BY_NAME = { scree: "rubble" };
const NOT_DUG = new Set(["rubble"]);

export const BUILD_RECIPES = {
  causeway: { from: ["swamp", "marsh", "bog", "mudflat", "shallows"], to: "cleared", cost: { stone: 40 }, work: 400 },
  levelled_ground: { from: ["hills", "boulders", "scree", "badlands", "rubble"], to: "plains", cost: { stone: 15 }, work: 300 },
  embankment: { from: ["plains", "grassland", "cleared"], to: "hills", cost: { stone: 60 }, work: 500 },
  quarry_cut: { from: ["mountain", "highlands"], to: "scree", cost: { explosives: 8 }, work: 600 },
  reforest: { from: ["cleared", "grassland"], to: "forest", cost: { wood: 30 }, work: 450 },
};

export const ENG_RULES = rules.engineering;

export function installEngineering(world, rules = {}) {
  world.eng = {
    rules: { ...ENGINEERING, ...rules },
    hp: new Map(),
    jobs: new Map(),
    next: 1,
    original: new Map(),
    roadHp: new Map(),
    changed: false,
    version: 0,
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
  if (kind === "dig" && !terrainClass(world, i) && !eng.roadAt?.(i)) return "nothing to dig here";
  if (kind === "dig" && eng.crewOf && NOT_DUG.has(TERRAIN[world.terrain[i]].name) && !eng.roadAt?.(i)) return "rubble is cleared, not dug: build Clear rubble";
  if (o && o !== nid && !world.hostile(nid, o)) return "not at war with the owner";
  if (eng.crewOf) return eng.crewOf(nid, i) > 0 ? null : "no engineers beside that plot";
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
    const r = opts.recipe === "restore" ? restoreRecipe(world, i) ?? {} : recipeOf(world, opts.recipe);
    if (!r) return { error: "unknown build" };
    const why = buildError(world, nid, i, opts.recipe, r);
    if (why) return { error: why };
  }
  const id = eng.next++;
  const job = { id, nation: nid, at: i, kind, recipe: opts.recipe ?? null, done: 0, engineers: opts.engineers ?? 1, charges: 0, since: world.time ?? 0 };
  eng.jobs.set(id, job);
  eng.changed = true;
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
  world.eng.changed = true;
  return { charges: job.charges };
}

function recipeOf(world, id) {
  return (world.eng.rules.recipes ?? BUILD_RECIPES)[id] ?? null;
}

function buildError(world, nid, i, id, r) {
  const name = TERRAIN[world.terrain[i]].name;
  if (id === "restore") return world.eng.original.has(i) && world.eng.original.get(i) !== world.terrain[i] ? null : "nothing here was dug away";
  if (!r.from.includes(name)) return `cannot build ${id} on ${name}`;
  if (r.ownerOnly && world.owner[i] !== nid) return "only the owner clears rubble";
  if (!TERRAIN[TID[r.to]].land || TERRAIN[world.terrain[i]].land) return null;
  return world.grid.neighbours4(i).some(n => isLand(world.terrain[n])) ? null : "a causeway must start from land";
}

function change(world, i, tid) {
  const eng = world.eng;
  if (!eng.original.has(i)) eng.original.set(i, world.terrain[i]);
  if (eng.apply) eng.apply(i, tid);
  else { world.terrain[i] = tid; world.dirty.add(i); }
  eng.hp.delete(i);
  eng.changed = true;
}

function finishDig(world, i, job = null, cause = null) {
  const c = terrainClass(world, i);
  const before = world.terrain[i], name = TERRAIN[before].name, to = BECOMES_BY_NAME[name] ?? BECOMES[c];
  change(world, i, TID[to]);
  world.emit("terrain_broken", { at: i, from: name, to, ...(job ? { by: job.nation, nation: world.owner[i] || null } : {}), ...(cause ? { cause } : {}) });
}

function finishRoad(world, job) {
  world.eng.roadHp.delete(job.at);
  world.eng.roadCut?.(job.at);
  world.eng.changed = true;
  world.emit("road_broken", { at: job.at, by: job.nation, nation: world.owner[job.at] || null });
}

export function damageTerrain(world, i, amount, by = null, cause = "bomb") {
  const eng = world.eng;
  if (!eng || !(amount > 0)) return null;
  if (eng.roadAt?.(i)) {
    const left = (eng.roadHp.get(i) ?? eng.rules.baseHp.made) - amount * (eng.rules.bombRoads ?? 1);
    eng.changed = true;
    if (left > 0) { eng.roadHp.set(i, left); return "road"; }
    eng.roadHp.delete(i);
    eng.roadCut?.(i);
    world.emit("road_broken", { at: i, by, nation: world.owner[i] || null, cause });
    return "road_broken";
  }
  const name = TERRAIN[world.terrain[i]].name;
  if (!terrainClass(world, i) || NOT_DUG.has(name)) return null;
  const left = hpOf(world, i) - amount;
  eng.changed = true;
  if (left > 0) { eng.hp.set(i, left); return "damaged"; }
  finishDig(world, i, by === null ? null : { nation: by }, cause);
  return "broken";
}

export function tickEngineering(world, dt, nations = null) {
  const eng = world.eng, r = eng.rules;
  for (const job of [...eng.jobs.values()]) {
    const n = nations?.get?.(job.nation) ?? world.nations.get(job.nation);
    if (!n?.alive) { eng.jobs.delete(job.id); eng.changed = true; continue; }
    if (eng.crewOf) {
      const crew = eng.crewOf(job.nation, job.at);
      if (crew !== job.engineers) eng.changed = true;
      job.engineers = crew;
      if (crew > 0) job.since = world.time ?? 0;
      else if ((world.time ?? 0) - job.since > (r.idleSeconds ?? Infinity)) { eng.jobs.delete(job.id); eng.changed = true; continue; }
    }
    if (job.kind === "tunnel") {
      job.done += r.rebuildRate * job.engineers * dt;
      while (job.done >= r.tunnelWork && job.k < job.plots.length) {
        job.done -= r.tunnelWork;
        eng.roadCut?.(job.plots[job.k], TUNNEL);
        job.k++;
      }
      if (job.engineers > 0) eng.changed = true;
      if (job.k >= job.plots.length) {
        eng.jobs.delete(job.id);
        world.emit("tunnel_opened", { nation: job.nation, at: job.at, to: job.to, plots: job.plots.length });
      }
      continue;
    }
    if (job.kind === "dig") {
      const road = eng.roadAt?.(job.at);
      if (!road && !terrainClass(world, job.at)) { eng.jobs.delete(job.id); eng.changed = true; continue; }
      let damage = r.digRate * job.engineers * dt;
      if (job.charges > 0) {
        damage += r.blastPower * job.charges;
        job.charges = 0;
        world.emit("charge_detonated", { at: job.at, nation: job.nation });
      }
      if (damage <= 0) continue;
      if (road) {
        const left = (eng.roadHp.get(job.at) ?? r.baseHp.made) - damage;
        if (left <= 0) { finishRoad(world, job); eng.jobs.delete(job.id); }
        else { eng.roadHp.set(job.at, left); eng.changed = true; }
        continue;
      }
      const max = maxHp(world, job.at), before = hpOf(world, job.at), left = before - damage;
      if (left <= 0) {
        finishDig(world, job.at, job);
        eng.jobs.delete(job.id);
      } else {
        eng.hp.set(job.at, left);
        eng.changed = true;
        const half = max * (r.warnAt ?? 0.5);
        world.emit("terrain_damaged", { at: job.at, hp: left, max, nation: job.nation });
        const owner = world.owner[job.at];
        if (eng.crewOf && owner && owner !== job.nation && before > half && left <= half) world.emit("terrain_dug", { at: job.at, by: job.nation, nation: owner, half: true });
      }
    } else {
      const recipe = job.recipe === "restore" ? restoreRecipe(world, job.at) : recipeOf(world, job.recipe);
      if (!recipe) { eng.jobs.delete(job.id); eng.changed = true; continue; }
      if (!job.paid) {
        if (!payFor(n, recipe.cost)) { job.waiting = Object.keys(recipe.cost)[0]; continue; }
        job.paid = true;
        job.waiting = null;
        eng.changed = true;
      }
      job.done += r.rebuildRate * job.engineers * dt;
      if (job.engineers > 0) eng.changed = true;
      if (job.done >= recipe.work) {
        const to = typeof recipe.to === "number" ? recipe.to : TID[recipe.to];
        const wasWater = !TERRAIN[world.terrain[job.at]].land;
        change(world, job.at, to);
        if (job.recipe === "restore") eng.original.delete(job.at);
        if (wasWater && TERRAIN[to].land && !world.owner[job.at]) world.claim(job.at, job.nation);
        eng.jobs.delete(job.id);
        world.emit("terrain_built", { at: job.at, to: TERRAIN[to].name, nation: job.nation, recipe: job.recipe });
      }
    }
  }
}

function payFor(n, cost) {
  const entries = Object.entries(cost);
  if (!entries.every(([k, v]) => (k === "money" ? n.money ?? 0 : n.stock?.[k] ?? 0) >= v)) return false;
  for (const [k, v] of entries) { if (k === "money") n.money -= v; else n.stock[k] -= v; }
  return true;
}

export function restoreRecipe(world, i) {
  const r = world.eng.rules, was = world.eng.original.get(i);
  if (was === undefined || was === world.terrain[i]) return null;
  const cls = CLASS_OF[TERRAIN[was].name], hp = cls ? r.baseHp[cls] : r.baseHp.made, money = r.chargeCost.money ?? 0;
  return { to: was, cost: { money: Math.ceil(hp / r.blastPower) * money * (r.restoreShare ?? 1) }, work: hp };
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

export function installDigging(world, { rules: g = ENG_RULES, scale = 1 } = {}) {
  const eng = installEngineering(world, {
    baseHp: g.baseHp, digRate: g.digRate, blastPower: g.blastPower, chargeCost: { money: g.chargeCost }, rebuildRate: g.rebuildRate,
    workRadius: g.workRadius, recipes: Object.fromEntries(Object.entries(g.recipes).map(([k, r]) => [k, { ...r, cost: { money: r.cost } }])),
    idleSeconds: g.idleSeconds, warnAt: g.warnAt, restoreShare: g.restoreShare, maxCrew: g.maxCrew, maxJobs: g.maxJobs,
    tunnelCost: g.tunnelCost, tunnelWork: g.tunnelWork, maxTunnel: g.maxTunnel, graphEvery: g.graphEvery, bombDamage: g.bombDamage, bombRoads: g.bombRoads, shellDamage: g.shellDamage,
  });
  eng.scale = scale;
  const crews = { at: -1, byNation: new Map() };
  const each = () => world.soldiers?.rules?.troopsEach ?? rules.soldiers?.troopsEach ?? 10;
  const refresh = () => {
    if (crews.at === world.time) return;
    crews.at = world.time;
    crews.byNation.clear();
    for (const s of world.stacks.values()) {
      const k = Math.floor((s.mix?.engineer ?? 0) / each());
      if (k > 0) (crews.byNation.get(s.owner) ?? crews.byNation.set(s.owner, []).get(s.owner)).push([s.pos, k]);
    }
    for (const u of world.units?.list.values() ?? []) {
      const d = UNIT_TYPES[u.type]?.dig;
      if (d && !u.wreck && !u.air) (crews.byNation.get(u.owner) ?? crews.byNation.set(u.owner, []).get(u.owner)).push([u.at, d]);
    }
  };
  eng.fresh = () => { crews.at = -1; };
  eng.crewOf = (nid, i) => {
    refresh();
    let k = 0;
    for (const [at, n] of crews.byNation.get(nid) ?? []) if (world.grid.cheb(at, i) <= eng.rules.workRadius) k += n;
    return Math.min(eng.rules.maxCrew ?? Infinity, k);
  };
  eng.roadAt = i => (world.log?.road[i] ?? 0) > 0;
  eng.roadCut = (i, level = 0) => setRoad(world, i, level);
  eng.apply = (i, tid) => {
    const was = world.terrain[i], passable = t => (TERRAIN[t].land ? isLand(t) : "water");
    if (world.res) setTerrain(world, i, tid);
    else world.terrain[i] = tid;
    if (passable(was) !== passable(tid)) eng.graphStale = true;
  };
  eng.graphAt = -Infinity;
  const graphs = w => {
    if (!eng.graphStale || w.time - eng.graphAt < (eng.rules.graphEvery ?? 0)) return;
    eng.graphStale = false;
    eng.graphAt = w.time;
    w.coarse = null;
    if (w.units) w.units.water = null;
  };
  if (world.bld) (world.bld.extra ??= {}).eng = () => encodeEng(world);
  const tick = (w, dt) => { tickEngineering(w, dt); graphs(w); if (eng.changed) { eng.changed = false; eng.version++; w.bld?.changed.add("eng"); } };
  world.hooks.postTick.push(tick);
  return eng;
}

export function digOrder(world, nid, m) {
  const eng = world.eng, n = world.nations.get(nid), g = world.grid;
  if (!eng?.crewOf) return { error: "engineering is not running in this world" };
  if (!Number.isInteger(m.at) || m.at < 0 || m.at >= g.size) return { error: "that plot is off the map" };
  eng.fresh?.();
  const mine = [...eng.jobs.values()].filter(j => j.nation === nid), here = mine.find(j => j.at === m.at);
  if (m.op === "cancel") {
    if (!here) return { error: "no work of yours there" };
    eng.jobs.delete(here.id);
    eng.changed = true;
    return { ok: true };
  }
  if (world.lockReason?.(nid, "engineer", "units")) return { error: world.lockReason(nid, "engineer", "units") };
  if (m.op === "dig" || m.op === "charge") {
    let job = here?.kind === "dig" ? here : null;
    if (here && !job) return { error: "your engineers are already building there" };
    if (m.op === "charge" && (n.money ?? 0) < (eng.rules.chargeCost.money ?? 0)) return { error: `a charge costs ${eng.rules.chargeCost.money} gold` };
    if (!job) {
      if (mine.length >= (eng.rules.maxJobs ?? Infinity)) return { error: `at most ${eng.rules.maxJobs} works at a time` };
      const r = startJob(world, nid, m.at, "dig");
      if (r.error) return r;
      job = r.job;
      const owner = world.owner[m.at];
      if (owner && owner !== nid) world.emit("terrain_dug", { at: m.at, by: nid, nation: owner });
    }
    if (m.op === "charge") {
      const c = addCharge(world, job.id, n);
      if (c.error) return { error: `a charge costs ${eng.rules.chargeCost.money} gold` };
    }
    return { ok: true, ...jobInfo(world, job) };
  }
  if (m.op === "build") {
    if (here) return { error: "your engineers are already working there" };
    if (mine.length >= (eng.rules.maxJobs ?? Infinity)) return { error: `at most ${eng.rules.maxJobs} works at a time` };
    if (typeof m.recipe !== "string" || (m.recipe !== "restore" && !recipeOf(world, m.recipe))) return { error: "pick something to build" };
    const owner = world.owner[m.at];
    if (owner && owner !== nid) return { error: "build terrain on your own land, or on land nobody holds" };
    const recipe = m.recipe === "restore" ? restoreRecipe(world, m.at) : recipeOf(world, m.recipe);
    if (recipe && (n.money ?? 0) < (recipe.cost.money ?? 0)) return { error: `it costs ${recipe.cost.money} gold` };
    const r = startJob(world, nid, m.at, "build", { recipe: m.recipe });
    if (r.error) return r;
    return { ok: true, ...jobInfo(world, r.job), cost: recipe?.cost.money ?? 0 };
  }
  if (m.op === "tunnel") return tunnelOrder(world, nid, m, here, mine);
  return { error: "dig, charge, build, tunnel or cancel" };
}

export function tunnelPlan(world, nid, from, to) {
  const g = world.grid, r = world.eng.rules;
  if (!Number.isInteger(to) || to < 0 || to >= g.size) return { error: "the far end is off the map" };
  const line = roadLine(g.w, [from, to]), plots = line.slice(1, -1);
  if (plots.length < 1) return { error: "a tunnel needs rock between its two ends" };
  if (plots.length > r.maxTunnel) return { error: `a tunnel runs at most ${r.maxTunnel} plots` };
  for (const end of [from, to]) {
    if (!isLand(world.terrain[end]) || terrainClass(world, end) === "rock") return { error: "each end must be on open land outside the rock" };
    if (world.owner[end] !== nid) return { error: "both ends must be on your land" };
  }
  for (const i of plots) {
    const cls = terrainClass(world, i);
    if ((cls !== "rock" && cls !== "hard") || !isLand(world.terrain[i])) return { error: `a tunnel goes through hills and mountains, not ${TERRAIN[world.terrain[i]].name.replace(/_/g, " ")}` };
    const o = world.owner[i];
    if (o && o !== nid && !world.hostile(nid, o)) return { error: "the tunnel would pass under land of someone you are not at war with" };
    if (world.log?.road[i]) return { error: "a road or tunnel is already there" };
  }
  return { plots, cost: plots.length * r.tunnelCost, seconds: null };
}

function tunnelOrder(world, nid, m, here, mine) {
  const eng = world.eng, n = world.nations.get(nid), r = eng.rules;
  if (world.lockReason?.(nid, "engineering_vehicle", "units")) return { error: world.lockReason(nid, "engineering_vehicle", "units") };
  if (here) return { error: "your engineers are already working there" };
  if (mine.length >= (r.maxJobs ?? Infinity)) return { error: `at most ${r.maxJobs} works at a time` };
  const plan = tunnelPlan(world, nid, m.at, m.to);
  if (plan.error) return plan;
  if (!(eng.crewOf(nid, m.at) > 0)) return { error: "no engineers beside the tunnel's mouth" };
  if ((n.money ?? 0) < plan.cost) return { error: `the tunnel costs ${plan.cost} gold` };
  n.money -= plan.cost;
  const job = { id: eng.next++, nation: nid, at: m.at, to: m.to, kind: "tunnel", recipe: null, plots: plan.plots, k: 0, done: 0, engineers: eng.crewOf(nid, m.at), charges: 0, since: world.time ?? 0 };
  eng.jobs.set(job.id, job);
  eng.changed = true;
  for (const o of new Set(plan.plots.map(i => world.owner[i]).filter(o => o && o !== nid))) world.emit("terrain_dug", { at: plan.plots.find(i => world.owner[i] === o), by: nid, nation: o, tunnel: true });
  world.emit("engineering_started", { nation: nid, at: m.at, kind: "tunnel" });
  return { ok: true, ...jobInfo(world, job), cost: plan.cost };
}

export function jobInfo(world, job) {
  const eng = world.eng, r = eng.rules, crew = eng.crewOf ? eng.crewOf(job.nation, job.at) : job.engineers;
  if (job.kind === "tunnel") {
    const left = (job.plots.length - job.k) * r.tunnelWork - job.done;
    return { job: job.id, kind: "tunnel", plots: job.plots.length, opened: job.k, crew, seconds: crew ? Math.ceil(left / (r.rebuildRate * crew)) : null };
  }
  if (job.kind === "dig") {
    const road = eng.roadAt?.(job.at), hp = road ? eng.roadHp.get(job.at) ?? r.baseHp.made : hpOf(world, job.at), max = road ? r.baseHp.made : maxHp(world, job.at);
    return { job: job.id, kind: "dig", target: road ? "road" : TERRAIN[world.terrain[job.at]].name, hp: Math.ceil(hp), max, crew, seconds: crew ? Math.ceil(Math.max(0, hp - r.blastPower * job.charges) / (r.digRate * crew)) : null };
  }
  const recipe = job.recipe === "restore" ? restoreRecipe(world, job.at) : recipeOf(world, job.recipe);
  return { job: job.id, kind: "build", recipe: job.recipe, done: Math.floor(job.done), work: recipe?.work ?? 0, crew, seconds: crew && recipe ? Math.ceil((recipe.work - job.done) / (r.rebuildRate * crew)) : null };
}

export function engView(world) {
  const eng = world.eng;
  if (!eng) return null;
  const hp = [], roads = [], jobs = [];
  for (const [i, v] of eng.hp) hp.push([i, Math.ceil(v), maxHp(world, i)]);
  for (const [i, v] of eng.roadHp) roads.push([i, Math.ceil(v)]);
  for (const j of eng.jobs.values()) jobs.push([j.at, j.nation, j.kind === "dig" ? 0 : j.kind === "tunnel" ? 2 : 1, j.recipe, j.engineers, Math.floor(j.done), ...(j.kind === "tunnel" ? [j.to, j.k, j.plots.length] : [])]);
  return { hp, roads, jobs, dug: [...eng.original.entries()] };
}

export function takeEngNews(world) {
  const eng = world.eng;
  if (!eng || eng.sent === eng.version) return false;
  eng.sent = eng.version;
  return true;
}

export function encodeEng(world) {
  const eng = world.eng;
  const body = JSON.stringify({ v: 1, hp: [...eng.hp], roads: [...eng.roadHp], original: [...eng.original], jobs: [...eng.jobs.values()], next: eng.next });
  return new TextEncoder().encode(body);
}

export function restoreEng(world, bytes) {
  const eng = world.eng;
  if (!eng || !bytes?.length) return 0;
  const d = JSON.parse(new TextDecoder().decode(bytes));
  for (const [i, v] of d.hp ?? []) eng.hp.set(i, v);
  for (const [i, v] of d.roads ?? []) eng.roadHp.set(i, v);
  for (const [i, v] of d.original ?? []) eng.original.set(i, v);
  for (const j of d.jobs ?? []) eng.jobs.set(j.id, j);
  eng.next = Math.max(eng.next, d.next ?? 1);
  return eng.hp.size + eng.jobs.size;
}
