import { el, fmt } from "./dom.js";
import { icon } from "./icons.js";

const clock = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;
const span = s => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const an = s => (/^[aeiou]/i.test(s) ? `an ${lower(s)}` : `a ${lower(s)}`);

export function nukeText(w, kind) {
  const W = w.nukeRules?.warheads?.[kind], k = w.nukeRules?.scale ?? 1;
  if (W?.conventional) return `Companies within ${W.radius * k} plots lose ${Math.round(W.loss * 100)}% of their troops and buildings are damaged. No land is cleared.`;
  const only = W?.shieldOnly ? " Only shields can stop it." : "";
  return W ? `Everything within ${W.inner * k} plots is flattened and its land cleared, capitals apart; out to ${W.radius * k} plots, companies lose ${Math.round((w.nukeRules.outerLoss ?? 0.6) * 100)}% and buildings are damaged.${only}` : "";
}

export function createNukePanel(top, game) {
  const alert = el("div", { id: "nuke-alert", class: "nuke-alert", hidden: true });
  top.append(alert);
  const text = el("span", { id: "silo-info", class: "muted" });
  const buttons = el("div", { id: "silo-actions", class: "row wrap" });
  const silo = el("div", { id: "building-silo", class: "col", hidden: true }, text, buttons);
  const rows = new Map();
  let aim = null, key = "";

  const w = () => game.world;
  const W = kind => w().nukeRules?.warheads?.[kind];
  const name = id => (id === w().you ? "you" : w().nations.get(id)?.name ?? "someone");
  const speed = () => w().speed || 1;
  const ask = m => game.conn.request({ t: "nuke", ...m });

  const cancel = () => {
    aim = null;
    key = "";
    if (game.view) game.view.nukeAim = null;
  };

  const build = async (b, kind) => {
    const r = await ask({ op: "build", silo: b.id, kind });
    if (!r.ok) return game.toast(r.error ?? "could not build it");
    game.toast(`Building ${an(W(kind).name)} for ${fmt(r.cost)} gold.`);
    key = "";
  };

  const takeApart = async b => {
    const r = await ask({ op: "cancel", silo: b.id });
    if (!r.ok) return game.toast(r.error ?? "could not take it apart");
    game.toast(`Warhead taken apart. Refunded ${fmt(r.refund)} gold.`);
    key = "";
  };

  const nuclear = kind => W(kind) && !W(kind).conventional && !W(kind).shieldOnly;
  const readySilos = () => [...w().buildings.values()].filter(b => b.owner === w().you && b.def?.silo && b.state === "active" && w().siloOf(b.id)?.ready && nuclear(w().siloOf(b.id).kind));
  const salvoOf = () => (aim?.silos?.length > 1 ? { silos: aim.silos } : {});
  const recheck = async () => {
    if (!aim?.plot && aim?.plot !== 0) return;
    const r = await ask({ op: "check", silo: aim.silo, at: aim.plot, ...salvoOf() });
    if (!aim) return;
    if (!r.ok) { game.toast(r.error ?? "you cannot aim there"); return; }
    aim = { ...aim, check: r, sure: false };
    if (game.view) game.view.nukeAim = { plot: aim.plot, radius: r.radius, inner: r.inner };
    key = "";
  };
  const together = on => {
    if (!aim) return;
    const max = w().nukeRules?.salvoMax ?? 12, others = readySilos().filter(b => b.id !== aim.silo).map(b => b.id);
    aim = { ...aim, silos: on ? [aim.silo, ...others].slice(0, max) : null, check: aim.check, sure: false };
    key = "";
    recheck();
  };

  const pick = async plot => {
    if (!aim) return;
    const r = await ask({ op: "check", silo: aim.silo, at: plot, ...salvoOf() });
    if (!aim) return;
    if (!r.ok) return game.toast(r.error ?? "you cannot aim there");
    aim = { silo: aim.silo, silos: aim.silos ?? null, plot, check: r, sure: false };
    if (game.view) game.view.nukeAim = { plot, radius: r.radius, inner: r.inner };
    key = "";
  };

  const launch = async () => {
    if (!aim?.check) return;
    if (!aim.sure) { aim.sure = true; key = ""; game.updatePanels(); return; }
    const { silo: id, plot } = aim, more = salvoOf();
    cancel();
    const r = await ask({ op: "launch", silo: id, at: plot, ...more });
    if (!r.ok) return game.toast(r.error ?? "the launch failed");
    game.toast(r.count > 1 ? `A salvo of ${r.count} warheads launched together. Impact in ${span(r.seconds / speed())}: one blast ${Math.round(r.radius * 2)} plots across if they all get through.` : `Launched. Impact in ${span(r.seconds / speed())}.`);
  };

  const updateAlert = () => {
    const you = w()?.you, list = (w()?.nukes ?? []).filter(f => !f.conventional || f.nation === you || f.toward === you);
    alert.hidden = !list.length;
    for (const [id, row] of rows) if (!list.some(f => f.id === id)) { row.el.remove(); rows.delete(id); }
    if (!list.length) return;
    const now = w().simNow();
    for (const f of list) {
      let row = rows.get(f.id);
      if (!row) {
        const line = el("span");
        row = { el: el("div", { class: `nuke-row${f.toward === w().you ? " danger" : ""}`, "data-nuke": f.id }, icon("alert_nuke"), line, el("button", { class: "ghost", text: "Show", onclick: () => game.focus(f.target, 12) })), line };
        rows.set(f.id, row);
        alert.append(row.el);
      }
      const left = Math.max(0, Math.ceil((f.due - now) / speed())), who = f.nation === w().you ? "You" : name(f.nation);
      const what = f.count > 1 ? `a salvo of ${f.count - (f.shot ?? 0)} warheads` : an(W(f.kind)?.name ?? "warhead");
      const t = `${who} launched ${what} at ${f.toward === w().you ? "your" : `${name(f.toward)}'s`} land. Impact in ${clock(left)}.`;
      if (row.line.textContent !== t) row.line.textContent = t;
    }
  };

  return {
    silo,
    get choosing() { return aim !== null; },
    get aiming() { return aim; },
    pick,
    cancel,
    update() {
      if (!w()?.ready) return;
      updateAlert();
      const b = w().buildings.get(game.selectedBuilding);
      if (aim && b?.id !== aim.silo) cancel();
      if (!b?.def?.silo || b.owner !== w().you) { silo.hidden = true; key = ""; return; }
      silo.hidden = false;
      const st = w().siloOf(b.id), money = w().purse?.money ?? 0, on = w().info?.nukes !== false, known = w().known();
      const kinds = b.def.silo.warheads.filter(k => W(k) && (on || W(k).conventional));
      const lockOf = k => (W(k).needs && !known.has(W(k).needs) ? `needs ${w().locks.nodes.get(W(k).needs)?.name ?? W(k).needs}` : null);
      const k = JSON.stringify([b.id, b.state, st, aim, on, w().frozen, readySilos().length, kinds.map(k => [lockOf(k), money >= W(k).cost])]);
      if (k === key) return;
      key = k;
      const off = !on && !kinds.length ? "Nuclear weapons are off in this world." : w().frozen ? "The world has ended." : b.state !== "active" ? `The silo is ${b.state === "construction" ? "still being built" : b.state}: a warhead is only built or launched from a working silo.` : null;
      const refund = st && W(st.kind) ? `refunds ${fmt(W(st.kind).cost)} gold` : "";
      if (off) {
        text.textContent = st ? `${off} It holds ${an(W(st.kind).name)}${st.ready ? "" : ", half built"}.` : off;
        buttons.replaceChildren();
        return;
      }
      if (!st) {
        text.textContent = `Empty. Pick a missile to build; the gold is paid now.${on ? "" : " Nuclear weapons are off in this world, but cruise missiles still fly."}`;
        buttons.replaceChildren(...kinds.map(kind => {
          const lock = lockOf(kind), short = money < W(kind).cost;
          return el("button", { "data-warhead": kind, disabled: !!lock || short, title: lock ?? (short ? `you have ${fmt(money)} gold` : nukeText(w(), kind)), onclick: () => build(b, kind) }, `${W(kind).name}: ${fmt(W(kind).cost)} gold, ${span(W(kind).time)}`);
        }));
        return;
      }
      if (!st.ready) {
        text.textContent = `Building ${an(W(st.kind).name)}: ${span(st.left)} left.`;
        buttons.replaceChildren(el("button", { id: "silo-cancel", text: "Take apart", title: refund, onclick: () => takeApart(b) }));
        return;
      }
      if (!aim) {
        text.textContent = `${W(st.kind).name} ready. ${nukeText(w(), st.kind)}`;
        buttons.replaceChildren(
          el("button", { id: "silo-aim", class: "danger", text: "Aim and launch", onclick: () => { cancel(); aim = { silo: b.id, plot: null, check: null, sure: false }; key = ""; } }),
          el("button", { id: "silo-cancel", text: "Take apart", title: refund, onclick: () => takeApart(b) }));
        return;
      }
      const others = readySilos().filter(o => o.id !== b.id).length, joined = aim.silos?.length > 1;
      const salvoButton = others ? el("button", { id: "silo-salvo", class: joined ? "on" : "", title: "Fire the other ready silos at the same spot. Their blasts merge into one: the areas add up.", onclick: () => together(!joined) }, joined ? `Salvo of ${aim.silos.length}: fire this one alone` : `Fire with ${others} more ${others === 1 ? "silo" : "silos"}`) : null;
      if (!aim.check) {
        text.textContent = `Click enemy land to aim at. The circles show the blast. Esc cancels.${joined ? ` ${aim.silos.length} silos fire together as one blast.` : ""}`;
        buttons.replaceChildren(...[salvoButton, el("button", { text: "Cancel", onclick: cancel })].filter(Boolean));
        return;
      }
      const c = aim.check;
      const salvo = c.count > 1 ? `A salvo of ${c.count} warheads lands as one blast ${Math.round(c.radius * 2)} plots across${c.capped ? " (the most a blast can reach)" : ""}, if all get through; each one shot down makes it smaller. ` : "";
      text.textContent = `${salvo}Target: ${name(c.owner)}'s land. It lands ${span(c.flight / speed())} after launch, and ${c.conventional ? "they see" : "everyone sees"} it coming. Chance ${c.count > 1 ? "each warhead" : "it"} is shot down: ${Math.round(c.chance * 100)}%${c.defences ? `, from ${c.defences} ${c.defences === 1 ? "defence" : "defences"} in reach` : ""}. Click elsewhere to aim again.`;
      buttons.replaceChildren(...[
        el("button", { id: "silo-launch", class: "danger", text: aim.sure ? "Sure? Launch now" : c.count > 1 ? `Launch all ${c.count}` : "Launch", onclick: launch }),
        salvoButton,
        el("button", { text: "Cancel", onclick: cancel })].filter(Boolean));
    },
  };
}
