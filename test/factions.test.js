import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installTroops } from "../src/sim/troops.js";
import { installBots } from "../src/sim/bots.js";
import { installDiplomacy, DIPLO } from "../src/sim/diplomacy.js";
import { installNotes, notesFor, NOTES } from "../src/sim/notes.js";
import { runOrder, victory, mostLand, publicEvents } from "../src/game.js";
import { makeRng } from "../src/shared/rng.js";
import { TID } from "../src/shared/terrain.js";

function world(players = 3) {
  const W = 80, H = 20, w = new World({ w: W, h: H, terrain: new Uint8Array(W * H).fill(TID.grassland) }, { spawnRadius: 2 });
  installCombat(w);
  installTroops(w);
  const g = w.grid, ids = [];
  for (let k = 0; k < players; k++) ids.push(w.addNation({ name: ["Ann", "Ben", "Cat", "Dan"][k] }));
  const bot = w.addNation({ name: "Bot", bot: true });
  const all = [...ids, bot], span = Math.floor(W / all.length);
  all.forEach((id, k) => w.spawn(id, k * span + 3, 10));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.claim(g.idx(x, y), all[Math.min(all.length - 1, Math.floor(x / span))]);
  for (const id of all) w.nations.get(id).troops = 5000;
  installDiplomacy(w);
  installNotes(w);
  installBots(w, makeRng(1));
  return { w, g, ids, bot };
}
const run = (w, nid, m) => runOrder(w, nid, m);
const join = (w, leader, who) => {
  const inv = run(w, leader, { t: "diplo", op: "invite", to: who });
  return run(w, who, { t: "diplo", op: "accept", id: inv.proposal });
};

test("a faction is founded, invites, and its members are allied", () => {
  const { w, ids: [a, b, c] } = world();
  assert.match(run(w, a, { t: "diplo", op: "invite", to: b }).error, /found a faction first/);
  assert.match(run(w, a, { t: "diplo", op: "faction", name: "   " }).error, /1 to 24 characters/);
  const f = run(w, a, { t: "diplo", op: "faction", name: "The  North" });
  assert.deepEqual([f.ok, f.name], [true, "The North"]);
  assert.match(run(w, b, { t: "diplo", op: "faction", name: "the north" }).error, /another faction has that name/);
  assert.match(run(w, b, { t: "diplo", op: "invite", to: c }).error, /found a faction first/);
  const j = join(w, a, b);
  assert.equal(j.ok, true);
  assert.equal(w.passable(a, b), true);
  assert.equal(w.hostile(a, b), false);
  assert.equal(run(w, a, { t: "diplo", op: "war", to: b }).error, "cannot declare war on your own faction");
  assert.match(run(w, b, { t: "diplo", op: "invite", to: c }).error, /only a faction leader can invite/);
  w.tick(1);
  assert.deepEqual(w.events.filter(e => e.type.startsWith("faction_")).map(e => [e.type, e.a, e.name]), [["faction_created", a, "The North"], ["faction_joined", b, "The North"]]);
  assert.equal(publicEvents(w, w.events.filter(e => e.type === "faction_joined")).length, 1);
});

test("a war declared on one member reaches every member, and nobody at war can join", () => {
  const { w, ids: [a, b, c] } = world();
  run(w, a, { t: "diplo", op: "faction", name: "North" });
  join(w, a, b);
  assert.equal(run(w, c, { t: "diplo", op: "war", to: b }).ok, true);
  assert.equal(w.dip.status(c, a, w.time), "war_pending", "the faction defends together");
  const { w: w2, ids: [x, y, z] } = world();
  run(w2, x, { t: "diplo", op: "faction", name: "North" });
  run(w2, z, { t: "diplo", op: "war", to: y });
  const early = run(w2, x, { t: "diplo", op: "invite", to: y });
  assert.equal(early.ok, true, "Ann is at peace with Ben, so she may invite him");
  join(w2, x, z);
  assert.match(run(w2, y, { t: "diplo", op: "accept", id: early.proposal }).error, /make peace with every member first/, "but not once Cat, at war with him, has joined");
  assert.match(run(w2, x, { t: "diplo", op: "invite", to: y }).error, /make peace with every member first/);
});

test("the size limit, leaving, expelling and a new leader", () => {
  const { w, ids: [a, b, c, d] } = world(4);
  w.dip.rules.maxFactionSize = 2;
  run(w, a, { t: "diplo", op: "faction", name: "North" });
  join(w, a, b);
  assert.match(run(w, a, { t: "diplo", op: "invite", to: c }).error, /faction is full/);
  w.dip.rules.maxFactionSize = 4;
  join(w, a, c);
  assert.match(run(w, b, { t: "diplo", op: "expel", to: c }).error, /only the faction leader/);
  assert.equal(run(w, a, { t: "diplo", op: "expel", to: c }).ok, true);
  assert.equal(w.dip.faction(c), null);
  assert.match(run(w, c, { t: "diplo", op: "war", to: a }).error, /broke a treaty recently/, "leaving a faction starts the cooldown");
  assert.equal(run(w, a, { t: "diplo", op: "quit" }).ok, true);
  assert.equal(w.dip.factions.get(w.dip.faction(b)).leader, b, "the next member leads");
  assert.equal(run(w, b, { t: "diplo", op: "rename", name: "South" }).name, "South");
  assert.match(run(w, d, { t: "diplo", op: "quit" }).error, /not in a faction/);
  w.tick(1);
  assert.ok(w.events.some(e => e.type === "faction_left" && e.a === c && e.by === a));
  assert.ok(w.events.some(e => e.type === "faction_left" && e.a === a && e.leader === b));
});

test("the last faction standing wins together, but a faction of everyone has beaten nobody yet", () => {
  const { w, ids: [a, b, c] } = world();
  run(w, a, { t: "diplo", op: "faction", name: "North" });
  join(w, a, b);
  join(w, a, c);
  assert.equal(victory(w), null, "all three players in one faction, and nobody beaten");
  const { w: w2, ids: [x, y, z] } = world();
  run(w2, x, { t: "diplo", op: "faction", name: "North" });
  join(w2, x, y);
  assert.equal(victory(w2), null);
  w2.nations.get(z).alive = false;
  const v = victory(w2);
  assert.deepEqual([v.winner, v.faction, v.members, v.name], [x, w2.dip.faction(x), [x, y], "North (Ann and Ben)"]);
  const { w: w3, ids: [p, q, r] } = world();
  w3.nations.get(q).alive = false;
  w3.nations.get(r).alive = false;
  assert.deepEqual(victory(w3), { winner: p, name: "Ann" });
});

test("at the end time the side with the most land wins, a faction counted together", () => {
  const { w, ids: [a, b, c] } = world();
  w.nations.get(a).plots = 300;
  w.nations.get(b).plots = 250;
  w.nations.get(c).plots = 400;
  assert.deepEqual(mostLand(w), { winner: c, name: "Cat", by: "time", plots: 400 });
  run(w, a, { t: "diplo", op: "faction", name: "North" });
  join(w, a, b);
  const v = mostLand(w);
  assert.deepEqual([v.winner, v.plots, v.by, v.name], [a, 550, "time", "North (Ann and Ben)"]);
});

test("map notes: at most twenty, shared with allies and faction members only", () => {
  const { w, g, ids: [a, b, c] } = world();
  const r = run(w, a, { t: "note", op: "add", at: g.idx(5, 5), text: "  Hold the  ford " });
  assert.deepEqual([r.ok, notesFor(w, a)], [true, [[a, r.id, g.idx(5, 5), "Hold the ford"]]]);
  assert.match(run(w, a, { t: "note", op: "add", at: -1, text: "x" }).error, /off the map/);
  assert.match(run(w, a, { t: "note", op: "add", at: 3, text: "x".repeat(NOTES.length + 1) }).error, /1 to 80 characters/);
  for (let k = 1; k < NOTES.max; k++) run(w, a, { t: "note", op: "add", at: k, text: `n${k}` });
  assert.match(run(w, a, { t: "note", op: "add", at: 99, text: "one more" }).error, /at most 20 notes/);
  assert.deepEqual(notesFor(w, b), [], "a player at peace sees none");
  const v = w.notes.version;
  run(w, a, { t: "diplo", op: "propose", to: b, kind: "alliance" });
  run(w, b, { t: "diplo", op: "propose", to: a, kind: "alliance" });
  assert.equal(notesFor(w, b).length, NOTES.max, "an ally sees them all");
  assert.equal(notesFor(w, c).length, 0);
  run(w, c, { t: "diplo", op: "faction", name: "East" });
  const inv = run(w, c, { t: "diplo", op: "invite", to: a });
  run(w, a, { t: "diplo", op: "accept", id: inv.proposal });
  assert.equal(notesFor(w, c).length, NOTES.max, "and so does a faction member");
  assert.equal(run(w, a, { t: "note", op: "remove", id: r.id }).ok, true);
  assert.ok(w.notes.version > v);
  assert.equal(notesFor(w, a).length, NOTES.max - 1);
  assert.match(run(w, a, { t: "note", op: "remove", id: r.id }).error, /no such note/);
  assert.equal(DIPLO.maxFactionSize, 4);
});

test("the browser reads factions, private chat, typing and shared notes", async () => {
  const { ClientWorld } = await import("../src/shared/client.js");
  const { PROTOCOL } = await import("../src/shared/protocol.js");
  const buildingData = (await import("../data/buildings.json", { with: { type: "json" } })).default;
  const { w, g, ids: [a, b, c] } = world();
  run(w, a, { t: "diplo", op: "faction", name: "North" });
  join(w, a, b);
  run(w, b, { t: "note", op: "add", at: g.idx(30, 4), text: "Ford here" });
  const cw = new ClientWorld({ t: "hello", v: PROTOCOL, you: a, w: g.w, h: g.h, map: { kind: "test" }, hashes: {}, time: w.time, nations: [...w.nations.values()].map(o => ({ id: o.id, name: o.name, bot: !!o.bot })), defs: buildingData.buildings, tech: { eras: [], branches: [], nodes: [] },
    diplomacy: { ...w.dip.view(w.time), proposals: [] }, notes: notesFor(w, a), chat: [{ t: 1, who: "Ben", text: "hi", ch: "faction", from: b, to: null }] });
  assert.deepEqual([cw.relation(a, b).status, cw.relation(a, b).faction, cw.relation(a, c).status], ["alliance", w.dip.faction(a), "peace"]);
  assert.equal(cw.factionOf(b)?.name, "North");
  assert.deepEqual(cw.notes, [{ owner: b, id: 1, at: g.idx(30, 4), text: "Ford here" }]);
  cw.message({ v: PROTOCOL, t: "typing", who: "Cat", from: c, ch: "private", to: a });
  assert.equal(cw.typing.get("Cat")?.ch, "private");
  cw.message({ v: PROTOCOL, t: "chat", who: "Cat", text: "psst", at: 2, ch: "private", from: c, to: a });
  assert.equal(cw.typing.has("Cat"), false, "a message ends the typing notice");
  assert.deepEqual(cw.chat.map(m => [m.ch, m.from, m.to]), [["faction", b, null], ["private", c, a]]);
  cw.message({ v: PROTOCOL, t: "notes", notes: [] });
  assert.deepEqual(cw.notes, []);
});
