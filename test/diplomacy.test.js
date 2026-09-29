import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBots } from "../src/sim/bots.js";
import { installDiplomacy, Diplomacy, DIPLO } from "../src/sim/diplomacy.js";
import { friendly } from "../src/sim/trade.js";
import { runOrder, publicEvents } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function world({ fresh = true } = {}) {
  const W = 60, H = 20, w = new World({ w: W, h: H, terrain: new Uint8Array(W * H).fill(TID.grassland) }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  const g = w.grid, a = w.addNation({ name: "Ann" }), b = w.addNation({ name: "Ben" }), c = w.addNation({ name: "Bot", bot: true });
  w.spawn(a, 5, 10);
  w.spawn(b, 30, 10);
  w.spawn(c, 50, 10);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), x < 20 ? a : x < 40 ? b : c);
  for (const id of [a, b, c]) w.nations.get(id).troops = 5000;
  installDiplomacy(w, { fresh });
  installBots(w, makeRng(1));
  return { w, g, a, b, c };
}

const run = (w, nid, m) => runOrder(w, nid, m);
const tickFor = (w, seconds) => { for (let t = 0; t < seconds; t++) w.tick(1); };

test("players start at peace, and bots stay open to attack without a declaration", () => {
  const { w, g, a, b, c } = world();
  assert.equal(w.hostile(a, b), false);
  assert.equal(w.hostile(a, c), true);
  assert.equal(w.hostile(c, a), false, "bots still never attack players");
  assert.match(run(w, a, { t: "attack", at: g.idx(30, 5) }).error, /at peace with Ben: declare war first/);
  assert.equal(run(w, a, { t: "attack", at: g.idx(50, 5) }).ok, true);
  assert.match(run(w, a, { t: "diplo", op: "war", to: c }).error, /bot: you attack bots without declaring war/);
});

test("a war starts only after the notice, and everyone hears of it", () => {
  const { w, g, a, b } = world();
  const r = run(w, a, { t: "diplo", op: "war", to: b });
  assert.equal(r.ok, true);
  assert.equal(r.starts, DIPLO.warNotice);
  assert.match(run(w, a, { t: "attack", at: g.idx(30, 5) }).error, /the war with Ben starts in 300 s/);
  assert.equal(run(w, b, { t: "diplo", op: "war", to: a }).error, "already at war");
  tickFor(w, DIPLO.warNotice + 1);
  assert.equal(w.hostile(a, b), true);
  assert.equal(w.hostile(b, a), true);
  const types = w.events.map(e => e.type);
  assert.ok(types.includes("war_declared") && types.includes("war_started"));
  assert.deepEqual(publicEvents(w, w.events.filter(e => e.type.startsWith("war_"))).map(e => e.type), ["war_declared", "war_started"]);
  assert.equal(run(w, a, { t: "attack", at: g.idx(30, 5) }).ok, true);
});

test("alliances open borders; leaving one sends troops home and blocks war for a while", () => {
  const { w, g, a, b } = world();
  const p = run(w, a, { t: "diplo", op: "propose", to: b, kind: "alliance" });
  assert.equal(p.ok, true);
  assert.equal(w.passable(a, b), false);
  assert.deepEqual(w.dip.proposalsOf(b).map(x => [x.from, x.kind]), [[a, "alliance"]]);
  const s = run(w, b, { t: "diplo", op: "propose", to: a, kind: "alliance" });
  assert.equal(s.signed, "alliance", "proposing what they already proposed signs it");
  assert.equal(w.passable(a, b), true);
  assert.equal(w.dip.proposals.size, 0);
  const st = w.createStack(a, g.idx(18, 10), 500);
  assert.ok(w.orderMove(st.id, g.idx(25, 10)));
  tickFor(w, 30);
  assert.equal(w.owner[st.pos], b, "the stack walked into its ally's land");
  assert.equal(w.owner[g.idx(25, 10)], b, "and took nothing");
  assert.equal(run(w, a, { t: "diplo", op: "war", to: b }).error, "leave the alliance first");
  assert.equal(run(w, a, { t: "diplo", op: "leave", to: b }).ok, true);
  w.tick(1);
  assert.equal(w.owner[st.pos], a, "leaving the alliance sent the stack home");
  assert.ok(w.events.some(e => e.type === "troops_home" && e.nation === a && e.from === b && e.stacks === 1));
  assert.match(run(w, a, { t: "diplo", op: "war", to: b }).error, /broke a treaty recently/);
  w.time += DIPLO.betrayalCooldown;
  assert.equal(run(w, a, { t: "diplo", op: "war", to: b }).ok, true);
});

test("peace needs a war at least ten minutes old, and gives a short treaty", () => {
  const { w, g, a, b } = world({ fresh: false });
  assert.equal(w.hostile(a, b), true, "worlds from before diplomacy keep their players at war");
  assert.equal(run(w, a, { t: "diplo", op: "propose", to: b, kind: "peace" }).error, "the war is too young for peace talks");
  w.time = 1000;
  const st = w.createStack(b, g.idx(21, 10), 3000);
  w.orderAdvance(st.id, a, true);
  tickFor(w, 5);
  const taken = w.nations.get(b).plots;
  const p = run(w, a, { t: "diplo", op: "propose", to: b, kind: "peace" });
  assert.equal(run(w, b, { t: "diplo", op: "accept", id: p.proposal }).signed, "peace");
  w.tick(1);
  assert.equal(w.hostile(a, b), false);
  tickFor(w, 5);
  assert.equal(w.nations.get(b).plots, taken, "peace stops the advance, and the land taken stays taken");
  assert.equal(run(w, b, { t: "diplo", op: "war", to: a }).error, "a non-aggression treaty is in force");
  assert.match(run(w, a, { t: "diplo", op: "propose", to: b, kind: "non_aggression", minutes: 45 }).error, /30, 60, 120, 240 minutes/);
  const n = run(w, a, { t: "diplo", op: "propose", to: b, kind: "non_aggression", minutes: 120 });
  assert.equal(run(w, b, { t: "diplo", op: "decline", id: n.proposal }).ok, true);
  assert.equal(run(w, b, { t: "diplo", op: "accept", id: n.proposal }).error, "no such proposal");
  assert.equal(run(w, a, { t: "diplo", op: "break", to: b }).ok, true);
  assert.match(run(w, a, { t: "diplo", op: "war", to: b }).error, /broke a treaty recently/);
});

test("an embargo shuts an ally's borders one way and stops trade both ways", () => {
  const { w, a, b } = world();
  run(w, a, { t: "diplo", op: "propose", to: b, kind: "alliance" });
  run(w, b, { t: "diplo", op: "accept", id: w.dip.proposalsOf(b)[0].id });
  assert.equal(friendly(w, a, b), true);
  assert.equal(run(w, a, { t: "diplo", op: "embargo", to: b, on: true }).on, true);
  assert.equal(w.passable(b, a), false, "Ben's troops may not cross Ann's land");
  assert.equal(w.passable(a, b), true, "Ann's still may cross Ben's");
  assert.equal(friendly(w, a, b), false);
  assert.equal(friendly(w, b, a), false);
  run(w, a, { t: "diplo", op: "embargo", to: b, on: false });
  assert.equal(friendly(w, a, b), true);
  w.tick(1);
  assert.deepEqual(w.events.filter(e => e.type === "embargo").map(e => e.on), [true, false]);
});

test("relations, proposals and embargoes survive a save", () => {
  const { w, a, b } = world();
  run(w, a, { t: "diplo", op: "war", to: b });
  run(w, a, { t: "diplo", op: "embargo", to: b, on: true });
  const saved = JSON.parse(JSON.stringify(w.dip.save()));
  const d = new Diplomacy().load(saved);
  assert.deepEqual(d.view(w.time), w.dip.view(w.time));
  assert.equal(d.status(a, b, DIPLO.warNotice), "war");
  const { w: w2 } = world();
  w2.dip = null;
  installDiplomacy(w2, { saved });
  assert.equal(w2.dip.status(a, b, 0), "war_pending");
  assert.equal(w2.dip.blocksTransit(a, b), true);
});

test("catch-up starts a pending war on world time", () => {
  const { w, a, b } = world();
  run(w, a, { t: "diplo", op: "war", to: b });
  w.events.length = 0;
  w.time += DIPLO.warNotice + 60;
  for (const h of w.hooks.postTick) if (h.whole && !h.live) h.whole(w, DIPLO.warNotice + 60);
  assert.ok(w.events.some(e => e.type === "war_started"));
  assert.equal(w.hostile(a, b), true);
});

test("the browser reads the same relations as the server", async () => {
  const { ClientWorld } = await import("../src/shared/client.js");
  const { PROTOCOL } = await import("../src/shared/protocol.js");
  const buildingData = (await import("../data/buildings.json", { with: { type: "json" } })).default;
  const { w, g, a, b, c } = world();
  const hello = () => ({ t: "hello", v: PROTOCOL, you: a, w: g.w, h: g.h, map: { kind: "test" }, hashes: {}, time: w.time, nations: [...w.nations.values()].map(o => ({ id: o.id, name: o.name, bot: !!o.bot })), defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] }, diplomacy: { ...w.dip.view(w.time), proposals: w.dip.proposalsOf(a) }, dipRules: { warNotice: DIPLO.warNotice } });
  run(w, a, { t: "diplo", op: "war", to: b });
  run(w, a, { t: "diplo", op: "embargo", to: b, on: true });
  let cw = new ClientWorld(hello());
  assert.equal(cw.relation(a, b).status, "war_pending");
  assert.ok(Math.abs(cw.relation(a, b).startsIn - DIPLO.warNotice) < 3);
  assert.deepEqual([cw.relation(a, b).embargoes, cw.relation(b, a).embargoed], [true, true]);
  assert.equal(cw.relation(a, c).status, "open");
  assert.equal(cw.canAttack(a, b), false);
  assert.equal(cw.canAttack(a, c), true);
  w.time += DIPLO.warNotice + 1;
  w.tick(1);
  cw = new ClientWorld(hello());
  assert.equal(cw.relation(a, b).status, w.dip.status(a, b, w.time));
  assert.equal(cw.canAttack(a, b), true);
  w.time += DIPLO.peaceMinWar;
  assert.equal(run(w, b, { t: "diplo", op: "propose", to: a, kind: "peace" }).ok, true);
  cw.message({ v: PROTOCOL, t: "diplomacy", ...w.dip.view(w.time), proposals: w.dip.proposalsOf(a) });
  assert.deepEqual(cw.dip.proposals.map(p => [p.from, p.kind]), [[b, "peace"]]);
});
