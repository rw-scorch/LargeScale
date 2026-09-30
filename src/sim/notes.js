import rules from "../../data/rules.json" with { type: "json" };

export const NOTES = { max: 20, length: 80, ...rules.notes };

const clean = s => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, "").replace(/\s+/g, " ").trim() : "");

export function installNotes(world) {
  world.notes ??= { version: 0 };
  return world.notes;
}

export function sharesNotes(world, a, b) {
  return a === b || (!!world.dip && world.nations.get(a)?.human && world.nations.get(b)?.human && world.dip.status(a, b, world.time) === "alliance");
}

export function noteOrder(world, nid, m) {
  const n = world.nations.get(nid), N = installNotes(world);
  if (!n) return { error: "spawn first" };
  n.notes ??= [];
  if (m.op === "add") {
    if (!Number.isInteger(m.at) || m.at < 0 || m.at >= world.owner.length) return { error: "that spot is off the map" };
    const text = clean(m.text);
    if (!text || [...text].length > NOTES.length) return { error: `a note is 1 to ${NOTES.length} characters` };
    if (n.notes.length >= NOTES.max) return { error: `at most ${NOTES.max} notes: remove one first` };
    const id = (n.noteNext = (n.noteNext ?? 0) + 1);
    n.notes.push({ id, at: m.at, text, t: world.time });
    N.version++;
    return { ok: true, id };
  }
  if (m.op === "remove") {
    const i = n.notes.findIndex(x => x.id === m.id);
    if (i < 0) return { error: "no such note" };
    n.notes.splice(i, 1);
    N.version++;
    return { ok: true };
  }
  return { error: "the order is add or remove" };
}

export function notesFor(world, nid) {
  const out = [];
  if (nid === null || nid === undefined) return out;
  for (const n of world.nations.values()) {
    if (!n.notes?.length || !sharesNotes(world, nid, n.id)) continue;
    for (const x of n.notes) out.push([n.id, x.id, x.at, x.text]);
  }
  return out;
}
