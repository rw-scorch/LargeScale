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
  return page;
}

async function login(page, name, password) {
  await page.goto(BASE + "/");
  await page.fill("#login-name", name);
  await page.fill("#login-pass", password);
  await page.click("#login-go");
  try { await page.waitForSelector("#world-create", { timeout: 3000 }); }
  catch {
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

await page.click("#form-stack");
await page.waitForSelector("#stack-advance", { timeout: 5000 });
check(true, "forming a stack selects it and shows its orders");
await page.click("#stack-advance");
await page.waitForTimeout(3500);
const grew = await page.evaluate(() => { const w = window.__ls.game.world; return w.nations.get(w.you).plots; });
check(grew > 40, `advancing takes land: ${grew} plots`);
await page.screenshot({ path: `${OUT}/3-advance-${MAP}.png` });

await page.fill("#stack-share", "40");
await page.click("#form-stack");
await page.waitForTimeout(700);
await page.click("#stack-move");
const target = await page.evaluate(() => {
  const g = window.__ls.game, w = g.world, v = g.view, s = w.stacks.get(g.selected);
  const sx = s.pos % w.w, sy = (s.pos / w.w) | 0;
  for (const [dx, dy] of [[25, 0], [-25, 0], [0, 20], [0, -20], [18, 14], [-18, -14]]) {
    const x = sx + dx, y = sy + dy, i = y * w.w + x;
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !(w.terrain[i] >= 7 && w.terrain[i] <= 26)) continue;
    const [px, py] = v.plotToScreen(x + 0.5, y + 0.5);
    if (px < 40 || py < 80 || px > v.canvas.width - 40 || py > v.canvas.height - 120) continue;
    return { x: px / v.ratio, y: py / v.ratio };
  }
  return null;
});
if (target) await page.mouse.click(target.x, target.y);
const preview = await page.waitForSelector("#move-go", { timeout: 5000 }).then(() => true, () => false);
const hint = preview ? await page.textContent("#stack-hint") : "";
check(preview, `tapping a destination shows the route line and travel time: "${hint.split(".")[0]}"`);
await page.screenshot({ path: `${OUT}/4-route-${MAP}.png` });
if (preview) await page.click("#move-go");
await page.waitForTimeout(2500);
const moving = await page.evaluate(() => { const g = window.__ls.game; return g.world.stacks.get(g.selected)?.order; });
check(moving === "move" || moving === "hold", `the stack takes the order (now ${moving})`);
await page.screenshot({ path: `${OUT}/5-moving-${MAP}.png` });

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

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
