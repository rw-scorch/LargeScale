import unitData from "../../data/units.json" with { type: "json" };
import rules from "../../data/rules.json" with { type: "json" };
import { unitTable, mixTotal, levelOf, powerOf } from "../shared/units.js";
import { ERA_NAMES, eraIdx } from "../shared/buildings.js";
import { nationBuildings } from "./buildings.js";

export const UNITS = unitTable(unitData.units);
export const TROOP_RULES = { xpLevels: [0, 0.3, 1, 3], xpBonus: [0, 0.1, 0.2, 0.35], trainEvery: 5, keepMax: 1000000, ...rules.troops };

function clean(h) {
  if (!h?.mix) return;
  for (const id in h.mix) if (!(h.mix[id] > 1e-6)) delete h.mix[id];
  if (!Object.keys(h.mix).length) h.mix = null;
}

function addMix(h, mix, k = 1) {
  if (!mix || !(k > 0)) return;
  h.mix ??= {};
  for (const id in mix) h.mix[id] = (h.mix[id] ?? 0) + mix[id] * k;
  clean(h);
}

function takeShare(from, share) {
  if (!from.mix || !(share > 0)) return null;
  const out = {};
  for (const id in from.mix) {
    out[id] = from.mix[id] * Math.min(1, share);
    from.mix[id] -= out[id];
  }
  clean(from);
  return out;
}

export const xpBonusOf = (s, r = TROOP_RULES) => r.xpBonus[levelOf(s.xp, r.xpLevels)] ?? 0;
export const xpLevelOf = (s, r = TROOP_RULES) => (s.xp ? levelOf(s.xp, r.xpLevels) : 0);

export function installTroops(world, { units = UNITS, rules: r = TROOP_RULES, speed = 1 } = {}) {
  if (world.troops) return world.troops;
  world.troops = { units, rules: r, speed, clock: 0 };
  const tick = (w, dt) => {
    const t = w.troops;
    t.clock += dt;
    while (t.clock >= r.trainEvery) {
      t.clock -= r.trainEvery;
      trainTick(w, r.trainEvery);
    }
  };
  tick.whole = (w, dt) => trainTick(w, dt);
  world.hooks.postTick.push(tick);
  const stat = (id, k) => units.table[id]?.[k] ?? 1;
  const human = nid => !!world.nations.get(nid)?.human;

  world.powerOf = (s, holding) => powerOf(units, s.troops, s.mix, holding ? "defence" : "attack", xpBonusOf(s, r));
  world.stackAttack = s => (!s.mix && !s.xp ? stat("levy", "attack") : world.powerOf(s, false) / Math.max(1e-9, s.troops));
  world.reserveStrength = n => powerOf(units, n.troops, n.mix, "defence");
  world.speedOf = s => {
    const base = s.speedMult ?? 1;
    if (!s.mix) return base * stat("levy", "speed");
    let slow = s.troops - mixTotal(s.mix) >= 0.5 ? stat("levy", "speed") : Infinity;
    for (const id in s.mix) if (s.mix[id] >= 0.5) slow = Math.min(slow, stat(id, "speed"));
    return base * (slow === Infinity ? 1 : slow);
  };
  world.advanceMultOf = s => {
    const base = s.speedMult ?? 1;
    if (!s.mix || !(s.troops > 0)) return base * stat("levy", "capture");
    let sum = Math.max(0, s.troops - mixTotal(s.mix)) * stat("levy", "capture");
    for (const id in s.mix) sum += s.mix[id] * stat(id, "capture");
    return (base * sum) / s.troops;
  };
  world.loseTroops = (s, n) => {
    const before = s.troops;
    s.troops -= n;
    if (s.mix && before > 0) {
      const k = Math.max(0, s.troops) / before;
      for (const id in s.mix) s.mix[id] *= k;
      clean(s);
    }
  };
  world.loseReserve = (n, amount) => {
    const before = n.troops;
    n.troops = Math.max(0, n.troops - amount);
    if (n.mix && before > 0) {
      const k = n.troops / before;
      for (const id in n.mix) n.mix[id] *= k;
      clean(n);
    }
  };
  world.gainXp = (s, amount) => {
    if (s && s.troops > 0 && amount > 0 && human(s.owner)) s.xp = (s.xp ?? 0) + amount / s.troops;
  };

  const create = world.createStack.bind(world);
  world.createStack = (nid, i, amount) => {
    const n = world.nations.get(nid), before = n?.troops ?? 0;
    const s = create(nid, i, amount);
    if (s && n.mix && before > 0) s.mix = takeShare(n, s.troops / before);
    return s;
  };

  const split = world.splitStack.bind(world);
  world.splitStack = (sid, amount) => {
    const s = world.stacks.get(sid), before = s?.troops ?? 0;
    const c = split(sid, amount);
    if (!c) return c;
    c.mix = before > 0 ? takeShare(s, c.troops / before) : null;
    return c;
  };

  const merge = world.mergeStacks.bind(world);
  world.mergeStacks = (aId, bId) => {
    const a = world.stacks.get(aId), b = world.stacks.get(bId), at = a?.troops ?? 0, bt = b?.troops ?? 0;
    if (!merge(aId, bId)) return false;
    addMix(a, b.mix);
    if (a.xp || b.xp) a.xp = ((a.xp ?? 0) * at + (b.xp ?? 0) * bt) / Math.max(1e-9, at + bt);
    return true;
  };

  const disband = world.disbandStack.bind(world);
  world.disbandStack = sid => {
    const s = world.stacks.get(sid), n = s && world.nations.get(s.owner), before = n?.troops ?? 0, st = s?.troops ?? 0, mix = s?.mix;
    if (!disband(sid)) return false;
    if (mix && st > 0) addMix(n, mix, (n.troops - before) / st);
    return true;
  };

  const discharge = world.dischargeStack.bind(world);
  world.dischargeStack = (sid, loss) => {
    const s = world.stacks.get(sid), st = s?.troops ?? 0, mix = s?.mix ? { ...s.mix } : null, n = s && world.nations.get(s.owner);
    const out = discharge(sid, loss);
    if (!out || !mix || !(st > 0)) return out;
    const used = st - out.left, share = used / st, kept = world.stacks.get(sid);
    if (kept) {
      kept.mix = {};
      for (const id in mix) kept.mix[id] = mix[id] * (1 - share);
      clean(kept);
    }
    if (used > 0) addMix(n, mix, share * (out.back / used));
    return out;
  };

  return world.troops;
}

export function unitLock(world, nid, id) {
  const n = world.nations.get(nid), d = Object.hasOwn(world.troops?.units.table ?? {}, id) ? world.troops.units.table[id] : null;
  if (!d || d.kind !== "troop" || id === "levy") return "not a troop type you can train";
  if (eraIdx(d.era) > eraIdx(n?.era ?? "T")) return `needs the ${ERA_NAMES[d.era]} era`;
  return world.lockReason?.(nid, id, "units") ?? null;
}

export function trainers(world, nid) {
  let rate = 0;
  const kinds = new Set();
  if (!world.bld) return { rate, kinds };
  for (const b of nationBuildings(world, nid)) {
    const d = world.bld.table[b.type];
    if (!d?.trains || b.state !== "active" || world.owner[b.anchor] !== nid) continue;
    rate += d.trains;
    kinds.add(b.type);
  }
  return { rate, kinds };
}

const costOf = (n, res) => (res === "money" ? n.money ?? 0 : n.stock?.[res] ?? 0);

export function trainTick(world, dt) {
  const t = world.troops, units = t.units;
  for (const n of world.nations.values()) {
    const keep = n.drill?.keep;
    if (!n.alive || !n.human || !keep || !Object.keys(keep).length) continue;
    const { rate, kinds } = trainers(world, n.id);
    const wants = [];
    let why = null;
    for (const d of units.troops) {
      const want = (keep[d.id] ?? 0) - (n.mix?.[d.id] ?? 0);
      if (!(want > 1e-9)) continue;
      const lock = unitLock(world, n.id, d.id);
      if (lock) { why ??= `${d.name}: ${lock}`; continue; }
      if (!d.builtAt.some(k => kinds.has(k))) { why ??= rate ? `${d.name} train only at a ${d.builtAt.map(k => world.bld.table[k]?.name.toLowerCase() ?? k).join(" or ")}` : "build a war camp to train soldiers"; continue; }
      wants.push([d, want]);
    }
    const budget = rate * dt * t.speed;
    let trained = 0;
    const total = wants.reduce((s, [, v]) => s + v, 0);
    for (const [d, want] of wants) {
      const levies = n.troops - mixTotal(n.mix);
      let k = Math.min(want, (budget * want) / total, levies);
      for (const [res, per] of Object.entries(d.cost)) if (per > 0) k = Math.min(k, costOf(n, res) / per);
      if (!(k > 1e-9)) { why ??= levies < 1 ? "no levies left at home to train" : `not enough ${Object.keys(d.cost).map(res => (res === "money" ? "gold" : res)).join(" or ")} for ${d.name.toLowerCase()}`; continue; }
      for (const [res, per] of Object.entries(d.cost)) {
        if (res === "money") n.money -= per * k;
        else n.stock[res] -= per * k;
      }
      n.mix ??= {};
      n.mix[d.id] = (n.mix[d.id] ?? 0) + k;
      trained += k;
    }
    n.drill.why = why;
    n.drill.trained = trained;
  }
}

export function setKeep(world, nid, keep) {
  const n = world.nations.get(nid), r = world.troops.rules, units = world.troops.units;
  if (!keep || typeof keep !== "object" || Array.isArray(keep)) return { error: "give keep: how many of each type to keep at home" };
  const entries = Object.entries(keep);
  if (!entries.length || entries.length > units.troops.length) return { error: "give from one type to all of them" };
  for (const [id, v] of entries) {
    const d = Object.hasOwn(units.table, id) ? units.table[id] : null;
    if (!d || d.kind !== "troop" || id === "levy") return { error: `${id} is not a troop type you can train` };
    if (!Number.isInteger(v) || v < 0 || v > r.keepMax) return { error: `keep a whole number from 0 to ${r.keepMax}` };
    const lock = v > 0 && unitLock(world, nid, id);
    if (lock) return { error: `${d.name}: ${lock}` };
  }
  n.drill ??= { keep: {} };
  for (const [id, v] of entries) {
    if (v) n.drill.keep[id] = v;
    else delete n.drill.keep[id];
  }
  return { keep: { ...n.drill.keep } };
}

export function armyView(world, n) {
  if (!n?.human || !world.troops) return null;
  const reserve = {};
  for (const id in n.mix ?? {}) reserve[id] = Math.floor(n.mix[id]);
  const rate = n.alive ? trainers(world, n.id).rate * world.troops.speed : 0;
  return { levies: Math.floor(n.troops - mixTotal(n.mix)), reserve, keep: { ...(n.drill?.keep ?? {}) }, rate, why: n.drill?.why ?? null };
}

export function addUnits(world, nid, id, amount) {
  const n = world.nations.get(nid), d = world.troops?.units.table[id];
  if (!n || d?.kind !== "troop") return null;
  if (id === "levy") {
    n.troops = Math.max(mixTotal(n.mix), n.troops + amount);
    return n.troops - mixTotal(n.mix);
  }
  const have = n.mix?.[id] ?? 0, delta = Math.max(-have, amount);
  n.mix ??= {};
  n.mix[id] = have + delta;
  n.troops = Math.max(0, n.troops + delta);
  const now = n.mix[id];
  clean(n);
  return now;
}
