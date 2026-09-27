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
- **Laying roads.** A Roads tab in the build menu. You drag along your own land, as when zoning, with a mouse or a finger, and see the cost before confirming.
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

### Part B. Army supply

- **Supply reach.** Every few seconds each player's supply reach is worked out from their stores holding food: 18 plots of travel, so roads stretch it and mountains shrink it. It crosses your land and allied land only.
- **Stacks carry supplies.** A stack refills automatically while inside your reach, and carries 10 minutes' worth when it leaves (decision 2).
- **Out of supply.** When a stack's carried supplies run out, its power falls towards half and a few troops desert each minute. The stack card, its map marker and the feed say so, once, not every tick.
- **Supply stacks.** Formed at a store, loaded with food, moved like troops, and able to follow a stack. Stacks within 3 plots of a supply stack count as in supply, and the supply stack drains as it feeds them.
- **Away and catch-up.** Standing orders already hold an absent player's stacks. Supply keeps running while a player is away, but not in catch-up.
- **Bots** are left out, as they are from the town economy (decision 4).
- **Overlay.** A supply reach overlay (the kit's `ov_supply_reach`), and a faint line from a selected stack to its nearest source.

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

### Part D. Sea routes

- Ports are stores. When the land route between two of your stores is missing, or much longer, a convoy crosses water between ports, on the water graph ships already use.
- Hostile warships near the route can sink it.
- This part can wait until after Ryan's check of parts A to C, if play shows it isn't needed yet.

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
