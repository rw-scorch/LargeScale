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

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };

async function api(path, body, token, method = body ? "POST" : "GET") {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

function connect(world, token, v = PROTOCOL) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace("http", "ws") + `/ws/${world}?token=${token}&v=${v}`);
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
    const need = this.hello.frames.terrain + this.hello.frames.owner + (this.hello.frames.buildings ?? 0) + (this.hello.frames.zone ?? 0) + (this.hello.frames.deposits ?? 0);
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
  check(st.loaded && (st.loaded.upgradedFrom === null || st.loaded.upgradedFrom === 2), st.loaded?.upgradedFrom ? `a format ${st.loaded.upgradedFrom} save loaded as format 3, with ${st.loaded.buildings} buildings` : `the format 3 save loaded with ${st.loaded?.buildings} buildings`);
  const layers = ["zone", "wood", "buildings", "land"].filter(k => last.hashes[k]);
  check(layers.every(k => lc?.loaded[k] === last.hashes[k]), layers.length ? `zone, wood, building and land layers load identically (${layers.map(k => `${k} ${lc?.loaded[k]}`).join(", ")})` : "the save had no zone, wood or building layers yet");
  const again = await connect(last.wid, last.token);
  const h = await waitFor(again, m => m.t === "hello");
  const n = h?.nations.find(x => x.id === last.you);
  check(n && n.plots >= last.plots, `after a server restart the nation still has ${n?.plots} plots (saved ${last.plots})`);
  again.ws.close();
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
const world = await api("/api/worlds", { name: "Smoke test", config: { ...M.config, rules: { stackSpeed: 6 * K, enemyCostFactor: 0.01, advanceRate: 30 * K * K, buildSpeed: 10, produceSpeed: 200, researchSpeed: 100 } } }, ta);
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
  check(kit && kit.state === "active" && cw.purse?.money >= 100 && cw.purse.stock.food >= 50 && cw.purse.stock.wood >= 40, `starting kit: a finished chieftain hut at the capital, ${cw.purse?.money} gold, ${cw.purse?.stock.food} food and ${cw.purse?.stock.wood} wood`);
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
  const gathered = await until(() => { view.pump(); return cw.purse?.making?.food > 0 && cw.purse.making.wood > 0 ? cw.purse.making : null; }, 8000);
  check(gathered, `the chieftain hut gathers from the start: ${JSON.stringify(gathered)} a second (this world runs production 200 times faster)`);
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
  check(siteSeen && done && seenByB(1), `the site finishes, and the friend's client sees the site and the finished tower`);
  check(A.json.some(m => m.t === "events" && m.events.some(e => e.type === "built" && e.building === bid)), "a built event reaches the owner");
  const before = cw.purse.money;
  A.ws.send(JSON.stringify({ t: "demolish", building: bid }));
  const gone = await nextResult(A, "demolish");
  check(gone?.ok && gone.refund?.money === 10 && gone.refund?.wood === 7, `demolish refunds half: ${JSON.stringify(gone?.refund)}`);
  await until(() => { view.pump(); return cw.buildings.get(bid)?.state === "rubble" && cw.purse.money >= before + 10; }, 3000);
  check(cw.buildings.get(bid)?.state === "rubble" && await until(() => seenByB(3), 3000), "the tower turns to rubble for both players");
  check(await until(() => B.json.some(m => m.t === "state" && m.bg?.includes(bid)), 20000), "the rubble clears on its own, and the friend's client drops it");
  const cx = aSpawn % M.w, cy = Math.floor(aSpawn / M.w);
  const zr = async (zone, x, y, w, h) => { A.ws.send(JSON.stringify({ t: "zone", zone, x, y, w, h })); return nextResult(A, "zone"); };
  const res = await zr("res", cx - 4, cy - 4, 9, 5), com = await zr("com", cx - 4, cy + 1, 9, 3);
  check(res?.ok && res.plots > 0 && com?.ok && com.plots > 0 && res.plots + com.plots >= 20, `zoning paints ${res?.plots} home plots and ${com?.plots} shop plots next to the capital`);
  check((await zr("mall", cx, cy, 2, 2))?.error === "unknown zone" && (await zr("res", 0, 0, 65, 1))?.error === "zone at most 64 by 64 plots at a time", "bad zone orders are refused with a reason");
  const zoneFrames = () => B.binary.filter(f => f[0] === MSG.ZONE_DIFF).length;
  check(await until(() => zoneFrames() > 0, 3000), `the friend receives the zone changes (${zoneFrames()} frames)`);
  const town = await until(() => {
    view.pump();
    const huts = [...cw.buildings.values()].filter(b => b.owner === you && b.type === "hut_grass" && b.state === "active");
    return huts.length >= 2 && cw.purse?.town?.pop > 0 ? huts.length : 0;
  }, 25000);
  check(town, `huts go up on their own and people move in: ${town} huts, ${cw.purse?.town?.pop} people, ${cw.purse?.town?.housing} homes${town ? "" : ` [wood ${cw.purse?.stock?.wood}, food ${cw.purse?.stock?.food}, demand ${JSON.stringify(cw.purse?.town?.demand)}, all huts ${[...cw.buildings.values()].filter(b => b.owner === you && b.def.civilian).map(b => b.type + ":" + b.state).join(" ")}]`}`);
  view.pump();
  const zonedBefore = cw.zone.reduce((n, z) => n + (z ? 1 : 0), 0);
  const erased = await zr("none", cx - 4, cy + 1, 9, 3);
  await until(() => { view.pump(); return cw.zone.reduce((n, z) => n + (z ? 1 : 0), 0) < zonedBefore; }, 3000);
  const deps = cw.deposits.plots.length;
  check(MAP !== "test" || (deps > 0 && hello.frames.deposits === 1), `the world's deposits reach the client: ${deps} plots (${MAP === "test" ? "in the join" : "from the static file, not loaded by this test"})`);
  let prod = null;
  for (const type of ["woodcutter_camp", "crop_wheat", "pasture_sheep"]) {
    const at = near.find(i => cw.owner[i] === you && !cw.placeError(type, i));
    if (at !== undefined) { prod = { type, at }; break; }
  }
  A.ws.send(JSON.stringify({ t: "build", type: prod?.type, at: prod?.at }));
  const pb = await nextResult(A, "build");
  const out = prod?.type === "woodcutter_camp" ? "wood" : "food";
  const stockBefore = cw.purse.stock[out] ?? 0, makingBefore = cw.purse.making?.[out] ?? 0;
  const making = await until(() => { view.pump(); return cw.purse?.making?.[out] > makingBefore + 0.05 ? cw.purse.making[out] : 0; }, 20000);
  check(pb?.ok && making, `a ${prod?.type} on your land starts making ${out}: ${(making - makingBefore).toFixed(2)} a second on top of the chieftain hut's ${makingBefore} (stock ${stockBefore} before)`);
  if (prod?.type === "woodcutter_camp") {
    const edited = await until(() => B.binary.some(f => f[0] === MSG.TERRAIN_EDIT), 60000);
    check(edited, "the woodcutter clears a forest plot, and the friend receives the terrain edit");
  }
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
  const stoneTower = cw.defs.table.tower_stone, purse0 = { money: cw.purse.money, stone: cw.purse.stock.stone ?? 0 };
  const expected = planBatch(Array(towers.length).fill(stoneTower.cost), cw.purse, cw.consRules.instantPremium, cw.consRules.moneyForMissing);
  A.ws.send(JSON.stringify({ t: "upgrade", picks: [["watchtower_wood", 3]] }));
  const up = await nextResult(A, "upgrade");
  const ids = towers.map(i => cw.buildingAt(i)?.id);
  const friendSaw = await until(() => ids.every(id => B.json.some(m => m.t === "state" && (m.b ?? []).some(r => r[0] === id && r[1] === stoneTower.num))), 5000);
  check(masonry && ready && towers.length === 3 && up?.ok && up.done === 3 && Math.abs(up.spent - expected.spent) < 0.01 && friendSaw,
    `three wooden watchtowers upgrade at once: ${up?.done} done for ${up?.spent} gold (the client's plan said ${expected.spent}), and the friend sees stone towers`);
  const wait = await until(() => { view.pump(); return towers.every(i => cw.buildingAt(i)?.type === "tower_stone") && cw.purse.money < purse0.money ? cw.purse : null; }, 5000);
  check(wait && towers.every(i => cw.buildingAt(i).state === "active"), `the host's own client shows them finished at once, with gold down from ${purse0.money} to ${wait?.money}`);
}
B.ws.send(JSON.stringify({ t: "chat", text: "hello from friend" }));
check(!!(await waitFor(A, m => m.t === "chat" && m.text === "hello from friend")), "chat reaches the other player");
A.ws.send(JSON.stringify({ t: "stack", share: 0.5 }));
const st = await nextResult(A, "stack");
check(st?.ok, "stack created from the garrison");
const before = (await until(() => view.pump().nations.get(you)?.plots > 0 && view.nations.get(you)))?.plots;
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
A.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const st2 = await nextResult(A, "stack");
const from = (await until(() => view.pump().stacks.get(st2?.stack)))?.pos;
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

const bHello = await waitFor(B, m => m.t === "hello");
const bNation = bHello.you;
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
const selfKick = await adminOp(H, { op: "kick", nation: hh.you });
const kick = await adminOp(H, { op: "kick", nation: ph.you });
const told = await waitFor(P, m => m.t === "removed", 2000);
for (let k = 0; k < 40 && !P.closed; k++) await sleep(50);
const rejoin = await api(`/api/worlds/${awid}/join`, {}, tp);
const back = await connect(awid, tp).then(g => { g.ws.close(); return true; }, () => false);
const stays = await adminOp(H, { op: "give", nation: ph.you, what: "troops", amount: 10 });
const palList = (await api("/api/worlds", null, tp)).body.find(w => w.id === awid);
check(selfKick?.error === "you cannot remove yourself" && kick?.ok && told && P.closed?.code === CLOSE.REMOVED && rejoin.body.error === "the host removed you from this world" && !back && stays?.ok && palList?.removed === 1,
  `removing the friend closes their game with "${told?.text}", they cannot rejoin ("${rejoin.body.error}") or reconnect, their nation stays, and their list marks the world`);
const accounts = (await api("/api/admin/accounts", null, ta)).body;
const palRow = accounts.find(a => a.id === palId);
check(Array.isArray(accounts) && palRow?.name === "pal" + suffix && palRow.lastLogin > 0 && accounts.some(a => a.admin), `the host lists ${accounts.length} accounts with worlds and last login`);
const reset = await api(`/api/admin/accounts/${palId}/password`, { password: "fresh password" }, ta);
const oldToken = await api("/api/me", null, tp);
const oldPass = await api("/api/login", { name: "pal" + suffix, password: "pal password" });
const newPass = await api("/api/login", { name: "pal" + suffix, password: "fresh password" });
const short = await api(`/api/admin/accounts/${palId}/password`, { password: "short" }, ta);
check(reset.body.ok && oldToken.status === 401 && oldPass.status === 401 && newPass.status === 200 && short.body.error === "password must be at least 8 characters", "a new password logs the friend out everywhere; the old one stops working, the new one works, short ones are refused");
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
const dLog = (await api("/api/admin/log", null, ta)).body;
check(["delete world", "remove account", "set password", "remove player", "rename world"].every(op => dLog.some(e => e.op === op)), `the admin log records it all: ${dLog.slice(0, 6).map(e => e.op).join(", ")}`);
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
