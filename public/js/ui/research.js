import { el, fmt } from "./dom.js";
import { ERA_NAMES } from "../shared/buildings.js";
import { eraProgress } from "../shared/research.js";

const BRANCH_NAMES = { military: "Military", economy: "Economy", civic: "Civic", government: "Government" };
const EFFECT_NAMES = { research: "research", troop_cap: "troop cap", wood_rate: "wood output", food_rate: "food output", pop_growth: "population growth", defence: "defence" };
const pretty = id => id.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const eta = (left, rate) => {
  if (!(rate > 0)) return "";
  const s = left / rate;
  return s < 90 ? `about ${Math.max(1, Math.round(s))} s` : s < 5400 ? `about ${Math.round(s / 60)} min` : `about ${(s / 3600).toFixed(1)} h`;
};

export function createResearchPanel(root, game) {
  const status = el("p", { id: "research-status", class: "muted" });
  const queue = el("div", { id: "research-queue", class: "row wrap" });
  const grid = el("div", { class: "tech-rows" });
  const detail = el("div", { id: "research-detail", class: "tech-detail" });
  const title = el("b", { class: "title", text: "Research" });
  const box = el("section", { id: "research-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, title, el("button", { class: "ghost", text: "Close", onclick: () => game.toggleResearch(false) })),
    status, queue, grid, detail);
  root.append(box);
  let picked = null, key = "";

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
    if (later.length || u.units?.length) out.push(`Later updates: ${[...later, ...(u.units ?? []).map(pretty)].join(", ")}`);
    return out;
  };

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; key = ""; },
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
      const k = JSON.stringify([r.known, r.queue, r.current, era, picked]);
      if (k === key) return;
      key = k;
      queue.replaceChildren(...(r.queue.length ? [el("span", { class: "muted", text: "Queue:" })] : []), ...r.queue.map((id, i) =>
        el("button", { class: `chip${id === r.current ? " on" : ""}`, title: "remove from the queue", onclick: () => order(id, "remove") }, `${i + 1}. ${w.locks.nodes.get(id)?.name ?? id} ×`)));
      const eras = w.tech.eras.filter(e => w.tech.nodes.some(n => n.era === e));
      grid.replaceChildren(...eras.map(e => {
        const nodes = w.tech.nodes.filter(n => n.era === e);
        const p = eraProgress(w.tech, known, e);
        const cols = w.tech.branches.map(b => el("div", { class: "tech-col" },
          el("span", { class: "muted", text: BRANCH_NAMES[b] ?? b }),
          ...nodes.filter(n => n.branch === b).sort((x, y) => x.cost - y.cost).map(n => {
            const st = stateOf(w, r, known, n.id);
            return el("button", { class: `tech ${st}${picked === n.id ? " picked" : ""}`, "data-node": n.id, onclick: () => this.pick(n.id) },
              el("b", { text: n.name }), el("span", { text: st === "known" ? "done" : st === "current" ? "researching" : st === "queued" ? `queued, ${n.cost}` : `${n.cost} points` }));
          })));
        const ages = nodes.filter(n => n.branch === "era").map(n => {
          const st = stateOf(w, r, known, n.id);
          return el("button", { class: `tech era ${st}${picked === n.id ? " picked" : ""}`, "data-node": n.id, onclick: () => this.pick(n.id) },
            el("b", { text: n.name }), el("span", { text: st === "known" ? "done" : `${n.cost} points, needs ${n.need.nodes} upgrades across ${n.need.branches} branches (${p.nodes} across ${p.branches} so far)` }));
        });
        return el("div", { class: "tech-era" }, el("b", { text: `${ERA_NAMES[e]} era` }), el("div", { class: "tech-grid" }, ...cols), ...ages);
      }));
      const node = picked && w.locks.nodes.get(picked);
      if (!node) { detail.replaceChildren(el("p", { class: "muted", text: "Pick a node to see what it gives. Research queues what it needs first." })); return; }
      const why = w.researchError(node.id), st = stateOf(w, r, known, node.id);
      detail.replaceChildren(...[
        el("b", { text: `${node.name}: ${BRANCH_NAMES[node.branch] ?? "Era"}, ${ERA_NAMES[node.era]}, ${node.cost} points` }),
        node.requires.length ? el("p", { class: "muted", text: `Needs ${node.requires.map(q => `${w.locks.nodes.get(q)?.name ?? q}${known.has(q) ? " (done)" : ""}`).join(", ")}` }) : null,
        ...unlockText(w, node).map(t => el("p", { text: t })),
        st === "known" ? el("p", { class: "muted", text: "Already researched." }) : why ? el("p", { class: "why", id: "research-why", text: `Cannot start yet: ${why}.` }) : null,
        st === "known" ? null : el("div", { class: "row wrap" },
          el("button", { id: "research-first", class: "primary", text: "Research next", onclick: () => order(node.id, "first") }),
          el("button", { id: "research-queue-add", text: "Add to queue", onclick: () => order(node.id, "queue") }),
          r.queue.includes(node.id) ? el("button", { text: "Remove from queue", onclick: () => order(node.id, "remove") }) : null),
      ].filter(Boolean));
    },
  };
}
