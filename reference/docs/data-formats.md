# Data formats

Everything the game reads at runtime, in one place. Keep these files in `data/` in your repository, load them on the server at world start, and edit them live through the dev panel (piece 14).

## Units and conventions

- **Time** is in seconds of game time. Rates are per second. Never write a number that assumes a tick rate.
- **Distances** are in plots. One plot is 16 px of sprite at full zoom.
- **Money** is a plain number, one currency, no decimals shown.
- **Ids** are lowercase with underscores and match sprite ids in `assets/manifest.json` wherever a thing is drawn.
- **Eras** are always the short codes `T`, `M`, `G`, `I`, `Mo`, `F`.

## `terrain.json`

The gameplay table for the 41 terrain types, in the same order as `assets/terrain/palettes.json`. The working version is `shared/terrain.js`.

```json
{
  "id": 23,
  "name": "hills",
  "land": true,
  "move": 1.8,
  "defence": 1.5,
  "capture": 1.4,
  "fertility": 0.5,
  "build": true,
  "forest": false,
  "water": null
}
```

| Field | Meaning |
| --- | --- |
| `move` | Multiplies travel time for land movement. `Infinity` means impassable |
| `defence` | Multiplies defensive power and capture cost |
| `capture` | Multiplies the troop cost of taking the plot |
| `fertility` | Multiplies farm yield, 0 means no farming |
| `build` | Whether buildings may be placed |
| `water` | `null` for land, otherwise `deep`, `open`, `shallow` or `ice`, used by ships |

The index is the byte stored in `terrain.bin` and in every save, so **never reorder this list**. Add new types at the end.

## `buildings.json`

One entry per building, player-placed or civilian.

```json
{
  "id": "harbour",
  "sprite": "harbour",
  "category": "transport",
  "era": "M",
  "footprint": [2, 2],
  "rule": "coast",
  "cost": { "money": 300, "wood": 80, "stone": 40 },
  "time": 150,
  "next": "port_commercial",
  "civilian": false,
  "zone": null,
  "housing": 0,
  "jobs": 12,
  "makes": { "goods": 0 },
  "needs": { "power": 0 },
  "storage": 400,
  "tourism": 0,
  "research": 0,
  "hp": 400,
  "upkeep": 2
}
```

| Field | Meaning |
| --- | --- |
| `rule` | `null`, `coast`, `shallows`, `deposit`, `forest`, `farm` or `pasture`, checked at placement |
| `next` | The upgrade step, or `null` at the top of a chain |
| `civilian` | Whether civilians build it themselves in a zone |
| `zone` | `res`, `com`, `ind` or `farm` for civilian buildings |
| `storage` | Non-zero makes it a stockpile node for logistics |
| `upkeep` | Money per second while active |

## `units.json`

```json
{
  "id": "destroyer",
  "sprite": "destroyer",
  "domain": "sea",
  "era": "I",
  "hp": 200,
  "attack": 45,
  "defence": 30,
  "range": 5,
  "speed": 5,
  "capacity": 0,
  "cost": { "money": 900, "steel": 60 },
  "time": 120,
  "builtAt": ["naval_yard", "shipyard_large"],
  "fuel": 0.05,
  "hidden": false,
  "beach": false
}
```

`domain` is `land`, `sea` or `air`. `range` is attack range for combat units and flight range for aircraft. `fuel` is units of fuel per second while moving.

## `techtree.json`

See piece 9 for the full description and `tasks/09-eras-upgrade-trees/example/techtree.sample.json` for a complete Tribal and Medieval tree.

```json
{
  "version": 1,
  "eras": ["T", "M", "G", "I", "Mo", "F"],
  "branches": ["military", "economy", "civic", "government"],
  "nodes": [ { "id": "...", "branch": "...", "era": "T", "cost": 40, "requires": [], "unlocks": {} } ]
}
```

Effect names the simulation understands. Each is a fraction added to a base of 1, so 0.05 means 5 percent better:

| Effect | Applies to |
| --- | --- |
| `troop_cap` | Maximum troops |
| `troop_growth` | Troop regrowth rate |
| `defence`, `attack` | Combat power |
| `pop_growth` | Civilian growth |
| `research` | Research points |
| `wood_rate`, `food_rate`, `ore_rate` | Producer output |
| `build_speed`, `build_cost` | Construction |
| `convoy_speed`, `supply_range` | Logistics |
| `market_fee` | Market fee, where a positive value is worse |
| `tourism` | Tourism income |

## `rules.json`

Tuning that is not per building or unit: the constants in the example modules.

```json
{
  "territory": { "spawnRadius": 4, "troopBase": 1000, "growthRate": 0.03, "stackSpeed": 1.5, "advanceRate": 6, "advanceRadius": 5 },
  "combat": { "lethality": 0.08, "holdBonus": 1.25, "ownLandBonus": 1.1 },
  "civilians": { "econEvery": 5, "growth": 0.02, "foodPerPerson": 0.002, "conscriptCost": 0.25 },
  "supply": { "range": 18, "attritionPerSec": 0.004, "minMult": 0.5 },
  "market": { "elasticity": 0.8, "fee": 0.03, "targetStock": 10000, "reversionHours": 6 },
  "landing": { "penalty": 0.15, "beachPenalty": 0.05, "dropPenalty": 0.1 }
}
```

## World settings

The host's choices, validated by `WORLD_SCHEMA` in piece 14. Stored once per world in the `meta` table.

## Save format

Inside each world's Durable Object:

| Table | Row shape | Notes |
| --- | --- | --- |
| `meta` | `k`, `v` JSON | map info, settings, nations, stacks, clock start, market book, diplomacy, save time |
| `chunks` | `layer`, `idx`, `data` BLOB | map layers: `owner` as Uint16, `zone` and `road` as Uint8, `building` as Int32 |
| `buildings` | id, type, owner, anchor, state, progress, residents | or one JSON blob per chunk if simpler |
| `units` | id, type, owner, plot, hp, cargo | |
| `chat` | id, time, who, text | keep the last few thousand |
| `audit` | version, account, time, changes JSON | dev panel history |

Chunks are square, 256 by 256 plots for the Earth map, and only dirty chunks are rewritten. Row values must stay under 2 MB, which a 256 by 256 Uint16 chunk (128 KB) does comfortably.

## Map files from the pipeline

| File | Format |
| --- | --- |
| `terrain.bin` | `width × height` bytes, row by row from the north-west corner, values indexing `terrain.json` |
| `elevation.bin` | the same grid as little-endian Int16 metres |
| `deposits.json` | `{ "types": ["iron", ...], "plots": [[index, typeIndex, amount], ...] }`, sparse |
| `spawns.json` | `[{ "name": "Western Europe", "x": 1740, "y": 320 }, ...]` |
| `meta.json` | width, height, latitude range, projection, terrain names, content hash |

The client downloads `terrain.bin` once, keyed by the hash, and keeps it in IndexedDB.

## Asset manifest

`assets/manifest.json` describes every sprite: id, family, category, group, pixel size, footprint in plots, era, state, frame, tags, `rise` and `lot`. The game reads it to know:

- how tall a sprite is (`rise`)
- which lot tiles to draw underneath (`lot`)
- which states and frames exist

`assets/data.js` holds the same list plus base64 sheets, which is what the browser demos use.
