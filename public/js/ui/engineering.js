import { roadLine } from "../shared/roads.js";
import { TERRAIN, isLand } from "../shared/terrain.js";

const span = s => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);
const words = s => s.replace(/_/g, " ");

export function digText(w, plot) {
  const d = w.digOf?.(plot);
  if (!d || (!d.cls && !d.road) || d.hp >= d.max && !d.job && !d.others.length) return "";
  const crew = d.job?.crew ?? 0, R = w.engRules;
  const left = crew ? `, ${span(d.hp / (R.digRate * crew))} left with ${crew} at work` : "";
  const by = d.others.length ? `, dug by ${d.others.map(j => w.nations.get(j.nation)?.name ?? "someone").join(" and ")}` : "";
  return `${d.road ? "Road: " : ""}${Math.ceil(d.hp)} of ${d.max} hit points${left}${by}.`;
}

export function createEngineering(game) {
  const w = () => game.world;
  const ask = async (m, done) => {
    const r = await game.conn.request({ t: "dig", ...m });
    if (!r.ok) return game.toast(r.error ?? "the engineers could not do that");
    game.toast(done(r));
  };
  const time = r => (r.seconds ? `, about ${span(r.seconds)}` : "");
  let tunnelFrom = null;
  const rocky = (W, i) => ["rock", "hard"].includes(W.engRules.classOf[TERRAIN[W.terrain[i]].name]);
  const tunnelItems = (W, plot, crew) => {
    if (W.lockOf?.("engineering_vehicle", "units")) return [];
    if (tunnelFrom !== null && tunnelFrom !== plot) {
      const inner = roadLine(W.w, [tunnelFrom, plot]).slice(1, -1), R = W.engRules;
      return [
        { id: "tunnel-to", label: "Tunnel to here", note: `${inner.length} plots, ${inner.length * R.tunnelCost} gold`, icon: "build_road", run: () => { const from = tunnelFrom; tunnelFrom = null; ask({ op: "tunnel", at: from, to: plot }, r => `The engineers start a tunnel of ${r.plots} plots for ${r.cost} gold${time(r)}.`); } },
        { id: "tunnel-cancel", label: "Forget the tunnel", icon: "ui_pause", run: () => { tunnelFrom = null; game.toast("No tunnel, then."); } },
      ];
    }
    const mouth = crew > 0 && W.owner[plot] === W.you && isLand(W.terrain[plot]) && !rocky(W, plot) && [plot - 1, plot + 1, plot - W.w, plot + W.w].some(j => j >= 0 && j < W.terrain.length && rocky(W, j));
    return mouth ? [{ id: "tunnel-from", label: "Start a tunnel here", icon: "build_road", run: () => { tunnelFrom = plot; game.toast("Now right-click open land on the far side of the rock: the tunnel goes in a straight line."); } }] : [];
  };

  return {
    ringFor(plot) {
      const W = w(), R = W.engRules;
      if (!R || W.lockOf?.("engineer", "units")) return [];
      const crew = W.engineersNear(plot);
      if (tunnelFrom !== null) return tunnelItems(W, plot, crew);
      if (!crew) return [];
      const d = W.digOf(plot), o = W.owner[plot], items = [];
      if (d.job) items.push({ id: "dig-stop", label: d.job.kind === "dig" ? "Stop digging" : "Stop building", icon: "ui_pause", run: () => ask({ op: "cancel", at: plot }, () => "The engineers stop work there.") });
      const open = !o || o === W.you || W.canAttack(W.you, o);
      if (open && (d.road || (d.cls && d.name !== "rubble")) && d.job?.kind !== "build") {
        if (!d.job) items.push({ id: "dig", label: d.road ? "Cut the road" : "Dig here", note: `${Math.ceil(d.hp)} hp, ${span(d.hp / (R.digRate * crew))}`, icon: "build_hammer", run: () => ask({ op: "dig", at: plot }, r => `${crew} ${crew === 1 ? "engineer starts" : "engineers start"} on the ${r.target === "road" ? "road" : words(r.target)}${time(r)}.`) });
        items.push({ id: "charge", label: "Set a charge", note: `${R.chargeCost} gold`, icon: "ui_blast_radius", run: () => ask({ op: "charge", at: plot }, r => `A charge goes off: ${R.blastPower} damage${time(r)}.`) });
      }
      if (!d.job && (!o || o === W.you)) {
        for (const [id, r] of Object.entries(R.recipes)) {
          if (!r.from.includes(d.name) || (r.ownerOnly && o !== W.you)) continue;
          items.push({ id: `build-${id}`, label: r.name, note: `${r.cost} gold`, icon: "build_road", run: () => ask({ op: "build", at: plot, recipe: id }, x => `The engineers start a ${r.name.toLowerCase()} for ${x.cost} gold${time(x)}.`) });
        }
        if (d.dug && d.dug !== d.name) items.push({ id: "build-restore", label: `Restore the ${words(d.dug)}`, icon: "build_road", run: () => ask({ op: "build", at: plot, recipe: "restore" }, x => `The engineers rebuild the ${words(d.dug)} for ${x.cost} gold${time(x)}.`) });
      }
      return [...items, ...tunnelItems(W, plot, crew)];
    },
    get tunnelFrom() { return tunnelFrom; },
  };
}
