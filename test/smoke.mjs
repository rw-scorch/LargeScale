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
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };

async function api(path, body, token, method = body ? "POST" : "GET") {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

function connect(world, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace("http", "ws") + `/ws/${world}?token=${token}`);
    ws.binaryType = "arraybuffer";
    const got = { json: [], binary: [], ws };
    ws.onmessage = e => (typeof e.data === "string" ? got.json.push(JSON.parse(e.data)) : got.binary.push(new Uint8Array(e.data)));
    ws.onopen = () => resolve(got);
    ws.onerror = reject;
  });
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
  check(lc?.saved?.owner === lc?.loaded.owner, "the owner hash stored with the save matches the decoded layer");
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
check(hello && hello.w === M.w && hello.h === M.h, "hello message has the map size");
for (let k = 0; k < 100 && A.binary.length < 2; k++) await sleep(100);
check(A.binary.length >= 2 && A.binary[0][0] === 1 && A.binary[0].length === 4 + M.w * M.h, "terrain arrives as a binary frame");
const terrain = A.binary[0].subarray(4);
const land = [];
for (let i = 0; i < terrain.length; i++) if (terrain[i] >= 11 && terrain[i] <= 15) land.push(i);
let spawned = false;
for (const i of land.filter((_, k) => k % 97 === 0)) {
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
check(A.binary.some(f => f[0] === 3), "territory changes stream as binary diffs");
const state = [...A.json].reverse().find(m => m.t === "state");
const mine = state?.nations.find(n => n.id === hello.you);
check(mine && mine.plots > before + 5, `nation grew from ${before} to ${mine?.plots} plots`);
A.ws.close(); B.ws.close();
await sleep(800);
const status = await api(`/api/worlds/${wid}/status`, null, ta);
check(status.body.looping === false && status.body.online === 0, "loop stops when everyone leaves");
const A2 = await connect(wid, ta);
const hello2 = await waitFor(A2, m => m.t === "hello");
const again = hello2?.nations.find(n => n.id === hello.you);
check(again && again.plots >= mine.plots && hello2.you === hello.you, "same nation and territory after reconnecting");
A2.ws.close();
await sleep(800);
const saved = (await api(`/api/worlds/${wid}/status`, null, ta)).body;
const ls = saved.lastSave;
check(ls && ls.rows <= 10, `a save wrote ${ls?.rows} rows (owner layer ${ls?.ownerBytes} bytes, ${ls?.ms} ms); ${ls?.totalRows} rows over ${ls?.saves} saves`);
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./.last.json", import.meta.url), JSON.stringify({ wid, token: ta, you: hello.you, plots: again.plots, hashes: saved.hashes }));
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
