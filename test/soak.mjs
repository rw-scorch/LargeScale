import { PROTOCOL } from "../src/shared/protocol.js";
import { ClientWorld } from "../src/shared/client.js";
import { isLand } from "../src/shared/terrain.js";
import { soldierTypes } from "../src/shared/soldiers.js";
import { proposePlan } from "../src/shared/planner.js";

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
    if (m.t === "events") for (const e of m.events) if (/bomb|plane|shot|sam|landed|embarked|trade_sunk|machine_destroyed|nuke|warhead|wonder|war_|peace_|alliance_|treaty|embargo|troops_home|faction_|surrender|vassal_|commander_/.test(e.type)) seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
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

const tally = new Map(), seen = new Map();
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
const made = await api("/api/worlds", { name: `Soak ${suffix}`, config: { map: "test", w: 200, h: 130, seed: SEED, bots: 8, rules: { buildSpeed: 10, produceSpeed: 5, researchSpeed: 30, trainSpeed: 5, warNotice: 20 } } }, admin.token);
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

for (const id of ["flight", "jet_engines", "strategic_bombing", "helicopters", "airborne_forces", "guided_missiles", "nuclear_weapons", "cruise_missiles", "orbital_weapons", "drones", "hover_vehicles", "sappers", "tunnelling", "megaton_warheads"]) note("research", await A.send({ t: "research", id, mode: "queue" }));
note("admin finish", await A.send({ t: "admin", op: "finish", nation: A.cw.you }));
for (const id of ["missile_defence", "shields", "railguns", "sappers"]) note("research", await B.send({ t: "research", id, mode: "queue" }));
note("admin finish", await A.send({ t: "admin", op: "finish", nation: B.cw.you }));
async function dig(p) {
  const w = p.cw, you = w.you, R = w.engRules;
  if (!R || !w.nations.get(you)?.alive) return;
  const crews = [...w.stacks.values()].filter(s => s.owner === you && s.mix?.engineer >= 10);
  if (!crews.length) { note("stack engineers", await p.send({ t: "stack", share: 0.3, at: pick(mine(p)) })); return; }
  const s = pick(crews), x = s.pos % w.w, y = (s.pos / w.w) | 0, around = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < w.w && y + dy < w.h) around.push((y + dy) * w.w + x + dx);
  const at = pick(around), d = w.digOf(at), roll = rand();
  let m;
  if (d.job && roll < 0.2) m = { op: "cancel", at };
  else if (roll < 0.5) m = { op: "dig", at };
  else if (roll < 0.65) m = { op: "charge", at };
  else if (roll < 0.85) { const ids = Object.entries(R.recipes).filter(([, r]) => r.from.includes(d.name)).map(([id]) => id).concat(d.dug ? ["restore"] : []); m = { op: "build", at, recipe: ids.length ? pick(ids) : "causeway" }; }
  else m = { op: "tunnel", at, to: near(w, at, 8) };
  if (m.op === "charge" || m.op === "build" || m.op === "tunnel") note("admin give", await A.send({ t: "admin", op: "give", nation: you, what: "money", amount: 2000 }));
  note(`dig ${m.op}`, await p.send({ t: "dig", ...m }));
  if (rand() < 0.15) await p.send({ t: "move", stack: s.id, to: near(w, s.pos, 6) });
}

async function tourism(p) {
  const w = p.cw;
  if (!w.purse || !w.nations.get(w.you)?.alive) return;
  const kinds = ["park", "plaza", "museum", "zoo", "arena", "wonder_stone_circle", "wonder_pyramid", "wonder_colossus"].filter(t => !w.lockOf(t));
  const type = pick(kinds);
  if (!type) return;
  note("admin give", await A.send({ t: "admin", op: "give", nation: w.you, what: "money", amount: w.defs.table[type].cost.money }));
  for (const at of mine(p).sort(() => rand() - 0.5).slice(0, 200)) if (!w.placeError(type, at)) { note(`build ${w.defs.table[type].wonder ? "wonder" : "attraction"}`, await p.send({ t: "build", type, at })); return; }
}
async function diplo() {
  const [p, q] = rand() < 0.5 ? [A, B] : [B, A], to = q.cw.you, rel = p.cw.relation(p.cw.you, to);
  const theirs = p.cw.dip?.proposals.filter(x => x.to === p.cw.you) ?? [];
  const roll = rand(), mine = p.cw.factionOf(p.cw.you), other = p.cw.factionOf(to);
  let m;
  if (rel.vassal === "vassal" && roll < 0.3) m = { t: "diplo", op: "free", to };
  else if ((rel.status === "war" || rel.status === "war_pending") && roll < 0.15) m = { t: "diplo", op: "surrender", to };
  else if (!mine && roll < 0.08) m = { t: "diplo", op: "faction", name: pick(["North", "South", "East", "West"]) };
  else if (mine?.leader === p.cw.you && !other && roll < 0.2) m = { t: "diplo", op: "invite", to };
  else if (mine && roll > 0.94) m = { t: "diplo", op: rand() < 0.5 || mine.leader !== p.cw.you || !mine.members.includes(to) ? "quit" : "expel", to };
  else if (theirs.length && roll < 0.4) { const p = pick(theirs); m = { t: "diplo", op: p.kind !== "surrender" && rand() < 0.7 ? "accept" : "decline", id: p.id }; }
  else if (rel.status === "peace" && roll < 0.55) m = { t: "diplo", op: "war", to };
  else if (rel.status === "war" || rel.status === "war_pending") m = { t: "diplo", op: "propose", to, kind: "peace" };
  else if (rel.status === "alliance") m = rand() < 0.5 ? { t: "diplo", op: "leave", to } : { t: "diplo", op: "embargo", to, on: !rel.embargoes };
  else if (rel.treaty && rand() < 0.3) m = { t: "diplo", op: "break", to };
  else m = rand() < 0.5 ? { t: "diplo", op: "propose", to, kind: "alliance" } : rand() < 0.5 ? { t: "diplo", op: "propose", to, kind: "non_aggression", minutes: pick([30, 60, 120, 240]) } : { t: "diplo", op: "embargo", to, on: !rel.embargoes };
  const r = await p.send(m);
  note(`diplo ${m.op}${m.kind ? ` ${m.kind}` : ""}`, r);
}
let chats = 0;
async function talk() {
  const [p, q] = rand() < 0.5 ? [A, B] : [B, A], fac = p.cw.factionOf(p.cw.you), roll = rand();
  const target = roll < 0.3 && fac ? { ch: "faction" } : roll < 0.6 ? { ch: "private", to: q.cw.you } : { ch: "global" };
  p.ws.send(JSON.stringify({ t: "typing", ...target }));
  p.ws.send(JSON.stringify({ t: "chat", text: `soak ${++chats}`, ...target }));
  const mineNotes = p.cw.notes.filter(n => n.owner === p.cw.you);
  if (mineNotes.length && rand() < 0.4) note("note remove", await p.send({ t: "note", op: "remove", id: pick(mineNotes).id }));
  else note("note add", await p.send({ t: "note", op: "add", at: near(p.cw, p.cw.nations.get(p.cw.you)?.capital ?? 0, 15), text: `soak note ${chats}` }));
}
async function future() {
  const v = B.cw;
  for (const type of ["shield_generator", "shield_node", "railgun_battery"]) {
    if ([...v.buildings.values()].filter(b => b.owner === v.you && b.type === type).length >= 2 || v.lockOf(type)) continue;
    note("admin give", await A.send({ t: "admin", op: "give", nation: v.you, what: "money", amount: v.defs.table[type].cost.money }));
    for (const at of mine(B).sort(() => rand() - 0.5).slice(0, 300)) if (!v.placeError(type, at)) { note(`build ${type}`, await B.send({ t: "build", type, at })); break; }
  }
  const w = A.cw;
  for (const type of ["drone_hangar", "fusion_reactor"]) {
    if ([...w.buildings.values()].some(b => b.owner === w.you && b.type === type) || w.lockOf(type)) continue;
    note("admin give", await A.send({ t: "admin", op: "give", nation: w.you, what: "money", amount: w.defs.table[type].cost.money }));
    for (const at of mine(A).sort(() => rand() - 0.5).slice(0, 300)) if (!w.placeError(type, at)) { note(`build ${type}`, await A.send({ t: "build", type, at })); break; }
  }
}
async function nukes() {
  const w = A.cw, silos = [...w.buildings.values()].filter(b => b.owner === w.you && b.def?.silo);
  for (const type of ["missile_silo", "orbital_uplink"]) if (silos.filter(b => b.type === type).length < (type === "missile_silo" ? 2 : 1) && !w.lockOf(type)) for (const at of mine(A).sort(() => rand() - 0.5).slice(0, 300)) if (!w.placeError(type, at)) { note(`build ${type}`, await A.send({ t: "build", type, at })); break; }
  const v = B.cw;
  if (![...v.buildings.values()].some(b => b.owner === v.you && b.type === "abm_silo") && !v.lockOf("abm_silo")) for (const at of mine(B).sort(() => rand() - 0.5).slice(0, 300)) if (!v.placeError("abm_silo", at)) { note("build abm_silo", await B.send({ t: "build", type: "abm_silo", at })); break; }
  const loaded = silos.filter(b => b.state === "active" && w.siloOf(b.id)?.ready && w.siloOf(b.id).kind !== "cruise" && b.type === "missile_silo");
  if (loaded.length >= 2 && rand() < 0.5) {
    const theirs = mine(B), at = theirs.length ? pick(theirs) : near(w, loaded[0].anchor, 20), ids = loaded.map(b => b.id);
    note("nuke salvo check", await A.send({ t: "nuke", op: "check", silo: ids[0], silos: ids, at }));
    note("nuke salvo", await A.send({ t: "nuke", op: "launch", silo: ids[0], silos: ids, at }));
    return;
  }
  for (const b of silos.filter(b => b.state === "active")) {
    const st = w.siloOf(b.id);
    if (!st) {
      note("admin give", await A.send({ t: "admin", op: "give", nation: w.you, what: "money", amount: 300000 }));
      note("nuke build", await A.send({ t: "nuke", op: "build", silo: b.id, kind: b.type === "orbital_uplink" ? "orbital" : rand() < 0.4 ? "atomic" : rand() < 0.5 ? "megaton" : "cruise" }));
      note("cheat build", await A.send({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: true }));
      await sleep(800);
      note("cheat build", await A.send({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: false }));
    } else if (st.ready) {
      if (silos.some(o => o.type === "missile_silo" && o.id !== b.id && w.siloOf(o.id) && !w.siloOf(o.id).ready) && rand() < 0.8) continue;
      const theirs = mine(B), at = theirs.length ? pick(theirs) : near(w, b.anchor, 20);
      note("nuke check", await A.send({ t: "nuke", op: "check", silo: b.id, at }));
      note(rand() < 0.2 ? "nuke cancel" : "nuke launch", await A.send(rand() < 0.2 ? { t: "nuke", op: "cancel", silo: b.id } : { t: "nuke", op: "launch", silo: b.id, at }));
    }
  }
}
async function airfield() {
  const w = A.cw;
  if ([...w.buildings.values()].some(b => b.owner === w.you && b.type === "airfield")) return;
  for (const at of mine(A).sort(() => rand() - 0.5).slice(0, 300)) if (!w.placeError("airfield", at)) { note("build airfield", await A.send({ t: "build", type: "airfield", at })); return; }
}
async function samSite() {
  const w = A.cw;
  if ([...w.buildings.values()].filter(b => b.owner === w.you && b.type === "sam_site").length >= 3 || w.lockOf("sam_site")) return;
  for (const at of mine(A).sort(() => rand() - 0.5).slice(0, 300)) if (!w.placeError("sam_site", at)) { note("build sam_site", await A.send({ t: "build", type: "sam_site", at })); return; }
}
for (let k = 0; k < 40 && A.cw.lockOf("airfield"); k++) await sleep(100);

async function planSome(p) {
  const w = p.cw;
  if (!w.purse || !w.terrain || !w.nations.get(w.you)?.alive) return;
  const list = proposePlan(w.planView(), w.planRules ?? {});
  stats.proposals = Math.max(stats.proposals, list.length);
  const roll = rand();
  if (list.length && roll < 0.7) { const q = pick(list); note("plan add", await p.send({ t: "plan", op: "add", project: { key: q.key, kind: q.kind, name: q.title, pieces: q.pieces } })); }
  else if (roll < 0.8) { const at = near(w, w.nations.get(w.you).capital, 10); note("plan keep", await p.send({ t: "plan", op: "keep", rects: [[at % w.w, (at / w.w) | 0, 4, 4]] })); }
  else if (roll < 0.9 && w.planQueue.length) note("plan cancel", await p.send({ t: "plan", op: "cancel", key: pick(w.planQueue).key }));
  else note("plan keep", await p.send({ t: "plan", op: "keep", rects: [] }));
}

async function fly(p) {
  const w = p.cw, you = w.you, n = w.nations.get(you);
  if (!n?.alive) return;
  const cap = n.capital, stacks = [...w.stacks.values()].filter(s => s.owner === you);
  const planes = [...w.machines.values()].filter(u => u.owner === you && u.air);
  const roll = rand();
  let m;
  if (p.piloting) {
    if (roll < 0.15) { m = { t: "pilot", op: "release" }; p.piloting = false; }
    else {
      const aim = near(w, cap, 10);
      p.ws.send(JSON.stringify({ t: "pilot", op: "input", move: [rand() * 2 - 1, rand() * 2 - 1], aim: [(aim % w.w) + 0.5, ((aim / w.w) | 0) + 0.5], fire: rand() < 0.3, bomb: rand() < 0.05 }));
      note("pilot input", { ok: true });
      return;
    }
  } else if (roll < 0.35 && stacks.length) {
    const s = pick(stacks), kinds = soldierTypes(s.troops, s.mix, w.soldierRules?.troopsEach ?? 10);
    if (!kinds.length) return;
    const [id, count] = pick(kinds);
    m = { t: "detach", picks: [{ stack: s.id, take: { [id]: 1 + Math.floor(rand() * count) } }] };
  } else if (roll < 0.55 && (stacks.length || planes.length)) {
    m = planes.length && (rand() < 0.4 || !stacks.length) ? { t: "pilot", op: "take", machine: pick(planes).id } : { t: "pilot", op: "take", stack: pick(stacks).id };
  } else if (roll < 0.7 && stacks.length && planes.some(u => u.def.capacity && u.air?.landed && !u.cargo)) {
    const u = pick(planes.filter(u => u.def.capacity && u.air?.landed && !u.cargo));
    m = { t: "board", stack: pick(stacks).id, ship: u.id };
  } else if (roll < 0.74 && planes.length && [...w.machines.values()].some(u => u.owner === you && u.def.carrier && u.state !== "wreck")) {
    m = { t: "air", do: "base", plane: pick(planes).id, at: pick([...w.machines.values()].filter(u => u.owner === you && u.def.carrier && u.state !== "wreck")).at };
  } else if (roll < 0.8 && planes.some(u => u.def.capacity && u.cargo)) {
    m = { t: "air", do: "drop", plane: pick(planes.filter(u => u.def.capacity && u.cargo)).id, at: near(w, cap, 20) };
  } else if (planes.length) {
    const what = pick(["patrol", "bomb", "bomb", "return"]);
    m = { t: "air", do: what, planes: planes.filter(() => rand() < 0.5).map(u => u.id).concat(pick(planes).id), ...(what === "return" ? {} : { at: near(w, cap, 18) }) };
  }
  if (!m) return;
  const r = await p.send(m);
  note(m.t === "pilot" ? `pilot ${m.op}` : m.t, r);
  if (m.t === "pilot" && m.op === "take" && r.ok) p.piloting = true;
}

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
  const f = purse.field;
  if (f && f.soldiers > f.cap) problem(`${label}: ${f.soldiers} soldiers in the field, over ${f.cap}`);
  if (f && f.companies > f.maxCompanies) problem(`${label}: ${f.companies} companies, over ${f.maxCompanies}`);
  let planes = 0;
  for (const u of w.machines.values()) {
    if (!u.air) continue;
    if (u.owner === w.you) planes++;
    if (![u.air.x, u.air.y, u.air.fuel].every(Number.isFinite)) problem(`${label}: plane ${u.id} has ${JSON.stringify(u.air)}`);
    else if (u.air.x < 0 || u.air.y < 0 || u.air.x > w.w || u.air.y > w.h) problem(`${label}: plane ${u.id} is off the map at ${u.air.x}, ${u.air.y}`);
  }
  if (planes > 100) problem(`${label}: ${planes} planes, over 100`);
  for (const [i, [hp, max]] of w.eng?.hp ?? []) if (!(hp > 0 && hp <= max)) problem(`${label}: plot ${i} has ${hp} of ${max} hit points`);
  if ((w.eng?.jobs ?? []).filter(j => j.nation === w.you).length > (w.engRules?.maxJobs ?? 12)) problem(`${label}: more engineering jobs than ${w.engRules.maxJobs}`);
  stats.jobs = Math.max(stats.jobs, (w.eng?.jobs ?? []).length);
  stats.dug = Math.max(stats.dug, w.eng?.dug?.size ?? 0);
  const pl = purse.plan;
  if (pl && (pl.projects.length > 40 || pl.projects.reduce((s, r) => s + r[3], 0) > 400)) problem(`${label}: the plan queue holds ${pl.projects.length} projects`);
  if (pl) stats.done = Math.max(stats.done, pl.projects.reduce((s, r) => s + r[4], 0));
  stats.planes = Math.max(stats.planes, planes);
  stats.soldiers = Math.max(stats.soldiers, f?.soldiers ?? 0);
}
const stats = { planes: 0, soldiers: 0, proposals: 0, done: 0, jobs: 0, dug: 0 };

const t0 = Date.now();
let rounds = 0;
while (Date.now() - t0 < SECONDS * 1000) {
  rounds++;
  if (rounds % 25 === 1) {
    for (const p of [A, B]) {
      const nid = p.cw.you;
      note("admin give", await A.send({ t: "admin", op: "give", nation: nid, what: "money", amount: 3000 }));
    }
    await airfield();
    await samSite();
    note("admin give plane", await A.send({ t: "admin", op: "give", nation: A.cw.you, what: "machine", unit: pick(["biplane", "early_bomber", "jet_fighter", "strategic_bomber", "attack_heli", "transport_heli", "transport_plane", "recon_drone", "strike_drone", "vtol_gunship"]), amount: 2 }));
    if (rounds % 50 === 1) for (const p of [A, B]) note("admin give ship", await A.send({ t: "admin", op: "give", nation: p.cw.you, what: "machine", unit: pick(["cruiser", "battleship", "submarine", "aircraft_carrier"]), amount: 1 }));
    if (rounds % 50 === 26) await nukes();
    if (rounds % 50 === 1) await future();
    if (rounds === 1) note("diplo war", await A.send({ t: "diplo", op: "war", to: B.cw.you }));
    if (rounds % 100 === 1) for (const p of [A, B]) note("admin give engineers", await A.send({ t: "admin", op: "give", nation: p.cw.you, what: "unit", unit: "engineer", amount: 400 }));
    for (const p of [A, B]) await tourism(p);
    if (rounds % 75 === 1) note("admin give sam truck", await A.send({ t: "admin", op: "give", nation: B.cw.you, what: "machine", unit: "sam_truck", amount: 1 }));
  }
  await Promise.all([act(A), act(B)]);
  if (rand() < 0.4) await Promise.all([fly(A), fly(B)]);
  if (rounds % 12 === 5) await Promise.all([planSome(A), planSome(B)]);
  if (rounds % 3 === 2) await Promise.all([dig(A), dig(B)]);
  if (rounds % 10 === 7) await diplo();
  if (rounds % 15 === 11) await talk();
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
{
  await sleep(1500);
  const ra = A.cw.relation(A.cw.you, B.cw.you), rb = B.cw.relation(B.cw.you, A.cw.you);
  console.log(`relation at the end: host sees ${ra.status}, friend sees ${rb.status}`);
  if (ra.status !== rb.status) problem(`the two players see different relations: ${ra.status} and ${rb.status}`);
  const va = JSON.stringify([...(A.cw.dip?.lords ?? [])]), vb = JSON.stringify([...(B.cw.dip?.lords ?? [])]);
  console.log(`vassals at the end: ${va}`);
  if (va !== vb) problem(`the two players see different vassals: ${va} and ${vb}`);
  const fa = JSON.stringify(A.cw.dip?.factions ?? []), fb = JSON.stringify(B.cw.dip?.factions ?? []);
  console.log(`factions at the end: ${fa}`);
  if (fa !== fb) problem(`the two players see different factions: ${fa} and ${fb}`);
  const heard = { host: A.cw.chat.filter(c => /^soak /.test(c.text)).length, friend: B.cw.chat.filter(c => /^soak /.test(c.text)).length };
  const leaked = [...A.cw.chat, ...B.cw.chat].filter(c => c.ch === "private" && c.from !== A.cw.you && c.from !== B.cw.you);
  console.log(`chat: ${chats} sent, the host holds ${heard.host} and the friend ${heard.friend}; notes the host sees: ${A.cw.notes.length}`);
  if (leaked.length) problem(`private chat from a third party reached a player: ${JSON.stringify(leaked[0])}`);
}
{
  const ea = JSON.stringify([...(A.cw.eng?.hp ?? [])].sort((x, y) => x[0] - y[0])), eb = JSON.stringify([...(B.cw.eng?.hp ?? [])].sort((x, y) => x[0] - y[0]));
  const ja = (A.cw.eng?.jobs ?? []).length, jb = (B.cw.eng?.jobs ?? []).length;
  console.log(`engineering at the end: ${A.cw.eng?.hp.size ?? 0} worn plots, ${ja} jobs, ${A.cw.eng?.dug.size ?? 0} plots changed; most jobs at once ${stats.jobs}`);
  if (ea !== eb || ja !== jb) problem(`the two players see different engineering: ${ea.slice(0, 120)} and ${eb.slice(0, 120)}, jobs ${ja} and ${jb}`);
}
for (const [who, p] of [["host", A], ["friend", B]]) console.log(`${who} tourism: ${JSON.stringify(p.cw.purse?.tourism ?? null)}`);
console.log(`\nmost planes held by the host: ${stats.planes}; most soldiers in the field: ${stats.soldiers}; most projects proposed at once: ${stats.proposals}; air events seen by both: ${JSON.stringify(Object.fromEntries(seen))}`);
console.log(problems.length ? `\n${problems.length} problems` : "\nno problems found");
A.ws.close();
B.ws.close();
process.exit(problems.length ? 1 : 0);
