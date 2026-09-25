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

const kit = await page.waitForFunction(() => { const w = window.__ls.game.world; return [...w.buildings.values()].some(b => b.owner === w.you && b.type === "chieftain_hut" && b.state === "active"); }, null, { timeout: 5000 }).then(() => true, () => false);
const purseText = await page.textContent("#purse");
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
await page.click("#build-menu [data-zone=res]");
await drag(-5.5, -5.5, 3.5, -1.5);
await page.click("#build-menu [data-zone=com]");
await drag(-5.5, 2.5, 3.5, 4.5);
const zoned = await page.waitForFunction(() => { const w = window.__ls.game.world; let n = 0; for (const z of w.zone) if (z) n++; return n >= 20 ? n : 0; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => 0);
check(zoned >= 20, `dragging in the Zones tab paints homes and shops: ${zoned} plots`);
await page.screenshot({ path: `${OUT}/2a-zones-${MAP}.png` });
await page.keyboard.press("Escape");
await page.click("#build-menu .tabs button:has-text('Military')");
const locked = await page.textContent("#build-menu [data-type=barracks]");
check(await page.isDisabled("#build-menu [data-type=barracks]") && /Needs the Medieval era/.test(locked), `a locked building is greyed out with its reason: "${locked.match(/Needs.*/)?.[0]}"`);
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
await page.keyboard.press("t");
const people = await page.textContent("#town-population").catch(() => "");
check(grown && await page.isVisible("#town-panel") && /of/.test(people), `huts rise in the zone, and T opens the town panel: "${people}"`);
await page.screenshot({ path: `${OUT}/2h-town-${MAP}.png` });
await page.keyboard.press("t");
await page.mouse.click(spots.ok.x, spots.ok.y);
check(await page.waitForSelector("#building-demolish", { timeout: 3000 }).then(() => true, () => false), `clicking it opens its panel: "${await page.textContent("#building-title").catch(() => "")}"`);
await page.screenshot({ path: `${OUT}/2f-built-${MAP}.png` });
await page.click("#building-demolish");
const rubble = await page.waitForFunction(id => window.__ls.game.world.buildings.get(id)?.state === "rubble", site, { timeout: 5000 }).then(() => true, () => false);
check(rubble, "Demolish turns it to rubble");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/2g-rubble-${MAP}.png` });
await page.keyboard.press("Escape");
await page.evaluate(() => window.__ls.game.focus(window.__ls.game.world.nations.get(window.__ls.game.world.you).capital, 6));

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
await page.waitForTimeout(1500);
const rcNow = rc && await page.evaluate(id => { const s = window.__ls.game.world.stacks.get(id); return s && { order: s.order, pos: s.pos }; }, rc.id);
check(rcNow && (rcNow.order === "move" || rcNow.pos !== rcFrom), `right-click sends the selected stack with no Go step (now ${rcNow?.order}, moved ${rcNow?.pos !== rcFrom})`);
check(!(await page.isVisible("#move-go")), "no route preview is left open after a right-click");
await page.keyboard.press("Escape");
check(await page.evaluate(() => window.__ls.game.selected) === null, "Esc clears the selection");

await page.click("#chat .title");
await page.fill("#chat-input", "hello from the real client");
await page.click("#chat-send");
const chatted = await page.waitForFunction(() => document.querySelector("#chat .lines")?.textContent.includes("hello from the real client"), null, { timeout: 5000 }).then(() => true, () => false);
check(chatted, "chat goes out and comes back");
await page.screenshot({ path: `${OUT}/6-chat-${MAP}.png` });

const world = await frames(page, () => window.__ls.game.fit());
const close = await frames(page, () => { const g = window.__ls.game; g.home(); g.view.cam.scale = 16 * g.view.ratio; g.view.clampCamera(); });
console.log(`frame times at whole-map view: ${JSON.stringify(world)}`);
console.log(`frame times at 16 px per plot: ${JSON.stringify(close)}`);
check(close.cssPxPerPlot === 16, "zoom reaches 16 px per plot");
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
await phone.setViewportSize({ width: 390, height: 844 });
await phone.waitForTimeout(400);
check(await phone.isVisible("#rotate"), "portrait phones are asked to turn sideways");
await phone.screenshot({ path: `${OUT}/9-phone-portrait-${MAP}.png` });

const quarry = await openPage({ viewport: { width: 1280, height: 720 } });
await login(quarry, "rw_scorch", "correct horse");
const qid = await quarry.evaluate(async () => {
  const r = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("ls_token")}` }, body: JSON.stringify({ name: "UI quarry", config: { map: "test", w: 240, h: 160, seed: 11, bots: 0, rules: { buildSpeed: 60, produceSpeed: 2000 } } }) });
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

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
