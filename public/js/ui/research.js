import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { ERA_NAMES } from "../shared/buildings.js";
import { eraProgress, planPath } from "../shared/research.js";

const BRANCH_NAMES = { military: "Military", economy: "Economy", civic: "Civic", government: "Government" };
const EFFECT_NAMES = { research: "research", troop_cap: "troop cap", food_rate: "farm earnings", pop_growth: "population growth", defence: "defence", income: "gold income" };
const BADGE = { known: "researched", current: "in_progress", queued: "available", ready: "available", locked: "locked" };
const COL = 184, NODE_W = 156, NODE_H = 50, ROW = 60, TOP = 34, PAD = 10, LANE_GAP = 14;
const pretty = id => id.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const eta = (left, rate) => {
  if (!(rate > 0)) return "";
  const s = left / rate;
  return s < 90 ? `about ${Math.max(1, Math.round(s))} s` : s < 5400 ? `about ${Math.round(s / 60)} min` : `about ${(s / 3600).toFixed(1)} h`;
};

export function layoutTree(tree) {
  const nodes = tree.nodes, byId = new Map(nodes.map(n => [n.id, n])), depth = new Map();
  const d = id => {
    if (depth.has(id)) return depth.get(id);
    const n = byId.get(id);
    const v = n.requires.filter(r => byId.get(r)?.era === n.era && byId.get(r)?.branch !== "era").reduce((m, r) => Math.max(m, d(r) + 1), 0);
    depth.set(id, v);
    return v;
  };
  const col = new Map(), bands = [];
  let at = 0;
  for (const e of tree.eras.filter(e => nodes.some(n => n.era === e))) {
    const ns = nodes.filter(n => n.era === e && n.branch !== "era"), age = nodes.find(n => n.era === e && n.branch === "era");
    const top = Math.max(0, ...ns.map(n => d(n.id)));
    for (const n of ns) col.set(n.id, at + d(n.id));
    if (age) col.set(age.id, at + top + 1);
    bands.push({ era: e, start: at, end: at + top + (age ? 2 : 1) });
    at = bands[bands.length - 1].end;
  }
  const lanes = [], row = new Map();
  let y = TOP;
  const eraNodes = nodes.filter(n => n.branch === "era");
  lanes.push({ id: "era", name: "Eras", y, rows: 1 });
  for (const n of eraNodes) row.set(n.id, y);
  y += ROW + LANE_GAP;
  for (const b of tree.branches) {
    const cells = new Map();
    for (const n of nodes.filter(n => n.branch === b).sort((p, q) => p.cost - q.cost || p.id.localeCompare(q.id))) {
      const c = col.get(n.id);
      if (!cells.has(c)) cells.set(c, []);
      cells.get(c).push(n);
    }
    const rows = Math.max(1, ...[...cells.values()].map(l => l.length));
    for (const list of cells.values()) list.forEach((n, k) => row.set(n.id, y + k * ROW));
    lanes.push({ id: b, name: BRANCH_NAMES[b] ?? b, y, rows });
    y += rows * ROW + LANE_GAP;
  }
  const main = new Set();
  const walk = id => { if (main.has(id)) return; main.add(id); for (const r of byId.get(id)?.requires ?? []) walk(r); };
  for (const n of eraNodes) walk(n.id);
  const ends = new Set(eraNodes.map(n => n.era));
  const side = id => ends.has(byId.get(id)?.era) && !main.has(id);
  const pos = id => ({ x: PAD + col.get(id) * COL, y: row.get(id) });
  return { pos, bands, lanes, side, width: PAD * 2 + at * COL, height: y, byId };
}

export function createResearchPanel(root, game) {
  const status = el("p", { id: "research-status", class: "muted" });
  const queue = el("div", { id: "research-queue", class: "row wrap" });
  const canvas = el("div", { class: "tech-canvas" });
  const tree = el("div", { id: "tech-tree", class: "tech-tree" }, canvas);
  const detail = el("div", { id: "research-detail", class: "tech-detail" });
  const title = el("b", { class: "title", text: "Research" });
  const box = el("section", { id: "research-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleResearch(false) })),
    status, queue, el("div", { class: "tech-body" }, tree, detail));
  root.append(box);
  let picked = null, key = "", scrollTo = false, shape = null, drag = null;

  tree.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("button")) return;
    drag = { x: e.clientX, y: e.clientY, left: tree.scrollLeft, top: tree.scrollTop };
    try { tree.setPointerCapture(e.pointerId); } catch {}
    tree.classList.add("dragging");
  });
  tree.addEventListener("pointermove", e => {
    if (!drag) return;
    tree.scrollLeft = drag.left - (e.clientX - drag.x);
    tree.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const stop = () => { drag = null; tree.classList.remove("dragging"); };
  tree.addEventListener("pointerup", stop);
  tree.addEventListener("pointercancel", stop);

  const order = async (id, mode) => {
    const r = await game.conn.request({ t: "research", id, mode });
    if (!r.ok) return game.toast(r.error ?? "could not queue that");
    if (r.waiting && mode !== "remove") game.toast(`Queued. Waiting: ${r.waiting}.`);
  };

  const stateOf = (w, r, known, id) => {
    if (known.has(id)) return "known";
    if (r?.current === id) return "current";
    if (r?.queue.includes(id)) return "queued";
    return w.researchError(id) ? "locked" : "ready";
  };

  const unlockText = (w, node) => {
    const u = node.unlocks ?? {}, out = [];
    const builds = (u.buildings ?? []).map(b => w.defs.table[b]?.name ?? null).filter(Boolean);
    const later = (u.buildings ?? []).filter(b => !w.defs.table[b]).map(pretty);
    if (builds.length) out.push(`Builds: ${builds.join(", ")}`);
    if (u.zones?.length) out.push(`Zones: ${u.zones.map(z => ({ res: "homes", com: "shops", ind: "industry", farm: "farmland" })[z] ?? z).join(", ")}`);
    for (const [k, v] of Object.entries(u.effects ?? {})) out.push(`+${Math.round(v * 100)}% ${EFFECT_NAMES[k] ?? k}`);
    if (node.advances) out.push(`Moves your nation into the ${ERA_NAMES[node.advances]} era`);
    const units = (u.units ?? []).map(id => w.unitTypes.table[id]).filter(Boolean);
    const trains = units.filter(d => d.kind === "troop").map(d => d.name), machines = units.filter(d => d.kind === "machine").map(d => d.name);
    if (trains.length) out.push(`Trains: ${trains.join(", ")}`);
    if (machines.length) out.push(`Machines: ${machines.join(", ")}`);
    const laterUnits = (u.units ?? []).filter(id => !w.unitTypes.table[id]).map(pretty);
    if (later.length || laterUnits.length) out.push(`Later updates: ${[...later, ...laterUnits].join(", ")}`);
    return out;
  };

  const line = (a, b, cls) => {
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.setAttribute("class", cls);
    return p;
  };

  function draw(w, r, known, era) {
    shape ??= layoutTree(w.tech);
    const L = shape, plan = picked && !known.has(picked) ? new Set(planPath(w.locks, known, picked)) : new Set();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tech-lines");
    svg.setAttribute("width", L.width);
    svg.setAttribute("height", L.height);
    const bands = L.bands.map((b, i) => {
      const p = eraProgress(w.tech, known, b.era), here = b.era === era;
      return el("div", { class: `tech-band${i % 2 ? " alt" : ""}${here ? " here" : ""}`, "data-era": b.era, style: `left:${PAD + b.start * COL - 6}px;width:${(b.end - b.start) * COL}px;height:${L.height}px` },
        el("span", { class: "band-title" }, icon(`era_badge_${b.era}`, 1), ` ${ERA_NAMES[b.era] ?? b.era} era${here ? " (you are here)" : ""}`, el("small", { class: "muted", text: ` ${p.nodes} researched` })));
    });
    const lanes = L.lanes.map(l => el("span", { class: "tech-lane", style: `top:${l.y - 16}px`, text: l.name }));
    for (const n of w.tech.nodes) for (const q of n.requires) {
      if (!L.byId.has(q)) continue;
      const cls = known.has(n.id) ? "done" : plan.has(n.id) && (plan.has(q) || known.has(q)) ? "plan" : known.has(q) ? "open" : "";
      svg.append(line(L.pos(q), L.pos(n.id), cls));
    }
    const buttons = w.tech.nodes.map(n => {
      const st = stateOf(w, r, known, n.id), { x, y } = L.pos(n.id), side = L.side(n.id);
      const place = r.queue.indexOf(n.id);
      const sub = st === "known" ? "done" : st === "current" ? `researching, ${fmt(r.progress)} of ${n.cost}` : st === "queued" ? `queued #${place + 1}, ${n.cost} points` : `${n.cost} points`;
      const badge = n.branch === "era" ? `era_badge_${n.advances}` : `tech_${n.branch}_${BADGE[st]}`;
      return el("button", {
        class: `tech ${st}${picked === n.id ? " picked" : ""}${plan.has(n.id) ? " plan" : ""}${side ? " side" : ""}${n.branch === "era" ? " era" : ""}`,
        "data-node": n.id, style: `left:${x}px;top:${y}px;width:${NODE_W}px;height:${NODE_H}px`,
        title: side ? "Side upgrade: no era needs it" : n.branch === "era" ? "Era advance" : "",
        onclick: () => this.pick(n.id),
      }, icon(badge, 1), el("span", { class: "tech-text" }, el("b", { text: n.name }), el("span", { text: sub })));
    });
    canvas.style.width = `${L.width}px`;
    canvas.style.height = `${L.height}px`;
    canvas.replaceChildren(...bands, svg, ...lanes, ...buttons);
  }

  const api = {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; key = ""; scrollTo = on; },
    pick(id) { picked = id; key = ""; this.update(); },
    update() {
      const w = game.world, r = w?.purse?.research;
      if (box.hidden || !w || !r) return;
      const known = w.known(), era = w.purse.era;
      const cur = r.current && w.locks.nodes.get(r.current);
      title.textContent = `Research: ${ERA_NAMES[era]} era, ${r.rate} points a second`;
      status.textContent = cur ? `Working on ${cur.name}: ${fmt(r.progress)} of ${cur.cost} (${eta(cur.cost - r.progress, r.rate)})`
        : r.waiting ? `Waiting: ${r.waiting}. Points are banked meanwhile (${r.bank} of 500).`
        : `Nothing queued. Points are banked up to 500 (now ${r.bank}). Pick a node to research it.`;
      const k = JSON.stringify([r.known, r.queue, r.current, era, picked, Math.floor(r.progress / 5)]);
      if (k === key) return;
      key = k;
      queue.replaceChildren(...(r.queue.length ? [el("span", { class: "muted", text: "Queue:" })] : []), ...r.queue.map((id, i) =>
        el("button", { class: `chip${id === r.current ? " on" : ""}`, title: "remove from the queue", onclick: () => order(id, "remove") }, `${i + 1}. ${w.locks.nodes.get(id)?.name ?? id} ×`)));
      draw.call(this, w, r, known, era);
      if (scrollTo) {
        const band = shape.bands.find(b => b.era === era);
        if (band) tree.scrollLeft = Math.max(0, PAD + band.start * COL - 40);
        scrollTo = false;
      }
      const node = picked && w.locks.nodes.get(picked);
      if (!node) { detail.replaceChildren(el("p", { class: "muted", text: "Pick a node to see what it gives. Lines show what each one needs; a dashed border marks a side upgrade no era needs. Research queues everything it needs first." })); return; }
      const why = w.researchError(node.id), st = stateOf(w, r, known, node.id), plan = st === "known" ? [] : planPath(w.locks, known, node.id);
      const adds = plan.filter(id => !r.queue.includes(id));
      detail.replaceChildren(...[
        el("b", { text: `${node.name}: ${BRANCH_NAMES[node.branch] ?? "Era"}, ${ERA_NAMES[node.era]}, ${node.cost} points${L_side(node) ? ", a side upgrade" : ""}` }),
        node.requires.length ? el("p", { class: "muted", text: `Needs ${node.requires.map(q => `${w.locks.nodes.get(q)?.name ?? q}${known.has(q) ? " (done)" : ""}`).join(", ")}${node.need ? `, and ${node.need.nodes} ${ERA_NAMES[node.era]} upgrades across ${node.need.branches} branches` : ""}` }) : null,
        ...unlockText(w, node).map(t => el("p", { text: t })),
        st === "known" ? el("p", { class: "muted", text: "Already researched." }) : why ? el("p", { class: "why", id: "research-why", text: `Cannot start yet: ${why}. Queueing it adds what it needs first.` }) : null,
        adds.length > 1 || (adds.length === 1 && adds[0] !== node.id) ? el("p", { class: "muted", id: "research-plan", text: `Adding it queues ${adds.length} new: ${adds.map(id => w.locks.nodes.get(id)?.name ?? id).join(", ")}${plan.length > adds.length ? `, after ${plan.length - adds.length} already queued` : ""}. All are outlined in the tree.` }) : null,
        st === "known" ? null : el("div", { class: "row wrap" },
          el("button", { id: "research-first", class: "primary", text: "Research next", onclick: () => order(node.id, "first") }),
          el("button", { id: "research-queue-add", text: "Add to queue", onclick: () => order(node.id, "queue") }),
          r.queue.includes(node.id) ? el("button", { text: "Remove from queue", onclick: () => order(node.id, "remove") }) : null),
      ].filter(Boolean));
    },
  };
  const L_side = node => shape?.side(node.id);
  return api;
}
