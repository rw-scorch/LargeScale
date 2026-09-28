import rules from "../../data/rules.json" with { type: "json" };
import { soldierCount, soldierTypes, troopsOfType, typedTroops } from "../shared/soldiers.js";

export const SOLDIER_RULES = { troopsEach: 10, fieldCap: 1000, maxCompanies: 100, spacing: 0.34, drawZoom: 14, drawArea: 900, ...rules.soldiers };

const human = (world, nid) => !!world.nations.get(nid)?.human;

export function fieldTroops(world, nid) {
  let t = 0;
  for (const s of world.stacks.values()) if (s.owner === nid) t += s.troops;
  for (const u of world.units?.list.values() ?? []) if (!u.wreck && u.cargo?.owner === nid) t += u.cargo.troops ?? 0;
  return t;
}

export function companiesOf(world, nid) {
  let k = 0;
  for (const s of world.stacks.values()) if (s.owner === nid) k++;
  return k;
}

export function fieldOf(world, nid) {
  const R = world.soldiers.rules;
  return { soldiers: soldierCount(fieldTroops(world, nid), R.troopsEach), cap: R.fieldCap, companies: companiesOf(world, nid), maxCompanies: R.maxCompanies, troopsEach: R.troopsEach };
}

export function fieldRoom(world, nid) {
  const R = world.soldiers.rules;
  return Math.max(0, R.fieldCap * R.troopsEach - fieldTroops(world, nid));
}

export function companyError(world, nid) {
  if (!world.soldiers || !human(world, nid)) return null;
  const R = world.soldiers.rules;
  return companiesOf(world, nid) >= R.maxCompanies ? `at most ${R.maxCompanies} companies in the field: join some together first` : null;
}

export function fieldError(world, nid) {
  if (!world.soldiers || !human(world, nid)) return null;
  const R = world.soldiers.rules;
  if (fieldRoom(world, nid) < world.rules.minStack) return `at most ${R.fieldCap.toLocaleString("en")} soldiers in the field: disband some or send them home`;
  return companyError(world, nid);
}

function clean(h) {
  if (!h.mix) return;
  for (const id in h.mix) if (!(h.mix[id] > 1e-6)) delete h.mix[id];
  if (!Object.keys(h.mix).length) h.mix = null;
}

function cut(world, s, take) {
  const each = world.soldiers.rules.troopsEach, have = new Map(soldierTypes(s.troops, s.mix, each));
  const mix = {};
  let amount = 0, levy = 0, soldiers = 0;
  for (const [id, want] of Object.entries(take)) {
    const n = Math.min(want, have.get(id) ?? 0);
    if (!(n > 0)) continue;
    const t = (troopsOfType(s.troops, s.mix, id) * n) / have.get(id);
    if (id === "levy") levy += t; else mix[id] = t;
    amount += t;
    soldiers += n;
  }
  return { mix, amount, levy, soldiers, total: [...have.values()].reduce((a, b) => a + b, 0) };
}

function splitOff(world, s, part) {
  const c = { ...s, id: world.nextStack++, troops: part.amount, path: [], route: null, via: null, progress: 0, order: "hold", engaged: false, board: null, sail: null, mix: Object.keys(part.mix).length ? part.mix : null };
  delete c.guard;
  s.troops -= part.amount;
  if (s.mix) {
    for (const id in part.mix) s.mix[id] -= part.mix[id];
    clean(s);
  }
  world.stacks.set(c.id, c);
  return c;
}

export function detachSoldiers(world, nid, picks) {
  const R = world.soldiers.rules, g = world.grid, out = [], fresh = [];
  let skipped = 0, error = null;
  for (const p of picks) {
    const s = world.stacks.get(p?.stack);
    if (!s || s.owner !== nid) { skipped++; error ??= "not your company"; continue; }
    if (s.sail) { skipped++; error ??= "that company is boarding a boat"; continue; }
    const part = cut(world, s, p.take ?? {});
    if (!part.soldiers) { skipped++; continue; }
    if (part.soldiers >= part.total || s.troops - part.amount < 0.5) { if (!out.includes(s.id)) out.push(s.id); continue; }
    const near = fresh.find(c => world.stacks.has(c.id) && g.cheb(c.pos, s.pos) <= 1);
    if (!near && companiesOf(world, nid) >= R.maxCompanies) { skipped++; error ??= `at most ${R.maxCompanies} companies in the field: join some together first`; continue; }
    const c = splitOff(world, s, part);
    if (near && world.mergeStacks(near.id, c.id)) continue;
    fresh.push(c);
    out.push(c.id);
  }
  return { stacks: out, skipped, error: out.length ? error : error ?? "no soldiers picked" };
}

export function trimField(world) {
  const R = world.soldiers.rules, cap = R.fieldCap * R.troopsEach, moved = new Map();
  for (const n of world.nations.values()) {
    if (!n.human || !n.alive) continue;
    let over = fieldTroops(world, n.id) - cap;
    if (over <= 0.5) continue;
    const list = [...world.stacks.values()].filter(s => s.owner === n.id).sort((a, b) => b.troops - a.troops);
    let back = 0;
    for (const s of list) {
      if (over <= 0.5) break;
      const k = Math.min(over, s.troops);
      for (const id in s.mix ?? {}) {
        n.mix ??= {};
        n.mix[id] = (n.mix[id] ?? 0) + (s.mix[id] * k) / s.troops;
      }
      n.troops += k;
      if (k >= s.troops - 0.5) world.stacks.delete(s.id);
      else world.loseTroops(s, k);
      over -= k;
      back += k;
    }
    if (back) moved.set(n.id, Math.round(back));
  }
  return moved;
}

export function installSoldiers(world, { rules: r = SOLDIER_RULES } = {}) {
  if (world.soldiers) return world.soldiers;
  world.soldiers = { rules: r };
  const create = world.createStack.bind(world);
  world.createStack = (nid, i, amount) => {
    if (human(world, nid)) {
      if (companiesOf(world, nid) >= r.maxCompanies) return null;
      amount = Math.min(amount, fieldRoom(world, nid));
    }
    return create(nid, i, amount);
  };
  const split = world.splitStack.bind(world);
  world.splitStack = (sid, amount) => {
    const s = world.stacks.get(sid);
    if (s && human(world, s.owner) && companiesOf(world, s.owner) >= r.maxCompanies) return null;
    return split(sid, amount);
  };
  return world.soldiers;
}

export { soldierCount, soldierTypes, typedTroops };
