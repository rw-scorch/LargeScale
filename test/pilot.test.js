import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat, stackPower, COMBAT } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings } from "../src/sim/buildings.js";
import { installMachines, spawnUnit, UNIT_TYPES } from "../src/sim/units.js";
import { installPilot, takeControl, steer, pilotStep, pilotOf, pilotRows, takeShots, PILOT_RULES } from "../src/sim/pilot.js";
import { TID } from "../src/shared/terrain.js";

function world() {
  const W = 60, H = 30, terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = ((i / W) | 0) < 8 ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installMachines(w);
  installPilot(w);
  const g = w.grid, a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 10, 20);
  w.spawn(b, 50, 20);
  for (let y = 8; y < H; y++) for (let x = 0; x < 20; x++) w.claim(g.idx(x, y), a);
  for (let y = 8; y < H; y++) for (let x = 40; x < W; x++) w.claim(g.idx(x, y), b);
  for (const id of [a, b]) w.nations.get(id).troops = 20000;
  const run = (seconds, m) => { for (let t = 0; t < seconds; t += 0.05) { if (m) steer(w, a, m); pilotStep(w, 0.05); } };
  return { w, g, a, b, run };
}

test("a piloted company moves at its own speed, cannot go faster, and takes the land it walks into", () => {
  const { w, g, a, run } = world();
  assert.deepEqual(PILOT_RULES, { every: 50, sendEvery: 100, idle: 30, range: 2, reload: 1.2, bonus: 1.5, aimRadius: 1.2, followEvery: 1, turnRate: 2.5, inputsPerSecond: 30 });
  const s = w.createStack(a, g.idx(18, 20), 500);
  assert.equal(takeControl(w, a, "s", s.id).ok, true);
  assert.equal(s.order, "move");
  const troops = s.troops;
  run(2, { move: [5, 0] });
  const P = pilotOf(w, a);
  const speed = w.rules.stackSpeed * w.speedOf(s);
  assert.ok(Math.abs(P.x - (18.5 + speed * 2)) < 0.2, `two seconds at ${speed} plots a second: x ${P.x.toFixed(2)}`);
  assert.equal(s.pos, g.idx(Math.floor(P.x), 20), "the company stands where it is steered");
  assert.equal(w.owner[g.idx(20, 20)], a, "the unclaimed plot it walked into is taken");
  assert.ok(s.troops < troops, "taking land costs troops, as for any stack");
  s.path = [g.idx(19, 20)];
  const at = s.pos;
  w.tick(1);
  assert.equal(s.pos, at, "the normal stack movement leaves a piloted company alone");
});

test("a company cannot walk into the sea, and slides along the shore", () => {
  const { w, g, a, run } = world();
  const s = w.createStack(a, g.idx(10, 9), 300);
  takeControl(w, a, "s", s.id);
  run(3, { move: [0.7, -0.7] });
  const P = pilotOf(w, a);
  assert.ok(P.y >= 8, `never onto the water: y ${P.y.toFixed(2)}`);
  assert.ok(P.x > 11, `it slides east along the coast: x ${P.x.toFixed(2)}`);
  assert.equal(g.y(s.pos), 8);
});

test("a piloted company fires at the enemy nearest the aim, within range, once a reload", () => {
  const { w, g, a, b, run } = world();
  w.claim(g.idx(21, 20), b);
  const s = w.createStack(a, g.idx(19, 20), 1000), foe = w.createStack(b, g.idx(21, 20), 1000);
  takeControl(w, a, "s", s.id);
  const expect = COMBAT.lethality * stackPower(w, s) * PILOT_RULES.reload * PILOT_RULES.bonus;
  run(0.05, { move: [0, 0], aim: [21.5, 20.5], fire: true });
  assert.ok(Math.abs(foe.troops - (1000 - expect)) < 1e-6, `one shot takes ${expect.toFixed(1)} troops: ${foe.troops.toFixed(1)} left`);
  const shots = takeShots(w);
  assert.equal(shots.length, 1);
  assert.deepEqual(shots[0].slice(0, 6), [19.5, 20.5, 21.5, 20.5, 0, a]);
  run(1, { move: [0, 0], aim: [21.5, 20.5], fire: true });
  assert.equal(takeShots(w), null, "no second shot inside the reload");
  run(0.3, { move: [0, 0], aim: [21.5, 20.5], fire: true });
  assert.equal(takeShots(w)?.length, 1, "the next shot after the reload");
  w.claim(g.idx(26, 20), b);
  const far = w.createStack(b, g.idx(26, 20), 500);
  run(1.3, { move: [0, 0], aim: [26.5, 20.5], fire: true });
  assert.equal(far.troops, 500, "out of range: the shot misses");
  assert.equal(takeShots(w)[0][6], 0);
});

test("a ship turns and speeds up rather than strafing, stays on water, and fires shells", () => {
  const { w, g, a, b, run } = world();
  const ship = spawnUnit(w, a, "frigate", g.idx(10, 4));
  const foe = spawnUnit(w, b, "galley", g.idx(14, 4));
  assert.equal(takeControl(w, a, "m", ship.id).ok, true);
  run(1, { move: [0, -1] });
  const P = pilotOf(w, a);
  assert.ok(P.x > 10.6 && Math.abs(P.y - 4.5) < 0.05, `forward throttle sails along its heading: ${P.x.toFixed(2)}, ${P.y.toFixed(2)}`);
  run(0.5, { move: [1, 0] });
  assert.ok(P.heading > 1, `turning changes the heading: ${P.heading.toFixed(2)}`);
  run(6, { move: [0, -1] });
  assert.ok(P.y < 8, `never onto land: y ${P.y.toFixed(2)}`);
  assert.equal(w.terrain[ship.at], TID.ocean);
  const hp = foe.hp;
  P.reload = 0;
  steer(w, a, { move: [0, 0], aim: [g.x(foe.at) + 0.5, g.y(foe.at) + 0.5], fire: true });
  const d = Math.hypot(g.x(foe.at) + 0.5 - P.x, g.y(foe.at) + 0.5 - P.y);
  pilotStep(w, 0.05);
  if (d <= UNIT_TYPES.frigate.range + 0.5) assert.ok(foe.hp < hp, "a shell in range hits");
  assert.equal(takeShots(w)[0][4], 1, "machines fire shells");
  assert.equal(takeControl(w, a, "m", spawnUnit(w, a, "merchant_ship", g.idx(30, 4)).id).error, "boats and trade ships sail on their own");
});

test("the rest of the selection follows, and control ends when input stops", () => {
  const { w, g, a, b, run } = world();
  const lead = w.createStack(a, g.idx(10, 20), 300), f1 = w.createStack(a, g.idx(10, 22), 300), f2 = w.createStack(a, g.idx(8, 20), 300);
  assert.equal(takeControl(w, a, "s", lead.id, [f1.id, f2.id, 999]).followers, 2);
  run(4, { move: [1, 0] });
  for (let k = 0; k < 6; k++) { w.tick(0.5); pilotStep(w, 0.05); }
  assert.ok(g.x(f1.pos) > 11 && g.x(f2.pos) > 9, `followers walk after the leader: ${g.x(f1.pos)}, ${g.x(f2.pos)}`);
  assert.deepEqual(pilotRows(w).map(r => r.slice(0, 3)), [[0, lead.id, a]]);
  assert.equal(takeControl(w, b, "s", lead.id).error, "not your company");
  w.time += PILOT_RULES.idle + 1;
  pilotStep(w, 0.05);
  assert.equal(pilotOf(w, a), null, "idle for too long, it is handed back");
  assert.equal(lead.pilot, undefined);
  assert.equal(lead.order, "hold");
});
