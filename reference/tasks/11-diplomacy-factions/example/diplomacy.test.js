import test from "node:test";
import assert from "node:assert/strict";
import { Diplomacy, wireToWorld } from "./diplomacy.js";
import { World } from "../../03-nations-territory/example/territory.js";
import { checkVictory } from "../../04-combat-bots/example/bots.js";
import { TID } from "../../../shared/terrain.js";

test("war starts only after the notice period", () => {
  const d = new Diplomacy();
  assert.equal(d.declareWar(1, 2, 0), null);
  assert.equal(d.hostile(1, 2, 100), false);
  assert.equal(d.hostile(1, 2, 300), true);
  assert.equal(d.declareWar(1, 2, 400), "already at war");
});

test("treaties block war and breaking them costs a cooldown", () => {
  const d = new Diplomacy();
  const { proposal } = d.propose(1, 2, "non_aggression", 0, { minutes: 30 });
  assert.equal(d.accept(2, proposal.id, 10), null);
  assert.equal(d.declareWar(1, 2, 60), "a non-aggression treaty is in force");
  assert.equal(d.breakTreaty(1, 2, 100), null);
  assert.match(d.declareWar(1, 2, 200), /broke a treaty/);
  assert.equal(d.declareWar(1, 2, 100 + 900), null);
});

test("peace needs a war that has run for a while", () => {
  const d = new Diplomacy();
  d.declareWar(1, 2, 0);
  d.status(1, 2, 300);
  assert.equal(d.propose(1, 2, "peace", 400).error, "the war is too young for peace talks");
  const { proposal } = d.propose(1, 2, "peace", 1000);
  d.accept(2, proposal.id, 1001);
  assert.equal(d.status(1, 2, 1002), "peace");
});

test("factions are automatically allied, defend each other and count as one winner", () => {
  const d = new Diplomacy();
  const { faction } = d.createFaction(1, "North");
  const { proposal } = d.propose(1, 2, "faction_invite", 0);
  assert.equal(d.accept(2, proposal.id, 1), null);
  assert.equal(d.status(1, 2, 2), "alliance");
  assert.equal(d.declareWar(1, 2, 3), "cannot declare war on your own faction");
  assert.equal(d.declareWar(3, 2, 10), null);
  assert.equal(d.status(3, 1, 400), "war");
  const map = { w: 10, h: 10, terrain: new Uint8Array(100).fill(TID.grassland) };
  const w = new World(map);
  [1, 2, 3].forEach(i => w.addNation({ name: "N" + i }));
  w.nations.get(3).alive = false;
  assert.deepEqual(checkVictory(w, id => d.winnerKey(id)), { winner: faction });
});

test("embargo is one-way and alliances open borders in the world", () => {
  const d = new Diplomacy();
  d.setEmbargo(1, 2, true);
  assert.equal(d.blocksTransit(1, 2), true);
  assert.equal(d.blocksTransit(2, 1), false);
  const map = { w: 10, h: 10, terrain: new Uint8Array(100).fill(TID.grassland) };
  const w = new World(map);
  wireToWorld(w, d);
  const { proposal } = d.propose(1, 2, "alliance", 0);
  d.accept(2, proposal.id, 1);
  assert.equal(w.passable(1, 2), true);
  assert.equal(w.hostile(1, 2), false);
});
