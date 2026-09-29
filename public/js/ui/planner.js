import { el, fmt } from "./dom.js";
import { keyTag } from "./stack.js";
import { proposePlan, piecePlots, PLAN_KINDS } from "../shared/planner.js";

const KIND_NAMES = { towns: "Towns", economy: "Economy", civic: "Civic and upgrades", defence: "Defence" };
const PIECE_WORDS = { build: ["building", "buildings"], zone: ["zone", "zones"], road: ["road", "roads"], poles: ["pole line", "pole lines"], upgrade: ["upgrade", "upgrades"] };
const minutes = s => (s < 90 ? `${Math.max(1, Math.round(s))} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

function drawOf(w, piece) {
  const t = piece.t === "poles" ? "pole" : piece.t;
  return { t, zone: piece.zone, type: piece.type, plots: piecePlots({ w: w.w, h: w.h, defs: w.defs.table, buildings: [...w.buildings.values()] }, piece) };
}

export function createPlannerPanel(root, game) {
  const summary = el("p", { id: "planner-summary", class: "muted" });
  const all = el("button", { id: "planner-all", class: "primary", text: "Build all" });
  const refresh = el("button", { id: "planner-refresh", text: "Look again", onclick: () => replan(true) });
  const keep = el("button", { id: "planner-keep", class: "chip", text: "Keep land clear", onclick: () => game.toggleKeepClear() });
  const body = el("div", { id: "planner-list", class: "planner-list" });
  const queue = el("div", { id: "planner-queue", class: "planner-queue" });
  const box = el("section", { id: "planner-panel", class: "panel card", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title" }, "Planner ", keyTag("plan")), el("button", { class: "ghost", text: "Close", onclick: () => game.togglePlanner(false) })),
    summary, el("div", { class: "row wrap" }, all, refresh, keep), body, queue);
  root.append(box);

  const store = `ls_plan_skip:${game.worldId}`;
  let skip = new Set();
  try { skip = new Set(JSON.parse(localStorage.getItem(store) ?? "[]")); } catch {}
  const saveSkip = () => { try { localStorage.setItem(store, JSON.stringify([...skip].slice(-200))); } catch {} };
  let list = [], at = -Infinity, sig = "", qsig = "", hover = null, sending = false, queueKey = null;

  function paint() {
    const v = game.view, w = game.world;
    if (!v || !w) return;
    if (box.hidden) { v.plan = null; return; }
    const queued = (w.planQueue ?? []).map(q => ({ key: q.key, queued: true, draw: q.pieces.map(p => drawOf(w, p)) }));
    v.plan = { items: [...list.map(p => ({ key: p.key, queued: false, draw: p.draw })), ...queued], hover, keep: w.purse?.plan?.keep ?? [] };
    for (const e of body.querySelectorAll(".plan-item")) e.classList.toggle("on", e.dataset.key === hover);
  }

  function replan(force = false) {
    const w = game.world;
    if (!w?.ready || !w.purse || !w.terrain) return;
    if (!force && performance.now() - at < 5000) return;
    at = performance.now();
    list = proposePlan(w.planView({ skip }), w.planRules ?? {});
    game.planMs = Math.round(performance.now() - at);
    sig = "";
    paint();
  }

  async function approve(projects) {
    if (sending || !projects.length) return;
    sending = true;
    let queued = 0;
    for (const p of projects) {
      const r = await game.conn.request({ t: "plan", op: "add", project: { key: p.key, kind: p.kind, name: p.title, pieces: p.pieces } });
      if (!r.ok) { game.toast(`Not queued: ${r.error}.`); break; }
      queued++;
    }
    sending = false;
    if (queued) game.toast(queued === 1 ? `Queued: ${projects[0].title}. It builds as gold comes in.` : `Queued ${queued} projects. They build in order as gold comes in.`);
    list = list.filter(p => !projects.some(q => q.key === p.key));
    sig = "";
    paint();
  }
  all.onclick = () => approve(list);

  const show = p => {
    hover = p.key;
    paint();
    if (p.at != null) game.focus(p.at, Math.max(game.view.cam.scale / game.view.ratio, 6));
  };
  const item = p => {
    const counts = {};
    for (const q of p.pieces) counts[q.t] = (counts[q.t] ?? 0) + (q.t === "upgrade" ? q.ids.length : 1);
    const parts = Object.entries(counts).map(([t, n]) => `${n} ${PIECE_WORDS[t][n === 1 ? 0 : 1]}`).join(", ");
    return el("div", { class: "plan-item", "data-key": p.key, onpointerenter: () => { hover = p.key; paint(); }, onpointerleave: () => { if (hover === p.key) { hover = null; paint(); } } },
      el("div", { class: "row spread" }, el("b", { text: p.title }), el("span", { class: "plan-cost", text: p.price ? `${fmt(p.price)} gold` : "free" })),
      el("span", { class: "muted", text: `${p.reason} (${parts})` }),
      el("div", { class: "row" },
        el("button", { class: "primary chip plan-build", text: "Build", onclick: () => approve([p]) }),
        el("button", { class: "chip", text: "Show", onclick: () => show(p) }),
        el("button", { class: "chip", text: "Skip", title: "stop proposing this", onclick: () => { skip.add(p.key); saveSkip(); list = list.filter(q => q !== p); sig = ""; paint(); } })));
  };

  function renderList() {
    const w = game.world, income = w.purse?.vitals?.income ?? 0, total = list.reduce((s, p) => s + p.price, 0);
    summary.textContent = list.length
      ? `${list.length} ${list.length === 1 ? "project" : "projects"} proposed, ${fmt(total)} gold in all${income > 0 ? `: about ${minutes(total / income)} of your income` : ""}. Nothing is built until you press Build.`
      : "Nothing to propose right now. The planner looks again as your nation grows.";
    all.disabled = !list.length || sending;
    all.textContent = list.length ? `Build all (${fmt(total)} gold)` : "Build all";
    body.replaceChildren(...PLAN_KINDS.filter(k => list.some(p => p.kind === k)).map(k => {
      const mine = list.filter(p => p.kind === k), price = mine.reduce((s, p) => s + p.price, 0);
      return el("div", { class: "plan-section" },
        el("div", { class: "row spread" }, el("b", { text: KIND_NAMES[k] }), el("button", { class: "chip", text: `Build these (${fmt(price)})`, onclick: () => approve(mine) })),
        ...mine.map(item));
    }));
  }

  function renderQueue() {
    const w = game.world, p = w.purse?.plan, rows = p?.projects ?? [], kept = p?.keep ?? [];
    const left = rows.reduce((s, r) => s + r[3], 0);
    queue.replaceChildren(
      el("b", { text: "Queue" }),
      rows.length ? el("span", { class: "muted", id: "planner-why", text: `${rows.length} ${rows.length === 1 ? "project" : "projects"}, ${left} ${left === 1 ? "piece" : "pieces"} left. ${p.why ? `${p.why[0].toUpperCase()}${p.why.slice(1)}.` : "Building."}` }) : el("span", { class: "muted", text: "Nothing queued." }),
      ...rows.map(([key, name, , n, done, dropped]) => el("div", { class: "row spread plan-queued" },
        el("span", { text: `${name}: ${done} of ${n + done} done${dropped ? `, ${dropped} dropped` : ""}` }),
        el("button", { class: "chip", text: "Cancel", onclick: async () => { const r = await game.conn.request({ t: "plan", op: "cancel", key }); if (!r.ok) game.toast(r.error); } }))),
      ...(kept.length ? [el("b", { text: "Kept clear" }), ...kept.map((r, k) => el("div", { class: "row spread plan-kept" },
        el("span", { text: `${r[2]} by ${r[3]} plots at ${r[0]}, ${r[1]}` }),
        el("button", { class: "chip", text: "Free it", onclick: () => game.conn.request({ t: "plan", op: "keep", rects: kept.filter((_, j) => j !== k) }).then(() => replan(true)) })))] : []));
  }

  return {
    get open() { return !box.hidden; },
    get proposals() { return list; },
    show(on) {
      box.hidden = !on;
      if (on) replan(true);
      else { hover = null; paint(); }
    },
    replan,
    update() {
      if (box.hidden) return;
      const w = game.world;
      if (!w?.purse) return;
      const qk = JSON.stringify(w.planQueue?.map(q => [q.key, q.pieces.length]) ?? []);
      if (qk !== queueKey) { queueKey = qk; replan(true); } else replan(false);
      keep.classList.toggle("on", game.zoning === "keep");
      const s = JSON.stringify([list.map(p => p.key), sending, Math.round(w.purse.vitals?.income ?? 0)]);
      if (s !== sig) { sig = s; renderList(); paint(); }
      const q = JSON.stringify(w.purse.plan ?? null);
      if (q !== qsig) { qsig = q; renderQueue(); paint(); }
    },
  };
}
