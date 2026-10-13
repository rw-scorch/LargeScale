const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const INVITE = process.env.INVITE ?? "test-invite";
const OUT = process.env.OUT ?? ".screens";
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const { mkdirSync, readFileSync } = await import("node:fs");
const { readMapFile } = await import("../src/shared/mapfile.js");
const { TERRAIN } = await import("../src/shared/terrain.js");
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "pass" : "FAIL"}  ${what}`); if (!ok) failures++; };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const errors = [];

async function openPage(options) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...options });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
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
  const inside = await page.waitForFunction(() => document.querySelector("#world-create, #host-only") ? "in" : document.querySelector(".login .msg")?.textContent ? "out" : null, null, { timeout: 20000 }).then(h => h.jsonValue());
  if (inside === "out") {
    for (let i = errors.length - 1; i >= 0; i--) if (/401/.test(errors[i])) errors.splice(i, 1);
    await page.fill("#login-invite", INVITE);
    await page.click("#register-go");
    await page.waitForSelector("#world-create, #host-only", { timeout: 20000 });
  }
}

const info = p => p.evaluate(() => {
  const m = window.maker.map;
  let land = 0;
  for (const t of m.terrain) if (window.maker.isLand(t)) land++;
  return { w: m.w, h: m.h, land, steps: window.maker.state.steps.length, msg: document.getElementById("msg").textContent };
});
const newMap = async (p, fill) => {
  await p.click("#new");
  await fill();
  await p.click("#new-dialog button[value=ok]");
};
const drag = async (p, from, to, steps = 12) => {
  const box = await p.locator("#canvas").boundingBox();
  await p.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps });
  await p.mouse.up();
};

const page = await openPage({ viewport: { width: 1280, height: 800 } });
await login(page, "rw_scorch", "correct horse");
await page.evaluate(() => localStorage.removeItem("ls_map_draft"));
await page.click("#open-maker");
await page.waitForFunction(() => window.maker?.map, null, { timeout: 20000 });
await page.evaluate(async () => { const { isLand } = await import("/js/shared/terrain.js"); window.maker.isLand = isLand; });
const swatches = await page.locator("[data-t]").count();
check(swatches === TERRAIN.length, `the Map maker button opens the maker; the palette has all ${swatches} terrains`);

await newMap(page, async () => {
  await page.check("input[name=start][value=ocean]");
  await page.fill("#new-w", "300");
  await page.fill("#new-h", "200");
});
let s = await info(page);
check(s.w === 300 && s.h === 200 && s.land === 0, `New, empty ocean, 300 by 200: ${s.w} by ${s.h}, ${s.land} land`);

await page.click("[data-t='" + TERRAIN.findIndex(t => t.name === "plains") + "']");
await page.fill("#size", "40");
await page.dispatchEvent("#size", "input");
await drag(page, [0.3, 0.3], [0.7, 0.6]);
await drag(page, [0.3, 0.6], [0.7, 0.3]);
const painted = await info(page);
check(painted.land > 2000 && painted.steps === 2, `two brush strokes paint ${painted.land} plots of plains as two undo steps`);

await page.click("[data-t='" + TERRAIN.findIndex(t => t.name === "mountain") + "']");
await page.fill("#size", "3");
await page.dispatchEvent("#size", "input");
await drag(page, [0.35, 0.45], [0.65, 0.45]);
await page.selectOption("#only", "water");
await page.click("[data-t='" + TERRAIN.findIndex(t => t.name === "shallows") + "']");
await page.fill("#size", "60");
await page.dispatchEvent("#size", "input");
await drag(page, [0.5, 0.45], [0.52, 0.47], 4);
const limited = await info(page);
check(limited.land === painted.land, `a big shallows brush set to water only leaves all ${limited.land} land plots alone`);
await page.selectOption("#only", "any");
await page.keyboard.press("f");
await page.click("[data-t='" + TERRAIN.findIndex(t => t.name === "ocean") + "']");
const box = await page.locator("#canvas").boundingBox();
const beforeFill = (await info(page)).steps;
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.08);
const filled = await page.evaluate(() => [window.maker.map.terrain[0], window.maker.map.terrain[299]]);
check(filled.every(t => TERRAIN[t].name === "ocean") && (await info(page)).steps === beforeFill + 1, `Fill turns the open deep ocean to ${TERRAIN[filled[0]].name} in one step, corner to corner`);
const before = (await info(page)).land;
for (let k = 0; k < 4; k++) await page.keyboard.press("Control+z");
const undone = await info(page);
await page.keyboard.press("Control+y");
const redone = await info(page);
check(undone.land < before && redone.steps === undone.steps + 1, `Ctrl+Z four times takes back the fill, the shallows, the mountains and a plains stroke (${before} land, then ${undone.land}); Ctrl+Y puts one back`);
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.screenshot({ path: `${OUT}/maker-drawn.png` });

await newMap(page, async () => {
  await page.check("input[name=start][value=earth]");
  await page.fill("#new-west", "-11");
  await page.fill("#new-east", "30");
  await page.fill("#new-north", "60");
  await page.fill("#new-south", "35");
  await page.check("#new-fine");
});
await page.waitForFunction(() => window.maker.map.w === 820, null, { timeout: 30000 });
s = await info(page);
check(s.w === 820 && s.h === 500 && s.land > 100000, `a part of the Earth, 11 W to 30 E and 35 to 60 N at fine detail: ${s.w} by ${s.h}, ${s.land} land plots`);
await page.click("[data-t='" + TERRAIN.findIndex(t => t.name === "grassland") + "']");
await page.keyboard.press("b");
await page.fill("#size", "25");
await page.dispatchEvent("#size", "input");
await drag(page, [0.12, 0.62], [0.2, 0.55]);
await page.fill("#map-name", "UI Europe bridge");
await page.screenshot({ path: `${OUT}/maker-europe.png` });

const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save")]);
const saved = await readMapFile(new Uint8Array(readFileSync(await download.path())));
const mine = await page.evaluate(async () => { const { hashBytes } = await import("/js/shared/codec.js"); return hashBytes(window.maker.map.terrain); });
const { hashBytes } = await import("../src/shared/codec.js");
check(download.suggestedFilename() === "UI-Europe-bridge.lsmap" && hashBytes(saved.map.terrain) === mine && saved.map.north === 60, `Save file downloads ${download.suggestedFilename()}, and it reads back the same map with its latitudes`);

await page.click("#publish");
await page.waitForFunction(() => /Published/.test(document.getElementById("msg").textContent), null, { timeout: 20000 });
check(true, `Publish: "${(await info(page)).msg}"`);
await page.click("#library");
const listed = await page.waitForSelector("#lib-list .map >> text=UI Europe bridge", { timeout: 10000 }).then(() => true, () => false);
check(listed, "the published map is in Saved maps");
await page.click("#lib-dialog button[value=close]");

const drafted = await page.waitForFunction(() => JSON.parse(localStorage.getItem("ls_map_draft") ?? "null")?.published, null, { timeout: 10000 }).then(() => true, () => false);
await page.reload();
await page.waitForFunction(() => window.maker?.map?.w === 820, null, { timeout: 20000 });
check(drafted && await page.inputValue("#map-name") === "UI Europe bridge", "after a reload the maker picks up the draft where it was");

await page.click("#back");
await page.waitForSelector("#world-create");
const option = await page.waitForFunction(() => [...document.querySelectorAll("#world-map option")].find(o => o.textContent.startsWith("UI Europe bridge"))?.value, null, { timeout: 10000 }).then(h => h.jsonValue());
await page.selectOption("#world-map", option);
await page.fill("#world-name", "UI saved map world");
await page.click("#world-create");
await page.waitForFunction(() => window.__ls?.game?.view && window.__ls.game.world?.ownerReady, null, { timeout: 60000 });
const game = await page.evaluate(() => ({ w: window.__ls.game.world.w, h: window.__ls.game.world.h, kind: window.__ls.game.world.map.kind }));
check(game.kind === "custom" && game.w === 820 && game.h === 500, `the host makes a world from it and plays: a ${game.kind} map of ${game.w} by ${game.h}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/maker-world.png` });
const made = await page.evaluate(() => window.__ls.game.worldId ?? null);

const phone = await openPage({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });
await login(phone, "rw_scorch", "correct horse");
await phone.goto(BASE + "/maker.html");
await phone.waitForFunction(() => window.maker?.map, null, { timeout: 20000 });
const fits = await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById("canvas").getBoundingClientRect().height > 100);
await phone.screenshot({ path: `${OUT}/maker-phone.png` });
check(fits, "on a phone in landscape the maker fits the screen with room to draw");
const tall = await openPage({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
await login(tall, "rw_scorch", "correct horse");
await tall.goto(BASE + "/maker.html");
await tall.waitForFunction(() => window.maker?.map, null, { timeout: 20000 });
const fitsTall = await tall.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById("canvas").getBoundingClientRect().height > 200);
await tall.screenshot({ path: `${OUT}/maker-phone-tall.png` });
check(fitsTall, "on a phone held upright the canvas sits above the palette");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
if (made && process.env.KEEP_WORLDS !== "1") await page.evaluate(async id => fetch(`/api/admin/worlds/${id}/delete`, { method: "POST", headers: { authorization: `Bearer ${localStorage.getItem("ls_token")}` } }), made);
await browser.close();
console.log(failures ? `${failures} checks failed` : "all checks passed");
process.exit(failures ? 1 : 0);
