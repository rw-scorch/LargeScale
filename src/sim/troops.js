import unitData from "../../data/units.json" with { type: "json" };
import rules from "../../data/rules.json" with { type: "json" };
import { unitTable, mixTotal, levelOf, powerOf } from "../shared/units.js";

export const UNITS = unitTable(unitData.units);
export const TROOP_RULES = { xpLevels: [0, 0.3, 1, 3], xpBonus: [0, 0.1, 0.2, 0.35], ...rules.troops };

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

export function installTroops(world, { units = UNITS, rules: r = TROOP_RULES } = {}) {
  if (world.troops) return world.troops;
  world.troops = { units, rules: r };
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
