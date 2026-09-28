import { PROTOCOL } from "../src/shared/protocol.js";
import { ClientWorld } from "../src/shared/client.js";
import { isLand } from "../src/shared/terrain.js";

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const INVITE = process.env.INVITE ?? "test-invite";
const SECONDS = Number(process.env.SOAK_SECONDS ?? 180);
const SEED = Number(process.env.SEED ?? 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let rnd = SEED * 2654435761 % 4294967296 || 1;
const rand = () => ((rnd = (rnd * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = list => list[Math.floor(rand() * list.length)];

async function api(path, body, token) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}

async function join(world, token) {
  const ws = new WebSocket(BASE.replace("http", "ws") + `/ws/${world}?token=${token}&v=${PROTOCOL}`);
  ws.binaryType = "arraybuffer";
  const p = { ws, cw: null, pending: [], waits: new Map(), seq: 1, closed: null };
  ws.onmessage = e => {
    if (typeof e.data !== "string") { if (p.cw) p.cw.frame(new Uint8Array(e.data)); else p.pending.push(new Uint8Array(e.data)); return; }
    const m = JSON.parse(e.data);
    if (m.t === "hello") { p.cw = new ClientWorld(m); p.hello = m; return; }
    if (m.t === "result" && p.waits.has(m.of)) { const q = p.waits.get(m.of); p.waits.delete(m.of); q(m); }
    p.cw?.message(m);
  };
  ws.onclose = e => { p.closed = e.code; };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  for (let k = 0; k < 200 && !p.cw; k++) await sleep(25);
  await p.cw.loadBase(async () => new Uint8Array(await (await fetch(`${BASE}/${p.cw.map.dir ?? "map"}/terrain.bin.gz`)).arrayBuffer()));
  for (const f of p.pending.splice(0)) p.cw.frame(f);
  p.send = m => new Promise(res => {
    const t = setTimeout(() => { p.waits.delete(m.t === "admin" ? "admin" : m.t); res({ ok: false, error: "no answer" }); }, 4000);
    p.waits.set(m.t, r => { clearTimeout(t); res(r); });
    ws.send(JSON.stringify(m));
  });
  return p;
}

const tally = new Map();
const note = (t, r) => {
  const k = r.ok ? `${t}: ok` : `${t}: ${r.error ?? "failed"}`;
  tally.set(k, (tally.get(k) ?? 0) + 1);
};
const problems = [];
const problem = text => { if (problems.length < 60) problems.push(text); console.log(`PROBLEM ${text}`); };

const suffix = Math.floor(Math.random() * 1e6);
const admin = (await api("/api/login", { name: "rw_scorch", password: "correct horse" })).body;
const friend = (await api("/api/register", { name: `soak${suffix}`, password: "soak password", invite: INVITE })).body;
if (!admin.token || !friend.token) throw new Error("log in rw_scorch / correct horse first (run the smoke test once)");
const made = await api("/api/worlds", { name: `Soak ${suffix}`, config: { map: "test", w: 200, h: 130, seed: SEED, bots: 8, rules: { buildSpeed: 10, produceSpeed: 5, researchSpeed: 30, trainSpeed: 5 } } }, admin.token);
const wid = made.body.id;
await api(`/api/worlds/${wid}/join`, {}, friend.token);
const A = await join(wid, admin.token), B = await join(wid, friend.token);
for (const p of [A, B]) {
  const w = p.cw;
  for (let tries = 0; tries < 400; tries++) {
    const x = 10 + Math.floor(rand() * (w.w - 20)), y = 10 + Math.floor(rand() * (w.h - 20));
    if (!isLand(w.terrain[y * w.w + x])) continue;
    if ((await p.send({ t: "spawn", x, y })).ok) break;
  }
}
console.log(`world ${wid}: both spawned`);
await A.send({ t: "admin", op: "speed", factor: 8 });

const mine = p => { const w = p.cw, out = []; for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === w.you) out.push(i); return out; };
const near = (w, from, r) => { const x = from % w.w, y = (from / w.w) | 0; return Math.max(0, Math.min(w.h - 1, y + Math.floor(rand() * (2 * r + 1)) - r)) * w.w + Math.max(0, Math.min(w.w - 1, x + Math.floor(rand() * (2 * r + 1)) - r)); };

async function act(p) {
  const w = p.cw, you = w.you, n = w.nations.get(you), purse = w.purse;
  if (!n?.alive || !purse) return;
  const land = mine(p), stacks = [...w.stacks.values()].filter(s => s.owner === you), troops = stacks;
  const cap = n.capital ?? land[0];
  const roll = rand();
  let m;
  if (roll < 0.22) {
    const types = Object.values(w.defs.table).filter(d => !d.civilian && !w.lockOf(d.id));
    const d = pick(types), at = pick(land);
    if (d && at !== undefined && !w.placeError(d.id, at)) m = { t: "build", type: d.id, at };
  } else if (roll < 0.3) m = { t: "zone", zone: pick(["res", "res", "com", "ind", "farm"]), x: (cap % w.w) - 3 + Math.floor(rand() * 6), y: ((cap / w.w) | 0) - 3 + Math.floor(rand() * 6), w: 3, h: 3 };
  else if (roll < 0.36) { const a = pick(land), b = near(w, a, 6); m = { t: "road", kind: "dirt", via: [a, b] }; }
  else if (roll < 0.44) m = { t: "stack", share: 0.2 + rand() * 0.3, at: pick(land) };
  else if (roll < 0.52 && troops.length) m = { t: "advance", stack: pick(troops).id, only: rand() < 0.5 ? "free" : undefined };
  else if (roll < 0.57 && troops.length) m = { t: "move", stack: pick(troops).id, to: near(w, pick(troops).pos, 12) };
  else if (roll < 0.62) m = { t: "attack", at: near(w, cap, 25), share: 0.2 };
  else if (roll < 0.65 && troops.length) m = { t: "split", stack: pick(troops).id, share: 0.5 };
  else if (roll < 0.68 && troops.length > 1) m = { t: "merge", into: troops[0].id, stack: troops[1].id };
  else if (roll < 0.7 && stacks.length) m = { t: "disband", stack: pick(stacks).id };
  else if (roll < 0.75 && troops.length) { const s = pick(troops), far = pick([...w.buildings.values()].filter(b => b.owner !== you && b.state === "active")); if (far) m = { t: "move", stack: s.id, to: far.anchor }; }
  else if (roll < 0.8) { const node = pick(w.locks?.nodes ? [...w.locks.nodes.keys()] : []); if (node) m = { t: "research", id: node, mode: "queue" }; }
  else if (roll < 0.83) m = { t: "army", keep: { [pick(["club_warrior", "spear_thrower", "horse_archer", "spearman", "archer"])]: Math.floor(rand() * 200) } };
  else if (roll < 0.86) {
    const shop = [...w.buildings.values()].find(b => b.owner === you && b.state === "active" && b.def.builds?.length);
    if (shop) m = { t: "produce", building: shop.id, type: pick(shop.def.builds) };
  } else if (roll < 0.89) m = { t: "connect", kind: "dirt", keep: rand() < 0.5 };
  else if (roll < 0.92) {
    const b = [...w.buildings.values()].filter(b => b.owner === you && b.state === "active" && b.def.next);
    if (b.length) m = { t: "upgrade", ids: [pick(b).id] };
  } else if (roll < 0.94) m = { t: "policy", tax: Math.floor(rand() * 5), conscription: 0.1 + Math.round(rand() * 10) * 0.05 };
  else if (roll < 0.95) {
    const b = [...w.buildings.values()].filter(b => b.owner === you && !b.def.civilian && b.state !== "rubble" && b.type !== "chieftain_hut");
    if (b.length) m = { t: "demolish", building: pick(b).id };
  } else if (roll < 0.97 && troops.length) m = { t: "standing", mode: pick(["hold", "fallback", "guard"]), stack: pick(troops).id };
  else m = { t: "guard", home: rand() < 0.5 };
  if (!m) return;
  note(m.t, await p.send(m));
}

function inspect(p, label) {
  const w = p.cw, purse = w.purse;
  if (!purse) return;
  const bad = (v, where) => { if (typeof v === "number" && !Number.isFinite(v)) problem(`${label}: ${where} is ${v}`); };
  bad(purse.money, "money");
  if (purse.money < 0) problem(`${label}: gold is ${purse.money}`);
  if (purse.stock !== undefined) problem(`${label}: the purse still carries goods`);
  const t = purse.trade;
  if (t) for (const k of ["ports", "stations", "ships", "trains", "perMinute", "total"]) { bad(t[k], `trade ${k}`); if (t[k] < 0) problem(`${label}: trade ${k} is ${t[k]}`); }
  for (const s of w.stacks.values()) if (!Number.isFinite(s.troops) || s.troops < 0) problem(`${label}: stack ${s.id} has ${s.troops} troops`);
}

const t0 = Date.now();
let rounds = 0;
while (Date.now() - t0 < SECONDS * 1000) {
  rounds++;
  if (rounds % 25 === 1) {
    for (const p of [A, B]) {
      const nid = p.cw.you;
      note("admin give", await A.send({ t: "admin", op: "give", nation: nid, what: "money", amount: 3000 }));
    }
  }
  await Promise.all([act(A), act(B)]);
  if (rounds % 20 === 0) {
    inspect(A, "host");
    inspect(B, "friend");
    const st = (await api(`/api/worlds/${wid}/status`, null, admin.token)).body;
    if (st.tickErrors) problem(`the tick loop threw ${st.tickErrors} times: ${st.lastError}`);
    if (A.closed || B.closed) { problem(`a socket closed: ${A.closed} ${B.closed}`); break; }
  }
  await sleep(120);
}
const st = (await api(`/api/worlds/${wid}/status`, null, admin.token)).body;
console.log(`\n${rounds} rounds, ${Math.round(st.time / 60)} game minutes, tick errors ${st.tickErrors ?? 0}${st.lastError ? `: ${st.lastError}` : ""}`);
for (const [k, v] of [...tally].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${String(v).padStart(5)}  ${k}`);
console.log(problems.length ? `\n${problems.length} problems` : "\nno problems found");
A.ws.close();
B.ws.close();
process.exit(problems.length ? 1 : 0);
