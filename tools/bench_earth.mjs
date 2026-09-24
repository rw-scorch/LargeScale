import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { World } from "../src/sim/territory.js";
import { installCombat } from "../src/sim/combat.js";
import { installBots, spawnBots } from "../src/sim/bots.js";
import { makeRng } from "../src/shared/rng.js";

const { values: a } = parseArgs({ options: {
  bots: { type: "string", default: "200" },
  players: { type: "string", default: "8" },
  ticks: { type: "string", default: "80" },
  budget: { type: "string", default: "50" },
  map: { type: "string", default: "public/map" },
}});

const meta = JSON.parse(readFileSync(`${a.map}/meta.json`, "utf8"));
const terrain = new Uint8Array(readFileSync(`${a.map}/terrain.bin`));
const w = new World({ w: meta.w, h: meta.h, terrain });
const rng = makeRng(1);
installCombat(w);

let t = performance.now();
const bots = spawnBots(w, Number(a.bots), rng);
installBots(w, rng);
const players = [];
for (let k = 0; k < Number(a.players); k++) {
  const id = w.addNation({ name: `P${k + 1}` });
  for (let tries = 0; tries < 4000 && !w.nations.get(id).spawned; tries++) w.spawn(id, rng.int(0, meta.w - 1), rng.int(0, meta.h - 1));
  players.push(id);
}
const setup = performance.now() - t;
for (const n of w.nations.values()) n.troops = w.maxTroops(n);
for (const id of players) {
  const n = w.nations.get(id);
  if (!n.spawned) continue;
  const s = w.createStack(id, n.capital, n.troops * 0.5);
  if (s) w.orderAdvance(s.id);
}

const times = [];
for (let i = 0; i < Number(a.ticks); i++) {
  const s = performance.now();
  w.tick(0.25);
  w.takeDirty();
  w.events.length = 0;
  times.push(performance.now() - s);
}
times.sort((x, y) => x - y);
const worst = times.at(-1), p50 = times[times.length >> 1], p99 = times[Math.floor(times.length * 0.99)];
let runs = 1;
for (let i = 1; i < w.owner.length; i++) if (w.owner[i] !== w.owner[i - 1]) runs++;

const report = {
  map: `${meta.w}x${meta.h}`,
  bots: bots.length,
  players: players.filter(id => w.nations.get(id).spawned).length,
  setupMs: Math.round(setup),
  tickMs: { p50: +p50.toFixed(1), p99: +p99.toFixed(1), worst: +worst.toFixed(1) },
  budgetMs: Number(a.budget),
  ownerRuns: runs,
  rssMB: Math.round(process.memoryUsage().rss / 1e6),
};
console.log(JSON.stringify(report, null, 2));
if (worst > Number(a.budget)) {
  console.error(`FAIL: worst tick ${worst.toFixed(1)} ms is over the ${a.budget} ms budget`);
  process.exit(1);
}
console.log("PASS");
