import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { installEngineering, startJob, addCharge, tickEngineering, hpOf, maxHp, damageState, BUILD_RECIPES } from "./engineering.js";
import { installCbd, setCentres, defenceMultiplier, attackMultiplier, installCombatHooks, strengthAt } from "./cbd.js";
import { TID, TERRAIN } from "../../../shared/terrain.js";

function world(t = "grassland") {
  const map = { w: 60, h: 40, terrain: new Uint8Array(2400).fill(TID[t]) };
  const w = new World(map, { spawnRadius: 6 });
  const a = w.addNation({ name: "A" });
  w.spawn(a, 20, 20);
  const n = w.nations.get(a);
  n.stock = { stone: 500, wood: 500 };
  n.money = 5000;
  installEngineering(w);
  return { w, a, n };
}

test("a mountain plot falls inside a minute, and charges make it quick", () => {
  const { w, a, n } = world();
  const at = w.grid.idx(22, 20);
  w.terrain[at] = TID.mountain;
  const { job } = startJob(w, a, at, "dig", { engineers: 2 });
  assert.ok(job);
  for (let i = 0; i < 6; i++) tickEngineering(w, 1);
  assert.equal(w.terrain[at], TID.mountain);
  assert.equal(damageState(w, at), "cracked");
  let seconds = 6;
  while (w.terrain[at] === TID.mountain && seconds < 90) { tickEngineering(w, 1); seconds++; }
  assert.ok(seconds <= 60, `took ${seconds} seconds`);
  assert.equal(w.terrain[at], TID.rubble);
  assert.ok(w.events.some(e => e.type === "terrain_broken"));
});

test("charges are bought with money, and a broke nation cannot place one", () => {
  const { w, a, n } = world();
  const at = w.grid.idx(21, 20);
  w.terrain[at] = TID.cliff;
  const { job } = startJob(w, a, at, "dig");
  assert.equal(addCharge(w, job.id, n).charges, 1);
  assert.equal(n.money, 5000 - 200);
  n.money = 10;
  assert.match(addCharge(w, job.id, n).error, /needs 200 money/);
});

test("engineers can build terrain back up from materials", () => {
  const { w, a, n } = world("swamp");
  const at = w.grid.idx(20, 22);
  const { job } = startJob(w, a, at, "build", { recipe: "causeway", engineers: 4 });
  assert.ok(job);
  for (let i = 0; i < 25; i++) tickEngineering(w, 1);
  assert.equal(TERRAIN[w.terrain[at]].name, "cleared");
  assert.equal(n.stock.stone, 500 - BUILD_RECIPES.causeway.cost.stone);
});

test("a destroyed route can be rebuilt later", () => {
  const { w, a, n } = world();
  const at = w.grid.idx(23, 20);
  w.terrain[at] = TID.hills;
  const { job } = startJob(w, a, at, "dig", { engineers: 10 });
  for (let i = 0; i < 200; i++) tickEngineering(w, 1);
  assert.equal(TERRAIN[w.terrain[at]].name, "scree");
  const back = startJob(w, a, at, "build", { recipe: "embankment", engineers: 10 });
  assert.equal(back.error, "cannot build embankment on scree");
  const level = startJob(w, a, at, "build", { recipe: "levelled_ground", engineers: 10 });
  assert.ok(level.job);
  for (let i = 0; i < 200; i++) tickEngineering(w, 1);
  assert.equal(TERRAIN[w.terrain[at]].name, "plains");
});

test("you cannot dig in the land of someone you are at peace with", () => {
  const { w, a } = world();
  const b = w.addNation({ name: "B" });
  w.spawn(b, 45, 20);
  w.hostile = () => false;
  w.terrain[w.grid.idx(45, 20)] = TID.hills;
  assert.equal(startJob(w, a, w.grid.idx(45, 20), "dig").error, "not at war with the owner");
  w.hostile = (x, y) => x !== y;
  assert.ok(startJob(w, a, w.grid.idx(45, 20), "dig").job);
});

test("a CBD makes nearby ground stronger to hold and easier to defend from", () => {
  const { w, a } = world();
  installCbd(w);
  const centre = w.grid.idx(20, 20);
  setCentres(w, [{ at: centre, owner: a, value: 1 }]);
  const close = strengthAt(w, a, w.grid.idx(21, 20));
  const mid = strengthAt(w, a, w.grid.idx(27, 20));
  const far = strengthAt(w, a, w.grid.idx(40, 20));
  assert.ok(close > mid && mid > far);
  assert.equal(far, 0);
  assert.ok(Math.abs(defenceMultiplier(w, a, centre) - 1.5) < 1e-9);
  assert.ok(Math.abs(attackMultiplier(w, a, centre) - 1.3) < 1e-9);
});

test("capture cost rises near the defender's CBD", () => {
  const { w, a } = world();
  const b = w.addNation({ name: "B" });
  w.spawn(b, 45, 20);
  installCbd(w);
  setCentres(w, [{ at: w.grid.idx(45, 20), owner: b, value: 1 }]);
  const plain = w.captureCost(w.grid.idx(50, 20), a);
  installCombatHooks(w);
  const guarded = w.captureCost(w.grid.idx(45, 20), a);
  assert.ok(guarded > plain * 1.4, `${guarded} vs ${plain}`);
});
