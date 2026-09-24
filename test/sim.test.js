import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installBots, spawnBots, checkVictory } from "../src/sim/bots.js";
import { installCivilians, zonePlots, econTick } from "../src/sim/civilians.js";
import { installEngineering, startJob, tickEngineering } from "../src/sim/engineering.js";
import { createBook, list, buy, depth } from "../src/sim/orderbook.js";
import { Diplomacy, wireToWorld } from "../src/sim/diplomacy.js";
import { makeRng } from "../src/shared/rng.js";
import { makeTestMap } from "../src/shared/testmap.js";
import { TID, TERRAIN } from "../src/shared/terrain.js";
import { disc } from "../src/shared/grid.js";

function world(w = 120, h = 80) {
  const map = makeTestMap(w, h, 5);
  return new World(map, { spawnRadius: 5 });
}

test("the simulation modules load and run together in this layout", () => {
  const wo = world();
  const rng = makeRng(2);
  installCombat(wo);
  installBots(wo, rng);
  installCivilians(wo, rng);
  installEngineering(wo);
  const a = wo.addNation({ name: "A" });
  let spawned = false;
  for (let y = 5; y < 75 && !spawned; y += 3) for (let x = 5; x < 115 && !spawned; x += 3) spawned = wo.spawn(a, x, y);
  assert.ok(spawned);
  const n = wo.nations.get(a);
  n.stock = { food: 400, wood: 200 };
  n.money = 2000;
  zonePlots(wo, a, disc(wo.grid, wo.grid.x(n.capital), wo.grid.y(n.capital), 3), "res");
  for (let i = 0; i < 60; i++) { n.stock.food = 400; wo.tick(1); econTick(wo, 5, rng); }
  assert.ok(n.pop > 0, "civilians moved in");
  assert.ok(n.troops > 0);
});

test("a stack takes ground and bots grow beside it", () => {
  const wo = world();
  const rng = makeRng(4);
  installCombat(wo);
  installBots(wo, rng);
  const a = wo.addNation({ name: "A" });
  let spawned = false;
  for (let y = 5; y < 75 && !spawned; y += 3) for (let x = 5; x < 115 && !spawned; x += 3) spawned = wo.spawn(a, x, y);
  const before = wo.nations.get(a).plots;
  const s = wo.createStack(a, wo.nations.get(a).capital, 300);
  wo.orderAdvance(s.id);
  for (let i = 0; i < 60; i++) wo.tick(1);
  assert.ok(wo.nations.get(a).plots > before);
});

test("engineering, diplomacy and the market all work from src/sim", () => {
  const wo = world(60, 40);
  const dip = new Diplomacy();
  wireToWorld(wo, dip);
  installEngineering(wo);
  const a = wo.addNation({ name: "A" });
  let spawned = false;
  for (let y = 5; y < 35 && !spawned; y += 2) for (let x = 5; x < 55 && !spawned; x += 2) spawned = wo.spawn(a, x, y);
  const n = wo.nations.get(a);
  n.money = 1000;
  n.stock = { stone: 100 };
  const at = wo.nations.get(a).capital;
  wo.terrain[at] = TID.hills;
  const { job } = startJob(wo, a, at, "dig", { engineers: 3 });
  assert.ok(job);
  for (let i = 0; i < 40; i++) tickEngineering(wo, 1);
  assert.equal(TERRAIN[wo.terrain[at]].name, "scree");
  const book = createBook();
  const node = { id: 1, stock: { stone: 100 } };
  list(book, { id: a, money: 0 }, node, "stone", 50, 4, 0);
  const buyer = { id: 99, money: 500 };
  const res = buy(book, buyer, "stone", 20, 1, 0, new Map([[a, { id: a, money: 0 }]]));
  assert.equal(res.cost, 80);
  assert.equal(depth(book, "stone")[0].qty, 30);
  assert.equal(checkVictory(wo), null);
});
