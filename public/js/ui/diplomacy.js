import { el, armed } from "./dom.js";
import { icon } from "./icons.js";

const clock = s => {
  s = Math.max(0, Math.ceil(s));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  return s >= 120 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const KIND = { peace: "peace", alliance: "an alliance", non_aggression: "a non-aggression treaty" };
const kindText = p => (p.kind === "non_aggression" ? `a non-aggression treaty for ${p.minutes} minutes` : KIND[p.kind] ?? p.kind);

export function relationIcon(rel) {
  return { war: "dip_war", war_pending: "dip_declare", alliance: "dip_alliance" }[rel.status] ?? (rel.treaty ? "dip_treaty" : rel.status === "peace" ? "dip_peace" : null);
}

export function relationText(rel, speed = 1) {
  const real = s => clock(s / (speed || 1));
  const main = rel.status === "war" ? "At war"
    : rel.status === "war_pending" ? `War in ${real(rel.startsIn)}`
    : rel.status === "alliance" ? "Allied"
    : rel.status === "peace" ? (rel.treaty ? `Treaty, ${real(rel.treaty)} left` : "At peace")
    : rel.status === "open" ? "Bot: no declaration needed" : "";
  const extra = [rel.embargoes ? "you embargo them" : "", rel.embargoed ? "they embargo you" : "", rel.cooldown && rel.status !== "war" && rel.status !== "war_pending" ? `no war for ${real(rel.cooldown)}` : ""].filter(Boolean);
  return extra.length ? `${main}; ${extra.join("; ")}` : main;
}

export function createDiplomacyPanel(root, game) {
  const intro = el("p", { id: "dip-intro", class: "muted" });
  const offers = el("div", { id: "dip-proposals", class: "dip-list" });
  const rows = el("div", { id: "dip-players", class: "dip-list" });
  const box = el("section", { id: "diplomacy-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title" }, icon("dip_alliance", 1), " Diplomacy"), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleDiplomacy(false) })),
    intro, offers, rows);
  root.append(box);
  let sig = "", focus = null;
  const live = new Map();

  const ask = async (m, done) => {
    const r = await game.conn.request({ t: "diplo", ...m });
    if (!r.ok) return game.toast(r.error ?? "that did not work");
    game.toast(typeof done === "function" ? done(r) : done);
    sig = "";
    game.updatePanels();
  };
  const nameOf = id => game.world.nations.get(id)?.name ?? "them";

  const actions = (n, rel) => {
    const to = n.id, war = rel.status === "war" || rel.status === "war_pending";
    const out = [];
    if (rel.status === "peace") {
      out.push(armed("Declare war", `Sure? War in ${clock((game.world.dipRules?.warNotice ?? 300) / (game.world.speed || 1))}`, () => ask({ op: "war", to }, r => `You declared war on ${n.name}. It starts in ${clock((r.starts - game.world.simNow()) / (game.world.speed || 1))}.`), { class: "dip-war", "data-op": "war" }));
      if (rel.treaty) out.push(armed("Break treaty", `Sure? No war for ${clock((game.world.dipRules?.betrayalCooldown ?? 900) / (game.world.speed || 1))} after`, () => ask({ op: "break", to }, `You broke your treaty with ${n.name}.`), { "data-op": "break" }));
      out.push(el("button", { "data-op": "alliance", text: "Propose alliance", onclick: () => ask({ op: "propose", to, kind: "alliance" }, r => (r.signed ? `You are now allied with ${n.name}.` : `Alliance proposed to ${n.name}.`)) }));
      const minutes = el("select", { class: "dip-minutes", title: "how long the treaty lasts" }, ...(game.world.dipRules?.treatyMinutes ?? [30, 60, 120, 240]).map(m => el("option", { value: m, text: m >= 60 ? `${m / 60} h` : `${m} min` })));
      minutes.value = "60";
      out.push(el("span", { class: "row tight" }, el("button", { "data-op": "treaty", text: "Propose treaty", onclick: () => ask({ op: "propose", to, kind: "non_aggression", minutes: Number(minutes.value) }, r => (r.signed ? `Treaty signed with ${n.name}.` : `Treaty proposed to ${n.name}.`)) }), minutes));
    }
    if (war) {
      const young = rel.status === "war" && game.world.simNow() - rel.since < (game.world.dipRules?.peaceMinWar ?? 600);
      out.push(el("button", { "data-op": "peace", text: "Propose peace", disabled: young, title: young ? `peace talks open once the war is ${clock((game.world.dipRules?.peaceMinWar ?? 600) / (game.world.speed || 1))} old` : null, onclick: () => ask({ op: "propose", to, kind: "peace" }, r => (r.signed ? `Peace signed with ${n.name}.` : `Peace proposed to ${n.name}.`)) }));
    }
    if (rel.status === "alliance") out.push(armed("Leave alliance", "Sure? Troops in their land come home", () => ask({ op: "leave", to }, `You left your alliance with ${n.name}.`), { "data-op": "leave" }));
    out.push(el("button", { "data-op": "embargo", class: rel.embargoes ? "on" : "", text: rel.embargoes ? "Lift embargo" : "Embargo", title: "an embargo closes your land to their troops and stops trade between you", onclick: () => ask({ op: "embargo", to, on: !rel.embargoes }, r => (r.on ? `Embargo on ${n.name}.` : `Embargo on ${n.name} lifted.`)) }));
    return out;
  };

  return {
    get open() { return !box.hidden; },
    show(on, nation = null) { box.hidden = !on; focus = nation; sig = ""; if (on) this.update(); },
    update() {
      if (box.hidden) return;
      const w = game.world;
      if (!w?.dip) { intro.textContent = "Diplomacy is not running in this world."; rows.replaceChildren(); offers.replaceChildren(); return; }
      const me = w.nations.get(w.you), speed = w.speed || 1;
      const players = [...w.nations.values()].filter(n => !n.bot && n.id !== w.you && n.spawned).sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || a.name.localeCompare(b.name));
      const rels = new Map(players.map(n => [n.id, w.relation(w.you, n.id)]));
      const ph = w.schedule?.peaceUntil && w.serverNow() < w.schedule.peaceUntil;
      const next = JSON.stringify([w.dipVersion, players.map(n => [n.id, n.alive, w.online?.has(n.id), rels.get(n.id).status, !!rels.get(n.id).treaty, !!rels.get(n.id).cooldown, rels.get(n.id).status === "war" && w.simNow() - rels.get(n.id).since < (w.dipRules?.peaceMinWar ?? 600)]), me?.alive, ph, focus]);
      if (next !== sig) {
        sig = next;
        live.clear();
        intro.textContent = `Players start at peace. A declared war starts ${clock((w.dipRules?.warNotice ?? 300) / speed)} after it is declared, and nobody can attack before. Bots need no declaration.${ph ? " The scheduled peace period is still on: no attack lands until it ends." : ""}`;
        const mine = w.dip.proposals.filter(p => p.to === w.you), sent = w.dip.proposals.filter(p => p.from === w.you);
        offers.replaceChildren(...(mine.length || sent.length ? [el("b", { text: "Proposals" })] : []),
          ...mine.map(p => el("div", { class: "dip-offer", "data-proposal": p.id }, icon(p.kind === "peace" ? "dip_peace" : p.kind === "alliance" ? "dip_alliance" : "dip_treaty", 1),
            el("span", { text: `${nameOf(p.from)} proposes ${kindText(p)}.` }),
            el("button", { class: "primary", "data-op": "accept", text: "Accept", onclick: () => ask({ op: "accept", id: p.id }, r => `${KIND[r.signed] ? `${KIND[r.signed][0].toUpperCase()}${KIND[r.signed].slice(1)}` : "Agreement"} signed with ${nameOf(r.with)}.`) }),
            el("button", { "data-op": "decline", text: "Decline", onclick: () => ask({ op: "decline", id: p.id }, "Declined.") }))),
          ...sent.map(p => el("div", { class: "dip-offer sent", "data-proposal": p.id }, el("span", { class: "muted", text: `You proposed ${kindText(p)} to ${nameOf(p.to)}.` }),
            el("button", { class: "ghost", "data-op": "withdraw", text: "Withdraw", onclick: () => ask({ op: "withdraw", id: p.id }, "Withdrawn.") }))));
        rows.replaceChildren(...(players.length ? [] : [el("p", { class: "muted", text: "No other players have spawned yet." })]), ...players.map(n => {
          const rel = rels.get(n.id), text = el("span", { class: "dip-status" }), ic = relationIcon(rel);
          live.set(n.id, text);
          return el("div", { class: `dip-row ${n.alive ? "" : "dead"} ${focus === n.id ? "focus" : ""} rel-${rel.status}`, "data-nation": n.id },
            el("div", { class: "row" }, el("i", { class: "swatch", style: `background:${n.colour}` }), el("b", { text: n.name }), el("i", { class: `dot ${w.online?.has(n.id) ? "on" : "off"}`, title: w.online?.has(n.id) ? "online now" : "away" }), ic ? icon(ic, 1) : null, text),
            n.alive && me?.alive && !w.frozen ? el("div", { class: "row wrap dip-actions" }, ...actions(n, rel)) : el("span", { class: "muted", text: n.alive ? "" : "Eliminated" }));
        }));
        if (focus !== null) rows.querySelector(`[data-nation="${focus}"]`)?.scrollIntoView({ block: "nearest" });
      }
      for (const [id, span] of live) span.textContent = relationText(w.relation(w.you, id), speed);
    },
  };
}
