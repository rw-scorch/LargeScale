import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { installLogistics, addNode, sendConvoy, stepConvoys, dispatch, roadMask, ROADS, supplyField, applySupply, supplySources } from "./logistics.js";
import { TID } from "../../../shared/terrain.js";

function land(w = 60, h = 20) {
  const map = { w, h, terrain: new Uint8Array(w * h).fill(TID.grassland) };
  const world = new World(map, { spawnRadius: 3 });
  const a = world.addNation({ name: "A" });
  world.spawn(a, 5, 10);
  for (let x = 0; x < w; x++) for (let y = 7; y <= 13; y++) world.claim(world.grid.idx(x, y), a);
  installLogistics(world);
  return { world, a };
}

function timeToArrive(world, c) {
  let t = 0;
  while (world.log.convoys.has(c.id) && t < 1000) { stepConvoys(world, 0.5); t += 0.5; }
  return t;
}

test("roads make convoys faster", () => {
  const { world, a } = land();
  const A = addNode(world, a, world.grid.idx(5, 10)), B = addNode(world, a, world.grid.idx(50, 10));
  A.stock.wood = 100;
  const slow = timeToArrive(world, sendConvoy(world, A, B, { wood: 10 }));
  for (let x = 5; x <= 50; x++) world.log.road[world.grid.idx(x, 10)] = ROADS.paved;
  const fast = timeToArrive(world, sendConvoy(world, A, B, { wood: 10 }));
  assert.ok(fast < slow * 0.4, `slow ${slow} fast ${fast}`);
  assert.equal(B.stock.wood, 20);
  assert.equal(A.stock.wood, 80);
});

test("dispatcher moves surplus to the node that wants it", () => {
  const { world, a } = land();
  const A = addNode(world, a, world.grid.idx(5, 10)), B = addNode(world, a, world.grid.idx(40, 10));
  A.stock.food = 100; A.keep.food = 20;
  B.want.food = 25;
  const sent = dispatch(world, a);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].cargo.food, 25);
  assert.equal(dispatch(world, a).length, 0);
  timeToArrive(world, sent[0]);
  assert.equal(B.stock.food, 25);
});

test("convoys entering hostile land are lost", () => {
  const { world, a } = land();
  const b = world.addNation({ name: "B" });
  world.nations.get(b).spawned = true;
  const A = addNode(world, a, world.grid.idx(5, 10)), B = addNode(world, a, world.grid.idx(40, 10));
  A.stock.wood = 10;
  const c = sendConvoy(world, A, B, { wood: 10 });
  for (let x = 20; x < 22; x++) for (let y = 0; y < 20; y++) world.claim(world.grid.idx(x, y), b);
  timeToArrive(world, c);
  assert.equal(B.stock.wood ?? 0, 0);
  assert.ok(world.events.some(e => e.type === "convoy_lost"));
});

test("road masks name the right autotile", () => {
  const { world } = land();
  const g = world.grid, r = world.log.road;
  r[g.idx(10, 10)] = r[g.idx(11, 10)] = r[g.idx(10, 11)] = ROADS.cobble;
  assert.equal(roadMask(world, g.idx(10, 10)), "road_cobble_ES");
  assert.equal(roadMask(world, g.idx(11, 10)), "road_cobble_W");
  r[g.idx(12, 12)] = ROADS.rail;
  assert.equal(roadMask(world, g.idx(12, 12)), "rail_dot");
});

test("stacks far from supply weaken, a supply stack fixes it", () => {
  const { world, a } = land();
  const depot = addNode(world, a, world.grid.idx(5, 10));
  depot.stock.food = 100;
  const s = world.createStack(a, world.grid.idx(5, 10), 200);
  s.pos = world.grid.idx(55, 10);
  let f = supplyField(world, a, supplySources(world, a));
  for (let i = 0; i < 60; i++) applySupply(world, a, f, 1);
  assert.ok(s.supplyMult < 1);
  assert.ok(s.troops < 200);
  const sup = world.createStack(a, world.grid.idx(5, 10), 20);
  sup.kind = "supply"; sup.supplies = 50; sup.pos = world.grid.idx(50, 10);
  f = supplyField(world, a, supplySources(world, a));
  applySupply(world, a, f, 1);
  assert.equal(s.supplyMult, 1);
});
