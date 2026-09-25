import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installConstruction } from "../src/sim/construction.js";
import { installEconomy } from "../src/sim/economy.js";
import { installCivilians, econTick, takeZoneNews } from "../src/sim/civilians.js";
import { ZONES } from "../src/sim/buildings.js";
import { runOrder, purseOf, publicEvents } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function setup() {
  const W = 60, H = 40, terrain = new Uint8Array(W * H).fill(TID.grassland);
  terrain[10 * W + 12] = TID.mountain;
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 8 });
  const a = w.addNation({ name: "A" }), b = w.addNation({ name: "B" }), bot = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 12, 12);
  w.spawn(b, 45, 12);
  w.spawn(bot, 30, 32);
  const rng = makeRng(3);
  installConstruction(w);
  installEconomy(w);
  installCivilians(w, rng);
  w.tick(0.01);
  return { w, a, b, bot, rng, g: w.grid, n: w.nations.get(a) };
}

const zone = (w, nation, z, x, y, wd, h) => runOrder(w, nation, { t: "zone", zone: z, x, y, w: wd, h });
const town = (w, nation) => { zone(w, nation, "res", 7, 7, 11, 6); zone(w, nation, "com", 7, 13, 11, 4); };
const huts = (w, nid) => [...w.bld.list.values()].filter(b => b.owner === nid && b.civilian);

test("the zone order paints only your own buildable land, and erases", () => {
  const { w, a, g } = setup();
  const r = zone(w, a, "res", 8, 8, 9, 9);
  assert.equal(r.ok, true);
  let own = 0;
  for (let y = 8; y < 17; y++) for (let x = 8; x < 17; x++) if (w.owner[g.idx(x, y)] === a && w.terrain[g.idx(x, y)] !== TID.mountain) own++;
  assert.equal(r.plots, own);
  assert.equal(w.bld.zone[g.idx(12, 10)], 0, "no zoning on a mountain");
  assert.equal(w.bld.zone[g.idx(30, 30)], 0);
  assert.equal(zone(w, a, "res", 8, 8, 9, 9).plots, 0, "painting the same zone again changes nothing");
  const pairs = takeZoneNews(w);
  assert.equal(pairs.length, r.plots * 2);
  assert.equal(zone(w, a, "none", 8, 8, 2, 2).plots, 4);
  assert.equal(w.bld.zone[g.idx(8, 8)], 0);
  assert.equal(zone(w, a, "mall", 8, 8, 2, 2).error, "unknown zone");
  assert.equal(zone(w, a, "res", 0, 0, 65, 2).error, "zone at most 64 by 64 plots at a time");
  assert.equal(zone(w, a, "res", 0, 0, 1.5, 2).error, "give x, y, w and h as whole numbers");
  assert.ok(w.bld.changed.has("zone"));
});

test("a zoned area fills with huts and grows while fed; starving empties it", () => {
  const { w, a, n } = setup();
  town(w, a);
  n.stock.wood = 400;
  for (let t = 0; t < 400; t++) { n.stock.food = 500; w.tick(1); }
  const fed = n.pop;
  assert.ok(huts(w, a).length >= 10, `huts ${huts(w, a).length}`);
  assert.ok(fed > 40, `population ${fed}`);
  n.stock.food = 0;
  for (let t = 0; t < 600; t++) w.tick(1);
  assert.ok(n.pop < fed * 0.3, `starving: ${Math.round(fed)} fell to ${Math.round(n.pop)}`);
  assert.ok(n.stats.foodSat < 0.01);
});

test("the town finds free plots from its zone sets, not by scanning the map", () => {
  const { w, a, n, rng } = setup();
  for (let y = 7; y < 17; y++) for (let x = 7; x < 12; x++) w.bld.zone[w.grid.idx(x, y)] = ZONES.res;
  n.stock.wood = 400;
  for (let t = 0; t < 10; t++) econTick(w, 5, rng);
  assert.equal(huts(w, a).length, 0, "zone written behind the town's back is not seen");
  zone(w, a, "res", 13, 7, 4, 10);
  for (let t = 0; t < 10; t++) econTick(w, 5, rng);
  assert.ok(huts(w, a).length >= 1);
  assert.ok(huts(w, a).every(h => w.grid.x(h.anchor) >= 13), "every hut is on the painted plots");
});

test("zones and buildings pass to the capturer, and the town keeps building for them", () => {
  const { w, a, b, g, rng } = setup();
  zone(w, a, "res", 9, 9, 6, 6);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) if (w.owner[g.idx(x, y)] === a) w.claim(g.idx(x, y), b);
  assert.equal(w.civ.zoned.get(a)[ZONES.res].size, 0);
  assert.ok(w.civ.zoned.get(b)[ZONES.res].size >= 30);
  const nb = w.nations.get(b);
  nb.stock.wood = 100;
  nb.stock.food = 100;
  econTick(w, 5, rng);
  assert.ok(huts(w, b).some(h => g.x(h.anchor) < 20), "B builds on the zones it took");
});

test("troop cap is land plus people, and money is 1 gold a second plus tax", () => {
  const { w, a, n } = setup();
  town(w, a);
  n.stock.wood = 400;
  for (let t = 0; t < 300; t++) { n.stock.food = 500; w.tick(1); }
  const r = w.rules;
  assert.ok(n.pop > 20);
  assert.ok(Math.abs(w.maxTroops(n) - (r.troopBase + r.troopPerPlot * n.plots + n.pop * 0.35)) < 1e-6);
  const before = n.money, pop = n.pop;
  w.tick(1);
  assert.ok(Math.abs(n.money - before - (1 + pop * 0.01)) < 0.05, `income ${n.money - before} with ${Math.round(pop)} people`);
  n.conscription = 0.5;
  assert.ok(Math.abs(w.maxTroops(n) - (r.troopBase + r.troopPerPlot * n.plots + n.pop * 0.5)) < 1e-6, "a per-nation share, ready for the slider");
});

test("bots keep simple troop growth with no economy", () => {
  const { w, bot } = setup();
  for (let t = 0; t < 20; t++) w.tick(1);
  const nb = w.nations.get(bot);
  assert.equal(nb.pop, undefined);
  assert.equal(nb.money, undefined);
  assert.equal(nb.stock, undefined);
  assert.equal(w.maxTroops(nb), w.rules.troopBase + w.rules.troopPerPlot * nb.plots);
});

test("the purse carries the town stats, and civilian building events stay private", () => {
  const { w, a, n } = setup();
  town(w, a);
  for (let t = 0; t < 60; t++) { n.stock.food = 500; w.tick(1); }
  const p = purseOf(n);
  assert.equal(p.town.pop, Math.round(n.pop));
  assert.ok(p.town.housing > 0 && p.town.needs > 0);
  assert.deepEqual(Object.keys(p.town.demand), ["res", "com", "ind"]);
  assert.ok(w.events.some(e => e.type === "civ_build"));
  assert.equal(publicEvents(w, w.events).filter(e => e.type.startsWith("civ_")).length, 0);
});
