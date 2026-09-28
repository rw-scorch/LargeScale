import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { addBuilding } from "../src/sim/buildings.js";
import { installConstruction, place } from "../src/sim/construction.js";
import { installResources } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installMachines, spawnUnit, saveMachines, restoreMachines, UNIT_TYPES } from "../src/sim/units.js";
import { installBoats } from "../src/sim/boats.js";
import { installStores, sync, encodeStores, restoreStores, logisticsView, convoyRow, storesWhole } from "../src/sim/stores.js";
import { installSeaRoutes, SEA_RULES } from "../src/sim/sea.js";
import { runOrder } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

function setup(W, H, isWater, ownerOf) {
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) terrain[i] = isWater(i % W, (i / W) | 0) ? TID.ocean : TID.grassland;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installConstruction(w);
  installRoads(w, { rules: rules.roads });
  installResources(w, undefined, { rng: makeRng(3), hook: false });
  installMachines(w);
  installBoats(w);
  installStores(w);
  installSeaRoutes(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 3, 10);
  const own = { a, b };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ownerOf(x, y); if (o && !isWater(x, y)) w.claim(g.idx(x, y), own[o]); }
  const n = w.nations.get(a);
  Object.assign(n, { troops: 3000, money: 5000, era: "T", stock: { food: 300, wood: 200 } });
  Object.assign(w.nations.get(b), { troops: 3000, money: 5000, era: "T", stock: {} });
  const hut = addBuilding(w, { type: "chieftain_hut", owner: a, anchor: g.idx(2, 9), state: "active", progress: 1 });
  const jetty = (x, y, owner = a) => addBuilding(w, { type: "jetty", owner, anchor: g.idx(x, y), plots: [g.idx(x, y)], state: "active", progress: 1 });
  sync(w, n);
  w.events.length = 0;
  const until = (done, most = 400) => { for (let k = 0; k < most; k++) { if (done()) return k; w.tick(1); } return -1; };
  return { w, g, a, b, n, hut, jetty, until, rescan: () => (w.stores.rescan = true) };
}

const islands = () => setup(100, 30, x => x >= 30 && x < 60, (x, y) => (x >= 92 && y >= 24 ? "b" : x < 30 || x >= 60 ? "a" : null));
const bay = () => setup(80, 40, (x, y) => x >= 20 && x < 60 && y < 30, () => "a");
const ships = w => [...w.units.list.values()].filter(u => u.type === SEA_RULES.ship && !u.wreck);

test("the merchant ship is a free machine nobody builds, and the sea rules come from rules.json", () => {
  const d = UNIT_TYPES.merchant_ship;
  assert.deepEqual([d.domain, d.cost, d.builtAt, d.freight, d.num], ["sea", {}, [], true, 23]);
  assert.deepEqual(SEA_RULES, rules.stores.sea);
});

test("a site across the water is fed by a merchant ship from your nearest port to the port nearest the site", () => {
  const { w, g, a, n, hut, jetty, until, rescan } = islands();
  const j1 = jetty(29, 15), j2 = jetty(60, 15);
  rescan();
  const wood = hut.goods.wood;
  const site = place(w, a, "watchtower_wood", g.idx(66, 15));
  assert.deepEqual(site.need, { wood: 15 });
  const carts = [...w.stores.convoys.values()];
  assert.deepEqual(carts.map(c => [c.amount, c.sea?.p1, c.sea?.p2]), [[10, j1.id, j2.id], [5, j1.id, j2.id]], "two carts, both going by sea");
  assert.equal(hut.goods.wood, wood - 15);
  assert.equal(logisticsView(w, n).bySea, 2);
  assert.ok(until(() => w.events.some(e => e.type === "convoy_sailed")) >= 0);
  const [ship] = ships(w);
  assert.ok(ship && carts.some(c => c.ship === ship.id && ship.freight === c.id), "the cart's goods are aboard a merchant ship");
  const row = convoyRow(w, carts.find(c => c.ship === ship.id));
  assert.equal(row[7], ship.id, "clients are told the cart is at sea");
  const took = until(() => !w.stores.convoys.size);
  assert.ok(took > 0, "the carts landed at the far jetty and reached the site");
  assert.ok(!site.need, "the site has its wood");
  assert.equal(ships(w).length, 0, "the ships are gone once they land");
  const sailed = w.events.find(e => e.type === "convoy_sailed");
  assert.ok(took < 60, `27 plots by land, 30 by sea and 6 by land; the ships sailed from plot ${g.x(sailed.at)} and all arrived ${took} s after that`);
});

test("goods go by sea only when the way by land is much longer", () => {
  const { w, g, a, jetty, rescan } = bay();
  const j1 = jetty(19, 5), j2 = jetty(60, 5);
  rescan();
  const across = place(w, a, "watchtower_wood", g.idx(66, 5));
  const sea = [...w.stores.convoys.values()].filter(c => c.to === across.id);
  assert.ok(sea.length && sea.every(c => c.sea?.p1 === j1.id && c.sea?.p2 === j2.id), "round the bay is over 110 plots; across it is much quicker");
  const bottom = place(w, a, "watchtower_wood", g.idx(40, 36));
  const land = [...w.stores.convoys.values()].filter(c => c.to === bottom.id);
  assert.ok(land.length && land.every(c => !c.sea), "to the bottom of the bay the land way is quicker than two ports and a crossing");
});

test("with one port, or ports on different seas, there is no sea route and the site waits", () => {
  const { w, g, a, jetty, rescan } = islands();
  jetty(29, 15);
  rescan();
  const site = place(w, a, "watchtower_wood", g.idx(66, 15));
  assert.deepEqual(site.need, { wood: 15 });
  assert.equal(w.stores.convoys.size, 0);
  for (let k = 0; k < 20; k++) w.tick(1);
  assert.equal(w.stores.convoys.size, 0, "it still waits");
});

test("a hostile warship near the route sinks the merchant ship and its cargo", () => {
  const { w, g, a, b, jetty, until, rescan } = islands();
  jetty(29, 15);
  jetty(60, 15);
  rescan();
  const site = place(w, a, "watchtower_wood", g.idx(66, 15));
  assert.ok(until(() => ships(w).length > 0) >= 0);
  const [ship] = ships(w);
  const cargo = [...w.stores.convoys.values()].find(c => c.ship === ship.id);
  assert.ok(spawnUnit(w, b, "frigate", g.idx(g.x(ship.at) + 2, g.y(ship.at))));
  assert.ok(until(() => w.events.some(e => e.type === "convoy_lost" && e.convoy === cargo.id), 60) >= 0, "the frigate sank it");
  const lost = w.events.find(e => e.type === "convoy_lost" && e.convoy === cargo.id);
  assert.deepEqual([lost.why, lost.by, lost.ship, lost.amount], ["sunk", b, true, Math.round(cargo.amount)]);
  assert.ok(w.units.list.get(ship.id)?.wreck, "the wreck stays for a while");
  assert.ok(site.need?.wood > 0, "the site still needs what went down");
});

test("a merchant ship at sea survives a save, and takes no orders", () => {
  const { w, g, a, jetty, until, rescan } = islands();
  jetty(29, 15);
  jetty(60, 15);
  rescan();
  const site = place(w, a, "watchtower_wood", g.idx(66, 15));
  assert.ok(until(() => ships(w).length === 2) >= 0);
  const [ship] = ships(w);
  const r = runOrder(w, a, { t: "machine", machine: ship.id, do: "move", to: g.idx(45, 5) });
  assert.match(r.error, /merchant ships sail on their own/);
  const stores = encodeStores(w), machines = JSON.parse(JSON.stringify(saveMachines(w)));
  w.stores.convoys.clear();
  w.units.list.clear();
  restoreMachines(w, machines);
  restoreStores(w, stores);
  assert.equal([...w.stores.convoys.values()].filter(c => c.ship).length, 2, "both carts are still at sea");
  assert.ok(until(() => !w.stores.convoys.size) > 0);
  assert.ok(!site.need);
  assert.equal(ships(w).length, 0);
});

test("in catch-up a cart at sea arrives at once and its ship is gone", () => {
  const { w, g, a, jetty, until, rescan } = islands();
  jetty(29, 15);
  jetty(60, 15);
  rescan();
  const site = place(w, a, "watchtower_wood", g.idx(66, 15));
  assert.ok(until(() => ships(w).length > 0) >= 0);
  storesWhole(w, 600);
  assert.equal(w.stores.convoys.size, 0);
  assert.equal(ships(w).length, 0);
  assert.ok(!site.need, "the site was fed");
});
