# Large Scale

Browser strategy game for Ryan and up to seven friends. One persistent world on a real Earth map, running for days or weeks. Territory is taken pixel by pixel like OpenFront, and troops are a number moved by hand as stacks. Cloudflare Worker plus one Durable Object per world, WebSockets, SQLite inside each object. No other services.

Planning is finished. The job now is building the real game, one milestone at a time. The current milestone is in `plans/milestone-2.md`. Milestone one is in `plans/milestone-1.md`; its last step, Ryan's playtest, is done.

## Which document wins

When two documents disagree, the one higher in this list wins:

1. `reference/HANDOVER.md`: the whole project state, and the latest decisions.
2. `reference/DESIGN_QUESTIONS.md`: all 182 answered questions. Round 4 is the newest. Its header still says round 4 is open; that is stale.
3. `reference/docs/design-decisions.md`
4. Everything else in `reference/`. `reference/TASK_SUMMARY.md` is out of date on the market: it is now a board of player listings with no world price, not an automatic market.

Known contradictions to ignore:

- `reference/tasks/01-map-renderer/GUIDE.md` lists a fog-of-war overlay. There is no fog of war; everything is visible to everyone.
- The same guide says to put the renderer in `client/src/render/`. Use `public/js/render/`.

## Commands

Ryan is on Windows with PowerShell. Give him commands in PowerShell form.

```powershell
npm install
npm test                  # unit tests (100)
npm run test:reference    # the kit's 95 example tests, kept green as a regression check
npm run bench             # Earth benchmark: 10 game minutes, 400 bots, 8 players with 2,000 buildings each, fails if a tick is over 50 ms
npm run bench -- --map public/map/fine --crop europe --bots auto   # fine Europe
npm run dev               # wrangler dev on http://localhost:8787
$env:INVITE = "code-from-.dev.vars"; $env:MAP = "europe"; npm run smoke   # MAP is test, europe (fine), europe-normal or earth
$env:RECHECK = "1"; npm run smoke   # after restarting npm run dev: the last smoke world reloads identically
$env:MAP = "europe"; npm run ui     # headless browser session with screenshots in .screens; needs Playwright
```

`npm run map:fine` rebuilds the fine map from the sources in `data/map` (see `reference/docs/map-data-sources.md`). `npm run map:deposits` regenerates `deposits.bin.gz` next to both base maps from `data/deposits.json`; run it after rebuilding a map, and commit the result.

`npm run ui` needs Playwright, which is not a project dependency: `npm install --no-save playwright` then `npx playwright install chromium`.

`npm run bench` takes `-- --bots 200 --players 8 --ticks 2400 --budget 50 --buildings 2000`. Local secrets go in `.dev.vars` (copy `.dev.vars.example`, set `INVITE_CODE` and `PEPPER`). `wrangler dev` and `wrangler deploy` both run `tools/build_public.mjs` first, which writes `public/map/terrain.bin.gz` and copies `src/shared` to `public/js/shared`.

## Layout

```
src/index.js       Worker: routes, static files, websocket handover
src/directory.js   Directory object: accounts, sessions, worlds, members
src/world.js       World object: one per world. Sockets, tick loop, saving, catch-up
src/worldconfig.js map choice (test, earth, europe, lat/long box) and bot count validation
src/sim/           the simulation, 21 modules, plain JavaScript
src/shared/        the only code both server and client import: protocol, codec, maps, pathfinding, terrain
public/            the client: index.html, js/app.js, js/net.js, js/input.js, js/render/, js/ui/ (one file per panel);
                   test.html is the old server test page. public/map holds the gzipped maps and public/assets the art kit, both committed
data/              stat files. Tuning numbers live in data/rules.json
tools/             build_earth.py, bench_earth.mjs, one-off scripts
test/              node --test unit tests plus smoke.mjs
reference/         the dev kit: docs, 19 piece guides with example code, handover, question record
plans/             milestone plans
devpack/           one dev pack per session: summary, conversation record (secrets removed), handover and plans, zipped
```

## Rules

1. `src/sim/` never imports anything from Cloudflare. That keeps tests fast in plain Node, and lets the client reuse the code.
2. `src/shared/` is the only code crossing between server and client.
3. Generated files are not committed: `.wrangler/`, `.dev.vars`, `public/js/shared/`, and the raw `public/map/terrain.bin`, `elevation.bin` and `preview.png`. The gzipped maps and the art kit in `public/assets/` are committed (since 24 September 2026, at Ryan's request), so a fresh clone deploys as it is.
4. Never edit or remove the `migrations` block in `wrangler.jsonc`. A class rename needs a new migration entry. Deleting a class deletes its saved worlds.
5. Tuning constants go in `data/rules.json`, never as numbers typed into the simulation.
6. New systems are one module in `src/sim/`, installed once in `world.js`. New message types are a validated case in `world.js`. Panels are one file each in `public/js/ui/`.
7. Content is data, with one registry per kind of thing, append-only ids and versioned formats. Mods come later as data packs.
8. No hyper-management. Prefer bulk actions, standing orders, automatic resupply and one list of everything idle.

## The code in `src/sim/` is the base

The modules in `src/sim/` are the tested kit examples, identical apart from import paths. Build on them; do not rewrite them from scratch. Change them where scale or the design requires it, and keep their tests passing. `reference/tasks/NN-*/GUIDE.md` explains each one and says what to change for the Earth map.

## How Ryan works

- **Comments.** Few inline code comments. Explain the code separately in chat, in plain language.
- **Style.** No emojis. Direct answers, no padding.
- **Push back.** Say so when something he asks for is a bad idea.
- **Evidence.** Test what you build and show the actual output: test counts, benchmark numbers, screenshots. Do not say something "should work".
- **Pace.** Agree a plan before writing large amounts of code. Work one milestone step at a time.
- **Git.** Commit in small steps with clear messages.

## State at handoff (24 September 2026)

- **Tests and smoke.** All tests pass: 10 in `test/`, 95 in `reference/`. The smoke test passes 17 of 17 under `wrangler dev`, but on the 320 by 200 test map.
- **Deploy.** Not deployed. The Cloudflare account had no Workers.
- **Admin.** `ADMIN_NAMES` is `rw_scorch`. Ryan registers that name right after the first deploy.
- **Deploy commands.** Ryan deploys himself: `npx wrangler login`, `npx wrangler secret put INVITE_CODE`, `npx wrangler secret put PEPPER`, `npx wrangler deploy`. The first deploy creates both Durable Object classes.
- **Fine map.** `public/map/fine/terrain.bin.gz` (7200 by 2880, 0.05 degrees, about 634 KB) and `meta.json`, built 24 September 2026. Committed, like the normal map's `terrain.bin.gz` and the art kit.
- **Map.** The Earth map is already in `public/map/`: `terrain.bin` (3600 by 1440 bytes), `elevation.bin` (Int16) and `meta.json`. The terrain indexes match `src/shared/terrain.js`.

## Milestone one progress

Steps 1 to 5 are done (September 2026). Step 6, Ryan's own deploy and playtest, is under way: first deployed 24 September 2026 from `claude/keen-ride-u8zdz9` to https://large-scale.rwscorch.workers.dev (free plan). He deploys from his clone in `C:\Users\striv\large-scale-gh`. PR 3 (step 5, playtest fixes, maps and assets) is merged into `main`.

- **Maps.** Worlds are `test`, `earth`, `europe` or a lat/long box, read through `env.ASSETS` at creation. Each world stores its terrain as one gzipped row and its owner layer run-length encoded; a save writes 2 to 4 rows.
- **Join.** Protocol version 2 (version 1 until step 4). The client fetches `/map/terrain.bin.gz` (243 KB, cacheable); the socket sends `hello`, terrain differences and the owner layer in run-length frames. About 150 KB on Earth with 400 bots.
- **Scale.** Border sets per nation, bots think in slices and fold idle stacks back in, long moves use a land-region graph. `npm run bench` passes at 200 and 400 bots with the worst tick near 20 to 26 ms.
- **Game.** Combat and bots run in every world; bots spawn at creation. Orders live in `src/game.js` (plain JavaScript, unit tested): spawn, stack, move, advance, split, merge, disband, route. Rate limit 20 a second per account. Offline players defend at 0.95. State is sent as compact deltas (protocol 2), about 3.5 KB a second per player with 400 bots. A win freezes the world.
- **Fine region maps.** Region maps (Europe, lat/long boxes) default to the fine map: Europe is 1400 by 760 plots, 500,828 land. The whole Earth stays at 0.1 degrees. `info.map` stores `dir` and `scale`; `scaledRules(scale)` in `src/worldconfig.js` doubles the length rules and quadruples the area rules listed in `data/rules.json` under `detail`. Bots follow land area; fine maps allow at most 100 (fine Europe worst tick: 11.5 ms at 25 bots, 27 ms at 100, 71 ms at 400). Old worlds without `dir` keep the normal map. The server reads `terrain.bin.gz` for both.
- **Controls.** Keys live in `public/js/keys.js` (F form at pointer, A advance, M move, S split, G merge, X disband or demolish, B build menu (its Zones tab paints zones by dragging), T town panel, U research, R deposits at mid zoom, Tab next stack, H home, Esc cancel, + and -). Right-click sends the selected stack at once. Stacks form on any owned plot. A settings panel to rebind keys is wanted later.
- **Capital.** A lost capital moves to the nearest plot the nation still owns, with a `capital_moved` event.
- **Client.** `public/index.html` plus `public/js/`: login, world list (map choice, bot slider), spawn picker, stack panel with route preview, nation list, chat, connection status with reconnect, victory banner. The renderer is the kit's, adapted: territory in 256 by 256 chunk canvases. `src/shared/client.js` holds the client's copy of the world and is shared with the smoke test.

## Milestone two progress

- **Step 1 (25 September 2026, branch `m2-step1-building-layer`).** One building registry in `src/sim/buildings.js` (`world.bld`): buildings by id, a sparse plot index, per-nation sets, a `civilian` flag, and one-byte zone and wood layers. Definitions are in `data/buildings.json`; each type has a `num` that is saved and must never be reused or changed. Construction, civilians, resources and nukes use the registry. Save format 3 adds `zone`, `wood` and `buildings` rows, written only when changed; format 2 worlds load with empty layers. Capturing a building's anchor plot passes it to the capturer. `test/kit/` runs the kit's civilian, resource and construction tests against `src/sim`.

- **Step 2 (25 September 2026, branch `m2-step2-construction`, stacked on step 1).** Protocol 3. Placement rules live in `src/shared/buildings.js`, so the server and the client ghost give the same reason. `build` and `demolish` orders are in `src/game.js`. Human nations get 1 gold a second and the starting kit from `src/sim/economy.js` (`rules.json` `economy`: 100 gold, a finished chieftain hut; food and wood from `civilians.startStock`). Demolish refunds half and leaves rubble for 120 s, which can be built over. Clients get the building table in `hello`, a varint snapshot frame (`MSG.BUILDINGS`) and row changes in `state`, plus a per-player `purse`. Panels: `public/js/ui/build.js` and `building.js`. The world config's `rules.buildSpeed` speeds construction up for tests. The renderer sits construction, damaged and rubble sprites on the ground, because their art is drawn at the top of tall canvases.

- **Step 3 (25 September 2026, branch `m2-step3-civilians`, stacked on step 2).** A `zone` order paints or erases a rectangle of up to 64 by 64 plots. The town economy (`src/sim/civilians.js`) runs every 5 s for human nations only and finds free plots through per-nation zone sets that follow captures, never a map scan. Money is `baseIncome` plus `taxPerResident` per person. The troop cap is the land cap plus `conscriptShare` of the population; Ryan chose land plus people over the kit's population-only cap. Both read per-nation overrides (`n.tax`, `n.conscription`) for the later sliders. Housing demand compares fullness with `resDemandAt` times needs, because the kit's fixed 75% stalled Tribal towns at a dozen huts. Zones reach clients as a join frame (`MSG.ZONE`) and binary diffs (`MSG.ZONE_DIFF`). The purse carries town stats for `public/js/ui/town.js`. Saves use `ON CONFLICT DO UPDATE`, so each row counts once: 4 rows a save with a growing town. Nothing makes food or wood until step 4, so towns stop growing when the 40 wood runs out and shrink when the 50 food does.

- **Step 4 (25 September 2026, branch `m2-step4-resources`, stacked on step 3).** Protocol 4. Deposits are generated once per base map by `tools/build_deposits.mjs` and committed as `public/map/deposits.bin.gz` (72,523 plots, 193 KB) and `public/map/fine/deposits.bin.gz` (302,037 plots, 791 KB). Region worlds crop them, and test maps generate their own and send them in the join. The server keeps deposits as sorted arrays searched by plot. Producers are buildings with a `producer` block in `data/buildings.json`. They take the Resources and Farming tabs, and the field is `crop_wheat`, matching the tech tree. Placement reasons come from `producerError` in `src/shared/buildings.js`; mines may sit on rough ground. `src/sim/resources.js` drains deposits nearest first, cuts the wood layer in whole steps, clears forest into saved terrain edits sent live as `MSG.TERRAIN_EDIT`, regrows cleared land beside healthy forest, and scales farms by fertility and the season at their latitude (`rules.json` `seasons`: 6 game hours a season). Output is scaled by the nation's staffed share of jobs, never below `minWorkforce`, and producer workers count as town jobs. Terrain edits and mined amounts share one `land` row. A producer whose deposits are all used up is drawn dimmed with the depleted deposit sprite, because it covers the deposit. The world config's `rules.produceSpeed` speeds production for tests. A brand-new row costs 2 `rowsWritten` (the key index too), so saves report steady-state rows separately.

- **Step 5 (25 September 2026, branch `m2-step5-research`, stacked on step 4).** Protocol 5. `data/techtree.json` is checked when `src/sim/research.js` loads, and `test/research.test.js` checks it against the sprite manifest and the building registry. A building or zone that a node unlocks needs that node (`lockMap` in `src/shared/research.js`); buildings the tree never mentions are gated by era only. The free kit hut skips the research check. The `research` order takes `mode` `queue` (with missing prerequisites), `first`, `remove` (and its dependents) or `clear`. Points go to the first queued node that can be taken now; otherwise they bank up to 500. Progress is kept per node in `n.research.partial`. Era nodes emit a public `era_up` event, and nation rows carry the era for stack markers. Effects in use: `research`, `troop_cap`, `wood_rate`, `food_rate`, `pop_growth`, `defence`. Civilians build and upgrade only to unlocked types. An upgrade needs houses at least `upgradeOccupancy` times needs full and needs of at least `upgradeNeeds` (0.5), because Medieval needs include goods nobody makes yet. The world config's `rules.researchSpeed` speeds research for tests. The world status reports `tickErrors` and `lastError` if the tick loop ever throws.

Open items as of 25 September 2026, in order:

1. Milestone two, step 6 (bulk upgrade menu) is next, once Ryan has reviewed steps 1 to 5.
3. Ryan redeploys when he wants the fine map live: `git pull`, `npm test`, `npx wrangler deploy`.
4. Later: a settings panel to rebind keys; admin tools to delete worlds and remove accounts; a password reset; tax and conscription sliders.
5. Each session's record goes in `devpack/` (see `devpack/README.md`).

Problems found at handoff (details in `plans/milestone-1.md`), all fixed now:

1. `world.js` wires territory and chat only. Combat and bots are not installed, despite what the handover says.
2. `world.js` loads `makeTestMap`, not the Earth map.
3. Join sends raw terrain plus raw owner data, which is 15.5 MB on the Earth map.
4. The bot think tick scans the whole grid once per bot. `npm run bench` currently fails: the worst tick is about 760 to 950 ms against a 50 ms budget.
5. `orderMove` caps pathfinding at 60,000 nodes, too few for long moves on Earth.
