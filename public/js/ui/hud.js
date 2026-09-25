import { el, fmt } from "./dom.js";
import { keyTag } from "./stack.js";

const STATUS = { online: "Online", connecting: "Connecting", reconnecting: "Reconnecting", waiting: "Offline", replaced: "Opened elsewhere", outdated: "Needs reload", closed: "Closed", removed: "Removed", deleted: "Deleted" };

export function createHud(root, game) {
  const dot = el("span", { class: "dot" });
  const status = el("span", { id: "status-text" });
  const mine = el("span", { id: "my-nation", class: "muted" });
  const worldName = el("b", { class: "world-name", text: game.name });
  const speed = el("span", { id: "world-speed", class: "badge", hidden: true });
  const admin = game.admin ? el("button", { id: "open-admin", onclick: () => game.toggleAdmin() }, "Admin", " ", keyTag("admin")) : null;
  const purse = el("span", { id: "purse" });
  const build = el("button", { id: "open-build", onclick: () => game.toggleBuildMenu() }, "Build", " ", keyTag("build"));
  const town = el("button", { id: "open-town", onclick: () => game.toggleTown() }, "Town", " ", keyTag("town"));
  const research = el("button", { id: "open-research", onclick: () => game.toggleResearch() }, "Research", " ", keyTag("research"));
  const upgrade = el("button", { id: "open-upgrade", onclick: () => game.toggleUpgrade() }, "Upgrade", " ", keyTag("upgrade"));
  const deposits = el("button", { id: "show-deposits", title: "deposits at mid zoom (R)", onclick: () => game.toggleDeposits() }, "Deposits", " ", keyTag("deposits"));
  const share = el("input", { id: "stack-share", type: "range", min: 10, max: 100, step: 5, value: 30, title: "share of your garrison" });
  const shareLabel = el("span", { class: "muted", text: "30%" });
  share.oninput = () => (shareLabel.textContent = `${share.value}%`);
  const form = el("button", { id: "form-stack", class: "primary", onclick: () => game.togglePlacing() }, "Form stack", " ", keyTag("form"));
  const placeHint = el("div", { id: "place-hint", class: "banner", hidden: true }, "Click your own land to place the stack. ", el("span", { class: "fine-only", text: "Or point and press F. " }), "Esc cancels.");
  const buildHint = el("div", { id: "build-hint", class: "banner", hidden: true });
  const bar = el("header", { class: "hud" },
    el("button", { id: "leave-world", title: "leave this world and go back to the world list", text: "Exit", onclick: () => game.leave() }),
    worldName,
    speed,
    el("span", { class: "status" }, dot, status),
    mine,
    purse,
    el("span", { class: "grow" }),
    build,
    town,
    research,
    upgrade,
    deposits,
    admin,
    el("span", { class: "stackform" }, share, shareLabel, form),
    el("span", { class: "zoom" },
      el("button", { title: "zoom out (-)", text: "-", onclick: () => game.zoom(1 / 1.6) }),
      el("button", { title: "zoom in (+)", text: "+", onclick: () => game.zoom(1.6) }),
      el("button", { title: "whole map", text: "Map", onclick: () => game.fit() }),
      el("button", { title: "your capital (H)", onclick: () => game.home() }, "Home", " ", keyTag("home"))));
  root.append(bar, placeHint, buildHint);

  return {
    update() {
      const c = game.conn;
      dot.className = `dot ${c.status}`;
      status.textContent = STATUS[c.status] ?? c.status;
      worldName.textContent = game.name;
      speed.hidden = !(game.world?.speed > 1);
      speed.textContent = `${game.world?.speed ?? 1}x speed`;
      admin?.classList.toggle("on", !!game.adminPanel?.open);
      const n = game.world?.nations.get(game.world.you);
      mine.textContent = n?.spawned ? `${fmt(n.plots)} plots, ${fmt(n.troops)} troops` : n ? "not placed yet" : "";
      form.disabled = !n?.spawned || !n.alive || game.world.frozen;
      const p = game.world?.purse;
      purse.textContent = p ? [...(p.season ? [p.season[0].toUpperCase() + p.season.slice(1)] : []), ...(p.town ? [`${fmt(p.town.pop)} people`] : []), `${fmt(p.money)} gold`, ...Object.entries(p.stock).filter(([k, v]) => v > 0 || k === "food" || k === "wood").map(([k, v]) => `${fmt(v)} ${k}`)].join(", ") : "";
      build.disabled = form.disabled || !p;
      build.classList.toggle("on", !!game.buildMenu?.open);
      town.disabled = !p;
      research.disabled = !p?.research;
      research.classList.toggle("on", !!game.research?.open);
      upgrade.disabled = !p || !n?.spawned;
      upgrade.classList.toggle("on", !!game.upgrade?.open);
      const rs = p?.research, cur = rs?.current && game.world.locks.nodes.get(rs.current);
      research.firstChild.textContent = cur ? `Research ${Math.floor((rs.progress / cur.cost) * 100)}%` : rs && !rs.queue.length ? "Research!" : "Research";
      deposits.classList.toggle("on", !!game.view?.showDeposits);
      town.classList.toggle("on", !!game.town?.open);
      form.classList.toggle("on", !!game.placing);
      placeHint.hidden = !game.placing;
      document.documentElement.style.setProperty("--hud", `${bar.offsetHeight}px`);
      const def = game.building && game.world?.defs.table[game.building];
      buildHint.hidden = !def;
      if (def) buildHint.textContent = `Placing ${def.name}. Click to build, tap twice on touch. Right-click or Esc stops.`;
      else if (game.zoning) { buildHint.hidden = false; buildHint.textContent = `${game.zoning === "none" ? "Erasing zones" : "Zoning"}: drag over your land. Right-click or Esc stops.`; }
    },
    get share() { return Number(share.value) / 100; },
  };
}
