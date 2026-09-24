import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../../03-nations-territory/example/territory.js";
import { installUnits, spawnUnit, orderUnit, stepUnits, embark, disembark, paradrop, landParatroopers, placeMine, triggerMines, visibleMines } from "./units.js";
import { makeRng } from "../../../shared/rng.js";
import { TID } from "../../../shared/terrain.js";

function islands() {
  const w0 = 80, h0 = 30, t = new Uint8Array(w0 * h0).fill(TID.ocean);
  for (let y = 5; y < 25; y++) { for (let x = 3; x < 25; x++) t[y * w0 + x] = TID.grassland; for (let x = 55; x < 77; x++) t[y * w0 + x] = TID.grassland; }
  const w = new World({ w: w0, h: h0, terrain: t }, { spawnRadius: 5 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" });
  w.spawn(a, 12, 15); w.spawn(b, 66, 15);
  for (let x = 3; x < 25; x++) w.claim(w.grid.idx(x, 15), a);
  installUnits(w);
  return { w, a, b };
}

test("ships sail on water only and carry troops across", () => {
  const { w, a, b } = islands();
  const g = w.grid;
  assert.equal(spawnUnit(w, a, "cog", g.idx(10, 15)), null);
  const ship = spawnUnit(w, a, "cog", g.idx(25, 15));
  const s = w.createStack(a, g.idx(24, 15), 150);
  assert.equal(embark(w, s.id, ship.id), null);
  assert.equal(ship.cargo.troops, 150);
  assert.equal(w.stacks.has(s.id), false);
  assert.equal(orderUnit(w, ship.id, g.idx(54, 12)), null);
  for (let i = 0; i < 40; i++) stepUnits(w, 1);
  assert.equal(ship.at, g.idx(54, 12));
  const res = disembark(w, ship.id, g.idx(55, 12));
  assert.ok(res.stack);
  assert.ok(Math.abs(res.stack.troops - (150 * 0.85 - 0.6)) < 1e-9);
  assert.equal(w.owner[g.idx(55, 12)], a);
});

test("landing on defended enemy land can fail", () => {
  const { w, a, b } = islands();
  const g = w.grid;
  w.nations.get(b).troops = 20000;
  const ship = spawnUnit(w, a, "galley", g.idx(54, 15));
  ship.cargo = { troops: 30, owner: a };
  const res = disembark(w, ship.id, g.idx(61, 15));
  assert.equal(res.error, "too far from the shore");
  w.claim(g.idx(55, 15), b);
  const r2 = disembark(w, ship.id, g.idx(55, 15));
  assert.ok(r2.lost > 0);
  assert.equal(w.owner[g.idx(55, 15)], b);
});

test("paratroopers respect range and troops, then capture their drop zone", () => {
  const { w, a } = islands();
  const g = w.grid;
  const plane = spawnUnit(w, a, "transport_plane", g.idx(10, 15));
  w.nations.get(a).troops = 1000;
  assert.equal(paradrop(w, plane.id, g.idx(40, 15), 100, makeRng(1)).error, "cannot drop on water");
  assert.equal(paradrop(w, plane.id, g.idx(60, 20), 300, makeRng(1)).error, "can carry 250");
  const d = paradrop(w, plane.id, g.idx(60, 20), 200, makeRng(1));
  assert.ok(d.due > 0);
  const s = landParatroopers(w, d);
  assert.ok(s.troops < 180);
  assert.equal(w.owner[g.idx(60, 20)], a);
});

test("mines hurt enemies, not owners, and only owners see them", () => {
  const { w, a, b } = islands();
  const g = w.grid;
  assert.equal(placeMine(w, a, g.idx(66, 15)), "only on your land or no-man's land");
  assert.equal(placeMine(w, a, g.idx(20, 15)), null);
  const own = w.createStack(a, g.idx(20, 15), 100);
  assert.equal(triggerMines(w).length, 0);
  const foe = w.createStack(b, g.idx(66, 15), 400);
  foe.pos = g.idx(20, 15);
  const hits = triggerMines(w);
  assert.equal(hits.length, 1);
  assert.equal(foe.troops, 300);
  assert.equal(own.troops, 100);
  assert.deepEqual(visibleMines(w, b), []);
});
