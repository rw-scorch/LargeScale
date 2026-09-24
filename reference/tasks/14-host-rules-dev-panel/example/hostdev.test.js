import test from "node:test";
import assert from "node:assert/strict";
import { makeConfig, hostChange } from "./config.js";
import { StatStore } from "./devpanel.js";

test("config fills defaults and reports bad or unknown keys", () => {
  const { cfg, errors } = makeConfig({ maxPlayers: 12, bots: 5, colour: "red" });
  assert.equal(cfg.maxPlayers, 8);
  assert.equal(cfg.bots, 5);
  assert.equal(cfg.startEra, "T");
  assert.equal(errors.length, 2);
});

test("some settings lock once the world starts", () => {
  const { cfg } = makeConfig({});
  assert.equal(hostChange(cfg, "map", "earth", true), "that setting is fixed once the world starts");
  assert.equal(hostChange(cfg, "speed", 2, true), null);
  assert.equal(cfg.speed, 2);
  assert.equal(hostChange(cfg, "speed", 99, true), "bad value");
});

test("only admins can edit stats and every change is range checked", () => {
  const s = new StatStore({ units: { knight: { attack: 12, hp: 40, cost: { money: 60, iron: 5 } } } });
  assert.equal(s.apply({ id: "friend", admin: false }, [{ table: "units", id: "knight", field: "attack", value: 20 }]).error, "not allowed");
  const bad = s.apply({ id: "ryan", admin: true }, [{ table: "units", id: "knight", field: "attack", value: -3 }]);
  assert.equal(bad.error, "rejected");
  assert.equal(s.stats.units.knight.attack, 12);
  const ok = s.apply({ id: "ryan", admin: true }, [
    { table: "units", id: "knight", field: "attack", value: 15 },
    { table: "units", id: "knight", field: "cost", value: { money: 80 } },
  ]);
  assert.equal(ok.version, 2);
  assert.deepEqual(s.stats.units.knight.cost, { money: 80 });
  assert.equal(s.diffSince(1).length, 2);
});

test("undo restores the previous values", () => {
  const s = new StatStore({ terrain: { hills: { move: 1.8 } } });
  const admin = { id: "ryan", admin: true };
  s.apply(admin, [{ table: "terrain", id: "hills", field: "move", value: 3 }]);
  s.undo(admin);
  assert.equal(s.stats.terrain.hills.move, 1.8);
  assert.equal(s.undo(admin).error, "nothing to undo");
});
