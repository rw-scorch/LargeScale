# Building it to be expanded

Two things are being asked for here: that the game stays easy to add to over time, and that players can eventually make their own content.

## Rules that keep it expandable

1. **Content lives in data, not code.** Buildings, units, terrain, tech and tuning are JSON files. Adding a building should be a data change plus a sprite, never a new branch in the simulation.
2. **The simulation imports nothing from Cloudflare.** Every example in this kit runs in plain Node, which is why it can be tested and reused on the client.
3. **One registry per kind of thing.** One building table, one unit table, one effect list. Player and civilian buildings should share one registry with a flag, not two parallel systems.
4. **Effects are named numbers.** A tech node says `{ "defence": 0.05 }`. The simulation reads a fixed list of effect names. New content composes existing effects rather than adding code.
5. **Ids are append-only.** Terrain indexes, building ids and sprite ids go in saves. Add at the end, never reorder, never reuse a removed id.
6. **Versions on everything.** The protocol, the save format, the stat files and the map file all carry a version, and the server refuses mismatches with a clear message.
7. **Hooks, not edits.** The world already exposes `preTick`, `postMove` and `postTick`. Any new system attaches there rather than being wired into the middle of the tick.
8. **Feature flags per world.** Nukes, weather and bots are already host settings. New systems should arrive the same way, so a world can run without them.

## Mods, later

Once servers are running and the data format has settled, player-made content is mostly already possible, because content is data.

**Stage 1: data packs.** A mod is a zip with `buildings.json`, `units.json`, `techtree.json`, a sprite sheet and a manifest. The host uploads it when creating a world, the server validates it against the schemas and the sprite rules, and every client downloads it with the world. No code runs, so nothing can break the simulation or the server. This covers new buildings, units, eras, balance overhauls and total conversions of the art.

**Stage 2: map packs.** The same idea for maps: terrain, elevation, deposits and spawns, made with the map editor. Simple to allow, since the format is already three files.

**Stage 3: rule scripts, only if wanted.** Small sandboxed scripts for new win conditions or events. This is the first stage where a mod can misbehave, so it needs a proper sandbox and a tight API: read state, queue actions, no network, no storage, a time budget per tick. Worth doing only if stage 1 proves popular.

**What to build now so stage 1 is easy later**

- Load stat files by path at world start rather than importing them, so an uploaded pack can replace them.
- Validate every file on load and refuse to start on an error, with the error shown to the host.
- Make the client fetch its sprite atlas from the world, keyed by a hash, rather than shipping it in the bundle.
- Keep a stable list of effect names and document it, because that is the modding API in practice.
