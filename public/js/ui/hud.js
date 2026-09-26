import { el, fmt } from "./dom.js";
import { keyTag } from "./stack.js";
import { icon } from "./icons.js";

const STATUS = { online: "Online", connecting: "Connecting", reconnecting: "Reconnecting", waiting: "Offline", replaced: "Opened elsewhere", outdated: "Needs reload", closed: "Closed", removed: "Removed", deleted: "Deleted" };
const RES_ICON = { gold: "res_money", concrete: "res_stone" };
const title = s => s[0].toUpperCase() + s.slice(1);

export const rate = v => (Math.abs(v) < 0.05 ? "" : `${v > 0 ? "+" : "-"}${Math.abs(v) >= 10 ? fmt(Math.abs(v)) : Math.abs(v).toFixed(1)}/s`);

export function clockOf(world) {
  const day = (world.seasonRules?.dayLengthMinutes ?? 60) * 60, t = world.time ?? 0;
  const hour = Math.floor(((t % day) / day) * 24);
  return `Day ${Math.floor(t / day) + 1}, ${String(hour).padStart(2, "0")}:00`;
}

function chip(key, value, change, hint) {
  const r = rate(change);
  return el("span", { class: "res", "data-res": key, title: `${hint ?? key}${r ? `, ${r.replace("/s", " a second")}` : ""}` },
    icon(RES_ICON[key] ?? `res_${key}`, 1), el("b", { text: fmt(value) }), r ? el("small", { class: change < 0 ? "down" : "up", text: r }) : null);
}

export function createHud(root, game) {
  const cols = { left: el("div", { id: "left-col", class: "col" }), side: el("div", { id: "side", class: "col" }), top: el("div", { id: "top-mid", class: "col" }) };

  const dot = el("span", { class: "dot" });
  const status = el("span", { id: "status-text" });
  const worldName = el("b", { class: "world-name", text: game.name });
  const speed = el("span", { id: "world-speed", class: "badge", hidden: true });
  const clock = el("span", { id: "world-clock" });
  const season = el("span", { id: "world-season" });
  const pill = el("header", { id: "status-pill", class: "pill" }, worldName, speed, clock, season, el("span", { class: "status" }, dot, status));

  const iconButton = (id, ic, hint, onclick, extra = {}) => el("button", { id, class: "icon-btn", title: hint, "aria-label": hint, onclick, ...extra }, typeof ic === "string" ? icon(ic, 1.5) : ic);
  const admin = game.admin ? iconButton("open-admin", "ui_dev", "Admin panel (`)", () => game.toggleAdmin()) : null;
  const full = document.fullscreenEnabled ? iconButton("full-screen", el("i", { class: "fs-mark" }), "Full screen", () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})) : null;
  const corner = el("nav", { id: "corner", class: "icons" },
    iconButton("go-home", "ui_flag", "Your capital (H)", () => game.home()),
    iconButton("go-map", "ui_map", "Whole map", () => game.fit()),
    iconButton("zoom-out", "ui_zoom_out", "Zoom out (-)", () => game.zoom(1 / 1.6)),
    iconButton("zoom-in", "ui_zoom_in", "Zoom in (+)", () => game.zoom(1.6)),
    full,
    iconButton("open-settings", "ui_settings", "Settings: keys and display", () => game.toggleSettings()),
    admin,
    iconButton("leave-world", "ui_close", "Leave this world and go back to the world list", () => game.leave()));

  const swatch = el("i", { class: "swatch" });
  const mine = el("span", { id: "my-nation" });
  const plots = el("span", { class: "muted" });
  const troops = el("b", { id: "my-troops" });
  const troopRate = el("small", { class: "up" });
  const fill = el("i", { class: "fill" });
  const purse = el("div", { id: "purse", class: "res-list" });
  const share = el("input", { id: "stack-share", type: "range", min: 10, max: 100, step: 5, value: 30, title: "share of your troops at home that a new stack takes" });
  const shareLabel = el("span", { class: "muted" });
  const form = el("button", { id: "form-stack", class: "primary", onclick: () => game.togglePlacing() }, "Form stack", " ", keyTag("form"));
  const control = el("section", { id: "control", class: "panel" },
    el("div", { class: "row spread" }, el("span", { class: "row" }, swatch, mine), plots),
    el("div", { class: "troops", title: "troops at home against your cap, and how fast they grow" }, icon("res_troops", 1), troops, troopRate, el("span", { class: "meter" }, fill)),
    purse,
    el("div", { class: "row stackform" }, el("label", { for: "stack-share", class: "muted", text: "Stack" }), share, shareLabel, form));
  cols.left.append(control);

  const action = (id, ic, label, key, onclick) => {
    const text = el("span", { class: "label", text: label });
    const b = el("button", { id, class: "act", title: `${label} (${keyTag(key).textContent})`, onclick }, icon(ic, 2), text, keyTag(key), el("i", { class: "prog", hidden: true }), el("i", { class: "alert", hidden: true }));
    b.label = text;
    return b;
  };
  const build = action("open-build", "build_hammer", "Build", "build", () => game.toggleBuildMenu());
  const town = action("open-town", "res_population", "Town", "town", () => game.toggleTown());
  const research = action("open-research", "res_research", "Research", "research", () => game.toggleResearch());
  const upgrade = action("open-upgrade", "upg_upgrade", "Upgrade", "upgrade", () => game.toggleUpgrade());
  const army = action("open-army", "ui_army", "Army", "army", () => game.toggleArmy());
  const deposits = action("show-deposits", "ui_map_resources", "Deposits", "deposits", () => game.toggleDeposits());
  const bar = el("nav", { id: "action-bar", class: "panel" }, build, town, research, upgrade, army, deposits);

  const placeHint = el("div", { id: "place-hint", class: "banner", hidden: true }, "Click your own land to place the stack. ", el("span", { class: "fine-only", text: "Or point and press F. " }), "Esc cancels.");
  const buildHint = el("div", { id: "build-hint", class: "banner", hidden: true });
  cols.top.append(pill, placeHint, buildHint);
  root.append(cols.left, cols.side, cols.top, corner, bar);

  const readShare = () => Number(share.value) / 100;
  return {
    cols,
    update() {
      const c = game.conn, w = game.world;
      dot.className = `dot ${c.status}`;
      status.textContent = STATUS[c.status] ?? c.status;
      worldName.textContent = game.name;
      speed.hidden = !(w?.speed > 1);
      speed.textContent = `${w?.speed ?? 1}x`;
      clock.textContent = w?.ready ? clockOf(w) : "";
      const p = w?.purse;
      season.hidden = !p?.season;
      season.textContent = p?.season ? title(p.season) : "";
      admin?.classList.toggle("on", !!game.adminPanel?.open);
      corner.querySelector("#open-settings").classList.toggle("on", !!game.settings?.open);

      const n = w?.nations.get(w.you), v = p?.vitals;
      swatch.style.background = n?.colour ?? "transparent";
      mine.textContent = n?.name ?? "";
      plots.textContent = n?.spawned ? `${fmt(n.plots)} plots` : n ? "not placed yet" : "";
      troops.textContent = n?.spawned ? (v ? `${fmt(n.troops)} / ${fmt(v.cap)}` : fmt(n.troops)) : "-";
      troopRate.textContent = v ? (v.grow ? rate(v.grow) : "full") : "";
      fill.style.width = v?.cap ? `${Math.min(100, (n.troops / v.cap) * 100)}%` : "0";
      const stock = p ? Object.entries(p.stock).filter(([k, x]) => x > 0 || k === "food" || k === "wood") : [];
      const list = p ? [["gold", p.money, v?.income ?? 0], ...(p.town ? [["population", p.town.pop, 0, "people"]] : []), ...stock.map(([k, x]) => [k, x, (p.making?.[k] ?? 0) - (k === "food" ? p.town?.foodUse ?? 0 : 0)])] : [];
      const sig = list.map(([k, x, r]) => `${k}${fmt(x)}${rate(r)}`).join();
      if (purse.dataset.sig !== sig) { purse.dataset.sig = sig; purse.replaceChildren(...list.map(a => chip(...a))); }
      shareLabel.textContent = `${share.value}%${n?.spawned ? ` (${fmt(n.troops * readShare())})` : ""}`;
      form.disabled = !n?.spawned || !n.alive || w.frozen;
      form.classList.toggle("on", !!game.placing);

      build.disabled = form.disabled || !p;
      build.classList.toggle("on", !!game.buildMenu?.open);
      town.disabled = !p;
      town.classList.toggle("on", !!game.town?.open);
      const rs = p?.research, cur = rs?.current && w.locks.nodes.get(rs.current);
      research.disabled = !rs;
      research.classList.toggle("on", !!game.research?.open);
      const prog = research.querySelector(".prog");
      prog.hidden = !cur;
      if (cur) prog.style.width = `${Math.floor((rs.progress / cur.cost) * 100)}%`;
      research.querySelector(".alert").hidden = !(rs && !rs.queue.length);
      research.title = cur ? `Research: ${cur.name}, ${Math.floor((rs.progress / cur.cost) * 100)}% (U)` : rs && !rs.queue.length ? "Research: nothing queued (U)" : "Research (U)";
      upgrade.disabled = !p || !n?.spawned;
      upgrade.classList.toggle("on", !!game.upgrade?.open);
      army.disabled = !p?.army || !n?.spawned;
      army.classList.toggle("on", !!game.army?.open);
      deposits.classList.toggle("on", !!game.view?.showDeposits);

      placeHint.hidden = !game.placing;
      const def = game.building && w?.defs.table[game.building];
      buildHint.hidden = !def;
      if (def) buildHint.textContent = `Placing ${def.name}. Click to build, tap twice on touch. Right-click or Esc stops.`;
      else if (game.zoning) { buildHint.hidden = false; buildHint.textContent = `${game.zoning === "none" ? "Erasing zones" : "Zoning"}: drag over your land. Right-click or Esc stops.`; }
    },
    get share() { return readShare(); },
  };
}
