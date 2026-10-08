# Large Scale

Browser strategy game for Ryan and up to seven friends. One persistent world on a real Earth map, running for days or weeks. Territory is taken pixel by pixel like OpenFront, and troops are a number moved by hand as stacks. Cloudflare Worker plus one Durable Object per world, WebSockets, SQLite inside each object. No other services.

Planning is finished. The job now is building the real game, one milestone at a time. On 30 September 2026 Ryan asked to keep going step by step until the project is done. The current milestone is in `plans/milestone-11.md`: engineers and terrain engineering, written as a reading of the design for Ryan to correct, and built. Milestone ten (`plans/milestone-10.md`: the Future era and cruise missiles) is built and waits for its PRs to be merged. Milestone nine (`plans/milestone-9.md`: diplomacy, factions and the endgame) is built and merged. Milestone eight (`plans/milestone-8.md`: the planner and the Modern era) is built and passed its dev server runs. Milestone seven (`plans/milestone-7.md`: gold only, individual soldiers, piloting, planes, easier crossings) is built, passed its dev server run, and waits for Ryan's check. Milestone six (`plans/milestone-6.md`: the Industrial era) is built and waits for Ryan's check. Milestone five (`plans/milestone-5.md`: logistics, with roads, army supply, stores and convoys and sea routes) is built and waits for Ryan's check. Milestone four (`plans/milestone-4.md`, the Gunpowder era) waits only for Ryan's check. Milestone three (`plans/milestone-3.md`: troop types, machine units, the new interface) waits only for Ryan's check. Milestone two (`plans/milestone-2.md`) is done up to step 6; its steps 7 and 8 wait until after milestone three, at Ryan's choice. Milestone one is in `plans/milestone-1.md`; its last step, Ryan's playtest, is done.

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
npm test                  # unit tests (379)
npm run test:reference    # the kit's 95 example tests, kept green as a regression check
npm run bench             # Earth benchmark: 10 game minutes, 400 bots, 8 players with 2,000 buildings each, fails if a tick is over 50 ms
npm run bench -- --map public/map/fine --crop europe --bots auto   # fine Europe
npm run dev               # wrangler dev on http://localhost:8787
$env:INVITE = "code-from-.dev.vars"; $env:MAP = "europe"; npm run smoke   # MAP is test, europe (fine), europe-normal or earth
$env:RECHECK = "1"; npm run smoke   # after restarting npm run dev: the last smoke world reloads identically
$env:MAP = "europe"; npm run ui     # headless browser session with screenshots in .screens; needs Playwright
$env:SOAK_SECONDS = "180"; npm run soak   # two players give random orders; reports tick errors and stock that does not match the stores
```

`npm run map:fine` rebuilds the fine map from the sources in `data/map` (see `reference/docs/map-data-sources.md`). `npm run map:deposits` regenerates `deposits.bin.gz` next to both base maps from `data/deposits.json`; run it after rebuilding a map, and commit the result.

`npm run ui` needs Playwright, which is not a project dependency: `npm install --no-save playwright` then `npx playwright install chromium`.

`npm run bench` takes `-- --bots 200 --players 8 --ticks 2400 --budget 50 --buildings 2000 --ports 4 --rail 200 --tanks 4 --power 1`. Local secrets go in `.dev.vars` (copy `.dev.vars.example`, set `INVITE_CODE` and `PEPPER`). `wrangler dev` and `wrangler deploy` both run `tools/build_public.mjs` first, which writes `public/map/terrain.bin.gz` and copies `src/shared` to `public/js/shared`.

## Layout

```
src/index.js       Worker: routes, static files, websocket handover
src/directory.js   Directory object: accounts, sessions, worlds, members
src/world.js       World object: one per world. Sockets, tick loop, saving, catch-up
src/worldconfig.js map choice (test, earth, europe, lat/long box) and bot count validation
src/sim/           the simulation, 41 modules, plain JavaScript
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
- **Controls.** Keys live in `public/js/keys.js` (F form at pointer, A advance, C advance into unclaimed land only, N advance into one nation's land (click it next), M move, D draw a path (then drag), S split, G merge, X disband or demolish, B build menu (its Zones tab paints zones by dragging; in its Roads tab a click starts a routed road and a second click ends it), T town panel, U research, Y upgrade menu, O planner, K army panel, L logistics panel, R deposits at mid zoom, I world info (schedule, how to win, settings), backquote the admin panel (admins only), Tab next stack, H home, Esc cancel, + and -, Enter confirms a placed building, the arrow keys move the view, and with the crosshair on Space selects and E opens the orders ring). Every key but Esc can be rebound in Settings (the gear, top right). Every control has a mouse and a touch form (Ryan, 26 September 2026). A right-click, or a finger held on the map, opens the ring menu (milestone three, C2); a right-drag with a stack selected still draws the way it goes. Stacks form on any owned plot. A drag that starts on one of your stacks sweeps up every stack it passes into a group, and Shift with a mouse drag draws a box; the group panel (`public/js/ui/group.js`) gives them one `group` order.
- **Capital.** A lost capital moves to the nearest plot the nation still owns, with a `capital_moved` event.
- **Client.** `public/index.html` plus `public/js/`: login, world list (map choice, bot slider), spawn picker, stack panel with route preview, nation list, chat, connection status with reconnect, victory banner. The renderer is the kit's, adapted: territory in 256 by 256 chunk canvases. `src/shared/client.js` holds the client's copy of the world and is shared with the smoke test.

## Milestone two progress

- **Step 1 (25 September 2026, branch `m2-step1-building-layer`).** One building registry in `src/sim/buildings.js` (`world.bld`): buildings by id, a sparse plot index, per-nation sets, a `civilian` flag, and one-byte zone and wood layers. Definitions are in `data/buildings.json`; each type has a `num` that is saved and must never be reused or changed. Construction, civilians, resources and nukes use the registry. Save format 3 adds `zone`, `wood` and `buildings` rows, written only when changed; format 2 worlds load with empty layers. Capturing a building's anchor plot passes it to the capturer. `test/kit/` runs the kit's civilian, resource and construction tests against `src/sim`.

- **Step 2 (25 September 2026, branch `m2-step2-construction`, stacked on step 1).** Protocol 3. Placement rules live in `src/shared/buildings.js`, so the server and the client ghost give the same reason. `build` and `demolish` orders are in `src/game.js`. Human nations get 1 gold a second and the starting kit from `src/sim/economy.js` (`rules.json` `economy`: 100 gold, a finished chieftain hut; food and wood from `civilians.startStock`). Demolish refunds half and leaves rubble for 120 s, which can be built over. Clients get the building table in `hello`, a varint snapshot frame (`MSG.BUILDINGS`) and row changes in `state`, plus a per-player `purse`. Panels: `public/js/ui/build.js` and `building.js`. The world config's `rules.buildSpeed` speeds construction up for tests. The renderer sits construction, damaged and rubble sprites on the ground, because their art is drawn at the top of tall canvases.

- **Step 3 (25 September 2026, branch `m2-step3-civilians`, stacked on step 2).** A `zone` order paints or erases a rectangle of up to 64 by 64 plots. The town economy (`src/sim/civilians.js`) runs every 5 s for human nations only and finds free plots through per-nation zone sets that follow captures, never a map scan. Money is `baseIncome` plus `taxPerResident` per person. The troop cap is the land cap plus `conscriptShare` of the population; Ryan chose land plus people over the kit's population-only cap. Both read per-nation overrides (`n.tax`, `n.conscription`) for the later sliders. Housing demand compares fullness with `resDemandAt` times needs, because the kit's fixed 75% stalled Tribal towns at a dozen huts. Zones reach clients as a join frame (`MSG.ZONE`) and binary diffs (`MSG.ZONE_DIFF`). The purse carries town stats for `public/js/ui/town.js`. Saves use `ON CONFLICT DO UPDATE`, so each row counts once: 4 rows a save with a growing town. Nothing makes food or wood until step 4, so towns stop growing when the 40 wood runs out and shrink when the 50 food does.

- **Step 4 (25 September 2026, branch `m2-step4-resources`, stacked on step 3).** Protocol 4. Deposits are generated once per base map by `tools/build_deposits.mjs` and committed as `public/map/deposits.bin.gz` (72,523 plots, 193 KB) and `public/map/fine/deposits.bin.gz` (302,037 plots, 791 KB). Region worlds crop them, and test maps generate their own and send them in the join. The server keeps deposits as sorted arrays searched by plot. Producers are buildings with a `producer` block in `data/buildings.json`. They take the Resources and Farming tabs, and the field is `crop_wheat`, matching the tech tree. Placement reasons come from `producerError` in `src/shared/buildings.js`; mines may sit on rough ground. `src/sim/resources.js` drains deposits nearest first, cuts the wood layer in whole steps, clears forest into saved terrain edits sent live as `MSG.TERRAIN_EDIT`, regrows cleared land beside healthy forest, and scales farms by fertility and the season at their latitude (`rules.json` `seasons`: 6 game hours a season). Output is scaled by the nation's staffed share of jobs, never below `minWorkforce`, and producer workers count as town jobs. Terrain edits and mined amounts share one `land` row. A producer whose deposits are all used up is drawn dimmed with the depleted deposit sprite, because it covers the deposit. The world config's `rules.produceSpeed` speeds production for tests. A brand-new row costs 2 `rowsWritten` (the key index too), so saves report steady-state rows separately.

- **Step 5 (25 September 2026, branch `m2-step5-research`, stacked on step 4).** Protocol 5. `data/techtree.json` is checked when `src/sim/research.js` loads, and `test/research.test.js` checks it against the sprite manifest and the building registry. A building or zone that a node unlocks needs that node (`lockMap` in `src/shared/research.js`); buildings the tree never mentions are gated by era only. The free kit hut skips the research check. The `research` order takes `mode` `queue` (with missing prerequisites), `first`, `remove` (and its dependents) or `clear`. Points go to the first queued node that can be taken now; otherwise they bank up to 500. Progress is kept per node in `n.research.partial`. Era nodes emit a public `era_up` event, and nation rows carry the era for stack markers. Effects in use: `research`, `troop_cap`, `wood_rate`, `food_rate`, `pop_growth`, `defence`. Civilians build and upgrade only to unlocked types. An upgrade needs houses at least `upgradeOccupancy` times needs full and needs of at least `upgradeNeeds` (0.5), because Medieval needs include goods nobody makes yet. The world config's `rules.researchSpeed` speeds research for tests. The world status reports `tickErrors` and `lastError` if the tick loop ever throws.

- **Playtest fixes (26 September 2026, branch `m2-playtest-fixes`).** Ryan's list from his first milestone-two game, fixed. Details are in `plans/milestone-2.md` under Playtest fixes.
  - Jetties place on the shore.
  - A guided start: a starter research queue in `rules.json` `research.starterQueue`, gathering from buildings with a `gathers` block, and growth held to what food feeds (`civilians.foodReserveSeconds`).
  - The Town panel's next step, and people drawn at close zoom (`public/js/render/people.js`).
  - Own stack destinations in the purse (`orders`), and the advance order's `only` filter.
  - The land-owner tip (`public/js/ui/tip.js`) and an Exit button.
  - World creation for admins only.
  - No page zoom in the game view, and the world list scrolls fully.

  Protocol stays 5: every change is additive.

- **Admin tools (26 September 2026, same branch).** Ryan asked for more admin powers. Everything is checked on the server against the account's admin flag, and every action goes to an admin log: one in the directory, one per world.
  - **Worlds.** `POST /api/admin/worlds/:id/delete` closes every game in the world (close code 4003), empties its storage with `deleteAll()`, then drops it from the directory.
  - **Accounts.** `GET /api/admin/accounts` lists accounts with their last login, and `GET /api/admin/log` gives the directory's log. `POST .../accounts/:id/password` sets a new password and logs that player out everywhere. `POST .../accounts/:id/remove` removes an account; admin names and your own account cannot be removed.
  - **Inside a world**, admin socket ops:
    - rename, save, end and reopen;
    - speed 1 to 8, run as one-second sub-ticks and saved in `meta` `speed`;
    - remove a player (close code 4002): they are banned from that world in the directory's `bans` table, and their nation stays as it is (Ryan's choice);
    - for testing, `give` gold, goods or troops, and `finish` a research queue (`src/admin.js`).

  The limits are in `rules.json` `admin`. The screens are Delete and Accounts on the world list (`public/js/ui/accounts.js`) and the Admin panel in a game (`public/js/ui/admin.js`). Destructive buttons ask twice.

- **Step 6 (26 September 2026, branch `m2-step6-bulk-upgrade`).** The bulk upgrade menu, piece 8's second half.
  - The `upgrade` order in `src/game.js` takes groups (`picks: [[type, count]]`, `filter` all, player or civilian), picks that many finished buildings lowest level first, and runs the kit's `bulkUpgrade`: instant, at `instantPremium` 1.5, missing materials bought at `moneyForMissing` 4 gold before the premium. It returns `done`, `spent` and `skipped` counted by reason.
  - Pricing and chain levels live in `src/shared/buildings.js` (`priceOf`, `planBatch`, `levelsOf`), so the menu's live total is the server's charge.
  - The menu is `public/js/ui/upgrade.js` (Y). It shows groups with counts, locked rows with the reason, clicks or drags down the tick boxes to pick, and a count box per group.
  - Same branch: zoom now runs from half the whole-map view to 64 px per plot (`ZOOM` in the renderer), and the hover tip names deposits (`name` in `data/deposits.json`) with the building that digs them.

- **Orders and descriptions (26 September 2026, branch `m2-orders-descriptions`, stacked on step 6).** Ryan's three asks after step 6.
  - **Advances go looking.** A player's advance (plain, unclaimed only or one nation) with nothing within `advanceRadius` finds a path to the nearest land it wants and walks there (`seek` in `src/sim/territory.js`, at most `seekMaxNodes`). It crosses its own land, and for one nation's land unclaimed land too, never a third nation's; `enter` refuses a third nation's plot met on the way. With nothing reachable it stops with `advance_done` carrying `sought` and `only`, and a seek with no border plot to aim at gives up at once unless an ally borders you. Bots call `orderAdvance` without `seek` and keep the old behaviour.
  - **Descriptions.** Every entry in `data/buildings.json` has a `description`, shown in the build menu, the building panel and the upgrade rows. Buildings with no effect yet say so, and a unit test holds that.
  - **Drawn paths.** `move` and `route` take `via`, up to `MAX_WAYPOINTS` (32) land plots, each leg checked for a land route. The stack walks the legs in turn (`nextLeg`, planning the next when `legAhead` plots are left), and the purse's orders carry the points still ahead. Right-drag draws with a mouse; Draw path (D) makes a one-finger drag draw on touch. `simplifyPath` in `src/shared/pathfind.js` thins the line.
  - **Disbanding costs a quarter.** `dischargeStack` loses `disbandLoss` (0.25) of the troops that leave the stack and sends the rest home only as far as the troop cap has room; what does not fit stays in the stack. At the cap the order is refused. The button and X ask once more. Bots fold stacks back with the old `disbandStack`, without loss.

  Protocol stays 5.

- **Step 7, economy while away (27 September 2026, branch `m2-step7-away`, stacked on `m4-gunpowder`).**
  - A sleeping world catches up its economy on every wake (reload or loop restart), not only troops: `World.catchUp(dt)` runs all end-of-tick systems but the bots, in at most 240 steps (`rules.json` `offline`), spread over ticks within 40 ms.
  - Systems give a whole-step version with `hook.whole` and an order with `hook.rank`; bots mark theirs `live`. Town growth moves at most `civilians.settleStep` per step, so long steps settle where live play does.
  - Away players make 90% (`n.outputMult`) and keep an away record (`n.away`), sent as an `away` message on return and shown by `public/js/ui/away.js`.
  - Details and evidence are in `plans/milestone-2.md`.

- **Policies and passwords (27 September 2026, branch `m2-policies`, stacked on `m2-step7-away`).** Two items from the later list, both settled in the handover.
  - **Tax and army share.** The `policy` order sets `n.taxLevel` (a step of `rules.json` `policy.taxSteps`, None to Very high, 0 to 2 times `taxPerResident`) and `n.conscription` (10% to 60%, 5% steps).
    - Tax above Normal multiplies needs by `1 - taxUnrest` per step above, so fewer people stay and fewer homes upgrade. Below Normal, towns grow up to `taxGrowth` faster.
    - Army share above the old 35% takes producer staff (`conscriptWorkLoss`), and below it adds staff; the stats carry `staff` and `mood`.
    - The sliders are under Policies in the Town panel. Arrow keys on a focused slider now move the slider, not the map.
  - **Password.** `POST /api/password` takes the current password and a new one. A wrong current password counts toward the login lockout. It keeps the session that made the change and logs out the others. The form is `public/js/ui/password.js`, opened by Password on the world list.
  - Evidence: `npm test` 170 of 170 (`test/policy.test.js`), smoke 97 of 97, `npm run ui` 124 of 124 on the test map.

## Milestone three progress

Ryan chose unit types inside stacks (26 September 2026) over drawn soldiers only, individual soldiers, or machine units first; machine units come next, then a new interface. His decisions: one training building line, no counters, everyone sees the full mix, troop types before milestone two's step 7. Branch `m3-troop-types`, stacked on `m2-orders-descriptions`.

- **A1, types and power.** `data/units.json` is the unit registry (`kind` troop now, machine later; append-only `num`). `src/sim/troops.js` (`installTroops`) keeps a `mix` of trained types on every stack and reserve (`n.mix`); levies are the rest of `troops`. It wraps stack forming, splits, merges and disbands, and supplies hooks the territory and combat modules call: `powerOf` (each type's attack, or defence while holding, times experience), `stackAttack` (capture cost is divided by it), `advanceMultOf` (capture rate), `speedOf` (slowest type), `reserveStrength` (defenders' density), `loseTroops` and `loseReserve` (proportional losses), `gainXp` (players' stacks only). Stacks with no mix, every bot stack among them, get exactly the old numbers. State rows add the mix and experience level only when present. Battles stay Lanchester's square law, so a knight with three times a levy's attack is worth about 1.7 levies in a straight fight but pays a third as much to take land.
- **A2, training.** A war camp (Tribal, research Clubs, 1 a second) upgrades to the barracks (2 a second): the `trains` field in `data/buildings.json`. The `army` order sets how many of each type to keep at home (`setKeep`); every `trainEvery` seconds `trainTick` turns levies into the missing types and charges `cost` from the unit data, and records why it is held up. The purse's `army` has the reserve, targets, rate and reason. The Army panel is `public/js/ui/army.js` (K). The world config's `trainSpeed` speeds training up for tests.
- **Ryan's notes (26 September 2026).** Standing orders (the kit's, in `src/sim/offline.js`) now run every 2 s for players who are away: stacks hold by default, which stops an absent player's advance, or fall back when outnumbered (the `standing` order, and a choice in the stack panel). Land-loss events are keyed by loser and attacker, and closing a pocket reports the land it takes. A `presence` message and `hello.online` give the nations list a green light for players online.
- **B1 to B4, machine units (26 September 2026, branch `m3-machines`, stacked on `m3-troop-types`).** Ryan chose the Medieval machines now (catapult, trebuchet, galley, cog) and ships that carry stacks.
  - **Data.** They are `kind: "machine"` entries in `data/units.json`, numbers 10 to 13. The siege workshop (building 47) builds the siege engines, the harbour the ships, and jetties and harbours have `port`.
  - **Simulation.** The kit's `src/sim/units.js` is extended, not replaced, and `installMachines` installs it. Machines move on the stacks' region graph, and ships on a water graph built only once a world has ships; connected bodies are labelled so unreachable targets fail at once.
  - **Battles and siege.** A land machine within a plot of a friendly stack adds its attack or defence through combat's `supportOf` and takes its share of losses as hit points through `battleLoss`, at `hpPerLoss` 1; `supportScale` (1) weights machines in battle. It does not change `stackAttack`. Siege cuts capture cost within range (`siegeAt` in territory). An unguarded land machine is captured by an enemy stack beside it. Hostile ships fight each other, and wrecks clear after 5 minutes.
  - **Queues and ships.** Build queues hold up to 10 and pay as each machine starts. Boarding keeps the troop mix and experience; landing loses 15%, or nothing near your own port, and pays capture cost on held land.
  - **Protocol.** Orders are `produce`, `machine` (move, follow, stop, land) and `board`. Machine rows reach clients in `hello.machines` and `state` `m`/`mg`, and the purse carries `machines`. Rules are in `rules.json` `machines`. The admin can `give` a machine.
  - **Client.** The machine panel is `public/js/ui/machine.js`, with building queues in the building panel and a machines list in the Army panel.
- **Part C, the new interface (26 September 2026, branch `m3-interface`).** Ryan's decisions: a click on another nation's land only shows info, with Attack in the ring; a right-click always opens the ring; the guided start is in this milestone. C1 to C5 are built; details and evidence are in `plans/milestone-3.md`.
  - **Layout (C1).** Leaderboard top left (`nations.js`), status pill top middle, icons top right, control panel bottom left and action bar bottom middle (`hud.js`, icons from the ui sheet through `icons.js`), events feed with a Chat tab bottom right (`feed.js`; `chat.js` is gone). Selected things, the build menu and the town panel are cards in the right column (`#side`). Events go to the feed; toasts are for order results. The purse carries `vitals`; `hello` carries `seasonRules` and `time`.
  - **Ring (C2).** `ring.js`, filled by `ownerItems` and the stack and machine panels' `ringFor`. The `attack` order forms a stack at your land nearest the click and advances into that owner only.
  - **Map (C3).** Names and troops on territory (`render/labels.js`, a distance transform, 7 ms on Earth every 2 s). The attacks panel (`attacks.js`) with Stop (the `halt` order) and a red frame while you lose land.
  - **Guide (C4)** in `guide.js`, and **Settings (C5)** in `settings.js`; key bindings and toggles are kept in the browser.
  - **Nation card** in `nation.js`: a click on another nation's land or its leaderboard row.
- **Ryan's asks after PR 17 (26 September 2026, branch `m3-controls`).**
  - **Upgrades.** The menu (`upgrade.js`) says what will happen ("Upgrade 1 of 3", or how much more gold is needed), lists what can be done now first and folds the rest under Not yet, and uses - and + per row; rows update in place. The building card has Upgrade, through the `upgrade` order's new `ids`.
  - **Placing.** A click pins the outline with Build here and Cancel (`place.js`); Settings keeps one-click placing (`prefs.place`). Paint (`prefs.paint`, also in the building bar) places on every free spot a drag passes and stops when the money runs out.
  - **Crosshair** (`aim.js`, Settings, Accessibility): the game acts at the middle of the screen, with Select and Orders buttons, Space and E on a keyboard. Map clicks are ignored while it is on.
  - A second click on a stack standing on a machine selects the machine.
- **A3, showing them.** The stack panel lists the mix and rank. At close zoom stacks are drawn as one to five figures of their main type from the kit's `units` sheet, walking, facing and fighting; levies use the `hunter` figure. Flags rise above the figures, and one to three gold chevrons show experience. The client's unit table is `world.unitTypes`; `state.units` belongs to the renderer's machine units.

## Milestone four progress

Ryan's decisions (26 September 2026): towers and forts change combat; stop at the end of Gunpowder, with Age of Industry coming with the Industrial slice; Gunpowder before milestone two's step 7. Branch `m4-gunpowder`, stacked on `m3-controls`.

- **Data.** 14 Gunpowder research nodes, 4 troops and 4 machines (unit numbers 14 to 21), 8 buildings (numbers 48 to 55): bank, library, school, theatre, courthouse, star fort, cannon foundry and shipyard.
- **Effects.** `src/sim/effects.js` (`installEffects`) adds up building `effects` with each type's `cap` every two seconds, into `n.bfx`. `world.effectOf(n, key)` reads research and building effects together; use it, not `n.effects` directly. Libraries and schools use the `research` field with a `cap`.
- **Forts.** A `fort` block (`radius`, `defence`) on the three towers and the star fort. `world.fortAt(owner, plot)` gives the strongest covering fort, used in capture cost and for stacks holding their own land. The client has its own `fortAt` for the tip and the reach ring.
- Details and evidence are in `plans/milestone-4.md`.
- **Ryan's asks after PR 19 (27 September 2026, branch `m4-asks`, stacked on `m2-policies`).** Details in `plans/milestone-4.md`.
  - Research queues fill era requirements (`planPath` in `src/shared/research.js`).
  - An advance skips plots that became its own.
  - The town hall and parliament gather.
  - **Guard** (`src/sim/guard.js`, `installGuard`, a `live` hook): the Guard standing order, and the `guard` order for troops at home (`n.guard`). `s.guard` marks a stack on guard duty, and any order through `ownStack` clears it.
  - The research panel is a tree (`layoutTree`).
  - Settings can arrange panels (`public/js/ui/layout.js`, `ls_layout`, elements get the `placed` class).
- **Ryan's asks after PR 22 (27 September 2026, branch `m4-swipe`, stacked on `m4-asks`).** Details in `plans/milestone-4.md`.
  - With the crosshair on, Select is a toggle while zoning or painting: press, move, press again.
  - While a player is away, an advance into unclaimed land goes on; a plain advance takes only unclaimed land until they are back.
  - Swipe selection and the `group` order (up to 100 stacks: advance, move in formation, gather, halt, standing, disband).
  - **Schedules.** `src/shared/schedule.js` checks the four times (start, peace ends, overtime begins, end) and gives the phase. The admin op `schedule` saves them in `meta` `schedule` and in the directory's world `config`, for the world list. Before the start only `spawn` is accepted; during peace a wrapper on `sim.hostile` stops humans attacking humans; at the end `endBySchedule` gives the win to the player with the most land. Each event is broadcast once as `phase`; `hello` carries `schedule`, `info` and `now`.
  - **Overtime** (`src/sim/overtime.js`, `installOvertime`, a `live` hook): every `shrinkEvery` seconds each nation's border ring except its capital turns unclaimed, spread over ticks (`rules.json` `overtime`, `schedule`). State carries `shrinkIn`.
  - **World info** (`public/js/ui/worldinfo.js`, I): the schedule with countdowns, how to win, the settings, and the host's editor. The status bar counts down to the next event; the feed reminds at an hour, ten minutes and a minute.

## Milestone five progress

Logistics, agreed 27 September 2026 (`plans/milestone-5.md`), in four parts: roads, army supply, stores and convoys, sea routes. Ryan checks each part before the next.

- **Part A, roads and bridges (27 September 2026, branch `m5-roads`, PR 24).**
  - `src/shared/roads.js` is shared by the server and the client's preview.
  - The kit's `src/sim/logistics.js` gains `installRoads`, `layRoad`, `setRoad`, `restoreRoads` and `takeRoadNews`. Roads change `world.moveCost`, which stacks, land machines and route planning all use. Use `world.pathMinStep()` as a search's `minStep`.
  - The layer is `world.log.road`, saved through `bld.extra` and sent as `MSG.ROAD` and `MSG.ROAD_DIFF`.
  - The `road` order lays dirt, or cobble after Paved roads; bridges over rivers cost 5 times and mountain roads 4 times (`rules.json` `roads`).
  - Roads and buildings keep off each other's plots.
  - The Roads tab is in the build menu (B).

- **Part B, army supply (27 September 2026, branch `m5-supply`, PR 25).** `src/sim/supply.js` (`installSupply`):
  - Reach is 18 plots of travel from the capital and any store holding food (`store` blocks in `data/buildings.json`), shared with the client through `src/shared/supply.js`.
  - Stacks carry 600 s beyond reach (`s.carry`), then weaken to half (`s.supplyMult`, applied in `powerOf` and `stackAttack`) and slowly desert.
  - Supply wagons are stacks with `kind: "supply"` and `supplies`: the `wagon` and `follow` orders, loaded from store cards.
  - Two players are worked out a tick; bots are left out. Rules are in `rules.json` `supply`.
- **Free transport boats (same branch).** `src/sim/boats.js` (`installBoats`): a move or attack with no land route walks to your coast and crosses in a free boat (unit 22), losing 1% plus 0.1% a plot of water, up to 15%. At most 3 at sea; warships sink them. Rules are in `rules.json` `boats`.
- **Part C, stores and convoys (28 September 2026, branch `m5-stores`, PR 26).** Ryan asked for it before his check of A and B. `src/sim/stores.js` (`installStores`); rules in `rules.json` `stores`; choices in `plans/milestone-5.md`.
  - **Goods live in stores.** Each store building keeps `b.goods`, and capacity is per good (`store.capacity`; `seat` marks the seat of government line). A nation with no store keeps a camp at its capital (`n.camp`).
    - `n.stock` stays the total. `sync(world, n)` spreads changes made straight to `n.stock` (towns eating, town goods, admin gifts, road costs) across the stores. Call it before taking from a particular store.
    - `n.stored` is the total at the last sync.
  - **A building's store** is its nearest store within 12 plots of travel (`homeOf`, from a labelled cost map per nation, `labelMap` in `src/shared/pathfind.js`).
    - Producers fill it, then a buffer of 20, then stop (`roomFor`, `deliver`).
    - Sites take from it and wait for carts for the rest (`b.need`).
    - Training, machine queues and upgrades take from it, and training and machines ask for more (`poolOf`).
  - **Carts.** They are convoys (`world.stores.convoys`), one good each. Capacity and speed come by era.
    - At most 12 on the road per nation, and at most 4 path searches a tick; paths are cached.
    - A hostile stack beside a cart takes its cargo, and a captured store changes hands with its goods.
  - **Standing orders.** The `store` order sets Want and Keep per store and good; Keep is never below Want.
  - **Saving and catch-up.** The `stores` row is saved through `bld.extra` and checked on reload. Catch-up moves goods without travel.
  - **Client.** Clients get convoy rows in `hello.convoys` and `state` `c`/`cg`, and the purse's `logistics`. The Logistics panel is `public/js/ui/logistics.js` (L); store cards show goods and standing orders.

- **Ryan's asks after PR 26 (28 September 2026, branch `m5-asks`).** Details in `plans/milestone-5.md`.
  - **Roads.**
    - In road mode a click marks where a road starts and a second click where it ends. `routePlan` in `src/shared/roads.js` finds the cheapest way round buildings, water and foreign land, reusing roads; Lay road (or Enter) lays it.
    - Dragging still draws; a click used to lay one plot, because the input layer ends every road gesture as a drag (`endRoadDrag`).
    - Connect stores (`src/sim/autoroads.js`, the `connect` order) links every store to the capital's roads. Its standing order (`n.autoRoads`) connects new stores by itself.
  - **The menu** (`public/js/ui/menu.js`, `liveview.js`) has the list on the left and a live world on the right, like Terraria's title screen.
    - The live view is a watch socket (`?watch=1`, tag `watch:<account>`): no nation, no presence, every message ignored. You can watch any listed world you were not removed from.
    - Logged out, it pans across the Earth terrain.
    - The last opened world is remembered in `ls_last_world`.
    - A watch closes after 20 minutes or when the tab is hidden, so an idle menu does not keep a world awake.
  - **Scheduling from the list.** Scheduling is on the list, on each world's card (the host's Schedule button, `POST /api/admin/worlds/:id/schedule`) and when a world is made (`config.schedule`). All three go through `World.setSchedule`.
  - **Soak test.** `npm run soak` (`test/soak.mjs`). It found purses sent straight after an admin gift running ahead of the stores; `purse()` now syncs first.
  - Asset loading moved to `public/js/assets.js`, shared by the game and the menu.

- **Part D, sea routes (28 September 2026, branch `m5-sea`).** `src/sim/sea.js` (`installSeaRoutes`), called by the stores through `world.stores.sea`; rules in `rules.json` `stores.sea`; choices in `plans/milestone-5.md`.
  - A convoy whose land way is missing, or over 40 plots and 1.5 times slower than going by water, walks to your port, crosses in a free merchant ship (unit 23, `freight`), and walks on from your far port. Ports are stores with `port`: jetty, harbour, shipyard and commercial port.
  - Warships sink merchant ships and their cargo (`hitBy` names who). Merchant ships take no orders.
  - A port still being built takes its own materials off the ship (`portSite`), so land taken by boat can get its first port.
  - Convoy rows carry the ship's id as an eighth field; the client hides the cart while it is at sea.

## Milestone six progress

The Industrial era, branch `m6-industry`, stacked on `m5-sea` (28 September 2026). Ryan's power grid choices: plants and poles, half rate off the grid, trains from station to station. Details and evidence are in `plans/milestone-6.md`.

- **Research and content.** Age of Industry and fifteen nodes; buildings 56 to 66 and units 24 to 32. Admins can give coal, steel and oil.
- **Steel.** The steel mill is a producer of kind `convert` (`in`, `out`, `rate`): inputs come from its own store, which asks for more, and `setShort` in `src/sim/stores.js` records what it waits for.
- **Rail and trains.** Rail is a road kind that needs Railways (`needs: "rail"`). A cart between two stations (`station` in `data/buildings.json`) with a rail-only path (`railPath`) runs as a train (`c.train`, `rules.json` `stores.train`). Convoy rows carry a ninth field for trains.
- **Power.** `src/sim/power.js` (`installPower`, rank -2, every 5 s) and `src/shared/power.js` (`gridsOf`, `coverOf`, `polePlan`). Plants have `power`, poles `pole`, users `uses`; users get `b.power` (1 on a full grid, 0.5 off it), applied to producers, factory goods, machine building and building effects. The purse carries `power`, and `hello` carries `powerRules`. The `poles` order lays a line.
- **Client.** The Power tab (with the pole line tool, `roading === "pole"`), rail in the Roads tab, the power overlay (`view.powerCover`), power lines on building cards, and trains drawn as `loco_steam`. The `energy` sheet is loaded.

## Milestone seven progress

Ryan's asks of 28 September 2026: one currency, individual soldiers, piloting, planes, and easier crossings. His decisions are in `plans/milestone-7.md`: gold only with old worlds converted, individual soldiers selected by an Armies button, up to 1,000 soldiers attacking with strength growing by era, at most 100 planes and 100 warships, no limit on trade, piloting of everything now, and the order boat fix, gold, soldiers, piloting, planes. The plan's reading of those answers (a soldier raised from 10 home troops, trade ships and trains that earn gold, bots keeping stacks) waits for Ryan's word.

- **Part A, crossing by sea with Move (28 September 2026, branch `m7-boats`, stacked on `m6-industry`).**
  - The `route` order answers a trip over water with the boat plan (`boatTrip` in `src/game.js`): the walk to the coast, the crossing, the landing, the loss and the time. Move (M) used to stop at "no land route there".
  - A group crossing shares one key (`BOAT_GROUP`, a symbol clients cannot send), counted once against `boats.maxBoats`, and keeps its formation on the far side.
  - A drawn path may cross water once (`crossingOf` in `src/sim/boats.js`); `sendByBoat` takes `from`, `via` and `group`.
  - Selected stack, machine and group cards keep their room in the side column, and the folded feed stays inside its column on short screens.
- **Part B, gold only (29 September 2026, branch `m7-gold`, stacked on `m7-boats`).** Milestone five's stores, carts, army supply and sea routes are gone (`src/sim/stores.js`, `sea.js` and `supply.js` are deleted), and so is the steel of milestone six.
  - **Costs.** Every cost in `data/` is gold, converted once by `tools/gold_only.mjs` at the worths in `rules.json` `economy.worth`.
  - **Retired buildings.** They carry `retired: true` and are refused by `placeError`: the woodcutter, quarry, clay pit, sawmill, steel mill and the three store buildings.
  - **Income.**
    - Producers earn `goldOf(kind, amount)` (`src/sim/resources.js`), reported as `n.made`.
    - Towns grow on housing and jobs, and shops and works earn `stats.trade`.
    - Power plants cost `power.upkeep` gold.
  - **Trade (`src/sim/trade.js`, `installTrade`).**
    - Ports send free trade ships (unit 23) to friendly ports in the same water, and both ends are paid on arrival.
    - Hostile warships capture them.
    - Stations send trains along rail-only paths, drawn from the convoy rows.
    - The purse carries `trade` (`tradeView`), and `hello` carries `goldRules`.
    - While away, trade is paid as an estimate, only for ports with a partner (`partnersOf`) and stations joined by rail to another.
  - **Old worlds.** Save format 4. `convertToGold` in `src/sim/economy.js` turns stock, store goods, carts, wagons and retired buildings into gold on load.
  - **Client.** The Logistics panel (L) is now the Trade panel. The HUD shows gold and people, and the build menu hides retired buildings.
- **Machine limits and Part C, soldiers (29 September 2026, branch `m7-soldiers`, stacked on `m7-gold`).** Details and the reasons for the design are in `plans/milestone-7.md`.
  - **Machine limits.** `rules.json` `machines.limits` caps land machines, warships and planes at 100 each (`limitError`, `fleetOf` in `src/sim/units.js`). Admin gifts stop at the limit too.
  - **Companies.** A player's stack is a company, and every 10 troops (`soldiers.troopsEach`) is a soldier.
    - `src/shared/soldiers.js` counts soldiers by type (`soldierTypes`) and gives the formation (`formationSlot`), the same on both ends.
    - `src/sim/soldiers.js` (`installSoldiers`) keeps a player to 1,000 soldiers and 100 companies in the field, and trims old worlds on load.
    - The `detach` order takes picked soldiers, by type, out of their companies.
    - Bots are not limited.
  - **Path budgets.** Advancing stacks look for the border at most `seeksPerTick` (8) a tick. Stacks extend paths at most `extendsPerTick` (12) a tick while they still have plots left to walk.
  - **Client.**
    - Above `soldiers.drawZoom`, companies are drawn soldier by soldier, on screen only, within a budget by screen size (`soldierSpots`, `soldiers` in the renderer). Stacks glide between plots (`prev`, `movedAt`).
    - Armies (V, `toggleArmies`) turns a swipe or a Shift-drag box into picking soldiers (`app.picked`). The soldiers panel is `public/js/ui/soldiers.js`.
- **Part D, piloting (29 September 2026, branch `m7-pilot`, stacked on `m7-soldiers`).**
  - **Server.** `src/sim/pilot.js` (`installPilot`) keeps a position inside the plot for each piloted company or machine (`s.pilot`, `u.pilot`).
    - The normal stack stepping skips piloted stacks.
    - The `pilot` order takes (`op: "take"`, with `follow`) or releases control. Any other order on the unit releases it too.
    - `op: "input"` messages (move, aim, fire) skip the order limiter and have their own (`pilot.inputsPerSecond`).
    - `World.startPilots` runs a 50 ms loop only while something is piloted, and broadcasts `pilots` (rows and shots) every 100 ms.
  - **Client.**
    - `ClientWorld.pilots` and `pilotAt`; the renderer's `stackPoint` and `machinePoint` use them, and `drawShots` draws tracers.
    - `app.pilotFrame` sends input and follows the unit with the camera.
    - `public/js/ui/pilot.js` has the banner, and the stick and Fire button on phones.
    - P pilots; WASD or the arrows move, the mouse aims, a held click or Space fires.
- **Part E, planes and bombing (29 September 2026, branch `m7-air`, stacked on `m7-pilot`).**
  - **Content.** Flight unlocks the airfield (`airbase`, `antiAir`), the biplane fighter and the bomber (`bomb` in `data/units.json`). Anti-aircraft guns unlock the flak tower (`antiAir`).
  - **Simulation.** `src/sim/air.js` (`installAir`, a postTick hook with a whole-step version) keeps each plane's flight in `u.air`: base, position, heading, fuel, bombs, mission, landed and rearm.
    - `orderPlane` checks the radius from the airfield; `drop` resolves a bombing.
    - Fighters hunt and dogfight through buckets, and flak sites hit planes overhead.
    - Bombed plots are cheaper to take through a `captureCost` wrapper, and damaged buildings repair themselves.
    - Rules are in `rules.json` `air`.
  - **Orders.** The `air` order: patrol, bomb or return. The admin's `give machine` places planes at an airfield.
  - **Rows.** A plane's machine row carries a tenth field (`planeRow`), which the client reads into `u.air`. `planeAt` glides planes between samples.
  - **Client.** `drawPlane` (rotated, with a shadow), `drawFlak`, and a bomb blast effect. The machine card has Patrol, Bomb and Fly home. B, or the Bomb button, drops bombs while piloting a bomber.

## Milestone eight progress

Agreed 29 September 2026 (`plans/milestone-8.md`), on branch `m8-modern`, stacked on `m7-air`. Ryan's decisions:

- All of the Modern era is in: army, air power and SAMs, navy, nukes, and tourism and downtowns.
- An automatic planner comes first. It proposes projects (towns, economy, civic and upgrades, defence) drawn as outlines with a price, and builds only what the player approves, from one queue.
- Nukes cost gold only and are very expensive.
- Troops go by air in transport helicopters and as paratroopers.
- Submarines dive by water depth and cannot be hit in deep ocean, but rise to fire.

- **Part A, the planner (29 September 2026, PR 36, base `m7-air`).** Details and evidence are in `plans/milestone-8.md`. Smoke 114 of 114, soak clean, and `npm run ui` 170 of 171, with the one failure a test race that is now fixed. On the bench the planner adds about 2 ms at the median, but the machine ran 2.5 times slower that afternoon, so the 50 ms budget needs a rerun.
  - `src/shared/planner.js` (`proposePlan`, `piecePlots`) proposes projects from a view of the world: `ClientWorld.planView()` in the browser, and `planView` in `src/sim/planner.js` on the server.
  - `src/sim/planner.js` (`installPlanner`, rank 5) keeps each nation's queue (`n.plan`) and kept-clear areas (`n.keepClear`), and runs the `plan` order (`add`, `cancel`, `clear`, `keep`). Rules are in `rules.json` `planner`.
  - The purse carries `plan` (`planSummary`). The queue goes as a `plan` message when it changes, and in `hello` with `planRules`.
  - The Planner card is `public/js/ui/planner.js` (O, and Plan in the action bar). The renderer draws `view.plan` (`drawPlan`). Keep land clear is the zone drag in the `keep` mode.
  - Deposits moved from the action bar to the corner icons. The zoom buttons are hidden on touch screens (`pointer:coarse`), so the bar and the corner fit on a phone.
- **Part B, the Modern Age and its army (29 September 2026, PR 37, base `m8-modern`).** Details and evidence are in `plans/milestone-8.md`.
  - **Research.** `age_modern` (in the Industrial column) and twelve Modern nodes. Every Modern building is behind one.
  - **Units.** Soldiers, special forces and anti-tank teams (units 35 to 37, barracks). Main battle tank, APC and rocket artillery (38 to 40, vehicle factory).
  - **APCs.** The ships' boarding code now covers land machines with a `capacity`: `embark`, `disembark` with no loss, the `board` order, `land`, and a `machine` move that sets the troops down where it stops (`unloads`).
  - **Capture.** A carrier with troops aboard is not captured. When an enemy stack comes beside it, the troops get out (`captureLoose` in `src/sim/units.js`).
  - **Client.** The machine card has Unload for carriers, and a stack's ring has Board the APC.
- **Part C, air power and air defence (29 September 2026, PR 38, base `m8-army`).** Details and evidence are in `plans/milestone-8.md`.
  - **Content.** Jet engines, Strategic bombing, Helicopters, Airborne forces and Guided missiles. Paratroopers (unit 41); jet fighter, strategic bomber, attack and transport helicopters, transport plane (42 to 46); SAM truck (47); the air base (building 69, the airfield's upgrade, drawn from `parts`) and the SAM site (70, the flak tower's upgrade).
  - **`src/sim/air.js`.** `airbase` blocks give reach and rearming slots (`baseRules`, `A.queued`). Bombers drop in a line (`stick`). `hover` and `strike` make the attack helicopter. Transports take the `drop` mission (`unload`, `dropTroops` for piloting). SAM sites and trucks (`sam` blocks, `launchers`, `samView` in the purse as `sams`) fire `sam_fired` missiles and reload for gold. All air-defence hits on a plane in a tick combine through `combined` with `air.overlap`.
  - **Boarding.** `embark` takes a transport on the ground; `paraOnly` takes only paratroopers.
  - **Planner.** `planAirDefence` proposes SAM sites (`planner.sams`, `samNear`).
- **Ryan's asks after PR 38 (29 September 2026, PR 39, base `m8-air`).** Details and evidence are in `plans/milestone-8.md`.
  - **Cheats** (`src/sim/cheats.js`, `installCheats`, installed last): `n.cheats` holds `gold`, `troops`, `build`, `research`. Admin ops `cheat` and `researchAll`; the purse carries `cheats`.
  - **Helpers.** `meta` `powers` maps accounts to powers (`POWERS` in `src/admin.js`: world, speed, schedule, kick, give, cheats); `adminAllowed` checks every admin op. The `powers` op is for full admins; `hello.powers` and the `powers` message tell the client, and `game.can(power)` and `game.canAdmin` gate the panel.
  - **Research.** `research.maxQueue` is 150, so a whole path from the first era fits.
  - **Taps.** A press on a control sets `game.uiHold`; `updatePanels` waits (at most 600 ms) and the click clears it first.
  - **Colours.** `public/js/ui/theme.js` (`THEMES`, `SECTIONS`, `applyTheme`), stored as `ls_theme`; Settings has Colours. Buttons and fields use `--btn`, `--field`, `--primary`, `--on-bg`.
  - **Bombers** (branch `m8-bombers`, stacked on `m8-asks`): both reach 4,000 plots with 6,000 and 8,000 s of fuel, so they bomb anywhere on the map.
  - **Ranks.** `rankSlots` in `src/shared/soldiers.js` replaces the spiral: the leader in front, ranks of at most 12. The renderer keeps each drawn soldier's position (`troopPos`), moves it at its own pace, faces the company (`facing` angle), draws the fallen for 3 s, and puts the marker over the leader (`leaderAt`).
- **Part D, the Modern navy (29 September 2026, branch `m8-navy`, stacked on `m8-bombers`, PR 42 against `main`).** Details and evidence are in `plans/milestone-8.md`.
  - **Content.** Modern navy, Submarines, Aircraft carriers and Amphibious warfare. The cruiser, battleship, submarine and aircraft carrier (units 48 to 51, naval dock), and the landing craft (52, free).
  - **Submarines.** `diveOf` gives the depth by water (0 shallow, 1 open, 2 deep), and `canHit` says who can hit it (`asw`, `sub` or `strike` at depth 1, nobody at 2), both in `src/sim/units.js`. Ship battles, flak, helicopter strikes and piloting all ask `canHit`. Firing holds a submarine at depth 1 for `navy.surfaceSeconds`. A submarine sinks trade ships (`sink` in `src/sim/trade.js`, `trade_sunk`).
  - **`src/sim/navy.js`** (`installNavy`) keeps `u.dive` and lets battleships (`shell`) hit the nearest hostile company in range (`u.shelling`).
  - **Carriers.** A plane's home is an airfield or a carrier (`homeOf`, `nearestHome`, `A.ship` in `src/sim/air.js`). The `air` order's `base` moves it. Machines with `antiAir` fire like flak.
  - **Landing craft.** `boatType` in `src/sim/boats.js` picks them after Amphibious warfare; `lossMult` halves the loss.
  - **Rows.** A ship's machine row adds an eleventh field, `[dive, firing]`, when it dives or fires.
  - **Gifts.** `giveMachine` puts a ship at the dock or port on the biggest body of water (`bodySize`), not in a lake by the capital.
- **Part E, nukes and missile defence (29 September 2026, branch `m8-nukes`, stacked on `m8-navy`, PR 43 against `main`).** Details and evidence are in `plans/milestone-8.md`.
  - **Content.** Nuclear weapons, Thermonuclear weapons and Missile defence. The missile silo (building 71, `silo`) and the ABM silo (72, `abm`). Warheads are in `rules.json` `nukes.warheads`, each with the research it `needs`.
  - **`src/sim/nukes.js`** (the kit's module, extended; `installNukes` after the navy). Silos and warheads in flight live on the nation (`n.nuke`). `buildWarhead`, `cancelWarhead`, `checkLaunch` and `launchWarhead` back the `nuke` order. `defencesAt` and `resolve` roll ABM silos, SAM sites and SAM trucks at impact, and `detonate` applies the blast through `setTerrain`, `setRoad`, `claim` and the building states.
  - **Rules.** `world.nukes.on` comes from `info.nukes` (the admin op `nukes`, World power), and `world.peace` blocks launches. The events `nuke_launched`, `nuke_intercepted` and `nuke_detonated` always go to everyone.
  - **Network.** The purse carries `nukes` (`nukeView`: silos and ABM interceptors), and `hello` carries `nukes` (`flightsOf`) and `nukeRules`. `ClientWorld` keeps `nukes`, `blasts`, `siloOf`, `abmOf` and `simNow`.
  - **Client.** `public/js/ui/nukes.js` has the silo card, the aiming (`game.view.nukeAim`) and the alert (`#nuke-alert`). The renderer's `drawNukes` draws flights, circles and blasts.
  - **Planner.** `planMissileDefence` proposes ABM silos (`planner.abms`, `abmNear`).
- **Part F, tourism and downtowns (30 September 2026, branch `m8-tourism`, stacked on `m8-nukes`, PR 44 against `main`).** Details and evidence are in `plans/milestone-8.md`.
  - **Content.**
    - Mass tourism and Skyscrapers research.
    - Ten tourism buildings (73 to 82, a `tourism` block with `value` and an optional `season`; `rule: "coast"`, or `near` for terrain within a distance).
    - Office block and skyscraper (83, 84: civilian commercial, `downtown`, `core`, `variants`).
    - Nine wonders (85 to 93, `wonder: true`).
    - The air base has `airport`.
  - **`src/shared/tourism.js`** has `tourismIncome` (variety, reach, wonders), `coreCentre` and `coreStrength`. `src/shared/buildings.js` has `wonderErrorOf` and `nearTerrain` in `placeError`; views supply `buildingList` and `nameOf`.
  - **`src/sim/tourism.js`** (`installTourism`, every 5 s):
    - `tourismOf` works out a nation's tourism, and pays it into `n.money`.
    - `wonderRace` announces `wonder_built` and clears rival sites with `wonder_lost`.
    - The purse carries `tourism` (`tourismView`).
  - **`src/sim/cbd.js`** (`installCbd`): a sparse per-nation core field from buildings with `core`, refreshed every 5 s, and a `captureCost` wrapper.
  - **Downtowns.** In `src/sim/civilians.js`, `downtownError` checks the roads on two sides and the busy shops, and `absorbable` lets a downtown upgrade take in shops inside its footprint.
  - **Client.**
    - Tourism and Wonders tabs.
    - `ClientWorld.coreAt` and `wonderOf`.
    - The Town panel's `#town-tourism` and `#town-visitors`.
    - Sprite `variants` in the renderer.
    - `hello` carries `tourismRules` and `cbdRules`.
  - **Planner.** `planTourism` proposes new kinds of attraction and a free wonder (`planner.tourism`, `tourismNear`).

## Milestone nine progress

Written 30 September 2026 (`plans/milestone-9.md`), on branch `m9-diplomacy`, stacked on `m8-tourism`. Ryan asked to keep going until the project is done, so the plan's decisions are mine, read from the design, and wait for his word. Diplomacy goes before the Future era, because the win and war both depend on it.

- **Part A, relations and war (30 September 2026).** Details and evidence are in `plans/milestone-9.md`.
  - **`src/sim/diplomacy.js`** (the kit's module, extended; `installDiplomacy` before the bots). Only pairs of players go through it: bots are attacked without a declaration and still never attack players. New worlds start at peace; worlds saved before it keep every pair at war.
  - **The `diplo` order:** war (after `warNotice`, 5 minutes by default), propose peace, an alliance or a treaty, accept, decline, withdraw, leave an alliance, break a treaty, and embargo. Rules are in `rules.json` `diplomacy`.
  - **Effects.** Allies cross each other's land (`passable`); peace, a left alliance or an embargo sends stacks in the other's land home (`sendHome`); an embargo stops trade (`friendly` in `src/sim/trade.js`). Refusals give `peaceReason`.
  - **World.** The state row carries `diplomacy`. `hello` carries `diplomacy` and `dipRules`, and `sendDiplomacy` sends changes. The admin op `diplomacy` and the world config set `warNotice`. Diplomacy events go to everyone (`DIPLO_EVENTS` in `src/game.js`) and into the away summary.
  - **Client.** The Diplomacy panel (`public/js/ui/diplomacy.js`, J, a corner icon with a count), relations in the ring, nation card and leaderboard, the war countdown (`#war-chip`), and `ClientWorld.relation` and `canAttack`.
- **Part B, factions, chat channels and map notes (30 September 2026, branch `m9-factions`).** Details and evidence are in `plans/milestone-9.md`.
  - **Factions.** The `diplo` order founds (`faction`), `invite`s, `quit`s, `expel`s and `rename`s, up to `maxFactionSize` (a host setting: 2, 3 or 4). Members are allied and defend each other.
  - **Winning.** `victory` in `src/game.js` gives a faction's win (`factionWin`, with `faction` and `members`), but not while one faction holds every player and nobody is out. `mostLand` decides the end time by side.
  - **Chat.** Channels are global, faction and private (`chatReach`, `sendTo` in `src/world.js`; new columns in the chat table), with `typing`.
  - **Notes.** `src/sim/notes.js`: the `note` order, up to 20 a nation, shared with allies (`notesFor`), and the `notes` message.
  - **Client.** The Faction section of the Diplomacy panel, the chat tab's channel picker, the note card (`public/js/ui/notes.js`), the ring's Note item and the pins (`drawNotes`).
  - **Fixed.** A carrier holding troops counts as a company (`companiesOf`), so landing cannot pass the 100-company limit.
- **Part C, the endgame (30 September 2026, branch `m9-endgame`).** Details and evidence are in `plans/milestone-9.md`.
  - **Vassals.** `surrender` in a war, accepted by the other side. A vassal follows its overlord's relations (`lords`, `status`), cannot declare war or propose, counts on its side (`winnerKey`), and pays `tribute` (25%) of its income (`incomeOf`, from `vitalsOf`). `free` releases it; a fallen overlord frees it.
  - **Second commanders.** `command` invites an eliminated player (up to `maxCommanders`). Their socket acts for that nation (`nation` and `self` in the attachment and `hello`); `CLOSE.ROLE` (4004) makes their page reconnect when the role changes. `resign`, `dismiss`, or the nation's fall ends it.
  - **The record.** The `record` table (`keepRecord`, `RECORD`) and the `history` table of quarter-size owner pictures (`snapshot`, every game hour, `rules.json` `history`). `GET /api/worlds/:id/history[/:n]` opens when the world has ended, or to admins. The record panel is `public/js/ui/record.js`.

## Milestone ten progress

The Future era and cruise missiles (`plans/milestone-10.md`, branch `m10-future`, stacked on `fix-rules-duplicate`, PR 48). Ryan asked to keep going, so the plan's choices are mine and wait for his word. Details, the changes from the plan and the evidence are in the plan.

- **Part A, cruise missiles.** The `cruise` warhead (`conventional`) from the missile silo after Cruise missiles research; `lockMap` keeps `anyOf` so either node opens the silo. `strike` in `src/sim/nukes.js` hurts troops, buildings and machines but clears no land. The host's nuclear switch does not stop it, and the alert shows it only to the two sides.
- **Part B, the Future economy.** `age_future` and five nodes. Fusion reactor (94, no upkeep), vertical farm (95, producer kind `indoor`), dome habitat (96, built on new residential land), arcology (97, grown from eco towers and domes, `absorbs` the homes inside it; `upgradeOnly` keeps it and the eco tower out of `bestTypeFor`), and two wonders (98, 99).
- **Part C, the Future army.** Drone operators (53), hover tank (54), mech (55), recon and strike drones (56, 57), VTOL gunship (58), and the drone hangar (100), whose `airbase.only` keeps other planes out (`takesPlane` in `src/sim/air.js`). Gifted planes go to a building that makes them.
- **Part D, shields, railguns and orbital strikes.** `src/sim/shields.js` (`installShields`): shield generator (101) and node (102) join `defencesAt` at their power and halve bomb harm (`bombCut`). `src/sim/railguns.js` (`installRailguns`): the railgun battery (103) shoots the nearest enemy company or vehicle (`railgun_fired`), looking through grid buckets (`rules.json` `railguns`). The orbital uplink (104) holds the `orbital` warhead, which only shields stop (`shieldOnly`). `planShields` in the planner; shield domes and cover rings in the renderer.
- **Hit test.** The renderer's `stackAt` also counts a click near a company's own spot (`cx`, `cy` on the markers), not only near its leader, so the middle of a big company's ranks selects it.
- **Evidence.** `npm test` 349, smoke 135 of 135, UI 198 of 198, soak clean. The bench fails on a busy machine with or without Future content (median 36.9 ms without, 36.6 ms with); rerun it on an idle machine.
- **Tests.** `test/future.test.js`, `test/shields.test.js`, and new planner, nukes and data tests. `npm run bench` takes `--future 1` (on by default). `npm run ui` stubs Google Fonts unless `OFFLINE_FONTS=0`, because the headless browser on Ryan's machine cannot reach them.

## Milestone eleven progress

Engineers and terrain engineering (`plans/milestone-11.md`, branch `m11-engineers`, stacked on `m10-future`). Ryan asked to keep going, so the plan's choices are mine and wait for his word. Details, the changes from the plan and the evidence are in the plan.

- **Digging.** `src/sim/engineering.js` is the kit's module, extended.
  - `installDigging` adds the crews (engineer soldiers within 1 plot, at most 5), saving through `bld.extra.eng`, and the `eng` message, with `hello.eng` and `engRules`.
  - Terrain hit points by class: rock 300, hard 180, soft 90, made 40. Roads and bridges go first.
  - The `dig` order takes `op` dig, charge (200 gold for 150 damage), build, tunnel or cancel. Foreign land needs a war, with `terrain_dug` warnings.
  - Sappers unlocks the engineer (unit 59).
- **Building up.** The recipes are in `rules.json` `engineering.recipes`. A causeway onto water claims the new land.
- **Tunnels.** A road kind (`TUNNEL` in `src/shared/roads.js`) that moves at 0.4 whatever the rock, laid plot by plot by tunnel jobs. Each end is drawn as `tunnel_entrance`.
- **Engineering vehicle** (unit 60, Tunnelling): works as 5 engineers.
- **Route graphs.** Changes in what can be crossed set `eng.graphStale`, and the graphs are dropped at most every 30 s.
- **Accidents.** `damageTerrain`: bombs (`air.js` `drop`) and battleship shells (`navy.js`) wear down terrain and cut roads.
- **Client.** The ring offers dig, charge and build items next to engineers (`public/js/ui/engineering.js`). The tip shows hit points. The renderer's `drawDigs` draws worn plots and job bars.
- **Rail cache.** Rail paths are cached against `log.railVer`, which only rail changes bump. One shared version made every road change re-search them.
- **Evidence.**
  - `npm test` 369, and soak clean.
  - Smoke: 135 of 136 on the last run, with the one failure a rate-limit timing check on a busy machine.
  - The UI run and the full bench still need an idle machine; the dev server stalled under load.

## After milestone eleven (8 October 2026)

**Ryan's fixes (branch `fix-controls`, PR 51).**

- **Right-click.** The ring blocks the browser's context menu: the menu used to open with Inspect over the ring.
- **Phones.**
  - A tap on the map opens the ring. This is `prefs.tapRing`, which Settings can turn off.
  - The canvas cancels the browser's own click after a tap, which used to choose the ring's centre item.
- **Armies.** The Armies button and Q open the all-troops panel (`public/js/ui/troops.js`), which sends group orders to every company. Picking soldiers is V.
- **Upgrades.** `growError` in `src/shared/buildings.js` is one room-to-grow check for the server, the upgrade menu, the building card and the planner.
- **The feed** no longer throws on events with a numeric `from`.

**The planner's cities (branch `planner-cities`, stacked on PR 51; plan and evidence in `plans/city-planner.md`).** These are new in `src/shared/planner.js`:

- **Districts:** grids of 3 by 3 lots with streets on every side.
- **New cities** on open land 24 plots from every town.
- **Main roads** to towns, ports, stations, airfields and mines.
- **Growth room** that farms and power plants keep clear.
- **Next-size room** for buildings that grow when upgraded.

The rules are in `rules.json` `planner` (`district`, `growRoom`, `newCityGap`, `newCityMin`, `mainRoads`).

**Evidence on an idle machine:** `npm test` 375, smoke 137 of 137, UI 202 of 202, soak clean.

**Bench.** The full Earth bench was idle-machine, and on `main` it gives a median tick of 15.6 ms, a 99th percentile of 54.2 ms and a worst of 79.2 ms. It fails the 50 ms worst-tick budget before this work too, and no system it times reaches 50 ms on its own. Overtime now peaks at 32 ms.

**Test hygiene.**

- `npm run ui` deletes the worlds it makes unless `KEEP_WORLDS=1`.
- The local dev state had 1,575 test worlds, which slowed the world list.

**Bigger nukes and salvos (9 October 2026, branch `big-nukes`, stacked on `planner-cities`).** Ryan asked for nukes "way stronger, like 50x50 tiles", or nukes that combine.

- **New warheads** in the missile silo:

  | Warhead | Radius | Gold | Research |
  |---|---|---|---|
  | `megaton` | 25 | 250,000 | Megaton warheads (Modern) |
  | `strategic` | 50 | 600,000 | Strategic warheads (Future) |
  | `doomsday` | 100 | 1.5 million | Doomsday device (Future) |

- **Salvos** (`checkSalvo`, `launchSalvo` in `src/sim/nukes.js`). The `nuke` order with `silos` fires 2 to `salvoMax` (12) silos at one spot as one flight.
  - The blast areas add up: the radius is the square root of the sum of the squares, capped at `maxRadius` 200 times the map scale.
  - `resolveSalvo` rolls the defences for each warhead (`nuke_intercepted` with `partial`), and only the warheads that get through make the blast.
  - The silo card has "Fire with N more silos".
- **Craters** grow with the warhead (`craterShare` of the inner radius).
- **Timing:** a radius-100 blast takes about 10 ms in one tick, and the radius-200 cap about 23 ms.
- **Fixed:** `setTerrain` drops worn engineering hit points, so a plot changed by a blast no longer reports hit points out of 0.

Open items as of 8 October 2026, in order:

0. Milestone eleven is built on `m11-engineers`, PR 50 against `main`.
   - PR 48 is merged (6 October). Merge PR 49, then PR 50.
   - Merge PR 51 (fixes), then the planner PR.
   - Find what makes the bench's worst tick 80 ms on an idle machine. The bench does not time it, so it needs a tick-level breakdown.
   - Next: atmosphere, then host rules with the dev panel.

Open items as of 7 October 2026, in order:

0. Milestone ten is built on `m10-future`. PR 48 (`fix-rules-duplicate`) removes the repeated `cbd` key that wrangler warned about when Ryan deployed on 2 October; merge it before milestone ten. Next, in order: engineers and terrain destruction, atmosphere, and host rules with the dev panel.
1. `npm run bench` needs a run on an idle machine: on 8 October, with Minecraft running, it failed the 50 ms budget with or without Future content, on an overtime shrink (108 to 223 ms).
2. Ryan's terminal shares the working directory, so `npx wrangler deploy` deploys whichever branch is checked out there. Deploy from `main` after merging, ideally from a separate worktree (`git worktree add ..\large-scale-deploy main`).

Milestone nine's open item (30 September 2026): Part A (`m9-diplomacy`, PR 45), Part B (`m9-factions`, PR 46) and Part C (`m9-endgame`, PR 47) are merged. Their last dev server runs passed smoke (123, 126, 130), UI (192, 194, 195) and the soak.

Earlier open items (29 September 2026):

1. PRs 14 to 35 are merged. PR 35 brought `m6-industry` into `main`, and PR 30 (`m7-boats`) reached `main` with it. PRs 31 to 34 (milestone seven, Parts B to E) are merged into their stacked branches only. After PRs 41 to 44 Ryan redeploys: `git pull`, `npm test`, `npx wrangler deploy`. Smoke, soak and `npm run ui` passed for milestone seven's Parts B to E on 29 September 2026 (numbers in `plans/milestone-7.md`). Milestone seven is complete apart from Ryan's checks. Milestone eight: PRs 36 to 40 (the planner, the Modern army, air power, his asks after PR 38, bombers) are merged too. But every PR from 31 to 40 was merged into the branch below it, after that branch had gone into `main`, so `main` stopped at PRs 30 and 35. PR 41 brings `m8-bombers` into `main`: it merges cleanly, and the result is identical to `m8-bombers`. PR 42 (`m8-navy`, Part D), PR 43 (`m8-nukes`, Part E) and PR 44 (`m8-tourism`, Part F) are against `main` too, so each diff narrows to its own part once the PRs before it are in. Merge 41, 42, 43, 44 in that order. Smoke, UI and soak passed on `m8-asks` (117, 183, clean), on `m8-nukes` with Parts D and E on 30 September 2026 (119, 188, clean), and on `m8-tourism` with Part F the same day (120, 190, clean). Milestone eight is built; Ryan's check of it is next.
2. Ryan's check of troop types, machines and the new interface (milestone three, A4, B5 and C6).
3. The new main menu is merged (PR 27); Ryan's check is next. Later: military as individual units instead of numbered stacks (Ryan, 27 September 2026).
4. The Gunpowder era is built (milestone four), and Ryan's check (G7) is next. Ryan chose full logistics before the Industrial era (27 September 2026): `plans/milestone-5.md` is logistics, agreed with his four answers (materials carried, stacks carry 10 minutes of supplies, raiders take convoy cargo, bots ignore supply), and `plans/milestone-6.md` is the Industrial era with his decisions (aircraft wait for Modern, stop at the end of Industrial, a real power grid). Then Modern and Future, and the dev panel. Walls are not buildable yet: the tree names wall sprites, but only towers are buildings.
5. Ryan registers `rw_scorch` on the live site himself (the assistant cannot create live accounts); `ADMIN_NAMES` makes it admin. If the name is taken, a one-time reset through a wrangler secret is the fallback.
6. Milestone two, step 7 (economy while away) is built on `m2-step7-away`; step 8 is Ryan's check.
7. Later: the stat-editing dev panel of piece 14. Tax and army share sliders and self-service passwords are built on `m2-policies`.
8. Each session's record goes in `devpack/` (see `devpack/README.md`); `tools/devpack.mjs` writes the conversation record. The pack for 25 to 27 September is done.

Problems found at handoff (details in `plans/milestone-1.md`), all fixed now:

1. `world.js` wires territory and chat only. Combat and bots are not installed, despite what the handover says.
2. `world.js` loads `makeTestMap`, not the Earth map.
3. Join sends raw terrain plus raw owner data, which is 15.5 MB on the Earth map.
4. The bot think tick scans the whole grid once per bot. `npm run bench` currently fails: the worst tick is about 760 to 950 ms against a 50 ms budget.
5. `orderMove` caps pathfinding at 60,000 nodes, too few for long moves on Earth.
