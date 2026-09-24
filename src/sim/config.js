export const WORLD_SCHEMA = {
  name: { type: "string", min: 3, max: 40, default: "New world" },
  map: { type: "enum", values: ["earth", "test_small", "test_medium"], default: "test_small" },
  maxPlayers: { type: "int", min: 2, max: 8, default: 8 },
  bots: { type: "int", min: 0, max: 60, default: 12 },
  botsAttackPlayers: { type: "bool", default: false },
  speed: { type: "number", min: 0.25, max: 4, default: 1 },
  startEra: { type: "enum", values: ["T", "M", "G"], default: "T" },
  peaceMinutes: { type: "int", min: 0, max: 1440, default: 60 },
  warNoticeSeconds: { type: "int", min: 0, max: 3600, default: 300 },
  offlineDefence: { type: "number", min: 1, max: 3, default: 1.5 },
  maxCatchupHours: { type: "int", min: 0, max: 168, default: 72 },
  factionSize: { type: "int", min: 1, max: 8, default: 4 },
  nukes: { type: "bool", default: true },
  dayLengthMinutes: { type: "int", min: 10, max: 1440, default: 60 },
  daysPerSeason: { type: "int", min: 1, max: 30, default: 6 },
  weather: { type: "bool", default: true },
  fogOfWar: { type: "bool", default: true },
  inviteOnly: { type: "bool", default: true },
};

export function validateValue(spec, v) {
  switch (spec.type) {
    case "string": return typeof v === "string" && v.length >= spec.min && v.length <= spec.max;
    case "enum": return spec.values.includes(v);
    case "int": return Number.isInteger(v) && v >= spec.min && v <= spec.max;
    case "number": return typeof v === "number" && Number.isFinite(v) && v >= spec.min && v <= spec.max;
    case "bool": return typeof v === "boolean";
  }
  return false;
}

export function makeConfig(input = {}, schema = WORLD_SCHEMA) {
  const cfg = {}, errors = [];
  for (const [k, spec] of Object.entries(schema)) {
    if (!(k in input)) { cfg[k] = spec.default; continue; }
    if (validateValue(spec, input[k])) cfg[k] = input[k];
    else { errors.push(`${k}: bad value ${JSON.stringify(input[k])}`); cfg[k] = spec.default; }
  }
  for (const k of Object.keys(input)) if (!(k in schema)) errors.push(`${k}: unknown setting`);
  return { cfg, errors };
}

export const LIVE_EDITABLE = new Set(["bots", "botsAttackPlayers", "speed", "warNoticeSeconds", "offlineDefence", "maxCatchupHours", "nukes", "weather", "dayLengthMinutes", "daysPerSeason"]);

export function hostChange(cfg, key, value, started) {
  const spec = WORLD_SCHEMA[key];
  if (!spec) return "unknown setting";
  if (started && !LIVE_EDITABLE.has(key)) return "that setting is fixed once the world starts";
  if (!validateValue(spec, value)) return "bad value";
  cfg[key] = value;
  return null;
}
