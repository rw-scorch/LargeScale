# Large Scale

Browser strategy game for Ryan and up to seven friends. One persistent world on a real Earth map, running for days or weeks. Territory is taken pixel by pixel like OpenFront, and troops are a number moved by hand as stacks. Cloudflare Worker plus one Durable Object per world, WebSockets, SQLite inside each object. No other services.

Planning is finished. The job now is building the real game, one milestone at a time. The current milestone is in `plans/milestone-4.md`: the Gunpowder era, the first slice of the kit's later eras. Milestone three (`plans/milestone-3.md`: troop types, machine units, the new interface) waits only for Ryan's check. Milestone two (`plans/milestone-2.md`) is done up to step 6; its steps 7 and 8 wait until after milestone three, at Ryan's choice. Milestone one is in `plans/milestone-1.md`; its last step, Ryan's playtest, is done.

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
npm test                  # unit tests (160)
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
src/sim/           the simulation, 25 modules, plain JavaScript
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
- **Controls.** Keys live in `public/js/keys.js` (F form at pointer, A advance, C advance into unclaimed land only, N advance into one nation's land (click it next), M move, D draw a path (then drag), S split, G merge, X disband or demolish, B build menu (its Zones tab paints zones by dragging), T town panel, U research, Y upgrade menu, K army panel, R deposits at mid zoom, backquote the admin panel (admins only), Tab next stack, H home, Esc cancel, + and -, Enter confirms a placed building, the arrow keys move the view, and with the crosshair on Space selects and E opens the orders ring). Every key but Esc can be rebound in Settings (the gear, top right). Every control has a mouse and a touch form (Ryan, 26 September 2026). A right-click, or a finger held on the map, opens the ring menu (milestone three, C2); a right-drag with a stack selected still draws the way it goes. Stacks form on any owned plot.
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

Open items as of 26 September 2026, in order:

1. PRs 14, 16 and 17 are merged. PR 18 (`m3-controls`: upgrades, placing, crosshair) waits for Ryan's merge; `m4-gunpowder` is stacked on it and gets its own PR after that. Then Ryan redeploys: `git pull`, `npm test`, `npx wrangler deploy`.
2. Ryan's check of troop types, machines and the new interface (milestone three, A4, B5 and C6).
3. A "guard" standing order that sends a stack out to meet enemies inside your land, if that is what Ryan meant by autodefend (asked 26 September 2026).
4. The Gunpowder era is built (milestone four), and Ryan's check (G7) is next. After it: the Industrial slice with Age of Industry and a steel mill, then Modern and Future. Walls are not buildable yet: the tree names wall sprites, but only towers are buildings.
5. Ryan registers `rw_scorch` on the live site himself (the assistant cannot create live accounts); `ADMIN_NAMES` makes it admin. If the name is taken, a one-time reset through a wrangler secret is the fallback.
6. The town hall and the parliament gather nothing, so upgrading a great hall loses its food and wood. Their descriptions say so; whether they should gather is Ryan's call.
7. Milestone two, step 7 (economy while away), then step 8 (Ryan's check).
8. Later: players changing their own password (only the admin can set one now); tax and conscription sliders; the stat-editing dev panel of piece 14.
9. Each session's record goes in `devpack/` (see `devpack/README.md`).

Problems found at handoff (details in `plans/milestone-1.md`), all fixed now:

1. `world.js` wires territory and chat only. Combat and bots are not installed, despite what the handover says.
2. `world.js` loads `makeTestMap`, not the Earth map.
3. Join sends raw terrain plus raw owner data, which is 15.5 MB on the Earth map.
4. The bot think tick scans the whole grid once per bot. `npm run bench` currently fails: the worst tick is about 760 to 950 ms against a 50 ms budget.
5. `orderMove` caps pathfinding at 60,000 nodes, too few for long moves on Earth.
