import { complete, knownOf } from "./sim/research.js";
import { addUnits } from "./sim/troops.js";
import { giveMachine, UNIT_TYPES } from "./sim/units.js";
import { nextResearch, researchError } from "./shared/research.js";
import rules from "../data/rules.json" with { type: "json" };

export const ADMIN_RULES = rules.admin;
export const GIVE = ["money", "food", "wood", "stone", "clay", "troops", "unit", "machine"];

const fail = error => ({ ok: false, error });

function living(sim, id) {
  const n = Number.isInteger(id) ? sim.nations.get(id) : null;
  return n?.spawned && n.alive ? n : null;
}

export function parseSpeed(v) {
  return Number.isInteger(v) && v >= 1 && v <= ADMIN_RULES.maxSpeed ? v : null;
}

export function cleanName(v) {
  if (typeof v !== "string") return null;
  const name = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name.length >= 1 && name.length <= ADMIN_RULES.nameLength ? name : null;
}

export const ADMIN_OPS = {
  give(sim, m) {
    const n = living(sim, m.nation);
    if (!n) return fail("pick a living nation");
    if (!GIVE.includes(m.what)) return fail(`give one of ${GIVE.join(", ")}`);
    const amount = m.amount, most = ADMIN_RULES.maxGive;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > most) return fail(`the amount is a whole number from -${most} to ${most}, and not 0`);
    const done = now => ({ ok: true, nation: n.id, name: n.name, what: m.what, amount, now: Math.floor(now) });
    if (m.what === "troops") return done((n.troops = Math.max(0, n.troops + amount)));
    if (m.what === "machine") {
      if (!sim.units || typeof m.unit !== "string" || !Object.hasOwn(UNIT_TYPES, m.unit)) return fail("pick a machine");
      if (amount < 1 || amount > 10) return fail("give 1 to 10 machines at a time");
      const made = [];
      for (let k = 0; k < amount; k++) { const u = giveMachine(sim, n.id, m.unit); if (u) made.push(u.id); }
      return made.length ? { ...done(made.length), unit: m.unit, machines: made } : fail(`no room for a ${UNIT_TYPES[m.unit].name.toLowerCase()} near ${n.name}'s capital`);
    }
    if (m.what === "unit") {
      const now = addUnits(sim, n.id, m.unit, amount);
      return now === null ? fail("pick a troop type") : { ...done(now), unit: m.unit };
    }
    if (n.money === undefined) return fail(`${n.name} has no economy`);
    if (m.what === "money") return done((n.money = Math.max(0, n.money + amount)));
    return done((n.stock[m.what] = Math.max(0, (n.stock[m.what] ?? 0) + amount)));
  },
  finish(sim, m) {
    const n = living(sim, m.nation);
    if (!n) return fail("pick a living nation");
    if (!sim.research || !n.research) return fail(`${n.name} does not research`);
    const res = sim.research, done = [];
    for (let id; done.length < res.tree.nodes.length && (id = nextResearch(res.tree, res.locks, knownOf(n), n.era, n.research.queue));) {
      complete(sim, n, id);
      done.push(id);
    }
    const waiting = n.research.queue.length ? researchError(res.tree, res.locks, knownOf(n), n.era, n.research.queue[0]) : null;
    if (!done.length) return fail(waiting ? `nothing in the queue can be finished: ${waiting}` : `${n.name} has nothing queued`);
    return { ok: true, nation: n.id, name: n.name, done, era: n.era, waiting };
  },
};

export function runAdmin(sim, m) {
  const f = Object.hasOwn(ADMIN_OPS, m.op) ? ADMIN_OPS[m.op] : null;
  return f ? f(sim, m) : fail("unknown op");
}
