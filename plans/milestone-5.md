# Milestone 5: logistics

Agreed with Ryan on 27 September 2026 (decisions at the end). Ryan chose full logistics before the Industrial era (the Industrial plan is now `plans/milestone-6.md`). This is the kit's piece 7 (`reference/tasks/07-logistics/GUIDE.md`, example code in `src/sim/logistics.js`, never installed).

## What the design already decided

From `reference/docs/design-decisions.md` and the question record:

- Money is a number in the treasury. Goods sit in stores and must be moved by road, rail or ship to be used elsewhere.
- Armies need supplies and weaken far from supply lines. Supplies move as stacks, like troops.
- Mountain roads are expensive but transform movement. Supply costs more through rough terrain.
- A site that runs out is useless until a convoy arrives, so cutting supply is a real way to break a defended area.
- Convoys get standing orders too. Restocking is automatic.

And the rule that shapes every step here, CLAUDE.md rule 8: no hyper-management. You decide where roads, stores and depots go. Deliveries, restocking and supply run on their own, and one panel shows anything that is stuck.

## What changes for a player

- Roads and bridges you lay make armies and deliveries faster.
- What your mines, farms and foresters make goes to the nearest store. A building site far from any store waits until a delivery arrives, and says so.
- Carts, then wagons, carry goods between your stores on their own. An enemy can cut a road or ambush a convoy.
- Stacks deep in enemy land, far from your stores, run short of food and weaken. A supply stack following them keeps them going.

## Steps

Four parts, each tested and shown to Ryan before the next: roads first, because they help at once and touch nothing else.

### Part A. Roads and bridges

- **The road layer.** One byte a plot, the kit's road types: dirt, cobble, paved, highway and rail. Saved like zones: one row, written only when changed. Clients get it in a join frame and small diffs.
- **Laying roads.** A Roads tab in the build menu. You drag along your own land, as when zoning, with a mouse or a finger. The plots and the price show while you drag, and letting go lays the road.
  - Dirt roads from the start: 1 gold a plot.
  - Cobble with the Medieval Paved roads node (already in the tree): 3 gold and 1 stone a plot.
  - Mountains cost 4 times as much.
  - A river plot needs a bridge: wooden from the start, stone with Paved roads, at 5 times the road's price.
  - Dragging a better road over a worse one upgrades it. Paved roads, highways and rail wait for the Industrial and Modern slices.
- **What roads do.** Stacks, land machines and convoys cross a road plot at the kit's travel cost: dirt 0.6 of the terrain's cost, cobble 0.45. Routes prefer roads by themselves.
- **Capture.** Roads stay when land changes hands, so a captured road serves the new owner.
- **Removing.** A drag with Remove erases your own roads, with no refund.
- **Drawn** with the kit's road and bridge sprites at close zoom, and as thin lines further out.
- **The catch.** Cheaper roads weaken the path search's distance estimate, so long searches get slower. The bench must show long moves on Earth stay within budget. If they don't, roads join the coarse land-region graph that long moves already use.

#### Part A progress (27 September 2026, branch `m5-roads`)

Built and tested; waiting for Ryan's check before Part B.

- **Server.** `src/shared/roads.js` holds the road types, the line between points, the price and the sprite choice, so the client's preview and the server agree. The kit's `src/sim/logistics.js` keeps its road layer and gains `installRoads`:
  - `moveCost` multiplies by the road's travel cost, so stacks, land machines and route planning all use roads;
  - `pathMinStep` lowers the search estimate only once a cheaper road type exists;
  - the layer saves through `bld.extra` and is compared on reload;
  - clients get `MSG.ROAD` at join and `MSG.ROAD_DIFF` after.
- **The `road` order** takes `kind` (dirt, cobble or none) and `via`, up to 64 points and 400 plots. Rules are in `rules.json` `roads`; on fine maps a plot costs half.
- **Found while building:** roads and buildings could share a plot. Now a road is refused where a building stands, a building is refused on a road, and towns skip road plots. Rubble blocks neither.
- **Client.** The Roads tab, drawing by drag, one finger or the crosshair (Select twice), the live price in the bar, sprites above the territory tint at close zoom, edged lines further out, and the road's name in the tip.
- **Evidence.**
  - `npm test` 195 of 195: `test/roads.test.js` (8 tests), and the kit's five logistics tests in `test/kit/logistics.test.js`. A stack crosses 40 plots of grass in 26.75 s and the same distance on a dirt road in 16 s.
  - Reference 95 of 95.
  - Smoke 103 of 103: a road laid, seen by the friend, refused off your land and as cobble before research, and removed. After a restart the road layer loads identically.
  - `npm run ui` 147 of 147 on the test map: the Roads tab, a drag with its price, Esc, the tip, and one finger on a phone.
  - `npm run bench` on the Earth with 3,435 cobbled road plots: worst tick 29.4 ms (32.5 ms without roads), and the slowest long-move plan 9.5 ms (8.4 ms without). Fine Europe with 3,387: worst tick 30.4 ms, slowest move plan 9.7 ms.

### Part B. Army supply

- **Supply reach.** Every few seconds each player's supply reach is worked out from their stores holding food: 18 plots of travel, so roads stretch it and mountains shrink it. It crosses your land and allied land only.
- **Stacks carry supplies.** A stack refills automatically while inside your reach, and carries 10 minutes' worth when it leaves (decision 2).
- **Out of supply.** When a stack's carried supplies run out, its power falls towards half and a few troops desert each minute. The stack card, its map marker and the feed say so, once, not every tick.
- **Supply stacks.** Formed at a store, loaded with food, moved like troops, and able to follow a stack. Stacks within 3 plots of a supply stack count as in supply, and the supply stack drains as it feeds them.
- **Away and catch-up.** Standing orders already hold an absent player's stacks. Supply keeps running while a player is away, but not in catch-up.
- **Bots** are left out, as they are from the town economy (decision 4).
- **Overlay.** A supply reach overlay (the kit's `ov_supply_reach`), and a faint line from a selected stack to its nearest source.

#### Part B progress (27 September 2026, branch `m5-supply`)

Built and tested; waiting for Ryan's check with Part A.

- **Reach.** `src/sim/supply.js` (`installSupply`) works out each player's reach from the capital and their stores (buildings with a `store` block: the seat of government line, storage yards, warehouses, depots and ports) while they have food. `reachMap` in `src/shared/supply.js` is shared with the client's overlay, and `costMap` in `src/shared/pathfind.js` keeps it sparse.
- **Found while building:** a capital on rough ground gets no chieftain hut, so such a nation had no store at all. The capital now always counts as a source and as a place to load wagons.
- **Carried supplies.** Stacks refill to 600 s in reach and use them up outside. Then power falls to half over 120 s through `powerOf` and `stackAttack`, and 0.05% of the troops desert a second at the worst. Splits copy the state; merges keep the worse one.
- **Wagons.** The `wagon` order loads up to 500 food at a store, with 20 troops as crew. Wagons feed stacks within 3 plots at 0.0005 food a troop a second, follow a stack (the `follow` order), and give their food back when disbanded on your land. They cannot advance, split or merge. Stack rows carry the kind and food at positions 7 and 8.
- **Speed.** At most two players are worked out a tick (`perTick`), and bots are left out.
- **Client.**
  - The stack card's supply line, and wagon buttons and ring items.
  - The Load wagon row on store cards.
  - Cart sprites by era, the `alert_starving` mark, the reach overlay for a selected stack, and feed lines.
- **Evidence.**
  - `npm test` 204 of 204 (`test/supply.test.js`, 4 tests); reference 95 of 95.
  - Smoke 104 of 104.
  - `npm run ui` 150 of 150 on the test map and on fine Europe.
  - Bench, back to back on a busy machine: supply adds about 1 ms to the median tick (7.1 against 6.2 ms) and nothing to the worst.

## Free transport boats (Ryan's ask, 27 September 2026)

Ryan asked for troops to cross water for free from the start of the game, like OpenFront. He chose free boats, and a landing loss that grows with the water crossed.

- A move or attack on land with no land route walks the stack to your coast, where a free transport boat (unit 22, `transport: true`, never built) takes the whole stack across, lands it and disappears. The landed troops carry on with their order. `src/sim/boats.js` (`installBoats`) does this with the existing ship code.
- **Landing loss:** 1% plus 0.1% a plot of water, up to 15%, and nothing by your own port. It is shown before sending.
- **Limits:** at most 3 boats at sea. Boats leave only from your own coast. Warships within range sink them fast (`sinkMult` 40), taking everyone aboard. A refused landing sails the troops home. Boats cannot be boarded or steered.
- **Looks:** canoe, fishing boat, caravel, then landing craft, by era.
- **Evidence:** `test/boats.test.js` (5 tests), and `npm run ui` sends a boat from the start and lands it.

### Part C. Stores and convoys

- **Stores.** The seat of government (chieftain hut up to parliament), storage yards, warehouses and ports. Each holds goods up to a capacity; storage yards and warehouses stop saying "no effect yet".
- **Where goods go.** Producers deliver to the nearest store within 12 plots of travel. With none in reach, they fill a small buffer, then stop, and their card says "no store within reach".
- **Where goods come from.**
  - Building sites, upgrades, training at the barracks and machine queues take from stores within reach.
  - What is missing is asked for, and the build waits, showing what it waits for.
  - Towns eat from every store (decision 1).
  - The nation's stock in the top-left panel is the total across all stores.
- **Convoys.** Every few seconds, for each store that asks for something, the nearest store with a surplus sends a convoy. It uses the era's capacity and speed from the kit: a hand cart holds 10 in the Tribal era, a horse wagon 30 in the Medieval, a supply wagon 50 in Gunpowder.
  - Convoys travel your own and allied land, on roads where they can.
  - An enemy stack meeting a convoy takes its cargo (decision 3).
  - Paths between stores are cached, and forgotten when a road changes or land along them flips.
- **Standing orders.** Each store has Keep and Want amounts, automatic by default, with sliders for players who want them. One rule prevents goods bouncing between two stores: Keep is never below Want.
- **Capture.** Capturing a store takes what is in it. That is new, and the reason to guard storage.
- **Old worlds.** When a world first loads with logistics, its whole stock moves into its seat of government, so nothing is lost.
- **Bulk upgrades** stay instant. Materials count only from stores within reach of each building. The rest is bought at the existing price for missing materials, as today.
- **Catch-up.** A sleeping world delivers straight from store to store without travel, so towns keep building while nobody plays.

#### Part C, how it is built (28 September 2026)

Ryan asked for Part C to go ahead before his check of A and B. These are the choices made while building it; each can change after his check.

- **Goods live in stores.** Each store building holds its own goods (`b.goods`); the nation's stock is the total, as the plan says. A nation with no store at all (its seat captured, or a capital on rough ground) keeps a small camp store at its capital, so it can always build a new one.
- **One store per building.** A building's store is its nearest store within 12 plots of travel, worked out per nation every 10 seconds. Producers deliver there, and sites, training, machine queues and upgrades take from there.
- **Capacity is per kind of good**, so a full granary does not stop the lumber camp. Seats of government hold 1,000 to 15,000 of each, storage yards 2,000, warehouses 8,000.
- **Producers** fill their store up to its capacity, then a buffer of 20, then stop, and say why: no store within reach, or store full.
- **Sites.** Placing a building pays the gold and takes the materials as before, but only what its own store holds is there at once. The rest leaves other stores at once as carts, and the site waits until they arrive. If no store has spare goods, it asks again every few seconds.
- **Training and machines** take from their buildings' stores. What is short is asked for, and carts bring it to that store.
- **Towns eat from every store**, from each in proportion to what it holds. Goods towns make, refunds and admin gifts go to the seat of government.
- **Convoys** carry one kind of good each: 10 on a Tribal hand cart, 30 on a Medieval horse wagon, 50 in the Gunpowder era. At most 12 per nation are on the road at once. A hostile stack within a plot takes the cargo, into its own nearest store.
- **Keep and Want** are set per store and per good on the store's card. Want asks for goods until the store holds that much; Keep is what it never sends away, and is never below Want.

#### Part C progress (28 September 2026, branch `m5-stores`)

Built and tested; waiting for Ryan's check with parts A and B.

- **Server.** `src/sim/stores.js` (`installStores`), wired into construction, resources, training, machine queues, bulk upgrades and supply wagons. The `store` order sets Want and Keep. Saves add a `stores` row.
- **Client.**
  - Store cards list what a store holds and take standing orders.
  - Sites say what they wait for and what the carts bring; producers say why they stopped.
  - The Logistics panel (L, and a button in the action bar with a dot when something is stuck) lists waiting sites, stopped producers, held-up training and workshops, stacks beyond supply, and every store.
  - Carts are drawn with the era's cart sprites.
- **Found while building:**
  - The eight nations' store maps expired together and were rebuilt in one production tick, and every nation sent its carts in the same tick: 54 ms worst ticks. Both now take turns, two nations a tick, with at most 4 path searches a tick.
  - The Tribal era has no storage yard. A producer out of reach says to research Chieftains and build another chieftain hut, which stores goods.
  - At 2,000 times production the browser test's quarry filled the hut's 1,000 stone and stopped, so that test now takes stone out as it goes.
  - Old worlds put their whole stock into the seat of government, even past its capacity. Producers of a good the seat is already over-full of wait until it is used or another store is built.
- **Evidence.**
  - `npm test` 216 of 216 (`test/stores.test.js`, 12 tests); reference 95 of 95.
  - Smoke 105 of 105, and after a restart the store layer loads identically.
  - `npm run ui` 154 of 154 on the test map: the store card, Keep 10 wood, a watchtower 15 plots from the hut waiting for two hand carts, the Logistics panel, and the carts arriving. The same 154 of 154 on fine Europe.
  - `npm run bench` on the Earth, with carts running (6 stores a player asking for wood):
    - worst tick 38.0 ms, against 31.5 ms without stores;
    - 3,712 carts sent and delivered, with 72 path searches.
  - Fine Europe: worst tick 34.0 ms; 6,290 carts, 26 taken by enemy stacks and 4 cut off.

### Ryan's asks after PR 26 (28 September 2026, branch `m5-asks`)

Ryan: "some things dont work, can you add a auto road lay button? also I cant schedule things. Also we need to rework the menu to look way cooler." He chose both road tools. For the menu, he asked for the live game on the side, like Terraria's title screen. For what does not work, he asked for a go through the code.

- **Going through the code.**
  - A new soak test (`npm run soak`): two players give about 2,000 random orders over 20 game minutes at 8 times speed. No tick errors and no bad numbers. The one thing it found was a purse sent straight after an admin gift showing the gift before the stores had it; purses now sync the stores first.
  - Laying roads was the real trouble. A drawn road is a straight line through the points, and any building, water or foreign plot on it refused the whole road: the soak test hit that more than 50 times in 20 minutes. A click in road mode also laid a single plot, because the input layer ends every road gesture as a drag.
- **Road from A to B.** Click where a road starts and where it ends. It finds the cheapest way over your land, round buildings and water, reusing roads already laid and bridging rivers only where it must. The route and its price show before Lay road (or Enter), or at once with one-click placing. Dragging still draws a road by hand.
- **Connect stores.** In the Roads tab, Plan the roads shows how many plots and what gold it takes to link every store to the capital's roads, and Lay them lays them. Keep new stores connected is a standing order that lays and pays by itself every 20 seconds when new stores appear.
- **Scheduling.** The in-game editor (World info, I) was there, but hard to find. The host now also has a Schedule button on every world's card on the list, and optional times when making a world.
- **The menu.**
  - The list sits on the left, with the logo, the account bar, world cards and New world.
  - The right side is a live view of the selected world: territories, armies and carts moving, with the camera drifting between capitals and towns.
  - Logged out, it pans across the Earth map instead.
  - On a phone the live map fills the background behind the menu.
  - Watching does not count as playing: no nation is made, nobody sees you online, and the socket ignores orders. It closes after 20 minutes, or when the tab is hidden, so a menu left open does not keep a world running.
- **Found while testing.**
  - On a phone held sideways, a long event in the folded feed wrapped to three lines and ran into the action bar. The preview is now two lines at most, and one on short screens.
- **Evidence.**
  - `npm test`: 218 of 218.
  - `npm run smoke` on the test map: 108 of 108. New checks cover a world scheduled as it is made (a bad schedule refuses it), watching without a nation, presence or orders, and the host scheduling from the list (a friend gets 403). `RECHECK` after a restart: 7 of 7, stores included.
  - `npm run ui` on the test map: 160 of 160. It includes a road from A to B, Connect stores and its standing order, the list watching the last world live, Schedule on a card, a scheduled new world, and the Earth scenery when logged out. Screenshots are `55` to `58` in `.screens`.
  - Soak: 20 game minutes, about 2,000 orders, no tick errors.

### Part D. Sea routes

- Ports are stores. When the land route between two of your stores is missing, or much longer, a convoy crosses water between ports, on the water graph ships already use.
- Hostile warships near the route can sink it.
- This part can wait until after Ryan's check of parts A to C, if play shows it isn't needed yet.

#### Part D, how it is built (28 September 2026)

Ryan asked for the next step after PR 27. These are the choices made while building it; each can change after his check.

- **Ports.** A port is a store building with `port` in `data/buildings.json`: the jetty (300 of each good), the harbour (1,500), the shipyard (1,500) and the Industrial commercial port (8,000, now marked as a port). Its dock is a water plot beside it.
- **When a convoy goes by sea.** Most convoys never look at the sea. A convoy looks for a sea route only when:
  - there is no way by land, or
  - the way by land is over 40 plots (80 on fine maps).
- **Choosing ports.** It tries your 2 ports nearest the store sending the goods, each with your 2 ports nearest the destination on the same water. It goes by sea when the land way is missing, or takes over 1.5 times as long as walking to the port, sailing and walking on.
  - The sailing time is the straight distance times 1.3, at the ship's speed.
  - Pairs are tried from the one that could be quickest, so when no pair could beat the land way it makes no path search at all.
- **The trip.**
  - The cart walks to the first port.
  - A merchant ship (unit 23, free and never built) sails its load to the other port. It carries the cart's load, and counts against the 12 carts a nation can have out.
  - The cart then walks on to the destination.
  - If the far port is lost on the way, the ship makes for your nearest port on the same water. If it cannot board at the start, the goods go into the first port's store.
- **Warships.** Hostile warships within range sink merchant ships as they sink transport boats. The goods go down with the ship, and the owner hears who sank it. Land stacks on the shore cannot raid a ship.
- **No orders.** Merchant ships sail on their own. They are not listed with your machines in the Army panel.
- **Looks.** A raft in the Tribal era, then a cog, galleon, steamship, cargo ship and container ship. The cart is hidden while its goods are at sea.
- **Catch-up** delivers at once, as for carts on land, and the ship is removed.

#### Part D progress (28 September 2026, branch `m5-sea`)

- **Server.** `src/sim/sea.js` (`installSeaRoutes`, installed after the stores) plans routes, boards, sails and lands. `src/sim/stores.js` calls it through `world.stores.sea`, which avoids a circular import, since `units.js` already imports the stores. Rules are in `rules.json` `stores.sea`.
  - Convoys keep `sea` (both ports, both docks, the water body and the stage), `ship` and `goal` (where the current land leg ends).
  - These are saved in the `stores` row, still format 1, because old rows simply have no sea fields.
  - Convoy rows gain the ship's id as an eighth field, so protocol stays 5.
- **Client.**
  - The cart is hidden while at sea.
  - The merchant ship's card says what is aboard and has no orders.
  - The Logistics panel counts your ports and the carts going by sea.
  - The feed says who sank a ship.
- **Evidence.**
  - `npm test`: 226 of 226. `test/sea.test.js` has 7 tests: a site across the water fed through two jetties; sea chosen only when the land way is much longer (round a bay); no sea route with one port; a frigate sinking a ship; a save in mid-voyage, with the ship refusing orders; and catch-up. `test/client.test.js` checks convoy rows at sea.
  - Reference: 95 of 95.
  - `npm run bench` on the Earth with 4 jetties a player on their own coast (`--ports`, default 4): worst tick 34.7 ms. The worst-case probe planned 72 sea routes as if there were no land way: 65 path searches, 23 ms in all, 2.8 ms for the slowest.
  - Fine Europe: worst tick 36.4 ms (40.3 in another run), against 33.9 ms with `--ports 0` on the same machine. 34 carts went by sea there.

### Showing it

- The Roads tab, with the cost preview while drawing.
- A Logistics panel (L), with one list of everything stuck:
  - sites waiting for goods;
  - producers with no store in reach;
  - stacks out of supply;
  - convoys under way.
- Convoys drawn with the era's cart and wagon sprites, and the supply overlay.
- Store cards with their stock and the Keep and Want sliders.

### Checks

- **Unit tests:**
  - the kit's five logistics tests, moved to `src/sim` as earlier pieces were;
  - roads: the order, costs, bridges, upgrading, capture;
  - supply: reach, carried supplies, falling power and desertion, supply stacks;
  - stores: delivery to the nearest, no store in reach, waiting sites, no bouncing, capture;
  - convoys: arrival, ambush, and delivery in catch-up.
- **Smoke:** roads laid and sent to a friend; a site waiting for a convoy; a stack running out of supply.
- **Browser test:** laying a road by mouse and by finger, the Logistics panel, and convoys on the map.
- **Bench:** Earth with 8 players who each have 2,000 buildings, roads, stores and convoys. Supply reach is worked out in slices, and the worst tick must stay under 50 ms.

### Ryan's check

## Budgets

- One new saved layer (roads). Store stock, convoys and supply stacks go in the nation and building rows.
- Changes are additive where possible, so the protocol stays 5. It steps to 6 only if the stock format has to change.
- Road plots are sent as diffs. Convoy rows are sent as deltas, like stacks, and everyone sees them, because there is no fog of war.

## Decisions (answered by Ryan, 27 September 2026)

1. **Materials are carried**: building, upgrading, training and machines take from stores within reach. Towns eat from every store, and money stays a number.
2. **Stacks carry 10 minutes of supplies**, refilled automatically within reach, with supply stacks for deeper pushes.
3. **An ambushed convoy's cargo goes to the enemy.**
4. **Bots ignore supply.**

## The questions as asked

1. **How physical should goods be?** Recommended: materials for building, upgrading, training and machines are carried, towns eat from every store, and money stays a number. The alternatives are carrying town food too, so a cut-off town starves, which is more to manage; or only army supply, with the economy staying one national stock.
2. **Army supply.** Recommended: stacks carry 10 minutes of supplies, refilled automatically within reach, with supply stacks for pushes deeper than that. The alternative is the kit's rule as it stands: any stack beyond reach weakens at once unless a supply stack follows it.
3. **Ambushed convoys.** Recommended: the enemy takes the cargo, so raiding pays. The alternative is the kit's rule: the convoy is destroyed and nobody gets it.
4. **Bots.** Recommended: bots ignore supply, as they ignore the town economy, so they stay cheap to run. The alternative is that bot stacks weaken out of supply too, which is fairer but makes bots weaker and costs tick time on Earth.
