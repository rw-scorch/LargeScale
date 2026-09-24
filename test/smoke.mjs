const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const INVITE = process.env.INVITE ?? "test-invite";
const ADMIN = process.env.ADMIN ?? "rw_scorch";
const MAP = process.env.MAP ?? "test";
const MAPS = {
  test: { config: { w: 160, h: 100, seed: 7 }, w: 160, h: 100 },
  europe: { config: { map: "europe" }, w: 700, h: 380 },
  earth: { config: { map: "earth" }, w: 3600, h: 1440 },
};
const M = MAPS[MAP];
if (!M) throw new Error(`MAP must be one of ${Object.keys(MAPS).join(", ")}`);
console.log(`map: ${MAP}`);
import { PROTOCOL, MSG, CLOSE, readFrame, applyPairs, PartCollector } from "../src/shared/protocol.js";
import { decodeRuns, gunzip, hashBytes, hashRuns } from "../src/shared/codec.js";
import { baseLayer } from "../src/shared/maps.js";

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
    this.next = hello._bin;
    this.parts = new PartCollector();
    this.owner = new Uint16Array(hello.w * hello.h);
    this.frameBytes = 0;
    this.versionOk = true;
  }
  async load() {
    const h = this.hello;
    const base = await baseLayer(h.map, h.w, h.h, async () => {
      const gz = new Uint8Array(await (await fetch(BASE + "/map/terrain.bin.gz")).arrayBuffer());
      this.staticBytes = gz.length;
      return gunzip(gz);
    });
    this.baseHashOk = h.map.kind === "test" || base.hash === h.map.baseHash;
    this.terrain = base.terrain.slice();
    const need = h.frames.terrain + h.frames.owner;
    for (let k = 0; k < 200 && this.got.binary.length < this.next + need; k++) await sleep(50);
    this.pump(this.next + need);
    this.joinFrameBytes = this.frameBytes;
    return this;
  }
  pump(upTo = this.got.binary.length) {
    for (; this.next < upTo; this.next++) {
      const raw = this.got.binary[this.next];
      this.frameBytes += raw.length;
      const f = readFrame(raw);
      if (f.version !== PROTOCOL) this.versionOk = false;
      if (f.type === MSG.DIFF) { applyPairs(this.owner, f.body); continue; }
      const whole = this.parts.add(f);
      if (!whole) continue;
      if (f.type === MSG.TERRAIN_DIFF) { applyPairs(this.terrain, whole); this.terrainDone = true; }
      if (f.type === MSG.OWNER) { decodeRuns(whole, this.owner); this.ownerDone = true; }
    }
  }
}

const waitFor = async (got, pred, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const m = got.json.find(pred); if (m) return m; await sleep(50); }
  return null;
};

if (process.env.RECHECK) {
  const { readFileSync } = await import("node:fs");
  const last = JSON.parse(readFileSync(new URL("./.last.json", import.meta.url)));
  const st = (await api(`/api/worlds/${last.wid}/status`, null, last.token)).body;
  const lc = st.loadCheck;
  check(lc?.loaded.terrain === last.hashes.terrain && lc?.loaded.owner === last.hashes.owner, `after a restart the ${st.map?.kind} world loads terrain ${lc?.loaded.terrain} and owner ${lc?.loaded.owner}, the same as before (${last.hashes.terrain}, ${last.hashes.owner})`);
  check(lc?.saved?.owner === lc?.loaded.owner, `the owner hash stored with the save matches the decoded layer (load took ${st.loadMs} ms)`);
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
const bogus = await api("/api/worlds", { name: "Bad", config: { map: "mars" } }, ta);
check(bogus.status === 400 && /unknown map/.test(bogus.body.error), "an unknown map choice is refused");
const created = Date.now();
const world = await api("/api/worlds", { name: "Smoke test", config: M.config }, ta);
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
let spawned = false;
const cx = M.w / 2, cy = M.h / 2;
const nearMiddle = land.filter((_, k) => k % 97 === 0).sort((p, q) => Math.hypot((p % M.w) - cx, Math.floor(p / M.w) - cy) - Math.hypot((q % M.w) - cx, Math.floor(q / M.w) - cy));
for (const i of nearMiddle) {
  A.ws.send(JSON.stringify({ t: "spawn", x: i % M.w, y: Math.floor(i / M.w) }));
  const r = await waitFor(A, m => m.t === "result" && m.of === "spawn" && !m.seen && (m.seen = true));
  if (r?.ok) { spawned = true; break; }
}
check(spawned, "player spawns on land");
B.ws.send(JSON.stringify({ t: "chat", text: "hello from friend" }));
check(!!(await waitFor(A, m => m.t === "chat" && m.text === "hello from friend")), "chat reaches the other player");
A.ws.send(JSON.stringify({ t: "stack", share: 0.5 }));
const st = await waitFor(A, m => m.t === "result" && m.of === "stack");
check(st?.ok, "stack created from the garrison");
const firstState = await waitFor(A, m => m.t === "state" && m.nations.some(n => n.id === hello.you && n.plots > 0));
const before = firstState.nations.find(n => n.id === hello.you).plots;
A.ws.send(JSON.stringify({ t: "advance", stack: st.stack }));
const adv = await waitFor(A, m => m.t === "result" && m.of === "advance");
check(adv?.ok, "advance order accepted");
await sleep(3000);
check(A.binary.some(f => f[0] === MSG.DIFF && f[1] === PROTOCOL), "territory changes stream as binary diffs");
A.ws.send(JSON.stringify({ t: "admin", op: "hashes" }));
const hr = await waitFor(A, m => m.t === "result" && m.op === "hashes");
mirror.pump(hr._bin);
check(hr && hashRuns(mirror.owner) === hr.owner, `after live diffs the client's owner layer still matches the server (${hr?.owner})`);
const state = [...A.json].reverse().find(m => m.t === "state");
const mine = state?.nations.find(n => n.id === hello.you);
check(mine && mine.plots > before + 5, `nation grew from ${before} to ${mine?.plots} plots`);
A.ws.send(JSON.stringify({ t: "stack", share: 0.3 }));
const st2 = await waitFor(A, m => m.t === "result" && m.of === "stack" && m.stack !== st.stack);
const from = (await waitFor(A, m => m.t === "state" && m.stacks.some(x => x.id === st2?.stack)))?.stacks.find(x => x.id === st2.stack).pos;
let moved = null;
const far = Math.min(250, Math.floor(hello.w / 3));
for (const i of land.filter((_, k) => k % 211 === 0)) {
  if (from === undefined || Math.abs((i % hello.w) - (from % hello.w)) + Math.abs(Math.floor(i / hello.w) - Math.floor(from / hello.w)) < far) continue;
  const sent = Date.now();
  A.ws.send(JSON.stringify({ t: "move", stack: st2.stack, to: i }));
  const r = await waitFor(A, m => m.t === "result" && m.of === "move" && !m.seen && (m.seen = true));
  if (r?.ok) { moved = { to: i, ms: Date.now() - sent }; break; }
}
check(moved, `a stack takes a move order at least ${far} plots away (reply seen within ${moved?.ms} ms; the test polls every 50 ms)`);
A.ws.close(); B.ws.close();
await sleep(800);
const status = await api(`/api/worlds/${wid}/status`, null, ta);
check(status.body.looping === false && status.body.online === 0, "loop stops when everyone leaves");
const A2 = await connect(wid, ta);
const hello2 = await waitFor(A2, m => m.t === "hello");
const again = hello2?.nations.find(n => n.id === hello.you);
check(again && again.plots >= mine.plots && hello2.you === hello.you, "same nation and territory after reconnecting");
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
check(ls && ls.maxRows <= 10, `saves wrote at most ${ls?.maxRows} rows each, ${ls?.totalRows} rows over ${ls?.saves} saves (last: ${ls?.rows} rows, owner layer ${ls?.ownerBytes} bytes, ${ls?.ms} ms)`);
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./.last.json", import.meta.url), JSON.stringify({ wid, token: ta, you: hello.you, plots: again.plots, hashes: saved.hashes }));
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
