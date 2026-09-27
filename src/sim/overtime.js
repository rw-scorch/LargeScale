import rules from "../../data/rules.json" with { type: "json" };

export const OVERTIME = { every: 120, perTick: 4000, ...rules.overtime };

export function installOvertime(world, opts = {}) {
  const ot = { on: false, every: opts.every ?? OVERTIME.every, perTick: opts.perTick ?? OVERTIME.perTick, clock: 0, queue: [], steps: 0 };
  world.overtime = ot;
  const tick = (w, dt) => {
    if (!ot.on) return;
    if (ot.queue.length) drain(w, ot);
    ot.clock += dt;
    if (ot.clock < ot.every) return;
    ot.clock = 0;
    ot.queue = ringOf(w);
    ot.steps++;
    w.emit("overtime_shrink", { step: ot.steps, plots: ot.queue.length / 2 });
    drain(w, ot);
  };
  tick.live = true;
  world.hooks.postTick.push(tick);
  return ot;
}

export function ringOf(world) {
  const out = [];
  for (const n of world.nations.values()) {
    if (!n.alive || !n.spawned) continue;
    for (const i of world.borderOf(n.id)) if (i !== n.capital) out.push(i, n.id);
  }
  return out;
}

function drain(world, ot) {
  for (let k = 0; k < ot.perTick && ot.queue.length; k++) {
    const nid = ot.queue.pop(), i = ot.queue.pop();
    if (world.owner[i] === nid && world.nations.get(nid)?.capital !== i) world.claim(i, 0);
  }
}
