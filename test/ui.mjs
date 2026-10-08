const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const INVITE = process.env.INVITE ?? "test-invite";
const MAP = process.env.MAP ?? "europe";
const OUT = process.env.OUT ?? ".screens";
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };
const browser = await chromium.launch();
const errors = [];

async function openPage(options) {
  const ctx = await browser.newContext(options);
  if (process.env.OFFLINE_FONTS !== "0") await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("response", r => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return page;
}

async function login(page, name, password) {
  await page.goto(BASE + "/");
  await page.fill("#login-name", name);
  await page.fill("#login-pass", password);
  await page.click("#login-go");
  const inside = await page.waitForFunction(() => document.querySelector("#world-create") ? "in" : document.querySelector(".login .msg")?.textContent ? "out" : null, null, { timeout: 20000 }).then(h => h.jsonValue());
  if (inside === "out") {
    for (let i = errors.length - 1; i >= 0; i--) if (/401/.test(errors[i])) errors.splice(i, 1);
    await page.fill("#login-invite", INVITE);
    await page.click("#register-go");
    await page.waitForSelector("#world-create", { timeout: 20000 });
  }
}

const overlaps = p => p.evaluate(() => {
  const boxes = ["#nations", "#control", "#status-pill", "#corner", "#action-bar", "#feed"].map(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { s, r } : null; }).filter(Boolean);
  const hit = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(`${boxes[i].s} and ${boxes[j].s}`);
  }
  const off = boxes.filter(({ r }) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).map(b => b.s);
  return { boxes: boxes.length, hit, off };
});

const ready = page => page.waitForFunction(() => window.__ls?.game?.view && window.__ls.game.world?.ownerReady, null, { timeout: 30000 });

async function frames(page, setup, ms = 2000) {
  await page.evaluate(setup);
  await page.evaluate(() => { window.__ls.game.frameTimes.length = 0; });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const f = window.__ls.game.frameTimes.slice(3), draw = f.map(x => x.draw).sort((a, b) => a - b), gap = f.map(x => x.gap).sort((a, b) => a - b);
    const q = (a, p) => +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1);
    return { frames: f.length, drawMs: { p50: q(draw, 0.5), p95: q(draw, 0.95), worst: q(draw, 1) }, frameGapMs: { p50: q(gap, 0.5), p95: q(gap, 0.95) }, cssPxPerPlot: +(f.at(-1).scale / window.__ls.game.view.ratio).toFixed(2) };
  });
}

const page = await openPage({ viewport: { width: 1280, height: 720 } });
await login(page, "rw_scorch", "correct horse");
check(true, "log in reaches the world list");
await page.fill("#world-name", `UI ${MAP}`);
await page.selectOption("#world-map", MAP);
await page.click("#world-create");
await ready(page);
check(await page.isVisible("#spawn-hint"), `a ${MAP} world opens and asks where to start`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-world-${MAP}.png` });
const newWorld = (p, name, config) => p.evaluate(async ([name, config]) => {
  const r = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("ls_token")}` }, body: JSON.stringify({ name, config }) });
  return (await r.json()).id;
}, [name, config]);
const playId = await newWorld(page, `UI ${MAP} play`, { map: MAP, rules: { buildSpeed: 10, researchSpeed: 40 } });
await page.goto(`${BASE}/#w=${playId}`);
await page.reload();
await ready(page);
await page.waitForTimeout(800);

const spawned = await page.evaluate(async () => {
  const g = window.__ls.game, w = g.world, v = g.view;
  const cx = w.w / 2, cy = w.h / 2, land = [];
  for (let i = 0; i < w.terrain.length; i += 37) if (w.terrain[i] >= 11 && w.terrain[i] <= 15 && !w.owner[i]) land.push(i);
  land.sort((a, b) => Math.hypot(a % w.w - cx, (a / w.w | 0) - cy) - Math.hypot(b % w.w - cx, (b / w.w | 0) - cy));
  for (const i of land.slice(0, 40)) {
    const x = i % w.w, y = (i / w.w) | 0;
    const r = await g.conn.request({ t: "spawn", x, y });
    if (r.ok) { g.focus(i, 6); return { x, y }; }
  }
  return null;
});
await page.waitForTimeout(1500);
check(spawned && !(await page.isVisible("#spawn-hint")), `spawned at ${spawned?.x}, ${spawned?.y}; the hint goes away`);
await page.screenshot({ path: `${OUT}/2-spawned-${MAP}.png` });
const vit = await page.waitForFunction(() => { const v = window.__ls.game.world.purse?.vitals, t = document.querySelector("#my-troops")?.textContent ?? ""; return v && t.includes("/") && document.querySelector("#purse [data-res=gold]") ? { v, t, gold: document.querySelector("#purse [data-res=gold]").title } : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
check(vit?.v.cap > 0, `the control panel shows troops at home against the cap (${vit?.t}, growing ${vit?.v.grow} a second) and gold with its rate ("${vit?.gold}")`);
const guideStep = await page.waitForSelector("#guide:not([hidden])", { timeout: 5000 }).then(() => page.textContent("#guide-step"), () => "");
const guideMark = await page.evaluate(() => { const g = window.__ls.game, m = g.view.guide; return m && { plot: m.plot, free: !g.world.owner[m.plot], label: m.label }; });
check(/^2 of 7: Take land, \d+ of \d+/.test(guideStep) && guideMark?.free, `after the start the guide gives the first goal ("${guideStep}") and marks open land beside yours ("${guideMark?.label}")`);
const lay = await overlaps(page);
check(lay.boxes === 6 && !lay.hit.length && !lay.off.length, `at 1280 by 720 the leaderboard, control panel, status pill, corner icons, action bar and events feed sit apart on screen (${JSON.stringify(lay)})`);
const kitItem = page.locator("#feed-list .item", { hasText: "chieftain hut stands" });
const kitSeen = await kitItem.waitFor({ timeout: 5000 }).then(() => true, () => false);
await page.evaluate(() => window.__ls.game.fit());
if (kitSeen) await kitItem.click();
const jumped = await page.evaluate(() => { const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital; return Math.hypot(g.view.cam.x - (cap % w.w) - 0.5, g.view.cam.y - Math.floor(cap / w.w) - 0.5) < 1 && g.view.cam.scale / g.view.ratio >= 6; });
check(kitSeen && jumped, "the events feed lists the starting hut, and clicking the line jumps to the capital");
const clock = await page.textContent("#world-clock");
const worldTime = await page.evaluate(() => window.__ls.game.world.time);
check(/^Day \d+, \d\d:00$/.test(clock), `the status pill shows the world clock ("${clock}" at ${worldTime} game seconds)`);

await page.keyboard.press("u");
check(await page.isVisible("#research-panel"), "U opens the research panel");
await page.click("#research-panel [data-node=palisades]");
const whyNot = await page.textContent("#research-why").catch(() => "");
check(/needs Clubs and spears and Stone tools first/.test(whyNot), `a node says why it cannot start: "${whyNot}"`);
await page.click("#research-first");
await page.click("#research-panel [data-node=fire_keeping]");
const tapLive = (p, sel) => p.click(sel, { timeout: 4000 }).catch(() => p.waitForSelector(sel, { timeout: 4000 }).then(() => p.$eval(sel, b => b.click())));
if (await page.isVisible("#research-queue-add")) await tapLive(page, "#research-queue-add");
await page.click("#research-panel [data-node=barter]");
await tapLive(page, "#research-queue-add");
const queued = await page.waitForFunction(() => { const q = window.__ls.game.world.purse?.research?.queue ?? []; return q.includes("palisades") && q.includes("barter") ? q : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => []);
const pal = queued.indexOf("palisades");
check(queued[0] === "clubs" && pal > 0 && pal <= 2 && queued.indexOf("stone_tools") < pal, `Research next queues what the node still needs first: ${queued.join(", ")}`);
await page.screenshot({ path: `${OUT}/2r-research-${MAP}.png` });
{
  await page.click("#research-panel [data-node=herding]");
  const box = await (await page.$("#research-queue-add")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const rebuilt = await page.evaluate(() => { const g = window.__ls.game, before = document.querySelector("#research-queue-add"); g.world.purse.research.progress += 50; g.updatePanels(); return document.querySelector("#research-queue-add") !== before; });
  await page.mouse.up();
  const landed = await page.waitForFunction(() => window.__ls.game.world.purse?.research?.queue?.includes("herding") || null, null, { timeout: 4000 }).then(() => true, () => false);
  check(!rebuilt && landed, "a panel does not rebuild under a pressed button, so a press made while research points come in still queues the node");
}
{
  const before = await page.evaluate(() => [...(window.__ls.game.world.purse?.research?.queue ?? [])]);
  await page.click("#research-panel [data-node=jet_engines]");
  const allLabel = await page.textContent("#research-queue-add").catch(() => "");
  await page.click("#research-queue-add");
  const far = await page.waitForFunction(() => { const q = window.__ls.game.world.purse?.research?.queue ?? []; return q.at(-1) === "jet_engines" ? q.length : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => 0);
  await page.screenshot({ path: `${OUT}/2s-research-far-${MAP}.png` });
  check(/^Queue all \d+$/.test(allLabel) && far > 40, `from the first era, "${allLabel}" on Jet engines queues all ${far} nodes on the way, ages included`);
  await page.evaluate(async list => { const g = window.__ls.game; await g.conn.request({ t: "research", mode: "clear" }); for (const id of list) await g.conn.request({ t: "research", id, mode: "queue" }); }, before);
}
const learned = await page.waitForFunction(() => { const k = window.__ls.game.world.purse?.research?.known ?? []; return ["palisades", "fire_keeping", "barter"].every(id => k.includes(id)); }, null, { timeout: 60000 }).then(() => true, () => false);
check(learned, "the queue researches through to Palisades, Fire keeping and Barter");
await page.screenshot({ path: `${OUT}/2s-researched-${MAP}.png` });
await page.keyboard.press("u");
const kit = await page.waitForFunction(() => { const w = window.__ls.game.world; return [...w.buildings.values()].some(b => b.owner === w.you && b.type === "chieftain_hut" && b.state === "active"); }, null, { timeout: 5000 }).then(() => true, () => false);
const purseText = await page.evaluate(() => [...document.querySelectorAll("#purse .res")].map(r => r.title).join("; "));
check(kit && /gold/.test(purseText), `the starting chieftain hut stands at the capital; the bar shows "${purseText}"`);
await page.evaluate(() => { const g = window.__ls.game; g.home(); g.view.cam.scale = 22 * g.view.ratio; g.view.clampCamera(); });
await page.keyboard.press("b");
check(await page.isVisible("#build-menu"), "B opens the build menu");
const cell = await page.evaluate(() => { const g = window.__ls.game, w = g.world, v = g.view, cap = w.nations.get(w.you).capital; const [x, y] = v.plotToScreen(cap % w.w, (cap / w.w) | 0); return { x: x / v.ratio, y: y / v.ratio, px: v.cam.scale / v.ratio }; });
const drag = async (dx0, dy0, dx1, dy1) => {
  await page.mouse.move(cell.x + dx0 * cell.px, cell.y + dy0 * cell.px);
  await page.mouse.down();
  await page.mouse.move(cell.x + dx1 * cell.px, cell.y + dy1 * cell.px, { steps: 8 });
  await page.mouse.up();
};
const sides = await page.evaluate(async () => {
  const { TERRAIN } = await import("/js/shared/terrain.js");
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  const rects = [[-4, -5, 4, -2], [-4, 2, 4, 5], [-6, -4, -3, 4], [3, -4, 6, 4]];
  const open = ([x0, y0, x1, y1]) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (cy + y) * w.w + cx + x; if (w.owner[i] === w.you && TERRAIN[w.terrain[i]].build && !w.buildingAt(i)) n++; } return n; };
  return rects.map(r => [open(r), r]).sort((a, b) => b[0] - a[0]).map(v => v[1]);
});
await page.click("#build-menu [data-zone=res]");
await drag(sides[0][0] - 0.5, sides[0][1] - 0.5, sides[0][2] + 0.5, sides[0][3] + 0.5);
await page.click("#build-menu [data-zone=com]");
await drag(sides[1][0] - 0.5, sides[1][1] - 0.5, sides[1][2] + 0.5, sides[1][3] + 0.5);
const zoned = await page.waitForFunction(() => { const w = window.__ls.game.world; let n = 0; for (const z of w.zone) if (z) n++; return n >= 20 ? n : 0; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => 0);
check(zoned >= 20, `dragging in the Zones tab paints homes and shops: ${zoned} plots`);
await page.screenshot({ path: `${OUT}/2a-zones-${MAP}.png` });
await page.keyboard.press("Escape");
await page.click("#build-menu .tabs button:has-text('Military')");
const locked = await page.textContent("#build-menu [data-type=barracks]");
check(await page.isDisabled("#build-menu [data-type=barracks]") && /Needs the Medieval era/.test(locked), `a locked building is greyed out with its reason: "${locked.match(/Needs.*/)?.[0]}"`);
const towerDesc = await page.textContent("#build-menu [data-type=watchtower_wood] .desc").catch(() => "");
check(/lookout/.test(towerDesc) && /defends at 1.15 times/.test(towerDesc), `each building in the menu says what it does: "${towerDesc}"`);
await page.screenshot({ path: `${OUT}/2b-build-menu-${MAP}.png` });
await page.click("#build-menu [data-type=watchtower_wood]");
const spots = await page.evaluate(() => {
  const g = window.__ls.game, w = g.world, v = g.view, cap = w.nations.get(w.you).capital, out = { ok: null, bad: null };
  for (let r = 1; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = cap + dy * w.w + dx, [px, py] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5);
    if (px < 60 || py < 120 || px > v.canvas.width - 420 * v.ratio || py > v.canvas.height - 140) continue;
    const why = w.placeError("watchtower_wood", i), at = { plot: i, x: px / v.ratio, y: py / v.ratio, why };
    if (!why && !out.ok) out.ok = at;
    if (why && why !== "something is already there" && !out.bad) out.bad = at;
  }
  return out;
});
if (spots.bad) {
  await page.mouse.move(spots.bad.x, spots.bad.y);
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({ ...window.__ls.game.view.ghost, def: undefined }));
  check(g.reason === spots.bad.why, `the ghost turns red with the reason next to it: "${g.reason}"`);
  await page.screenshot({ path: `${OUT}/2c-ghost-invalid-${MAP}.png` });
}
await page.mouse.move(spots.ok.x, spots.ok.y);
await page.waitForTimeout(300);
check(await page.evaluate(() => window.__ls.game.view.ghost?.reason === null), "over your own open land the ghost is green");
await page.screenshot({ path: `${OUT}/2d-ghost-valid-${MAP}.png` });
await page.mouse.click(spots.ok.x, spots.ok.y);
const pinnedUi = await page.waitForSelector("#place-confirm:not([hidden]) #place-go", { timeout: 3000 }).then(() => true, () => false);
await page.waitForTimeout(400);
const notYet = await page.evaluate(p => !window.__ls.game.world.buildingAt(p), spots.ok.plot);
await page.screenshot({ path: `${OUT}/2d2-confirm-${MAP}.png` });
check(pinnedUi && notYet, "a click places the building's outline with Build here and Cancel next to it, and builds nothing yet");
await page.click("#place-go");
const site = await page.waitForFunction(p => { const b = window.__ls.game.world.buildingAt(p); return b && b.type === "watchtower_wood" ? b.id : null; }, spots.ok.plot, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
check(site !== null, `Build here builds a construction site (building ${site})`);
const freeSpots = n => page.evaluate(n => {
  const g = window.__ls.game, w = g.world, v = g.view, cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  const onScreen = i => { const [px, py] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5), x = px / v.ratio, y = py / v.ratio; return x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.id === "map" ? [x, y] : null; };
  for (let dy = -8; dy <= 8; dy++) for (let x0 = cx - 12; x0 <= cx + 12 - n; x0++) {
    const run = [];
    for (let k = 0; k < n; k++) { const i = (cy + dy) * w.w + x0 + k, at = onScreen(i); if (!at || w.placeError("watchtower_wood", i)) break; run.push({ plot: i, x: at[0], y: at[1] }); }
    if (run.length === n) return run;
  }
  return null;
}, n);
await page.click("#open-settings");
await page.selectOption("#set-place", "click");
await page.click("#settings-panel .title + button");
const one = await freeSpots(1);
if (one) await page.mouse.click(one[0].x, one[0].y);
const oneClick = one && await page.waitForFunction(p => window.__ls.game.world.buildingAt(p)?.type === "watchtower_wood", one[0].plot, { timeout: 5000 }).then(() => true, () => false);
check(oneClick && await page.evaluate(() => JSON.parse(localStorage.getItem("ls_prefs")).place === "click"), "with One click chosen in Settings, a click builds at once, as before");
await page.evaluate(() => window.__ls.game.setPref("place", "confirm"));
await page.evaluate(async () => { const g = window.__ls.game; for (const [what, amount] of [["money", 3000]]) await g.conn.request({ t: "admin", op: "give", nation: g.world.you, what, amount }); });
await page.waitForTimeout(600);
await page.click("#paint-toggle");
const paintLabel = await page.textContent("#paint-toggle");
const run = await freeSpots(5);
if (run) {
  await page.mouse.move(run[0].x, run[0].y);
  await page.mouse.down();
  await page.mouse.move(run[4].x, run[4].y, { steps: 12 });
  await page.mouse.up();
}
const painted = run ? await page.waitForFunction(ps => ps.filter(p => window.__ls.game.world.buildingAt(p)?.type === "watchtower_wood").length >= 3 ? ps.filter(p => window.__ls.game.world.buildingAt(p)?.type === "watchtower_wood").length : null, run.map(r => r.plot), { timeout: 8000 }).then(h => h.jsonValue(), () => 0) : 0;
await page.screenshot({ path: `${OUT}/2d3-painted-${MAP}.png` });
check(paintLabel === "Paint: on" && painted >= 3, `with Paint on, one drag across five free plots places ${painted} watchtowers, with no confirm${run ? "" : " (found no run of five free plots on screen)"}`);
await page.click("#paint-toggle");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
check(!(await page.isVisible("#build-menu")) && await page.evaluate(() => window.__ls.game.building === null), "Esc leaves building mode, then closes the menu");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/2e-site-${MAP}.png` });
const finished = await page.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", site, { timeout: 40000 }).then(() => true, () => false);
check(finished, "the wooden watchtower finishes after its 30 seconds");
const grown = await page.waitForFunction(() => { const w = window.__ls.game.world; return w.purse?.town?.pop > 0 && [...w.buildings.values()].filter(b => b.owner === w.you && b.type === "hut_grass").length >= 2; }, null, { timeout: 30000 }).then(() => true, () => false);
if (!(await page.isVisible("#town-panel"))) await page.keyboard.press("t");
const people = await page.textContent("#town-population").catch(() => "");
check(grown && await page.isVisible("#town-panel") && /of/.test(people), `huts rise in the zone, and the town panel shows them: "${people}"`);
await page.screenshot({ path: `${OUT}/2h-town-${MAP}.png` });
await page.keyboard.press("t");
await page.mouse.click(spots.ok.x, spots.ok.y);
check(await page.waitForSelector("#building-demolish", { timeout: 3000 }).then(() => true, () => false), `clicking it opens its panel: "${await page.textContent("#building-title").catch(() => "")}"`);
const siteDesc = await page.textContent("#building-desc").catch(() => "");
check(/lookout/.test(siteDesc) && await page.isVisible("#building-desc"), `its panel describes it too: "${siteDesc}"`);
await page.screenshot({ path: `${OUT}/2f-built-${MAP}.png` });
await page.click("#building-demolish");
const rubble = await page.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "rubble", site, { timeout: 5000 }).then(() => true, () => false);
check(rubble, "Demolish turns it to rubble");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/2g-rubble-${MAP}.png` });
await page.keyboard.press("Escape");
{
  await page.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 6));
  await page.keyboard.press("o");
  const panel = await page.waitForSelector("#planner-panel:not([hidden])", { timeout: 3000 }).then(() => true, () => false);
  const items = await page.waitForFunction(() => document.querySelectorAll("#planner-list .plan-item").length || null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => 0);
  const drawn = await page.evaluate(() => window.__ls.game.view.plan?.items?.filter(i => !i.queued).length ?? 0);
  const summary = await page.textContent("#planner-summary").catch(() => "");
  const lay = await overlaps(page);
  await page.screenshot({ path: `${OUT}/2p-planner-${MAP}.png` });
  check(panel && items > 0 && drawn === items && !lay.hit.length && !lay.off.length, `O opens the planner: ${items} projects, each drawn as outlines on the map ("${summary}", ${await page.evaluate(() => window.__ls.game.planMs)} ms)`);
  const first = await page.evaluate(() => { const list = window.__ls.game.planner.proposals, p = list.find(p => p.key.startsWith("block:")) ?? list[0]; return p && { key: p.key, title: p.title }; });
  if (first) await page.click(`#planner-list .plan-item[data-key="${first.key}"] .plan-build`);
  const queuedUi = first && await page.waitForFunction(p => { const w = window.__ls.game.world; return w.planQueue.some(q => q.key === p.key) || w.purse?.plan?.projects?.some(r => r[0] === p.key) || w.events.some(e => e.type === "plan_done" && e.name === p.title) ? true : null; }, first, { timeout: 5000 }).then(() => true, () => false);
  const built = queuedUi && await page.waitForFunction(t => [...document.querySelectorAll("#feed-list .item")].some(e => e.textContent.includes(`Plan finished: ${t}`)), first.title, { timeout: 30000 }).then(() => true, () => false);
  await page.screenshot({ path: `${OUT}/2q-planned-${MAP}.png` });
  check(queuedUi && built, `Build queues "${first?.title}", and it is built with nothing else pressed; the feed says it is finished`);
  await page.keyboard.press("o");
  check(!(await page.isVisible("#planner-panel")) && !(await page.evaluate(() => window.__ls.game.view.plan)), "O again closes the planner and clears its outlines");
}
await page.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 6));

const ringItems = p => p.waitForSelector("#ring:not([hidden]) .ring-item", { timeout: 2000 }).then(() => p.evaluate(() => [...document.querySelectorAll("#ring .ring-item")].map(b => b.dataset.ring)), () => []);
const toScreen = (page, plot) => page.evaluate(p => {
  const g = window.__ls.game, w = g.world, v = g.view;
  const [px, py] = v.plotToScreen((p % w.w) + 0.5, ((p / w.w) | 0) + 0.5);
  return { x: px / v.ratio, y: py / v.ratio };
}, plot);
const edgePlot = () => page.evaluate(() => {
  const g = window.__ls.game, w = g.world, me = w.nations.get(w.you), cap = me.capital;
  let best = cap, bd = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const i = cap + dy * w.w + dx;
    if (w.owner[i] === w.you && dx * dx + dy * dy > bd) { bd = dx * dx + dy * dy; best = i; }
  }
  return best;
});
const capital = await page.evaluate(() => window.__ls.game.world.nations.get(window.__ls.game.world.you).capital);
const edge = await edgePlot();
const edgeAt = await toScreen(page, edge);
await page.mouse.move(edgeAt.x, edgeAt.y);
await page.keyboard.press("f");
await page.waitForSelector("#stack-advance", { timeout: 5000 });
const formedAt = await page.evaluate(() => { const g = window.__ls.game; return g.world.stacks.get(g.selected)?.pos; });
check(formedAt === edge && edge !== capital, `pointing at your land and pressing F forms a stack right there (plot ${formedAt}, capital ${capital})`);
await page.keyboard.press("a");
await page.waitForTimeout(3500);
const grew = await page.evaluate(() => { const w = window.__ls.game.world; return w.nations.get(w.you).plots; });
check(grew > 40, `advancing takes land: ${grew} plots`);
const guideNow = await page.textContent("#guide-step").catch(() => "");
check(guideNow !== guideStep && /of 7/.test(guideNow), `the guide follows along: "${guideNow}"`);
await page.screenshot({ path: `${OUT}/3-advance-${MAP}.png` });

await page.fill("#stack-share", "40");
await page.click("#form-stack");
check(await page.isVisible("#place-hint"), "the Form stack button asks where to place the stack");
const capAt = await toScreen(page, capital);
await page.mouse.click(capAt.x, capAt.y);
await page.waitForFunction(() => { const g = window.__ls.game; return g.world.stacks.has(g.selected) && g.world.myStacks().length === 2; }, null, { timeout: 5000 }).catch(() => {});
const second = await page.evaluate(() => { const g = window.__ls.game; return { id: g.selected, pos: g.world.stacks.get(g.selected)?.pos, count: g.world.myStacks().length }; });
check(second.pos === capital && second.count === 2 && !(await page.isVisible("#place-hint")), `clicking your land places the stack there (${second.count} stacks now)`);
await page.keyboard.press("Tab");
const tabbed = await page.evaluate(() => window.__ls.game.selected);
check(tabbed !== second.id && tabbed !== null, `Tab selects your other stack (${second.id} to ${tabbed})`);
await page.keyboard.press("Tab");
check(await page.evaluate(() => window.__ls.game.selected) === second.id, "Tab again comes back round");
await page.screenshot({ path: `${OUT}/3b-keys-${MAP}.png` });
await page.keyboard.press("m");
const reachable = page => page.evaluate(async () => {
  const g = window.__ls.game, w = g.world, v = g.view, s = w.stacks.get(g.selected);
  const sx = s.pos % w.w, sy = (s.pos / w.w) | 0;
  for (let r = 12; r <= 40; r += 4)
    for (let a = 0; a < 16; a++) {
      const x = Math.round(sx + r * Math.cos(a * Math.PI / 8)), y = Math.round(sy + r * Math.sin(a * Math.PI / 8)), i = y * w.w + x;
      if (x < 0 || y < 0 || x >= w.w || y >= w.h || !(w.terrain[i] >= 7 && w.terrain[i] <= 26) || w.owner[i] === w.you) continue;
      const [px, py] = v.plotToScreen(x + 0.5, y + 0.5);
      if (px < 40 || py < 80 || px > v.canvas.width - 40 || py > v.canvas.height - 160) continue;
      if (!(await g.conn.request({ t: "route", stack: s.id, to: i })).ok) continue;
      return { id: s.id, x: px / v.ratio, y: py / v.ratio };
    }
  return null;
});
const target = await reachable(page);
if (target) await page.mouse.click(target.x, target.y);
const preview = await page.waitForSelector("#move-go", { timeout: 5000 }).then(() => true, () => false);
const hint = preview ? await page.textContent("#stack-hint") : "";
check(preview, `tapping a destination shows the route line and travel time: "${hint.split(".")[0]}"`);
await page.screenshot({ path: `${OUT}/4-route-${MAP}.png` });
if (preview) await page.click("#move-go");
await page.waitForTimeout(2500);
const moving = await page.evaluate(() => { const g = window.__ls.game; return g.world.stacks.get(g.selected)?.order; });
check(moving === "move", `the stack takes the order (now ${moving})`);
await page.screenshot({ path: `${OUT}/5-moving-${MAP}.png` });

await page.keyboard.press("Tab");
const rc = await reachable(page);
const rcFrom = rc && await page.evaluate(id => window.__ls.game.world.stacks.get(id)?.pos, rc.id);
if (rc) await page.mouse.click(rc.x, rc.y, { button: "right" });
const rcRing = await ringItems(page);
await page.screenshot({ path: `${OUT}/5a-ring-stack-${MAP}.png` });
if (rcRing[0] === "move") await page.click("#ring [data-ring=move]");
await page.waitForTimeout(1500);
const rcNow = rc && await page.evaluate(id => { const s = window.__ls.game.world.stacks.get(id); return s && { order: s.order, pos: s.pos }; }, rc.id);
check(rcRing[0] === "move" && rcNow && (rcNow.order === "move" || rcNow.pos !== rcFrom), `with a stack selected, a right-click opens the ring with Move here in the centre (${rcRing.join(", ")}), and it sends the stack with no Go step (now ${rcNow?.order}, moved ${rcNow?.pos !== rcFrom})`);
check(!(await page.isVisible("#move-go")), "no route preview is left open after a right-click");
await page.keyboard.press("Escape");
check(await page.evaluate(() => window.__ls.game.selected) === null, "Esc clears the selection");
const ringAt = async (p, plot) => {
  await p.evaluate(i => window.__ls.game.focus(i, 8), plot);
  await p.waitForTimeout(150);
  const at = await toScreen(p, plot);
  await p.mouse.click(at.x, at.y, { button: "right" });
  return ringItems(p);
};
const ownRing = await ringAt(page, capital);
await page.screenshot({ path: `${OUT}/5b-ring-own-${MAP}.png` });
check(ownRing.join() === "form,build,zone,note,info", `with nothing selected, a right-click on your land opens the ring: ${ownRing.join(", ")}, with Form stack in the centre`);
await page.keyboard.press("Escape");
check(await page.evaluate(() => document.querySelector("#ring").hidden), "Esc closes the ring");
const ringSpots = await page.evaluate(() => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  let free = null, foe = null;
  for (let r = 3; r < 400 && (free === null || foe === null); r++) for (let a = 0; a < 64; a++) {
    const x = Math.round(cx + r * Math.cos(a * Math.PI / 32)), y = Math.round(cy + r * Math.sin(a * Math.PI / 32)), i = y * w.w + x;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !(w.terrain[i] >= 7 && w.terrain[i] <= 26)) continue;
    if (free === null && !w.owner[i]) free = i;
    if (foe === null && w.owner[i] && w.owner[i] !== w.you) foe = i;
  }
  return { free, foe, foeId: foe === null ? null : w.owner[foe], foeName: foe === null ? null : w.nations.get(w.owner[foe]).name };
});
const freeRing = ringSpots.free === null ? [] : await ringAt(page, ringSpots.free);
if (freeRing[0] === "take") await page.click("#ring [data-ring=take]");
const took = await page.waitForFunction(() => (window.__ls.game.world.purse?.orders ?? []).some(o => o.only === 0), null, { timeout: 5000 }).then(() => true, () => false);
check(freeRing.join() === "take,note,info" && took, `on unclaimed land the ring offers ${freeRing.join(", ")}; Take land forms a stack that takes unclaimed land only`);
const foeRing = ringSpots.foe === null ? [] : await ringAt(page, ringSpots.foe);
const attackLabel = await page.textContent("#ring [data-ring=attack] .label").catch(() => "");
await page.screenshot({ path: `${OUT}/5c-ring-attack-${MAP}.png` });
if (foeRing[0] === "attack") await page.click("#ring [data-ring=attack]");
const attacking = await page.waitForFunction(id => { const w = window.__ls.game.world; return (w.purse?.orders ?? []).some(o => o.only === id) || w.myMachines().some(u => u.type === "transport_boat"); }, ringSpots.foeId, { timeout: 5000 }).then(() => true, () => false);
check(foeRing.join() === "attack,note,info" && attackLabel === `Attack ${ringSpots.foeName}` && attacking, `on ${ringSpots.foeName}'s land the ring offers "${attackLabel}", which forms a stack at your nearest land that advances into that nation only`);
await page.keyboard.press("Escape");
const cardSpot = await page.evaluate(([foe, id]) => {
  const g = window.__ls.game, w = g.world, v = g.view;
  g.focus(foe, 8);
  const fx = foe % w.w, fy = (foe / w.w) | 0;
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (fy + dy) * w.w + fx + dx;
    if (w.owner[i] !== id || w.buildingAt(i)) continue;
    const [px, py] = v.plotToScreen(fx + dx + 0.5, fy + dy + 0.5);
    if (v.stackAt(px, py) === null && v.machineAt(px, py) === null) return { x: px / v.ratio, y: py / v.ratio };
  }
  return null;
}, [ringSpots.foe, ringSpots.foeId]);
if (cardSpot) await page.mouse.click(cardSpot.x, cardSpot.y);
const cardTitle = await page.waitForSelector("#nation-card:not([hidden])", { timeout: 3000 }).then(() => page.textContent("#nation-title"), () => "");
const cardFacts = await page.textContent("#nation-facts").catch(() => "");
await page.screenshot({ path: `${OUT}/5e-nation-card-${MAP}.png` });
const forces = () => page.evaluate(() => { const w = window.__ls.game.world; return [...w.myStacks().map(s => "s" + s.id), ...w.myMachines().filter(u => u.type === "transport_boat").map(u => "m" + u.id)]; });
const stacksBefore = await forces();
if (cardTitle) await page.click("#nation-attack");
let cardSent = false;
for (let k = 0; k < 25 && !cardSent; k++) { await page.waitForTimeout(200); cardSent = (await forces()).some(id => !stacksBefore.includes(id)); }
check(cardTitle === ringSpots.foeName && /Rank \d+ of \d+/.test(cardFacts) && cardSent, `a click on ${ringSpots.foeName}'s land opens its card ("${cardFacts}"), and its Attack button sends a stack`);
await page.keyboard.press("Escape");
check(await page.evaluate(() => document.querySelector("#nation-card").hidden), "Esc closes the nation card");
const attackRow = await page.waitForSelector("#attacks [data-halt]", { timeout: 5000 }).then(() => page.textContent("#attacks .attack.out"), () => "");
const haltId = await page.evaluate(() => Number(document.querySelector("#attacks [data-halt]")?.dataset.halt));
if (attackRow) await page.click(`#attacks [data-halt="${haltId}"]`);
const halted = await page.waitForFunction(id => window.__ls.game.world.stacks.get(id)?.order === "hold", haltId, { timeout: 5000 }).then(() => true, () => false);
check(!!attackRow && halted, `the attacks list shows your advancing stacks ("${attackRow.trim()}"), and Stop halts one`);
await page.evaluate(() => { const g = window.__ls.game, w = g.world, foe = [...w.nations.values()].find(n => n.id !== w.you && n.spawned); g.attacks.event({ type: "plot_lost", nation: w.you, by: foe.id, at: w.nations.get(w.you).capital, count: 3 }); g.updatePanels(); });
const framed = await page.isVisible("#alert-frame");
const inRow = await page.textContent("#attacks .attack.in").catch(() => "");
await page.screenshot({ path: `${OUT}/5d-attacked-${MAP}.png` });
check(framed && /took 3 of your plots/.test(inRow), `losing land lights a red frame round the screen and lists the attacker: "${inRow}"`);
const light = await page.evaluate(() => { const row = document.querySelector("#nations tr.me .dot"); return row ? { on: row.classList.contains("on"), colour: getComputedStyle(row).backgroundColor } : null; });
const botLights = await page.evaluate(() => [...document.querySelectorAll("#nations tr")].filter(tr => /Bot/.test(tr.textContent) && tr.querySelector(".dot")).length);
check(light?.on && botLights === 0, `the nations list shows a green light for you while you are online (${light?.colour}), and none for bots`);

await page.click("#feed-chat");
await page.fill("#chat-input", "hello from the real client");
await page.click("#chat-send");
const chatted = await page.waitForFunction(() => document.querySelector("#chat .lines")?.textContent.includes("hello from the real client"), null, { timeout: 5000 }).then(() => true, () => false);
check(chatted, "chat goes out and comes back");
await page.screenshot({ path: `${OUT}/6-chat-${MAP}.png` });

const world = await frames(page, () => window.__ls.game.fit());
const named = await page.evaluate(() => { const g = window.__ls.game, w = g.world, me = (g.view.names ?? []).find(l => l.id === w.you); return { count: g.view.names?.length ?? 0, me: me && { r: me.r, inside: w.owner[Math.floor(me.y) * w.w + Math.floor(me.x)] === w.you } }; });
await page.screenshot({ path: `${OUT}/6b-names-${MAP}.png` });
check(named.count > 1 && named.me?.inside, `nations' names and troops are written on their land (${named.count} labels; yours sits inside your land, ${named.me?.r} plots from its edge)`);
await page.click("#open-settings");
{
  await page.click("#settings-panel [data-theme=iron]");
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--signal").trim());
  await page.evaluate(() => { const i = document.querySelector("#settings-panel [data-section=feed] input[data-part=bg]"); i.value = "#402060"; i.dispatchEvent(new Event("change")); });
  const feedBg = await page.evaluate(() => getComputedStyle(document.querySelector("#feed")).backgroundColor);
  const leaderBg = await page.evaluate(() => getComputedStyle(document.querySelector("#nations")).backgroundColor);
  await page.screenshot({ path: `${OUT}/2t-theme-${MAP}.png` });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("ls_theme")));
  await page.click("#theme-reset");
  const back = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--signal").trim());
  check(accent === "#ff9a3c" && /64, 32, 96/.test(feedBg) && !/64, 32, 96/.test(leaderBg) && kept?.preset === "iron" && back === "#e8c84a",
    `Settings, Colours: the Iron theme recolours the page (${accent}), the events panel takes its own colour (${feedBg}) while the leaderboard keeps the theme's, it is kept in the browser, and Back to the usual colours restores ${back}`);
}
const setOpen = await page.isVisible("#settings-panel");
await page.uncheck("#set-names");
const namesOff = await page.evaluate(() => window.__ls.game.view.showNames === false && JSON.parse(localStorage.getItem("ls_prefs")).names === false);
await page.check("#set-names");
check(setOpen && namesOff && await page.evaluate(() => window.__ls.game.view.showNames), "Settings opens from the corner, and names on the map turn off and on, remembered in this browser");
await page.click("#settings-panel [data-bind=build]");
await page.keyboard.press("j");
const jLabel = await page.textContent("#open-build kbd");
await page.click("#settings-panel [data-bind=build]");
await page.keyboard.press("t");
const swapNote = await page.textContent("#settings-note");
const townKey = await page.textContent("#settings-panel [data-bind=town]");
await page.screenshot({ path: `${OUT}/10-settings-${MAP}.png` });
await page.keyboard.press("Escape");
await page.keyboard.press("t");
const tOpensBuild = await page.isVisible("#build-menu");
await page.keyboard.press("Escape");
const stored = await page.evaluate(() => localStorage.getItem("ls_keys"));
check(jLabel === "J" && townKey === "J" && tOpensBuild && /Town.*moved to J/i.test(swapNote), `keys can be rebound: Build took J, then T, and Town swapped to J ("${swapNote}"; saved ${stored})`);
await page.click("#open-settings");
await page.click("#keys-reset");
const resetKey = await page.textContent("#settings-panel [data-bind=build]");
await page.keyboard.press("Escape");
check(resetKey === "B" && await page.textContent("#open-build kbd") === "B", "one button puts every key back");
const guideShown = await page.isVisible("#guide");
if (guideShown) await page.click("#guide-hide");
const guideHidden = !(await page.isVisible("#guide"));
await page.click("#open-settings");
await page.check("#set-guide");
await page.keyboard.press("Escape");
const guideBack = await page.isVisible("#guide");
check(guideShown && guideHidden && guideBack, "the guide can be hidden, and Settings brings it back");
await page.click("#open-settings");
await page.check("#set-crosshair");
await page.click("#settings-panel .title + button");
const aimShown = await page.isVisible("#crosshair") && await page.isVisible("#aim-select") && await page.isVisible("#aim-orders");
const cam0 = await page.evaluate(() => ({ ...window.__ls.game.view.cam }));
await page.keyboard.down("ArrowRight");
await page.keyboard.down("ArrowDown");
await page.waitForTimeout(500);
await page.keyboard.up("ArrowRight");
await page.keyboard.up("ArrowDown");
const cam1 = await page.evaluate(() => ({ ...window.__ls.game.view.cam }));
check(aimShown && cam1.x > cam0.x && cam1.y > cam0.y, `with the crosshair on, the arrow keys move the view (${(cam1.x - cam0.x).toFixed(1)} plots right, ${(cam1.y - cam0.y).toFixed(1)} down)`);
const aimStack = await page.evaluate(() => { const g = window.__ls.game, s = g.world.myStacks()[0]; g.select(null); if (s) g.focus(s.pos, 10); return s?.id ?? null; });
await page.waitForTimeout(200);
await page.mouse.click(200, 300);
const ignored = await page.evaluate(() => window.__ls.game.selected === null);
await page.keyboard.press(" ");
const aimSelected = await page.evaluate(() => window.__ls.game.selected);
await page.keyboard.press("e");
const aimRing = await ringItems(page);
await page.screenshot({ path: `${OUT}/10b-crosshair-${MAP}.png` });
await page.keyboard.press("Escape");
check(aimStack !== null && ignored && aimSelected === aimStack && aimRing[0] === "move", `clicks on the map are ignored, Space selects the stack under the crosshair, and E opens its orders there (${aimRing.join(", ")})`);
await page.keyboard.press("Escape");
await page.evaluate(() => window.__ls.game.setPref("crosshair", false));
const close = await frames(page, () => { const g = window.__ls.game; g.home(); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); });
console.log(`frame times at whole-map view: ${JSON.stringify(world)}`);
console.log(`frame times at 16 px per plot: ${JSON.stringify(close)}`);
check(close.cssPxPerPlot === 16, "zoom reaches 16 px per plot");
const limits = await page.evaluate(() => {
  const g = window.__ls.game, v = g.view;
  v.cam.scale = 1e9; v.clampCamera();
  const most = v.cam.scale / v.ratio;
  v.cam.scale = 1e-9; v.clampCamera();
  const least = Math.round((v.cam.scale / v.fitScale) * 100) / 100;
  g.home(); v.cam.scale = 64 * v.ratio; v.clampCamera();
  return { most, least };
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/7b-closest-${MAP}.png` });
check(limits.most === 64 && limits.least === 0.5, `zoom now runs from half the whole-map view to 64 px per plot (${JSON.stringify(limits)})`);
await page.screenshot({ path: `${OUT}/7-close-${MAP}.png` });
const worldUrl = page.url();

const phone = await openPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await login(phone, "rw_scorch", "correct horse");
await phone.goto(worldUrl);
await phone.reload();
await ready(phone);
await phone.waitForTimeout(1200);
const ratio = await phone.evaluate(() => window.__ls.game.view.ratio);
check(ratio === 2, `phone pixel ratio 3 is capped at ${ratio}`);
const replaced = await page.waitForSelector("#notice-text", { timeout: 5000 }).then(() => page.textContent("#notice-text"), () => "");
check(/another tab/.test(replaced), `the desktop tab is told the game opened elsewhere: "${replaced}"`);
const phoneFrames = await frames(phone, () => window.__ls.game.home());
console.log(`phone frame times near home: ${JSON.stringify(phoneFrames)}`);
await phone.screenshot({ path: `${OUT}/8-phone-landscape-${MAP}.png` });
const phoneLay = await overlaps(phone);
check(!phoneLay.hit.length && !phoneLay.off.length, `on a phone held sideways (844 by 390) the panels sit apart too (${JSON.stringify(phoneLay)})`);
const phoneCap = await phone.evaluate(() => { const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital; g.focus(cap, 8); const [x, y] = g.view.plotToScreen((cap % w.w) + 0.5, ((cap / w.w) | 0) + 0.5); return { x: x / g.view.ratio, y: y / g.view.ratio }; });
await phone.waitForTimeout(200);
const cdp = await phone.context().newCDPSession(phone);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: phoneCap.x, y: phoneCap.y }] });
await phone.waitForTimeout(800);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
const heldRing = await ringItems(phone);
await phone.screenshot({ path: `${OUT}/8b-phone-ring-${MAP}.png` });
check(heldRing[0] === "form" && heldRing.includes("info"), `on a phone, holding a finger on your land opens the ring (${heldRing.join(", ")})`);
await phone.touchscreen.tap(150, 150);
await phone.waitForTimeout(200);
check(await phone.evaluate(() => document.querySelector("#ring").hidden), "a tap outside the ring closes it");
await phone.evaluate(() => { const g = window.__ls.game, w = g.world; g.setPref("crosshair", true); g.focus(w.nations.get(w.you).capital, 8); });
await phone.waitForTimeout(400);
const phoneAim = await phone.isVisible("#aim-orders");
if (phoneAim) await phone.tap("#aim-orders");
const phoneAimRing = await ringItems(phone);
await phone.screenshot({ path: `${OUT}/8c-phone-crosshair-${MAP}.png` });
check(phoneAim && phoneAimRing[0] === "form", `on a phone, the crosshair's Orders button opens the ring at the middle of the screen (${phoneAimRing.join(", ")})`);
await phone.touchscreen.tap(150, 150);
await phone.evaluate(() => window.__ls.game.setPref("crosshair", false));
const hudBox = await phone.locator("#status-pill").boundingBox();
for (let k = 0; k < 2; k++) { await phone.touchscreen.tap(hudBox.x + hudBox.width / 2, hudBox.y + hudBox.height / 2); await phone.waitForTimeout(80); }
await phone.waitForTimeout(500);
const pageZoom = await phone.evaluate(() => window.visualViewport?.scale ?? 1);
check(pageZoom === 1, `a double tap on the bar does not zoom the page (scale ${pageZoom})`);
await phone.setViewportSize({ width: 390, height: 844 });
await phone.waitForTimeout(400);
check(await phone.isVisible("#rotate"), "portrait phones are asked to turn sideways");
await phone.screenshot({ path: `${OUT}/9-phone-portrait-${MAP}.png` });

const quarry = await openPage({ viewport: { width: 1280, height: 720 } });
await login(quarry, "rw_scorch", "correct horse");
const qid = await quarry.evaluate(async () => {
  const r = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("ls_token")}` }, body: JSON.stringify({ name: "UI quarry", config: { map: "test", w: 240, h: 160, seed: 11, bots: 0, rules: { buildSpeed: 60, produceSpeed: 2000, researchSpeed: 400 } } }) });
  return (await r.json()).id;
});
await quarry.goto(`${BASE}/#w=${qid}`);
await quarry.reload();
await ready(quarry);
await quarry.waitForFunction(() => window.__ls.game.world.deposits.plots.length > 0, null, { timeout: 10000 });
const spot = await quarry.evaluate(async () => {
  const g = window.__ls.game, w = g.world, d = w.deposits, ores = ["iron", "copper", "tin", "coal", "gold", "silver", "gems"];
  for (let k = 0; k < d.plots.length; k++) {
    if (!ores.includes(w.depositIds[d.type[k] - 1])) continue;
    const i = d.plots[k], x = i % w.w, y = (i / w.w) | 0;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const r = await g.conn.request({ t: "spawn", x: x + dx, y: y + dy });
      if (r.ok) return i;
    }
  }
  return null;
});
for (const id of ["stone_tools", "fire_keeping", "barter", "farming", "chieftains", "palisades"]) await quarry.evaluate(id => window.__ls.game.conn.request({ t: "research", id }), id);
await quarry.waitForFunction(() => (window.__ls.game.world.purse?.research?.known.length ?? 0) >= 8, null, { timeout: 30000 }).catch(() => {});
await quarry.evaluate(p => { const g = window.__ls.game; g.focus(p, 16); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); }, spot);
await quarry.waitForTimeout(600);
await quarry.screenshot({ path: `${OUT}/10-deposit-${MAP}.png` });
await quarry.evaluate(p => { const g = window.__ls.game; g.focus(p, 5); }, spot);
await quarry.keyboard.press("r");
await quarry.waitForTimeout(600);
check(await quarry.evaluate(() => window.__ls.game.view.showDeposits), "R shows deposits at mid zoom");
await quarry.screenshot({ path: `${OUT}/12-deposits-overlay-${MAP}.png` });
await quarry.keyboard.press("r");
await quarry.evaluate(() => window.__ls.game.conn.request({ t: "stack", share: 0.3 }));
await quarry.evaluate(p => window.__ls.game.focus(p, 12), spot);
await quarry.evaluate(() => window.__ls.game.conn.request({ t: "research", id: "age_medieval", mode: "first" }));
const age = await quarry.waitForFunction(() => window.__ls.game.world.purse?.era === "M" && window.__ls.game.world.effects.length > 0, null, { timeout: 20000 }).then(() => true, () => false);
await quarry.waitForTimeout(300);
await quarry.screenshot({ path: `${OUT}/13-era-up-${MAP}.png` });
const marker = await quarry.evaluate(() => { const v = window.__ls.game.view; return v.markers().find(m => m.owner === window.__ls.game.world.you)?.era; });
check(age && marker === "M", `reaching the Medieval era plays era_up on the capital and the stack marker turns Medieval (${marker})`);
await quarry.evaluate(() => window.__ls.game.conn.request({ t: "research", id: "iron_working", mode: "first" }));
await quarry.waitForFunction(() => window.__ls.game.world.purse?.research?.known.includes("iron_working"), null, { timeout: 30000 }).catch(() => {});
await quarry.evaluate(() => { const g = window.__ls.game; return g.conn.request({ t: "admin", op: "give", nation: g.world.you, what: "money", amount: 2000 }); });
const why = spot === null ? "no ore deposit to spawn on" : await quarry.evaluate(p => window.__ls.game.world.placeError("mine_pit", p), spot);
check(spot !== null && why === null, `a pit mine fits on the ore deposit by the capital${why ? `: ${why}` : ""}`);
await quarry.evaluate(p => { const g = window.__ls.game; g.focus(p, 16); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); }, spot);
await quarry.keyboard.press("b");
await quarry.click("#build-menu .tabs button:has-text('Resources')");
const quarryText = await quarry.textContent("#build-menu [data-type=mine_pit]");
const retiredShown = await quarry.$("#build-menu [data-type=quarry]");
check(/Earns up to [\d.]+ gold a second, by what the deposit holds/.test(quarryText) && !retiredShown, `the Resources tab lists the pit mine with what it earns ("${quarryText.match(/Earns[^,]*/)?.[0]}"), and no retired quarry`);
await quarry.keyboard.press("Escape");
const mineGold0 = await quarry.evaluate(() => window.__ls.game.world.purse?.money ?? 0);
const qr = await quarry.evaluate(a => window.__ls.game.conn.request({ t: "build", type: "mine_pit", at: a }), spot);
const dry = await quarry.waitForFunction(a => { const w = window.__ls.game.world, b = w.buildingAt(a); return b ? b.plots.find(i => w.depleted.has(i)) ?? null : null; }, spot, { timeout: 120000 }).then(h => h.jsonValue(), () => null);
const allDry = await quarry.waitForFunction(a => { const g = window.__ls.game, b = g.world.buildingAt(a); return b && g.view.dryDeposit(b); }, spot, { timeout: 60000 }).then(h => h.jsonValue(), () => null);
const earned = await quarry.evaluate(g0 => (window.__ls.game.world.purse?.money ?? 0) - g0, mineGold0);
check(qr?.ok && dry !== null && !!allDry, `the pit mine runs its ${allDry} deposit dry, earning gold as it goes (gold ${earned >= 0 ? "up" : "down"} ${Math.round(Math.abs(earned))} with the build paid), and the client marks it depleted`);
await quarry.waitForTimeout(600);
await quarry.screenshot({ path: `${OUT}/11-mine-dry-${MAP}.png` });

const fix = await openPage({ viewport: { width: 1280, height: 720 } });
await login(fix, "rw_scorch", "correct horse");
const fid = await fix.evaluate(async () => {
  const r = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("ls_token")}` }, body: JSON.stringify({ name: "UI fixes", config: { map: "test", w: 240, h: 160, seed: 5, bots: 12, rules: { buildSpeed: 20, researchSpeed: 40, produceSpeed: 5, stackSpeed: 3, trainSpeed: 4 } } }) });
  return (await r.json()).id;
});
await fix.goto(`${BASE}/#w=${fid}`);
await fix.reload();
await ready(fix);
const home = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, land = t => t >= 7 && t <= 26, wet = t => [0, 1, 2, 3, 5, 34].includes(t);
  for (let y = 12; y < w.h - 12; y += 3) for (let x = 12; x < w.w - 12; x += 3) {
    let shore = false;
    for (let dy = -2; dy <= 2 && !shore; dy++) for (let dx = -2; dx <= 2 && !shore; dx++) shore = wet(w.terrain[(y + dy) * w.w + x + dx]);
    if (!shore || !land(w.terrain[y * w.w + x])) continue;
    if ((await g.conn.request({ t: "spawn", x, y })).ok) return y * w.w + x;
  }
  return null;
});
const opened = await fix.waitForSelector("#town-next", { state: "visible", timeout: 10000 }).then(() => fix.textContent("#town-next"), () => "");
check(home !== null && /Zone homes/.test(opened), `a new nation on the coast sees the Town panel with a next step: "${opened}"`);
await fix.screenshot({ path: `${OUT}/14-next-step.png` });
const shore = await fix.evaluate(() => {
  const g = window.__ls.game, w = g.world;
  const cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (w.owner[i] !== w.you || w.placeError("jetty", i)) continue;
    for (const n of [i - 1, i + 1, i - w.w, i + w.w]) if ([0, 1, 2, 3, 5, 34].includes(w.terrain[n])) return { land: i, water: n };
  }
  return null;
});
await fix.evaluate(p => { const g = window.__ls.game; g.focus(p, 16); }, shore?.land ?? home);
await fix.keyboard.press("b");
await fix.click("#build-menu .tabs button:has-text('Water')");
await fix.click("#build-menu [data-type=jetty]");
const waterAt = shore && await toScreen(fix, shore.water);
if (waterAt) { await fix.mouse.move(waterAt.x, waterAt.y); await fix.waitForTimeout(300); }
const ghost = await fix.evaluate(() => { const v = window.__ls.game.view; return v.ghost && { anchor: v.ghost.anchor, reason: v.ghost.reason }; });
if (waterAt) await fix.mouse.click(waterAt.x, waterAt.y);
await fix.click("#place-go").catch(() => {});
const jetty = ghost && await fix.waitForFunction(p => window.__ls.game.world.buildingAt(p)?.type === "jetty", ghost.anchor, { timeout: 5000 }).then(() => true, () => false);
const beside = ghost && [shore.water - 1, shore.water + 1, shore.water - 240, shore.water + 240, shore.water - 241, shore.water - 239, shore.water + 239, shore.water + 241].includes(ghost.anchor);
check(jetty && beside && ghost.reason === null, `pointing at the water beside your shore snaps the jetty onto a shore plot next to it, and it builds (water ${shore?.water}, jetty ${ghost?.anchor})`);
await fix.screenshot({ path: `${OUT}/17-jetty.png` });
await fix.keyboard.press("Escape");
await fix.keyboard.press("Escape");
await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, x = cap % w.w, y = (cap / w.w) | 0;
  await g.conn.request({ t: "zone", zone: "res", x: x - 4, y: y - 4, w: 9, h: 9 });
});
const hutsUp = await fix.waitForFunction(() => { const w = window.__ls.game.world; return [...w.buildings.values()].filter(b => b.owner === w.you && b.type === "hut_grass").length >= 3; }, null, { timeout: 30000 }).then(() => true, () => false);
await fix.evaluate(() => { const g = window.__ls.game; g.home(); g.view.cam.scale = 24 * g.view.ratio; g.view.clampCamera(); });
await fix.waitForTimeout(4000);
const figures = await fix.evaluate(() => { const v = window.__ls.game.view; return v.people.figures(v.visibleRange(), v.time).map(f => f.sprite.split("_").slice(0, -2).join("_")); });
check(hutsUp && figures.length > 0, `the starter research brings huts, and people walk about at close zoom: ${figures.length} figures (${[...new Set(figures)].join(", ")})`);
await fix.screenshot({ path: `${OUT}/15-people.png` });
await fix.evaluate(() => { const g = window.__ls.game; g.home(); g.view.cam.scale = 4 * g.view.ratio; g.view.clampCamera(); });
await fix.waitForTimeout(300);
const other = await fix.evaluate(() => {
  const g = window.__ls.game, w = g.world, v = g.view;
  for (let sy = 140; sy < v.canvas.height / v.ratio - 160; sy += 9) for (let sx = 260; sx < v.canvas.width / v.ratio - 380; sx += 9) {
    const p = g.plotAt(sx * v.ratio, sy * v.ratio), o = p === null ? 0 : w.owner[p];
    if (o && o !== w.you) return { x: sx, y: sy, name: w.nations.get(o).name, id: o };
  }
  return null;
});
if (other) await fix.mouse.move(other.x, other.y);
await fix.waitForTimeout(200);
const tip = other ? await fix.textContent("#plot-tip") : "";
check(other && await fix.isVisible("#plot-tip") && tip.includes(other.name), `hovering another nation's land names it: "${tip}"`);
await fix.screenshot({ path: `${OUT}/16-hover.png` });
await fix.evaluate(() => window.__ls.game.fit());
await fix.waitForTimeout(300);
const ore = await fix.evaluate(() => {
  const g = window.__ls.game, w = g.world, v = g.view, W = v.canvas.width / v.ratio, H = v.canvas.height / v.ratio;
  for (let k = 0; k < w.deposits.plots.length; k++) {
    const i = w.deposits.plots[k], [px, py] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5), x = px / v.ratio, y = py / v.ratio;
    if (x > 260 && y > 150 && x < W - 380 && y < H - 170 && !w.buildingAt(i) && g.plotAt(px, py) === i) return { x, y, name: w.depositKind(i).name };
  }
  return null;
});
if (ore) await fix.mouse.move(ore.x, ore.y);
await fix.waitForTimeout(200);
const oreTip = ore ? await fix.textContent("#plot-tip") : "";
check(ore && oreTip.includes(ore.name), `hovering a deposit names the ore and what digs it: "${oreTip}"`);
await fix.screenshot({ path: `${OUT}/16b-ore-hover.png` });
const trip = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital;
  const st = await g.conn.request({ t: "stack", share: 0.4, at: cap });
  for (let r = 30; r < 90; r += 6) for (let a = 0; a < 12; a++) {
    const x = Math.round((cap % w.w) + r * Math.cos(a)), y = Math.round(((cap / w.w) | 0) + r * Math.sin(a)), i = y * w.w + x;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !(w.terrain[i] >= 7 && w.terrain[i] <= 26)) continue;
    if ((await g.conn.request({ t: "move", stack: st.stack, to: i })).ok) { g.select(st.stack); g.focus(cap, 3); return { stack: st.stack, to: i }; }
  }
  return null;
});
const going = await fix.waitForFunction(() => /moving, about \d+ s to go/.test(document.querySelector("#stack-info")?.textContent ?? "") && window.__ls.game.view.route ? document.querySelector("#stack-info").textContent : null, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
const routeEnd = await fix.evaluate(() => window.__ls.game.view.route?.points.at(-1));
check(trip && going && routeEnd && routeEnd[1] * 240 + routeEnd[0] === trip.to, `selecting your moving stack shows where it is going: "${going?.trim()}", the line ends at its destination`);
await fix.screenshot({ path: `${OUT}/18-destination.png` });
const neighbour = await fix.evaluate(async id => {
  const g = window.__ls.game, w = g.world, v = g.view;
  g.select(id);
  for (let k = 0; k < w.owner.length; k++) {
    const o = w.owner[k];
    if (!o || o === w.you || w.nations.get(o)?.bot !== true) continue;
    g.focus(k, 6);
    const [px, py] = v.plotToScreen((k % w.w) + 0.5, ((k / w.w) | 0) + 0.5);
    return { x: px / v.ratio, y: py / v.ratio, id: o, name: w.nations.get(o).name };
  }
  return null;
}, trip?.stack);
await fix.keyboard.press("n");
const asked = await fix.textContent("#stack-hint");
if (neighbour) await fix.mouse.click(neighbour.x, neighbour.y);
const told = await fix.waitForFunction(id => (window.__ls.game.world.purse?.orders ?? []).find(o => o.only === id) ? document.querySelector("#stack-info").textContent : /A stack stopped/.test(document.querySelector("#feed")?.textContent ?? "") ? "done at once" : null, neighbour?.id, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
check(/Click the land of the nation/.test(asked) && told, `N asks which nation, and clicking ${neighbour?.name}'s land sets the advance: "${told?.trim()}"`);
const drawSpots = id => fix.evaluate(id => {
  const g = window.__ls.game, w = g.world, v = g.view, s = w.stacks.get(id), land = t => t >= 7 && t <= 26;
  if (!s) return null;
  g.select(id);
  g.focus(s.pos, 8);
  const sx = s.pos % w.w, sy = (s.pos / w.w) | 0;
  const dry = (x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h && land(w.terrain[y * w.w + x]);
  const edge = ([x0, y0], [x1, y1]) => { for (let k = 0; k <= Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); k++) if (!dry(x0 + Math.sign(x1 - x0) * k, y0 + Math.sign(y1 - y0) * k)) return false; return true; };
  for (const n of [4, 3]) for (const d of [7, 5, 3]) for (const [ax, ay] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const corners = [[0, 0], [d * ax, 0], [d * ax, d * ay], [0, d * ay]].slice(0, n).map(([dx, dy]) => [sx + dx, sy + dy]);
    if (!corners.every((c, k) => k === 0 ? dry(...c) : edge(corners[k - 1], c))) continue;
    return corners.map(([x, y]) => { const [px, py] = v.plotToScreen(x + 0.5, y + 0.5); return { x: px / v.ratio, y: py / v.ratio, i: y * w.w + x }; });
  }
  return null;
}, id);
const drawWith = async (pts, button, shot) => {
  await fix.mouse.move(pts[0].x, pts[0].y);
  await fix.mouse.down({ button });
  for (const p of pts.slice(1)) await fix.mouse.move(p.x, p.y, { steps: 10 });
  if (shot) await fix.screenshot({ path: shot });
  await fix.mouse.up({ button });
};
const followed = (id, end) => fix.waitForFunction(([id, end]) => {
  const info = document.querySelector("#stack-info")?.textContent ?? "";
  return (window.__ls.game.world.purse?.orders ?? []).find(o => o.id === id && o.to === end && o.via?.length) && /following your path/.test(info) ? info : null;
}, [id, end], { timeout: 8000 }).then(h => h.jsonValue(), () => null);
let drawn = await drawSpots(trip?.stack);
await fix.keyboard.press("d");
const drawHint = await fix.textContent("#stack-hint");
if (drawn) await drawWith(drawn, "left");
const along = drawn ? await followed(trip?.stack, drawn.at(-1).i) : null;
check(/Drag along/.test(drawHint) && /following your path/.test(along ?? ""), `D then a drag draws the stack's way: "${along?.trim()}"`);
await fix.waitForTimeout(400);
await fix.screenshot({ path: `${OUT}/19-drawn-path.png` });
drawn = await drawSpots(trip?.stack);
if (drawn) await drawWith([...drawn].reverse(), "right", `${OUT}/19b-right-drag.png`);
const again = drawn ? await followed(trip?.stack, drawn[0].i) : null;
const line = await fix.evaluate(() => window.__ls.game.view.route?.points.length ?? 0);
check(/following your path/.test(again ?? "") && line >= 3, `with a mouse, a right-drag draws a path without the button: "${again?.trim()}", drawn through ${line} points`);
const awayBox = await fix.evaluate(async id => {
  const g = window.__ls.game;
  g.select(id);
  await new Promise(r => setTimeout(r, 400));
  const box = document.querySelector("#stack-standing");
  if (!box || document.querySelector("#stack-away").hidden) return null;
  box.value = "fallback";
  box.dispatchEvent(new Event("change"));
  return true;
}, trip?.stack);
const fallsBack = await fix.waitForFunction(id => window.__ls.game.world.purse?.orders?.some(o => o.id === id && o.standing === "fallback"), trip?.stack, { timeout: 5000 }).then(() => true, () => false);
check(awayBox && fallsBack, "a stack can be set to fall back when outnumbered while you are away, and the purse remembers it");
const extra = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, r = await g.conn.request({ t: "stack", share: 0.2, at: w.nations.get(w.you).capital });
  if (r.ok) g.select(r.stack);
  return r.ok ? r.stack : null;
});
await fix.waitForSelector("#stack-disband", { timeout: 3000 }).catch(() => {});
await fix.keyboard.press("x");
const disbandArmed = await fix.waitForFunction(() => /Sure/.test(document.querySelector("#stack-disband")?.textContent ?? "") && document.querySelector("#stack-disband").textContent, null, { timeout: 2000 }).then(h => h.jsonValue(), () => "");
const warned = await fix.textContent("#toasts").catch(() => "");
await fix.keyboard.press("x");
const gone = await fix.waitForFunction(id => !window.__ls.game.world.stacks.has(id), extra, { timeout: 5000 }).then(() => true, () => false);
const toldBack = await fix.waitForFunction(() => /went home/.test(document.querySelector("#toasts")?.textContent ?? "") && document.querySelector("#toasts").textContent, null, { timeout: 3000 }).then(h => h.jsonValue(), () => "");
const mixMade = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "unit", unit: "knight", amount: 60 });
  const r = await g.conn.request({ t: "stack", share: 0.5, at: w.nations.get(w.you).capital });
  if (r.ok) g.select(r.stack);
  return r.ok;
});
const shownMix = await fix.waitForFunction(() => /knights/.test(document.querySelector("#stack-mix")?.textContent ?? "") && document.querySelector("#stack-mix").textContent, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
check(mixMade && /\d+ levies, \d+ knights/.test(shownMix), `a stack formed with knights in the reserve lists its mix: "${shownMix}"`);
await fix.screenshot({ path: `${OUT}/19c-stack-mix.png` });
check(extra && /Sure/.test(disbandArmed) && /Disband again/.test(warned) && gone && /went home and .+ were lost/.test(toldBack), `X asks first, then disbands with a quarter lost: "${toldBack.match(/[^.]*went home[^.]*\./)?.[0]?.trim()}"`);
await fix.click("#leave-world");
const back = await fix.waitForSelector("#world-create", { timeout: 5000 }).then(() => true, () => false);
check(back && await fix.isVisible("#leave-world") === false, "Exit goes back to the world list");
await fix.setViewportSize({ width: 900, height: 300 });
await fix.evaluate(() => document.querySelector(".menu-side").scrollTo(0, 1e6));
await fix.evaluate(() => document.querySelector(".menu-side").scrollTo(0, 0));
const top = await fix.evaluate(() => document.querySelector("#screen .brand").getBoundingClientRect().top);
const tall = await fix.evaluate(() => { const s = document.querySelector(".menu-side"); return s.scrollHeight > s.clientHeight; });
check(tall && top >= 0, `a world list taller than the window scrolls back to its top (title at ${Math.round(top)} px)`);
await fix.screenshot({ path: `${OUT}/19-short-window.png` });
const friend = await openPage({ viewport: { width: 1280, height: 720 } });
await friend.goto(BASE + "/");
await friend.fill("#login-name", `pal${Math.floor(Math.random() * 1e6)}`);
await friend.fill("#login-pass", "friendly pass");
await friend.fill("#login-invite", INVITE);
await friend.click("#register-go");
const hostOnly = await friend.waitForSelector("#host-only", { timeout: 5000 }).then(() => friend.textContent("#host-only"), () => "");
check(/Only the host/.test(hostOnly) && !(await friend.isVisible("#world-create")), `a friend's world list has no create form: "${hostOnly}"`);
await friend.screenshot({ path: `${OUT}/20-friend-list.png` });
check(await friend.locator("[data-delete]").count() === 0 && !(await friend.isVisible("#open-accounts")), "a friend's list has no Delete or Accounts buttons");
await friend.click(`[data-world="${fid}"]`);
await ready(friend);
check(!(await friend.isVisible("#open-admin")), "inside a world a friend has no Admin button");

await fix.setViewportSize({ width: 1280, height: 720 });
await fix.click(`[data-world="${fid}"]`);
await ready(fix);
await fix.waitForTimeout(500);
await fix.keyboard.press("`");
check(await fix.isVisible("#open-admin") && await fix.isVisible("#admin-panel"), "the host has an Admin button, and the backquote key opens the panel");
const listed = await fix.waitForFunction(() => document.querySelectorAll("#admin-players [data-kick]").length ? document.querySelector("#admin-players").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
check(/not placed yet/.test(listed), `the Players list includes a friend who has not placed a nation yet: "${listed.replace(/Remove/g, "").trim()}"`);
{
  const pal = await friend.evaluate(async () => {
    const g = window.__ls.game, w = g.world, land = t => t >= 7 && t <= 26;
    for (let y = 20; y < w.h - 20; y += 4) for (let x = w.w - 20; x > 20; x -= 4) if (land(w.terrain[y * w.w + x]) && !w.owner[y * w.w + x] && (await g.conn.request({ t: "spawn", x, y })).ok) return w.you;
    return null;
  });
  const row = `#dip-players [data-nation="${pal}"]`, status = page => page.textContent(`${row} .dip-status`).catch(() => "");
  const hostSees = await fix.waitForFunction(id => window.__ls.game.world.nations.get(id)?.spawned, pal, { timeout: 5000 }).then(() => true, () => false);
  await fix.click("#open-diplomacy");
  await fix.waitForSelector(row, { timeout: 5000 }).catch(() => null);
  const calm = await status(fix);
  await fix.screenshot({ path: `${OUT}/85-diplomacy.png` });
  await fix.click(`${row} [data-op=war]`);
  const asked = await fix.textContent(`${row} [data-op=war]`).catch(() => "");
  await fix.click(`${row} [data-op=war]`);
  const pending = await fix.waitForFunction(r => /War in/.test(document.querySelector(r)?.textContent ?? "") && document.querySelector(r).textContent, `${row} .dip-status`, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  const chips = await Promise.all([fix, friend].map(p => p.waitForSelector("#war-chip:not([hidden])", { timeout: 5000 }).then(() => p.textContent("#war-chip"), () => "")));
  check(hostSees && /At peace/.test(calm) && /Sure\? War in/.test(asked) && pending && chips.every(c => /^War with .+ in \d+:\d\d$/.test(c)), `the Diplomacy panel shows "${calm}"; Declare war asks first ("${asked}"), then "${pending}", and both players' bars count down: "${chips.join('" and "')}"`);
  await friend.click("#open-diplomacy");
  const hostRow = `#dip-players [data-nation="${await fix.evaluate(() => window.__ls.game.world.you)}"]`;
  await friend.waitForSelector(`${hostRow} [data-op=peace]`, { timeout: 5000 }).catch(() => null);
  await friend.click(`${hostRow} [data-op=peace]`);
  const count = await fix.waitForFunction(() => document.querySelector("#open-diplomacy")?.dataset.count || null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  await fix.waitForSelector("#dip-proposals [data-op=accept]", { timeout: 5000 }).catch(() => null);
  const offer = await fix.textContent("#dip-proposals .dip-offer").catch(() => "");
  await fix.click("#dip-proposals [data-op=accept]");
  const treaty = await fix.waitForFunction(r => /Treaty, .+ left/.test(document.querySelector(r)?.textContent ?? "") && document.querySelector(r).textContent, `${row} .dip-status`, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  await friend.waitForSelector(`${hostRow} [data-op=alliance]`, { timeout: 5000 }).catch(() => null);
  await friend.click(`${hostRow} [data-op=alliance]`);
  await fix.waitForSelector("#dip-proposals [data-op=accept]", { timeout: 5000 }).catch(() => null);
  await fix.click("#dip-proposals [data-op=accept]");
  const allied = await friend.waitForFunction(r => /Allied/.test(document.querySelector(r)?.textContent ?? "") && document.querySelector(r).textContent, `${hostRow} .dip-status`, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  const board = await friend.evaluate(id => !!document.querySelector(`#nations tr[data-nation="${id}"] .rel .i-dip_alliance`), await fix.evaluate(() => window.__ls.game.world.you));
  await friend.screenshot({ path: `${OUT}/86-diplomacy-allied.png` });
  check(count === "1" && /proposes peace/.test(offer) && treaty && allied && board, `the friend proposes peace, the host's corner shows ${count} waiting ("${offer.trim()}"), Accept gives "${treaty}", and an alliance after it shows "${allied}" in the panel and on the leaderboard`);
  await fix.fill("#faction-name", "The North");
  await fix.click("#faction-found");
  await fix.waitForSelector(`${row} [data-op=invite]`, { timeout: 5000 }).catch(() => null);
  await fix.click(`${row} [data-op=invite]`).catch(() => null);
  await friend.waitForSelector("#dip-proposals [data-op=accept]", { timeout: 5000 }).catch(() => null);
  const invText = await friend.textContent("#dip-proposals .dip-offer").catch(() => "");
  await friend.click("#dip-proposals [data-op=accept]").catch(() => null);
  const members = await fix.waitForFunction(() => document.querySelectorAll("#dip-faction [data-member]").length === 2 && document.querySelector("#dip-faction").textContent, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  const palSees = await friend.waitForFunction(r => /Your faction/.test(document.querySelector(r)?.textContent ?? "") && document.querySelector(r).textContent, `${hostRow} .dip-status`, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  await fix.screenshot({ path: `${OUT}/87-faction.png` });
  check(/invites you to join The North/.test(invText) && /The North/.test(members) && /\(leader\)/.test(members) && /Your faction/.test(palSees), `the host founds a faction and invites the friend ("${invText.replace(/AcceptDecline/, "").trim()}"); after Accept the panel lists both members, and the friend's row reads "${palSees}"`);
  await fix.evaluate(() => { window.__ls.game.toggleDiplomacy(false); window.__ls.game.feed.show("chat"); });
  await friend.evaluate(() => { window.__ls.game.toggleDiplomacy(false); window.__ls.game.feed.show("chat"); });
  await fix.waitForSelector("#chat-channel option[value=faction]", { state: "attached", timeout: 5000 }).catch(() => null);
  await fix.selectOption("#chat-channel", "faction").catch(() => null);
  await fix.fill("#chat-input", "north only");
  await fix.press("#chat-input", "Enter");
  const heard = await friend.waitForFunction(() => [...document.querySelectorAll("#chat .ch-faction")].map(p => p.textContent).find(t => /north only/.test(t)) ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  const plot = await fix.evaluate(() => { const w = window.__ls.game.world; return w.nations.get(w.you).capital; });
  await fix.evaluate(p => window.__ls.game.noteAt(p), plot);
  await fix.fill("#note-text", "Hold the ford");
  await fix.click("#note-save");
  const palNote = await friend.waitForFunction(() => window.__ls.game.world.notes.some(n => n.text === "Hold the ford"), null, { timeout: 5000 }).then(() => true, () => false);
  await friend.evaluate(p => { const g = window.__ls.game; g.noteAt(null); g.focus(p, 8); }, plot);
  await friend.waitForTimeout(400);
  const listed = await friend.textContent("#note-list").catch(() => "");
  await friend.screenshot({ path: `${OUT}/88-notes.png` });
  check(/\[faction\]/.test(heard) && palNote && /From your allies/.test(listed) && /Hold the ford/.test(listed), `faction chat reaches the friend ("${heard}"), and a note the host pins shows in the friend's list and on the map`);
  await fix.evaluate(() => { window.__ls.game.noteCard.show(false); window.__ls.game.feed.show("events"); });
  await friend.evaluate(() => { window.__ls.game.noteCard.show(false); window.__ls.game.feed.show("events"); });
  await fix.evaluate(() => window.__ls.game.toggleInfo(true));
  await fix.waitForSelector("#open-record", { timeout: 5000 }).catch(() => null);
  await fix.click("#open-record").catch(() => null);
  const rec = await fix.waitForFunction(() => { const p = document.querySelector("#record-panel"), c = document.querySelector("#record-map"), n = document.querySelectorAll("#record-events .record-line").length; return p && !p.hidden && c?.width > 0 && n > 0 ? [c.width, c.height, n, document.querySelector("#record-when").textContent, [...document.querySelectorAll("#record-events .record-line")].map(x => x.textContent).slice(-3)] : null; }, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
  await fix.screenshot({ path: `${OUT}/89-record.png` });
  check(rec && rec[2] >= 3 && rec[4].some(t => /founded The North|joined The North/.test(t)), `an admin opens the record before the end: a ${rec?.[0]} by ${rec?.[1]} map picture (${rec?.[3]}) and ${rec?.[2]} events, the last "${rec?.[4]?.at(-1)}"`);
  await fix.evaluate(() => window.__ls.game.record.show(false));
  await fix.evaluate(() => window.__ls.game.toggleDiplomacy(false));
  await friend.evaluate(() => window.__ls.game.toggleDiplomacy(false));
  await fix.evaluate(() => window.__ls.game.toggleAdmin(true));
}
const gold0 = await fix.evaluate(() => window.__ls.game.world.purse?.money ?? 0);
await fix.fill("#admin-amount", "2500");
await fix.click("#admin-panel [data-give=money]");
const gold1 = await fix.waitForFunction(g => (window.__ls.game.world.purse?.money ?? 0) >= g + 2400 ? window.__ls.game.world.purse.money : null, gold0, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
check(gold1 !== null, `+ Gold gives 2500: ${gold0} to ${gold1}`);
await fix.click("#admin-panel [data-speed='2']");
const badge = await fix.waitForSelector("#world-speed:not([hidden])", { timeout: 5000 }).then(() => fix.textContent("#world-speed"), () => "");
check(badge === "2x", `the speed buttons set the world speed, shown in the bar: "${badge}"`);
await fix.click("#admin-end");
const armedText = await fix.textContent("#admin-end");
await fix.click("#admin-end");
const endNote = await fix.waitForSelector("#notice-text", { timeout: 5000 }).then(() => fix.textContent("#notice-text"), () => "");
const friendNote = await friend.waitForSelector("#notice-text", { timeout: 5000 }).then(() => friend.textContent("#notice-text"), () => "");
check(armedText === "Really end it?" && /ended this world/.test(endNote) && /ended this world/.test(friendNote), `End world asks once more ("${armedText}"), then everyone sees: "${friendNote}" (host: "${endNote}")`);
await fix.screenshot({ path: `${OUT}/21-admin-panel.png` });
await fix.click("#admin-reopen");
const reopenedUi = await fix.waitForFunction(() => !window.__ls.game.world.frozen && document.querySelector("#notice")?.hidden, null, { timeout: 5000 }).then(() => true, () => false);
await fix.click("#admin-panel [data-speed='1']");
check(reopenedUi, "Reopen world unfreezes it and the banner goes");
{
  const friendId = await friend.evaluate(() => window.__ls.game.world.you);
  const tick = `#admin-players [data-player="${friendId}"] input[data-power=give]`;
  await fix.waitForSelector(tick, { timeout: 5000 }).catch(() => {});
  await fix.click(tick).catch(() => {});
  const helper = await friend.waitForSelector("#open-admin:not([hidden])", { timeout: 5000 }).then(() => true, () => false);
  if (helper) await friend.click("#open-admin");
  const parts = await friend.evaluate(() => ({ open: !document.querySelector("#admin-panel").hidden, world: !document.querySelector("#admin-world").hidden, speed: !document.querySelector("#admin-speed").hidden, give: !document.querySelector("#admin-testing").hidden, cheats: !document.querySelector("#admin-cheat").hidden, title: document.querySelector("#admin-panel .title").textContent }));
  await friend.screenshot({ path: `${OUT}/21b-helper-panel.png` });
  const gold = await Promise.all([fix, friend].map(p => p.evaluate(() => window.__ls.game.world.purse?.money ?? 0)));
  if (parts.give) await friend.click("#admin-panel [data-give=money]").catch(() => {});
  const rose = (p, g) => p.waitForFunction(g => (window.__ls.game.world.purse?.money ?? 0) > g + 500 || null, g, { timeout: 5000 }).then(() => true, () => false);
  const given = (await Promise.all([rose(fix, gold[0]), rose(friend, gold[1])])).some(Boolean);
  check(helper && parts.open && parts.give && !parts.world && !parts.speed && !parts.cheats && given && /^Helper/.test(parts.title),
    `the host ticks Give and research for a friend: the friend gets the admin button, a "${parts.title}" panel with only that part, and can give gold`);
  await fix.click(tick).catch(() => {});
  const gone = await friend.waitForFunction(() => document.querySelector("#open-admin").hidden && document.querySelector("#admin-panel").hidden, null, { timeout: 5000 }).then(() => true, () => false);
  check(gone, "untick it and the friend's admin button and panel go");
  await fix.click("#admin-cheat [data-cheat=gold]");
  const endless = await fix.waitForFunction(() => document.querySelector("#control [data-res=gold] b")?.textContent === "\u221e" || null, null, { timeout: 5000 }).then(() => true, () => false);
  await fix.screenshot({ path: `${OUT}/21c-cheats.png` });
  await fix.click("#admin-cheat [data-cheat=gold]");
  const finite = await fix.waitForFunction(() => /^[\d,.]+[kM]?$/.test(document.querySelector("#control [data-res=gold] b")?.textContent ?? "") || null, null, { timeout: 5000 }).then(() => true, () => false);
  check(endless && finite, "the Cheats tick box for infinite gold shows gold as \u221e, and unticking it brings the number back");
}
await fix.keyboard.press("Escape");
check(!(await fix.isVisible("#admin-panel")), "Esc closes the Admin panel");
await fix.keyboard.press("y");
await fix.click("#upgrade-locked summary").catch(() => {});
const lockedRow = await fix.waitForSelector("#upgrade-panel .upgrade-row.locked", { timeout: 5000 }).then(() => fix.textContent("#upgrade-panel .upgrade-row.locked"), () => "");
check(await fix.isVisible("#upgrade-panel") && /Needs the Medieval era|research/.test(lockedRow), `Y opens the upgrade menu; Tribal buildings show why they cannot upgrade yet: "${lockedRow.trim()}"`);
await fix.screenshot({ path: `${OUT}/23-upgrade-locked.png` });
const medieval = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you;
  for (const id of ["clubs", "palisades", "chieftains", "mud_building", "healers", "herding", "age_medieval", "masonry"]) await g.conn.request({ t: "research", id });
  await g.conn.request({ t: "admin", op: "finish", nation: me });
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "money", amount: 5000 });
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "money", amount: 1000 });
  const cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0, placed = [];
  for (let r = 2; r <= 12 && placed.length < 4; r++) for (let dy = -r; dy <= r && placed.length < 4; dy++) for (let dx = -r; dx <= r && placed.length < 4; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || cx + dx < 0 || cy + dy < 0 || placed.some(p => Math.abs((p % w.w) - (cx + dx)) + Math.abs(((p / w.w) | 0) - (cy + dy)) < 2)) continue;
    if (w.owner[i] !== me || w.placeError("watchtower_wood", i)) continue;
    if ((await g.conn.request({ t: "build", type: "watchtower_wood", at: i })).ok) placed.push(i);
  }
  return placed;
});
const towersUp = await fix.waitForFunction(ps => ps.every(i => window.__ls.game.world.buildingAt(i)?.state === "active") && window.__ls.game.world.purse?.era === "M", medieval, { timeout: 15000 }).then(() => true, () => false);
await fix.waitForSelector("#upgrade-panel .upgrade-row[data-type=watchtower_wood]:not(.locked)", { timeout: 5000 }).catch(() => {});
const nextDesc = await fix.textContent("#upgrade-panel .upgrade-row[data-type=watchtower_wood] .desc").catch(() => "");
check(/stone tower/.test(nextDesc), `each upgrade row describes what it becomes: "${nextDesc}"`);
await fix.keyboard.press("Escape");
await fix.evaluate(i => { const g = window.__ls.game; g.selectBuilding(g.world.buildingAt(i).id); }, medieval[0]);
const cardUpg = await fix.waitForSelector("#building-upgrade:not([disabled])", { timeout: 5000 }).then(() => fix.textContent("#building-upgrade-info"), () => "");
if (cardUpg) await fix.click("#building-upgrade");
const oneDone = await fix.waitForFunction(i => window.__ls.game.world.buildingAt(i)?.type === "tower_stone", medieval[0], { timeout: 5000 }).then(() => true, () => false);
const othersLeft = await fix.evaluate(ps => ps.slice(1).map(i => window.__ls.game.world.buildingAt(i)?.type), medieval);
check(oneDone && othersLeft.every(t => t === "watchtower_wood"), `a building's card has an Upgrade button for just that one: "${cardUpg}"`);
await fix.evaluate(() => window.__ls.game.selectBuilding(null));
await fix.keyboard.press("y");
await fix.waitForSelector("#upgrade-panel .upgrade-row[data-type=watchtower_wood]", { timeout: 5000 }).catch(() => {});
await fix.click("#upgrade-all");
await fix.evaluate(async () => { const g = window.__ls.game, w = g.world; await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "money", amount: 400 - Math.floor(w.purse.money) }); });
const partial = await fix.waitForFunction(() => { const t = document.querySelector("#upgrade-go").textContent; return /of 3$/.test(t) || /Not enough/.test(t) ? [t, document.querySelector("#upgrade-total").textContent] : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await fix.screenshot({ path: `${OUT}/24b-upgrade-short-${MAP}.png` });
await fix.evaluate(async () => { const g = window.__ls.game; await g.conn.request({ t: "admin", op: "give", nation: g.world.you, what: "money", amount: 5000 }); });
await fix.waitForFunction(() => /^Upgrade 3$/.test(document.querySelector("#upgrade-go").textContent), null, { timeout: 5000 }).catch(() => {});
const short = partial?.[0].match(/^Upgrade (\d+) of 3$/);
check(short && partial[1].includes(`afford ${short[1]} of the 3`), `with gold for fewer than picked, the button says how many will be done: "${partial?.[0]}", "${partial?.[1]}"`);
const totalText = await fix.textContent("#upgrade-total");
const goText = await fix.textContent("#upgrade-go");
await fix.screenshot({ path: `${OUT}/24-upgrade-picked.png` });
await fix.click("#upgrade-go");
const summaryText = await fix.waitForSelector("#upgrade-summary:not([hidden])", { timeout: 5000 }).then(() => fix.textContent("#upgrade-summary"), () => "");
const upgraded = await fix.waitForFunction(ps => ps.every(i => window.__ls.game.world.buildingAt(i)?.type === "tower_stone"), medieval, { timeout: 5000 }).then(() => true, () => false);
check(towersUp && medieval.length === 4 && goText === "Upgrade 3" && /gold/.test(totalText) && /^Upgraded 3 for/.test(summaryText) && upgraded,
  `Pick all shows a live total ("${totalText.trim()}"), and ${goText} upgrades them at once: "${summaryText}"${medieval.length === 4 ? "" : ` (only ${medieval.length} towers placed)`}`);
await fix.screenshot({ path: `${OUT}/25-upgrade-done.png` });
await fix.keyboard.press("Escape");
check(!(await fix.isVisible("#upgrade-panel")), "Esc closes the upgrade menu");
const barracksAt = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you, cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  for (let r = 1; r <= 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (w.owner[i] !== me || w.placeError("barracks", i)) continue;
    if ((await g.conn.request({ t: "build", type: "barracks", at: i })).ok) return i;
  }
  return null;
});
const barracksUp = barracksAt !== null && await fix.waitForFunction(p => window.__ls.game.world.buildingAt(p)?.state === "active", barracksAt, { timeout: 15000 }).then(() => true, () => false);
await fix.keyboard.press("k");
const keepBox = await fix.waitForSelector("#army-panel [data-keep=club_warrior]", { timeout: 5000 }).then(() => true, () => false);
const lockedKnights = await fix.textContent("#army-panel [data-unit=knight] .why").catch(() => "");
if (keepBox) {
  await fix.fill("#army-panel [data-keep=club_warrior]", "12");
  await fix.dispatchEvent("#army-panel [data-keep=club_warrior]", "change");
}
const trainedUp = await fix.waitForFunction(() => (window.__ls.game.world.purse?.army?.reserve?.club_warrior ?? 0) >= 12, null, { timeout: 20000 }).then(() => true, () => false);
await fix.waitForTimeout(400);
const armyCount = await fix.textContent("#army-panel [data-count=club_warrior]").catch(() => "");
const armySummary = await fix.textContent("#army-summary").catch(() => "");
check(barracksUp && keepBox && trainedUp && /12 at home/.test(armyCount) && /Training \d/.test(armySummary) && /In the field: [\d,]+ of 1,?000 soldiers/.test(armySummary) && /Needs Stirrups research/.test(lockedKnights), `K opens the Army panel; keeping 12 club warriors trains them at the barracks: "${armyCount}" "${armySummary}"; knights say "${lockedKnights}"`);
await fix.screenshot({ path: `${OUT}/26-army.png` });
await fix.keyboard.press("Escape");
check(!(await fix.isVisible("#army-panel")), "Esc closes the Army panel");
const knightStack = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you;
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "unit", unit: "knight", amount: 600 });
  const cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  let at = cap;
  for (let r = 2; r <= 6 && at === cap; r++) for (let dy = -r; dy <= r && at === cap; dy++) for (let dx = -r; dx <= r && at === cap; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (w.owner[i] === me && !w.buildingAt(i) && ![i - 1, i + 1, i - w.w, i + w.w, i + w.w - 1, i + w.w + 1].some(j => w.buildingAt(j)) && ![...w.stacks.values()].some(s => Math.abs((s.pos % w.w) - (i % w.w)) + Math.abs(((s.pos / w.w) | 0) - ((i / w.w) | 0)) < 3)) at = i;
  }
  const r = await g.conn.request({ t: "stack", share: 0.9, at });
  if (!r.ok) return null;
  g.select(r.stack);
  return r.stack;
});
const knightFigures = await fix.waitForFunction(id => {
  const g = window.__ls.game, w = g.world, v = g.view, st = w.stacks.get(id);
  if (!st?.mix?.knight) return null;
  g.focus(st.pos, 40);
  st.xp = 2;
  const figs = v.soldiers(v.visibleRange()).filter(f => f.stack === id);
  return figs.length ? { sprites: figs.map(f => f.sprite), share: st.mix.knight / st.troops, soldiers: Math.floor(st.troops / w.soldierRules.troopsEach) } : null;
}, knightStack, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await fix.waitForTimeout(600);
await fix.screenshot({ path: `${OUT}/27-soldiers.png` });
const knightShown = knightFigures ? knightFigures.sprites.filter(s => s.startsWith("knight_")).length / knightFigures.sprites.length : 0;
check(knightFigures && knightFigures.sprites.length >= Math.min(knightFigures.soldiers, 50) && Math.abs(knightShown - knightFigures.share) < 0.05, `at close zoom a company with knights is drawn soldier by soldier: ${knightFigures?.sprites.length} figures, ${Math.round(knightShown * 100)}% knights for ${Math.round((knightFigures?.share ?? 0) * 100)}% of its troops`);
const shop = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you;
  await g.conn.request({ t: "research", id: "siegecraft" });
  await g.conn.request({ t: "admin", op: "finish", nation: me });
  for (const [what, amount] of [["money", 5000]]) await g.conn.request({ t: "admin", op: "give", nation: me, what, amount });
  const cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0, free = i => w.owner[i] === me && !w.buildingAt(i);
  for (let r = 3; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (![i, i + 1, i + w.w, i + w.w + 1].every(free)) continue;
    const b = await g.conn.request({ t: "build", type: "siege_workshop", at: i });
    if (b.ok) return b.building;
  }
  return null;
});
const shopUp = await fix.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", shop, { timeout: 15000 }).then(() => true, () => false);
await fix.evaluate(id => { const g = window.__ls.game; g.selectBuilding(id); g.focus(g.world.buildings.get(id).anchor, 24); }, shop);
await fix.waitForSelector("#building-make [data-make=catapult]:not([disabled])", { timeout: 5000 }).catch(() => null);
await fix.click("#building-make [data-make=catapult]").catch(() => null);
const makingText = await fix.waitForFunction(() => /catapult/.test(document.querySelector("#building-queue")?.textContent ?? ""), null, { timeout: 5000 }).then(() => fix.textContent("#building-queue"), () => "");
const cat = await fix.waitForFunction(() => { const w = window.__ls.game.world; return [...w.machines.values()].find(u => u.owner === w.you && u.type === "catapult")?.id ?? null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
check(shop && shopUp && /Building a catapult|Waiting to start a catapult/.test(makingText) && /You have \d+ of 100 tanks, guns and siege engines/.test(makingText) && cat, `a siege workshop, after Siegecraft, builds a catapult from its panel, with the limit shown ("${makingText.trim()}")`);
const cog = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  const r = await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit: "cog", amount: 1 });
  return r.machines?.[0] ?? null;
});
const screenAt = (page, pick) => page.evaluate(pick => {
  const g = window.__ls.game, w = g.world, v = g.view, at = pick.machine ? w.machines.get(pick.machine)?.at : w.stacks.get(pick.stack)?.pos;
  if (at === undefined) return null;
  const [x, y] = v.plotToScreen((at % w.w) + 0.5, ((at / w.w) | 0) + 0.5);
  return { x: x / v.ratio, y: y / v.ratio };
}, pick);
const between = async (a, b) => fix.evaluate(([a, b]) => {
  const g = window.__ls.game, w = g.world, p = w.machines.get(a)?.at ?? a, q = w.stacks.get(b)?.pos ?? w.machines.get(b)?.at ?? b;
  const x = Math.round(((p % w.w) + (q % w.w)) / 2), y = Math.round((((p / w.w) | 0) + ((q / w.w) | 0)) / 2);
  g.focus(y * w.w + x, 20);
}, [a, b]);
await fix.waitForFunction(id => window.__ls.game.world.machines.has(id), cog, { timeout: 5000 }).catch(() => null);
await fix.evaluate(id => { const g = window.__ls.game; g.focus(g.world.machines.get(id).at, 24); }, cat);
await fix.waitForTimeout(300);
const catSpot = await screenAt(fix, { machine: cat });
const catUnder = catSpot && await fix.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.id || e?.closest("[id]")?.id || e?.tagName; }, [catSpot.x, catSpot.y]);
if (catSpot) await fix.mouse.click(catSpot.x, catSpot.y);
const catUnderStack = await fix.evaluate(() => window.__ls.game.selected !== null);
if (catSpot && catUnderStack) await fix.mouse.click(catSpot.x, catSpot.y);
const catTitle = await fix.waitForSelector("#machine-panel:not([hidden])", { timeout: 3000 }).then(() => fix.textContent("#machine-title"), () => "");
const catPicked = await fix.evaluate(() => { const g = window.__ls.game, p = document.querySelector("#machine-panel"); return { stack: g.selected, machine: g.selectedMachine, building: g.selectedBuilding, shown: !p.hidden, h: p.getBoundingClientRect().height }; });
await between(cat, knightStack);
await fix.waitForTimeout(300);
const stackSpot = await screenAt(fix, { stack: knightStack });
await fix.evaluate(() => { const g = window.__ls.game; if (!g.__req) { g.__req = g.conn.request.bind(g.conn); g.conn.request = async m => { const r = await g.__req(m); if (m.t === "machine") g.__lastMachine = [m, r]; return r; }; } });
if (stackSpot) await fix.mouse.click(stackSpot.x, stackSpot.y, { button: "right" });
const catRing = await ringItems(fix);
if (catRing[0] === "follow") await fix.click("#ring [data-ring=follow]");
const following = await fix.waitForFunction(([c, s]) => window.__ls.game.world.purse?.machines?.orders?.some(o => o.id === c && o.follow === s), [cat, knightStack], { timeout: 5000 }).then(() => true, () => false);
const followWhy = following ? "" : await fix.evaluate(([c, s]) => { const g = window.__ls.game, w = g.world; return ` [sent ${JSON.stringify(g.__lastMachine ?? null)}, orders ${JSON.stringify(w.purse?.machines?.orders ?? null)}, knights ${JSON.stringify(w.stacks.get(s) ? { pos: w.stacks.get(s).pos, troops: w.stacks.get(s).troops } : null)}, catapult ${JSON.stringify(w.machines.get(c) ? { at: w.machines.get(c).at, follow: w.machines.get(c).follow } : null)}]`; }, [cat, knightStack]);
check(catTitle === "Your catapult" && following, `clicking the catapult at ${JSON.stringify(catSpot)} over ${catUnder}${catUnderStack ? ", twice because a stack stands on it," : ""} opens its panel ("${catTitle}", ${JSON.stringify(catPicked)}), and a right-click on your stack offers ${catRing.join(", ")}; Follow stack makes it follow${followWhy}`);
await fix.evaluate(id => window.__ls.game.select(id), knightStack);
await between(cog, knightStack);
await fix.waitForTimeout(300);
const cogSpot = await screenAt(fix, { machine: cog });
if (cogSpot) await fix.mouse.click(cogSpot.x, cogSpot.y, { button: "right" });
const cogRing = await ringItems(fix);
if (cogRing[0] === "board") await fix.click("#ring [data-ring=board]");
const boarded = await fix.waitForFunction(id => window.__ls.game.world.machines.get(id)?.cargo || null, cog, { timeout: 20000 }).then(h => h.jsonValue(), () => 0);
await fix.evaluate(id => { const g = window.__ls.game; g.select(null); g.selectMachine(id); g.focus(g.world.machines.get(id).at, 24); }, cog);
await fix.waitForTimeout(600);
await fix.screenshot({ path: `${OUT}/28-machines.png` });
const cargoLine = await fix.textContent("#machine-cargo").catch(() => "");
check(boarded > 0 && new RegExp(`^${boarded} of 200 troops aboard`).test(cargoLine), `with the stack selected, a right-click on the cog offers ${cogRing.join(", ")}; Board ship boards it, and the cog's panel says "${cargoLine}"`);
await fix.keyboard.press("k");
const fleet = await fix.waitForSelector("#army-machines [data-machines=cog]", { timeout: 3000 }).then(() => fix.textContent("#army-machines"), () => "");
check(/1 catapult/.test(fleet) && /1 cog(, 1 idle)?, \d+ troops aboard/.test(fleet), `the Army panel lists your machines: "${fleet}"`);
await fix.keyboard.press("Escape");
await fix.evaluate(id => { const g = window.__ls.game; g.focus(g.world.machines.get(id).at, 48); }, cog);
await fix.waitForTimeout(400);
await fix.screenshot({ path: `${OUT}/28b-cog-close.png` });
await fix.evaluate(id => { const g = window.__ls.game; g.selectMachine(id); g.focus(g.world.machines.get(id).at, 48); }, cat);
await fix.waitForTimeout(400);
await fix.screenshot({ path: `${OUT}/28c-catapult-close.png` });
await fix.keyboard.press("Escape");
await fix.click("#leave-world");
await fix.waitForSelector("#open-accounts", { timeout: 5000 });
await fix.click("#open-accounts");
const rows = await fix.waitForFunction(() => document.querySelectorAll("#accounts [data-account]").length, null, { timeout: 5000 }).then(h => h.jsonValue(), () => 0);
check(rows > 1 && await fix.isVisible("#accounts-log"), `Accounts lists ${rows} accounts with New password and Remove, and the admin log`);
await fix.locator("#accounts-panel h2").first().scrollIntoViewIfNeeded();
await fix.screenshot({ path: `${OUT}/22-accounts.png` });
const doomed = await newWorld(fix, "UI delete me", { map: "test", w: 100, h: 80, bots: 0 });
await fix.reload();
await fix.waitForSelector(`[data-delete="${doomed}"]`, { timeout: 5000 });
await fix.click(`[data-delete="${doomed}"]`);
const sure = await fix.textContent(`[data-delete="${doomed}"]`);
await fix.click(`[data-delete="${doomed}"]`);
const vanished = await fix.waitForSelector(`[data-delete="${doomed}"]`, { state: "detached", timeout: 5000 }).then(() => true, () => false);
check(sure === "Really delete?" && vanished && /Deleted UI delete me/.test(await fix.textContent(".msg")), `Delete asks once more ("${sure}"), then the world is gone from the list`);

const gp = await openPage({ viewport: { width: 1280, height: 720 } });
await login(gp, "rw_scorch", "correct horse");
const gpId = await newWorld(gp, "UI gunpowder", { map: "test", w: 240, h: 160, seed: 21, bots: 0, rules: { buildSpeed: 60, produceSpeed: 50, researchSpeed: 400, trainSpeed: 20 } });
await gp.goto(`${BASE}/#w=${gpId}`);
await gp.reload();
await ready(gp);
const gpEra = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  for (let i = 0; i < w.terrain.length; i += 17) { const x = i % w.w, y = (i / w.w) | 0; if (w.terrain[i] >= 12 && w.terrain[i] <= 14 && (await g.conn.request({ t: "spawn", x, y })).ok) break; }
  await new Promise(r => setTimeout(r, 1200));
  const me = w.you, nodes = w.tech.nodes, done = [];
  for (const eras of [["T", "M"], ["G"]]) {
    for (const node of nodes.filter(n => eras.includes(n.era))) { await g.conn.request({ t: "research", id: node.id }); await new Promise(r => setTimeout(r, 70)); }
    const r = await g.conn.request({ t: "admin", op: "finish", nation: me });
    done.push(...(r.done ?? []));
  }
  await new Promise(r => setTimeout(r, 1000));
  for (const [what, amount] of [["money", 30000]]) await g.conn.request({ t: "admin", op: "give", nation: me, what, amount });
  return { era: w.purse?.era, gunpowder: nodes.filter(n => n.era === "G").every(n => done.includes(n.id)) };
});
await gp.waitForFunction(() => window.__ls.game.world.purse?.era === "G", null, { timeout: 5000 }).catch(() => {});
await gp.keyboard.press("u");
const gpNode = await gp.waitForSelector("#research-panel [data-node=banking].known", { timeout: 5000 }).then(() => true, () => false);
await gp.screenshot({ path: `${OUT}/30-gunpowder-research.png` });
await gp.keyboard.press("u");
check(gpEra.gunpowder && gpNode, `a nation researches through to the Gunpowder era and all 14 of its nodes, shown in the research panel`);
const placeNear = (type, from = null) => gp.evaluate(async ([type, from]) => {
  const g = window.__ls.game, w = g.world, cap = from ?? w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  for (let r = 2; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (cy + dy) * w.w + cx + dx;
    if (w.placeError(type, i)) continue;
    const res = await g.conn.request({ t: "build", type, at: i });
    if (res.ok) return { id: res.building, at: i };
  }
  return null;
}, [type, from]);
const active = b => gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", b?.id, { timeout: 15000 }).then(() => true, () => false);
const income0 = await gp.evaluate(() => window.__ls.game.world.purse?.vitals?.tax);
const bank = await placeNear("bank");
const bankUp = bank && await active(bank);
const income1 = await gp.waitForFunction(i0 => { const i = window.__ls.game.world.purse?.vitals?.tax; return i > i0 * 1.07 ? i : null; }, income0, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
check(bankUp && income1 && Math.abs(income1 / income0 - 1.08) < 0.02, `a bank raises tax income by 8%: ${income0} to ${income1} a second`);
await gp.keyboard.press("k");
const armyText = await gp.waitForSelector("#army-panel:not([hidden])", { timeout: 5000 }).then(() => gp.textContent("#army-panel"), () => "");
check(["Musketeers", "Line infantry", "Grenadiers", "Light cavalry"].every(t => armyText.includes(t)), "the Army panel offers musketeers, line infantry, grenadiers and light cavalry");
await gp.keyboard.press("Escape");
const foundry = await placeNear("cannon_foundry");
const foundryUp = foundry && await active(foundry);
await gp.evaluate(id => { const g = window.__ls.game; g.selectBuilding(id); g.focus(g.world.buildings.get(id).anchor, 16); }, foundry?.id);
await gp.waitForSelector("#building-make [data-make=cannon]:not([disabled])", { timeout: 5000 }).catch(() => {});
await gp.click("#building-make [data-make=cannon]").catch(() => {});
const cannon = await gp.waitForFunction(() => { const w = window.__ls.game.world; return [...w.machines.values()].find(u => u.owner === w.you && u.type === "cannon")?.id ?? null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
check(foundryUp && cannon !== null, "a cannon foundry casts a cannon from its panel");
const fort = await placeNear("star_fort");
const fortUp = fort && await active(fort);
await gp.evaluate(id => { const g = window.__ls.game; g.selectBuilding(id); g.focus(g.world.buildings.get(id).anchor + 1 + g.world.w, 12); }, fort?.id);
await gp.waitForTimeout(400);
const fortSpot = await gp.evaluate(id => {
  const g = window.__ls.game, w = g.world, v = g.view, b = w.buildings.get(id), cx = (b.anchor % w.w) + 1, cy = Math.floor(b.anchor / w.w) + 1;
  for (let r = 2; r <= 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (cy + dy) * w.w + cx + dx, [px, py] = v.plotToScreen(cx + dx + 0.5, cy + dy + 0.5);
    if (w.owner[i] === w.you && !w.buildingAt(i) && document.elementFromPoint(px / v.ratio, py / v.ratio)?.id === "map") return { x: px / v.ratio, y: py / v.ratio };
  }
  return null;
}, fort?.id);
if (fortSpot) await gp.mouse.move(fortSpot.x, fortSpot.y);
const fortTip = await gp.waitForFunction(() => /fortified/.test(document.querySelector(".tip")?.textContent ?? "") ? document.querySelector(".tip").textContent : null, null, { timeout: 3000 }).then(h => h.jsonValue(), () => "");
await gp.screenshot({ path: `${OUT}/31-star-fort.png` });
check(fortUp && /defends at 1.5 times/.test(fortTip), `a star fort draws its reach, and your land inside it says so: "${fortTip}"`);

const ap = await openPage({ viewport: { width: 1280, height: 720 } });
await login(ap, "rw_scorch", "correct horse");
const awayId = await newWorld(ap, "UI away", { map: "test", w: 160, h: 100, seed: 23, bots: 0, rules: { buildSpeed: 20, sleepSpeed: 3600 } });
await ap.goto(`${BASE}/#w=${awayId}`);
await ap.reload();
await ready(ap);
const awaySetup = await ap.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  let at = null;
  for (let i = 0; i < w.terrain.length && at === null; i += 23) { const x = i % w.w, y = (i / w.w) | 0; if (x > 20 && y > 20 && x < w.w - 20 && y < w.h - 20 && w.terrain[i] >= 12 && w.terrain[i] <= 14 && (await g.conn.request({ t: "spawn", x, y })).ok) at = { x, y }; }
  await new Promise(r => setTimeout(r, 800));
  const zone = await g.conn.request({ t: "zone", zone: "res", x: at.x - 7, y: at.y - 7, w: 14, h: 5 });
  for (const [what, amount] of [["money", 2000]]) await g.conn.request({ t: "admin", op: "give", nation: w.you, what, amount });
  return { at, zone: zone.ok };
});
await ap.goto(`${BASE}/test.html`);
let slept = false;
for (let k = 0; k < 50 && !slept; k++) { slept = await ap.evaluate(async id => !(await (await fetch(`/api/worlds/${id}/status`, { headers: { authorization: `Bearer ${localStorage.getItem("ls_token")}` } })).json()).looping, awayId); if (!slept) await ap.waitForTimeout(100); }
await ap.waitForTimeout(12000);
const mp = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await login(mp, "rw_scorch", "correct horse");
await mp.goto(`${BASE}/#w=${awayId}`);
await mp.reload();
await ready(mp);
const awayShown = await mp.waitForSelector("#away-panel:not([hidden])", { timeout: 20000 }).then(() => true, () => false);
const awayText = awayShown ? await mp.textContent("#away-panel") : "";
const awayFits = await mp.evaluate(() => { const r = document.querySelector("#away-panel").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; });
await mp.screenshot({ path: `${OUT}/32-away-phone.png` });
check(awaySetup.zone && slept && awayShown && /While you were away/.test(awayText) && /caught up \d+ h/.test(awayText) && /Gold \+/.test(awayText) && /People \d+ to \d+/.test(awayText) && /90%/.test(awayText) && awayFits,
  `back after 12 game hours, a phone shows "While you were away": "${awayText.replace(/\s+/g, " ").slice(0, 260)}"`);
const summary = await mp.evaluate(() => window.__ls.game.away.last);
await mp.click("#away-ok");
const awayClosed = await mp.waitForSelector("#away-panel", { state: "hidden", timeout: 3000 }).then(() => true, () => false);
const feedLine = await mp.evaluate(() => [...document.querySelectorAll("#feed-list .item .text")].map(e => e.textContent).find(t => /Welcome back/.test(t)) ?? "");
check(awayClosed && /Welcome back/.test(feedLine), `the panel closes with its button, and the feed keeps "${feedLine}"`);
await ap.goto(`${BASE}/#w=${awayId}`);
await ap.reload();
await ready(ap);
await ap.evaluate(s => window.__ls.game.away.summary(s), summary);
await ap.waitForSelector("#away-panel:not([hidden])", { timeout: 3000 }).catch(() => {});
await ap.screenshot({ path: `${OUT}/33-away-desktop.png` });
await ap.keyboard.press("Escape");
const escClosed = await ap.waitForSelector("#away-panel", { state: "hidden", timeout: 3000 }).then(() => true, () => false);
check(escClosed, "on a computer the same panel closes with Esc");

await ap.keyboard.press("t");
await ap.waitForSelector("#town-panel:not([hidden]) #policy-tax", { timeout: 5000 }).catch(() => {});
const income0p = await ap.evaluate(() => window.__ls.game.world.purse?.vitals?.income);
await ap.focus("#policy-tax");
await ap.keyboard.press("ArrowRight");
await ap.waitForTimeout(150);
await ap.keyboard.press("ArrowRight");
const taxSet = await ap.waitForFunction(() => window.__ls.game.world.purse?.policy?.tax === 4, null, { timeout: 5000 }).then(() => true, () => false);
const income1p = await ap.waitForFunction(i0 => { const i = window.__ls.game.world.purse?.vitals?.income; return i > i0 ? i : null; }, income0p, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
const taxWords = [await ap.textContent("#policy-tax-name"), await ap.textContent("#policy-tax-effect")];
const viewStill = await ap.evaluate(() => document.activeElement?.id === "policy-tax");
await ap.screenshot({ path: `${OUT}/34-policies-desktop.png` });
check(taxSet && income1p > income0p && taxWords[0] === "Very high" && /unhappy/.test(taxWords[1]) && viewStill,
  `arrow keys on the tax slider set Very high: income ${income0p} to ${income1p} gold a second, "${taxWords[1]}"`);
await ap.keyboard.press("Escape");

await mp.reload();
await ready(mp);
await mp.tap("#open-town");
const armyBox = await mp.waitForSelector("#town-panel:not([hidden]) #policy-army", { timeout: 5000 }).then(async h => { await h.scrollIntoViewIfNeeded(); return h.boundingBox(); }, () => null);
if (armyBox) await mp.touchscreen.tap(armyBox.x + armyBox.width * 0.92, armyBox.y + armyBox.height / 2);
const armySet = await mp.waitForFunction(() => { const c = window.__ls.game.world.purse?.policy?.conscription; return c > 0.5 ? c : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
const armyWords = await mp.textContent("#policy-army-effect");
await mp.screenshot({ path: `${OUT}/35-policies-phone.png` });
const pwName = "pwui" + Math.floor(Math.random() * 1e6);
const pp = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await pp.goto(`${BASE}/`);
const pwReg = await pp.evaluate(async ([name, invite]) => { const r = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password: "old password", invite }) }); const b = await r.json(); localStorage.setItem("ls_token", b.token); return !!b.token; }, [pwName, INVITE]);
await pp.reload();
await pp.tap("#open-password").catch(() => {});
await pp.fill("#password-current", "old password").catch(() => {});
await pp.fill("#password-new", "new password").catch(() => {});
await pp.fill("#password-again", "new passwort").catch(() => {});
await pp.tap("#password-save").catch(() => {});
const pwMismatch = await pp.textContent(".msg").catch(() => "");
await pp.fill("#password-again", "new password").catch(() => {});
await pp.tap("#password-save").catch(() => {});
const pwDone = await pp.waitForFunction(() => /Password changed/.test(document.querySelector(".msg")?.textContent ?? ""), null, { timeout: 5000 }).then(() => true, () => false);
await pp.screenshot({ path: `${OUT}/36-password.png` });
const pwLogin = await pp.evaluate(async name => (await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password: "new password" }) })).status, pwName);
check(pwReg && /not the same/.test(pwMismatch) && pwDone && pwLogin === 200, `a player changes their own password from the world list on a phone ("${pwMismatch}" first), and the new one logs in`);
await mp.tap("#open-army").catch(() => {});
await mp.waitForSelector("#army-panel:not([hidden]) #army-guard", { timeout: 5000 }).catch(() => {});
await mp.tap("#army-guard").catch(() => {});
const guardOn = await mp.waitForFunction(() => window.__ls.game.world.purse?.guard === true, null, { timeout: 5000 }).then(() => true, () => false);
await mp.screenshot({ path: `${OUT}/37-guard-army.png` });
await mp.evaluate(() => window.__ls.game.toggleArmy(false));
const guardStack = await mp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, r = await g.conn.request({ t: "stack", share: 0.2 });
  if (!r.ok) return null;
  g.select(r.stack);
  return r.stack;
});
await mp.waitForSelector("#stack-panel:not([hidden]) #stack-standing", { timeout: 5000 }).catch(() => {});
await mp.selectOption("#stack-standing", "guard").catch(() => {});
const standingGuard = await mp.waitForFunction(id => window.__ls.game.world.purse?.orders?.find(o => o.id === id)?.standing === "guard", guardStack, { timeout: 5000 }).then(() => true, () => false);
check(guardOn && guardStack !== null && standingGuard, "on a phone, Guard my land turns on in the Army panel, and a stack takes the Guard standing order");
check(armyBox && armySet && /usual workers/.test(armyWords), `a tap on a phone moves the army share to ${armySet}: "${armyWords}"`);

const rectIn = (p, sel) => p.$eval(sel, e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }).catch(() => null);
const makeStacks = p => p.evaluate(async () => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, made = [];
  g.away?.show(false);
  for (const dx of [-4, 0, 4]) { const r = await g.conn.request({ t: "stack", share: 0.1, at: cap + dx }); if (r.ok) made.push(r.stack); await new Promise(r => setTimeout(r, 80)); }
  g.focus(cap, 14);
  await new Promise(r => setTimeout(r, 900));
  for (let k = 0; k < 50 && !made.every(id => w.stacks.has(id)); k++) await new Promise(r => setTimeout(r, 100));
  return made.map(id => { const s = w.stacks.get(id), [x, y] = g.view.plotToScreen((s.pos % w.w) + 0.5, Math.floor(s.pos / w.w) + 0.5); return { id, x: x / g.view.ratio, y: y / g.view.ratio }; });
});
await gp.bringToFront();
const sw = await makeStacks(gp);
await gp.mouse.move(sw[0].x, sw[0].y);
await gp.mouse.down();
for (const s of sw.slice(1)) await gp.mouse.move(s.x, s.y, { steps: 5 });
await gp.screenshot({ path: `${OUT}/41-swipe.png` });
await gp.mouse.up();
const swiped = await gp.evaluate(() => [...(window.__ls.game.group ?? [])]);
const groupTitle = await gp.textContent("#group-title").catch(() => "");
await gp.keyboard.press("c");
const allTake = await gp.waitForFunction(ids => ids.every(id => window.__ls.game.world.stacks.get(id)?.order === "advance"), sw.map(s => s.id), { timeout: 5000 }).then(() => true, () => false);
await gp.screenshot({ path: `${OUT}/42-group-panel.png` });
check(sw.length === 3 && sw.every(s => swiped.includes(s.id)) && /stacks/.test(groupTitle) && allTake, `a mouse drag that starts on your stack selects every stack it crosses ("${groupTitle}"), and C sends them all into unclaimed land`);
await gp.click("#group-halt");
await gp.keyboard.press("Escape");
await gp.keyboard.down("Shift");
await gp.mouse.move(sw[0].x - 20, sw[0].y - 40);
await gp.mouse.down();
await gp.mouse.move(sw[1].x + 20, sw[1].y + 20, { steps: 5 });
await gp.mouse.up();
await gp.keyboard.up("Shift");
const boxed = await gp.evaluate(() => [...(window.__ls.game.group ?? [])]);
await gp.click("#group-move");
await gp.mouse.click(sw[2].x + 60, sw[2].y + 40);
const moved = await gp.waitForFunction(ids => ids.every(id => window.__ls.game.world.stacks.get(id)?.order === "move"), [sw[0].id, sw[1].id], { timeout: 5000 }).then(() => true, () => false);
check(boxed.includes(sw[0].id) && boxed.includes(sw[1].id) && !boxed.includes(sw[2].id) && moved, `Shift-drag boxes two of the three stacks, and Move then a click sends both`);
await gp.keyboard.press("Escape");
await mp.bringToFront();
const ms = await makeStacks(mp);
const phoneSwipe = await mp.evaluate(pts => {
  const c = document.getElementById("map"), keep = c.setPointerCapture;
  c.setPointerCapture = () => {};
  const at = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 31, pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  at("pointerdown", pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) for (let t = 1; t <= 4; t++) at("pointermove", pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t / 4, pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t / 4);
  at("pointerup", pts.at(-1).x, pts.at(-1).y);
  c.setPointerCapture = keep;
  return [...(window.__ls.game.group ?? [])];
}, ms);
await mp.screenshot({ path: `${OUT}/43-swipe-phone.png` });
check(ms.length === 3 && ms.every(s => phoneSwipe.includes(s.id)) && await mp.isVisible("#group-panel"), `on a phone a finger swiped across three stacks selects all ${phoneSwipe.length}`);
await mp.evaluate(() => window.__ls.game.selectGroup(null));
const zonesOf = (p, code) => p.evaluate(c => { let n = 0; for (const z of window.__ls.game.world.zone) if (z === c) n++; return n; }, code);
await gp.bringToFront();
await gp.evaluate(() => { const g = window.__ls.game, w = g.world; g.setPref("crosshair", true); g.focus(w.nations.get(w.you).capital, 12); g.startZone("com"); });
const com0 = await zonesOf(gp, 2);
const hintStart = await gp.textContent("#aim-hint");
await gp.keyboard.press(" ");
const hintHeld = await gp.textContent("#aim-hint");
await gp.keyboard.down("ArrowRight"); await gp.waitForTimeout(300); await gp.keyboard.up("ArrowRight");
await gp.keyboard.down("ArrowDown"); await gp.waitForTimeout(250); await gp.keyboard.up("ArrowDown");
await gp.keyboard.press(" ");
const com1 = await gp.waitForFunction(c0 => { let n = 0; for (const z of window.__ls.game.world.zone) if (z === 2) n++; return n > c0 ? n : null; }, com0, { timeout: 5000 }).then(h => h.jsonValue(), () => com0);
check(/mark one corner/.test(hintStart) && /size the area/.test(hintHeld) && com1 > com0, `with the crosshair on, Space marks a corner, the arrow keys size the zone and Space again zones ${com1 - com0} plots`);
await gp.evaluate(() => { const g = window.__ls.game; g.stopBuild(); g.setPref("crosshair", false); });
await mp.bringToFront();
await mp.evaluate(() => { const g = window.__ls.game, w = g.world; g.setPref("crosshair", true); g.focus(w.nations.get(w.you).capital, 12); g.startZone("com"); });
const pc0 = await zonesOf(mp, 2);
await mp.tap("#aim-select");
const mapBox = await rectIn(mp, "#map");
await mp.evaluate(([x, y]) => {
  const c = document.getElementById("map"), keep = c.setPointerCapture;
  c.setPointerCapture = () => {};
  const at = (type, px, py) => c.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: "touch", clientX: px, clientY: py, bubbles: true, isPrimary: true }));
  at("pointerdown", x, y);
  for (let k = 1; k <= 6; k++) at("pointermove", x - k * 12, y - k * 8);
  at("pointerup", x - 72, y - 48);
  c.setPointerCapture = keep;
}, [mapBox.x + mapBox.w * 0.6, mapBox.y + mapBox.h * 0.6]);
await mp.tap("#aim-select");
const pc1 = await mp.waitForFunction(c0 => { let n = 0; for (const z of window.__ls.game.world.zone) if (z === 2) n++; return n > c0 ? n : null; }, pc0, { timeout: 5000 }).then(h => h.jsonValue(), () => pc0);
check(pc1 > pc0, `on a phone with the crosshair, Select, a one-finger drag of the view, and Select again zones ${pc1 - pc0} plots`);
await mp.evaluate(() => { const g = window.__ls.game; g.stopBuild(); g.setPref("crosshair", false); });
await gp.bringToFront();
await gp.evaluate(() => { localStorage.removeItem("ls_layout"); window.__ls.game.layout.reset(); window.__ls.game.toggleSettings(true); });
const nations0 = await rectIn(gp, "#nations");
await gp.click("#layout-arrange");
await gp.waitForSelector('#layout-edit .layout-frame[data-panel="nations"]', { timeout: 3000 }).catch(() => {});
const nFrame = await rectIn(gp, '.layout-frame[data-panel="nations"]');
await gp.mouse.move(nFrame.x + 60, nFrame.y + 30);
await gp.mouse.down();
await gp.mouse.move(nFrame.x + 360, nFrame.y + 230, { steps: 6 });
await gp.mouse.up();
const rGrip = await rectIn(gp, '.layout-frame[data-panel="research-panel"] .layout-grip');
await gp.mouse.move(rGrip.x + rGrip.w - 4, rGrip.y + rGrip.h - 4);
await gp.mouse.down();
await gp.mouse.move(rGrip.x + rGrip.w - 204, rGrip.y + rGrip.h - 104, { steps: 6 });
await gp.mouse.up();
await gp.screenshot({ path: `${OUT}/38-layout-edit.png` });
await gp.click("#layout-done");
const nations1 = await rectIn(gp, "#nations");
const savedLayout = await gp.evaluate(() => JSON.parse(localStorage.getItem("ls_layout") ?? "{}"));
check(Math.abs(nations1.x - nations0.x - 300) < 4 && Math.abs(nations1.y - nations0.y - 200) < 4 && savedLayout.nations && savedLayout["research-panel"]?.w > 0,
  `Arrange panels moves the leaderboard by dragging (${Math.round(nations0.x)},${Math.round(nations0.y)} to ${Math.round(nations1.x)},${Math.round(nations1.y)}) and resizes Research by its corner, and keeps both`);
await gp.reload();
await ready(gp);
const nations2 = await rectIn(gp, "#nations");
await gp.keyboard.press("u");
await gp.waitForSelector("#research-panel:not([hidden])", { timeout: 5000 }).catch(() => {});
const research2 = await rectIn(gp, "#research-panel"), vw = await gp.evaluate(() => innerWidth);
await gp.screenshot({ path: `${OUT}/39-layout-research.png` });
await gp.keyboard.press("u");
check(Math.abs(nations2.x - nations1.x) < 4 && Math.abs(research2.w - savedLayout["research-panel"].w * vw) < 4, `after a reload the layout is the same: Research is ${Math.round(research2?.w)} px wide`);
await gp.evaluate(() => window.__ls.game.layout.edit());
await gp.keyboard.press("Escape");
const escGone = await gp.waitForSelector("#layout-edit", { state: "detached", timeout: 2000 }).then(() => true, () => false);
await gp.evaluate(() => window.__ls.game.toggleSettings(true));
await gp.click("#layout-reset");
await gp.evaluate(() => window.__ls.game.toggleSettings(false));
const nations3 = await rectIn(gp, "#nations");
check(escGone && Math.abs(nations3.x - nations0.x) < 4 && Math.abs(nations3.y - nations0.y) < 4, "Esc leaves arranging, and Put every panel back returns the leaderboard to its place");
await mp.bringToFront();
await mp.evaluate(() => window.__ls.game.layout.edit());
const barMove = await mp.evaluate(() => {
  const f = document.querySelector('.layout-frame[data-panel="action-bar"]'), b = f.getBoundingClientRect();
  const at = (type, x, y) => f.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
  const x = b.left + 30, y = b.top + 10;
  at("pointerdown", x, y);
  at("pointermove", x - 40, y - 60);
  at("pointerup", x - 40, y - 60);
  return { x: b.left, y: b.top };
});
await mp.screenshot({ path: `${OUT}/40-layout-phone.png` });
await mp.tap("#layout-done");
const bar1 = await rectIn(mp, "#action-bar");
check(Math.abs(bar1.y - barMove.y + 60) < 4 && Math.abs(bar1.x - barMove.x + 40) < 4, `on a phone a finger drags the action bar to a new place (${Math.round(barMove.x)},${Math.round(barMove.y)} to ${Math.round(bar1.x)},${Math.round(bar1.y)})`);
await mp.evaluate(() => window.__ls.game.layout.reset());

const spawnSomewhere = p => p.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  for (let k = 0; k < 400; k++) {
    const x = 10 + Math.floor(Math.random() * (w.w - 20)), y = 10 + Math.floor(Math.random() * (w.h - 20));
    if ((await g.conn.request({ t: "spawn", x, y })).ok) return y * w.w + x;
  }
  return null;
});
const localInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const feedText = p => p.evaluate(() => document.querySelector("#feed-list")?.textContent ?? "");
const setTimes = (p, schedule) => p.evaluate(async s => {
  const g = window.__ls.game, now = g.world.serverNow(), out = {};
  for (const [k, v] of Object.entries(s)) out[k] = typeof v === "number" && k !== "shrinkEvery" ? Math.round(now + v * 1000) : v;
  return g.conn.request({ t: "admin", op: "schedule", schedule: out });
}, schedule);

await mp.close();
await gp.bringToFront();
await gp.goto(BASE + "/");
await gp.waitForSelector("#world-create", { timeout: 5000 });
const schId = await newWorld(gp, "UI schedule", { map: "test", w: 160, h: 100, seed: 12, bots: 2 });
await gp.goto(`${BASE}/#w=${schId}`);
await gp.reload();
await ready(gp);
await spawnSomewhere(gp);
await gp.keyboard.press("i");
const infoOpen = await gp.waitForSelector("#info-panel:not([hidden])", { timeout: 3000 }).then(() => true, () => false);
const empty = infoOpen ? await gp.textContent("#info-schedule") : "";
const settingsText = infoOpen ? await gp.textContent("#info-settings") : "";
check(infoOpen && /Nothing is scheduled/.test(empty) && /Small test map/.test(settingsText) && /160 by 100 plots/.test(settingsText) && /2 bots/.test(settingsText) && !(await gp.isVisible("#world-next")),
  `I opens World info: no schedule yet, and the settings: "${settingsText.replace(/\s+/g, " ").slice(0, 160)}"`);
const t0 = Date.now(), H = 3600000;
await gp.fill("#sched-startAt", localInput(t0 + 2 * H));
await gp.fill("#sched-peaceUntil", localInput(t0 + 3 * H));
await gp.fill("#sched-overtimeAt", localInput(t0 + 26 * H));
await gp.fill("#sched-endAt", localInput(t0 + 50 * H));
await gp.fill("#sched-every", "5");
await gp.click("#sched-save");
const saved = await gp.waitForFunction(() => /Saved/.test(document.querySelector("#sched-note").textContent), null, { timeout: 5000 }).then(() => true, () => false);
await gp.waitForTimeout(400);
const eventsShown = await gp.locator("#info-schedule [data-event]").count();
const chip = await gp.textContent("#world-next");
const schedFeed = await feedText(gp);
await gp.screenshot({ path: `${OUT}/41-world-info.png` });
check(saved && eventsShown === 4 && /^Starts in (1 h 5\d min|2 h 0 min)$/.test(chip) && /set the schedule\. Next: the world starts/.test(schedFeed),
  `the host sets four times in the editor; the panel lists them, the bar counts down ("${chip}") and the feed says so`);
const badSave = await (async () => { await gp.fill("#sched-peaceUntil", localInput(t0 + H)); await gp.click("#sched-save"); await gp.waitForTimeout(500); return gp.textContent("#sched-note"); })();
check(/peace ends must come after the world starts/.test(badSave), `a time out of order is refused: "${badSave}"`);
await gp.click("#info-panel button.ghost:has-text('Undo changes')");
await gp.keyboard.press("Escape");
check(!(await gp.isVisible("#info-panel")), "Esc closes World info");

const sp = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await sp.goto(BASE + "/");
await sp.fill("#login-name", `sched${Math.floor(Math.random() * 1e6)}`);
await sp.fill("#login-pass", "friendly pass");
await sp.fill("#login-invite", INVITE);
await sp.click("#register-go");
await sp.waitForSelector(`[data-world="${schId}"]`, { timeout: 5000 });
const listRow = await sp.locator(".world", { has: sp.locator(`[data-world="${schId}"]`) }).textContent();
check(/starts in (1 h 5\d min|2 h 0 min) \(/.test(listRow), `the world list tells a friend when the world starts: "${listRow.replace(/\s+/g, " ").trim()}"`);
await sp.tap(`[data-world="${schId}"]`);
await ready(sp);
await spawnSomewhere(sp);
await sp.waitForTimeout(500);
const early = await sp.evaluate(async () => { const g = window.__ls.game, w = g.world; await g.formAt(w.nations.get(w.you).capital); await new Promise(r => setTimeout(r, 200)); return document.querySelector("#toasts")?.textContent ?? ""; });
check(/the world starts at .* until then you can only pick where to start/.test(early), `before the start a friend can pick a spot but not form a stack: "${early}"`);
await sp.tap("#world-next");
const phoneInfo = await sp.waitForSelector("#info-panel:not([hidden])", { timeout: 3000 }).then(() => true, () => false);
const phoneFits = await sp.evaluate(() => { const r = document.querySelector("#info-panel").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; });
await sp.screenshot({ path: `${OUT}/42-world-info-phone.png` });
check(phoneInfo && phoneFits && !(await sp.isVisible("#sched-editor")) && (await sp.locator("#info-schedule [data-event]").count()) === 4,
  "on a phone, tapping the countdown opens World info; it fits, lists all four times, and a friend gets no editor");
await sp.tap("#info-panel button.ghost:has-text('Close')");

await setTimes(gp, { startAt: 62, peaceUntil: 3 * H / 1000, overtimeAt: 26 * H / 1000, endAt: 50 * H / 1000 });
const reminded = await sp.waitForFunction(() => /The world starts in (\d+ s|1 min 0 s), at .*Until then players can only pick where to start/.test(document.querySelector("#feed-list")?.textContent ?? ""), null, { timeout: 8000 }).then(() => true, () => false);
check(reminded, `a minute before an event everyone gets a reminder in the feed: "${(await feedText(sp)).match(/The world starts in[^.]*\./)?.[0]}"`);

await setTimes(gp, { startAt: 2, peaceUntil: 5, overtimeAt: 8, endAt: 50 * H / 1000, shrinkEvery: 30 });
await gp.evaluate(() => window.__ls.game.conn.request({ t: "admin", op: "speed", factor: 8 }));
const phases = await sp.waitForFunction(() => { const t = document.querySelector("#feed-list")?.textContent ?? ""; return /The world has started/.test(t) && /Peace is over/.test(t) && /Overtime has begun/.test(t) ? t : null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => "");
const shrinkChip = await sp.waitForFunction(() => { const c = document.querySelector("#world-next"); return c && !c.hidden && /Overtime: shrink in/.test(c.textContent) && c.classList.contains("danger") ? c.textContent : null; }, null, { timeout: 8000 }).then(h => h.jsonValue(), () => "");
const shrank = await sp.waitForFunction(() => /every nation's border shrank/.test(document.querySelector("#feed-list")?.textContent ?? ""), null, { timeout: 10000 }).then(() => true, () => false);
await sp.screenshot({ path: `${OUT}/43-overtime-phone.png` });
const pillLay = await overlaps(sp);
check(!!phases && !!shrinkChip && shrank && !pillLay.hit.length && !pillLay.off.length, `start, peace and overtime reach the feed as they happen, the bar shows "${shrinkChip}" without running into the icons (${JSON.stringify(pillLay.hit)}), and the feed reports each shrink`);

await setTimes(gp, { endAt: 2 });
const endText = await sp.waitForSelector("#notice-text", { timeout: 10000 }).then(() => sp.textContent("#notice-text"), () => "");
await sp.screenshot({ path: `${OUT}/44-time-up-phone.png` });
check(/has won with the most land when time ran out/.test(endText), `at the end time the player with the most land wins: "${endText}"`);
await sp.close();

const roadCount = p => p.evaluate(() => { let n = 0; for (const v of window.__ls.game.world.roads) if (v) n++; return n; });
const freeRun = (p, skip = []) => p.evaluate(skip => {
  const g = window.__ls.game, w = g.world, v = g.view, n = w.nations.get(w.you), cx = n.capital % w.w, cy = (n.capital / w.w) | 0;
  const free = (x, y) => { const i = y * w.w + x; return w.owner[i] === w.you && !w.buildingAt(i) && !w.roads[i]; };
  let best = null;
  for (let y = cy - 5; y <= cy + 5; y++) {
    if (skip.includes(y)) continue;
    let run = [];
    for (let x = cx - 9; x <= cx + 9; x++) {
      if (free(x, y)) { run.push(x); if (!best || run.length > best.xs.length) best = { y, xs: run.slice() }; } else run = [];
    }
  }
  if (!best || best.xs.length < 3) return null;
  const s = (x, y) => { const [sx, sy] = v.plotToScreen(x + 0.5, y + 0.5); return [sx / v.ratio, sy / v.ratio]; };
  return { y: best.y, n: best.xs.length, a: s(best.xs[0], best.y), b: s(best.xs.at(-1), best.y), mid: s(best.xs[1], best.y) };
}, skip);

await gp.bringToFront();
await gp.goto(BASE + "/");
await gp.waitForSelector("#world-create", { timeout: 5000 });
const roadId = await newWorld(gp, "UI roads", { map: "test", w: 160, h: 100, seed: 12, bots: 0, rules: { buildSpeed: 30, spawnRadius: 10 } });
await gp.goto(`${BASE}/#w=${roadId}`);
await gp.reload();
await ready(gp);
await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, { TERRAIN } = await import("/js/shared/terrain.js");
  const flat = i => [0, 1, -1, w.w, -w.w, w.w + 1, w.w - 1, -w.w + 1, -w.w - 1, 2, -2, 2 * w.w, -2 * w.w].every(d => TERRAIN[w.terrain[i + d]]?.build);
  for (let y = 12; y < w.h - 12; y += 2) for (let x = 12; x < w.w - 12; x += 2) if (flat(y * w.w + x) && (await g.conn.request({ t: "spawn", x, y })).ok) return;
});
await gp.evaluate(async () => { const g = window.__ls.game, w = g.world; await new Promise(r => setTimeout(r, 1200)); await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "money", amount: 500 }); g.focus(w.nations.get(w.you).capital, 12); });
await gp.waitForTimeout(600);
await gp.keyboard.press("b");
await gp.click("#build-menu .tabs button:has-text('Roads')");
const roadTab = await gp.textContent("#build-menu .build-list");
await gp.click("[data-road=dirt]");
const r1 = await freeRun(gp);
await gp.mouse.move(...r1.a);
await gp.mouse.down();
await gp.mouse.move(...r1.b, { steps: 10 });
await gp.waitForTimeout(350);
const roadHint = await gp.textContent("#build-hint");
await gp.screenshot({ path: `${OUT}/45-road-drawing.png` });
await gp.mouse.up();
const laidToast = await gp.waitForFunction(() => /Laid \d+ plots/.test(document.querySelector("#toasts")?.textContent ?? "") ? document.querySelector("#toasts").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
const roads1 = await gp.waitForFunction(n => { let c = 0; for (const v of window.__ls.game.world.roads) if (v) c++; return c >= n ? c : null; }, r1.n, { timeout: 4000 }).then(h => h.jsonValue(), () => roadCount(gp));
check(/Dirt road1 gold a plot/.test(roadTab) && /Needs Paved roads research/.test(roadTab) && new RegExp(`${r1.n} plots: \\d+ gold`).test(roadHint) && roads1 === r1.n && /^Laid \d+ plots of dirt road for \d+ gold/.test(laidToast),
  `the Roads tab lists dirt and cobbled roads, a drag shows "${roadHint.match(/\d+ plots: [^.]*/)?.[0]}" and letting go lays ${roads1}: "${laidToast}"`);
await gp.keyboard.press("Escape");
await gp.keyboard.press("Escape");
const stopped = await gp.evaluate(() => !window.__ls.game.roading && document.querySelector("#build-hint").hidden);
await gp.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 30));
await gp.waitForTimeout(300);
const r1Close = await gp.evaluate(y => { const g = window.__ls.game, w = g.world, v = g.view; const i = [...w.roads.keys()].find(k => w.roads[k] && ((k / w.w) | 0) === y); const [sx, sy] = v.plotToScreen((i % w.w) + 0.5, y + 0.5); return [sx / v.ratio, sy / v.ratio]; }, r1.y);
await gp.mouse.move(...r1Close);
await gp.waitForTimeout(300);
const roadTip = await gp.textContent("#plot-tip").catch(() => "");
await gp.screenshot({ path: `${OUT}/46-road-close.png` });
await gp.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 6));
await gp.waitForTimeout(300);
await gp.screenshot({ path: `${OUT}/47-road-mid.png` });
check(stopped && /Dirt road/.test(roadTip), `Esc stops laying roads, and the tip over a road says so: "${roadTip}"`);

await gp.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 20));
await gp.waitForTimeout(400);
await gp.keyboard.press("b");
await gp.click("#build-menu .tabs button:has-text('Roads')");
await gp.click("[data-road=dirt]");
const ends = await gp.evaluate(() => {
  const g = window.__ls.game, w = g.world, v = g.view;
  const hut = [...w.buildings.values()].find(b => b.owner === w.you && b.type === "chieftain_hut");
  const hx = hut.anchor % w.w, hy = (hut.anchor / w.w) | 0;
  const free = i => w.owner[i] === w.you && !w.buildingAt(i);
  const s = i => { const [sx, sy] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5); return [sx / v.ratio, sy / v.ratio]; };
  let plain = null;
  for (let dy = -4; dy <= 5; dy++) for (let k = 1; k <= 6; k++) for (let j = 2; j <= 8; j++) {
    const y = hy + dy, a = y * w.w + hx - k, b = y * w.w + hx + j;
    if (y < 0 || y >= w.h || !free(a) || !free(b) || w.roads[b]) continue;
    const between = [];
    for (let x = hx - k + 1; x < hx + j; x++) between.push(y * w.w + x);
    if (between.some(i => w.buildingAt(i))) return { a, b, sa: s(a), sb: s(b), hut: hut.plots, around: true };
    plain ??= { a, b, sa: s(a), sb: s(b), hut: hut.plots, around: false };
  }
  if (plain) return plain;
  return null;
});
await gp.mouse.click(...ends.sa);
await gp.mouse.move(...ends.sb, { steps: 6 });
await gp.waitForTimeout(300);
const routeHint = await gp.textContent("#build-hint");
await gp.mouse.click(...ends.sb);
await gp.waitForSelector("#road-lay", { timeout: 3000 }).catch(() => {});
await gp.screenshot({ path: `${OUT}/55-road-route.png` });
await gp.click("#road-lay").catch(() => {});
const routePlots = routeHint.match(/(\d+) plots:/)?.[1];
const routeToast = await gp.waitForFunction(n => (document.querySelector("#toasts")?.textContent ?? "").match(/Laid[^.]*\./g)?.find(t => t.startsWith(`Laid ${n} plots`)) ?? null, routePlots, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
const routed = await gp.waitForFunction(e => { const w = window.__ls.game.world; return w.roads[e.a] && w.roads[e.b] ? e.hut.every(i => !w.roads[i]) : null; }, ends, { timeout: 4000 }).then(h => h.jsonValue(), () => false);
check(ends && /\d+ plots: \d+ gold/.test(routeHint) && routed && /Laid \d+ plots of dirt road/.test(routeToast), `click a start and an end: the road finds its way round the hut ("${routeHint.match(/\d+ plots: [^.]*/)?.[0]}"), and Lay road lays it: "${routeToast}"`);
await gp.keyboard.press("Escape");
await gp.keyboard.press("Escape");
const hut2 = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you, cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  await g.conn.request({ t: "research", id: "chieftains", mode: "queue" });
  await g.conn.request({ t: "admin", op: "finish", nation: me });
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "money", amount: 200 });
  const end = Date.now() + 4000;
  while (w.lockOf("chieftain_hut") && Date.now() < end) await new Promise(r => setTimeout(r, 100));
  let why = w.lockOf("chieftain_hut") ?? "no free spot";
  const spots = [];
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const d = Math.abs(dx) + Math.abs(dy); if (d >= 4 && d <= 7) spots.push([d, (cy + dy) * w.w + cx + dx]); }
  spots.sort((a, b) => b[0] - a[0]);
  for (const [, at] of spots) {
    const e = w.placeError("chieftain_hut", at);
    if (e) { why = e; continue; }
    const res = await g.conn.request({ t: "build", type: "chieftain_hut", at });
    if (res.ok) return res.building;
    why = res.error;
  }
  return why;
});
await gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", hut2, { timeout: 30000 }).catch(() => {});
await gp.keyboard.press("b");
await gp.click("#build-menu .tabs button:has-text('Roads')");
await gp.click("#connect-plan");
const planText = await gp.waitForFunction(() => /Linking 1 more takes \d+ plots/.test(document.querySelector("#connect-text")?.textContent ?? "") ? document.querySelector("#connect-text").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => gp.textContent("#connect-text").catch(() => ""));
await gp.screenshot({ path: `${OUT}/56-connect-stores.png` });
await gp.click("#connect-lay").catch(() => {});
const connectToast = await gp.waitForFunction(() => /linking 1 building/.test(document.querySelector("#toasts")?.textContent ?? "") ? document.querySelector("#toasts").textContent.match(/Laid[^.]*\./g).at(-1) : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
await gp.click("#connect-plan");
const planAfter = await gp.waitForFunction(() => /1 already on your roads/.test(document.querySelector("#connect-text")?.textContent ?? "") ? document.querySelector("#connect-text").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
await gp.click("#auto-roads");
const autoOn = await gp.waitForFunction(() => window.__ls.game.world.purse?.autoRoads === "dirt", null, { timeout: 5000 }).then(() => true, () => false);
check(Number.isInteger(hut2) && /Linking 1 more takes \d+ plots for \d+ gold/.test(planText) && /linking 1 building/.test(connectToast) && planAfter && autoOn, `Connect buildings plans ("${planText}"), lays ("${connectToast}"), and the standing order turns on${Number.isInteger(hut2) ? "" : ` [second hut: ${hut2}]`}${/Linking 1 more/.test(planText) ? "" : ` [${await gp.evaluate(id => { const w = window.__ls.game.world, b = w.buildings.get(id); return JSON.stringify({ state: b?.state, anchor: b?.anchor, owner: w.owner[b?.anchor], you: w.you, type: b?.type, money: w.purse?.money }); }, hut2)} ${JSON.stringify(await gp.evaluate(() => window.__ls.game.conn.request({ t: "connect", kind: "dirt", dry: true })))}]`}`);
await gp.keyboard.press("Escape");

const roadsBefore = await roadCount(gp);
const rp = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await login(rp, "rw_scorch", "correct horse");
await rp.goto(`${BASE}/#w=${roadId}`);
await rp.reload();
await ready(rp);
await rp.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 12));
await rp.waitForTimeout(500);
await rp.tap("#open-build");
await rp.tap("#build-menu .tabs button:has-text('Roads')");
await rp.tap("[data-road=dirt]");
const r2 = await freeRun(rp, [r1.y]);
const phoneLaid = await rp.evaluate(async r => {
  const c = document.querySelector("#map"), keep = c.setPointerCapture;
  c.setPointerCapture = () => {};
  const at = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  at("pointerdown", r.a[0], r.a[1]);
  for (let t = 1; t <= 10; t++) at("pointermove", r.a[0] + (r.b[0] - r.a[0]) * t / 10, r.a[1]);
  at("pointerup", r.b[0], r.b[1]);
  c.setPointerCapture = keep;
  for (let k = 0; k < 40 && !/Laid \d+ plots/.test(document.querySelector("#toasts")?.textContent ?? ""); k++) await new Promise(res => setTimeout(res, 100));
  return document.querySelector("#toasts")?.textContent ?? "";
}, r2);
await rp.waitForTimeout(500);
const roads2 = await rp.waitForFunction(n => { let c = 0; for (const v of window.__ls.game.world.roads) if (v) c++; return c >= n ? c : null; }, roadsBefore + (r2?.n ?? 0), { timeout: 4000 }).then(h => h.jsonValue(), () => roadCount(rp));
await rp.screenshot({ path: `${OUT}/48-road-phone.png` });
check(r2 && roads2 === roadsBefore + r2.n && /Laid/.test(phoneLaid), `on a phone one finger lays a road of ${r2?.n} plots (${roads2} in all): "${phoneLaid.match(/Laid[^.]*\./)?.[0]}"`);
await rp.close();

await gp.bringToFront();
await gp.goto(BASE + "/");
await gp.waitForSelector("#world-create", { timeout: 5000 });
const boatId = await newWorld(gp, "UI boats", { map: "test", w: 160, h: 100, seed: 12, bots: 0, rules: { spawnRadius: 8 } });
await gp.goto(`${BASE}/#w=${boatId}`);
await gp.reload();
await ready(gp);
await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, { isLand } = await import("/js/shared/terrain.js");
  for (let y = 10; y < w.h - 10; y += 3) for (let x = 10; x < w.w - 10; x += 3) {
    const i = y * w.w + x;
    if (isLand(w.terrain[i]) && [i - 1, i + 1, i - w.w, i + w.w].some(j => w.terrain[j] <= 2) && (await g.conn.request({ t: "spawn", x, y })).ok) return;
  }
});
const overseas = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world;
  await new Promise(r => setTimeout(r, 1200));
  const { isLand } = await import("/js/shared/terrain.js"), n = w.nations.get(w.you);
  const seen = new Uint8Array(w.w * w.h), todo = [n.capital];
  seen[n.capital] = 1;
  while (todo.length) {
    const i = todo.pop(), x = i % w.w;
    for (const j of [i - w.w, i + w.w, x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1]) if (j >= 0 && j < seen.length && !seen[j] && isLand(w.terrain[j])) { seen[j] = 1; todo.push(j); }
  }
  let best = -1, bd = Infinity;
  const cx = n.capital % w.w, cy = (n.capital / w.w) | 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !isLand(w.terrain[i])) continue;
    const d = Math.hypot((i % w.w) - cx, ((i / w.w) | 0) - cy);
    if (d < bd && d > 6) { bd = d; best = i; }
  }
  await g.conn.request({ t: "admin", op: "speed", factor: 4 });
  await g.attackAt(best);
  return best;
});
const boatToast = await gp.waitForFunction(() => /by boat/.test(document.querySelector("#toasts")?.textContent ?? "") ? document.querySelector("#toasts").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), async () => `none: target ${overseas}, toasts "${await gp.textContent("#toasts")}"`);
const boatAt = await gp.waitForFunction(() => { const w = window.__ls.game.world; return [...w.machines.values()].find(u => u.type === "transport_boat")?.at ?? w.events.find(e => e.type === "boat_launched" && e.nation === w.you)?.at ?? null; }, null, { timeout: 20000 }).then(h => h.jsonValue(), () => null);
if (boatAt !== null) { await gp.evaluate(at => window.__ls.game.focus(at, 20), boatAt); await gp.waitForTimeout(250); await gp.screenshot({ path: `${OUT}/49-boat.png` }); }
const landedLine = await gp.waitForFunction(() => { const t = document.querySelector("#feed-list")?.textContent ?? ""; return /troops landed/.test(t) ? t.match(/\d+ troops landed[^.]*\.[^.]*\./)?.[0] ?? "landed" : null; }, null, { timeout: 40000 }).then(h => h.jsonValue(), () => "");
const boatGone = await gp.waitForFunction(() => ![...window.__ls.game.world.machines.values()].some(u => u.type === "transport_boat"), null, { timeout: 5000 }).then(() => true, () => false);
const heldThere = await gp.waitForFunction(t => window.__ls.game.world.owner[t] === window.__ls.game.world.you, overseas, { timeout: 15000 }).then(() => true, () => false);
check(/by boat to take unclaimed land, losing about \d+% as they land/.test(boatToast) && boatAt !== null && /troops landed/.test(landedLine) && boatGone && heldThere,
  `Attack on land across water sends a free boat from the start ("${boatToast}"); it lands ("${landedLine}"), takes the land and the boat is gone`);
const moveBoat = await gp.evaluate(async t => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, { isLand } = await import("/js/shared/terrain.js");
  const st = await g.conn.request({ t: "stack", share: 0.3, at: cap });
  if (!st.ok) return null;
  const home = new Uint8Array(w.w * w.h), todo = [cap];
  home[cap] = 1;
  while (todo.length) {
    const i = todo.pop(), x = i % w.w;
    for (const j of [i - w.w, i + w.w, x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1]) if (j >= 0 && j < home.length && !home[j] && isLand(w.terrain[j])) { home[j] = 1; todo.push(j); }
  }
  const cx = cap % w.w, cy = (cap / w.w) | 0, clear = i => !w.buildingAt(i) && !w.myStacks().some(s => Math.max(Math.abs((s.pos % w.w) - (i % w.w)), Math.abs(((s.pos / w.w) | 0) - ((i / w.w) | 0))) <= 2);
  let to = null, bd = Infinity;
  for (let i = 0; i < home.length; i++) {
    if (home[i] || !isLand(w.terrain[i]) || w.terrain[i] < 7 || w.terrain[i] > 26) continue;
    const d = Math.hypot((i % w.w) - cx, ((i / w.w) | 0) - cy);
    if (d < bd && d > 6 && clear(i)) { bd = d; to = i; }
  }
  if (to === null) return null;
  document.activeElement?.blur?.();
  g.select(st.stack);
  g.focus(((((cap / w.w) | 0) + ((to / w.w) | 0)) >> 1) * w.w + (((cap % w.w) + (to % w.w)) >> 1), 8);
  return { stack: st.stack, to };
}, overseas);
await gp.waitForSelector("#stack-move", { timeout: 5000 }).catch(() => {});
await gp.keyboard.press("m");
await gp.waitForTimeout(300);
const islandAt = await toScreen(gp, moveBoat?.to ?? overseas);
await gp.mouse.click(islandAt.x, islandAt.y);
const boatHint = await gp.waitForSelector("#move-go", { timeout: 5000 }).then(() => gp.textContent("#stack-hint"), () => "");
await gp.screenshot({ path: `${OUT}/49b-move-boat.png` });
await gp.click("#move-go").catch(() => {});
const sailed = await gp.waitForFunction(() => [...window.__ls.game.world.machines.values()].some(u => u.type === "transport_boat"), null, { timeout: 30000 }).then(() => true, () => false);
check(/cross \d+ plots of water in a free boat, losing about \d+%/.test(boatHint) && sailed, `M and a click on another island preview the crossing ("${boatHint.split(".")[0]}.") and Go sends a boat${sailed ? "" : " (none set off)"}`);
await gp.waitForTimeout(4000);
const ports = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, you = w.you, n = w.nations.get(you), { isLand } = await import("/js/shared/terrain.js");
  for (const [what, amount] of [["money", 300]]) await g.conn.request({ t: "admin", op: "give", nation: you, what, amount });
  const home = new Uint8Array(w.w * w.h), todo = [n.capital];
  home[n.capital] = 1;
  while (todo.length) {
    const i = todo.pop(), x = i % w.w;
    for (const j of [i - w.w, i + w.w, x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1]) if (j >= 0 && j < home.length && !home[j] && isLand(w.terrain[j])) { home[j] = 1; todo.push(j); }
  }
  const coast = [];
  for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === you && isLand(w.terrain[i]) && !w.buildingAt(i) && [i - 1, i + 1, i - w.w, i + w.w].some(j => w.terrain[j] <= 2)) coast.push(i);
  const d = (i, j) => Math.hypot((i % w.w) - (j % w.w), ((i / w.w) | 0) - ((j / w.w) | 0));
  const build = async list => { for (const i of list.slice(0, 40)) { const r = await g.conn.request({ t: "build", type: "jetty", at: i }); if (r.ok) return { id: r.building, at: i }; } return null; };
  const homeCoast = coast.filter(i => home[i]), farCoast = coast.filter(i => !home[i]), pairs = [];
  for (const i of homeCoast) for (const j of farCoast) pairs.push([d(i, j), i]);
  pairs.sort((p, q) => q[0] - p[0]);
  const built = await build([...new Set(pairs.map(p => p[1]))].concat(homeCoast));
  const far = built ? farCoast.filter(j => d(j, built.at) >= 14).sort((p, q) => d(q, built.at) - d(p, built.at)) : [];
  return { mine: built?.id ?? null, far, capital: n.capital, apart: built && far.length ? Math.round(d(far[0], built.at)) : 0 };
});
const homeJetty = await gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", ports.mine, { timeout: 30000 }).then(() => true, () => false);
const farJetty = await gp.evaluate(async far => {
  const g = window.__ls.game;
  for (const i of far.slice(0, 40)) { const r = await g.conn.request({ t: "build", type: "jetty", at: i }); if (r.ok) return r.building; }
  return null;
}, ports.far);
const farBuilt = farJetty !== null && await gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active", farJetty, { timeout: 60000 }).then(() => true, () => false);
const trader = await gp.waitForFunction(() => [...window.__ls.game.world.machines.values()].find(u => u.type === "merchant_ship" && u.owner === window.__ls.game.world.you)?.id ?? null, null, { timeout: 30000 }).then(h => h.jsonValue(), () => null);
let shipCard = "", shipOrders = -1;
if (trader !== null) {
  await gp.evaluate(id => { const g = window.__ls.game, u = g.world.machines.get(id); g.focus(u.at, 20); g.selectMachine(id); }, trader);
  shipCard = await gp.waitForFunction(() => { const t = document.querySelector("#machine-cargo")?.textContent ?? ""; return /with trade/.test(t) ? `${document.querySelector("#machine-title").textContent}: ${t}` : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  shipOrders = await gp.locator("#machine-move:visible").count();
  await gp.waitForTimeout(300);
  await gp.screenshot({ path: `${OUT}/59-trade-ship.png` });
}
const tradeEarned = await gp.waitForFunction(() => (window.__ls.game.world.purse?.trade?.total ?? 0) > 0 ? window.__ls.game.world.purse.trade.total : null, null, { timeout: 60000 }).then(h => h.jsonValue(), () => 0);
await gp.keyboard.press("Escape");
await gp.keyboard.press("l");
const tradeLine = await gp.waitForFunction(() => { const t = document.querySelector("#logistics-summary")?.textContent ?? ""; return /gold a minute from trade lately, [\d,.]+ in all/.test(t) && !/^0 gold a minute/.test(t) ? t : null; }, null, { timeout: 8000 }).then(h => h.jsonValue(), () => gp.textContent("#logistics-summary").catch(() => ""));
await gp.screenshot({ path: `${OUT}/60-trade-panel.png` });
await gp.keyboard.press("l");
check(homeJetty && farBuilt && trader !== null && /^Your trade ship: Sailing to another port with trade/.test(shipCard) && shipOrders === 0 && tradeEarned > 0 && tradeLine,
  `two jetties ${ports.apart} plots apart across the water send a trade ship ("${shipCard}"), with no orders on the ship; it earns ${tradeEarned} gold, and the Trade panel says "${tradeLine.split(".")[0]}."`);

await gp.bringToFront();
const indId = await newWorld(gp, "UI industry", { map: "test", w: 160, h: 100, seed: 12, bots: 0, rules: { buildSpeed: 60 } });
await gp.goto(`${BASE}/#w=${indId}`);
await gp.reload();
await ready(gp);
const indSetup = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, { isLand } = await import("/js/shared/terrain.js");
  const comp = new Int32Array(w.w * w.h).fill(-1), sizes = [];
  for (let i = 0; i < comp.length; i++) {
    if (comp[i] >= 0 || !isLand(w.terrain[i])) continue;
    const id = sizes.length, todo = [i];
    comp[i] = id;
    let n = 0;
    while (todo.length) {
      const c = todo.pop(), x = c % w.w;
      n++;
      for (const j of [c - w.w, c + w.w, x > 0 ? c - 1 : -1, x < w.w - 1 ? c + 1 : -1]) if (j >= 0 && j < comp.length && comp[j] < 0 && isLand(w.terrain[j])) { comp[j] = id; todo.push(j); }
    }
    sizes.push(n);
  }
  const big = sizes.indexOf(Math.max(...sizes)), inside = i => { const x = i % w.w, y = (i / w.w) | 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (comp[(y + dy) * w.w + x + dx] !== big) return false; return true; };
  let spawned = false;
  for (let y = 8; y < w.h - 8 && !spawned; y += 3) for (let x = 8; x < w.w - 8 && !spawned; x += 3) if (inside(y * w.w + x) && w.terrain[y * w.w + x] >= 12 && w.terrain[y * w.w + x] <= 14) spawned = (await g.conn.request({ t: "spawn", x, y })).ok;
  await new Promise(r => setTimeout(r, 1000));
  await g.conn.request({ t: "admin", op: "speed", factor: 8 });
  await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "troops", amount: 6000 });
  const st = await g.conn.request({ t: "stack", share: 0.9 });
  await g.conn.request({ t: "advance", stack: st.stack, only: "free" });
  for (const id of ["railways", "field_guns"]) await g.conn.request({ t: "research", id, mode: "queue" });
  const fin = await g.conn.request({ t: "admin", op: "finish", nation: w.you });
  for (const [what, amount] of [["money", 100000]]) await g.conn.request({ t: "admin", op: "give", nation: w.you, what, amount });
  return { spawned, done: fin.done?.length ?? 0 };
});
await gp.waitForFunction(() => { const w = window.__ls.game.world; let n = 0; for (const o of w.owner) if (o === w.you) n++; return n >= 500 && w.purse?.era === "I"; }, null, { timeout: 40000 }).catch(() => {});
await gp.evaluate(() => window.__ls.game.conn.request({ t: "admin", op: "speed", factor: 4 }));
await gp.keyboard.press("u");
const indTree = await gp.waitForFunction(() => { const t = document.querySelector("#research-panel")?.textContent ?? ""; return /Age of Industry/.test(t) && /Railways/.test(t) ? t : null; }, null, { timeout: 5000 }).then(() => true, () => false);
await gp.evaluate(() => document.querySelector("#research-panel [data-node=age_industry]")?.scrollIntoView({ block: "center", inline: "center" }));
await gp.screenshot({ path: `${OUT}/60-research-industry.png` });
await gp.keyboard.press("u");
check(indSetup.spawned && indSetup.done > 30 && indTree, `the research tree has its Industrial band, and a nation researches into it (${indSetup.done} nodes finished)`);
const works = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital;
  const spot = (type, near, lo, hi) => {
    for (let r = lo; r <= hi; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (near % w.w) + dx, y = ((near / w.w) | 0) + dy;
      if (x < 2 || y < 2 || x >= w.w - 5 || y >= w.h - 5) continue;
      if (!w.placeError(type, y * w.w + x)) return y * w.w + x;
    }
    return null;
  };
  const build = async (type, at) => { if (at === null) return null; const r = await g.conn.request({ t: "build", type, at }); if (!r.ok) return null; for (let k = 0; k < 50 && !w.buildings.get(r.building); k++) await new Promise(res => setTimeout(res, 100)); return r.building; };
  const plant = await build("coal_plant", spot("coal_plant", cap, 3, 6));
  const mill = plant && await build("vehicle_factory", spot("vehicle_factory", w.buildings.get(plant).anchor, 3, 5));
  return { mill, plant };
});
await gp.waitForFunction(ids => ids.every(id => window.__ls.game.world.buildings.get(id)?.state === "active"), [works.mill, works.plant], { timeout: 20000 }).catch(() => {});
await gp.evaluate(id => { const g = window.__ls.game; g.selectBuilding(id); g.focus(g.world.buildings.get(id).anchor, 16); }, works.mill);
const millCard = await gp.waitForFunction(() => { const t = document.querySelector("#building-work")?.textContent ?? ""; return /Powered: it uses 6 of the 20/.test(t) ? t : null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), async () => `none: "${await gp.textContent("#building-work").catch(() => "")}"`);
const overlayOn = await gp.waitForFunction(() => !!window.__ls.game.view.powerCover, null, { timeout: 4000 }).then(() => true, () => false);
await gp.screenshot({ path: `${OUT}/61-powered-factory.png` });
check(works.mill && works.plant && /Powered: it uses 6 of the 20/.test(millCard) && overlayOn, `a vehicle factory beside a coal plant is powered, and its card says so with the powered land shown: "${millCard.match(/Powered[^.]*\./)?.[0] ?? millCard}"`);
await gp.keyboard.press("Escape");
const poleRun = await gp.evaluate(async plantId => {
  const g = window.__ls.game, w = g.world, v = g.view, p = w.buildings.get(plantId), { TERRAIN } = await import("/js/shared/terrain.js");
  const free = i => w.owner[i] === w.you && !w.buildingAt(i) && !w.roads[i] && TERRAIN[w.terrain[i]].build;
  const px = p.anchor % w.w, py = (p.anchor / w.w) | 0;
  for (let r = 3; r <= 5; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
    const ax = px + ox, ay = py + oy, dx = Math.abs(ox) >= Math.abs(oy) ? Math.sign(ox) : 0, dy = dx ? 0 : Math.sign(oy), run = [];
    for (let k = 0; k <= 8; k++) run.push((ay + dy * k) * w.w + ax + dx * k);
    if (run.every(i => i >= 0 && i < w.owner.length && free(i))) { g.focus(run[4], 18); return { a: run[0], b: run[8] }; }
  }
  return null;
}, works.plant);
await gp.waitForTimeout(300);
const toScr = async i => gp.evaluate(i => { const g = window.__ls.game, w = g.world, v = g.view; const [sx, sy] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5); return [sx / v.ratio, sy / v.ratio]; }, i);
await gp.keyboard.press("b");
await gp.click("#build-menu .tabs button:has-text('Power')");
const powerTab = await gp.textContent("#build-menu .build-list");
await gp.click("[data-type=power_pole]");
let poleHint = "", poleToast = "", polesUp = 0;
if (poleRun) {
  await gp.mouse.click(...(await toScr(poleRun.a)));
  await gp.mouse.move(...(await toScr(poleRun.b)), { steps: 5 });
  await gp.mouse.click(...(await toScr(poleRun.b)));
  await gp.waitForSelector("#road-lay", { timeout: 3000 }).catch(() => {});
  poleHint = await gp.textContent("#build-hint");
  await gp.screenshot({ path: `${OUT}/62-pole-line.png` });
  await gp.click("#road-lay").catch(() => {});
  poleToast = await gp.waitForFunction(() => (document.querySelector("#toasts")?.textContent ?? "").match(/Placed \d+ power poles?[^.]*\./)?.[0] ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), async () => `toasts: ${await gp.textContent("#toasts").catch(() => "")}`);
  polesUp = await gp.waitForFunction(() => { const n = [...window.__ls.game.world.buildings.values()].filter(b => b.type === "power_pole" && b.state === "active").length; return n >= 3 ? n : null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => 0);
}
await gp.waitForTimeout(2500);
await gp.screenshot({ path: `${OUT}/63-power-grid.png` });
check(/Coal plant/.test(powerTab) && /Power pole/.test(powerTab) && /\d+ poles: \d+ gold/.test(poleHint) && /^Placed \d+ power poles/.test(poleToast) && polesUp >= 3,
  `the Power tab lists the coal plant and poles; two clicks lay a line of poles ("${poleHint.match(/\d+ poles: [^.]*/)?.[0]}"): "${poleToast}", ${polesUp} built`);
await gp.keyboard.press("Escape");
await gp.click("#build-menu .tabs button:has-text('Roads')");
const railRow = await gp.evaluate(() => { const b = document.querySelector("[data-road=rail]"); return b ? { text: b.textContent, disabled: b.disabled } : null; });
await gp.click("[data-road=rail]").catch(() => {});
const railEnds = await gp.evaluate(() => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
  const free = i => w.owner[i] === w.you && !w.buildingAt(i) && !w.roads[i] && w.terrain[i] > 2;
  for (let dy = 3; dy <= 12; dy++) for (const sy of [1, -1]) for (let sx = -4; sx <= 4; sx++) {
    const y = cy + sy * dy, run = [];
    for (let x = cx + sx - 4; x <= cx + sx + 4; x++) run.push(y * w.w + x);
    if (y > 1 && y < w.h - 2 && run.every(i => i >= 0 && i < w.owner.length && free(i))) { g.focus(run[4], 18); return { a: run[0], b: run[8] }; }
  }
  return null;
});
await gp.waitForTimeout(300);
let railToast = "";
if (railEnds) {
  await gp.mouse.click(...(await toScr(railEnds.a)));
  await gp.mouse.click(...(await toScr(railEnds.b)));
  await gp.waitForSelector("#road-lay", { timeout: 3000 }).catch(() => {});
  await gp.click("#road-lay").catch(() => {});
  railToast = await gp.waitForFunction(() => (document.querySelector("#toasts")?.textContent ?? "").match(/Laid \d+ plots of railway[^.]*\./)?.[0] ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  await gp.evaluate(e => window.__ls.game.focus(e.a + 4, 40), railEnds);
  await gp.waitForTimeout(500);
  await gp.screenshot({ path: `${OUT}/64-rail.png` });
}
await gp.keyboard.press("Escape");
await gp.keyboard.press("Escape");
const railN = Number(railToast.match(/^Laid (\d+) plots of railway/)?.[1] ?? 0);
const railPrice = Number(railToast.match(/for ([\d,]+) gold/)?.[1].replace(/,/g, "") ?? 0);
check(railRow && !railRow.disabled && /Railway12 gold a plot/.test(railRow.text) && railN >= 9 && railPrice >= 12 * railN, `once Railways is known, the Roads tab lays rail: "${railToast}"`);
{
  const planes = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital;
    await g.conn.request({ t: "research", id: "flight", mode: "queue" });
    await g.conn.request({ t: "admin", op: "finish", nation: w.you });
    const known = Date.now() + 4000;
    while (w.lockOf("airfield") && Date.now() < known) await new Promise(r => setTimeout(r, 100));
    let field = null;
    for (let r = 3; r < 16 && !field; r++) for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const at = cap + dy * w.w + dx;
      if (w.placeError("airfield", at)) continue;
      const res = await g.conn.request({ t: "build", type: "airfield", at });
      if (res.ok) field = res.building;
    }
    const up = Date.now() + 20000;
    while (field && w.buildings.get(field)?.state !== "active" && Date.now() < up) await new Promise(r => setTimeout(r, 100));
    const gift = await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit: "biplane", amount: 1 });
    const id = gift.machines?.[0], seen = Date.now() + 4000;
    while (id && !w.machines.has(id) && Date.now() < seen) await new Promise(r => setTimeout(r, 100));
    return { field, id, menu: w.defs.table.airfield?.name };
  });
  await gp.evaluate(id => { const g = window.__ls.game, u = g.world.machines.get(id); g.selectMachine(id); g.focus(u.at, 20); }, planes.id);
  const card = await gp.waitForFunction(() => { const t = document.querySelector("#machine-info")?.textContent ?? ""; return /at its airfield/.test(t) && document.querySelector("#plane-patrol") ? `${document.querySelector("#machine-title").textContent}${t}` : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
  await gp.click("#plane-patrol").catch(() => {});
  const spot = await gp.evaluate(id => { const w = window.__ls.game.world, u = w.machines.get(id); return u.at + 12; }, planes.id);
  const spotAt = await toScreen(gp, spot);
  await gp.mouse.click(spotAt.x, spotAt.y);
  const flying = await gp.waitForFunction(id => { const u = window.__ls.game.world.machines.get(id); return u?.air && !u.air.landed && u.air.mission === "patrol" ? u.air.fuel : null; }, planes.id, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
  await gp.waitForTimeout(800);
  await gp.screenshot({ path: `${OUT}/72-plane.png` });
  check(planes.field && planes.id && /^Your biplane fighter/.test(card) && flying !== null, `after Flight, an airfield bases a fighter ("${card}"), and Patrol and a click send it up (${flying} s of fuel)`);
  await gp.keyboard.press("Escape");
}
{
  const m = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world;
    for (const id of ["rocketry", "special_operations", "anti_tank"]) await g.conn.request({ t: "research", id, mode: "queue" });
    await g.conn.request({ t: "admin", op: "finish", nation: w.you });
    const known = Date.now() + 5000;
    while ((w.purse?.era !== "Mo" || w.lockOf("apc", "units")) && Date.now() < known) await new Promise(r => setTimeout(r, 100));
    const gift = await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit: "apc", amount: 1 });
    const id = gift.machines?.[0], seen = Date.now() + 4000;
    while (id && !w.machines.has(id) && Date.now() < seen) await new Promise(r => setTimeout(r, 100));
    await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "troops", amount: 2000 });
    const at = w.machines.get(id)?.at, st = await g.conn.request({ t: "stack", share: 0.1, at });
    const shown = Date.now() + 3000;
    while (st.ok && !w.stacks.has(st.stack) && Date.now() < shown) await new Promise(r => setTimeout(r, 100));
    return { era: w.purse?.era, id, at, stack: st.stack ?? null, why: st.error ?? null, troops: st.ok ? Math.round(w.stacks.get(st.stack)?.troops ?? 0) : 0 };
  });
  await gp.keyboard.press("k");
  const modernArmy = await gp.waitForFunction(() => { const t = document.querySelector("#army-list")?.textContent ?? ""; return ["Soldiers", "Special forces", "Anti-tank teams"].every(n => t.includes(n)) ? true : null; }, null, { timeout: 5000 }).then(() => true, () => false);
  await gp.keyboard.press("Escape");
  check(m.era === "Mo" && modernArmy, `in the Modern Age the Army panel offers soldiers, special forces and anti-tank teams (era ${m.era})`);
  await gp.evaluate(({ stack, at }) => { const g = window.__ls.game; g.select(stack); g.focus(at, 24); }, m);
  await gp.waitForTimeout(400);
  const apcScreen = await toScreen(gp, m.at);
  await gp.mouse.click(apcScreen.x, apcScreen.y, { button: "right" });
  const boardItem = await gp.waitForFunction(() => [...document.querySelectorAll("#ring .ring-item")].find(b => b.dataset.ring === "board")?.textContent ?? null, null, { timeout: 3000 }).then(h => h.jsonValue(), () => null);
  if (boardItem) await gp.click("#ring .ring-item[data-ring=board]");
  const aboard = await gp.waitForFunction(id => window.__ls.game.world.machines.get(id)?.cargo || null, m.id, { timeout: 8000 }).then(h => h.jsonValue(), () => 0);
  await gp.evaluate(({ id, at }) => { const g = window.__ls.game; g.select(null); g.selectMachine(id); g.focus(at, 24); }, m);
  const unloadButton = await gp.waitForSelector("#machine-unload:not([disabled])", { timeout: 3000 }).then(() => true, () => false);
  const dest = await gp.evaluate(at => { const w = window.__ls.game.world; for (let r = 5; r < 10; r++) for (const d of [r, -r, r * w.w, -r * w.w]) if (w.owner[at + d] === w.you) return at + d; return null; }, m.at);
  const destAt = await toScreen(gp, dest);
  await gp.mouse.click(destAt.x, destAt.y, { button: "right" });
  const ringLabels = await ringItems(gp);
  await gp.click("#ring .ring-item[data-ring=move]").catch(() => {});
  const setDown = await gp.waitForFunction(t => [...window.__ls.game.world.stacks.values()].find(s => s.owner === window.__ls.game.world.you && s.pos === t)?.troops ?? null, dest, { timeout: 20000 }).then(h => h.jsonValue(), () => null);
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: `${OUT}/73-apc.png` });
  check(boardItem && aboard >= Math.min(m.troops, 300) - 1 && unloadButton && ringLabels.includes("land") && Math.abs((setDown ?? 0) - aboard) < 1,
    `a stack right-clicks the APC and gets in ("${boardItem}", ${aboard} aboard${m.stack === null ? `; the stack was not formed: ${m.why}` : ""}); the APC's card has Unload, its ring offers ${ringLabels.join(", ")}, and Move here sets all ${Math.round(setDown ?? 0)} down where it stops`);
  await gp.keyboard.press("Escape");
}
{
  const c = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world, wait = async (f, ms = 5000) => { const end = Date.now() + ms; let v; while (!(v = f()) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
    for (const id of ["helicopters", "jet_engines", "guided_missiles"]) await g.conn.request({ t: "research", id, mode: "queue" });
    await g.conn.request({ t: "admin", op: "finish", nation: w.you });
    await wait(() => !w.lockOf("air_base") && !w.lockOf("sam_site") && !w.lockOf("transport_heli", "units"));
    const lift = await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit: "transport_heli", amount: 1 });
    const strike = await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit: "attack_heli", amount: 1 });
    const id = lift.machines?.[0], hid = strike.machines?.[0];
    await wait(() => w.machines.get(id)?.air && w.machines.get(hid)?.air);
    const at = w.machines.get(id)?.at, st = await g.conn.request({ t: "stack", share: 0.05, at });
    await wait(() => st.ok && w.stacks.has(st.stack), 3000);
    const cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0;
    const spot = (type, r0, r1) => { for (let r = r0; r <= r1; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const i = (cy + dy) * w.w + cx + dx; if (cx + dx > 1 && cy + dy > 1 && !w.placeError(type, i)) return i; } return null; };
    const samAt = spot("sam_site", 3, 14), sam = samAt !== null ? await g.conn.request({ t: "build", type: "sam_site", at: samAt }) : { error: "no room" };
    const baseAt = spot("air_base", 4, 24), base = baseAt !== null ? await g.conn.request({ t: "build", type: "air_base", at: baseAt }) : { error: "no room" };
    return { id, hid, at, stack: st.stack ?? null, why: st.error ?? null, troops: Math.round(w.stacks.get(st.stack)?.troops ?? 0), sam: sam.building ?? null, samWhy: sam.error ?? null, base: base.building ?? null, baseWhy: base.error ?? null };
  });
  await gp.evaluate(({ stack, at }) => { const g = window.__ls.game; g.selectMachine(null); g.select(stack); g.focus(at, 24); }, c);
  await gp.waitForTimeout(400);
  const heliScreen = await toScreen(gp, c.at);
  await gp.mouse.click(heliScreen.x, heliScreen.y, { button: "right" });
  const boardItem = await gp.waitForFunction(() => [...document.querySelectorAll("#ring .ring-item")].find(b => b.dataset.ring === "board")?.textContent ?? null, null, { timeout: 3000 }).then(h => h.jsonValue(), () => null);
  if (boardItem) await gp.click("#ring .ring-item[data-ring=board]");
  const aboard = await gp.waitForFunction(id => window.__ls.game.world.machines.get(id)?.cargo || null, c.id, { timeout: 10000 }).then(h => h.jsonValue(), () => 0);
  await gp.evaluate(({ id, at }) => { const g = window.__ls.game; g.select(null); g.selectMachine(id); g.focus(at, 20); }, c);
  const dropButton = await gp.waitForSelector("#plane-drop:not([disabled])", { timeout: 3000 }).then(h => h.textContent(), () => null);
  if (dropButton) await gp.click("#plane-drop");
  const dest = await gp.evaluate(at => { const w = window.__ls.game.world; for (let r = 8; r < 14; r++) for (const d of [r, -r, r * w.w, -r * w.w]) if (w.owner[at + d] === w.you) return at + d; return null; }, c.at);
  const destAt = await toScreen(gp, dest);
  await gp.mouse.click(destAt.x, destAt.y);
  await gp.waitForTimeout(1500);
  await gp.screenshot({ path: `${OUT}/74-heli.png` });
  const setDown = await gp.waitForFunction(t => [...window.__ls.game.world.stacks.values()].find(s => s.owner === window.__ls.game.world.you && s.pos === t)?.troops ?? null, dest, { timeout: 30000 }).then(h => h.jsonValue(), () => null);
  const feedSays = await gp.evaluate(() => document.querySelector("#feed")?.textContent.includes("The transport helicopter set") ?? false);
  check(boardItem?.startsWith("Board the transport helicopter") && aboard > 0 && dropButton === "Land troops" && Math.abs((setDown ?? 0) - aboard) < 1 && feedSays,
    `after Helicopters a company right-clicks a transport helicopter and gets in ("${boardItem}", ${aboard} aboard); Land troops and a click fly it there and set ${Math.round(setDown ?? 0)} down, and the feed says so${c.stack === null ? `; no company: ${c.why}` : ""}`);
  await gp.evaluate(hid => { const g = window.__ls.game; g.selectMachine(hid); }, c.hid);
  const strikeButton = await gp.waitForSelector("#plane-patrol", { timeout: 3000 }).then(h => h.textContent(), () => null);
  check(strikeButton === "Strike", `an attack helicopter's card offers ${strikeButton} instead of Patrol`);
  await gp.evaluate(() => window.__ls.game.selectMachine(null));
  const samUp = c.sam && await gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active" || null, c.sam, { timeout: 20000 }).then(() => true, () => false);
  if (samUp) await gp.evaluate(id => { const g = window.__ls.game; g.selectBuilding(id); g.focus(g.world.buildings.get(id).anchor + 1 + g.world.w, 10); }, c.sam);
  const samText = samUp ? await gp.waitForFunction(() => { const t = document.querySelector("#building-work")?.textContent ?? ""; return /of 4 missiles/.test(t) ? t : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null) : null;
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: `${OUT}/75-sam.png` });
  check(samUp && /^4 of 4 missiles/.test(samText ?? ""), `after Guided missiles a SAM site's card reads "${samText ?? c.samWhy}", with its 8-plot reach drawn`);
  await gp.evaluate(() => window.__ls.game.selectBuilding(null));
  const baseUp = c.base && await gp.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "active" || null, c.base, { timeout: 30000 }).then(() => true, () => false);
  if (baseUp) await gp.evaluate(id => { const g = window.__ls.game; g.focus(g.world.buildings.get(id).anchor + 2 + g.world.w, 40); }, c.base);
  await gp.waitForTimeout(600);
  await gp.screenshot({ path: `${OUT}/76-airbase.png` });
  const parts = baseUp ? await gp.evaluate(id => window.__ls.game.world.buildings.get(id)?.def.parts?.length ?? 0, c.base) : 0;
  check(baseUp && parts === 7, `after Jet engines an air base stands, drawn from its terminal, hangar and runway (${parts} parts)${c.baseWhy ? `: ${c.baseWhy}` : ""}`);
}
{
  const n = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world, wait = async (f, ms = 6000) => { const end = Date.now() + ms; let v; while (!(v = f()) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
    for (const id of ["modern_navy", "submarines", "carriers"]) await g.conn.request({ t: "research", id, mode: "queue" });
    await g.conn.request({ t: "admin", op: "finish", nation: w.you });
    await wait(() => !w.lockOf("aircraft_carrier", "units"));
    const give = async unit => (await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "machine", unit, amount: 1 })).machines?.[0] ?? null;
    const car = await give("aircraft_carrier"), sub = await give("submarine"), jet = await give("jet_fighter");
    await wait(() => w.machines.get(car) && w.machines.get(sub) && w.machines.get(jet)?.air);
    return { car, sub, jet, carAt: w.machines.get(car)?.at ?? null, jetAt: w.machines.get(jet)?.at ?? null };
  });
  await gp.evaluate(({ jet, carAt }) => { const g = window.__ls.game; g.select(null); g.selectMachine(jet); g.focus(carAt, 20); }, n);
  await gp.waitForTimeout(500);
  const carScreen = await toScreen(gp, n.carAt);
  await gp.mouse.click(carScreen.x, carScreen.y, { button: "right" });
  const baseItem = await gp.waitForFunction(() => [...document.querySelectorAll("#ring .ring-item")].find(b => b.dataset.ring === "base")?.textContent ?? null, null, { timeout: 3000 }).then(h => h.jsonValue(), () => null);
  if (baseItem) await gp.click("#ring .ring-item[data-ring=base]");
  const onDeck = await gp.waitForFunction(({ jet, car }) => { const w = window.__ls.game.world, j = w.machines.get(jet), c = w.machines.get(car); return j?.air?.landed && c && j.at === c.at || null; }, n, { timeout: 45000 }).then(() => true, () => false);
  await gp.evaluate(({ car, carAt }) => { const g = window.__ls.game; g.selectMachine(car); g.focus(carAt, 28); }, n);
  const carText = await gp.waitForFunction(() => { const t = document.querySelector("#machine-cargo")?.textContent ?? ""; return /1 of 12 planes aboard/.test(t) ? t : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: `${OUT}/77-carrier.png` });
  check(baseItem?.startsWith("Base on this carrier") && onDeck && carText, `a jet right-clicks its own carrier ("${baseItem}"), flies out and lands on it; the carrier's card reads "${carText}"`);
  await gp.evaluate(({ sub }) => { const g = window.__ls.game, u = g.world.machines.get(sub); g.selectMachine(sub); g.focus(u.at, 28); }, n);
  const subText = await gp.waitForFunction(() => { const t = document.querySelector("#machine-info")?.textContent ?? ""; return /can hit it|nothing can hit/.test(t) ? t : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: `${OUT}/78-submarine.png` });
  check(!!subText, `a submarine's card says how deep it runs and what can hit it: "${subText?.trim()}"`);
  await gp.evaluate(() => window.__ls.game.selectMachine(null));
}
const nukeId = await newWorld(gp, "UI nukes", { map: "test", w: 160, h: 100, seed: 12, bots: 4, rules: { buildSpeed: 60 } });
await gp.goto(`${BASE}/#w=${nukeId}`);
await gp.reload();
await ready(gp);
const nk = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, { isLand } = await import("/js/shared/terrain.js");
  const wait = async (f, ms = 8000) => { const end = Date.now() + ms; let v; while (!(v = f()) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
  let spawned = false;
  for (let y = 20; y < 80 && !spawned; y += 6) for (let x = 20; x < 140 && !spawned; x += 10) if (isLand(w.terrain[y * w.w + x]) && !w.owner[y * w.w + x]) spawned = !!(await g.conn.request({ t: "spawn", x, y })).ok;
  await wait(() => w.nations.get(w.you)?.capital != null && w.owner[w.nations.get(w.you).capital] === w.you);
  await g.conn.request({ t: "research", id: "nuclear_weapons", mode: "queue" });
  await g.conn.request({ t: "admin", op: "finish", nation: w.you });
  await g.conn.request({ t: "admin", op: "speed", factor: 8 });
  await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "money", amount: 60000 });
  await wait(() => !w.lockOf("missile_silo"));
  const cap = w.nations.get(w.you).capital;
  let at = null;
  for (let r = 2; r < 12 && at === null; r++) for (let dy = -r; dy <= r && at === null; dy++) for (let dx = -r; dx <= r; dx++) { const i = cap + dy * w.w + dx; if (i >= 0 && i < w.owner.length && !w.placeError("missile_silo", i)) { at = i; break; } }
  const b = at === null ? null : await g.conn.request({ t: "build", type: "missile_silo", at });
  await wait(() => w.buildings.get(b?.building)?.state === "active", 15000);
  const made = b?.ok ? await g.conn.request({ t: "nuke", op: "build", silo: b.building, kind: "atomic" }) : null;
  await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: true });
  await wait(() => w.siloOf(b?.building)?.ready);
  await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: false });
  const d = (i, j) => Math.hypot((i % w.w) - (j % w.w), ((i / w.w) | 0) - ((j / w.w) | 0));
  const bot = [...w.nations.values()].filter(n => n.id !== w.you && n.alive && n.capital != null).sort((p, q) => d(p.capital, cap) - d(q.capital, cap))[0];
  let target = null;
  const { TERRAIN: T } = await import("/js/shared/terrain.js");
  if (bot) for (let i = 0; i < w.owner.length && target === null; i++) if (w.owner[i] === bot.id && i !== bot.capital && d(i, bot.capital) >= 2 && T[w.terrain[i]].name !== "river") target = i;
  const mid = target === null ? cap : Math.round((((cap / w.w) | 0) + ((target / w.w) | 0)) / 2) * w.w + Math.round(((cap % w.w) + (target % w.w)) / 2);
  const { TERRAIN } = await import("/js/shared/terrain.js");
  return { crater: TERRAIN.findIndex(t => t.name === "crater"), silo: b?.building ?? null, siloAt: at, target, mid, bot: bot?.name ?? null, made: made?.error ?? null, ready: !!w.siloOf(b?.building)?.ready };
});
await gp.evaluate(({ silo, siloAt }) => { const g = window.__ls.game; g.selectBuilding(silo); g.focus(siloAt, 16); }, nk);
const siloReady = await gp.waitForFunction(() => /ready/.test(document.querySelector("#silo-info")?.textContent ?? "") ? document.querySelector("#silo-info").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
if (siloReady) await gp.click("#silo-aim");
await gp.evaluate(({ target }) => window.__ls.game.focus(target, 10), nk);
await gp.waitForTimeout(500);
if (nk.target !== null) { const t = await toScreen(gp, nk.target); await gp.mouse.click(t.x, t.y); }
const aimText = await gp.waitForFunction(() => /Chance it is shot down/.test(document.querySelector("#silo-info")?.textContent ?? "") ? document.querySelector("#silo-info").textContent : null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await gp.waitForTimeout(300);
await gp.screenshot({ path: `${OUT}/79-nuke-aim.png` });
check(!!siloReady && !!aimText, `a ready silo's card has Aim and launch; a click on ${nk.bot}'s land shows the blast circles and "${aimText?.slice(0, 90)}"${siloReady ? "" : ` (${JSON.stringify(nk)})`}`);
if (aimText) await gp.click("#silo-launch");
const launchSure = aimText ? await gp.waitForFunction(() => document.querySelector("#silo-launch")?.textContent === "Sure? Launch now" ? "Sure? Launch now" : null, null, { timeout: 3000 }).then(h => h.jsonValue(), () => gp.textContent("#silo-launch").catch(() => null)) : null;
if (launchSure) await gp.click("#silo-launch");
const alertText = await gp.waitForFunction(() => document.querySelector("#nuke-alert:not([hidden]) .nuke-row")?.textContent ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await gp.evaluate(({ mid }) => window.__ls.game.focus(mid, 4), nk);
await gp.waitForTimeout(1200);
await gp.screenshot({ path: `${OUT}/80-nuke-alert.png` });
check(launchSure === "Sure? Launch now" && /launched an atomic warhead/.test(alertText ?? ""), `Launch asks once more ("${launchSure}"), and the alert tells everyone: "${alertText}"`);
await gp.evaluate(({ target }) => window.__ls.game.focus(target, 8), nk);
const blast = await gp.waitForFunction(() => window.__ls.game.world.blasts?.some(b => b.kind === "blast" || b.kind === "intercept") ? window.__ls.game.world.blasts.at(-1).kind : null, null, { timeout: 40000 }).then(h => h.jsonValue(), () => null);
await gp.waitForTimeout(700);
await gp.screenshot({ path: `${OUT}/81-nuke-blast.png` });
const scar = blast === "blast" && await gp.waitForFunction(([t, crater]) => { const w = window.__ls.game.world, e = w.events.find(e => e.type === "nuke_detonated" && e.at === t); return e && e.cleared > 0 && w.terrain[t] === crater ? e.cleared : null; }, [nk.target, nk.crater], { timeout: 5000 }).then(h => h.jsonValue(), () => false);
await gp.waitForTimeout(3500);
await gp.screenshot({ path: `${OUT}/82-nuke-crater.png` });
check(blast === "intercept" || !!scar, `the warhead comes down (${blast}): the blast is drawn, the target plot is left crater, and ${scar} plots of land were cleared`);
{
  const tw = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world;
    const wait = async (f, ms = 8000) => { const end = Date.now() + ms; let v; while (!(v = f()) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
    await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "money", amount: 20000 });
    const cap = w.nations.get(w.you).capital;
    const spot = (type, avoid = -1) => { for (let r = 2; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = cap + dy * w.w + dx; if (i !== avoid && i >= 0 && i < w.owner.length && !w.placeError(type, i)) return i; } return null; };
    const parkAt = spot("park"), park = await g.conn.request({ t: "build", type: "park", at: parkAt });
    const plaza = await g.conn.request({ t: "build", type: "plaza", at: spot("plaza", parkAt) });
    await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: true });
    await wait(() => w.buildings.get(park.building)?.state === "active" && w.buildings.get(plaza.building)?.state === "active");
    await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: false });
    await wait(() => w.purse?.tourism?.perSecond > 0, 12000);
    return { park: !!park.ok, plaza: !!plaza.ok, tourism: w.purse?.tourism ?? null, at: plaza.ok ? w.buildings.get(plaza.building)?.anchor : cap };
  });
  await gp.evaluate(() => { const g = window.__ls.game; g.selectBuilding(null); g.toggleBuildMenu(true); });
  let rows = [];
  for (let k = 0; k < 3 && !rows.includes("park"); k++) {
    await gp.click("#build-menu .tabs button:has-text('Tourism')").catch(() => null);
    rows = await gp.waitForSelector("#build-menu [data-type=park]", { timeout: 3000 }).then(() => gp.$$eval("#build-menu [data-type]", els => els.map(e => e.dataset.type)), () => []);
  }
  await gp.screenshot({ path: `${OUT}/83-tourism-tab.png` });
  await gp.click("#build-menu .tabs button:has-text('Wonders')").catch(() => null);
  await gp.waitForTimeout(300);
  const wonderText = await gp.textContent("#build-menu [data-wonder=wonder_pyramid]").catch(() => null);
  check(["park", "plaza", "museum", "zoo", "arena"].every(t => rows.includes(t)) && /Nobody has built it yet|stands in|Being built/.test(wonderText ?? ""), `the build menu has a Tourism tab (${rows.join(", ")}) and a Wonders tab that says who has each ("${wonderText}")`);
  await gp.evaluate(({ at }) => { const g = window.__ls.game; g.toggleBuildMenu(false); g.town.show(true); g.focus(at, 28); }, tw);
  const line = await gp.waitForFunction(() => { const t = document.querySelector("#town-tourism")?.textContent ?? ""; return parseFloat(t) > 0 ? [t, document.querySelector("#town-visitors")?.textContent ?? ""] : null; }, null, { timeout: 12000 }).then(h => h.jsonValue(), () => null);
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: `${OUT}/84-town-tourism.png` });
  check(tw.park && tw.plaza && !!line && /2 attractions of 2 kinds/.test(line[1]), `a park and a plaza pay visitors' gold: the Town panel reads "${line?.[0]}" and "${line?.[1]}"`);
  await gp.evaluate(() => window.__ls.game.town.show(false));
}
{
  const fu = await gp.evaluate(async () => {
    const g = window.__ls.game, w = g.world;
    const wait = async (f, ms = 8000) => { const end = Date.now() + ms; let v; while (!(v = f()) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
    for (const id of ["shields", "railguns", "orbital_weapons", "drones"]) await g.conn.request({ t: "research", id, mode: "queue" });
    await g.conn.request({ t: "admin", op: "finish", nation: w.you });
    await wait(() => !w.lockOf("shield_generator") && !w.lockOf("orbital_uplink"));
    await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "money", amount: 60000 });
    const cap = w.nations.get(w.you).capital;
    const spot = type => { for (let r = 2; r < 18; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = cap + dy * w.w + dx; if (i >= 0 && i < w.owner.length && !w.placeError(type, i)) return i; } return null; };
    const shield = await g.conn.request({ t: "build", type: "shield_generator", at: spot("shield_generator") });
    await wait(() => w.buildings.get(shield.building), 5000);
    const uplink = await g.conn.request({ t: "build", type: "orbital_uplink", at: spot("orbital_uplink") });
    await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: true });
    await wait(() => w.buildings.get(shield.building)?.state === "active" && w.buildings.get(uplink.building)?.state === "active", 12000);
    await g.conn.request({ t: "admin", op: "cheat", nation: w.you, cheat: "build", on: false });
    return { era: w.purse?.era, shield: shield.building ?? null, uplink: uplink.building ?? null, at: w.buildings.get(shield.building)?.anchor ?? cap, error: shield.error ?? null, uplinkError: uplink.error ?? null };
  });
  await gp.evaluate(() => { const g = window.__ls.game; g.selectBuilding(null); g.toggleBuildMenu(true); });
  let rows = [];
  for (let k = 0; k < 3 && !rows.includes("shield_generator"); k++) {
    await gp.click("#build-menu .tabs button:has-text('Military')").catch(() => null);
    rows = await gp.waitForSelector("#build-menu [data-type=shield_generator]", { timeout: 3000 }).then(() => gp.$$eval("#build-menu [data-type]", els => els.map(e => e.dataset.type)), () => []);
  }
  await gp.screenshot({ path: `${OUT}/84b-future-military.png` });
  check(["shield_generator", "shield_node", "railgun_battery", "orbital_uplink", "drone_hangar"].every(t => rows.includes(t)), `after the Future research the Military tab has the shields, the railgun battery, the orbital uplink and the drone hangar (${rows.filter(t => /shield|railgun|uplink|drone/.test(t)).join(", ")})`);
  await gp.evaluate(({ shield, at }) => { const g = window.__ls.game; g.toggleBuildMenu(false); g.selectBuilding(shield); g.focus(at, 6); }, fu);
  await gp.waitForTimeout(1500);
  const domes = await gp.evaluate(() => window.__ls.game.view.domes?.length ?? 0);
  await gp.screenshot({ path: `${OUT}/84c-shield-cover.png` });
  check(fu.era === "F" && fu.shield !== null && domes >= 1, `a shield generator stands in the Future era (${fu.era}), drawn with its dome and cover ring (${domes} dome${domes === 1 ? "" : "s"})${fu.error ? ` (${fu.error})` : ""}`);
  await gp.evaluate(({ uplink }) => window.__ls.game.selectBuilding(uplink), fu);
  const offer = await gp.waitForFunction(() => document.querySelector("#silo-actions [data-warhead=orbital]")?.textContent ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  const kinds = await gp.$$eval("#silo-actions [data-warhead]", els => els.map(e => e.dataset.warhead)).catch(() => []);
  await gp.screenshot({ path: `${OUT}/84d-uplink.png` });
  check(/^Orbital strike: /.test(offer ?? "") && kinds.length === 1, `the orbital uplink's card offers only "${offer}"${fu.uplinkError ? ` (${fu.uplinkError})` : ""}`);
  await gp.evaluate(() => window.__ls.game.selectBuilding(null));
}
const ip = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await login(ip, "rw_scorch", "correct horse");
await ip.goto(`${BASE}/#w=${indId}`);
await ip.reload();
await ready(ip);
const phoneLine = await ip.evaluate(async () => {
  const g = window.__ls.game, w = g.world, cap = w.nations.get(w.you).capital, cx = cap % w.w, cy = (cap / w.w) | 0, { TERRAIN } = await import("/js/shared/terrain.js");
  const free = i => w.owner[i] === w.you && !w.buildingAt(i) && !w.roads[i] && TERRAIN[w.terrain[i]].build;
  for (let dx = 4; dx <= 12; dx++) for (const sx of [1, -1]) for (let sy = -3; sy <= 3; sy++) {
    const x = cx + sx * dx, run = [];
    for (let y = cy + sy - 4; y <= cy + sy + 4; y++) run.push(y * w.w + x);
    if (!run.every(i => i >= 0 && i < w.owner.length)) continue;
    if (x > 1 && x < w.w - 2 && run.every(free)) { g.focus(run[4], 14); return { a: run[0], b: run[8] }; }
  }
  return null;
});
await ip.waitForTimeout(400);
const ipScr = async i => ip.evaluate(i => { const g = window.__ls.game, w = g.world, v = g.view; const [sx, sy] = v.plotToScreen((i % w.w) + 0.5, ((i / w.w) | 0) + 0.5); return [sx / v.ratio, sy / v.ratio]; }, i);
await ip.tap("#open-build");
await ip.tap("#build-menu .tabs button:has-text('Power')");
await ip.tap("[data-type=power_pole]").catch(() => {});
let phoneToast = "";
if (phoneLine) {
  const touchTap = async i => {
    const [x, y] = await ipScr(i);
    await ip.evaluate(([x, y]) => {
      const c = document.querySelector("#map"), keep = c.setPointerCapture;
      c.setPointerCapture = () => {};
      for (const type of ["pointerdown", "pointerup"]) c.dispatchEvent(new PointerEvent(type, { pointerId: 42, pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true }));
      c.setPointerCapture = keep;
    }, [x, y]);
    await ip.waitForTimeout(600);
  };
  await touchTap(phoneLine.a);
  await touchTap(phoneLine.b);
  await ip.waitForSelector("#road-lay", { timeout: 3000 }).catch(() => {});
  await ip.tap("#road-lay").catch(() => {});
  phoneToast = await ip.waitForFunction(() => (document.querySelector("#toasts")?.textContent ?? "").match(/Placed \d+ power poles?[^.]*\./)?.[0] ?? null, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
}
await ip.screenshot({ path: `${OUT}/65-poles-phone.png` });
check(/^Placed \d+ power poles/.test(phoneToast), `on a phone, two taps and Place poles lay a line: "${phoneToast}"`);
await ip.close();

await gp.bringToFront();
const menuId = await newWorld(gp, "UI menu", { map: "test", w: 160, h: 100, seed: 3, bots: 6 });
await gp.evaluate(id => localStorage.setItem("ls_last_world", id), menuId);
await gp.goto(BASE + "/");
await gp.waitForSelector("#world-create", { timeout: 5000 });
const liveCap = await gp.waitForFunction(() => { const c = document.querySelector(".live-caption"); return c && !c.hidden && /UI menu/.test(c.textContent) ? c.textContent : null; }, null, { timeout: 15000 }).then(h => h.jsonValue(), () => "");
await gp.waitForTimeout(2500);
await gp.screenshot({ path: `${OUT}/57-menu.png` });
const selected = await gp.evaluate(id => document.querySelector(".world.on")?.dataset.id === id, menuId);
check(/Live/.test(liveCap) && /6 bot nations/.test(liveCap) && selected, `the world list watches the last world live beside it: "${liveCap}"`);
await gp.click(`[data-schedule="${menuId}"]`);
await gp.fill(`#sched-${menuId}-startAt`, localInput(Date.now() + 2 * 3600000));
await gp.click(`[data-sched-save="${menuId}"]`);
const schedRow = await gp.waitForFunction(id => { const r = document.querySelector(`.world[data-id="${id}"]`); return r && /starts in/.test(r.textContent) ? r.textContent : null; }, menuId, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
check(/starts in (1 h 5\d min|2 h 0 min)/.test(schedRow), `Schedule on a world's card sets its start time: "${schedRow.match(/\d+ players?[^(]*\([^)]*\)/)?.[0]}"`);
await gp.fill("#world-name", "UI menu new");
await gp.selectOption("#world-map", "test");
await gp.click("#new-schedule summary");
await gp.fill("#new-sched-startAt", localInput(Date.now() + 3 * 3600000));
await gp.fill("#new-sched-endAt", localInput(Date.now() + 30 * 3600000));
await gp.click("#world-create");
await ready(gp);
const madeSched = await gp.waitForFunction(() => window.__ls.game.world?.schedule?.startAt ?? null, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
check(madeSched && Math.abs(madeSched - (Date.now() + 3 * 3600000)) < 5 * 60000, `a new world can be scheduled as it is made: it starts ${madeSched ? new Date(madeSched).toISOString() : "never"}`);
const out = await openPage({ viewport: { width: 1280, height: 720 } });
await out.goto(BASE + "/");
const scenery = await out.waitForFunction(() => document.querySelector(".live-map")?.width > 100 && document.querySelector("#login-name") ? document.querySelector(".live-caption").hidden : null, null, { timeout: 15000 }).then(h => h.jsonValue(), () => null);
await out.waitForTimeout(1500);
await out.screenshot({ path: `${OUT}/58-login.png` });
check(scenery === true, "logged out, the login screen pans across the Earth map with no world shown");
await out.close();

await gp.bringToFront();
{
const solId = await newWorld(gp, "UI soldiers", { map: "test", w: 160, h: 100, seed: 12, bots: 0 });
await gp.goto(`${BASE}/#w=${solId}`);
await gp.reload();
await ready(gp);
const company = await gp.evaluate(async () => {
  const g = window.__ls.game, w = g.world, { TERRAIN } = await import("/js/shared/terrain.js");
  const flat = i => [0, 1, -1, w.w, -w.w].every(d => TERRAIN[w.terrain[i + d]]?.build);
  for (let y = 20; y < w.h - 20 && !w.nations.get(w.you)?.spawned; y += 2) for (let x = 20; x < w.w - 20; x += 2) if (flat(y * w.w + x) && (await g.conn.request({ t: "spawn", x, y })).ok) break;
  await new Promise(r => setTimeout(r, 1200));
  await g.conn.request({ t: "admin", op: "give", nation: w.you, what: "troops", amount: 3000 });
  await new Promise(r => setTimeout(r, 600));
  const cap = w.nations.get(w.you).capital;
  const r = await g.conn.request({ t: "stack", share: 0.5, at: cap });
  const seen = Date.now() + 4000;
  while (!w.stacks.has(r.stack) && Date.now() < seen) await new Promise(res => setTimeout(res, 50));
  g.focus(cap, 28);
  return { id: r.stack, troops: w.stacks.get(r.stack)?.troops ?? 0, cap };
});
await gp.waitForTimeout(500);
const soldiersDrawn = await gp.evaluate(() => { const v = window.__ls.game.view; return v.soldiers(v.visibleRange()).filter(f => f.slot !== undefined).length; });
const cardTitle = await gp.evaluate(id => { window.__ls.game.select(id); return new Promise(r => setTimeout(() => r(document.querySelector("#stack-title")?.textContent ?? ""), 300)); }, company.id);
await gp.screenshot({ path: `${OUT}/66-soldiers.png` });
check(company.troops >= 1000 && soldiersDrawn >= Math.floor(company.troops / 10) * 0.9 && /^Your company, \d+ soldiers \(\d[\d,]* troops\)/.test(cardTitle), `zoomed in, a company is drawn as its soldiers one by one (${soldiersDrawn} figures for ${Math.round(company.troops)} troops): "${cardTitle}"`);
await gp.keyboard.press("Escape");
await gp.keyboard.press("v");
const armiesOn = await gp.waitForFunction(() => window.__ls.game.armies && !document.querySelector("#armies-hint").hidden, null, { timeout: 3000 }).then(() => true, () => false);
const half = await gp.evaluate(id => {
  const g = window.__ls.game, v = g.view, s = g.world.stacks.get(id), pts = v.soldierSpots(s).map(p => v.plotToScreen(p.x, p.y));
  const xs = pts.map(p => p[0]).sort((a, b) => a - b), mid = xs[xs.length >> 1], ys = pts.map(p => p[1]);
  const r = v.ratio ?? 1;
  return { x0: (Math.min(...xs) - 6) / r, x1: mid / r, y0: (Math.min(...ys) - 6) / r, y1: (Math.max(...ys) + 6) / r };
}, company.id);
await gp.keyboard.down("Shift");
await gp.mouse.move(half.x0, half.y0);
await gp.mouse.down();
await gp.mouse.move((half.x0 + half.x1) / 2, (half.y0 + half.y1) / 2, { steps: 4 });
await gp.mouse.move(half.x1, half.y1, { steps: 4 });
await gp.mouse.up();
await gp.keyboard.up("Shift");
const pickedTitle = await gp.waitForFunction(() => { const p = document.querySelector("#soldiers-panel"); return p && !p.hidden ? document.querySelector("#soldiers-title").textContent : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
const pickedN = Number(pickedTitle.match(/^(\d+)/)?.[1] ?? 0), total = Math.floor(company.troops / 10);
await gp.screenshot({ path: `${OUT}/67-soldiers-picked.png` });
check(armiesOn && pickedN > total * 0.2 && pickedN < total * 0.8, `V turns Armies on, and a Shift-drag box picks part of the company: "${pickedTitle}" of ${total}`);
const to = await gp.evaluate(async cap => {
  const w = window.__ls.game.world, { isLand } = await import("/js/shared/terrain.js"), seen = new Uint8Array(w.w * w.h), todo = [cap], land = [];
  seen[cap] = 1;
  while (todo.length) {
    const i = todo.pop(), x = i % w.w;
    for (const j of [i - w.w, i + w.w, x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1]) if (j >= 0 && j < seen.length && !seen[j] && isLand(w.terrain[j])) { seen[j] = 1; todo.push(j); land.push(j); }
  }
  const d = i => Math.hypot((i % w.w) - (cap % w.w), ((i / w.w) | 0) - ((cap / w.w) | 0));
  return land.filter(i => d(i) >= 4 && d(i) <= 9 && !w.buildingAt(i) && (!w.owner[i] || w.owner[i] === w.you)).sort((a, b) => d(b) - d(a))[0] ?? null;
}, company.cap);
await gp.click("#soldiers-move");
const toAt = await toScreen(gp, to);
await gp.mouse.click(toAt.x, toAt.y);
const split = await gp.waitForFunction(id => { const w = window.__ls.game.world, mine = w.myStacks(); return mine.length === 2 && mine.some(s => s.id !== id && s.order === "move") ? mine.map(s => Math.round(s.troops)) : null; }, company.id, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await gp.waitForTimeout(1500);
await gp.screenshot({ path: `${OUT}/68-soldiers-move.png` });
check(split && Math.abs(split.reduce((a, b) => a + b, 0) - company.troops) < 2 && split.some(t => Math.abs(t - pickedN * 10) <= 10), `Move sends just the picked soldiers: the company splits into ${JSON.stringify(split)} troops and the new one marches`);
await gp.keyboard.press("v");
await gp.evaluate(id => window.__ls.game.select(id), company.id);
await gp.waitForSelector("#stack-pilot", { timeout: 5000 }).catch(() => {});
await gp.keyboard.press("p");
const piloting = await gp.waitForFunction(id => { const g = window.__ls.game; return g.piloting?.id === id && !document.querySelector("#pilot-hint").hidden ? document.querySelector("#pilot-text").textContent : null; }, company.id, { timeout: 5000 }).then(h => h.jsonValue(), () => "");
const startAt = await gp.evaluate(id => window.__ls.game.world.pilotAt(`s:${id}`), company.id);
let steerKey = "d";
for (const k of ["d", "a", "w", "s"]) {
  await gp.keyboard.down(k);
  await gp.waitForTimeout(1500);
  await gp.keyboard.up(k);
  const now = await gp.evaluate(id => window.__ls.game.world.pilotAt(`s:${id}`), company.id);
  if (now && startAt && Math.hypot(now[0] - startAt[0], now[1] - startAt[1]) > 1) { steerKey = k; break; }
}
const endAt = await gp.evaluate(id => window.__ls.game.world.pilotAt(`s:${id}`), company.id);
const steered = endAt && startAt ? Math.hypot(endAt[0] - startAt[0], endAt[1] - startAt[1]) : 0;
await gp.screenshot({ path: `${OUT}/70-pilot.png` });
await gp.keyboard.press("Escape");
const letGo = await gp.waitForFunction(id => !window.__ls.game.piloting && !window.__ls.game.world.pilots.has(`s:${id}`), company.id, { timeout: 5000 }).then(() => true, () => false);
check(/^Piloting your company/.test(piloting) && steered > 1 && letGo, `P pilots the selected company; holding ${steerKey.toUpperCase()} walks it ${steered.toFixed(1)} plots, and Esc lets go`);
const pp = await openPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await login(pp, "rw_scorch", "correct horse");
await pp.goto(`${BASE}/#w=${solId}`);
await pp.reload();
await ready(pp);
const phoneDraw = await pp.evaluate(async cap => {
  const g = window.__ls.game, v = g.view;
  g.focus(cap, 30);
  await new Promise(r => setTimeout(r, 400));
  const figs = v.soldiers(v.visibleRange()).filter(f => f.slot !== undefined).length, R = v.ratio ?? 1;
  const budget = Math.floor((v.canvas.width * v.canvas.height) / (R * R) / g.world.soldierRules.drawArea);
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) v.render(0.016);
  return { figs, budget, share: v.soldierShare, frameMs: +((performance.now() - t0) / 20).toFixed(1) };
}, company.cap);
await pp.screenshot({ path: `${OUT}/69-soldiers-phone.png` });
check(phoneDraw.figs > 0 && phoneDraw.figs <= phoneDraw.budget + 5, `on a phone the soldiers drawn stay inside the screen's budget: ${phoneDraw.figs} of at most ${phoneDraw.budget}, a frame in ${phoneDraw.frameMs} ms`);
await pp.evaluate(id => window.__ls.game.select(id), company.id);
await pp.click("#stack-pilot", { timeout: 5000 }).catch(() => {});
const padShown = await pp.waitForFunction(() => { const p = document.querySelector("#pilot-pad"); return p && !p.hidden && getComputedStyle(p).display !== "none" && window.__ls.game.piloting; }, null, { timeout: 5000 }).then(() => true, () => false);
const phoneStart = await pp.evaluate(id => window.__ls.game.world.pilotAt(`s:${id}`), company.id);
const box = await pp.locator("#pilot-stick").boundingBox().catch(() => null);
let phoneMoved = 0;
if (box) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
    await pp.mouse.move(cx, cy);
    await pp.mouse.down();
    await pp.mouse.move(cx + dx * box.width * 0.45, cy + dy * box.height * 0.45, { steps: 3 });
    await pp.waitForTimeout(1500);
    await pp.mouse.up();
    const now = await pp.evaluate(id => window.__ls.game.world.pilotAt(`s:${id}`), company.id);
    phoneMoved = now && phoneStart ? Math.hypot(now[0] - phoneStart[0], now[1] - phoneStart[1]) : 0;
    if (phoneMoved > 1) break;
  }
}
await pp.screenshot({ path: `${OUT}/71-pilot-phone.png` });
await pp.click("#pilot-release").catch(() => {});
const phoneLetGo = await pp.waitForFunction(() => !window.__ls.game.piloting, null, { timeout: 5000 }).then(() => true, () => false);
check(padShown && phoneMoved > 1 && phoneLetGo, `on a phone, Pilot shows the stick and Fire; dragging the stick walks the company ${phoneMoved.toFixed(1)} plots, and Let go ends it`);
await pp.close();
}

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
