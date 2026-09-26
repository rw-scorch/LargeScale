import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians, POLICY } from "../src/sim/civilians.js";
import { installResources } from "../src/sim/resources.js";
import { addBuilding } from "../src/sim/buildings.js";
import { runOrder, purseOf, vitalsOf } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function town(policy = null) {
  const W = 60, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 8 });
  const a = w.addNation({ name: "A" });
  w.spawn(a, 20, 20);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, makeRng(3));
  installResources(w, undefined, { rng: makeRng(4) });
  w.tick(0.01);
  const n = w.nations.get(a);
  if (policy) assert.equal(runOrder(w, a, { t: "policy", ...policy }).ok, true);
  runOrder(w, a, { t: "zone", zone: "res", x: 14, y: 14, w: 12, h: 5 });
  runOrder(w, a, { t: "zone", zone: "com", x: 14, y: 22, w: 12, h: 3 });
  return { w, a, n };
}

const grow = (w, n, seconds) => { for (let t = 0; t < seconds; t++) { n.stock.food = 500; n.stock.wood = 400; w.tick(1); } };

test("the policy order checks its values and the purse reports them", () => {
  const { w, a, n } = town();
  assert.deepEqual(purseOf(n).policy, { tax: 2, conscription: rules.civilians.conscriptShare }, "Normal tax and the old 35% by default");
  assert.equal(runOrder(w, a, { t: "policy" }).error, "set tax or army share");
  assert.equal(runOrder(w, a, { t: "policy", tax: 5 }).error, "tax is a step from 0 to 4");
  assert.equal(runOrder(w, a, { t: "policy", tax: 1.5 }).error, "tax is a step from 0 to 4");
  assert.equal(runOrder(w, a, { t: "policy", conscription: 0.7 }).error, "army share is from 10% to 60%");
  assert.equal(runOrder(w, a, { t: "policy", conscription: "lots" }).error, "army share is from 10% to 60%");
  const r = runOrder(w, a, { t: "policy", tax: 4, conscription: 0.52 });
  assert.deepEqual([r.ok, r.tax, r.conscription], [true, 4, 0.5], "army share snaps to 5% steps");
  assert.equal(n.taxLevel, 2);
  assert.deepEqual(purseOf(n).policy, { tax: 4, conscription: 0.5 });
  assert.equal(runOrder(w, w.addNation({ name: "B" }), { t: "policy", tax: 0 }).error, "spawn first");
});

test("higher tax pays more per person but people leave; no tax fills towns faster", () => {
  const normal = town(), high = town({ tax: 4 }), none = town({ tax: 0 });
  for (const t of [normal, high, none]) grow(t.w, t.n, 150);
  assert.ok(none.n.pop > normal.n.pop * 1.1, `after 150 s: no tax ${none.n.pop.toFixed(0)}, normal ${normal.n.pop.toFixed(0)}`);
  for (const t of [normal, high, none]) grow(t.w, t.n, 900);
  const [p1, p2] = [normal.n.pop, high.n.pop];
  assert.ok(p2 < p1 * 0.8, `settled: very high tax ${p2.toFixed(0)} people against ${p1.toFixed(0)}`);
  assert.ok(Math.abs(high.n.stats.mood - 0.7) < 1e-9 && normal.n.stats.mood === 1);
  const perPerson = t => (vitalsOf(t.w, t.n).income - rules.economy.baseIncome) / t.n.pop;
  assert.ok(Math.abs(perPerson(high) - 2 * perPerson(normal)) < 1e-3, `per person ${perPerson(high)} against ${perPerson(normal)}`);
  const before = none.n.money;
  none.w.tick(1);
  assert.ok(Math.abs(none.n.money - before - rules.economy.baseIncome) < 1e-9, "no tax leaves only the base gold");
});

test("a bigger army share raises the troop cap and takes workers from producers", () => {
  const sets = [0.1, null, 0.6].map(c => town(c === null ? null : { conscription: c }));
  for (const t of sets) {
    grow(t.w, t.n, 600);
    for (let k = 0; k < 30; k++) addBuilding(t.w, { type: "woodcutter_camp", owner: t.a, anchor: t.w.grid.idx(2 + k * 2, 36), state: "active" });
    grow(t.w, t.n, 5);
  }
  const [low, mid, high] = sets, n = mid.n;
  const cap0 = mid.w.maxTroops(n);
  runOrder(mid.w, mid.a, { t: "policy", conscription: 0.6 });
  assert.ok(Math.abs(mid.w.maxTroops(n) - cap0 - n.pop * 0.25) < 1e-6, `cap ${Math.round(cap0)} to ${Math.round(mid.w.maxTroops(n))} with ${Math.round(n.pop)} people`);
  runOrder(mid.w, mid.a, { t: "policy", conscription: 0.35 });
  assert.ok(low.n.pop === mid.n.pop && high.n.pop === mid.n.pop, "the same town in all three");
  const staffed = sets.map(t => t.n.stats.staff / t.n.stats.workers), worked = sets.map(t => t.n.stats.worked);
  assert.ok([1.25, 1, 0.75].every((v, i) => Math.abs(staffed[i] - v) < 1e-9), `staffing ${staffed}`);
  assert.ok(worked[1] < 1 && worked[0] > worked[1] && Math.abs(worked[2] / worked[1] - 0.75) < 1e-9, `producers staffed ${worked.map(v => v.toFixed(3))} at 10%, 35% and 60%`);
});

test("the policy rules are in rules.json", () => {
  assert.equal(POLICY.taxSteps.length, POLICY.taxNames.length);
  assert.equal(POLICY.taxSteps[2], 1, "the middle step is today's tax");
});
