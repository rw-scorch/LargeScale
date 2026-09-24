# Large Scale: handover

Paste this file into a new chat to carry the project over. It is the whole state in one place: what the game is, what is decided, what exists, and what comes next.

---

## The game

A browser strategy game for Ryan and up to seven friends. One persistent world on a real Earth map, running for days or weeks, with territory taken pixel by pixel like OpenFront, troops as a number moved by hand as stacks, civilians who build and upgrade their own homes in zones the player paints, six eras on branching upgrade trees, physical goods moved by road, rail and sea, a market of player listings, alliances and factions, and a last-player-or-faction-standing win.

Built on Cloudflare: one Worker serving the client, one Durable Object per world running the simulation over WebSockets, SQLite inside each object for saves. No other service is needed.

## Decided, over four question rounds (182 questions)

**World.** 2 to 8 invited friends, no public lobbies. Weak bots fill leftover land and, by default, never attack players. The world sleeps when empty and fast-forwards the peaceful simulation on wake, capped at 72 hours. Attacks only happen while someone is connected. While a player is away their nation produces its online average minus 10 percent, and their troops defend 5 percent weaker. Mobile is landscape, full featured, and one-handed use is not a requirement.

**Map.** Real Earth, one map pixel per plot, 3,600 by 1,440 the target size. Terrain is pixel-by-pixel colour from palettes; sprites are only for things on top. No fog of war at all: every building and every stack, including counts, is visible to everyone. Zoom runs from world view to 16 px per plot.

**Terrain.** Nothing is truly impassable, only very slow. Terrain has hit points; engineers break a mountain plot in about a minute, or seconds with charges bought for money. Destroyed rock becomes clearable rubble, and materials rebuild what was destroyed. Digging in enemy land needs a war and warns the defender. Cliffs, canyons and ravines are crossed at fords, passes and bridges, which is what makes chokepoints. Weather slows but never closes a pass.

**Military.** Troops are a count split into hand-moved stacks; vehicles, ships and aircraft are individual units. Battles use Lanchester's square law. No radar buildings: launchers work alone. Missiles are made in ordinary factories, delivered by convoy, spent per shot, restocked automatically by troops, and an empty site still looks like a site. Interception is a chance, and enough overlapping defences will stop a missile. Nukes are announced to everyone with a blast radius shown, interceptable, and clear land rather than capture it.

**Economy.** Gold is the currency; other ores are worth a fraction of it and spend like money. Special materials (explosives, missiles, fuel, uranium) stay separate. The market is a board of player listings: each seller sets a price, buyers sweep the cheapest first, delivery takes time, no daily cap, no single world price. Civilians have needs and self-build in zones; the player places government, military and infrastructure, and upgrades in bulk with a swipe-select menu at a 1.5x instant premium.

**Cities.** Any high-value building counts toward a city core. Cores grow with population, a nation can hold several, and attack and defence both rise closer to a core, defence faster. Losing a core weakens the whole nation.

**Politics.** War needs a declaration and a five-minute notice. Treaties, alliances, embargoes and factions of up to four. An eliminated player can watch, join a friend's faction as a second commander, or surrender first and continue as a vassal. Worlds have an announced end date, and the full log becomes public when a world ends.

**Not in the game.** Unrest, pollution, government types, internal politics, spying, manual player-to-player trade, fog of war, portrait mobile.

**Principles.** No hyper-management: bulk actions everywhere, standing orders, automatic resupply and recruitment, one list of everything idle. Build it to expand: content in data files, one registry per kind of thing, append-only ids, versioned formats. Mods later as data packs chosen by the host.

## What exists (all tested)

Delivered as `large-scale-dev-kit-v6.zip`:

- **Sprite pack, 3,444 sprites** at 16 px per plot, generated from Python source that ships with it. Magenta team-colour keys, `rise` for tall buildings, lot tiles underneath, `_lights` overlays for night, three facings for people, damage and construction states, terrain features, air defence, demolition, wrecks, flag parts, interface art. Browser to view it all at `assets/index.html`.
- **A working project skeleton** at `project-template/`: Worker, Directory and World Durable Objects, 21 simulation modules in `src/sim/`, shared code, client, data files, tools, tests. `npm test` and an end-to-end smoke test both pass, including a world surviving a server restart.
- **A Discord bot inside the Worker**: signed interactions endpoint, `/status`, `/world`, `/alerts`, `/link`, plus a notification queue flushed by a Durable Object alarm and a ten-minute cron heartbeat, so alerts send themselves with nobody connected.
- **An Earth map pipeline**, and **the finished map**: 3600 by 1440 plots, 1.49 million land plots, 84 degrees north to 60 degrees south, built from Natural Earth 1:10m vectors and the Beck et al. 2018 Köppen-Geiger climate map. Sea depth comes from bathymetry polygons, land relief from mountain and plateau polygons plus 711 named summits, and biomes from real climate classes. Shipped as `earth-map-3600.zip` with `terrain.bin`, `elevation.bin` and `meta.json`, which drop into `public/map/`.
- **19 piece guides** (`tasks/01` to `tasks/19`), each with tested example code, plus reference documents: design decisions, architecture, data formats, pacing, tutorial, simplicity rules, notifications and accounts, expandability and mods, project layout, map data sources, and the full question record.
- **105 automated tests**, all passing.

## What is not built

The real game client beyond the renderer demo and the test page. The panels, the tutorial, the map editor, and the systems from pieces 5 to 19 wired into `world.js` (territory, combat and chat are wired; the rest exist as modules waiting to be installed).

## Next steps, in order

1. Deploy the template to Cloudflare and register `rw_scorch`, which is already set as the admin name.
2. Copy the built map into `public/map/` (it is done; rebuild only if the terrain table changes).
3. Wire pieces 5 to 9 into `world.js` one at a time: civilians, resources, logistics, construction, tech tree.
4. Build the client panels on top of the renderer.
5. Play a weekend world with friends on a small map before committing to a fortnight one.

## Files that carry this project

| File | What it is |
| --- | --- |
| `HANDOVER.md` | this file, the context carrier |
| `NEW_CHAT_PROMPT.md` | the prompt to start a fresh chat |
| `large-scale-dev-kit-v7.zip` | code, guides, assets, project skeleton |
| `earth-map-3600.zip` | the built Earth map |
| `DESIGN_QUESTIONS.md` | all 182 questions with answers |
| `map-data-sources.md` | where the map data came from and how to rebuild |

## Working preferences

Code with few inline comments, notes given separately in chat, simplified language. Large projects delivered as a zip. No emojis. Direct answers, no padding.

## Open questions

Listed at the end of `assets/DESIGN_QUESTIONS.md`, along with every answered round. The main ones left: what missile production needs as inputs, whether re-crewed vehicles keep their original stats, how long the first real world should run, and whether a neutral trader should keep the market stocked when few players are active.
