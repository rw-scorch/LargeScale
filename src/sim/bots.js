import { isLand } from "../shared/terrain.js";

export const BOT = {
  thinkEvery: 5,
  sendShare: 0.35,
  minGarrisonShare: 0.5,
  speedMult: 0.4,
  attackPlayers: false,
};

export function spawnBots(world, count, rng, opts = {}) {
  const ids = [];
  const tries = opts.tries ?? 4000;
  for (let k = 0; k < count; k++) {
    const id = world.addNation({ name: opts.names?.[k] ?? `Bot ${k + 1}`, colour: opts.colour ?? "#8a8a8a", bot: true });
    for (let t = 0; t < tries; t++) {
      const x = rng.int(0, world.grid.w - 1), y = rng.int(0, world.grid.h - 1);
      if (world.canSpawnAt(x, y)) { world.spawn(id, x, y); break; }
    }
    if (!world.nations.get(id).spawned) world.nations.delete(id);
    else ids.push(id);
  }
  return ids;
}

function bestLaunchPlot(world, nid) {
  const g = world.grid;
  let best = -1, score = -1;
  for (const i of world.borderOf(nid)) {
    let s = 0;
    for (const n of g.neighbours4(i)) if (!world.owner[n] && isLand(world.terrain[n])) s++;
    if (s > score) { score = s; best = i; if (s >= 3) break; }
  }
  return score > 0 ? best : -1;
}

export function botThink(world, nid, rng, rules = BOT) {
  const n = world.nations.get(nid);
  if (!n?.alive) return null;
  const idle = [];
  for (const s of world.stacks.values()) {
    if (s.owner !== nid) continue;
    if (s.order === "advance" || s.path.length) return null;
    if (!s.engaged && world.owner[s.pos] === nid) idle.push(s.id);
  }
  for (const id of idle) world.disbandStack(id);
  const max = world.maxTroops(n);
  if (n.troops < max * rules.minGarrisonShare) return null;
  const at = bestLaunchPlot(world, nid);
  if (at < 0) return null;
  const s = world.createStack(nid, at, n.troops * rules.sendShare);
  if (!s) return null;
  s.speedMult = rules.speedMult;
  world.orderAdvance(s.id);
  return s;
}

export function installBots(world, rng, rules = BOT) {
  const baseHostile = world.hostile;
  if (!rules.attackPlayers) {
    world.hostile = (a, b) => {
      const A = world.nations.get(a), B = world.nations.get(b);
      if (A?.bot && B?.human) return false;
      return baseHostile(a, b);
    };
  }
  let order = [], cursor = 0, carry = 0;
  world.hooks.postTick.push((w, dt) => {
    if (cursor >= order.length) {
      order = [...w.nations.values()].filter(n => n.bot && n.alive).map(n => n.id);
      cursor = 0;
    }
    carry += (order.length * dt) / rules.thinkEvery;
    let k = Math.floor(carry);
    carry -= k;
    while (k-- > 0 && cursor < order.length) botThink(w, order[cursor++], rng, rules);
  });
}

export function checkVictory(world, factionOf = id => id) {
  const alive = new Set();
  let everHumans = 0;
  for (const n of world.nations.values()) {
    if (!n.human) continue;
    everHumans++;
    if (n.alive) alive.add(factionOf(n.id));
  }
  if (everHumans >= 2 && alive.size === 1) return { winner: [...alive][0] };
  if (everHumans >= 2 && alive.size === 0) return { winner: null };
  return null;
}
