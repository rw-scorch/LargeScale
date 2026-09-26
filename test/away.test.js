import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBuildings, addBuilding } from "../src/sim/buildings.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources } from "../src/sim/resources.js";
import { installResearch, orderResearch, researchRate } from "../src/sim/research.js";
import { installEffects } from "../src/sim/effects.js";
import { installBots } from "../src/sim/bots.js";
import { planCatchUp, runCatchUp, startAway, endAway, recordAway, awaySummary, OFFLINE } from "../src/sim/offline.js";
import { runOrder } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

const RULES = { ...OFFLINE, ...rules.offline };

function town(seed = 5) {
  const W = 80, H = 50, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 12 });
  installCombat(w);
  installTroops(w);
  installBuildings(w);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, makeRng(seed));
  installResources(w, undefined, { rng: makeRng(seed + 1) });
  installResearch(w);
  installEffects(w);
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 20, 25);
  w.spawn(b, 60, 25);
  installBots(w, makeRng(seed + 2));
  w.tick(1);
  const n = w.nations.get(a), g = w.grid;
  runOrder(w, a, { t: "zone", zone: "res", x: 12, y: 16, w: 16, h: 8 });
  runOrder(w, a, { t: "zone", zone: "com", x: 12, y: 30, w: 16, h: 4 });
  for (let k = 0; k < 6; k++) addBuilding(w, { type: "crop_wheat", owner: a, anchor: g.idx(10 + 3 * k, 26), state: "active" });
  n.stock.wood = 600;
  n.stock.food = 300;
  for (const node of ["farming", "chieftains", "palisades"]) orderResearch(w, a, node);
  return { w, a, b, n };
}

const huts = (w, nid) => [...w.bld.list.values()].filter(x => x.owner === nid && x.civilian).length;
const close = (x, y, share) => Math.abs(x - y) <= share * Math.max(Math.abs(x), Math.abs(y), 1);

for (const [hours, steps] of [[0.5, 240], [1, 240], [3, 20]]) {
  test(`${hours * 60} minutes of catch-up in ${steps} steps gives the town what live play would`, () => {
    const live = town(), fast = town();
    for (let t = 0; t < hours * 3600; t++) live.w.tick(1);
    const owners = fast.w.owner.slice(), job = planCatchUp(hours * 3600, { ...RULES, catchupSteps: steps });
    const t0 = performance.now();
    runCatchUp(job, dt => fast.w.catchUp(dt), Infinity);
    const ms = performance.now() - t0;
    const L = live.n, F = fast.n;
    const seen = `live: ${Math.round(L.money)} gold, ${Math.round(L.pop)} people, ${huts(live.w, live.a)} town buildings, ${L.research.known.length} researched; catch-up in ${job.step} s steps (${ms.toFixed(0)} ms): ${Math.round(F.money)}, ${Math.round(F.pop)}, ${huts(fast.w, fast.a)}, ${F.research.known.length}`;
    assert.ok(close(L.money, F.money, 0.03), `gold within 3%. ${seen}`);
    assert.ok(close(L.pop, F.pop, 0.1), `people within 10%. ${seen}`);
    assert.ok(close(huts(live.w, live.a), huts(fast.w, fast.a), 0.15), `town buildings within 15%. ${seen}`);
    assert.equal(F.research.known.length, L.research.known.length, `the same research. ${seen}`);
    assert.ok(close(L.troops, F.troops, 0.05), `troops within 5%. ${seen}`);
    assert.deepEqual(fast.w.owner, owners, "nobody's land changes in a catch-up");
    console.log(seen);
  });
}

test("catch-up takes at most 240 steps however long the world slept, up to the cap", () => {
  assert.deepEqual([12, 72, 100].map(h => planCatchUp(h * 3600, RULES)).map(j => [j.steps, j.step, j.dropped]), [[240, 180, 0], [240, 1080, 0], [240, 1080, 28 * 3600]]);
  const short = planCatchUp(600, RULES);
  assert.deepEqual([short.steps, short.step], [10, 60], "a short sleep keeps one-minute steps");
});

test("an away player's nation makes 90%: gold, farm output and research", () => {
  const { w, n } = town();
  for (let t = 0; t < 30; t++) w.tick(1);
  const rate = () => { w.civ.clock = 0; const m = n.money; w.tick(1); return n.money - m; };
  const here = rate(), points = researchRate(w, n);
  startAway(w, n, Date.now(), RULES.offlineOutputShare);
  const away = rate();
  assert.ok(close(away, here * 0.9, 0.001), `gold ${here} a second here, ${away} away`);
  assert.ok(close(researchRate(w, n), points * 0.9, 0.001), "research");
  const made = () => { w.civ.clock = 0; w.res.clock = 4.99; w.tick(1); return n.made.food; };
  const farmsAway = made();
  endAway(n);
  const farmsHere = made();
  assert.ok(close(farmsAway, farmsHere * 0.9, 0.001), `farms ${farmsHere} here, ${farmsAway} away`);
});

test("the away record counts what happened, and the summary reports it", () => {
  const { w, a, b, n } = town();
  const t0 = Date.now() - 3 * 3600 * 1000;
  startAway(w, n, t0);
  startAway(w, w.nations.get(b), t0);
  recordAway(w, [
    { type: "plot_lost", nation: a, by: b, count: 1 }, { type: "plot_lost", nation: a, by: b, count: 1 }, { type: "plot_lost", nation: a, by: 9, count: 3 },
    { type: "built", nation: a, kind: "bank" }, { type: "civ_build", nation: a }, { type: "civ_build", nation: a }, { type: "civ_upgrade", nation: a },
    { type: "researched", nation: a, node: "farming" }, { type: "machine_built", nation: a, kind: "cannon" },
    { type: "stack_destroyed", nation: a }, { type: "machine_captured", nation: a, by: b, kind: "catapult" }, { type: "deposit_depleted", nation: a },
    { type: "plot_lost", nation: 42, by: a }, { type: "built", nation: b, kind: "school" },
  ]);
  runCatchUp(planCatchUp(3 * 3600, RULES), dt => w.catchUp(dt), Infinity);
  const s = awaySummary(w, n, Date.now(), RULES);
  assert.equal(s.seconds, 3 * 3600);
  assert.deepEqual(s.lost, { [b]: 2, 9: 3 });
  assert.deepEqual(s.built, { bank: 1 });
  assert.deepEqual([s.town, s.upgraded, s.stacksLost, s.depleted], [2, 1, 1, 1]);
  assert.deepEqual(s.researched, ["farming"]);
  assert.deepEqual(s.machines, { cannon: 1 });
  assert.deepEqual(s.machinesLost, { catapult: 1 });
  assert.ok(s.gold > 0 && s.pop[1] > s.pop[0], `the town grew: ${JSON.stringify(s)}`);
  assert.equal(s.share, 0.9);
  assert.deepEqual(awaySummary(w, w.nations.get(b), Date.now(), RULES).built, { school: 1 });
  startAway(w, n, Date.now() - 30 * 1000);
  n.away.log = {};
  assert.equal(awaySummary(w, n, Date.now(), RULES), null, "half a minute away with nothing lost says nothing");
  recordAway(w, [{ type: "plot_lost", nation: a, by: b, count: 1 }]);
  assert.deepEqual(awaySummary(w, n, Date.now(), RULES).lost, { [b]: 1 }, "but losing land always shows");
  endAway(n);
  assert.equal(n.away, undefined);
  assert.equal(n.outputMult, 1);
});
