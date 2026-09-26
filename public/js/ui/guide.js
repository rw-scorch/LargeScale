import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";
import { TERRAIN, isLand } from "../shared/terrain.js";
import { nodeFor } from "./town.js";

const WOODS = new Set(TERRAIN.map((t, i) => (/forest|jungle|thicket|bamboo/.test(t.name) ? i : -1)).filter(i => i >= 0));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function nearest(w, from, test, reach = 80) {
  const fx = from % w.w, fy = (from / w.w) | 0;
  for (let r = 0; r <= reach; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx += Math.abs(dy) === r ? 1 : 2 * r || 1) {
        const x = fx + dx, y = fy + dy, i = y * w.w + x;
        if (x >= 0 && y >= 0 && x < w.w && y < w.h && test(i)) return i;
      }
  return null;
}

export function createGuide(root, game) {
  const key = `ls_guide_${game.worldId}`;
  let off = store.get(key) === "off", attacked = store.get(`${key}_attack`) === "1", target = null, last = "";
  const step = el("b", { id: "guide-step" });
  const text = el("span", { id: "guide-text" });
  const fill = el("i", { class: "fill" });
  const meter = el("span", { class: "meter" }, fill);
  const hide = el("button", { id: "guide-hide", class: "ghost chip", text: "Hide", title: "hide the guide; Settings brings it back", onclick: e => { e.stopPropagation(); api.show(false); } });
  const box = el("div", { id: "guide", class: "guide", hidden: true, title: "show me where", onclick: () => target !== null && game.focus(target, Math.max(game.view.cam.scale / game.view.ratio, 6)) },
    el("div", { class: "row" }, icon("ui_help", 1), step, el("span", { class: "grow" }), hide), text, meter);
  root.append(box);

  const steps = w => {
    const n = w.nations.get(w.you), p = w.purse, cap = n?.capital;
    const mine = type => [...w.buildings.values()].some(b => b.owner === w.you && b.type === type && b.state !== "rubble");
    const goal = 200 * (w.map?.scale ?? 1) ** 2, known = w.known().size;
    const campLock = nodeFor(w, "war_camp"), woodLock = nodeFor(w, "woodcutter_camp");
    return [
      { id: "spawn", title: "Choose where to start", done: !!n?.spawned },
      { id: "land", title: "Take land", done: n?.plots >= goal, progress: [n?.plots ?? 0, goal], text: "Right-click open land beside yours and pick Take land. The Stack slider sets how many troops go.", target: () => nearest(w, cap, i => !w.owner[i] && isLand(w.terrain[i])), mark: "Right-click here" },
      { id: "homes", title: "Zone homes", done: (p?.town?.zoned?.[0] ?? 0) > 0, text: "Open Build (B), then Zones and Residential, and drag over your land next to the capital. Huts go up there.", pulse: "open-build", target: () => cap, mark: "Zone here" },
      { id: "wood", title: "Build a Woodcutter camp", done: mine("woodcutter_camp") || mine("sawmill"), text: woodLock ? `Woodcutter camps need ${woodLock.name}: queue it in Research (U).` : "Wood builds huts. Open Build (B), Resources, and place a Woodcutter camp by forest on your land.", pulse: woodLock ? "open-research" : "open-build", target: () => nearest(w, cap, i => WOODS.has(w.terrain[i]) && w.owner[i] === w.you, 40) ?? nearest(w, cap, i => WOODS.has(w.terrain[i])), mark: "Forest" },
      { id: "research", title: "Learn three techs", done: known >= 3, progress: [known, 3], text: "Research runs on its own. Open Research (U) to choose what comes next.", pulse: "open-research" },
      { id: "camp", title: "Build a War camp", done: mine("war_camp") || mine("barracks"), text: campLock ? `A War camp trains soldiers. It needs ${campLock.name}: queue it in Research (U).` : "A War camp trains soldiers from your troops: Build (B), Military. Then set what to train in Army (K).", pulse: campLock ? "open-research" : "open-build", target: () => cap, mark: "Build near here" },
      { id: "attack", title: "Attack a neighbour", done: attacked, text: "Right-click another nation's land and pick Attack. A stack forms at your nearest land and takes theirs.", target: () => nearest(w, cap, i => w.owner[i] && w.owner[i] !== w.you, 200), mark: "Right-click here" },
    ];
  };

  const api = {
    get on() { return !off; },
    show(on) {
      off = !on;
      store.set(key, off ? "off" : "on");
      last = "";
      this.update();
    },
    event(e) {
      const w = game.world;
      if (e.type === "plot_lost" && e.by === w?.you && e.nation && !attacked) { attacked = true; store.set(`${key}_attack`, "1"); }
    },
    update() {
      const w = game.world, n = w?.nations.get(w.you);
      const list = w?.ready && n?.spawned && !w.frozen && !off ? steps(w) : [];
      const at = list.findIndex(s => !s.done), s = list[at];
      for (const b of document.querySelectorAll(".act.pulse")) if (b.id !== s?.pulse) b.classList.remove("pulse");
      if (!s) {
        box.hidden = true;
        target = null;
        if (game.view) game.view.guide = null;
        if (list.length && at < 0 && !off) { off = true; store.set(key, "off"); game.toast("That is the guide done. Settings can bring it back."); }
        return;
      }
      box.hidden = false;
      if (s.pulse) document.getElementById(s.pulse)?.classList.add("pulse");
      if (s.id !== last || performance.now() - (api.at ?? 0) > 3000) { target = s.target?.() ?? null; api.at = performance.now(); last = s.id; }
      step.textContent = `${at + 1} of ${list.length}: ${s.title}${s.progress ? `, ${fmt(s.progress[0])} of ${fmt(s.progress[1])}` : ""}`;
      text.textContent = s.text;
      meter.hidden = !s.progress;
      if (s.progress) fill.style.width = `${Math.min(100, (s.progress[0] / s.progress[1]) * 100)}%`;
      if (game.view) game.view.guide = target === null ? null : { plot: target, label: s.mark };
    },
  };
  return api;
}
