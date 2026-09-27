import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, stackPower } from "../src/sim/combat.js";
import { installGuard, guardTick, findThreats, GUARD } from "../src/sim/guard.js";
import { runOrder, ordersOf } from "../src/game.js";
import { TID } from "../src/shared/terrain.js";

function field() {
  const W = 60, H = 30, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installGuard(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 5, 15);
  w.spawn(b, 55, 15);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 30 ? a : b);
  Object.assign(w.nations.get(a), { troops: 8000 });
  Object.assign(w.nations.get(b), { troops: 8000 });
  return { w, g, a, b, n: w.nations.get(a) };
}

const goal = s => s.route?.goal ?? (s.path.length ? s.path[s.path.length - 1] : s.pos);
const run = (w, seconds) => { for (let t = 0; t < seconds; t++) w.tick(1); };

test("an idle guard stack goes to meet an enemy stack heading into your land, fights it, then goes back", () => {
  const { w, g, a, b } = field();
  const home = g.idx(10, 15), s = w.createStack(a, home, 3000);
  s.standing = "guard";
  const e = w.createStack(b, g.idx(40, 15), 600);
  assert.ok(w.orderMove(e.id, g.idx(8, 5), "move"));
  w.events.length = 0;
  guardTick(w);
  assert.equal(s.guard?.threat, e.id);
  assert.equal(w.owner[goal(s)], a, "it heads for where the enemy enters your land");
  const sent = w.events.find(ev => ev.type === "guard_sent");
  assert.deepEqual([sent.stack, sent.enemy, sent.troops], [s.id, b, 3000]);
  assert.deepEqual(ordersOf(w, a).find(o => o.id === s.id), { id: s.id, to: goal(s), only: null, standing: "guard", guarding: true });
  for (let t = 0; t < 300 && w.stacks.has(e.id); t++) w.tick(1);
  assert.ok(!w.stacks.has(e.id), "the enemy stack is destroyed");
  run(w, 4);
  assert.equal(s.guard, undefined);
  assert.ok(s.pos === home || goal(s) === home, "and the guard walks back to where it stood");
});

test("with Guard on, troops at home form a stack to meet a threat, keep a quarter home, and fold back without loss", () => {
  const { w, g, a, b, n } = field();
  n.guard = true;
  n.troops = Math.floor(w.maxTroops(n) * 0.9);
  const e = w.createStack(b, g.idx(31, 15), 900);
  w.claim(g.idx(31, 15), a);
  const home0 = n.troops;
  guardTick(w);
  const formed = [...w.stacks.values()].find(s => s.owner === a);
  assert.ok(formed?.standing === "guard" && formed.guard.formed && formed.guard.threat === e.id);
  const need = stackPower(w, e) * GUARD.ratio;
  assert.ok(formed.troops >= need / 1.1 - 1 && n.troops >= GUARD.keepHome * w.maxTroops(n) - 1, `${formed.troops} troops against a need of ${Math.round(need)}`);
  const e2 = w.createStack(b, g.idx(31, 25), 5000);
  w.claim(g.idx(31, 25), a);
  guardTick(w);
  guardTick(w);
  assert.ok(Math.abs(n.troops - GUARD.keepHome * w.maxTroops(n)) < 2, `a big threat takes home down to a quarter of the cap and no further: ${Math.round(n.troops)}`);
  w.stacks.delete(e2.id);
  for (const s of [...w.stacks.values()]) if (s.owner === a && s.id !== formed.id) { n.troops += s.troops; w.stacks.delete(s.id); }
  assert.ok(w.grid.dist(formed.pos, e.pos) <= 1, "formed on your land nearest the enemy");
  for (let t = 0; t < 300 && w.stacks.has(e.id); t++) w.tick(1);
  assert.ok(!w.stacks.has(e.id));
  const left = formed.troops, before = n.troops;
  run(w, 4);
  const out = [...w.stacks.values()].filter(s => s.owner === a).reduce((t, s) => t + s.troops, 0);
  assert.ok(n.troops + out >= before + left - 1, `nothing is lost: home ${Math.round(before)} and ${Math.round(left)} out became ${Math.round(n.troops)} home and ${Math.round(out)} out`);
  assert.ok(n.troops <= w.maxTroops(n) + 1 && (!out || n.troops >= w.maxTroops(n) - 1), "home fills to its cap, and only what does not fit stays out");
  for (const s of [...w.stacks.values()]) if (s.owner === a) w.stacks.delete(s.id);
  n.guard = false;
  w.createStack(b, g.idx(32, 16), 900);
  w.claim(g.idx(32, 16), a);
  guardTick(w);
  assert.ok(![...w.stacks.values()].some(s => s.owner === a), "with Guard off, home troops stay home");
});

test("an order you give a guarding stack takes it off guard duty; a hold stack is never sent", () => {
  const { w, g, a, b } = field();
  const s = w.createStack(a, g.idx(10, 15), 3000), still = w.createStack(a, g.idx(12, 15), 3000);
  s.standing = "guard";
  const e = w.createStack(b, g.idx(31, 15), 500);
  w.claim(g.idx(31, 15), a);
  guardTick(w);
  assert.equal(s.guard?.threat, e.id);
  assert.equal(still.guard, undefined, "a stack holding its ground stays put");
  assert.equal(runOrder(w, a, { t: "move", stack: s.id, to: g.idx(5, 5) }).ok, true);
  assert.equal(s.guard, undefined);
  guardTick(w);
  assert.equal(s.guard, undefined, "while it carries out your order, guard leaves it alone");
  assert.equal(runOrder(w, a, { t: "guard", home: "yes" }).error, "say whether troops at home guard your land");
  assert.deepEqual(runOrder(w, a, { t: "guard", home: true }), { t: "result", of: "guard", ok: true, home: true });
});

test("threats: a stack inside your land or headed into it, or advancing near your border; not one far away or at peace", () => {
  const { w, g, a, b } = field();
  const far = w.createStack(b, g.idx(55, 25), 500);
  const near = w.createStack(b, g.idx(33, 10), 500);
  w.orderAdvance(near.id);
  const inside = w.createStack(b, g.idx(33, 20), 400);
  w.claim(g.idx(33, 20), a);
  const headed = w.createStack(b, g.idx(45, 5), 300);
  w.orderMove(headed.id, g.idx(20, 5), "move");
  const found = new Map(findThreats(w, a).map(t => [t.s.id, t]));
  assert.ok(!found.has(far.id), "a stack far off in its own land is no threat");
  assert.ok(found.has(near.id), "an advance within reach of your border is");
  assert.ok(found.has(inside.id) && found.get(inside.id).at === inside.pos, "a stack on your land is met where it stands");
  assert.ok(found.has(headed.id) && w.owner[found.get(headed.id).at] === a, "a stack walking in is met where its path enters your land");
  w.hostile = (x, y) => x !== y && !(x === a && y === b) && !(x === b && y === a);
  assert.equal(findThreats(w, a).length, 0, "nations at peace are no threat");
});
