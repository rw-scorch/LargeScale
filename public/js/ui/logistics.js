import { el, fmt } from "./dom.js";

export function tradeText(w, b) {
  const t = w.purse?.trade;
  if (!t || b.owner !== w.you) return "";
  if (b.def.port) return t.ports + t.stations > 0 ? "Sends a free trade ship to another port every half minute or so. Both ends earn when it arrives; warships at war with you can capture it." : "";
  if (b.def.station) return t.stations > 1 ? "Sends a train along your rail to your other stations; each trip earns gold." : "Build a second station and join the two by rail: trains between them earn gold.";
  return "";
}

export function createLogisticsPanel(root, game) {
  const summary = el("p", { id: "logistics-summary", class: "muted" });
  const body = el("div", { id: "logistics-list", class: "logistics-list" });
  const box = el("section", { id: "logistics-panel", class: "panel center", hidden: true },
    el("div", { class: "row spread" }, el("b", { class: "title", text: "Trade" }), el("button", { class: "ghost", text: "Close", onclick: () => game.toggleLogistics(false) })),
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
  const item = (text, onclick, tone = "") => el("button", { class: `log-item ${tone}`, onclick }, text);
  const section = (title, rows, empty) => el("div", { class: "log-section" }, el("b", { text: title }), ...(rows.length ? rows : [el("span", { class: "muted", text: empty })]));

  return {
    get open() { return !box.hidden; },
    show(on) { box.hidden = !on; sig = ""; },
    update() {
      if (box.hidden) return;
      const w = game.world, t = w?.purse?.trade;
      if (!t) { summary.textContent = "Trade starts once you have spawned."; body.replaceChildren(); return; }
      const mine = [...w.buildings.values()].filter(b => b.owner === w.you && b.state === "active" && (b.def?.port || b.def?.station));
      const army = w.purse.army, queues = w.purse.machines?.queues ?? {};
      const next = JSON.stringify([t, mine.map(b => b.id), army?.why, Object.entries(queues).map(([id, q]) => [id, q.why])]);
      if (next === sig) return;
      sig = next;
      const name = id => w.buildings.get(id)?.def.name ?? "A building";
      const how = !t.ports ? "Build a jetty on your coast: its trade ships sail to other nations' ports, and both of you earn when they arrive."
        : t.stations === 1 ? "A second station joined to the first by rail would send trains that earn gold." : "";
      summary.textContent = `${fmt(t.perMinute)} gold a minute from trade lately, ${fmt(t.total)} in all. ${t.ships} trade ${t.ships === 1 ? "ship" : "ships"} and ${t.trains} ${t.trains === 1 ? "train" : "trains"} out now. ${how}`.trim();
      const held = [
        ...(army?.why ? [item(`Training: ${army.why}.`, () => game.toggleArmy(true), "warn")] : []),
        ...Object.entries(queues).filter(([, q]) => q.why).map(([id, q]) => item(`${name(Number(id))}: ${q.why}.`, () => goBuilding(Number(id)), "warn")),
      ];
      const ports = mine.filter(b => b.def.port).map(b => item(`${b.def.name}: ${tradeText(w, b)}`, () => goBuilding(b.id)));
      const stations = mine.filter(b => b.def.station).map(b => item(`${b.def.name}: ${tradeText(w, b)}`, () => goBuilding(b.id)));
      body.replaceChildren(
        section("Ports", ports, "No ports yet."),
        section("Railway stations", stations, "No stations yet."),
        section("Training and workshops held up", held, "None."));
    },
  };
}
