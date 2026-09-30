import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBots } from "../src/sim/bots.js";
import { installDiplomacy, Diplomacy, DIPLO } from "../src/sim/diplomacy.js";
import { runOrder, victory, mostLand } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function world(income = 10) {
  const W = 80, H = 20, w = new World({ w: W, h: H, terrain: new Uint8Array(W * H).fill(TID.grassland) }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  const g = w.grid, ids = ["Ann", "Ben", "Cat"].map(name => w.addNation({ name }));
  ids.forEach((id, k) => w.spawn(id, k * 26 + 5, 10));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), ids[Math.min(2, Math.floor(x / 26))]);
  for (const id of ids) Object.assign(w.nations.get(id), { troops: 5000, money: 1000 });
  installDiplomacy(w, { incomeOf: () => income });
  installBots(w, makeRng(1));
  return { w, g, ids };
}
const run = (w, nid, m) => runOrder(w, nid, m);
const atWar = (w, a, b) => { run(w, a, { t: "diplo", op: "war", to: b }); w.time += DIPLO.warNotice + 1; w.tick(1); };

test("a player at war surrenders and becomes a vassal that follows its overlord", () => {
  const { w, ids: [a, b, c] } = world();
  assert.match(run(w, b, { t: "diplo", op: "surrender", to: a }).error, /only surrender in a war/);
  atWar(w, a, b);
  const offer = run(w, b, { t: "diplo", op: "surrender", to: a });
  assert.equal(offer.ok, true);
  assert.equal(run(w, a, { t: "diplo", op: "accept", id: offer.proposal }).signed, "surrender");
  w.tick(1);
  assert.ok(w.events.some(e => e.type === "surrendered" && e.a === b && e.b === a));
  assert.equal(w.dip.lordOf(b), a);
  assert.deepEqual([w.hostile(a, b), w.passable(b, a)], [false, true], "the war is over, and the vassal is allied to its overlord");
  assert.match(run(w, b, { t: "diplo", op: "war", to: c }).error, /a vassal cannot declare war/);
  assert.match(run(w, b, { t: "diplo", op: "propose", to: c, kind: "alliance" }).error, /a vassal leaves diplomacy to its overlord/);
  assert.match(run(w, c, { t: "diplo", op: "war", to: b }).error, /declare war on their overlord/);
  atWar(w, c, a);
  assert.equal(w.hostile(c, b), true, "a war on the overlord reaches the vassal");
  assert.equal(w.dip.winnerKey(b), w.dip.winnerKey(a));
});

test("a vassal pays a quarter of its income to its overlord, also in catch-up", () => {
  const { w, ids: [a, b] } = world(8);
  atWar(w, a, b);
  const offer = run(w, b, { t: "diplo", op: "surrender", to: a });
  run(w, a, { t: "diplo", op: "accept", id: offer.proposal });
  const [mb, ma] = [w.nations.get(b).money, w.nations.get(a).money];
  for (let k = 0; k < DIPLO.tributeEvery; k++) w.tick(1);
  const paid = w.nations.get(b).tributePaid;
  assert.ok(Math.abs(paid - 8 * DIPLO.tribute * DIPLO.tributeEvery) < 1e-6, `paid ${paid}`);
  assert.ok(Math.abs(w.nations.get(b).money - (mb - paid)) < 1e-6 && Math.abs(w.nations.get(a).money - (ma + paid)) < 1e-6);
  w.nations.get(b).money = 1e6;
  for (const h of w.hooks.postTick) if (h.whole && !h.live) h.whole(w, 600);
  assert.ok(Math.abs(w.nations.get(b).tributePaid - paid - 8 * DIPLO.tribute * 600) < 1e-6, "ten minutes away pay ten minutes of tribute");
  w.nations.get(b).money = 50;
  for (const h of w.hooks.postTick) if (h.whole && !h.live) h.whole(w, 600);
  assert.equal(w.nations.get(b).money, 0, "but never more gold than the vassal has");
});

test("an overlord sets a vassal free, and a fallen overlord frees it too", () => {
  const { w, ids: [a, b, c] } = world();
  atWar(w, a, b);
  run(w, a, { t: "diplo", op: "accept", id: run(w, b, { t: "diplo", op: "surrender", to: a }).proposal });
  assert.match(run(w, c, { t: "diplo", op: "free", to: b }).error, /not your vassal/);
  assert.equal(run(w, a, { t: "diplo", op: "free", to: b }).ok, true);
  assert.equal(w.dip.lordOf(b), null);
  assert.match(run(w, a, { t: "diplo", op: "war", to: b }).error, /treaty is in force/, "freedom comes with a short treaty");
  atWar(w, c, b);
  run(w, c, { t: "diplo", op: "accept", id: run(w, b, { t: "diplo", op: "surrender", to: c }).proposal });
  w.nations.get(c).alive = false;
  w.tick(1);
  assert.equal(w.dip.lordOf(b), null);
  assert.ok(w.events.some(e => e.type === "vassal_freed" && e.a === b && e.why === "fell"));
});

test("a vassal counts on its overlord's side for the win and for land", () => {
  const { w, ids: [a, b, c] } = world();
  atWar(w, a, b);
  run(w, a, { t: "diplo", op: "accept", id: run(w, b, { t: "diplo", op: "surrender", to: a }).proposal });
  assert.equal(victory(w), null, "Cat is still standing");
  Object.assign(w.nations.get(a), { plots: 100 });
  Object.assign(w.nations.get(b), { plots: 300 });
  Object.assign(w.nations.get(c), { plots: 350 });
  const end = mostLand(w);
  assert.deepEqual([end.winner, end.plots], [b, 400], "Ann's side has 400 plots, led on land by Ben");
  w.nations.get(c).alive = false;
  assert.deepEqual(victory(w), { winner: a, name: "Ann" });
});

test("an eliminated player commands a friend's nation until they resign or it falls", () => {
  const { w, ids: [a, b, c] } = world();
  assert.match(run(w, a, { t: "diplo", op: "command", to: b }).error, /still has a nation to run/);
  w.nations.get(b).alive = false;
  assert.match(run(w, b, { t: "diplo", op: "war", to: c }).error, /your nation has fallen/);
  const inv = run(w, a, { t: "diplo", op: "command", to: b });
  assert.equal(inv.ok, true);
  assert.equal(run(w, b, { t: "diplo", op: "accept", id: inv.proposal }).signed, "commander");
  assert.equal(w.dip.commanders.get(b), a);
  assert.deepEqual(w.dip.commandersOf(a), [b]);
  w.tick(1);
  assert.ok(w.events.some(e => e.type === "commander_joined" && e.a === b && e.b === a));
  assert.equal(run(w, b, { t: "diplo", op: "resign" }).ok, true);
  assert.equal(w.dip.commanders.size, 0);
  run(w, b, { t: "diplo", op: "accept", id: run(w, a, { t: "diplo", op: "command", to: b }).proposal });
  assert.match(run(w, c, { t: "diplo", op: "dismiss", to: b }).error, /not your commander/);
  w.nations.get(a).alive = false;
  w.tick(1);
  assert.equal(w.dip.commanders.size, 0);
  assert.ok(w.events.some(e => e.type === "commander_left" && e.a === b && e.why === "fell"));
});

test("vassals and commanders are saved", () => {
  const { w, ids: [a, b, c] } = world();
  atWar(w, a, b);
  run(w, a, { t: "diplo", op: "accept", id: run(w, b, { t: "diplo", op: "surrender", to: a }).proposal });
  w.nations.get(c).alive = false;
  run(w, c, { t: "diplo", op: "accept", id: run(w, a, { t: "diplo", op: "command", to: c }).proposal });
  const d = new Diplomacy().load(JSON.parse(JSON.stringify(w.dip.save())));
  assert.deepEqual([d.lordOf(b), d.commanders.get(c)], [a, a]);
  assert.deepEqual(d.view(w.time).vassals, [[b, a]]);
  assert.equal(d.status(b, a, w.time), "alliance");
});

test("the browser reads vassals, overlords and commanders like the server", async () => {
  const { ClientWorld } = await import("../src/shared/client.js");
  const { PROTOCOL } = await import("../src/shared/protocol.js");
  const buildingData = (await import("../data/buildings.json", { with: { type: "json" } })).default;
  const { w, g, ids: [a, b, c] } = world();
  atWar(w, a, b);
  run(w, a, { t: "diplo", op: "accept", id: run(w, b, { t: "diplo", op: "surrender", to: a }).proposal });
  atWar(w, c, a);
  const cw = new ClientWorld({ t: "hello", v: PROTOCOL, you: c, self: c, w: g.w, h: g.h, map: { kind: "test" }, hashes: {}, time: w.time, nations: [...w.nations.values()].map(o => ({ id: o.id, name: o.name })), defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] }, diplomacy: { ...w.dip.view(w.time), proposals: [] } });
  for (const [x, y] of [[b, a], [a, b], [c, b], [b, c], [a, c]]) assert.equal(cw.relation(x, y).status, w.dip.status(x, y, w.time), `${x} and ${y}`);
  assert.deepEqual([cw.relation(b, a).vassal, cw.relation(a, b).vassal, cw.relation(c, b).through], ["lord", "vassal", a]);
  assert.equal(cw.lordOf(b), a);
  assert.equal(cw.canAttack(c, b), true, "at war with the overlord, so with the vassal too");
  const cmd = new ClientWorld({ t: "hello", v: PROTOCOL, you: a, self: b, w: g.w, h: g.h, map: { kind: "test" }, hashes: {}, nations: [], defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] }, diplomacy: { base: "peace", rel: [], commanders: [[b, a]] } });
  assert.deepEqual([cmd.you, cmd.self, cmd.commandsOf(b)], [a, b, a]);
});
