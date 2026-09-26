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
  try { await page.waitForSelector("#world-create", { timeout: 3000 }); }
  catch {
    for (let i = errors.length - 1; i >= 0; i--) if (/401/.test(errors[i])) errors.splice(i, 1);
    await page.fill("#login-invite", INVITE);
    await page.click("#register-go");
    await page.waitForSelector("#world-create", { timeout: 5000 });
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
await page.click("#research-queue-add");
await page.click("#research-panel [data-node=barter]");
await page.click("#research-queue-add");
const queued = await page.waitForFunction(() => { const q = window.__ls.game.world.purse?.research?.queue ?? []; return q.includes("palisades") && q.includes("barter") ? q : null; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => []);
const pal = queued.indexOf("palisades");
check(queued[0] === "clubs" && pal > 0 && pal <= 2 && queued.indexOf("stone_tools") < pal, `Research next queues what the node still needs first: ${queued.join(", ")}`);
await page.screenshot({ path: `${OUT}/2r-research-${MAP}.png` });
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
check(/lookout/.test(towerDesc) && /no effect on combat yet/.test(towerDesc), `each building in the menu says what it does: "${towerDesc}"`);
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
const site = await page.waitForFunction(p => { const b = window.__ls.game.world.buildingAt(p); return b && b.type === "watchtower_wood" ? b.id : null; }, spots.ok.plot, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
check(site !== null, `clicking builds a construction site (building ${site})`);
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
check(ownRing.join() === "form,build,zone,info", `with nothing selected, a right-click on your land opens the ring: ${ownRing.join(", ")}, with Form stack in the centre`);
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
check(freeRing.join() === "take,info" && took, `on unclaimed land the ring offers ${freeRing.join(", ")}; Take land forms a stack that takes unclaimed land only`);
const foeRing = ringSpots.foe === null ? [] : await ringAt(page, ringSpots.foe);
const attackLabel = await page.textContent("#ring [data-ring=attack] .label").catch(() => "");
await page.screenshot({ path: `${OUT}/5c-ring-attack-${MAP}.png` });
if (foeRing[0] === "attack") await page.click("#ring [data-ring=attack]");
const attacking = await page.waitForFunction(id => (window.__ls.game.world.purse?.orders ?? []).some(o => o.only === id), ringSpots.foeId, { timeout: 5000 }).then(() => true, () => false);
check(foeRing.join() === "attack,info" && attackLabel === `Attack ${ringSpots.foeName}` && attacking, `on ${ringSpots.foeName}'s land the ring offers "${attackLabel}", which forms a stack at your nearest land that advances into that nation only`);
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
  const g = window.__ls.game, w = g.world, d = w.deposits;
  for (let k = 0; k < d.plots.length; k++) {
    if (w.depositIds[d.type[k] - 1] !== "stone") continue;
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
await quarry.waitForFunction(() => window.__ls.game.world.purse?.money >= 40, null, { timeout: 10000 }).catch(() => {});
const qat = await quarry.evaluate(p => {
  const g = window.__ls.game, w = g.world;
  for (const a of [p, p - 1, p - w.w, p - w.w - 1]) if (!w.placeError("quarry", a)) return a;
  return null;
}, spot);
const why = spot === null ? "no stone deposit to spawn on" : await quarry.evaluate(p => window.__ls.game.world.placeError("quarry", p), spot);
check(qat !== null, `a quarry fits over the stone deposit at the new capital${qat === null ? `: ${why}` : ""}`);
await quarry.evaluate(p => { const g = window.__ls.game; g.focus(p, 16); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); }, spot);
await quarry.waitForTimeout(600);
await quarry.screenshot({ path: `${OUT}/10-deposit-${MAP}.png` });
await quarry.keyboard.press("b");
await quarry.click("#build-menu .tabs button:has-text('Resources')");
const quarryText = await quarry.textContent("#build-menu [data-type=quarry]");
check(/Makes 0.25 stone a second/.test(quarryText), `the Resources tab lists the quarry with its output: "${quarryText.match(/Makes[^,]*/)?.[0]}"`);
await quarry.keyboard.press("Escape");
const qr = await quarry.evaluate(a => window.__ls.game.conn.request({ t: "build", type: "quarry", at: a }), qat);
const dry = await quarry.waitForFunction(a => { const w = window.__ls.game.world, b = w.buildingAt(a); return b ? b.plots.find(i => w.depleted.has(i)) ?? null : null; }, qat, { timeout: 120000 }).then(h => h.jsonValue(), () => null);
const allDry = await quarry.waitForFunction(a => { const g = window.__ls.game, b = g.world.buildingAt(a); return b && g.view.dryDeposit(b); }, qat, { timeout: 180000 }).then(h => h.jsonValue(), () => null);
const ran = dry !== null && allDry === "stone";
const stone = await quarry.evaluate(() => window.__ls.game.world.purse?.stock.stone ?? 0);
check(qr?.ok && ran, `the quarry runs the deposit dry (${stone} stone in stock), and the client marks it depleted`);
await quarry.evaluate(p => { const g = window.__ls.game; g.focus(p, 16); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); }, dry ?? spot);
await quarry.waitForTimeout(600);
await quarry.screenshot({ path: `${OUT}/11-quarry-dry-${MAP}.png` });
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
await fix.evaluate(() => document.getElementById("screen").scrollTo(0, 1e6));
await fix.evaluate(() => document.getElementById("screen").scrollTo(0, 0));
const top = await fix.evaluate(() => document.querySelector("#screen h1").getBoundingClientRect().top);
const tall = await fix.evaluate(() => document.getElementById("screen").scrollHeight > document.getElementById("screen").clientHeight);
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
check(armedText === "Really end it?" && /ended this world/.test(endNote) && /ended this world/.test(friendNote), `End world asks once more ("${armedText}"), then everyone sees: "${friendNote}"`);
await fix.screenshot({ path: `${OUT}/21-admin-panel.png` });
await fix.click("#admin-reopen");
const reopenedUi = await fix.waitForFunction(() => !window.__ls.game.world.frozen && document.querySelector("#notice")?.hidden, null, { timeout: 5000 }).then(() => true, () => false);
await fix.click("#admin-panel [data-speed='1']");
check(reopenedUi, "Reopen world unfreezes it and the banner goes");
await fix.keyboard.press("Escape");
check(!(await fix.isVisible("#admin-panel")), "Esc closes the Admin panel");
await fix.keyboard.press("y");
const lockedRow = await fix.waitForSelector("#upgrade-panel .upgrade-row.locked", { timeout: 5000 }).then(() => fix.textContent("#upgrade-panel .upgrade-row.locked"), () => "");
check(await fix.isVisible("#upgrade-panel") && /Needs the Medieval era|research/.test(lockedRow), `Y opens the upgrade menu; Tribal buildings show why they cannot upgrade yet: "${lockedRow.trim()}"`);
await fix.screenshot({ path: `${OUT}/23-upgrade-locked.png` });
const medieval = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you;
  for (const id of ["clubs", "palisades", "chieftains", "mud_building", "healers", "herding", "age_medieval", "masonry"]) await g.conn.request({ t: "research", id });
  await g.conn.request({ t: "admin", op: "finish", nation: me });
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "money", amount: 5000 });
  await g.conn.request({ t: "admin", op: "give", nation: me, what: "wood", amount: 500 });
  const cap = w.nations.get(me).capital, cx = cap % w.w, cy = (cap / w.w) | 0, placed = [];
  for (let dy = -6; dy <= 6 && placed.length < 4; dy += 2) for (let dx = -6; dx <= 6 && placed.length < 4; dx += 2) {
    const i = (cy + dy) * w.w + cx + dx;
    if (w.owner[i] !== me || w.placeError("watchtower_wood", i)) continue;
    if ((await g.conn.request({ t: "build", type: "watchtower_wood", at: i })).ok) placed.push(i);
  }
  return placed;
});
const towersUp = await fix.waitForFunction(ps => ps.every(i => window.__ls.game.world.buildingAt(i)?.state === "active") && window.__ls.game.world.purse?.era === "M", medieval, { timeout: 15000 }).then(() => true, () => false);
await fix.waitForSelector("#upgrade-panel .upgrade-row[data-type=watchtower_wood]:not(.locked)", { timeout: 5000 }).catch(() => {});
const nextDesc = await fix.textContent("#upgrade-panel .upgrade-row[data-type=watchtower_wood] .desc").catch(() => "");
check(/stone tower/.test(nextDesc), `each upgrade row describes what it becomes: "${nextDesc}"`);
await fix.click("#upgrade-all");
const totalText = await fix.textContent("#upgrade-total");
const goText = await fix.textContent("#upgrade-go");
await fix.screenshot({ path: `${OUT}/24-upgrade-picked.png` });
await fix.click("#upgrade-go");
const summaryText = await fix.waitForSelector("#upgrade-summary:not([hidden])", { timeout: 5000 }).then(() => fix.textContent("#upgrade-summary"), () => "");
const upgraded = await fix.waitForFunction(ps => ps.every(i => window.__ls.game.world.buildingAt(i)?.type === "tower_stone"), medieval, { timeout: 5000 }).then(() => true, () => false);
check(towersUp && medieval.length === 4 && /Upgrade \d+/.test(goText) && /gold/.test(totalText) && /^Upgraded \d+ for/.test(summaryText) && upgraded,
  `Select all shows a live total ("${totalText.trim()}"), and ${goText} upgrades them at once: "${summaryText}"`);
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
check(barracksUp && keepBox && trainedUp && /12 at home/.test(armyCount) && /Training \d/.test(armySummary) && /Needs Stirrups research/.test(lockedKnights), `K opens the Army panel; keeping 12 club warriors trains them at the barracks: "${armyCount}" "${armySummary}"; knights say "${lockedKnights}"`);
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
  return figs.length ? figs.map(f => f.sprite) : null;
}, knightStack, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
await fix.waitForTimeout(600);
await fix.screenshot({ path: `${OUT}/27-soldiers.png` });
check(knightFigures?.length >= 3 && knightFigures.every(s => s.startsWith("knight_")), `at close zoom a stack of mostly knights is drawn as ${knightFigures?.length} knight figures (${knightFigures?.[0]})`);
const shop = await fix.evaluate(async () => {
  const g = window.__ls.game, w = g.world, me = w.you;
  await g.conn.request({ t: "research", id: "siegecraft" });
  await g.conn.request({ t: "admin", op: "finish", nation: me });
  for (const [what, amount] of [["money", 5000], ["wood", 1000], ["stone", 200]]) await g.conn.request({ t: "admin", op: "give", nation: me, what, amount });
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
check(shop && shopUp && /Building a catapult|Waiting to start a catapult/.test(makingText) && cat, `a siege workshop, after Siegecraft, builds a catapult from its panel ("${makingText.trim()}")`);
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
await between(cat, knightStack);
await fix.waitForTimeout(300);
const catSpot = await screenAt(fix, { machine: cat });
const catUnder = catSpot && await fix.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.id || e?.closest("[id]")?.id || e?.tagName; }, [catSpot.x, catSpot.y]);
if (catSpot) await fix.mouse.click(catSpot.x, catSpot.y);
const catTitle = await fix.waitForSelector("#machine-panel:not([hidden])", { timeout: 3000 }).then(() => fix.textContent("#machine-title"), () => "");
const catPicked = await fix.evaluate(() => { const g = window.__ls.game, p = document.querySelector("#machine-panel"); return { stack: g.selected, machine: g.selectedMachine, building: g.selectedBuilding, shown: !p.hidden, h: p.getBoundingClientRect().height }; });
const stackSpot = await screenAt(fix, { stack: knightStack });
if (stackSpot) await fix.mouse.click(stackSpot.x, stackSpot.y, { button: "right" });
const catRing = await ringItems(fix);
if (catRing[0] === "follow") await fix.click("#ring [data-ring=follow]");
const following = await fix.waitForFunction(([c, s]) => window.__ls.game.world.purse?.machines?.orders?.some(o => o.id === c && o.follow === s), [cat, knightStack], { timeout: 5000 }).then(() => true, () => false);
check(catTitle === "Your catapult" && following, `clicking the catapult at ${JSON.stringify(catSpot)} over ${catUnder} opens its panel ("${catTitle}", ${JSON.stringify(catPicked)}), and a right-click on your stack offers ${catRing.join(", ")}; Follow stack makes it follow`);
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

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
