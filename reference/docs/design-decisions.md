# Design decisions

This records what was decided in the planning questionnaire and follow-ups, and what each decision means for the code. When a guide says "decided", it points here.

## Scope and players

- **Browser game, no install.** Everything runs in a web page on desktop and mobile. There is no launcher and no app store.
- **2 to 8 friends, invite only.** There are no public lobbies. The server example requires an invite code to register, so a stranger who finds the URL cannot join. With so few players, balance is tuned for small groups and a handful of bots, not for hundreds of strangers.
- **Weak bots fill leftover land.** Bots expand slowly and, by default, never attack players. The host can switch that on. Their job is to make the map feel inhabited and to be soaked up, not to win.
- **Mobile gets the full game, landscape only.** Every feature must work with touch:
  - drag to pan, pinch to zoom
  - long-press for context
  - swipe to select in the bulk upgrade menu
  Portrait is not supported, so the UI can assume a wide screen and ask the player to rotate.
- **Start from scratch.** Marchfront and Deepfront code is not reused. Lessons from them are fine, and the examples here are new code.

## World and time

- **Persistent world lasting days to weeks, running while everyone is offline.** Players come and go, and the world keeps its state.
- **How "running while offline" works on the server.** A Durable Object that loops forever is billed forever. So, as agreed in the hosting analysis:
  - the world stops ticking when the last player leaves
  - it saves and goes to sleep
  - when someone returns, it fast-forwards the peaceful parts of the simulation: troop growth, civilians, production, construction and research
- **Attacks only happen while someone is connected.** Nothing can hit a nation while the world is asleep, because nothing moves. While a world is awake, an offline player's nation is protected by:
  - a defence bonus
  - its defensive buildings, which fight on their own
  - standing orders on each stack: hold, or fall back to the nearest city when outnumbered
- **Win condition: last player or faction standing.** Bots do not count. A faction whose members are the only humans left alive wins together.
- **Host sets world rules.** Map, player cap, bot count and aggression, speed, starting era, peace time, war notice, offline defence, catch-up cap, faction size, nukes, day length, season length, weather and fog. Some lock when the world starts. See piece 14.

## Map and terrain

- **Real Earth map first.** Development happens on small generated test maps, and the first release uses Earth. The map editor comes after release.
- **One map pixel is one plot.** Territory is owned plot by plot, OpenFront style. Buildings sit on plots:
  - small ones on one plot
  - airports, factories, ports and castles on several
- **Terrain is always pixel by pixel.** There are no terrain tiles. Each plot is coloured from a palette per terrain type, with five shades chosen by noise and a palette per season. The 16 px sprites are only for things on top: buildings, lots, roads, decorations and units.
- **Zoom from world to single buildings.** At the widest zoom a plot is under one screen pixel. At 3 to 10 px per plot, map icons replace sprites. From 10 px per plot the full sprites draw, and 16 px per plot is native.
- **Straight top-down view with a slight tilt**, so roofs and front walls both show. It is not isometric.
- **Terrain affects gameplay.** It changes movement cost, defence, capture cost, fertility and what can be built. See `shared/terrain.js`.
- **Ore deposits are finite and fixed.** They are placed at map build time and never respawn. Fish is the only renewable deposit. Forests regrow slowly on unowned land.
- **Weather and seasons affect play.** Movement, farm yield and air operations all change. See piece 17.

## Eras and progression

- **Everyone starts in the Tribal era.** Eras follow real history: Tribal, Medieval, Gunpowder, Industrial, Modern, Near future.
- **Players advance independently.** One player can be Industrial while another is still Medieval. That gap is the point.
- **Four branching trees:** military, economy, civic and government. Each era has an "age of" node that needs a number of upgrades across several branches.
- **No automatic visual upgrade of player buildings.** Instead, the bulk upgrade menu:
  1. sort to the lowest upgraded version
  2. swipe to select a run
  3. upgrade them all at once
  This is paid instantly from treasury and stockpile, at a premium.
- **Civilian buildings do both.** Civilians upgrade their own buildings over time when the era is unlocked, their needs are met and materials are available. Those buildings also appear in the bulk menu, with a civilian-only filter, for an instant paid upgrade.

## People and economy

- **Civilians are a simulated population with needs:** food, housing, jobs and, from Medieval on, goods. Needs drive growth and upgrades. Unmet food makes the population shrink.
- **SimCity-style zoning.** You paint residential, commercial, industrial and farm zones. Civilians build in them on their own when there is demand.
- **You place the rest:** government, military and infrastructure.
- **Money plus physical goods.** Money is a number in your treasury. Goods sit in stockpile nodes (storage yards, warehouses, depots, ports) and must be moved by road, rail or ship to be used elsewhere.
- **Automatic global market.** A single in-menu market sells and buys resources, upgrades and information, with prices set by supply and demand. There are no manual deals between players.
- **Tourism income** from parks, museums, stadiums, resorts and wonders. It changes with the season.
- **Troops are drawn from the population.** The troop cap follows population, and conscription costs people.
- **Armies need supplies and weaken far from supply lines.** Supplies move as stacks, like troops.

## Military

- **Troops are a count, moved by hand as stacks.** Your nation has a garrison number. You split stacks off it, move them, merge them and send them to advance.
- **Vehicles, aircraft and ships are individual units** with hit points.
- **Naval invasions and paratroopers:** embark on transports, sail, land on coasts, or drop troops from aircraft within range.
- **Explosive mines** can be placed on your land or no-man's land next to it. They are hidden from enemies.
- **Nukes and superweapons** in the Modern and Future eras, with interception. The host can turn them off.
- **Alliances, treaties, embargoes and war declarations**, plus guild-style factions that hold several nations.

## Things deliberately left out

They keep the game focused on land, logistics and war between friends.

| Feature | Decided |
| --- | --- |
| Unrest, riots, protesters | No |
| Pollution, smog, pollution heatmaps | No |
| Government types | No |
| Internal politics | No |
| Spying and sabotage, intelligence agency | No. The market sells limited information instead |
| Manual player-to-player trade | No. The market only |
| Portrait mobile layout | No |

## Social and customisation

- **In-game chat with proper typing:** global, faction and private channels, with typing indicators and rate limits.
- **Nation name, colour and flag.** The flag is hand-drawn in game with a pixel editor, 32 by 20 pixels, 16 colours.

## Stats and the dev panel

- **Stats live in editable data files:** terrain, buildings, units, tech tree, combat and market tuning.
- **Editing happens in an in-game dev panel that only your account can open.** The server checks an admin flag on the account. It is never a password baked into the page, since anything in the page can be read by anyone. Every edit is range checked, versioned, logged and undoable.

## Round three: terrain, ammunition, information

**Terrain destruction**

- Terrain has hit points rather than a timer, so several players can chip at a plot, stop and return.
- Only engineer units do the work, and it costs resources as well as time.
- Destroyed rock becomes rubble that is still slow. Rubble can be cleared.
- Nothing is permanent: materials rebuild what was destroyed.
- Digging inside enemy land needs a war, and the defender is warned while it happens.
- Engineers also build terrain up: causeways, embankments, levelled ground, replanted forest.
- Bridges and roads fall far faster than rock. Nukes and heavy bombardment can open a route by accident.
- Tunnels are a separate, slower project that leaves the mountain standing.

**Resources kept simple**

- Gold is the currency. Silver, copper, iron and the rest are worth a fraction of gold and can be spent as money.
- Special materials (explosives, missiles, fuel, uranium) stay separate, because they carry real decisions.
- The guiding rule is no hyper-management: see `simplicity-rules.md`.

**Ammunition and supply**

- Missiles are not bought with money; they are produced and delivered like any other good, through the same convoy and stockpile system.
- An empty site is useless until a convoy reaches it, so cutting supply is a way to break a defended area.
- Guns need shells, lasers need power.
- Ammunition state is visible to the owner only, and is spent per shot, so saturation attacks drain a defence.
- Restocking is automatic: troops resupply their own defences rather than waiting for orders.

**Information**

- No fog of war. Every building and every stack, including counts, is visible to everyone.
- The market no longer sells intelligence. It sells things: planes, ships, vehicles, resources.
- Alerts are automatic when something is aimed at you.
- Players can mark and share map notes with allies and faction members.
- The world log is for the developer during a world, and becomes public once the world ends.

**City cores**

- Attack and defence both grow the closer a fight is to a nation's core, with defence gaining more. See piece 19.

**Offline**

- While a player is away, their nation produces at their online average minus 10 percent.
- Their troops defend 5 percent weaker. This replaces the earlier offline defence bonus.
- Attacks still only happen while someone is connected.

**Vehicles**

- Crews can dismount anywhere and return for the vehicle later.
- An enemy can re-crew an abandoned vehicle, and any troops can do it.
- Abandoned vehicles do not decay.
- Walking troops move at the same speed whether or not they left a vehicle.

## Round four: the remaining gaps

**Engineering.** Digging is never interrupted by nearby enemies. A mountain plot falls in about a minute of work, not a session. Charges are paid for with money, or simply carried by engineers, rather than being a produced resource. Rebuilding costs no more than destroying. Player-built terrain can be destroyed like natural terrain. Rubble is cleared by whoever owns the plot. Tunnels need an entrance at each end. Damaged terrain is drawn, not just counted.

**Missile defence.** There are no radar buildings at all: launchers work on their own. Missiles come from ordinary factories. An empty site still looks like a site. Air defence can fire on ground targets, badly. Shields cover an area, and anti-missile cover can move with an advance.

**The market is a board of player listings.** Everything traded is listed by a player at their own price, so there is no single world price and no haggling. Buying takes the cheapest listings first, delivery takes time, and the market refuses goods from an era you have not reached. There is no daily selling cap. Ores are spendable as money, so no separate trade screen is needed, and gold stays worth far more than the rest.

**City cores.** Any high-value building counts toward a core. A nation can hold several, the bonus is strongest at the biggest, cores grow with population rather than being placed, losing one weakens the whole nation, and bots get the same rules.

**Automation.** Bulk actions everywhere, standing orders for convoys, automatic recruitment to a target garrison, and one place that lists everything idle. Research can be queued. Overlays live in a menu rather than a cycle button, and one-handed phone play is not a requirement.

**Onboarding.** A first world with a guide layer, no head start, the offline rules explained before the first log off, and no separate glossary page.

**Notifications.** Discord alerts and in-game push are both worth building. What gets sent is up to each player's settings. Sessions last for weeks on a phone.

**Endgame.** A world has a planned end date announced at the start. An eliminated player can watch, join a friend's faction as a second commander, or surrender first and continue as a vassal. When the world ends, the full log and map history become public.

**Mods.** Data packs only to begin with, chosen by the host per world, with maps shareable as files and mod art expected to match the one 16 px style.

## Art

- **Consistent 16 px per plot.** Terrain stays pixel by pixel underneath.
- **You source or make the art.** The generated pack in `assets/` is a complete, rule-following starting set you can replace sprite by sprite.
