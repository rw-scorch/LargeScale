# Milestone three: troop types, then machine units, then a new interface

Ryan's order (26 September 2026): unit types inside stacks first (option 2 of the four put to him), then machine units (option 4), then a rework of the whole interface after studying openfront.io and frontwars.io. This takes the place of the old milestone-three list (roads, convoys, stockpile nodes and army supply), which moves after it.

## Decisions (answered by Ryan, 26 September 2026)

1. **Training buildings: one building line.** A war camp in the Tribal era upgrades to a barracks, and it trains every type your research has unlocked. The Archery and Stirrups research unlock only the soldier types.
2. **No counters.** Each type has attack, defence and speed, nothing more.
3. **Everyone sees the full mix** of every stack.
4. **Troop types now.** Milestone two's step 7 (the economy while away) and step 8 (Ryan's check) wait until after.

## Part A: troop types

Troops stay a count, so "troops are a count" still holds. What changes is that every stack and every nation's reserve holds counts by type, and each type has a power level.

### A1. Types and power in the simulation

- `data/units.json` becomes the one registry for every unit, with `kind` either `troop` (counted in stacks) or `machine` (individual units, part B), and append-only `num` ids like buildings. `reference/docs/data-formats.md` already describes it for machines.
- Troop types follow the tech tree, which already unlocks them:
  - levies: the plain troops every nation has now
  - Tribal: club warrior and spear thrower (Clubs), horse archer (Bows)
  - Medieval: spearman and swordsman (Iron working), archer (Archery), pikeman (Pikes), knight (Stirrups)
  - later eras when their trees are built; the art already has musketeers, riflemen, machine gunners and thirty more
- Each type has attack, defence, speed, a capture rate and a cost per soldier, all in the data. For example a levy is 1 attack and 1 defence, a spearman 1.5 and 2, a knight 3 and 2 and half again as fast.
- A stack's power is the sum over its types of count times attack, or defence while it holds, times its experience bonus. Battles stay Lanchester's square law, so fighting strength is quality times numbers squared: a knight with three times a levy's attack is worth about 1.7 levies in a straight fight. Losses come out of every type in proportion to its count.
- Taking land costs a stack fewer troops the stronger its attack, and mounted troops take land faster. A stack moves at the speed of its slowest type.
- Experience belongs to each stack. Fighting and taking enemy land earn it. The levels are Green, Seasoned (+10%), Veteran (+20%) and Elite (+35%). Merging averages it by troops, splitting keeps it on both halves, and disbanding loses it.
- The garrison's defence counts trained troops at their defence power, so a trained reserve at home makes your land harder to take.
- Bots keep levies only.
- **Done when:** unit tests show a knight stack beating a levy stack half as large again, experience raising power, and splits, merges and disbands keeping every type's count right; the bench still passes.
- **Done (26 September 2026).**
  - `src/sim/troops.js` and `data/units.json`. Nine unit tests: a bot world runs identically with or without troop types; forming a stack takes the same share of every type; losses, splits, merges and disbands keep each type's count; 400 knights beat 600 levies with about 200 left, as the square law predicts; experience adds 10, 20 and 35%; knights take land half as fast again for a third of the troops; a trained reserve makes land dearer to take; a stack moves at its slowest type's speed; state rows carry the mix only when there is one.
  - Smoke: 200 knights given to the host, a half-share stack takes about 100, and both players see the mix. Browser script: the stack panel lists "240 levies, 29 knights".
  - Totals: 129 unit tests, smoke 86 of 86 on the test map, browser script 74 of 74 on the test map.
  - Bench: this laptop measured over budget both with and without the change (worst tick 53.6 ms with it, 58.8 ms without, back to back), against 36.5 ms earlier in the day. The troops module itself costs nothing measurable.

### A2. Training

- Training buildings: a war camp (Tribal, new, unlocked by Clubs) that upgrades to the barracks (Medieval). The art has both.
- A new Army panel lists the types you have unlocked, with power, cost and how many you have. For each type you set how many to keep. Training buildings turn levies from your garrison into those types over time and charge a little gold, plus wood or iron ore for some. More buildings train faster. No queues per building.
- Forming a stack takes the same share of every type in your reserve, so a 30% stack takes 30% of your archers too. The Army panel can set a different mix for new stacks.
- **Done when:** a nation with a barracks keeps its target of spearmen topped up from the garrison while the gold lasts, and forming a stack takes its share of them.
- **Done (26 September 2026).**
  - Unit tests: a war camp keeps 40 club warriors topped up at 1 a second for 0.4 gold each, turning levies into them so the total stays the same, and refills the reserve after a stack takes half; a barracks trains swordsmen as far as iron and levies allow and says why when it stops; the army order refuses locked, unknown and negative targets.
  - Smoke: after Clubs research and a war camp, the host's 20 club warriors are trained. Browser script: the Army panel (K) keeps 12 club warriors, shows "Training 8 a second", and knights say "Needs Stirrups research".

### A3. Showing them

- At close zoom each stack draws a few soldier figures of its main type, walking when it moves and attacking when it fights, with a chevron for experience. At other zooms the marker shows the main type.
- The stack panel lists the mix and the experience, for your stacks and everyone else's.
- **Done when:** the browser script sees soldier figures of the right type and the mix in the panel.
- **Done (26 September 2026).** The browser script sees a stack of mostly knights drawn as five knight figures, with the mix "306 levies, 10 club warriors, 566 knights" in the panel and Veteran chevrons over the flag (`.screens/27-soldiers.png`).

### A4. Ryan's check

### Ryan's notes while part A was built (26 September 2026)

- **Autodefend.** The design's standing orders were kit code in `src/sim/offline.js` that was never installed. The world now runs them every `standingEvery` (2) seconds for human nations with no open game. Hold is the default: an advancing stack stops and drops its path, so an absent player's stacks no longer go on seeking land. Fall back walks the stack to the capital (the nearest city, once there are cities) when enemy stacks within `threatRadius` (6 plots, scaled on fine maps) together outnumber it `fallbackRatio` (1.5) to 1. The `standing` order sets one stack, or every stack and new ones; the stack panel has the choice under "While you are away, this stack". Absent players still defend at 0.95.
- **Land-taking notices.** `plot_lost` was keyed by the losing nation per tick, so a second attacker in the same tick was folded into the first: the victim saw the wrong name and the second attacker got no notice. It is keyed by loser and attacker now. Closing a pocket (`fillEnclaves`) took the enclosed land with no event; it reports it now. The away summary (`summarise`) counts plots rather than events. A seeking stack that stops says it found nothing it can reach by land. Which wrong notice Ryan saw is not known; if one still shows, its exact text is needed.
- **Online light.** The world broadcasts `presence` (the nations online) when it changes, and `hello` carries `online`. The nations list shows a green dot for players online and a grey one for those away; bots have none.

## Part B: machine units

Ryan's decisions (26 September 2026): the Medieval machines now (catapult, trebuchet, galley and cog), and the rest when the later eras are built; and ships carry stacks across the sea, so islands and other continents become reachable.

The kit's piece 15 (`src/sim/units.js`) is the base. Machines are individual objects with hit points, outside the troop count; land machines pay terrain move costs, ships sail any water but sea ice, and `embark` and `disembark` load and land troops. It has no production, battles or saving, and it is not installed yet.

### B1. Machines in the simulation
- The four machines join `data/units.json` as `kind: "machine"` (numbers 10 to 13), with domain, hit points, attack, defence, range, speed (relative to a levy), siege, capacity, cost, build time, `builtAt` and a description. Siegecraft unlocks the catapult and trebuchet and Harbours the galley and cog, as the tree already says. The fishing boat waits for sea trade.
- `src/sim/machines.js` installs the kit's module and adds what it lacks. Machines are saved with the world state and reach clients as rows in `hello` and `state`, sent only when they change.
- **Moving.** Land machines use the stacks' region graph, so long moves work on the Earth map; ships get the same kind of graph built over water. A land machine can follow a stack, keeping within one plot of it at its own speed.
- **Supporting a stack.** A land machine within one plot of a friendly stack (the one it follows, otherwise the nearest) adds its attack, or its defence while the stack holds, to that stack's battle power. It takes its share of the stack's battle losses as hit points.
- **Siege.** Taking another nation's plot within a siege machine's range costs its owner's stacks less: half next to a catapult (range 3), a third next to a trebuchet (range 5). Unclaimed land costs the same as before.
- **Capture.** A land machine with no friendly stack within one plot is taken by an enemy stack that comes within one plot: the design's re-crewing.
- **Ships fight ships.** Hostile ships within one plot fight each other like stacks, in hit points.
- **Wrecks.** At 0 hit points a machine becomes a wreck for 5 minutes, and a ship's cargo is lost.
- Bots build no machines, so their balance and the bench stay as they are.
- **Done (26 September 2026).** The kit's `src/sim/units.js` is extended, installed in `world.js` and saved with the world state. Unit tests: 14 in `test/machines.test.js`. A 300-against-300 fight with a catapult beside the attackers costs the catapult about 16 of its 40 hit points in 10 seconds and wrecks it in 19 (`hpPerLoss` 1), and a catapult halves and a trebuchet thirds the capture cost. Unreachable targets are refused at once, because each connected body of water (or land) is labelled. The water graph costs 78 ms to build on Earth and 27 ms on fine Europe; it is built only once a world has a ship. After that, ship orders take 0.35 ms at the median and under 8 ms at worst on Earth. `npm run bench` gives each player 6 catapults following its stacks and 3 cogs sailing to random water: Earth's worst tick is 34 ms, fine Europe's 34.7 ms.

### B2. Building them
- A siege workshop (new, Medieval, research Siegecraft) builds catapults and trebuchets; the harbour builds galleys and cogs. Each keeps a queue of up to 10. The cost is paid as each one starts; when gold or materials run short the queue waits and the building panel says why. A finished machine appears next to its building, on land or on water.
- **Done (26 September 2026).** The `produce` order queues or clears; the purse's `machines.queues` has each queue's items, progress and reason. The browser script builds a siege workshop after Siegecraft and a catapult from its panel.

### B3. Ships carry stacks
- A stack ordered to board walks to the coast next to its own ship and embarks up to the ship's capacity, with its mix of types and its experience. What does not fit stays ashore.
- A ship ordered to land sails next to the chosen coastal plot and puts the troops ashore as a stack. The landing loses 15% (`rules.json` `landing`), or nothing within 2 plots of your own harbour or jetty. Landing on enemy or unclaimed land pays the normal capture cost for that plot; with too few troops the landing fails, with an event.
- **Done (26 September 2026).** Orders `board` (a stack) and `machine` with `do` `land`. Smoke: 200 knights board a cog and land further along the coast, 170 ashore.

### B4. Showing and ordering them
- Machines are drawn with the kit's art, facing their way, with a health bar once damaged and the cargo count on ships; wrecks use the wreck art. At far zoom they show as small markers.
- Clicking a machine selects it. Its panel shows health, cargo and what it is doing, with Move, Follow a stack, Land troops (ships) and Stop. A right-click moves it; with troops aboard, a right-click on the coast lands them. With a stack selected, a right-click on your own ship boards it.
- The siege workshop and harbour panels have build buttons and the queue.
- **Done (26 September 2026).** `public/js/ui/machine.js` is the machine panel. The Army panel lists machines by type, and research names the troop types and machines it unlocks. Screenshots: `.screens/28-machines.png`, `28b-cog-close.png` and `28c-catapult-close.png`.

### B5. Ryan's check

## Part C: the new interface

Draft, for Ryan to agree before it is built (26 September 2026).

### What the two games do
FrontWars.io was played through its tutorial in a browser. openfront.io blocks automated browsers, so its open-source interface code was read instead (github.com/openfrontio/OpenFrontIO, `src/client/hud/layers`). FrontWars follows the same design.

- **Few, fixed places, and the map stays clear.**
  - Top left: a leaderboard of the top nations (share of land, gold, troops), with Show all and Hide.
  - Top right: a small cluster with time, pause, settings and exit.
  - Bottom left: a control panel with troops against the cap and their growth, gold, and one "attack ratio" slider. FrontWars adds sliders for donating troops and gold.
  - Bottom middle (OpenFront): a hotbar of ten build slots on the number keys, with counts, and cost and hotkey on hover.
  - Bottom right: an events feed that can be hidden. Events that need an answer carry buttons, such as accept an alliance, or focus the camera on it.
- **The map carries the information.** Each nation's name and troop count are written across its territory, sized to the territory. A red frame flashes around the screen when you are attacked, and a list shows attacks in and out, with retreat.
- **One gesture for most orders.**
  - A left-click on another nation's land attacks it with the ratio's share of your troops; clicking water sends a boat.
  - A right-click opens a small ring menu at the pointer with what makes sense there. Info is always there. On your land it offers Build, a submenu with costs. On other land it offers Attack, Boat and Alliance. The centre button does the main action.
- **Cards.** Hovering over a nation shows its name, relation, troops, gold and buildings. Clicking it opens its actions: alliance, trade, donate, emoji.
- **A guided first game.** FrontWars steps through goals such as "Claim 300 tiles 52/300" and "Found your first City": a pill at the top, one sentence of instruction and a pulsing target on the map ("Left-click here").
- **Rebindable keys** in OpenFront's settings.

### Where Large Scale's screen falls short
- **Two crowded rows of controls along the top**, with resources as one line of text.
- **Panels that are always open:**
  - the nations list, bots included;
  - the chat, even when it is empty;
  - a wide bottom panel for the selected stack, building or machine, with up to ten buttons.
- **Notices pile up** in the bottom-left corner and then vanish; there is no list to look back at.
- **Every attack takes three steps:** form a stack (F), select it, then advance (A, C or N).
- **Nations are told apart by colour alone** until you hover over their land.

### Where the game differs from them
- **Stacks are pieces you move.** A click to attack can still form a stack: from the border nearest the click, with the slider's share, advancing into that nation's land.
- **Building is bigger.** Towns, resources, research and machines need a build menu grouped by kind, not a ten-slot hotbar.
- **Games last days.** Players come and go, so the events list and what happened while you were away matter more than in a 20-minute round.

### C1. Layout and style
- **Top left:** a leaderboard that can be folded. It shows the top nations and you, with the online light and era; bots are hidden unless you ask.
- **Top middle:** a status pill with the world, time, season and speed. It also carries messages such as "Choose where to start".
- **Top right:** icons for settings, full screen, admin and exit.
- **Bottom left:** the control panel.
  - Troops at home against the cap, with growth.
  - Gold and every material with its rate.
  - The share slider, which is today's stack share.
- **Bottom middle:** an action bar of icon buttons with their keys: Build, Town, Research, Upgrade, Army, Deposits.
- **Bottom right:** an events feed that can be folded. It replaces the pile of notices, keeps the last hundred events and jumps to where each happened. Chat becomes a tab of it, with an unread count.
- **Right edge:** a card for whatever is selected (stack, machine, building or nation) instead of the wide bottom panel.
- **Style:**
  - one dark, see-through panel style;
  - icons from the kit's `ui` sheet;
  - numbers written short (12.4k);
  - bigger touch targets in landscape on phones.

### C2. The ring menu
- **A left-click on another nation's land** selects and shows info, as now (decision 1).
- **A right-click always opens a ring menu at the pointer**, and so does a long press on touch (decision 2). The centre does the main action.
- **With nothing selected:**
  - on your land: form a stack here (centre), build here, zone here, info;
  - on another nation's land: attack that nation (centre), info. Attack forms a stack from the slider's share at your land nearest the click, and it advances into that nation only;
  - on unclaimed land: take unclaimed land (centre), which does the same into unclaimed land only.
- **With your stack selected:** move here (centre), attack the nation there, take unclaimed land, board the ship there, info.
- **With your machine selected:** move here (centre), follow the stack there, land the troops there (a loaded ship), stop.
- A right-drag with a stack selected still draws its path, because a drag is not a click.

### C3. The map as the display
- **Names and troop counts on territory**, sized to it and placed where the land is widest. They are refreshed every few seconds from the owner layer.
- **A red frame** at the screen edge when someone is taking your land. **An attacks list** above the events feed shows who is taking land from whom, with Stop for your own stacks.

### C4. A guided start
Steps shown as a pill with a pulsing target, following the Town panel's next step:
1. spawn;
2. take land;
3. zone homes;
4. a woodcutter;
5. research;
6. a war camp;
7. an attack.

### C5. Settings
Rebinding keys (wanted since milestone one). Toggles for names on the map, bots on the leaderboard and sounds.

### C6. Ryan's check

### Decisions (answered by Ryan, 26 September 2026)
1. **A click on another nation's land only shows info**, and attacking that nation goes in the ring menu.
2. **A right-click always opens the ring**, with Move in the centre when a stack or machine is selected.
3. **The guided start is in this milestone.**

### Progress (26 September 2026, branch `m3-interface`)
- **C1, done.** Leaderboard top left (rank, online light, era badge, share of land, troops; bots behind a Bots button), status pill top middle (world, speed, day and hour, season, connection), icons top right (capital, whole map, zoom, full screen, settings, admin, exit), control panel bottom left (troops at home against the cap and growth, gold and every material with its rate, the Stack slider with the troops it takes), action bar bottom middle with the ui sheet's icons, key chips, a research progress line and a dot when nothing is queued. The events feed (bottom right) keeps 100 events, merges repeats, jumps to where each happened, shows the newest line when folded, and has Chat as a tab. Selected stacks, buildings and machines, the build menu and the town panel are cards in the right column. Toasts now carry only order results, under the pill. The purse carries `vitals` (troops, cap, growth, income), and `hello` carries `seasonRules` and `time`.
- **C2, done.** A right-click, or a finger held for half a second, opens the ring (`public/js/ui/ring.js`). The items follow the decisions above; a ship under the pointer puts Board first, and a stack under a machine puts Follow first. Number keys pick items, Enter the centre, Esc closes, a right-click elsewhere moves the ring. The server's new `attack` order forms the stack at the owned plot nearest the click (`nearestOwned`) and advances into that plot's owner only, or unclaimed land only. The click a browser sends after a long press is cancelled, or it would press the centre button.
- **C3, done.** Names and troops on territory (`public/js/render/labels.js`): a two-pass distance transform over the owner layer sampled to at most 250,000 cells, the widest point of each nation, every 2 seconds. It takes 7 ms on the Earth map. Names are hidden where the land is too small to hold 9 px text, so at the whole-map view early in a game only the big nations are named. The attacks panel lists who took your land in the last 15 seconds and your advancing stacks with Stop (the new `halt` order); a red frame pulses while you are losing land.
- **C4, done.** The guide (`public/js/ui/guide.js`): take land (200 plots, times the map scale squared), zone homes, a woodcutter camp, three techs, a war camp, an attack. Each step is read from the game state, so steps done early are skipped; the attack step is remembered in the browser. A pulsing mark shows where to act and the button to press glows. Hide keeps it off for that world.
- **C5, done.** Settings (`public/js/ui/settings.js`): names on the map, bots on the leaderboard, the guide, and every key but Esc can be rebound; a key already in use swaps. Kept in the browser (`ls_keys`, `ls_prefs`). There is no sound in the game yet, so there is no sound toggle.
- **Evidence.** `npm test` 154 of 154; `npm run test:reference` 95 of 95; smoke 93 of 93 on the test map; `npm run ui` 103 of 103 on the test map and on fine Europe, including the panels not overlapping at 1280 by 720 and on a phone held sideways, the ring from a right-click and from a long press, attack and take-land from the ring, Stop, the red frame, names on the map, the guide, rebinding and the settings toggles. `npm run bench` passes, worst tick 40 ms (runs before Part C: 26 to 34 ms; Part C does not touch the tick).
- **Nation card, done (same day).** A left-click on another nation's land, or its leaderboard row, opens a card (`public/js/ui/nation.js`): era, rank, land, troops against yours, online or away, Attack with the slider's share, and their capital. The admin panel's confirm buttons no longer reset between clicks when a player's plot count changes. `npm run ui` 105 of 105 on the test map and on fine Europe.

## Budgets

- `npm run bench`: worst tick under 50 ms with 400 bots and 8 players, as now.
- Protocol changes stay additive where they can.
