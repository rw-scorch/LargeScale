import { el, fmt } from "./dom.js";

const list = parts => parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
const goods = o => Object.entries(o ?? {}).filter(([, v]) => v >= 1).map(([k, v]) => `${fmt(Math.floor(v))} ${k}`);

export function storeRow(w, id) {
  return w.purse?.logistics?.stores.find(s => s[0] === id) ?? null;
}

export function goodsText(row) {
  if (!row) return "";
  const have = goods(row[1]);
  return `${have.length ? `Holds ${list(have)}` : "Empty"}, up to ${fmt(row[2])} of each good.`;
}

export function ordersText(row) {
  if (!row) return "";
  const keep = goods(row[3]), want = goods(row[4]);
  return [want.length ? `Asks for ${list(want)}.` : "", keep.length ? `Never sends away the last ${list(keep)}.` : ""].filter(Boolean).join(" ");
}

export function siteText(w, id) {
  const row = w.purse?.logistics?.sites.find(s => s[0] === id);
  if (!row) return "";
  const [, need, on] = row, coming = goods(on);
  const all = Object.entries(need).every(([k, v]) => (on[k] ?? 0) >= v);
  const why = !coming.length ? "No store can spare it yet: make more, or build a store nearer." : all ? `Carts are bringing ${list(coming)}.` : `Carts are bringing ${list(coming)}; the rest waits for a store with some to spare.`;
  return `Waiting for ${list(goods(need))}. ${why}`;
}

export function stuckText(w, id) {
  const lg = w.purse?.logistics, row = lg?.stuck.find(s => s[0] === id);
  if (!row) return "";
  return row[1] === "reach"
    ? `No store within ${lg.reach} plots of travel: it keeps ${lg.buffer} and stops. Build a storage yard or another store nearby.`
    : `Its store is full of what it makes, so it keeps ${lg.buffer} and waits for room.`;
}

export function stuckCount(w) {
  const lg = w.purse?.logistics;
  if (!lg) return 0;
  const idle = lg.sites.filter(s => !Object.keys(s[2]).length).length;
  return idle + lg.stuck.length + (w.purse?.supply?.stacks.filter(s => s[2] < 100).length ?? 0);
}

export function createLogisticsPanel(root, game) {
  const summary = el("p", { id: "logistics-summary", class: "muted" });
  const body = el("div", { id: "logistics-list", class: "logistics-list" });
  const box = el("section", { id: "logistics-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Logistics" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleLogistics(false) })),
    summary, body);
  root.append(box);
  let sig = "";

  const goBuilding = id => {
    const b = game.world.buildings.get(id);
    if (!b) return;
    game.toggleLogistics(false);
    game.selectBuilding(id);
    game.focus(b.anchor, Math.max(game.view.cam.scale / game.view.ratio, 8));
  };
  const goStack = id => {
    const s = game.world.stacks.get(id);
    if (!s) return;
    game.toggleLogistics(false);
    game.select(id);
    game.focus(s.pos, Math.max(game.view.cam.scale / game.view.ratio, 8));
  };
  const item = (text, onclick, tone = "") => el("button", { class: `log-item ${tone}`, onclick }, text);
  const section = (title, rows, empty) => el("div", { class: "log-section" }, el("b", { text: title }), ...(rows.length ? rows : [el("span", { class: "muted", text: empty })]));

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; sig = ""; },
    update() {
      if (box.hidden) return;
      const w = game.world, lg = w?.purse?.logistics;
      if (!lg) { summary.textContent = "Logistics start once you have spawned."; body.replaceChildren(); return; }
      const name = id => w.buildings.get(id)?.def.name ?? "A building";
      const sup = w.purse.supply?.stacks ?? [], army = w.purse.army, queues = w.purse.machines?.queues ?? {};
      const next = JSON.stringify([lg, sup, army?.why, Object.entries(queues).map(([id, q]) => [id, q.why])]);
      if (next === sig) return;
      sig = next;
      summary.textContent = `${lg.stores.length === 1 ? "One store" : `${lg.stores.length} stores`}. Buildings use a store within ${lg.reach} plots of travel. ${lg.convoys} of ${lg.convoyMax} carts on the road, each carrying up to ${lg.capacity}.`;
      const sites = lg.sites.map(([id]) => item(`${name(id)}: ${siteText(w, id)}`, () => goBuilding(id), "warn"));
      const stuck = lg.stuck.map(([id]) => item(`${name(id)}: ${stuckText(w, id)}`, () => goBuilding(id), "warn"));
      const held = [
        ...(army?.why ? [item(`Training: ${army.why}.`, () => game.toggleArmy(true), "warn")] : []),
        ...Object.entries(queues).filter(([, q]) => q.why).map(([id, q]) => item(`${name(Number(id))}: ${q.why}.`, () => goBuilding(Number(id)), "warn")),
      ];
      const stacks = sup.map(([id, carry, pct]) => item(pct < 100 ? `A stack is out of supply, at ${pct}% strength.` : `A stack beyond supply has ${Math.max(1, Math.ceil(carry / 60))} min of supplies left.`, () => goStack(id), pct < 100 ? "danger" : "warn"));
      const stores = lg.stores.map(row => row[0] === 0
        ? item(`Camp at your capital: ${goodsText(row)} Build a store to keep more.`, () => game.home())
        : item(`${name(row[0])}: ${goodsText(row)} ${ordersText(row)}`, () => goBuilding(row[0])));
      body.replaceChildren(
        section("Sites waiting for goods", sites, "None."),
        section("Producers stopped", stuck, "None."),
        section("Training and workshops held up", held, "None."),
        section("Stacks beyond supply", stacks, "None."),
        section("Stores", stores, "No stores."));
    },
  };
}
