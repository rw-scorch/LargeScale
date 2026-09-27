import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops, trainTick } from "../src/sim/troops.js";
import { addBuilding, setOwner } from "../src/sim/buildings.js";
import { installConstruction, place, demolish, bulkUpgrade } from "../src/sim/construction.js";
import { installResources, productionTick } from "../src/sim/resources.js";
import { installRoads } from "../src/sim/logistics.js";
import { installStores, sync, putInto, storesOf, setStore, storesTick, storesWhole, encodeStores, restoreStores, logisticsView, homeOf, STORE_RULES } from "../src/sim/stores.js";
import { runOrder } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";
import rules from "../data/rules.json" with { type: "json" };

const R = STORE_RULES;

function field() {
  const W = 80, H = 20, terrain = new Uint8Array(W * H).fill(TID.grassland);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  installConstruction(w);
  installRoads(w, { rules: rules.roads });
  installResources(w, undefined, { rng: makeRng(3), hook: false });
  installStores(w);
  const g = w.grid, a = w.addNation({ name: "A", human: true }), b = w.addNation({ name: "B", human: true });
  w.spawn(a, 3, 10);
  w.spawn(b, 70, 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 60 ? a : b);
  const n = w.nations.get(a), nb = w.nations.get(b);
  Object.assign(n, { troops: 3000, money: 5000, era: "T", stock: { food: 300, wood: 200 } });
  Object.assign(nb, { troops: 3000, money: 5000, era: "T", stock: {} });
  const hut = addBuilding(w, { type: "chieftain_hut", owner: a, anchor: g.idx(2, 9), state: "active", progress: 1 });
  const bhut = addBuilding(w, { type: "chieftain_hut", owner: b, anchor: g.idx(72, 9), state: "active", progress: 1 });
  sync(w, n);
  sync(w, nb);
  w.events.length = 0;
  const yard = (x, y = 9, owner = a) => {
    const s = addBuilding(w, { type: "storage_yard", owner, anchor: g.idx(x, y), state: "active", progress: 1 });
    w.stores.rescan = true;
    return s;
  };
  const run = s => { for (let t = 0; t < s; t++) w.tick(1); };
  return { w, g, a, b, n, nb, hut, bhut, yard, run };
}

const near = (x, y, eps = 1e-6) => Math.abs(x - y) < eps;

test("the store rules match rules.json, and a nation's old stock moves into its seat of government", () => {
  assert.deepEqual(STORE_RULES, { ...rules.stores });
  const { n, hut } = field();
  assert.deepEqual(hut.goods, { food: 300, wood: 200 });
  assert.deepEqual([n.stock.food, n.stock.wood], [300, 200], "the stock shown is the total across stores");
});

test("towns eat from every store in proportion, and gains with no place go to the seat, then to stores with room", () => {
  const { w, n, hut, yard } = field();
  const y = yard(40);
  sync(w, n);
  putInto(w, n, y, "food", 100);
  assert.equal(n.stock.food, 400);
  n.stock.food -= 40;
  sync(w, n);
  assert.ok(near(hut.goods.food, 270) && near(y.goods.food, 90), `hut ${hut.goods.food}, yard ${y.goods.food}`);
  n.stock.wood += 1250;
  sync(w, n);
  assert.deepEqual([hut.goods.wood, y.goods.wood], [1000, 450], "the hut fills to its 1,000 first, the rest goes to the yard");
  assert.equal(n.stock.wood, 1450);
});

test("producers deliver to their nearest store within 12 plots of travel, fill a buffer of 20 when none is in reach, and stop when full", () => {
  const { w, g, a, n, hut, yard } = field();
  const farm = addBuilding(w, { type: "crop_wheat", owner: a, anchor: g.idx(8, 9), state: "active", progress: 1 });
  const far = addBuilding(w, { type: "crop_wheat", owner: a, anchor: g.idx(30, 9), state: "active", progress: 1 });
  assert.equal(homeOf(w, farm), hut);
  assert.equal(homeOf(w, far), null, "28 plots away is out of reach");
  const food = hut.goods.food;
  productionTick(w, 100);
  assert.ok(hut.goods.food > food + 4, `the near farm filled the hut: ${(hut.goods.food - food).toFixed(1)} food`);
  assert.ok(far.held.food > 4 && w.stores.stuck.get(far.id) === "reach");
  productionTick(w, 1000);
  assert.equal(far.held.food, R.buffer, "the far farm keeps 20 and stops");
  assert.equal(logisticsView(w, n).stuck.find(s => s[0] === far.id)?.[1], "reach");
  const y = yard(28);
  w.stores.rescan = true;
  storesTick(w, R.every);
  assert.equal(homeOf(w, far), y);
  assert.ok(near(y.goods.food, R.buffer) && !far.held && !w.stores.stuck.has(far.id), "a new store in reach takes the buffer");
  putInto(w, n, hut, "food", 1000 - hut.goods.food);
  productionTick(w, 100);
  assert.equal(hut.goods.food, 1000);
  assert.equal(w.stores.stuck.get(farm.id), "full");
});

test("a site next to a store builds at once; a far site waits for carts, which carry 10 each in the Tribal era", () => {
  const { w, g, a, n, hut, run } = field();
  const wood = hut.goods.wood;
  const close = place(w, a, "watchtower_wood", g.idx(6, 12));
  assert.ok(!close.error && !close.need, "its store is in reach, so the wood is there");
  assert.equal(hut.goods.wood, wood - 15);
  const far = place(w, a, "watchtower_wood", g.idx(50, 9));
  assert.deepEqual(far.need, { wood: 15 });
  const carts = [...w.stores.convoys.values()];
  assert.deepEqual(carts.map(c => c.amount), [10, 5], "two hand carts");
  assert.equal(hut.goods.wood, wood - 30, "the goods left the store at once");
  assert.equal(n.stock.wood, wood - 30);
  assert.deepEqual(logisticsView(w, n).sites, [[far.id, { wood: 15 }, { wood: 15 }]]);
  run(31);
  assert.equal(close.state, "active");
  assert.equal(far.progress, 0, "the far site waits");
  run(40);
  assert.equal(w.stores.convoys.size, 0, "the carts arrived after about 48 plots");
  assert.ok(!far.need && far.progress > 0);
  run(31);
  assert.equal(far.state, "active");
  assert.equal(place(w, a, "watchtower_wood", g.idx(52, 9)).error === undefined, true);
  n.stock.wood = 0;
  hut.goods.wood = 0;
  n.stored.wood = 0;
  assert.match(place(w, a, "watchtower_wood", g.idx(54, 9)).error, /needs 15 wood, you have 0/);
});

test("a hostile stack next to carts takes their cargo into its own store", () => {
  const { w, g, a, b, n, nb, bhut } = field();
  place(w, a, "watchtower_wood", g.idx(50, 9));
  const c = [...w.stores.convoys.values()][0];
  const foe = w.createStack(b, g.idx(61, 9), 50);
  foe.pos = g.idx(g.x(c.pos), g.y(c.pos) + 1);
  const wood = bhut.goods.wood ?? 0;
  storesTick(w, 1);
  assert.equal(w.stores.convoys.size, 0, "both carts were beside it");
  assert.deepEqual(w.events.filter(e => e.type === "convoy_taken" && e.nation === a && e.by === b).map(e => e.amount), [10, 5]);
  assert.equal(bhut.goods.wood, wood + 15);
  assert.equal(nb.stock.wood, wood + 15);
  assert.equal(n.stock.wood, 185);
});

test("a store's Want brings goods from the nearest store with spare, Keep is never below Want, and goods do not bounce", () => {
  const { w, a, n, hut, yard, run } = field();
  const y = yard(40);
  w.stores.rescan = true;
  assert.deepEqual(setStore(w, a, y.id, "wood", 0, 40), { building: y.id, kind: "wood", keep: 40, want: 40 });
  assert.match(setStore(w, a, y.id, "wood", 5000, 0).error, /from 0 to 2000/);
  assert.match(setStore(w, a, 12345, "wood", 0, 0).error, /one of your stores/);
  run(R.every);
  assert.equal([...w.stores.convoys.values()].reduce((s, c) => s + c.amount, 0), 40, "four carts set off");
  run(60);
  assert.equal(y.goods.wood, 40);
  assert.equal(hut.goods.wood, 160);
  run(60);
  assert.equal(w.stores.convoys.size, 0, "nothing moves once the want is met");
  assert.deepEqual(runOrder(w, a, { t: "store", building: y.id, kind: "wood", keep: 10, want: 0 }), { t: "result", of: "store", ok: true, building: y.id, kind: "wood", keep: 10, want: 0 });
  assert.equal(n.stock.wood, 200);
});

test("capturing a store takes what is in it; demolishing one moves its goods to your other stores", () => {
  const { w, a, b, n, nb, hut, yard } = field();
  const y = yard(40);
  sync(w, n);
  putInto(w, n, y, "food", 100);
  const lost = demolish(w, a, y.id);
  assert.ok(!lost.error);
  sync(w, n);
  assert.ok(near(hut.goods.food, 400) && near(n.stock.food, 400), `the yard's food went to the hut: ${hut.goods.food}, ${n.stock.food}`);
  setOwner(w, hut, b);
  assert.ok(w.events.some(e => e.type === "store_captured" && e.nation === a && e.by === b && e.goods === 610), "400 food and 210 wood, with the yard's refund");
  sync(w, n);
  sync(w, nb);
  assert.ok(near(nb.stock.food, 400) && near(nb.stock.wood, 210), "B has A's food and wood");
  assert.equal(n.stock.food, 0);
  assert.equal(storesOf(w, a)[0].camp, true, "with no store left, A keeps a camp at its capital");
});

test("a nation with no store keeps goods at a camp, which a new store takes over", () => {
  const { w, g, a, n, hut, run } = field();
  demolish(w, a, hut.id);
  sync(w, n);
  const camp = storesOf(w, a)[0];
  assert.ok(camp.camp && near(camp.goods.food, 300) && near(n.stock.wood, 210), "the hut's goods, and half its wood back");
  const again = place(w, a, "chieftain_hut", g.idx(5, 5));
  assert.ok(!again.error, again.error);
  run(70);
  assert.equal(again.state, "active");
  run(1);
  assert.ok(!n.camp && near(again.goods.food, 300) && near(again.goods.wood, 190), JSON.stringify(again.goods));
});

test("training takes materials from the stores near the training buildings, and asks for more", () => {
  const { w, g, a, n, hut, yard } = field();
  addBuilding(w, { type: "war_camp", owner: a, anchor: g.idx(45, 9), state: "active", progress: 1 });
  n.drill = { keep: { spear_thrower: 100 } };
  trainTick(w, 60);
  assert.equal(n.drill.why, "no store within reach of your training buildings");
  const y = yard(44, 12);
  w.stores.rescan = true;
  trainTick(w, 60);
  assert.match(n.drill.why, /not enough gold or wood for spear throwers in the stores near your training buildings/);
  assert.ok(w.stores.asks.get(`${y.id}:wood`)?.amount >= 10, "the yard asks for wood");
  storesTick(w, R.every);
  assert.ok([...w.stores.convoys.values()].some(c => c.to === y.id && c.kind === "wood"), "a cart takes wood to it");
  sync(w, n);
  putInto(w, n, y, "wood", 50);
  const wood = hut.goods.wood;
  trainTick(w, 10);
  assert.ok((n.mix?.spear_thrower ?? 0) > 0, "spear throwers train from the yard's wood");
  assert.equal(hut.goods.wood, wood, "the hut, out of reach, gives nothing directly");
});

test("upgrades price materials from the building's own store and buy the rest", () => {
  const { w, g, a, n, hut } = field();
  n.era = "M";
  const wood = hut.goods.wood, money = n.money;
  const r = bulkUpgrade(w, a, [{ id: hut.id, civilian: false }]);
  assert.deepEqual(r.done, [hut.id]);
  assert.equal(hut.type, "great_hall");
  assert.equal(hut.goods.wood, wood - 60, "60 wood from its own store");
  assert.ok(money - n.money > 200 * 1.5, "stone it lacks is bought");
});

test("in catch-up, convoys arrive at once and waiting sites are fed without travel", () => {
  const { w, g, a } = field();
  const far = place(w, a, "watchtower_wood", g.idx(50, 9));
  assert.deepEqual(far.need, { wood: 15 });
  storesWhole(w, 600);
  assert.ok(!far.need && w.stores.convoys.size === 0);
});

test("stores, waiting sites and convoys survive a save", () => {
  const { w, g, a, hut } = field();
  const far = place(w, a, "watchtower_wood", g.idx(50, 9));
  const bytes = encodeStores(w), goods = { ...hut.goods };
  hut.goods = {};
  delete far.need;
  w.stores.convoys.clear();
  w.stores.sites.clear();
  assert.equal(restoreStores(w, bytes), 1);
  assert.deepEqual(hut.goods, goods);
  assert.deepEqual(far.need, { wood: 15 });
  assert.equal(w.stores.convoys.size, 2);
  w.tick(1);
  assert.ok([...w.stores.convoys.values()].every(c => c.path?.length > 30), "carts plan their way again after loading");
  assert.deepEqual([...encodeStores(w)].length > 0, true);
});
