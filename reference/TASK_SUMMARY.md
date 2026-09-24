# Task summary

## The game in one paragraph

Large Scale is a browser game for you and up to seven friends:

- **World.** One persistent world on a real Earth map, lasting days to weeks and kept running when everyone is offline.
- **Territory.** Territory is taken pixel by pixel, OpenFront style.
- **Troops.** Troops are a number, but you move them by hand as stacks.
- **Civilians.** Civilians live in your land, have needs, and build and upgrade their own homes, shops and restaurants in zones you paint.
- **What you build.** You place the government, military and infrastructure.
- **Eras.** Everyone starts in the Tribal era and climbs through Medieval, Gunpowder, Industrial and Modern to a near future, each on their own schedule, through four upgrade trees.
- **Goods.** Goods physically travel by road, rail and sea.
- **Market.** One automatic market sets prices for resources, upgrades and information.
- **Diplomacy.** Alliances, treaties, embargoes, war declarations and guild-style factions shape the politics.
- **Winning.** The last player or faction standing wins.

## Locked decisions at a glance

The full list, with reasons, is in `docs/design-decisions.md`.

| Area | Decision |
| --- | --- |
| Platform | Browser, no install. Mobile gets the full game, landscape only |
| Players | 2 to 8 friends, invite only, no public lobbies. Weak bots fill leftover land |
| Hosting | Cloudflare Worker plus one Durable Object per world, WebSockets with hibernation. GitHub Pages cannot run the live server |
| Persistence | World runs for days or weeks. Empty worlds sleep and fast-forward the economy on wake. Attacks only happen while someone is connected, and offline players are defended by their buildings and standing orders |
| Map | Real Earth, 1 map pixel = 1 plot. Terrain always pixel by pixel. Map editor comes after release |
| View | Straight top-down, 16 px per plot at full zoom, zooming out to a whole-world pixel view |
| Troops | A count per nation, split into stacks you move by hand. Supplies also move as stacks |
| Vehicles, aircraft, ships | Individual units |
| Economy | Money plus physical goods moved by road, rail and ship. Automatic global market. No player-to-player deals |
| Civilians | Simulated population with needs. They self-build in zones and self-upgrade over time. Their buildings also appear in the bulk upgrade menu |
| Your buildings | Placed by you, upgraded through the bulk menu: sort to lowest version, swipe to select, upgrade all |
| Eras | Real history order, independent per player, four branching trees (military, economy, civic, government) |
| Not in the game | Unrest, riots, pollution, government types, internal politics, spying and sabotage |
| Social | Typed chat (global, faction, private), hand-drawn pixel flags, nation name and colour |
| Rules | Host sets world rules. Stats are edited in an in-game dev panel only you can use, checked on the server |
| Win | Last player or faction standing |

## The 18 pieces

Build in this order. Each row points to its folder, where `GUIDE.md` explains the piece and `example/` holds tested code.

| # | Piece | Depends on | Main output | Example code and checks |
| --- | --- | --- | --- | --- |
| 1 | Map renderer | none | Pixel terrain, territory, sprites, zoom levels, night | `renderer.js`, `atlas.js`, browser demo |
| 2 | Server base | none | Worker, accounts, world Durable Object, WebSockets, saving | Full server, smoke test with 17 checks |
| 3 | Nations and territory | 2 | Spawning, plot ownership, troop growth, stacks, capture | `territory.js`, 8 tests |
| 4 | Combat and bots | 3 | Stack battles, elimination, bots, victory check | `combat.js`, `bots.js`, 5 tests |
| 5 | Civilians | 3 | Population, needs, zoning, self-building and upgrades | `civilians.js`, 6 tests |
| 6 | Resources | 3 | Finite deposits, mines, forests, farms | `resources.js`, 5 tests |
| 7 | Logistics | 6 | Roads, convoys, stockpile nodes, supply range | `logistics.js`, 5 tests |
| 8 | Player construction | 5, 7 | Placement rules, construction, bulk upgrade menu | `construction.js`, 5 tests |
| 9 | Eras and upgrade trees | 8 | Tech tree data, research, era advance | `techtree.js`, sample tree, 5 tests |
| 10 | Market | 7, 9 | Prices, buying and selling, info, upgrade licences | `market.js`, 6 tests |
| 11 | Diplomacy and factions | 4 | War notice, treaties, alliances, embargoes, factions | `diplomacy.js`, 5 tests |
| 12 | Offline play | 2, 4 | Sleep and catch-up, offline defence, standing orders, alerts | `offline.js`, 5 tests |
| 13 | Social | 2, 11 | Chat channels, typing, flag editor | `chat.js`, `flag.js`, editor demo, 5 tests |
| 14 | Host rules and dev panel | 2 | World settings, admin-only stat editing with undo | `config.js`, `devpanel.js`, 4 tests |
| 15 | Units | 4, 7 | Vehicles, ships, aircraft, landings, paratroopers, mines | `units.js`, 4 tests |
| 16 | Later eras | 9, 15 | Gunpowder to Future content, tourism, nukes | `nukes.js`, `tourism.js`, 4 tests |
| 17 | Atmosphere | 1, 6 | World clock, seasons, day and night, weather | `atmosphere.js`, 5 tests |
| 18 | Earth map and release | all | Earth terrain pipeline, balancing, launch checklist | `build_earth.py`, test on real data |
| 19 | Terrain engineering and city cores | 3, 7, 15 | Destructible and buildable terrain, CBD strength | `engineering.js`, `cbd.js`, 7 tests |

Piece 10 now also carries `orderbook.js` with 5 tests, because the market became a board of player listings in round four.

Pieces 1 and 2 can be built at the same time because they do not touch each other. After that, the numbering is a sensible order, but pieces 11 to 14 can move around to suit you.

## Later rounds of decisions

`docs/design-decisions.md` now also covers the third question round: terrain hit points, simplified money-like resources, physical ammunition, no fog of war, city cores, and the new offline rules (production at your online average minus 10 percent, troops defending 5 percent weaker). Supporting documents:

- `docs/tutorial-and-onboarding.md` for what a new player must be told and when
- `docs/simplicity-rules.md` for the no-hyper-management rule and what is automated
- `docs/notifications-and-accounts.md` for push, Discord and email alerts, and login improvements
- `docs/expandability-and-mods.md` for keeping the game easy to extend, and player-made content later

## Pacing

`docs/pacing-and-longevity.md` is a separate plan for stretching a world over days or weeks without it going flat: travel time, integration time on captured land, administration upkeep, seasons as a campaign rhythm, refillable goals, session loops, and the host settings that set world length.

## Milestones

1. **Land grab (pieces 1 to 4).**
   - What it is: log in, spawn, grow troops, send stacks, take land, fight, beat bots.
   - Test: play it with friends on a small test map for an evening. If this is not fun, fix it before adding economy.
2. **Living nation (pieces 5 to 9).**
   - What it is: civilians fill your zones, you mine and farm, goods move by road, you place buildings and climb from Tribal into Medieval.
   - Test: run a world for a full week of real time.
3. **Politics (pieces 10 to 14).**
   - What it adds: market, diplomacy, factions, offline protection, chat and flags, world rules and your dev panel.
   - Result: from here the game can run as a real multi-day world.
4. **Full history (pieces 15 to 17).**
   - What it adds: vehicles, ships and aircraft, the later eras, nukes, weather, seasons, and day and night.
5. **Release (piece 18).**
   - What it adds: the Earth map, balancing passes and the launch checklist. The map editor follows.

## Status right now

| Item | State |
| --- | --- |
| Design questionnaire | Done, 50 questions plus follow-ups, all answered |
| Hosting choice | Done: Cloudflare Workers and Durable Objects |
| Asset pack | Version 2 done, 1,999 sprites. Tall buildings, three infantry facings, night lights, lots under buildings and patched sprites are all in |
| Example code for all 18 pieces | Done and tested as described in `START_HERE.md` |
| Real game code | Not started. The next step is piece 1 and piece 2 in your own repository, using the examples as the base |

## The starting repository

`project-template/` is a runnable skeleton of the real project: `src/` for the server with the simulation in `src/sim/`, `public/` for the client, `data/` for stat files, `tools/` for scripts and `test/` for both kinds of test. It passes its own tests and its end-to-end smoke test. `docs/project-layout.md` explains the split and how the Durable Objects are created on deploy.

## The question rounds

Four rounds are now answered, 182 questions in all. The full record, question by question, is in `assets/DESIGN_QUESTIONS.md`, and the resolved rules are written up in `docs/design-decisions.md`.

## Open questions for you

These came up while writing the guides. Each guide says what the example assumes, so nothing is blocked, but you may want to decide differently.

1. **Market upgrades.** The example lets a player who has researched an upgrade sell a licence for it once. Any other player can then buy it, more cheaply the more players already own it. Is that what you meant by the market selling and buying upgrades? (Piece 10)
2. **Embargo meaning.** With no player trading, the example makes an embargo block the target's convoys, ships and troops from passing through your land and ports. Anything else it should do? (Piece 11)
3. **World clock.** The default is one game day per real hour and six days per season, so a real day holds one full year. Faster or slower? (Piece 17)
4. **Catch-up cap.** Worlds fast-forward at most 72 hours of economy when they wake. Longer gaps are dropped so a forgotten world does not explode. Keep 72? (Piece 12)
5. **Nukes.** Nukes are on by default and can be turned off by the host. Inner-radius land becomes neutral crater and scorched ground, with no lasting fallout, since pollution is out. Right? (Piece 16)
6. **Map size.** The plan is 3,600 by 1,440 plots for the Earth map, about 11 km per plot at the equator. That is roughly 5 million plots, which fits the server memory with care. Smaller is safer. Bigger means bigger countries. (Piece 18)
7. **Faction size.** The example caps factions at 4 nations. With 8 players, that allows two big blocs. (Piece 11)
8. **Paid plan.** The free Cloudflare plan covers one world running around the clock during development. Real multi-day worlds with 8 players are safer on the $5 a month paid plan. See `docs/architecture.md`. (Piece 2)

## Security reminder

Earlier in the planning chat, a login and password were pasted for the dev panel. The server example never stores credentials in code:

- Admin rights come from the `ADMIN_NAMES` setting on the server, checked at every login.
- Passwords are hashed with a secret pepper.
- If that password is used anywhere, change it.
