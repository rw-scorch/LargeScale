import { readFileSync, writeFileSync } from "node:fs";

const WORTH = {
  money: 1, food: 1, fish: 1, wood: 2, clay: 2, stone: 3, iron: 4, copper: 4, tin: 4, coal: 3, sulfur: 3, bauxite: 4,
  silver: 8, gold: 10, gems: 12, uranium: 15, lithium: 10, oil: 6, gas: 5, steel: 8, concrete: 6, goods: 5,
};
const RETIRED = ["woodcutter_camp", "quarry", "clay_pit", "sawmill", "steel_mill", "storage_yard", "warehouse", "logistics_depot"];

const worthOf = k => { if (!(k in WORTH)) throw new Error(`no worth for ${k}`); return WORTH[k]; };
const gold = (cost, places) => {
  const v = Object.entries(cost ?? {}).reduce((s, [k, n]) => s + n * worthOf(k), 0), f = 10 ** places;
  return v ? { money: Math.round(v * f) / f } : {};
};
const spaced = v => Array.isArray(v) ? `[${v.map(spaced).join(", ")}]`
  : v && typeof v === "object" ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${spaced(x)}`).join(", ")} }` : "{}")
  : JSON.stringify(v);

function lines(file, change, style) {
  const url = new URL(`../data/${file}`, import.meta.url), raw = readFileSync(url, "utf8"), eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let n = 0;
  const out = raw.split(eol).map(line => {
    const m = line.match(/^(\s*)(\{.*\})(,?)$/);
    if (!m) return line;
    const v = JSON.parse(m[2]), before = JSON.stringify(v);
    change(v);
    if (JSON.stringify(v) === before) return line;
    n++;
    return m[1] + (style === "spaced" && m[2].startsWith("{ ") ? spaced(v) : JSON.stringify(v)) + m[3];
  });
  writeFileSync(url, out.join(eol));
  return n;
}

function rulesLine(key, change) {
  const url = new URL("../data/rules.json", import.meta.url), raw = readFileSync(url, "utf8"), eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const out = raw.split(eol).map(line => {
    const m = line.match(/^(\s*)"([^"]+)": (\{.*\})(,?)$/);
    if (!m || m[2] !== key) return line;
    const v = JSON.parse(m[3]);
    change(v);
    return `${m[1]}"${key}": ${spaced(v)}${m[4]}`;
  });
  writeFileSync(url, out.join(eol));
}

const rules = JSON.parse(readFileSync(new URL("../data/rules.json", import.meta.url), "utf8"));
if (rules.economy.worth) throw new Error("the data is already gold only");
rulesLine("economy", e => { e.worth = WORTH; e.yield = 1.2; });
rulesLine("roads", r => { for (const t of Object.values(r.types)) t.cost = gold(t.cost, 1); });

const bn = lines("buildings.json", b => {
  if (!b.id || !b.cost) return;
  b.cost = gold(b.cost, 0);
  delete b.store;
  if (RETIRED.includes(b.id)) b.retired = true;
}, "compact");
const un = lines("units.json", u => { if (u.id && u.cost && Object.keys(u.cost).length) u.cost = gold(u.cost, 1); }, "compact");
const tn = lines("techtree.json", n => {
  if (!n.id) return;
  if (n.unlocks?.buildings) {
    const kept = n.unlocks.buildings.filter(id => !RETIRED.includes(id));
    if (kept.length < n.unlocks.buildings.length && !kept.length && !n.unlocks.units && !n.unlocks.effects) n.unlocks.effects = { income: 0.05 };
    n.unlocks.buildings = kept;
  }
  const e = n.unlocks?.effects;
  if (e?.wood_rate) { e.income = (e.income ?? 0) + e.wood_rate / 2; delete e.wood_rate; }
}, "spaced");
console.log(`gold only: ${bn} buildings, ${un} units and ${tn} research nodes changed; ${RETIRED.length} buildings retired`);
