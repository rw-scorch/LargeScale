import { TERRAIN, TID } from "../shared/terrain.js";

export const DEPOSITS = {
  stone: { terrains: ["hills", "highlands", "mountain"], chance: 0.012, amount: [3000, 8000], vein: [3, 8] },
  clay: { terrains: ["river", "marsh", "grassland", "plains"], chance: 0.004, amount: [2000, 6000], vein: [2, 6] },
  iron: { terrains: ["hills", "highlands", "mountain"], chance: 0.004, amount: [1500, 5000], vein: [2, 6] },
  copper: { terrains: ["hills", "highlands", "desert"], chance: 0.003, amount: [1200, 4000], vein: [2, 5] },
  tin: { terrains: ["hills", "highlands"], chance: 0.0015, amount: [800, 2500], vein: [1, 4] },
  coal: { terrains: ["hills", "forest", "pine_forest", "highlands"], chance: 0.004, amount: [3000, 9000], vein: [3, 8] },
  gold: { terrains: ["mountain", "hills", "river"], chance: 0.0008, amount: [300, 1200], vein: [1, 3] },
  silver: { terrains: ["mountain", "hills"], chance: 0.0008, amount: [400, 1500], vein: [1, 3] },
  gems: { terrains: ["mountain", "jungle"], chance: 0.0004, amount: [100, 500], vein: [1, 2] },
  oil: { terrains: ["desert", "steppe", "tundra", "shallows"], chance: 0.002, amount: [5000, 20000], vein: [2, 7] },
  gas: { terrains: ["desert", "steppe", "shallows", "tundra"], chance: 0.0015, amount: [5000, 15000], vein: [2, 5] },
  uranium: { terrains: ["desert", "mountain", "tundra"], chance: 0.0004, amount: [300, 1200], vein: [1, 3] },
  bauxite: { terrains: ["savanna", "jungle"], chance: 0.0015, amount: [2000, 6000], vein: [2, 5] },
  lithium: { terrains: ["salt_flat", "desert"], chance: 0.003, amount: [800, 3000], vein: [1, 4] },
  sulfur: { terrains: ["volcano", "mountain"], chance: 0.004, amount: [800, 2500], vein: [1, 3] },
  salt: { terrains: ["salt_flat", "beach"], chance: 0.006, amount: [4000, 9000], vein: [2, 6] },
  fish: { terrains: ["shallows", "coral_reef", "lake"], chance: 0.02, amount: [Infinity, Infinity], vein: [2, 6], renewable: true },
};
export const DEPOSIT_IDS = Object.keys(DEPOSITS);

export const PRODUCERS = {
  quarry: { deposit: "stone", out: "stone", rate: 0.25, workers: 10 },
  clay_pit: { deposit: "clay", out: "clay", rate: 0.2, workers: 6 },
  mine_pit: { deposit: ["iron", "copper", "tin", "coal", "gold", "silver", "gems"], rate: 0.12, workers: 12 },
  mine_shaft: { deposit: ["iron", "copper", "tin", "coal", "gold", "silver", "gems", "uranium", "bauxite", "sulfur"], rate: 0.4, workers: 30 },
  mine_openpit: { deposit: ["iron", "copper", "coal", "bauxite", "lithium"], rate: 1.2, workers: 60, radius: 1 },
  oil_derrick: { deposit: "oil", out: "oil", rate: 0.3, workers: 8 },
  pumpjack: { deposit: "oil", out: "oil", rate: 0.6, workers: 4 },
  gas_plant: { deposit: "gas", out: "gas", rate: 0.8, workers: 10 },
  fishing_hut: { deposit: "fish", out: "food", rate: 0.05, workers: 3, radius: 2 },
  fishing_dock: { deposit: "fish", out: "food", rate: 0.12, workers: 6, radius: 2 },
  woodcutter_camp: { forest: true, out: "wood", rate: 0.15, workers: 4, radius: 3 },
  sawmill: { forest: true, out: "wood", rate: 0.45, workers: 10, radius: 4 },
  field: { farm: true, out: "food", rate: 0.04, workers: 1 },
  pasture_sheep: { pasture: true, out: "food", rate: 0.02, workers: 1 },
  pasture_cattle: { pasture: true, out: "food", rate: 0.03, workers: 1 },
};

export const SEASON_YIELD = { spring: 0.8, summer: 1.2, autumn: 1.0, winter: 0.2, dry: 0.6 };
export const FOREST_WOOD = 250;

export function generateDeposits(map, rng, table = DEPOSITS) {
  const size = map.w * map.h;
  const type = new Uint8Array(size);
  const amount = new Float32Array(size);
  const ids = Object.keys(table);
  for (let i = 0; i < size; i++) {
    if (type[i]) continue;
    const tname = TERRAIN[map.terrain[i]].name;
    for (let k = 0; k < ids.length; k++) {
      const d = table[ids[k]];
      if (!d.terrains.includes(tname) || !rng.chance(d.chance)) continue;
      const n = rng.int(d.vein[0], d.vein[1]);
      let cur = i;
      for (let v = 0; v < n; v++) {
        if (!type[cur] && d.terrains.includes(TERRAIN[map.terrain[cur]].name)) {
          type[cur] = k + 1;
          amount[cur] = d.amount[0] === Infinity ? Infinity : rng.int(d.amount[0], d.amount[1]) / n;
        }
        const x = cur % map.w, y = (cur / map.w) | 0;
        const dir = rng.int(0, 3);
        const nx = Math.min(map.w - 1, Math.max(0, x + [0, 1, 0, -1][dir]));
        const ny = Math.min(map.h - 1, Math.max(0, y + [-1, 0, 1, 0][dir]));
        cur = ny * map.w + nx;
      }
      break;
    }
  }
  return { type, amount, ids };
}

export function installResources(world, deposits, getSeason = () => "summer") {
  const res = {
    dep: deposits,
    wood: new Float32Array(world.grid.size),
    producers: new Map(),
    nextP: 1,
    getSeason,
  };
  for (let i = 0; i < world.grid.size; i++) if (TERRAIN[world.terrain[i]].forest) res.wood[i] = FOREST_WOOD;
  world.res = res;
  return res;
}

function inRadius(world, at, r) {
  const g = world.grid, x0 = g.x(at), y0 = g.y(at), out = [];
  for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if (g.inside(x, y)) out.push([(x - x0) ** 2 + (y - y0) ** 2, g.idx(x, y)]);
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out.map(v => v[1]);
}

export function canPlaceProducer(world, nid, type, at) {
  const p = PRODUCERS[type], res = world.res;
  if (world.owner[at] !== nid) return "not your land";
  if (p.deposit) {
    const wanted = [].concat(p.deposit);
    const near = inRadius(world, at, p.radius ?? 0).filter(i => res.dep.type[i] && wanted.includes(res.dep.ids[res.dep.type[i] - 1]) && res.dep.amount[i] > 0);
    if (!near.length) return "needs a deposit";
  }
  if (p.forest && !inRadius(world, at, p.radius).some(i => res.wood[i] > 0)) return "needs forest nearby";
  if (p.farm && TERRAIN[world.terrain[at]].fertility <= 0.1) return "soil too poor";
  if (p.pasture && !["grassland", "plains", "meadow", "steppe", "savanna"].includes(TERRAIN[world.terrain[at]].name)) return "needs grassland";
  return null;
}

export function addProducer(world, nid, type, at) {
  const why = canPlaceProducer(world, nid, type, at);
  if (why) return { error: why };
  const p = { id: world.res.nextP++, type, owner: nid, at, level: 1, idle: false, made: 0 };
  world.res.producers.set(p.id, p);
  return p;
}

export function produce(world, dt) {
  const res = world.res, out = new Map();
  const season = res.getSeason();
  for (const p of res.producers.values()) {
    if (world.owner[p.at] !== p.owner) continue;
    const d = PRODUCERS[p.type];
    let want = d.rate * p.level * dt * (p.workforce ?? 1);
    let got = 0, kind = d.out;
    if (d.deposit) {
      const wanted = [].concat(d.deposit);
      const cells = inRadius(world, p.at, d.radius ?? 0).filter(i => res.dep.type[i] && wanted.includes(res.dep.ids[res.dep.type[i] - 1]) && res.dep.amount[i] > 0);
      for (const i of cells) {
        if (want <= 0) break;
        kind ??= res.dep.ids[res.dep.type[i] - 1];
        if (d.out && kind !== d.out) kind = d.out;
        const take = Math.min(want, res.dep.amount[i]);
        if (res.dep.amount[i] !== Infinity) res.dep.amount[i] -= take;
        want -= take; got += take;
        if (res.dep.amount[i] <= 0) world.emit("deposit_depleted", { at: i, kind: res.dep.ids[res.dep.type[i] - 1] });
      }
      if (!kind) kind = [].concat(d.deposit)[0];
    } else if (d.forest) {
      for (const i of inRadius(world, p.at, d.radius)) {
        if (want <= 0) break;
        if (res.wood[i] <= 0) continue;
        const take = Math.min(want, res.wood[i]);
        res.wood[i] -= take; want -= take; got += take;
        if (res.wood[i] <= 0) { world.terrain[i] = TID.cleared; world.dirty.add(i); world.emit("forest_cleared", { at: i }); }
      }
    } else if (d.farm) {
      got = want * TERRAIN[world.terrain[p.at]].fertility * (SEASON_YIELD[season] ?? 1) * (p.weatherMult ?? 1);
    } else if (d.pasture) {
      got = want * (season === "winter" ? 0.5 : 1);
    }
    p.idle = got <= 1e-9;
    p.made += got;
    if (got > 0) {
      if (!out.has(p.owner)) out.set(p.owner, {});
      const o = out.get(p.owner);
      o[kind] = (o[kind] ?? 0) + got;
    }
  }
  return out;
}

export function regrowForests(world, dt, rng, chancePerMinute = 0.002) {
  const res = world.res, g = world.grid;
  const p = chancePerMinute * dt / 60;
  for (let i = 0; i < g.size; i++) {
    if (world.terrain[i] !== TID.cleared || world.owner[i]) continue;
    if (!g.neighbours4(i).some(n => res.wood[n] > FOREST_WOOD * 0.5)) continue;
    if (rng.chance(p)) { world.terrain[i] = TID.forest; res.wood[i] = FOREST_WOOD * 0.3; world.dirty.add(i); }
  }
}
