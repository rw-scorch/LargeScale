import { isLand } from "../src/shared/terrain.js";
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const INVITE = process.env.INVITE ?? "test-invite";
const ADMIN = process.env.ADMIN ?? "rw_scorch";
const MAP = process.env.MAP ?? "test";
const MAPS = {
  test: { config: { w: 160, h: 100, seed: 7 }, w: 160, h: 100 },
  europe: { config: { map: "europe" }, w: 1400, h: 760, scale: 2 },
  "europe-normal": { config: { map: "europe", detail: "normal" }, w: 700, h: 380 },
  earth: { config: { map: "earth" }, w: 3600, h: 1440 },
};
const M = MAPS[MAP];
const K = M.scale ?? 1;
if (!M) throw new Error(`MAP must be one of ${Object.keys(MAPS).join(", ")}`);
console.log(`map: ${MAP}`);
import { PROTOCOL, MSG, CLOSE } from "../src/shared/protocol.js";
import { hashBytes, hashRuns } from "../src/shared/codec.js";
import { ClientWorld } from "../src/shared/client.js";
import { planBatch } from "../src/shared/buildings.js";
import { makeTestMap } from "../src/shared/testmap.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };

async function api(path, body, token, method = body ? "POST" : "GET") {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

function connect(world, token, v = PROTOCOL, extra = "") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace("http", "ws") + `/ws/${world}?token=${token}&v=${v}${extra}`);
    ws.binaryType = "arraybuffer";
    const got = { json: [], binary: [], ws, closed: null };
    ws.onmessage = e => {
      if (typeof e.data !== "string") return got.binary.push(new Uint8Array(e.data));
      const m = JSON.parse(e.data);
      m._bin = got.binary.length;
      m._bytes = Buffer.byteLength(e.data);
      got.json.push(m);
    };
    ws.onclose = e => { got.closed = { code: e.code, reason: e.reason }; };
    ws.onopen = () => resolve(got);
    ws.onerror = reject;
  });
}

class Mirror {
  constructor(got, hello) {
    this.got = got;
    this.hello = hello;
    this.world = new ClientWorld(hello);
    this.bin = hello._bin;
    this.js = got.json.indexOf(hello) + 1;
    this.frameBytes = 0;
  }
  get terrain() { return this.world.terrain; }
  get owner() { return this.world.owner; }
  get nations() { return this.world.nations; }
  get stacks() { return this.world.stacks; }
  get events() { return this.world.events; }
  get versionOk() { return !this.world.stale; }
  async load() {
    try {
      await this.world.loadBase(async () => {
        const gz = new Uint8Array(await (await fetch(`${BASE}/${this.world.map.dir ?? "map"}/terrain.bin.gz`)).arrayBuffer());
        this.staticBytes = gz.length;
        return gz;
      });
      this.baseHashOk = true;
    } catch { this.baseHashOk = false; return this; }
    const need = this.hello.frames.terrain + this.hello.frames.owner + (this.hello.frames.buildings ?? 0) + (this.hello.frames.zone ?? 0) + (this.hello.frames.road ?? 0) + (this.hello.frames.deposits ?? 0);
    for (let k = 0; k < 200 && this.got.binary.length < this.bin + need; k++) await sleep(50);
    this.pump(this.bin + need);
    this.joinFrameBytes = this.frameBytes;
    return this;
  }
  pump(upTo = this.got.binary.length) {
    for (; this.bin < upTo; this.bin++) {
      const raw = this.got.binary[this.bin];
      this.frameBytes += raw.length;
      const r = this.world.frame(raw);
      if (r?.layer === "terrain") this.terrainDone = true;
      if (r?.layer === "owner" && r.all) this.ownerDone = true;
    }
    for (; this.js < this.got.json.length; this.js++) this.world.message(this.got.json[this.js]);
    return this;
  }
}

const waitFor = async (got, pred, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const m = got.json.find(pred); if (m) return m; await sleep(50); }
  return null;
};
const nextResult = (got, of, ms) => waitFor(got, m => m.t === "result" && m.of === of && !m.seen && (m.seen = true), ms);
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(50); }
  return null;
};

if (process.env.RECHECK) {
  const { readFileSync } = await import("node:fs");
  const last = JSON.parse(readFileSync(new URL("./.last.json", import.meta.url)));
  const st = (await api(`/api/worlds/${last.wid}/status`, null, last.token)).body;
  const lc = st.loadCheck;
  check(lc?.loaded.terrain === last.hashes.terrain && lc?.loaded.owner === last.hashes.owner, `after a restart the ${st.map?.kind} world loads terrain ${lc?.loaded.terrain} and owner ${lc?.loaded.owner}, the same as before (${last.hashes.terrain}, ${last.hashes.owner})`);
  check(lc?.saved?.owner === lc?.loaded.owner, `the owner hash stored with the save matches the decoded layer (load took ${st.loadMs} ms)`);
  check(st.loaded && (st.loaded.upgradedFrom === null || [2, 3].includes(st.loaded.upgradedFrom)), st.loaded?.upgradedFrom ? `a format ${st.loaded.upgradedFrom} save loaded as format 4, with ${st.loaded.buildings} buildings${st.loaded.gold ? `; goods became ${st.loaded.gold.gold} gold` : ""}` : `the format 4 save loaded with ${st.loaded?.buildings} buildings`);
  const layers = ["zone", "wood", "buildings", "land", "road"].filter(k => last.hashes[k]);
  check(layers.every(k => lc?.loaded[k] === last.hashes[k]), layers.length ? `zone, wood, building, land and road layers load identically (${layers.map(k => `${k} ${lc?.loaded[k]}`).join(", ")})` : "the save had no zone, wood or building layers yet");
  const again = await connect(last.wid, last.token);
  const h = await waitFor(again, m => m.t === "hello");
  const n = h?.nations.find(x => x.id === last.you);
  check(n && n.plots >= last.plots, `after a server restart the nation still has ${n?.plots} plots (saved ${last.plots})`);
  const st1 = (await api(`/api/worlds/${last.wid}/status`, null, last.token)).body;
  check(st1.frozen && !st1.lastCatchUp, "a won world stays frozen: it does not catch up");
  again.ws.close();
  if (last.awayWid) {
    const back = await connect(last.awayWid, last.token);
    const woke = await waitFor(back, m => m.t === "catchup" && m.left === 0, 20000);
    const summary = await waitFor(back, m => m.t === "away", 5000);
    const st2 = (await api(`/api/worlds/${last.awayWid}/status`, null, last.token)).body;
    check(woke && st2.lastCatchUp?.seconds > 0 && st2.lastCatchUp.ms < 2000 && summary?.caught > 0,
      `reloaded from storage, the away-test world catches up ${((st2.lastCatchUp?.seconds ?? 0) / 3600).toFixed(1)} game hours in ${st2.lastCatchUp?.ms} ms${st2.lastCatchUp?.dropped ? ` (${(st2.lastCatchUp.dropped / 3600).toFixed(1)} h over the 72-hour cap dropped)` : ""}, and the player gets the summary`);
    back.ws.close();
  }
  process.exit(failures ? 1 : 0);
}

const suffix = Math.floor(Math.random() * 1e6);
const bad = await api("/api/register", { name: "x" + suffix, password: "password123", invite: "nope" });
check(bad.status === 400 && bad.body.error === "wrong invite code", "register needs the invite code");
const a = await api("/api/register", { name: ADMIN, password: "correct horse", invite: INVITE });
const alogin = a.status === 200 ? a : await api("/api/login", { name: ADMIN, password: "correct horse" });
check(alogin.status === 200 && alogin.body.account.admin === true, `${ADMIN} gets the admin flag from the server (set ADMIN_NAMES in wrangler.jsonc)`);
const b = await api("/api/register", { name: "friend" + suffix, password: "another pass", invite: INVITE });
check(b.status === 200 && b.body.account.admin === false, "friends are not admins");
const wrong = await api("/api/login", { name: "friend" + suffix, password: "wrong pass" });
check(wrong.status === 401, "wrong password is refused");
const ta = alogin.body.token, tb = b.body.token;
const denied = await api("/api/worlds", { name: "Mine", config: M.config }, tb);
check(denied.status === 403 && denied.body.error === "only the host can create worlds", `a friend cannot create worlds: ${denied.status} "${denied.body.error}"`);
const bogus = await api("/api/worlds", { name: "Bad", config: { map: "mars" } }, ta);
check(bogus.status === 400 && /unknown map/.test(bogus.body.error), "an unknown map choice is refused");
const created = Date.now();
const world = await api("/api/worlds", { name: "Smoke test", config: { ...M.config, rules: { stackSpeed: 6 * K, enemyCostFactor: 0.01, advanceRate: 30 * K * K, buildSpeed: 10, produceSpeed: 200, researchSpeed: 100, trainSpeed: 5 } } }, ta);
check(world.status === 200 && world.body.id, `host creates a ${MAP} world (${world.body.w} by ${world.body.h}, ${world.body.bots} bots planned) in ${Date.now() - created} ms`);
const wid = world.body.id;
const outsiderOpened = await new Promise(res => {
  const ws = new WebSocket(BASE.replace("http", "ws") + `/ws/${wid}?token=${tb}`);
  ws.onopen = () => { ws.close(); res(true); };
  ws.onerror = () => res(false);
});
check(!outsiderOpened, "non-members cannot connect");
check((await api(`/api/worlds/${wid}/join`, {}, tb)).status === 200, "friend joins the world");
const A = await connect(wid, ta), B = await connect(wid, tb);
const hello = await waitFor(A, m => m.t === "hello");
check(hello && hello.w === M.w && hello.h === M.h && hello.v === PROTOCOL, `hello has the map size and protocol version ${hello?.v}`);
const mirror = await new Mirror(A, hello).load();
check(mirror.terrainDone && mirror.ownerDone && mirror.versionOk, `join arrives as ${hello.frames.terrain} terrain difference and ${hello.frames.owner} owner frames, all tagged with the protocol version`);
check(mirror.baseHashOk, `the static map file matches the server's base map (${hello.map.baseHash ?? "generated test map"})`);
check(hashBytes(mirror.terrain) === hello.hashes.terrain, `terrain rebuilt from the base map plus differences matches the server (${hello.hashes.terrain})`);
check(hashRuns(mirror.owner) === hello.hashes.owner, "owner layer decoded from the snapshot matches the server");
const joinBytes = hello._bytes + mirror.joinFrameBytes;
check(joinBytes < 1_000_000, `join transferred ${joinBytes} bytes over the socket (hello ${hello._bytes}, frames ${mirror.joinFrameBytes}); static terrain file ${mirror.staticBytes ?? 0} bytes, cacheable`);
const terrain = mirror.terrain;
const land = [];
for (let i = 0; i < terrain.length; i++) if (terrain[i] >= 11 && terrain[i] <= 15) land.push(i);
const view = mirror, you = hello.you;
const cx = M.w / 2, cy = M.h / 2;
const region = new Int32Array(terrain.length).fill(-1), sizes = [];
for (let i = 0; i < terrain.length; i++) {
  if (region[i] >= 0 || !isLand(terrain[i])) continue;
  const id = sizes.length, todo = [i];
  region[i] = id;
  let n = 0;
  while (todo.length) {
    const c = todo.pop(), x = c % M.w;
    n++;
    for (const d of [c - M.w, c + M.w, x > 0 ? c - 1 : -1, x < M.w - 1 ? c + 1 : -1])
      if (d >= 0 && d < terrain.length && region[d] < 0 && isLand(terrain[d])) { region[d] = id; todo.push(d); }
  }
  sizes.push(n);
}
const mainland = sizes.indexOf(Math.max(...sizes));
const nearMiddle = land.filter((i, k) => k % 97 === 0 && region[i] === mainland).sort((p, q) => Math.hypot((p % M.w) - cx, Math.floor(p / M.w) - cy) - Math.hypot((q % M.w) - cx, Math.floor(q / M.w) - cy));
let aSpawn = -1;
for (const i of nearMiddle) {
  A.ws.send(JSON.stringify({ t: "spawn", x: i % M.w, y: Math.floor(i / M.w) }));
  if ((await nextResult(A, "spawn"))?.ok) { aSpawn = i; break; }
}
check(aSpawn >= 0, "player spawns on land");
{
  const cw = view.world;
  const kit = await until(() => { view.pump(); return [...cw.buildings.values()].find(b => b.owner === you && b.type === "chieftain_hut"); });
  check(kit && kit.state === "active" && cw.purse?.money >= 100 && cw.purse.stock === undefined, `starting kit: a finished chieftain hut at the capital and ${cw.purse?.money} gold, with no goods`);
  const near = [];
  for (let r = 1; r < 12 * K && near.length < 400; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = (aSpawn % M.w) + dx, y = Math.floor(aSpawn / M.w) + dy;
    if (x >= 0 && y >= 0 && x < M.w && y < M.h) near.push(y * M.w + x);
  }
  const open = near.find(i => cw.owner[i] === you && !cw.buildingAt(i) && isLand(terrain[i]));
  A.ws.send(JSON.stringify({ t: "build", type: "watchtower_wood", at: open }));
  const gated = await nextResult(A, "build");
  check(gated?.error === "needs Palisades research" && gated.error === cw.placeError("watchtower_wood", open), `before research the tower is refused: "${gated?.error}"`);
  const r0 = cw.purse?.research, starter = ["fire_keeping", "stone_tools", "foraging", "barter", "farming"];
  check(r0 && starter.every(id => r0.queue.includes(id) || r0.known.includes(id)), `a new nation starts with a research queue: ${[...(r0?.known ?? []).map(id => `${id} (done)`), ...(r0?.queue ?? [])].join(", ")}`);
  const gathered = await until(() => { view.pump(); return cw.purse?.making?.producers > 0 ? cw.purse.making : null; }, 8000);
  check(gathered, `the chieftain hut earns gold from the start: ${gathered?.producers} gold a second (this world runs production 200 times faster)`);
  const wanted = ["palisades", "fire_keeping", "barter", "farming", "chieftains"];
  const replies = [];
  for (const id of wanted) { A.ws.send(JSON.stringify({ t: "research", id })); replies.push(await nextResult(A, "research")); }
  const first = replies[0]?.queue ?? [], pal = first.indexOf("palisades");
  check(replies.every(r => r?.ok || r?.error === "already known") && pal > 0 && first.includes("clubs") && first.indexOf("clubs") < pal && first.indexOf("stone_tools") < pal, `queueing Palisades queues what it still needs ahead of it: ${first.join(", ")}`);
  const learned = await until(() => { view.pump(); const k = cw.purse?.research?.known ?? []; return wanted.every(id => k.includes(id)) ? k.length : 0; }, 30000);
  check(learned, `research carries through the queue: ${learned} nodes known, ${cw.purse?.research?.rate} points a second`);
  const water = near.find(i => !isLand(terrain[i])) ?? terrain.findIndex(t => !isLand(t));
  const neutral = near.find(i => isLand(terrain[i]) && cw.owner[i] === 0) ?? land.find(i => cw.owner[i] === 0);
  const refusals = [["barracks", near.find(i => cw.owner[i] === you)], ["watchtower_wood", kit?.anchor], ["watchtower_wood", water], ["watchtower_wood", neutral]];
  const said = [];
  for (const [type, at] of refusals) {
    A.ws.send(JSON.stringify({ t: "build", type, at }));
    const r = await nextResult(A, "build");
    said.push(`${type}: "${r?.error}"`);
    check(r && !r.ok && r.error === cw.placeError(type, at), `the server refuses ${type} with the same reason the client shows: "${r?.error}"`);
  }
  const spot = near.find(i => cw.owner[i] === you && !cw.placeError("watchtower_wood", i));
  A.ws.send(JSON.stringify({ t: "build", type: "watchtower_wood", at: spot }));
  const built = await nextResult(A, "build");
  check(built?.ok && built.building, `a wooden watchtower is placed next to the capital (building ${built?.building})`);
  const bid = built?.building;
  const seenByB = row => B.json.some(m => m.t === "state" && m.b?.some(r => r[0] === bid && r[4] === row));
  const siteSeen = await until(() => seenByB(0), 3000);
  const done = await until(() => { view.pump(); return cw.buildings.get(bid)?.state === "active"; }, 8000);
  const friendDone = done && await until(() => seenByB(1), 3000);
  check(siteSeen && done && friendDone, `the site finishes, and the friend's client sees the site and the finished tower${siteSeen && done && friendDone ? "" : ` (site seen ${!!siteSeen}, finished ${!!done}, friend saw it finish ${!!friendDone})`}`);
  check(A.json.some(m => m.t === "events" && m.events.some(e => e.type === "built" && e.building === bid)), "a built event reaches the owner");
  const before = cw.purse.money;
  A.ws.send(JSON.stringify({ t: "demolish", building: bid }));
  const gone = await nextResult(A, "demolish");
  check(gone?.ok && gone.refund?.money === 25 && Object.keys(gone.refund).length === 1, `demolish refunds half, in gold: ${JSON.stringify(gone?.refund)}`);
  await until(() => { view.pump(); return cw.buildings.get(bid)?.state === "rubble" && cw.purse.money >= before + 25; }, 3000);
  check(cw.buildings.get(bid)?.state === "rubble" && await until(() => seenByB(3), 3000), "the tower turns to rubble for both players");
  check(await until(() => B.json.some(m => m.t === "state" && m.bg?.includes(bid)), 20000), "the rubble clears on its own, and the friend's client drops it");
  const cx = aSpawn % M.w, cy = Math.floor(aSpawn / M.w);
  const zr = async (zone, x, y, w, h) => { A.ws.send(JSON.stringify({ t: "zone", zone, x, y, w, h })); return nextResult(A, "zone"); };
  const res = await zr("res", cx - 4, cy - 4, 9, 5), com = await zr("com", cx - 4, cy + 1, 9, 3);
  check(res?.ok && res.plots > 0 && com?.ok && com.plots > 0 && res.plots + com.plots >= 20, `zoning paints ${res?.plots} home plots and ${com?.plots} shop plots next to the capital`);
  check((await zr("mall", cx, cy, 2, 2))?.error === "unknown zone" && (await zr("res", 0, 0, 65, 1))?.error === "zone at most 64 by 64 plots at a time", "bad zone orders are refused with a reason");
  const zoneFrames = () => B.binary.filter(f => f[0] === MSG.ZONE_DIFF).length;
  check(await until(() => zoneFrames() > 0, 3000), `the friend receives the zone changes (${zoneFrames()} frames)`);
  const rr = async (kind, via) => { A.ws.send(JSON.stringify({ t: "road", kind, via })); return nextResult(A, "road"); };
  const runNear = () => {
    for (let dy = -7; dy <= 7; dy++) {
      let run = [];
      for (let dx = -9; dx <= 9; dx++) {
        const i = (cy + dy) * M.w + cx + dx;
        if (cw.owner[i] === you && !cw.buildingAt(i) && isLand(cw.terrain[i]) && !cw.zone[i]) { run.push(i); if (run.length >= 6) return run; } else run = [];
      }
    }
    return null;
  };
  const run = runNear(), gold0 = cw.purse.money;
  const laid = run && await rr("dirt", [run[0], run[5]]);
  const roadSeen = laid?.ok && await until(() => { view.pump(); return run.every(i => cw.roads[i] === 1); }, 3000);
  const friendRoad = await until(() => B.binary.some(f => f[0] === MSG.ROAD_DIFF), 3000);
  const foreign = cw.owner.findIndex((o, i) => o !== you && isLand(cw.terrain[i]) && isLand(cw.terrain[i + 1]) && cw.owner[i + 1] !== you);
  const offLand = await rr("dirt", [foreign, foreign + 1]), lockedCobble = run && await rr("cobble", [run[0], run[1]]);
  const removed = run && await rr("none", [run[0], run[5]]);
  const roadGone = removed?.ok && await until(() => { view.pump(); return run.every(i => !cw.roads[i]); }, 3000);
  if (run) await rr("dirt", [run[0], run[2]]);
  view.pump();
  A.ws.send(JSON.stringify({ t: "wagon", at: aSpawn, food: 10 }));
  const noWagon = await until(() => A.json.find(m => m.t === "error" || (m.t === "result" && m.of === "wagon")), 3000);
  check(noWagon?.error === "unknown order" && !cw.purse.supply && !cw.purse.logistics && cw.purse.trade?.ports === 0, `army supply and stores are gone: a wagon order gets "${noWagon?.error ?? noWagon?.message ?? noWagon?.t}", and the purse has a trade view instead (${JSON.stringify(cw.purse.trade)})`);
  check(laid?.ok && laid.laid === 6 && roadSeen && friendRoad && offLand?.error === "roads go on your own land" && /Paved roads/.test(lockedCobble?.error ?? "") && removed?.laid === 6 && roadGone,
    `a dirt road of ${laid?.laid} plots costs ${JSON.stringify(laid?.cost)} (gold ${gold0} before), reaches both clients, is refused off your land ("${offLand?.error}") and as cobble before research ("${lockedCobble?.error}"), and comes up again for free`);
  view.pump();
  const townClock = { world: (await api(`/api/worlds/${wid}/status`, null, ta)).body.time, wall: Date.now() };
  const town = await until(() => {
    view.pump();
    const huts = [...cw.buildings.values()].filter(b => b.owner === you && b.type === "hut_grass" && b.state === "active");
    return huts.length >= 2 && cw.purse?.town?.pop > 0 ? huts.length : 0;
  }, 25000);
  check(town, `huts go up on their own and people move in: ${town} huts, ${cw.purse?.town?.pop} people, ${cw.purse?.town?.housing} homes${town ? "" : ` [gold ${cw.purse?.money}, demand ${JSON.stringify(cw.purse?.town?.demand)}, all huts ${[...cw.buildings.values()].filter(b => b.owner === you && b.def.civilian).map(b => b.type + ":" + b.state).join(" ")}; the world clock moved ${((await api(`/api/worlds/${wid}/status`, null, ta)).body.time - townClock.world).toFixed(1)} s in ${Math.round((Date.now() - townClock.wall) / 1000)} s]`}`);
  view.pump();
  const zonedBefore = cw.zone.reduce((n, z) => n + (z ? 1 : 0), 0);
  const erased = await zr("none", cx - 4, cy + 1, 9, 3);
  await until(() => { view.pump(); return cw.zone.reduce((n, z) => n + (z ? 1 : 0), 0) < zonedBefore; }, 3000);
  const deps = cw.deposits.plots.length;
  check(MAP !== "test" || (deps > 0 && hello.frames.deposits === 1), `the world's deposits reach the client: ${deps} plots (${MAP === "test" ? "in the join" : "from the static file, not loaded by this test"})`);
  let prod = null;
  for (const type of ["crop_wheat", "pasture_sheep", "fishing_hut"]) {
    const at = near.find(i => cw.owner[i] === you && !cw.placeError(type, i));
    if (at !== undefined) { prod = { type, at }; break; }
  }
  A.ws.send(JSON.stringify({ t: "build", type: prod?.type, at: prod?.at }));
  const pb = await nextResult(A, "build");
  const makingBefore = cw.purse.making?.producers ?? 0;
  const making = await until(() => { view.pump(); return cw.purse?.making?.producers > makingBefore + 0.05 ? cw.purse.making.producers : 0; }, 20000);
  check(pb?.ok && making, `a ${prod?.type} on your land earns gold: ${(making - makingBefore).toFixed(2)} a second on top of the chieftain hut's ${makingBefore}`);
  const pursesBefore = A.json.filter(m => m.t === "purse").length;
  const clock0 = { world: (await api(`/api/worlds/${wid}/status`, null, ta)).body.time, wall: Date.now() };
  A.ws.send(JSON.stringify({ t: "research", id: "age_medieval", mode: "first" }));
  const ageOrder = await nextResult(A, "research");
  const heard = await until(() => B.json.find(m => m.t === "events" && m.events.some(e => e.type === "era_up" && e.nation === you)), 30000);
  await until(() => { view.pump(); return cw.purse?.era === "M"; }, 5000);
  const bRow = await until(() => B.json.some(m => m.t === "state" && m.n.some(r => r[0] === you && r[5] === 1)), 5000);
  check(ageOrder?.ok && heard && bRow && cw.purse?.era === "M", `the host reaches the Medieval era; the friend hears it and sees the era in the nation list (${cw.purse?.era}${cw.purse?.era === "M" ? "" : `; world clock ${clock0.world.toFixed(1)} at the order, wall ${Math.round((Date.now() - clock0.wall) / 1000)} s since; purses after the order ${A.json.filter(m => m.t === "purse").length - pursesBefore}; status ${JSON.stringify((({ time, looping, frozen, tickErrors, lastError }) => ({ time, looping, frozen, tickErrors, lastError }))((await api(`/api/worlds/${wid}/status`, null, ta)).body))}; order ${JSON.stringify(ageOrder)}; research ${JSON.stringify({ ...cw.purse?.research, known: cw.purse?.research?.known.length })}`})`);
  check(erased?.ok && erased.plots > 0 && cw.zone.reduce((n, z) => n + (z ? 1 : 0), 0) === zonedBefore - erased.plots, `erasing clears ${erased?.plots} zoned plots on the client too`);
  A.ws.send(JSON.stringify({ t: "research", id: "masonry", mode: "first" }));
  await nextResult(A, "research");
  const masonry = await until(() => { view.pump(); return cw.purse?.research?.known.includes("masonry"); }, 20000);
  A.ws.send(JSON.stringify({ t: "admin", op: "give", nation: you, what: "money", amount: 5000 }));
  await nextResult(A, "admin");
  await until(() => { view.pump(); return cw.purse?.money >= 5000; }, 5000);
  const towers = [];
  for (const i of near) {
    if (towers.length >= 3) break;
    if (cw.placeError("watchtower_wood", i) || towers.some(j => Math.max(Math.abs((i % M.w) - (j % M.w)), Math.abs(Math.floor(i / M.w) - Math.floor(j / M.w))) < 2)) continue;
    A.ws.send(JSON.stringify({ t: "build", type: "watchtower_wood", at: i }));
    const r = await nextResult(A, "build");
    if (r?.ok) towers.push(i);
  }
  const ready = await until(() => { view.pump(); return towers.every(i => cw.buildingAt(i)?.state === "active"); }, 10000);
  const stoneTower = cw.defs.table.tower_stone, purse0 = { money: cw.purse.money };
  const expected = planBatch(Array(towers.length).fill(stoneTower.cost), cw.purse, cw.consRules.instantPremium, cw.consRules.moneyForMissing);
  A.ws.send(JSON.stringify({ t: "upgrade", picks: [["watchtower_wood", 3]] }));
  const up = await nextResult(A, "upgrade");
  const ids = towers.map(i => cw.buildingAt(i)?.id);
  const friendSaw = await until(() => ids.every(id => B.json.some(m => m.t === "state" && (m.b ?? []).some(r => r[0] === id && r[1] === stoneTower.num))), 5000);
  check(masonry && ready && towers.length === 3 && up?.ok && up.done === 3 && Math.abs(up.spent - expected.spent) < 0.01 && friendSaw,
    `three wooden watchtowers upgrade at once: ${up?.done} done for ${up?.spent} gold (the client's plan said ${expected.spent}), and the friend sees stone towers`);
  const wait = await until(() => { view.pump(); return towers.every(i => cw.buildingAt(i)?.type === "tower_stone") && cw.purse.money < purse0.money ? cw.purse : null; }, 5000);
  check(wait && towers.every(i => cw.buildingAt(i).state === "active"), `the host's own client shows them finished at once, with gold down from ${purse0.money} to ${wait?.money}`);
  A.ws.send(JSON.stringify({ t: "research", id: "clubs", mode: "first" }));
  await nextResult(A, "research");
  const clubs = await until(() => { view.pump(); return cw.purse?.research?.known.includes("clubs"); }, 20000);
  const campAt = near.find(i => !cw.placeError("war_camp", i));
  A.ws.send(JSON.stringify({ t: "build", type: "war_camp", at: campAt }));
  const campBuilt = await nextResult(A, "build");
  const campUp = await until(() => { view.pump(); return cw.buildingAt(campAt)?.state === "active"; }, 15000);
  A.ws.send(JSON.stringify({ t: "army", keep: { club_warrior: 20 } }));
  const kept = await nextResult(A, "army");
  const drilled = await until(() => { view.pump(); return cw.purse?.army?.reserve?.club_warrior >= 20 ? cw.purse.army : null; }, 20000);
  check(clubs && campBuilt?.ok && campUp && kept?.ok && drilled && drilled.rate > 0, `a war camp trains the 20 club warriors the host asked to keep, from levies at home (${drilled?.reserve?.club_warrior} now, ${drilled?.rate} a second)`);
}
B.ws.send(JSON.stringify({ t: "chat", text: "hello from friend" }));
check(!!(await waitFor(A, m => m.t === "chat" && m.text === "hello from friend")), "chat reaches the other player");
A.ws.send(JSON.stringify({ t: "stack", share: 0.5 }));
const st = await nextResult(A, "stack");
check(st?.ok, "stack created from the garrison");
const before = (await until(() => view.pump().nations.get(you)?.plots > 0 && view.nations.get(you)))?.plots;
const formed = (await until(() => view.pump().stacks.get(st.stack)))?.pos;
A.ws.send(JSON.stringify({ t: "advance", stack: st.stack, only: "free" }));
const adv = await nextResult(A, "advance");
const stopped = () => A.json.some(m => m.t === "events" && m.events.some(e => e.stack === st.stack && (e.type === "advance_done" || e.type === "stalled")));
const freeShown = await until(() => view.pump().world.purse?.orders?.find(o => o.id === st.stack && o.only === 0) ? "the host's purse shows it" : stopped() ? "it ran out of land within reach before the next purse" : null, 3000);
check(adv?.ok && adv.only === 0 && freeShown, `an advance kept to unclaimed land is accepted, and ${freeShown ?? "the host's purse never showed it"}`);
await sleep(3000);
check(A.binary.some(f => f[0] === MSG.DIFF && f[1] === PROTOCOL), "territory changes stream as binary diffs");
A.ws.send(JSON.stringify({ t: "admin", op: "hashes" }));
const hr = await waitFor(A, m => m.t === "result" && m.op === "hashes");
mirror.pump(hr._bin);
check(hr && hashRuns(mirror.owner) === hr.owner, `after live diffs the client's owner layer still matches the server (${hr?.owner})`);
check(hr && hashBytes(mirror.terrain) === hr.terrain, `after live terrain edits the client's terrain still matches the server (${hr?.terrain})`);
const mine = view.pump().nations.get(you);
check(mine && mine.plots > before + 5, `nation grew from ${before} to ${mine?.plots} plots, seen through compact state updates`);
const sought = await until(() => {
  view.pump();
  const o = view.world.purse?.orders?.find(o => o.id === st.stack), s = view.stacks.get(st.stack);
  return o?.only === 0 && o.to !== null ? `the purse shows it heading for plot ${o.to}` : s && s.pos !== formed ? `it walked from plot ${formed} to ${s.pos}` : null;
}, 30000);
check(sought, `with the unclaimed land around it taken, the stack goes looking for more: ${sought ?? "it never left"}`);
A.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const st2 = await nextResult(A, "stack");
const from = (await until(() => view.pump().stacks.get(st2?.stack)))?.pos;
{
  const whole = view.stacks.get(st2.stack)?.troops ?? 0;
  A.ws.send(JSON.stringify({ t: "detach", picks: [{ stack: st2.stack, take: { levy: 3 } }] }));
  const d = await nextResult(A, "detach");
  const part = d?.ok && (await until(() => view.pump().stacks.get(d.stacks[0])));
  const field = view.world.purse?.field;
  check(d?.ok && part && part.troops >= 30 && part.troops < 40 && Math.abs(view.stacks.get(st2.stack).troops + part.troops - whole) < 2 && hello.soldierRules?.troopsEach === 10,
    `three picked soldiers leave their company of ${whole} as a company of ${part?.troops} troops, leaving ${view.stacks.get(st2.stack)?.troops}; the purse counts ${field?.soldiers} of ${field?.cap} soldiers in ${field?.companies} companies`);
  A.ws.send(JSON.stringify({ t: "merge", into: st2.stack, stack: d?.stacks?.[0] }));
  await nextResult(A, "merge");
  A.ws.send(JSON.stringify({ t: "pilot", op: "take", stack: st2.stack }));
  const pt = await nextResult(A, "pilot");
  let far = 0;
  for (const move of [[1, 0], [0, -1], [-1, 0], [0, 1]]) for (let k = 0; k < 8; k++) {
    A.ws.send(JSON.stringify({ t: "pilot", op: "input", move, aim: null, fire: false }));
    await sleep(100);
    for (const m of A.json) if (m.t === "pilots") for (const r of m.p) if (r[1] === st2.stack && pt?.ok) far = Math.max(far, Math.hypot(r[3] - pt.x, r[4] - pt.y));
  }
  const friendSaw = B.json.some(m => m.t === "pilots" && m.p.some(r => r[1] === st2.stack));
  A.ws.send(JSON.stringify({ t: "pilot", op: "release" }));
  const rel = await nextResult(A, "pilot");
  const cleared = await waitFor(A, m => m.t === "pilots" && !m.p.length, 3000);
  check(pt?.ok && far > 1 && friendSaw && rel?.released && cleared, `piloting: the host steers the company ${far.toFixed(1)} plots from where it stood, the friend sees it move, and letting go clears it`);
}
let moved = null;
const far = Math.min(250 * K, Math.floor(hello.w / 3));
for (const i of land.filter((_, k) => k % 211 === 0)) {
  if (from === undefined || Math.abs((i % hello.w) - (from % hello.w)) + Math.abs(Math.floor(i / hello.w) - Math.floor(from / hello.w)) < far) continue;
  const sent = Date.now();
  A.ws.send(JSON.stringify({ t: "move", stack: st2.stack, to: i }));
  if ((await nextResult(A, "move"))?.ok) { moved = { to: i, ms: Date.now() - sent }; break; }
}
check(moved, `a stack takes a move order at least ${far} plots away (reply seen within ${moved?.ms} ms; the test polls every 50 ms)`);
const heading = await until(() => view.pump().world.purse?.orders?.find(o => o.id === st2.stack && o.to === moved?.to), 5000);
const leaked = B.json.some(m => m.t === "purse" && (m.orders ?? []).some(o => o.id === st2.stack));
check(heading && !leaked, `the host's purse says where the moving stack is heading (plot ${heading?.to}); the friend's does not`);
const snap = (x0, y0, r) => {
  for (let d = 0; d < 80 * K; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === d && x >= 0 && y >= 0 && x < M.w && y < M.h && region[y * M.w + x] === r) return y * M.w + x;
  }
  return -1;
};
const points = moved && from !== undefined ? [1 / 3, 2 / 3].map(f => snap(Math.round((from % M.w) * (1 - f) + (moved.to % M.w) * f), Math.round(Math.floor(from / M.w) * (1 - f) + Math.floor(moved.to / M.w) * f), region[from])) : [];
A.ws.send(JSON.stringify({ t: "move", stack: st2.stack, to: moved?.to, via: points }));
const drew = await nextResult(A, "move");
const shownVia = await until(() => view.pump().world.purse?.orders?.find(o => o.id === st2.stack && o.to === moved?.to && o.via?.length === 2 && o.via[1] === points[1]), 5000);
A.ws.send(JSON.stringify({ t: "route", stack: st2.stack, to: moved?.to, via: points }));
const est = await nextResult(A, "route");
check(points.every(p => p >= 0) && drew?.ok && shownVia && est?.ok && est.seconds > 0, `a drawn path through ${points.length} points is taken, the purse lists them (${shownVia?.via?.join(", ")}), and the estimate is ${est?.seconds} s`);
A.ws.send(JSON.stringify({ t: "move", stack: st2.stack, to: moved?.to, via: [terrain.findIndex(t => !isLand(t))] }));
const wet = await nextResult(A, "move");
check(wet?.error === "every point of a drawn path must be on land", `a drawn path over water is refused: "${wet?.error}"`);

const bHello = await waitFor(B, m => m.t === "hello");
const bNation = bHello.you;
const toldOnline = await until(() => A.json.some(m => m.t === "presence" && m.online?.includes(bNation)), 3000);
check(toldOnline && bHello.online?.includes(you) && bHello.online.includes(bNation), `the host is told the friend is online, and the friend's hello lists who is on (${bHello.online?.join(", ")})`);
const dist = i => Math.hypot((i % M.w) - (aSpawn % M.w), Math.floor(i / M.w) - Math.floor(aSpawn / M.w));
let bSpawn = -1;
for (const i of land.filter(i => dist(i) >= 22 * K && dist(i) <= 45 * K).sort((p, q) => dist(p) - dist(q)).filter((_, k) => k % 5 === 0)) {
  A.ws.send(JSON.stringify({ t: "route", stack: st.stack, to: i }));
  const way = await nextResult(A, "route");
  if (!way?.ok || way.plots > 3 * dist(i)) continue;
  B.ws.send(JSON.stringify({ t: "spawn", x: i % M.w, y: Math.floor(i / M.w) }));
  if ((await nextResult(B, "spawn"))?.ok) { bSpawn = i; break; }
}
check(bSpawn >= 0, `the friend spawns ${Math.round(dist(bSpawn))} plots away`);
B.ws.send(JSON.stringify({ t: "stack", share: 0.1 }));
const bs = await nextResult(B, "stack");
B.ws.send(JSON.stringify({ t: "move", stack: st2.stack, to: bSpawn }));
check((await nextResult(B, "move"))?.error === "not your stack", "the friend cannot order the host's stack");
A.ws.send(JSON.stringify({ t: "stack", share: 1 }));
const as = await nextResult(A, "stack");
A.ws.send(JSON.stringify({ t: "route", stack: as?.stack, to: bSpawn }));
const rt = await nextResult(A, "route");
const aStack = await until(() => view.pump().stacks.get(as?.stack));
check(rt?.ok && rt.seconds > 0 && rt.points?.length > 0 && aStack?.order === "hold", `route preview: about ${rt?.plots} plots and ${rt?.seconds} s, ${rt?.points?.length} waypoints, stack not moved`);
const bPlots = (await until(() => view.pump().nations.get(bNation)?.plots > 0 && view.nations.get(bNation)))?.plots;
const bTroops = (await until(() => view.pump().stacks.get(bs?.stack)))?.troops;
A.ws.send(JSON.stringify({ t: "move", stack: as.stack, to: bSpawn }));
check((await nextResult(A, "move"))?.ok, "the host's stack of " + aStack?.troops + " marches on the friend's capital");
const trail = [], trailT0 = Date.now();
const lost = await until(() => {
  const st = view.pump().stacks.get(as.stack);
  if (st && (!trail.length || Date.now() - trail.at(-1).t > 5000)) trail.push({ t: Date.now(), p: `${Math.round((Date.now() - trailT0) / 1000)}s:${st.pos % M.w},${Math.floor(st.pos / M.w)}` });
  return view.events.find(e => e.type === "plot_lost" && e.nation === bNation && e.by === you);
}, 120000);
const why = lost ? "" : (() => { const st = view.stacks.get(as.stack); const ev = view.events.filter(e => e.stack === as.stack).map(e => e.type).slice(-6); return ` [host stack ${st ? `${st.order} at ${st.pos % M.w},${Math.floor(st.pos / M.w)} with ${st.troops}` : "gone"}; friend capital ${bSpawn % M.w},${Math.floor(bSpawn / M.w)}; stack events ${ev.join(", ") || "none"}; host capital ${aSpawn % M.w},${Math.floor(aSpawn / M.w)}; route preview ${rt?.plots} plots; trail ${trail.map(x => x.p).join(" ")}]`; })();
check(lost, `territory changes hands: plot_lost for the friend (${lost?.count} plots in one tick)${why}`);
const fought = await until(() => view.pump().events.find(e => e.type === "stack_destroyed" && e.stack === bs?.stack), 60000);
const cleared = await until(() => !view.pump().stacks.has(bs?.stack));
check(fought && cleared, `battle resolved: the friend's stack of ${bTroops} was destroyed; the host's stack has ${view.stacks.get(as.stack)?.troops} left`);
const shrunk = await until(() => view.pump().nations.get(bNation)?.plots < bPlots && view.nations.get(bNation));
check(shrunk, `the friend's land fell from ${bPlots} to ${shrunk?.plots} plots`);
const burst = [];
for (let k = 0; k < 60; k++) B.ws.send(JSON.stringify({ t: "ping", at: k }));
await until(() => B.json.filter(m => m.t === "pong" || m.error === "slow down").length >= 60, 5000);
const pongs = B.json.filter(m => m.t === "pong").length, slowed = B.json.filter(m => m.error === "slow down").length;
check(pongs < 60 && slowed > 0, `rate limit: 60 messages at once gave ${pongs} answers and ${slowed} "slow down"`);
await sleep(2100);
let won = null;
const cheb = (p, q) => Math.max(Math.abs((p % M.w) - (q % M.w)), Math.abs(Math.floor(p / M.w) - Math.floor(q / M.w)));
for (const end = Date.now() + 90000; !won && Date.now() < end; ) {
  const mine = view.pump().stacks.get(as.stack);
  if (mine?.order === "hold") {
    mirror.pump();
    let target = -1;
    for (let i = 0; i < mirror.owner.length; i++) if (mirror.owner[i] === bNation && (target < 0 || cheb(i, mine.pos) < cheb(target, mine.pos))) target = i;
    if (target >= 0 && cheb(target, mine.pos) <= 4) A.ws.send(JSON.stringify({ t: "advance", stack: as.stack }));
    else if (target >= 0) A.ws.send(JSON.stringify({ t: "move", stack: as.stack, to: target }));
    await sleep(300);
  }
  won = await waitFor(A, m => m.t === "victory", 700);
}
const bSaw = await waitFor(B, m => m.t === "victory", 2000);
check(won?.winner === you && bSaw, `the friend is eliminated and both players hear that ${won?.name} has won`);
A.ws.send(JSON.stringify({ t: "stack", share: 0.5 }));
check((await nextResult(A, "stack"))?.error === "the world has ended", "the world is frozen after the win: orders are refused");
const frozen = (await api(`/api/worlds/${wid}/status`, null, ta)).body;
check(frozen.frozen && frozen.looping === false && frozen.victory?.winner === you, "the simulation has stopped and the win is saved");
A.ws.close(); B.ws.close();
await sleep(800);
const status = await api(`/api/worlds/${wid}/status`, null, ta);
check(status.body.looping === false && status.body.online === 0, "loop stops when everyone leaves");
const A2 = await connect(wid, ta);
const hello2 = await waitFor(A2, m => m.t === "hello");
const again = hello2?.nations.find(n => n.id === hello.you);
check(again && again.plots >= mine.plots && hello2.you === hello.you && hello2.frozen, "same nation and territory after reconnecting, and the world still shows as won");
const A3 = await connect(wid, ta);
await waitFor(A3, m => m.t === "hello");
const replaced = await waitFor(A2, m => m.t === "replaced");
check(replaced && A2.ws.readyState >= 2 && A3.ws.readyState === 1, `a second tab replaces the first, which is told why and closed (message ${!!replaced}, old state ${A2.ws.readyState}, new state ${A3.ws.readyState})`);
const old = await connect(wid, ta, 0);
await waitFor(old, m => m.t === "error");
for (let k = 0; k < 40 && !old.closed; k++) await sleep(50);
check(old.json[0]?.code === "protocol" && old.closed?.code === CLOSE.PROTOCOL, "a client with the wrong protocol version is told to reload");
A3.ws.close();
await sleep(800);
const saved = (await api(`/api/worlds/${wid}/status`, null, ta)).body;
const ls = saved.lastSave;
check(ls && ls.maxSteady <= 6, `saves wrote at most ${ls?.maxSteady} rows each once every layer has its row (${ls?.maxRows} including first writes, which also write the key index), ${ls?.totalRows} rows over ${ls?.saves} saves (last: ${ls?.rows} rows, owner layer ${ls?.ownerBytes} bytes, ${ls?.ms} ms; biggest save ${JSON.stringify(ls?.worst)})`);
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./.last.json", import.meta.url), JSON.stringify({ wid, token: ta, you: hello.you, plots: again.plots, hashes: saved.hashes }));

const pal = await api("/api/register", { name: "pal" + suffix, password: "pal password", invite: INVITE });
const tp = pal.body.token, palId = pal.body.account?.id;
const refused = [];
for (const [path, body] of [["/api/admin/accounts"], ["/api/admin/log"], [`/api/admin/accounts/${palId}/password`, { password: "sneaky pass" }], [`/api/admin/accounts/${palId}/remove`, {}], [`/api/admin/worlds/${wid}/delete`, {}]]) {
  const r = await api(path, body, tp);
  if (r.status !== 403 || r.body.error !== "not allowed") refused.push(`${path}: ${r.status}`);
}
check(!refused.length && (await api(`/api/worlds`, null, ta)).body.some(w => w.id === wid), `a friend gets 403 "not allowed" from all five admin routes, and nothing changed${refused.length ? ": " + refused.join(", ") : ""}`);
const aw = await api("/api/worlds", { name: "Admin test", config: { w: 120, h: 90, seed: 3, bots: 2 } }, ta);
const awid = aw.body.id;
await api(`/api/worlds/${awid}/join`, {}, tp);
const H = await connect(awid, ta), P = await connect(awid, tp);
const hh = await waitFor(H, m => m.t === "hello"), ph = await waitFor(P, m => m.t === "hello");
const spawnSomewhere = async (who, xs) => {
  for (let y = 12; y < 80; y += 9) for (const x of xs) {
    who.ws.send(JSON.stringify({ t: "spawn", x, y }));
    if ((await nextResult(who, "spawn"))?.ok) return true;
  }
  return false;
};
const placed = (await spawnSomewhere(H, [15, 25, 35])) && (await spawnSomewhere(P, [100, 90, 80]));
const adminOp = async (who, m) => { who.ws.send(JSON.stringify({ t: "admin", ...m })); return nextResult(who, "admin"); };
P.ws.send(JSON.stringify({ t: "admin", op: "give", nation: ph.you, what: "money", amount: 5000 }));
const sneaky = await nextResult(P, "admin");
check(placed && sneaky?.ok === false && sneaky.error === "not allowed", `inside a world a friend's admin order is refused: "${sneaky?.error}"`);
await until(() => H.json.some(m => m.t === "purse"), 5000);
const gift = await adminOp(H, { op: "give", nation: hh.you, what: "money", amount: 5000 });
const rich = await until(() => H.json.filter(m => m.t === "purse").at(-1)?.money >= 5000 ? H.json.filter(m => m.t === "purse").at(-1).money : 0, 5000);
check(gift?.ok && gift.now >= 5000 && rich, `the host gives themself 5000 gold: ${gift?.now} now, and the purse shows ${rich}`);
const knights = await adminOp(H, { op: "give", nation: hh.you, what: "unit", unit: "knight", amount: 200 });
H.ws.send(JSON.stringify({ t: "stack", share: 0.5 }));
const ks = await nextResult(H, "stack");
const knightNum = hh.units?.find(u => u.id === "knight")?.num;
const mixSeen = sock => until(() => sock.json.some(m => m.t === "state" && (m.s ?? []).some(r => r[0] === ks?.stack && r[5]?.[0] === knightNum && r[5][1] >= 90 && r[5][1] <= 110)), 5000);
const hostMix = await mixSeen(H), friendMix = await mixSeen(P);
check(knights?.ok && knights.now === 200 && ks?.ok && knightNum && hostMix && friendMix, `200 knights given to the host; a half-share stack takes about 100 of them, and both players see its mix`);
const amap = makeTestMap(120, 90, 3), AW = 120, axy = i => `${i % AW},${Math.floor(i / AW)}`;
await adminOp(H, { op: "speed", factor: 4 });
const gCat = await adminOp(H, { op: "give", nation: hh.you, what: "machine", unit: "catapult", amount: 1 });
const gCog = await adminOp(H, { op: "give", nation: hh.you, what: "machine", unit: "cog", amount: 1 });
const catId = gCat?.machines?.[0], cogId = gCog?.machines?.[0];
const mrow = (sock, id) => { let row = null; for (const m of sock.json) if (m.t === "state") for (const r of m.m ?? []) if (r[0] === id) row = r; return row; };
const seenMachines = await until(() => mrow(H, catId) && mrow(H, cogId) && mrow(P, catId) && mrow(P, cogId), 5000);
const cogAt = mrow(H, cogId)?.[3];
check(gCat?.ok && gCog?.ok && seenMachines && !isLand(amap.terrain[cogAt]) && mrow(P, catId)?.[2] === hh.units.find(u => u.id === "catapult")?.num,
  `the host is given a catapult and a cog, and both players see them (the cog floats at ${cogAt === undefined ? "?" : axy(cogAt)})`);
H.ws.send(JSON.stringify({ t: "produce", building: 999999, type: "catapult" }));
const noShop = await nextResult(H, "produce");
H.ws.send(JSON.stringify({ t: "machine", machine: catId, do: "follow", stack: ks?.stack }));
const fol = await nextResult(H, "machine");
const folPurse = await until(() => H.json.filter(m => m.t === "purse").at(-1)?.machines?.orders?.some(o => o.id === catId && o.follow === ks?.stack), 5000);
check(noShop?.error === "not your building" && fol?.ok && folPurse, `machine orders reach the server: a queue at a missing building is refused ("${noShop?.error}"), and the catapult follows the knights, as the purse shows`);
H.ws.send(JSON.stringify({ t: "board", stack: ks?.stack, ship: cogId }));
const brd = await nextResult(H, "board");
const aboard = await until(() => { const r = mrow(H, cogId); return r && r[6] > 0 ? r[6] : 0; }, 30000);
const emb = H.json.some(m => m.t === "events" && m.events.some(e => e.type === "embarked" && e.machine === cogId));
check(brd?.ok && aboard > 0 && emb, `the knights march to the shore and board the cog: ${aboard} troops aboard${brd?.ok ? "" : ` (${brd?.error})`}`);
const shore = [];
for (let i = 0; i < amap.terrain.length && cogAt !== undefined; i++) {
  const d = Math.max(Math.abs((i % AW) - (cogAt % AW)), Math.abs(Math.floor(i / AW) - Math.floor(cogAt / AW)));
  if (d < 12 || d > 40 || !isLand(amap.terrain[i])) continue;
  if ([i - 1, i + 1, i - AW, i + AW].some(j => amap.terrain[j] !== undefined && !isLand(amap.terrain[j]))) shore.push([d, i]);
}
shore.sort((p, q) => p[0] - q[0]);
let landAt = null, landOrder = null;
for (const [, i] of shore.slice(0, 25)) {
  H.ws.send(JSON.stringify({ t: "machine", machine: cogId, do: "land", at: i }));
  landOrder = await nextResult(H, "machine");
  if (landOrder?.ok) { landAt = i; break; }
}
const landed = await until(() => H.json.flatMap(m => (m.t === "events" ? m.events : [])).find(e => e.type === "landed" && e.machine === cogId), 30000);
const ashore = landed && await until(() => H.json.some(m => m.t === "state" && (m.s ?? []).some(r => r[0] === landed.stack && r[2] === landAt)), 5000);
check(landOrder?.ok && landed && ashore && landed.troops > aboard * 0.8 && landed.troops <= aboard * 0.85 + 1e-6,
  `the cog sails off and lands them on the coast at ${landAt === null ? "?" : axy(landAt)}: ${Math.round(landed?.troops ?? 0)} of ${aboard} ashore after the 15% landing loss${landOrder?.ok ? "" : ` (${landOrder?.error})`}`);
await adminOp(H, { op: "speed", factor: 1 });
const done = await adminOp(H, { op: "finish", nation: hh.you });
check(done?.ok && done.done.join() === "fire_keeping,stone_tools,foraging,barter,farming", `finishing the research queue completes ${done?.done?.join(", ")}`);
const t0 = (await api(`/api/worlds/${awid}/status`, null, ta)).body.time;
const sp = await adminOp(H, { op: "speed", factor: 4 });
await sleep(2000);
const t1 = (await api(`/api/worlds/${awid}/status`, null, ta)).body.time;
const heardSpeed = await waitFor(P, m => m.t === "speed" && m.factor === 4, 2000);
check(sp?.ok && t1 - t0 > 5 && heardSpeed, `at 4x speed about 2 s of real time moved the world on ${(t1 - t0).toFixed(1)} s, and the friend was told`);
await adminOp(H, { op: "speed", factor: 1 });
const badSpeed = await adminOp(H, { op: "speed", factor: 99 });
check(badSpeed?.ok === false && /from 1 to 8/.test(badSpeed.error), `an out-of-range speed is refused: "${badSpeed?.error}"`);
const rn = await adminOp(H, { op: "rename", name: "Renamed test" });
const heardName = await waitFor(P, m => m.t === "renamed" && m.name === "Renamed test", 2000);
const listed = (await api("/api/worlds", null, ta)).body.find(w => w.id === awid)?.name;
check(rn?.ok && heardName && listed === "Renamed test", `renaming reaches the friend and the world list: "${listed}"`);
const ended = await adminOp(H, { op: "end" });
const heardEnd = await waitFor(P, m => m.t === "ended", 2000);
P.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const refusedOrder = await nextResult(P, "stack");
const reopened = await adminOp(H, { op: "reopen" });
const heardReopen = await waitFor(P, m => m.t === "reopened", 2000);
P.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const acceptedOrder = await nextResult(P, "stack");
check(ended?.ok && heardEnd && refusedOrder?.error === "the world has ended" && reopened?.ok && heardReopen && acceptedOrder?.ok, `ending freezes the world for everyone ("${refusedOrder?.error}"), and reopening lets orders through again`);
P.ws.send(JSON.stringify({ t: "advance", stack: acceptedOrder?.stack }));
const pAdvance = await nextResult(P, "advance");
const pGoing = await until(() => H.json.some(m => m.t === "state" && (m.s ?? []).some(r => r[0] === acceptedOrder?.stack && r[4] === 2)), 5000);
const selfKick = await adminOp(H, { op: "kick", nation: hh.you });
const beforeKick = H.json.length;
const kick = await adminOp(H, { op: "kick", nation: ph.you });
const told = await waitFor(P, m => m.t === "removed", 2000);
for (let k = 0; k < 40 && !P.closed; k++) await sleep(50);
const rejoin = await api(`/api/worlds/${awid}/join`, {}, tp);
const back = await connect(awid, tp).then(g => { g.ws.close(); return true; }, () => false);
const stays = await adminOp(H, { op: "give", nation: ph.you, what: "troops", amount: 10 });
const palList = (await api("/api/worlds", null, tp)).body.find(w => w.id === awid);
check(selfKick?.error === "you cannot remove yourself" && kick?.ok && told && P.closed?.code === CLOSE.REMOVED && rejoin.body.error === "the host removed you from this world" && !back && stays?.ok && palList?.removed === 1,
  `removing the friend closes their game with "${told?.text}", they cannot rejoin ("${rejoin.body.error}") or reconnect, their nation stays, and their list marks the world`);
await sleep(3000);
const pRows = H.json.slice(beforeKick).filter(m => m.t === "state").flatMap(m => (m.s ?? []).filter(r => r[0] === acceptedOrder?.stack));
const tookFromHost = H.json.slice(beforeKick).some(m => m.t === "events" && m.events.some(e => e.type === "plot_lost" && e.nation === hh.you && e.by === ph.you));
const heldAway = pRows.length > 0 && pRows.at(-1)[4] === 2 && !tookFromHost;
const heardAway = H.json.filter(m => m.t === "presence").at(-1)?.online.includes(ph.you) === false;
check(pAdvance?.ok && pGoing && heldAway && heardAway, `the removed friend shows as away, and their advance keeps taking unclaimed land while they are gone, never the host's${pAdvance?.ok && pGoing && heldAway && heardAway ? "" : ` (advance ${pAdvance?.ok ?? pAdvance?.error}, seen advancing ${!!pGoing}, still going ${!!heldAway}, away ${heardAway})`}`);
const accounts = (await api("/api/admin/accounts", null, ta)).body;
const palRow = accounts.find(a => a.id === palId);
check(Array.isArray(accounts) && palRow?.name === "pal" + suffix && palRow.lastLogin > 0 && accounts.some(a => a.admin), `the host lists ${accounts.length} accounts with worlds and last login`);
const reset = await api(`/api/admin/accounts/${palId}/password`, { password: "fresh password" }, ta);
const oldToken = await api("/api/me", null, tp);
const oldPass = await api("/api/login", { name: "pal" + suffix, password: "pal password" });
const newPass = await api("/api/login", { name: "pal" + suffix, password: "fresh password" });
const short = await api(`/api/admin/accounts/${palId}/password`, { password: "short" }, ta);
check(reset.body.ok && oldToken.status === 401 && oldPass.status === 401 && newPass.status === 200 && short.body.error === "password must be at least 8 characters", "a new password logs the friend out everywhere; the old one stops working, the new one works, short ones are refused");
const pw = await api("/api/register", { name: "pw" + suffix, password: "first password", invite: INVITE });
const pwOther = await api("/api/login", { name: "pw" + suffix, password: "first password" });
const pt1 = pw.body.token, pt2 = pwOther.body.token;
const pwWrong = await api("/api/password", { current: "not it at all", password: "second password" }, pt1);
const pwShort = await api("/api/password", { current: "first password", password: "short" }, pt1);
const pwSame = await api("/api/password", { current: "first password", password: "first password" }, pt1);
const pwOk = await api("/api/password", { current: "first password", password: "second password" }, pt1);
const pwAnon = await api("/api/password", { current: "second password", password: "third password" });
const [meHere, meThere] = [await api("/api/me", null, pt1), await api("/api/me", null, pt2)];
const [oldLogin, newLogin] = [await api("/api/login", { name: "pw" + suffix, password: "first password" }), await api("/api/login", { name: "pw" + suffix, password: "second password" })];
check(pwWrong.body.error === "your current password is wrong" && pwShort.body.error === "password must be at least 8 characters" && pwSame.body.error === "the new password is the same as the old one" && pwAnon.status === 401,
  "a player's password change needs their current password, 8 characters and a new one, and a login");
check(pwOk.body.ok && pwOk.body.others === 1 && meHere.status === 200 && meThere.status === 401 && oldLogin.status === 401 && newLogin.status === 200,
  `changing your own password keeps this session, logs out ${pwOk.body.others} other, and only the new password works`);
const selfRemove = await api(`/api/admin/accounts/${alogin.body.account.id}/remove`, {}, ta);
const gone = await api(`/api/admin/accounts/${palId}/remove`, {}, ta);
const goneLogin = await api("/api/login", { name: "pal" + suffix, password: "fresh password" });
check(selfRemove.body.error === "you cannot remove your own account" && gone.body.ok && goneLogin.status === 401 && !(await api("/api/admin/accounts", null, ta)).body.some(a => a.id === palId), `removing an account stops its logins ("${goneLogin.body.error}"); the host cannot remove themself`);
const hLog = await adminOp(H, { op: "log" });
check(hLog?.ok && ["kick", "end", "reopen", "rename", "speed", "finish", "give"].every(op => hLog.log.some(e => e.op === op)), `the world's admin log has every action: ${hLog?.log?.map(e => e.op).join(", ")}`);
const del = await api(`/api/admin/worlds/${awid}/delete`, {}, ta);
const toldDeleted = await waitFor(H, m => m.t === "deleted", 2000);
for (let k = 0; k < 40 && !H.closed; k++) await sleep(50);
const afterDelete = await api("/api/worlds", null, ta);
const statusGone = await api(`/api/worlds/${awid}/status`, null, ta);
check(del.body.ok && toldDeleted && H.closed?.code === CLOSE.DELETED && !afterDelete.body.some(w => w.id === awid) && statusGone.status === 403, `deleting the world closes the host's game ("${toldDeleted?.text}") and it is gone from the list`);
const sw = await api("/api/worlds", { name: "Away test", config: { w: 120, h: 90, seed: 5, bots: 0, rules: { buildSpeed: 20, sleepSpeed: 3600 } } }, ta);
const swid = sw.body.id;
let Z = await connect(swid, ta);
const zh = await waitFor(Z, m => m.t === "hello");
let zAt = null;
for (let y = 20; y < 75 && !zAt; y += 9) for (const x of [30, 50, 70]) {
  Z.ws.send(JSON.stringify({ t: "spawn", x, y }));
  if ((await nextResult(Z, "spawn"))?.ok) { zAt = { x, y }; break; }
}
await until(() => Z.json.some(m => m.t === "purse"), 5000);
Z.ws.send(JSON.stringify({ t: "zone", zone: "res", x: zAt.x - 7, y: zAt.y - 7, w: 14, h: 5 }));
const zZone = await nextResult(Z, "zone");
await adminOp(Z, { op: "give", nation: zh.you, what: "money", amount: 2000 });
const zBefore = Z.json.filter(m => m.t === "purse").at(-1);
Z.ws.close();
let asleep = false;
for (let k = 0; k < 50 && !asleep; k++) { asleep = !(await api(`/api/worlds/${swid}/status`, null, ta)).body.looping; if (!asleep) await sleep(100); }
await sleep(12000);
Z = await connect(swid, ta);
const zBack = await waitFor(Z, m => m.t === "hello");
const zCaught = await waitFor(Z, m => m.t === "catchup" && m.left === 0, 20000);
const zAway = await waitFor(Z, m => m.t === "away", 5000);
const zStatus = (await api(`/api/worlds/${swid}/status`, null, ta)).body;
check(zAt && zZone?.ok && asleep && zCaught && zAway && zAway.caught >= 11.9 * 3600 && zStatus.lastCatchUp?.ms < 2000,
  `a world left for 12 game hours catches up ${zAway?.caught ? (zAway.caught / 3600).toFixed(1) : "?"} hours in ${zStatus.lastCatchUp?.ms} ms when its player returns`);
writeFileSync(new URL("./.last.json", import.meta.url), JSON.stringify({ ...JSON.parse((await import("node:fs")).readFileSync(new URL("./.last.json", import.meta.url))), awayWid: swid }));
check(zAway && zAway.gold > 0 && zAway.pop[1] > zAway.pop[0] && zAway.town > 0 && zAway.share === 0.9,
  `the "while you were away" summary shows the economy moved on: ${zAway?.gold} gold, people ${zAway?.pop?.join(" to ")}, ${zAway?.town} town buildings, research ${zAway?.researched?.length}, output at ${zAway?.share}`);
Z.ws.close();
const gw = await api("/api/worlds", { name: "Guard test", config: { w: 120, h: 90, seed: 5, bots: 0, rules: { stackSpeed: 6 } } }, ta);
const gwid = gw.body.id;
await api(`/api/worlds/${gwid}/join`, {}, tb);
const GA = await connect(gwid, ta), GB = await connect(gwid, tb);
const gah = await waitFor(GA, m => m.t === "hello"), gbh = await waitFor(GB, m => m.t === "hello");
const gTerrain = new Mirror(GA, gah);
await gTerrain.load();
const gLand = (x, y) => x >= 0 && y >= 0 && x < 120 && y < 90 && isLand(gTerrain.terrain[y * 120 + x]);
let gSpots = null;
for (let y = 20; y < 70 && !gSpots; y += 3) for (let x = 20; x < 90 && !gSpots; x += 3) {
  if (!gLand(x, y) || !gLand(x + 17, y)) continue;
  let joined = true;
  for (let k = 0; k <= 17; k++) if (!gLand(x + k, y)) joined = false;
  if (joined) gSpots = [x, y];
}
let gOk = false;
if (gSpots) {
  const [gx, gy] = gSpots;
  GA.ws.send(JSON.stringify({ t: "spawn", x: gx, y: gy }));
  const sa = await nextResult(GA, "spawn");
  GB.ws.send(JSON.stringify({ t: "spawn", x: gx + 17, y: gy }));
  const sb = await nextResult(GB, "spawn");
  GA.ws.send(JSON.stringify({ t: "guard", home: true }));
  const guardOn = await nextResult(GA, "guard");
  await sleep(1500);
  GB.ws.send(JSON.stringify({ t: "attack", at: gy * 120 + gx }));
  const attack = await nextResult(GB, "attack");
  const sent = await waitFor(GA, m => m.t === "events" && m.events.some(e => e.type === "guard_sent" && e.nation === gah.you), 8000);
  const ev = sent?.events.find(e => e.type === "guard_sent");
  const mine = await until(() => GA.json.filter(m => m.t === "state").some(m => (m.s ?? []).some(r => r[1] === gah.you)), 3000);
  gOk = sa?.ok && sb?.ok && guardOn?.ok && attack?.ok && ev && ev.enemy === gbh.you && ev.troops > 0 && mine;
  check(gOk, `with Guard on, the host's home troops form a stack of ${ev?.troops} to meet the friend's attack (spawn ${sa?.ok}/${sb?.ok}, guard ${guardOn?.ok}, attack ${attack?.ok ?? attack?.error})`);
} else check(false, "the guard test map has two spots joined by land");
GA.ws.close();
GB.ws.close();
const sch = await api("/api/worlds", { name: "Schedule test", config: { w: 120, h: 90, seed: 8, bots: 0 } }, ta);
const schId = sch.body.id;
await api(`/api/worlds/${schId}/join`, {}, tb);
const SA = await connect(schId, ta), SB = await connect(schId, tb);
const sah = await waitFor(SA, m => m.t === "hello"), sbh = await waitFor(SB, m => m.t === "hello");
const sch0 = Date.now(), sec = k => sch0 + k * 1000;
const setSchedule = schedule => { SA.ws.send(JSON.stringify({ t: "admin", op: "schedule", schedule })); return nextResult(SA, "admin"); };
const badOrder = await setSchedule({ startAt: sec(20), peaceUntil: sec(10) });
const planned = await setSchedule({ startAt: sec(6), peaceUntil: sec(12), overtimeAt: sec(16), endAt: sec(34), shrinkEvery: 30 });
const heard = await waitFor(SB, m => m.t === "schedule", 2000);
SB.ws.send(JSON.stringify({ t: "spawn", x: 90, y: 45 }));
const earlySpawn = await nextResult(SB, "spawn");
SA.ws.send(JSON.stringify({ t: "spawn", x: 25, y: 45 }));
await nextResult(SA, "spawn");
SB.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const earlyStack = await nextResult(SB, "stack");
check(sah.schedule && sah.info?.win === "last" && badOrder?.error === "peace ends must come after the world starts" && planned?.ok && heard?.schedule.endAt === sec(34) && earlySpawn?.ok && /^the world starts at/.test(earlyStack?.error ?? ""),
  `the host schedules start, peace, overtime and end; everyone hears it; before the start you can spawn but not act ("${earlyStack?.error}")`);
const started = await waitFor(SB, m => m.t === "phase" && m.key === "startAt", 10000);
SA.ws.send(JSON.stringify({ t: "admin", op: "speed", factor: 8 }));
await nextResult(SA, "admin");
SB.ws.send(JSON.stringify({ t: "attack", at: 45 * 120 + 25 }));
const peaceful = await nextResult(SB, "attack");
check(started && /^you are at peace with/.test(peaceful?.error ?? ""), `at the start time the world opens, and until peace ends players cannot attack each other ("${peaceful?.error}")`);
const overtime = await waitFor(SA, m => m.t === "phase" && m.key === "overtimeAt", 15000);
const plots0 = await until(() => SA.json.filter(m => m.t === "state").flatMap(m => m.n ?? []).filter(r => r[0] === sah.you).at(-1)?.[1] ?? null, 2000);
const shrank = await waitFor(SA, m => m.t === "events" && m.events.some(e => e.type === "overtime_shrink"), 12000);
await sleep(1000);
const plots1 = SA.json.filter(m => m.t === "state").flatMap(m => m.n ?? []).filter(r => r[0] === sah.you).at(-1)?.[1];
const counting = SA.json.findLast(m => m.t === "state" && m.shrinkIn !== undefined)?.shrinkIn;
check(overtime && shrank && plots1 < plots0 && counting !== undefined, `in overtime the outer land shrinks: the host went from ${plots0} to ${plots1} plots, and the state counts down to the next shrink (${counting} s; phase ${!!overtime}, event ${!!shrank})`);
const schWon = await waitFor(SA, m => m.t === "victory", 25000);
check(schWon && (schWon.winner === sah.you || schWon.winner === sbh.you), `at the end time the world ends and ${schWon?.name} wins with the most land of the players left`);
SA.ws.close();
SB.ws.close();
const hour = Date.now() + 3600e3;
const badMade = await api("/api/worlds", { name: "Bad schedule", config: { w: 120, h: 90, seed: 9, bots: 0, schedule: { startAt: hour, peaceUntil: hour - 60e3 } } }, ta);
const wat = await api("/api/worlds", { name: "Watch test", config: { w: 120, h: 90, seed: 9, bots: 2, schedule: { startAt: hour } } }, ta);
const watId = wat.body.id;
const HA = await connect(watId, ta);
const hah = await waitFor(HA, m => m.t === "hello");
check(badMade.status === 400 && /must come after/.test(badMade.body.error ?? "") && wat.status === 200 && hah?.schedule?.startAt === hour,
  `a world can be scheduled as it is made, and a bad schedule refuses it ("${badMade.body.error}")`);
const W = await connect(watId, tb, PROTOCOL, "&watch=1");
const wh = await waitFor(W, m => m.t === "hello");
W.ws.send(JSON.stringify({ t: "spawn", x: 60, y: 45 }));
const watchOrder = await nextResult(W, "spawn", 1500);
const playAs = await connect(watId, tb).then(() => "opened", () => "refused");
await sleep(500);
const watchStatus = (await api(`/api/worlds/${watId}/status`, null, ta)).body;
check(wh?.you === null && wh.watch === true && wh.purse === null && !watchOrder && playAs === "refused" && !HA.json.some(m => m.t === "joined" && m.nation !== hah.you) && !HA.json.some(m => m.t === "presence" && m.online.length > 1) && watchStatus.players === 1,
  `a non-member can watch a world live (${wh?.nations?.length} nations) without a nation, a presence light or orders, and still cannot play it without joining (${watchStatus.players} player)`);
const httpSched = await api(`/api/admin/worlds/${watId}/schedule`, { schedule: { startAt: hour + 3600e3 } }, ta);
const friendSched = await api(`/api/admin/worlds/${watId}/schedule`, { schedule: { startAt: hour } }, tb);
const heardHttp = await waitFor(HA, m => m.t === "schedule", 2000), watcherHeard = await waitFor(W, m => m.t === "schedule", 2000);
const watchListed = (await api("/api/worlds", null, tb)).body.find(w => w.id === watId);
check(httpSched.status === 200 && friendSched.status === 403 && heardHttp?.schedule.startAt === hour + 3600e3 && watcherHeard && watchListed?.schedule?.startAt === hour + 3600e3 && watchListed.map === "test",
  `the host schedules a world from the list, players and watchers hear at once, the list shows the new time, and a friend cannot (${friendSched.status})`);
W.ws.close();
HA.ws.close();
const indWorld = await api("/api/worlds", { name: "Industry test", config: { w: 160, h: 100, seed: 5, bots: 0, rules: { buildSpeed: 60, produceSpeed: 5 } } }, ta);
const IN = await connect(indWorld.body.id, ta);
const ih = await waitFor(IN, m => m.t === "hello");
const IM = await new Mirror(IN, ih).load();
const ask = async m => { IN.ws.send(JSON.stringify(m)); return nextResult(IN, m.t, 8000); };
let inSpawn = false;
for (let y = 20; y < 85 && !inSpawn; y += 8) for (const x of [40, 80, 120]) if ((inSpawn = !!(await ask({ t: "spawn", x, y }))?.ok)) break;
await adminOp(IN, { op: "speed", factor: 8 });
await adminOp(IN, { op: "give", nation: ih.you, what: "troops", amount: 6000 });
const inStack = await ask({ t: "stack", share: 0.9 });
await ask({ t: "advance", stack: inStack?.stack, only: "free" });
for (const id of ["railways", "field_guns"]) await ask({ t: "research", id, mode: "queue" });
const inFin = await adminOp(IN, { op: "finish", nation: ih.you });
await adminOp(IN, { op: "give", nation: ih.you, what: "money", amount: 100000 });
const inPurse = () => IM.pump().world.purse;
const industrial = await until(() => inPurse()?.era === "I" && inPurse().money >= 50000, 8000);
check(inSpawn && inFin?.ok && ["age_industry", "steelmaking", "steam_power", "railways"].every(id => inFin.done.includes(id)) && industrial,
  `a nation researches through Gunpowder into the Industrial era: ${inFin?.done?.length} nodes, ending ${inFin?.done?.slice(-4).join(", ")}`);
await until(() => IM.pump().world.owner.reduce((t, o) => t + (o === ih.you), 0) >= 600, 30000);
const inCap = IM.world.nations.get(ih.you).capital;
const spotFor = (type, near, lo, hi) => {
  const w = IM.pump().world;
  for (let r = lo; r <= hi; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = (near % w.w) + dx, y = ((near / w.w) | 0) + dy;
    if (x < 1 || y < 1 || x >= w.w - 4 || y >= w.h - 4) continue;
    const i = y * w.w + x;
    if (!w.placeError(type, i)) return i;
  }
  return null;
};
const buildAt = async (type, at) => {
  const r = at === null || at === undefined ? null : await ask({ t: "build", type, at });
  if (r?.ok) await until(() => IM.pump().world.buildings.get(r.building), 5000);
  return r?.ok ? r.building : null;
};
const millId = await buildAt("vehicle_factory", spotFor("vehicle_factory", inCap, 3, 9));
const plantId = await buildAt("coal_plant", millId && spotFor("coal_plant", IM.world.buildings.get(millId).anchor, 3, 5));
const bothUp = await until(() => [millId, plantId].every(id => IM.pump().world.buildings.get(id)?.state === "active"), 20000);
const gold0 = inPurse()?.money ?? 0;
const powered = await until(() => { const p = inPurse()?.power; return p?.grids?.[0]?.[2] === 100 && p.users?.[millId] >= 0 && p.plants?.[plantId]?.[0] === 1 ? p.grids[0] : null; }, 15000);
check(millId && plantId && bothUp && powered,
  `a vehicle factory beside a coal plant runs on full power, the plant paid in gold (grid ${JSON.stringify(powered)}: made, used, % met; gold ${Math.floor(gold0)} then ${Math.floor(inPurse()?.money ?? 0)})`);
const aId = await buildAt("station_large", spotFor("station_large", inCap, 4, 12));
const aAt = aId ? IM.world.buildings.get(aId).anchor : null;
const bId = await buildAt("station_large", aAt === null ? null : spotFor("station_large", aAt, 14, 24));
const bAt = bId ? IM.world.buildings.get(bId).anchor : null;
const stationsUp = await until(() => [aId, bId].every(id => IM.pump().world.buildings.get(id)?.state === "active"), 20000);
const beside = (id, toward) => {
  const w = IM.pump().world, b = w.buildings.get(id), set = new Set(b.plots), out = [];
  for (const p of b.plots) for (const q of [p - 1, p + 1, p - w.w, p + w.w]) if (!set.has(q) && w.owner[q] === ih.you && !w.buildingAt(q) && isLand(w.terrain[q])) out.push(q);
  return out.sort((p, q) => Math.hypot(p % w.w - toward % w.w, ((p / w.w) | 0) - ((toward / w.w) | 0)) - Math.hypot(q % w.w - toward % w.w, ((q / w.w) | 0) - ((toward / w.w) | 0)))[0] ?? null;
};
const railFrom = aId && bId ? beside(aId, bAt) : null, railTo = aId && bId ? beside(bId, aAt) : null;
const rail = railFrom !== null && railTo !== null ? await ask({ t: "road", kind: "rail", from: railFrom, to: railTo }) : null;
const trade0 = inPurse()?.trade?.total ?? 0;
await adminOp(IN, { op: "speed", factor: 1 });
const train = await until(() => IN.json.filter(m => m.t === "state").flatMap(m => m.c ?? []).find(r => r[8] === 1 && (r[6] === bAt || r[6] === aAt)), 20000);
const earned = await until(() => (inPurse()?.trade?.total ?? 0) > trade0 ? inPurse().trade : null, 30000);
check(stationsUp && rail?.ok && rail.laid > 8 && train && earned,
  `rail between two railway stations (${rail?.laid} plots for ${JSON.stringify(rail?.cost)}) runs trains worth ${train?.[4]} gold a trip, and trade has earned ${earned?.total} gold${rail?.ok ? "" : ` (${rail?.error})`}`);
{
  await ask({ t: "research", id: "flight", mode: "queue" });
  await adminOp(IN, { op: "finish", nation: ih.you });
  await until(() => !IM.pump().world.lockOf("airfield"), 5000);
  const fieldId = await buildAt("airfield", spotFor("airfield", inCap, 3, 14));
  const fieldUp = await until(() => IM.pump().world.buildings.get(fieldId)?.state === "active", 20000);
  const gift = await adminOp(IN, { op: "give", nation: ih.you, what: "machine", unit: "early_bomber", amount: 1 });
  const bomberId = gift?.machines?.[0];
  await api(`/api/worlds/${indWorld.body.id}/join`, {}, tb);
  const FR = await connect(indWorld.body.id, tb);
  const fh = await waitFor(FR, m => m.t === "hello");
  const cx = inCap % ih.w, cy = Math.floor(inCap / ih.w);
  let fSpawn = null;
  for (let r = 30; r <= 60 && !fSpawn; r += 6) for (let k = 0; k < 16 && !fSpawn; k++) {
    const x = Math.round(cx + Math.cos((k * Math.PI) / 8) * r), y = Math.round(cy + Math.sin((k * Math.PI) / 8) * r);
    if (x < 3 || y < 3 || x >= ih.w - 3 || y >= ih.h - 3) continue;
    FR.ws.send(JSON.stringify({ t: "spawn", x, y }));
    if ((await nextResult(FR, "spawn"))?.ok) fSpawn = y * ih.w + x;
  }
  await adminOp(IN, { op: "give", nation: fh.you, what: "troops", amount: 3000 });
  FR.ws.send(JSON.stringify({ t: "stack", share: 0.5, at: fSpawn }));
  const fStack = await nextResult(FR, "stack");
  await adminOp(IN, { op: "speed", factor: 4 });
  const sent = bomberId ? await ask({ t: "air", plane: bomberId, do: "bomb", at: fSpawn }) : null;
  const hitEvent = await until(() => IN.json.filter(m => m.t === "events").flatMap(m => m.events).find(e => e.type === "bombed" && e.by === ih.you), 40000);
  const friendHeard = FR.json.some(m => m.t === "events" && m.events.some(e => e.type === "bombed" && e.nation === fh.you));
  check(fieldUp && bomberId && fSpawn !== null && fStack?.ok && sent?.ok && hitEvent?.stacks >= 1 && hitEvent.troops > 0 && friendHeard,
    `after Flight, an airfield's bomber flies ${Math.round(Math.hypot((fSpawn % ih.w) - cx, Math.floor(fSpawn / ih.w) - cy))} plots and bombs the friend's company: ${hitEvent?.troops} troops lost, ${hitEvent?.buildings} buildings damaged${sent?.ok ? "" : ` (${sent?.error ?? "no bomber"})`}`);
  await adminOp(IN, { op: "speed", factor: 1 });
  FR.ws.close();
}
IN.ws.close();
const dLog = (await api("/api/admin/log", null, ta)).body;
check(["delete world", "remove account", "set password", "remove player", "rename world"].every(op => dLog.some(e => e.op === op)), `the admin log records it all: ${dLog.slice(0, 6).map(e => e.op).join(", ")}`);
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
