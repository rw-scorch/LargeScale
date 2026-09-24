import { Atlas } from "./atlas.js";
import { MapRenderer } from "./renderer.js";
import { makeTestMap } from "../../../shared/testmap.js";
import { TERRAIN } from "../../../shared/terrain.js";
import { makeRng } from "../../../shared/rng.js";
import { World } from "../../03-nations-territory/example/territory.js";
import { spawnBots, installBots } from "../../04-combat-bots/example/bots.js";

const ROAD = { dirt: 1, cobble: 2, paved: 3, highway: 4 };

function findSpawn(world, cx, cy) {
  for (let r = 0; r < 60; r++)
    for (let a = 0; a < 16; a++) {
      const x = Math.round(cx + Math.cos(a * 0.39) * r), y = Math.round(cy + Math.sin(a * 0.39) * r);
      if (world.canSpawnAt(x, y)) {
        let ok = true;
        for (let dy = -6; dy <= 6 && ok; dy++) for (let dx = -8; dx <= 8 && ok; dx++) {
          const t = TERRAIN[world.terrain[world.grid.idx(x + dx, y + dy)]];
          if (!t || !t.build) ok = false;
        }
        if (ok) return [x, y];
      }
    }
  return null;
}

function buildCity(world, state, nid, cx, cy, road, kinds, rng) {
  const g = world.grid, used = state.used;
  const free = i => world.owner[i] === nid && TERRAIN[world.terrain[i]].build && !used[i];
  const lay = i => { if (free(i)) { state.roads[i] = road; used[i] = 1; } };
  for (let x = cx - 9; x <= cx + 9; x++) { lay(g.idx(x, cy)); lay(g.idx(x, cy - 5)); lay(g.idx(x, cy + 5)); }
  for (let y = cy - 8; y <= cy + 8; y++) { lay(g.idx(cx, y)); lay(g.idx(cx - 7, y)); lay(g.idx(cx + 7, y)); }
  const spots = [];
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 9; x <= cx + 9; x++) spots.push(g.idx(x, y));
  spots.sort((a, b) => g.dist(a, g.idx(cx, cy)) - g.dist(b, g.idx(cx, cy)) || a - b);
  let k = 0;
  for (const at of spots) {
    const type = kinds[k % kinds.length];
    const sp = state.atlas.get(type);
    if (!sp) { k++; continue; }
    const [fw, fh] = sp.footprint.map(Math.round);
    const plots = [];
    for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) plots.push(g.idx(g.x(at) + dx, g.y(at) + dy));
    if (g.x(at) + fw > g.w || !plots.every(free)) continue;
    const nearRoad = plots.some(i => g.neighbours4(i).some(n => state.roads[n]));
    if (!nearRoad) continue;
    plots.forEach(i => (used[i] = 1));
    state.buildings.push({ id: state.buildings.length + 1, type, anchor: at, owner: nid, state: rng.chance(0.06) ? "construction" : "active" });
    k++;
  }
}

function farms(world, state, nid, cx, cy, rng) {
  const g = world.grid, crops = ["crop_wheat_3", "crop_wheat_2", "crop_corn_3", "crop_vegetables_2", "crop_potatoes_3"];
  for (let y = cy + 9; y <= cy + 12; y++) for (let x = cx - 9; x <= cx + 2; x++) {
    const i = g.idx(x, y);
    if (world.owner[i] !== nid || state.used[i] || TERRAIN[world.terrain[i]].fertility < 0.5) continue;
    state.used[i] = 1;
    state.buildings.push({ id: state.buildings.length + 1, type: crops[(x >> 2) % crops.length], anchor: i, owner: nid });
  }
}

function findWater(world, cx, cy) {
  const g = world.grid;
  for (let r = 3; r < 80; r++) for (let a = 0; a < 24; a++) {
    const x = Math.round(cx + Math.cos(a * 0.26) * r), y = Math.round(cy + Math.sin(a * 0.26) * r);
    if (g.inside(x, y) && TERRAIN[world.terrain[g.idx(x, y)]].water === "open") return [x, y];
  }
  return [cx, cy];
}

export async function makeDemo(pack) {
  const atlas = await new Atlas(pack).load();
  const map = makeTestMap(320, 200, 5);
  const world = new World(map, { spawnRadius: 12, spawnMinGap: 30, advanceRadius: 20, advanceRate: 12 });
  const rng = makeRng(21);
  const A = world.addNation({ name: "Aoraki", colour: "#4f8fe0" });
  const B = world.addNation({ name: "Kerevo", colour: "#d94a3a" });
  const pa = findSpawn(world, 110, 100), pb = findSpawn(world, 210, 95);
  world.spawn(A, ...pa);
  world.spawn(B, ...pb);
  spawnBots(world, 4, rng, { colour: "#9a9a9a" });
  installBots(world, rng, { thinkEvery: 3, sendShare: 0.5, minGarrisonShare: 0.2, speedMult: 1, attackPlayers: false });
  for (const nid of [A, B]) world.nations.get(nid).troops = 4000;
  for (let t = 0; t < 400; t++) {
    if (t % 40 === 0) for (const nid of [A, B]) {
      const n = world.nations.get(nid);
      const s = world.createStack(nid, n.capital, Math.min(n.troops * 0.5, 900));
      if (s) world.orderAdvance(s.id);
    }
    world.tick(1);
  }
  for (const s of [...world.stacks.values()]) world.disbandStack(s.id);
  const state = {
    w: map.w, h: map.h, terrain: map.terrain, owner: world.owner, atlas,
    nations: world.nations, roads: new Uint8Array(map.w * map.h), used: new Uint8Array(map.w * map.h),
    buildings: [], units: [], markers: [], animated: { wind_turbine: ["wind_turbine", "wind_turbine_1", "wind_turbine_2"] },
  };
  world.nations.get(A).era = "Mo";
  world.nations.get(B).era = "M";
  buildCity(world, state, A, pa[0], pa[1], ROAD.paved, ["skyscraper_a", "office_mid", "apartment_block", "supermarket", "skyscraper_c", "high_rise", "cafe", "hospital", "shop", "house_suburban", "luxury_hotel", "fast_food", "bank_modern", "police_station", "house_suburban", "wind_turbine", "villa", "park", "gas_station", "house_suburban"], rng);
  buildCity(world, state, B, pb[0], pb[1], ROAD.cobble, ["keep", "cottage_timber", "tavern", "cottage_stone", "bakery", "townhouse", "inn", "market_stall", "farmhouse", "great_hall", "cottage_timber", "barracks", "stable", "cottage_stone", "grain_windmill", "forge", "tower_stone", "trading_post"], rng);
  farms(world, state, B, pb[0], pb[1], rng);
  farms(world, state, A, pa[0], pa[1], rng);
  const [wx, wy] = findWater(world, pa[0], pa[1]);
  state.units.push(
    { sprite: "rifleman_e_idle", frames: ["soldier_e_walk1", "soldier_e_idle", "soldier_e_walk2", "soldier_e_idle"], x: pa[0] + 3.5, y: pa[1] + 2.5, owner: A, vx: 0.5 },
    { sprite: "soldier_s_idle", frames: ["soldier_s_walk1", "soldier_s_idle", "soldier_s_walk2", "soldier_s_idle"], x: pa[0] + 1.5, y: pa[1] - 2.5, owner: A, vy: 0.4 },
    { sprite: "main_battle_tank", x: pa[0] + 10.5, y: pa[1] + 0.5, owner: A, vx: 0.8 },
    { sprite: "knight_e_idle", frames: ["knight_e_walk1", "knight_e_idle", "knight_e_walk2", "knight_e_idle"], x: pb[0] - 3.5, y: pb[1] + 2.5, owner: B, vx: -0.6, flip: true },
    { sprite: "pikeman_s_idle", frames: ["pikeman_s_walk1", "pikeman_s_idle", "pikeman_s_walk2", "pikeman_s_idle"], x: pb[0] + 2.5, y: pb[1] + 3.5, owner: B, vy: 0.3 },
    { sprite: "destroyer", x: wx + 0.5, y: wy + 0.5, owner: A, vx: 0.3 },
    { sprite: "jet_fighter", x: pa[0] - 12, y: pa[1] - 10, owner: A, vx: 3, air: true },
  );
  state.markers.push(
    { x: pa[0] + 14.5, y: pa[1] - 3.5, owner: A, troops: 1840, era: "Mo", state: "selected" },
    { x: pb[0] - 12.5, y: pb[1] + 1.5, owner: B, troops: 960, era: "M", state: "moving" },
  );
  return { atlas, world, state, cities: { A: pa, B: pb } };
}

export function stepUnits(state, dt) {
  for (const u of state.units) {
    u.x += (u.vx ?? 0) * dt;
    u.y += (u.vy ?? 0) * dt;
    u.t = (u.t ?? 0) + dt;
    if (u.t > 8) { u.vx = -(u.vx ?? 0); u.vy = -(u.vy ?? 0); u.t = 0; if (u.vx) u.flip = u.vx < 0; }
  }
}

export { MapRenderer };
