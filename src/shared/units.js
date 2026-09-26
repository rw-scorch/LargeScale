export const XP_NAMES = ["Green", "Seasoned", "Veteran", "Elite"];

export function unitTable(list) {
  const table = {}, byNum = [];
  for (const d of list) {
    if (table[d.id] || byNum[d.num]) throw new Error(`unit ${d.id} (number ${d.num}) is listed twice`);
    table[d.id] = d;
    byNum[d.num] = d;
  }
  if (!table.levy) throw new Error("the unit list needs a levy type");
  return { table, byNum, troops: list.filter(d => d.kind === "troop") };
}

export function mixTotal(mix) {
  let n = 0;
  for (const id in mix ?? {}) n += mix[id];
  return n;
}

export function levelOf(xp, levels) {
  let lv = 0;
  for (let k = 1; k < levels.length; k++) if ((xp ?? 0) >= levels[k]) lv = k;
  return lv;
}

export function powerOf(units, troops, mix, stat, bonus = 0) {
  let trained = 0, sum = 0;
  for (const id in mix ?? {}) {
    trained += mix[id];
    sum += mix[id] * (units.table[id]?.[stat] ?? 1);
  }
  return (Math.max(0, troops - trained) * (units.table.levy[stat] ?? 1) + sum) * (1 + bonus);
}

export function mixRow(units, mix) {
  const out = [];
  for (const id in mix ?? {}) {
    const n = Math.floor(mix[id]), d = units.table[id];
    if (n >= 1 && d) out.push(d.num, n);
  }
  return out;
}

export function mixFromRow(units, row) {
  if (!row?.length) return null;
  const mix = {};
  for (let k = 0; k + 1 < row.length; k += 2) {
    const d = units.byNum[row[k]];
    if (d) mix[d.id] = row[k + 1];
  }
  return mix;
}

export function mixParts(units, troops, mix) {
  const parts = [];
  const trained = mixTotal(mix), levies = Math.floor(Math.max(0, troops - trained));
  for (const d of units.troops) {
    const n = d.id === "levy" ? levies : Math.floor(mix?.[d.id] ?? 0);
    if (n >= 1) parts.push({ id: d.id, name: d.name, count: n });
  }
  return parts;
}
