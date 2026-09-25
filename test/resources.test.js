import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { World } from "../src/sim/territory.js";
import { installConstruction, canPlace } from "../src/sim/construction.js";
import { installCivilians } from "../src/sim/civilians.js";
import { installResources, addProducer, produce, productionTick, encodeLand, restoreLand, takeTerrainNews, depletedPlots, DEPOSIT_IDS, DEPOSITS, RES_RULES } from "../src/sim/resources.js";
import { installBuildings, saveLayers, restoreLayers, WOOD_FULL } from "../src/sim/buildings.js";
import { encodeDeposits, decodeDeposits, cropDeposits, depositIndex, seasonAt, latitudeOf } from "../src/shared/deposits.js";
import { ClientWorld } from "../src/shared/client.js";
import { purseOf } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID, TERRAIN } from "../src/shared/terrain.js";
import data from "../data/buildings.json" with { type: "json" };

const code = id => DEPOSIT_IDS.indexOf(id) + 1;
const deposits = list => {
  const s = [...list].sort((a, b) => a[0] - b[0]);
  return { plots: Uint32Array.from(s, v => v[0]), type: Uint8Array.from(s, v => code(v[1])), amount: Float64Array.from(s, v => v[2]) };
};

function world(fill = "grassland", W = 40, H = 30) {
  const terrain = new Uint8Array(W * H).fill(TID[fill]);
  const w = new World({ w: W, h: H, terrain }, { spawnRadius: 8 });
  const a = w.addNation({ name: "A" });
  w.spawn(a, 20, 15);
  const n = w.nations.get(a);
  n.era = "M";
  return { w, a, n, g: w.grid };
}

test("deposit lists round trip, crop to a region and are found by binary search", () => {
  const dep = deposits([[5, "stone", 1200], [77, "fish", Infinity], [130, "iron", 7], [399, "oil", 5000]]);
  const back = decodeDeposits(encodeDeposits(dep));
  assert.deepEqual([...back.plots], [5, 77, 130, 399]);
  assert.deepEqual([...back.type], [...dep.type]);
  assert.equal(back.amount[1], Infinity);
  assert.equal(depositIndex(back, 130), 2);
  assert.equal(depositIndex(back, 131), -1);
  const crop = cropDeposits(back, 20, { x: 5, y: 3, w: 10, h: 10 });
  assert.deepEqual([...crop.plots], [(6 - 3) * 10 + (10 - 5)], "only plot 130 (x 10, y 6) is inside the box");
  assert.equal(crop.type[0], code("iron"));
});

test("the committed deposit files sit on the right terrain", () => {
  for (const dir of ["public/map", "public/map/fine"]) {
    const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8"));
    const terrain = gunzipSync(readFileSync(`${dir}/terrain.bin.gz`));
    const dep = decodeDeposits(gunzipSync(readFileSync(`${dir}/deposits.bin.gz`)));
    assert.ok(dep.plots.length > 50000, `${dir}: ${dep.plots.length}`);
    for (let k = 0; k < dep.plots.length; k += 97) {
      const id = DEPOSIT_IDS[dep.type[k] - 1];
      assert.ok(DEPOSITS[id].terrains.includes(TERRAIN[terrain[dep.plots[k]]].name), `${dir}: ${id} on ${TERRAIN[terrain[dep.plots[k]]].name}`);
      assert.ok(dep.plots[k] < meta.w * meta.h);
    }
  }
});

test("a quarry runs its deposit dry, the sprite state reaches the client, and the land row keeps it", () => {
  const { w, a, g } = world("hills");
  const at = g.idx(20, 15), next = g.idx(21, 15);
  installResources(w, deposits([[at, "stone", 20], [next, "stone", 30], [g.idx(5, 5), "stone", 99]]), { hook: false });
  const q = addProducer(w, a, "quarry", at);
  assert.ok(q.id, q.error);
  let stone = 0;
  for (let t = 0; t < 400; t++) stone += produce(w, 1).get(a)?.stone ?? 0;
  assert.ok(Math.abs(stone - 50) < 1e-6, `quarried ${stone}`);
  assert.equal(q.idle, true);
  const dry = w.events.filter(e => e.type === "deposit_depleted").map(e => e.at);
  assert.deepEqual(dry.sort((x, y) => x - y), [at, next].sort((x, y) => x - y), "nearest first, then the next plot of the vein");
  assert.deepEqual(depletedPlots(w).sort((x, y) => x - y), dry.sort((x, y) => x - y));
  assert.equal(canPlace(w, a, "clay_pit", g.idx(23, 17)), "must sit on a clay deposit");
  assert.equal(canPlace(w, a, "clay_pit", at), "something is already there");

  const client = new ClientWorld({ w: g.w, h: g.h, you: a, map: { kind: "test" }, hashes: {}, nations: [...w.nations.values()], defs: data.buildings, depositIds: DEPOSIT_IDS, depleted: [at] });
  client.setDeposits(w.res.dep);
  client.message({ t: "events", events: [{ type: "deposit_depleted", at: next }] });
  assert.deepEqual(client.depositKind(next), { id: "stone", depleted: true });
  assert.equal(client.depositAt(next), null);
  assert.equal(client.depositAt(g.idx(5, 5)), "stone");

  const land = encodeLand(w);
  const { w: w2 } = world("hills");
  installResources(w2, deposits([[at, "stone", 20], [next, "stone", 30], [g.idx(5, 5), "stone", 99]]), { hook: false });
  assert.deepEqual(restoreLand(w2, land), { edits: 0, mined: 2 });
  assert.deepEqual(depletedPlots(w2).sort((x, y) => x - y), [at, next].sort((x, y) => x - y));
});

test("a woodcutter clears the forest around it nearest first, and cleared land regrows", () => {
  const { w, a, g } = world("forest");
  installResources(w, undefined, { hook: false, rng: makeRng(9) });
  const camp = addProducer(w, a, "woodcutter_camp", g.idx(20, 15));
  assert.ok(camp.id, camp.error);
  let wood = 0;
  for (let t = 0; t < 1700; t++) wood += produce(w, 1).get(a)?.wood ?? 0;
  assert.ok(Math.abs(wood - 0.15 * 1700) < 0.2, `cut ${wood}`);
  const cleared = [...w.res.edits].filter(([, t]) => t === TID.cleared).map(([i]) => i);
  assert.ok(cleared.length >= 1);
  assert.ok(cleared.every(i => g.cheb(i, camp.anchor) <= 1), "nearest plots go first");
  const news = takeTerrainNews(w);
  assert.equal(news.length, cleared.length * 2);
  assert.ok(w.bld.changed.has("wood") && w.bld.changed.has("land"));

  const saved = saveLayers(w, true);
  const { w: w2 } = world("forest");
  installBuildings(w2);
  restoreLayers(w2, { wood: saved.wood });
  installResources(w2, undefined, { hook: false });
  assert.equal(restoreLand(w2, saved.land).edits, cleared.length);
  for (const i of cleared) assert.equal(w2.terrain[i], TID.cleared);

  w.bld.list.clear();
  w.bld.at.clear();
  w.res.rules.regrowPerMinute = 0.5;
  for (let t = 0; t < 400; t++) productionTick(w, 60);
  const back = cleared.filter(i => TERRAIN[w.terrain[i]].forest);
  assert.ok(back.length === cleared.length, `${back.length} of ${cleared.length} plots regrew`);
  assert.ok(back.every(i => w.res.wood[i] === WOOD_FULL), "regrown forest fills up again");
});

test("seasons follow latitude, and winter farms make much less", () => {
  const S = 6 * 3600, winter = 3 * S + 10;
  assert.equal(seasonAt(winter, 50, S), "winter");
  assert.equal(seasonAt(winter, -35, S), "summer", "the south is the other way round");
  assert.ok(["summer", "dry"].includes(seasonAt(winter, 5, S)));
  assert.equal(seasonAt(S + 1, 50, S), "summer");
  const earth = { kind: "earth", north: 84, south: -60, srcH: 1440 };
  assert.ok(Math.abs(latitudeOf(earth, 1440, 0, 3600) - 83.95) < 1e-9);
  assert.ok(Math.abs(latitudeOf({ ...earth, kind: "crop", rect: { x: 0, y: 100, w: 10, h: 10 } }, 10, 0, 10) - 73.95) < 1e-9);

  const { w, a, g } = world("plains");
  let time = S + 1;
  installResources(w, undefined, { hook: false, seasonOf: i => seasonAt(time, 50, S) });
  addProducer(w, a, "crop_wheat", g.idx(20, 15));
  const summer = produce(w, 100).get(a).food;
  time = winter;
  const cold = produce(w, 100).get(a).food;
  assert.ok(Math.abs(summer - 0.04 * 100 * 1.1 * 1.2) < 1e-9);
  assert.ok(Math.abs(cold / summer - 0.2 / 1.2) < 1e-9, `winter makes ${(cold / summer).toFixed(2)} of summer`);
});

test("output follows staffing, with a floor, and producers give the town jobs", () => {
  const { w, a, n, g } = world("plains");
  installConstruction(w);
  installCivilians(w, makeRng(2));
  installResources(w, undefined, { hook: false });
  addProducer(w, a, "crop_wheat", g.idx(20, 15));
  n.money = 0;
  n.stats = { worked: 0.5 };
  assert.ok(Math.abs(produce(w, 10).get(a).food - 0.04 * 10 * 1.1 * 1.2 * 0.5) < 1e-9);
  n.stats = { worked: 0 };
  assert.ok(Math.abs(produce(w, 10).get(a).food - 0.04 * 10 * 1.1 * 1.2 * RES_RULES.minWorkforce) < 1e-9, "a new nation never deadlocks");
  w.tick(5);
  assert.equal(n.stats.jobs, 1, "the field's worker counts as a job");
  productionTick(w, 5);
  assert.ok(purseOf(n).making.food > 0);
});

test("producer placement gives a readable reason for each rule", () => {
  const { w, a, g } = world("grassland");
  for (let x = 0; x < 40; x++) w.terrain[g.idx(x, 20)] = TID.mountain;
  w.terrain[g.idx(18, 15)] = TID.desert;
  installResources(w, deposits([[g.idx(19, 20), "iron", 500], [g.idx(26, 12), "fish", Infinity]]), { hook: false });
  w.terrain[g.idx(26, 12)] = TID.shallows;
  const why = (type, x, y) => canPlace(w, a, type, g.idx(x, y));
  assert.equal(why("quarry", 20, 12), "must sit on a stone deposit");
  assert.equal(why("mine_pit", 20, 20), "must sit on an ore deposit");
  assert.equal(why("mine_pit", 19, 20), null, "mines may sit on mountains");
  assert.equal(why("woodcutter_camp", 20, 12), "needs forest within 3 plots");
  w.terrain[g.idx(23, 12)] = TID.forest;
  assert.equal(why("woodcutter_camp", 20, 12), null);
  assert.equal(why("crop_wheat", 18, 15), "the soil is too poor to farm");
  assert.equal(why("pasture_sheep", 18, 15), "needs grassland");
  assert.equal(why("fishing_hut", 20, 10), "needs fishing water within 2 plots");
  assert.equal(why("fishing_hut", 25, 11), null);
  assert.equal(why("crop_wheat", 20, 20), "the ground is too rough to build on");
});
