# Milestone 7: fighting first

Ryan's asks of 28 September 2026, after the Industrial era: one currency, individual soldiers he can select by swiping, piloting of soldiers, ships and planes on PC and phone, planes and bombing, and easier crossings by sea. The aim is a game about fighting, not about supply chains (rule 8: no hyper-management).

## Decisions (28 September 2026)

1. **Gold is the only currency.** Materials go. People build houses for population; farms and mines earn gold.
2. **Old worlds are converted** when they load, not deleted.
3. **Individual soldiers.** An Armies button turns a swipe into selecting soldiers.
4. **Limits.**
   - Up to 1,000 soldiers attacking per player. Soldiers grow stronger as a nation progresses, so fighting power still grows.
   - At most 100 planes and 100 warships per player.
   - No limit on trade.
5. **Pilot everything now:** soldiers, tanks, ships and planes, with PC and phone controls.
6. **Order:** the boat fix, gold only, soldiers, piloting, then planes.
7. **Ryan's answers to the readings below (28 September 2026):**
   - Soldiers grow stronger by era and by experience.
   - Trade ships just move between ports and make money.
   - Troops no longer need supply: no food, no reach, no wagons.
   - Warships sink other warships and capture trade ships.
   - Tanks and artillery have a limit of 100.
   - Bots keep their stacks.
   - Deposits, research points, and power plants on gold upkeep are as read below.

## What the decisions mean

This is how the answers are read. Ryan corrects anything here that is wrong.

- **Troops at home stay a number.** They hold and defend your land, and grow as now. A soldier is raised from home troops and goes back into them when disbanded.
- **A soldier is worth more than one troop.** It is raised from `soldiers.troopsEach` home troops (10 to start). It fights with that weight times its type's power.
  - The weight grows by era, so the same 1,000 soldiers hit harder in each era.
  - Experience and research add to it, as now.
- **Other limits.**
  - Tanks and artillery were not in Ryan's list. They get a limit of 100 like planes and warships. Every limit is a number in `rules.json`.
  - Bots keep their stacks, drawn as crowds. With up to 400 of them there is no room for their soldiers.
- **Trade** means trade ships and trains that earn gold, since there are no goods left to carry.
  - Ports send trade ships to other ports: other nations' ports that are not at war with you, and your own far ports. Each trip pays both ends, more for longer trips.
  - A hostile warship captures a trade ship: it becomes the captor's and pays the captor when it reaches the captor's nearest port. With no port to go to, it sinks.
  - Trains between your stations pay the same way.
  - There is no cap, but each port and station sends one at a time.
- **Planes** come with a Flight node in the Industrial era: biplane fighters, bombers and the airfield. Modern planes come with the Modern era. The art is in the kit (`aircraft` sheet, airfield and hangar).

## Part A: crossing by sea with Move

Moving by free boat is built (milestone five, part B), but it fails in three ways:

- **The Move button (M).** It asks the server for a route to preview first. The `route` order refuses anything across water, so the player sees "no land route there" and the boat is never sent. Only Attack from the ring reaches the boat.
- **Groups.** At most 3 boats can be at sea per player, so a group of more than 3 stacks cannot cross.
- **Drawn paths** cannot cross water.

Changes:

- **The preview.** `route` answers a trip over water with the boat plan. The preview draws the walk to the coast, the crossing and the landing, and says the plots of water and the expected loss.
- **Groups.** A group crossing shares boats: stacks that embark at the same coast within a few plots sail together as one boat, and count as one against the limit.
- **Drawn paths.** A point on another landmass makes that leg a crossing.

Evidence: unit tests for the route and group orders, and a browser test that presses M, clicks an island and sees the boat land.

## Part B: gold only

### Costs and income

- **Costs.**
  - Every cost is in gold: buildings, upgrades, roads, rail, training and machines.
  - Each material has a worth in `rules.json` `economy.worth`, used once by a script to turn today's costs into gold. After that, `data/` holds gold only.
  - Upgrades keep the instant premium, with no "materials bought at 4 gold".
- **Income.**
  - Tax from people, as now, set by the tax slider.
  - Farms (field, pastures, fishing huts and docks) earn gold by fertility and season.
  - Mines and oil wells earn gold by the deposit they sit on. They pay more than farms, so deposits are worth fighting over. A mine's deposit still runs out.
  - Commercial and industrial zone buildings still give jobs, and earn gold instead of making goods.
  - Trade ships and trains, below.
- **Towns** grow on housing and gold alone.
  - No food or goods needs. A town upgrades when its houses are full enough and its nation is not taxing it too hard.
  - The troop cap stays land plus a share of the people.

### What goes, what changes

| Now | After |
| --- | --- |
| Food, wood, stone, clay, iron, coal, steel, oil, gas, goods | Gone. Stocks become gold. |
| Woodcutter, quarry, clay pit, sawmill, gas plant, steel mill, textile mill | Retired (kept in the registry, not buildable, removed from old worlds with a refund). |
| Farms, mines, oil wells | Earn gold. |
| Store buildings, stores, carts and their standing orders | Gone. The storage yard, warehouse and logistics depot are retired. Ports and stations stay for trade. |
| Merchant ships carrying goods | They become trade ships (below). |
| Trains carrying goods | They become trade trains (below). Rail stays the fastest way to move. |
| Army supply, supply wagons and desertion | Gone. Troops need no supply. |
| Power plants burning coal | Plants cost gold upkeep. Power still speeds up factories, vehicle factories, naval docks and universities. |
| The market board | Gone, since there is nothing to list. |
| Admin give | Gold, troops, soldiers and machines. |

Research points stay as they are: they are progress, not money. Research nodes that only unlocked retired buildings keep their effects, or get one.

### Trade ships and trains

- Every port launches a trade ship every `trade.every` seconds, to a port chosen by distance and by who is at peace with you. It pays both ends on arrival: `trade.base` plus `trade.perPlot` for each plot sailed.
- A hostile warship near a trade ship captures it and sends it to the captor's nearest port.
- Each station sends a train along the rail to your furthest reachable station in the same way.
- Merchant ship unit 23 becomes the trade ship. Trains are drawn as they are now.

### Old worlds

The save format goes up by one. On load:

- stock and store goods turn into gold at their worth;
- retired buildings are removed and their cost refunded;
- carts and merchant ships at sea are refunded;
- supply wagons are disbanded and their food refunded;
- store standing orders are dropped.

A unit test loads a saved milestone-six world and checks the gold.

### Client

- The purse shows gold and income.
- The build menu shows gold costs.
- The Town panel has no food or goods.
- The Logistics panel becomes a trade panel: ports, stations, ships and trains at work, and what trade earned.
- The market panel goes.

### Evidence

- `npm test`, the reference tests and smoke.
- `npm run soak`, whose stock check becomes a gold check.
- `npm run ui` on the test map.
- The bench on Earth and fine Europe.

## Part C: individual soldiers

### Simulation (`src/sim/soldiers.js`)

- **Storage.** Soldiers are kept as flat arrays: owner, type, position within a plot, health, weight, experience, order and group.
- **Raising.** Soldiers are raised at barracks and war camps from home troops, as the best type trained there. Attack from the ring raises them at the border.
- **The limit.** At most `soldiers.fieldCap` (1,000) per player are out at once.
- **Moving.**
  - A group order plans one path for the group and places each soldier on it in formation, so a thousand soldiers cost one path search.
  - Soldiers take land as they walk into it and pay the capture cost from their health, as stacks pay in troops now.
- **Fighting.**
  - Soldiers look up enemies nearby through a grid of buckets and fight whoever is in range: melee types beside them, ranged types from a few plots.
  - Health falls by the enemy's attack. A bot stack fights as a crowd of its troops.
  - Forts and siege work on soldiers as they do on stacks.
- **Growing stronger.**
  - A soldier's weight is set by era.
  - The barracks can retrain old soldiers into a newer type for gold, in bulk.
- **Other rules.** Disbanding sends soldiers home with the quarter loss. Standing orders work while away (hold or fall back). Boats carry soldiers.
- **Saving** is one row of packed arrays.

### Network

Positions are not sent every tick. A group order sends its path and start time once, and clients walk the soldiers along it. After that, only changes are sent: a new order, health, a death or a stop. Joining sends every soldier in packed form.

### Selecting and ordering

- **The Armies button (and a key).**
  - While it is on, a swipe selects every soldier it passes over.
  - With a mouse, Shift and a drag boxes them.
  - A tap on a soldier selects it; a second tap selects all soldiers of its type on screen.
- **Orders** come from the ring and the group panel: move, attack, hold, fall back, disband, board and pilot. They work the same on touch and mouse.

### Drawing

- **Zoom.** Soldiers are drawn one by one only above `soldiers.drawZoom` pixels per plot. Below that, a group shows as one marker with its count and type.
- **On screen only.** Only soldiers inside the view are drawn.
- **A budget by screen size.** At most one soldier per `soldiers.drawArea` screen pixels are drawn, so a phone draws fewer. Past the budget, soldiers in the same plot are drawn as one figure with a count.
- **Figures** come from the kit's `units` sheet, walking, facing and fighting, as stacks are now. Health bars show on selected soldiers.

### Old worlds

A player's stacks become soldiers at their mix and experience, up to the limit. The rest go home.

### Evidence

- Unit tests.
- A bench with 8 players each fighting with 1,000 soldiers on Earth, which must stay under 50 ms.
- A browser test swiping and ordering, with the frame time at close zoom on a phone-sized and a desktop-sized screen.

## Part D: piloting

- **Taking control.** Pilot (in the ring, or P) takes control of one soldier, tank or ship. The rest of the selection follows in formation. Letting go (Esc, or the button), or leaving the game, hands it back to its order.
- **PC.** WASD or the arrows move it, the mouse aims, and a click fires. Ships and planes turn and speed up rather than strafe.
- **Phone.**
  - A stick on the left moves.
  - A fire button is on the right; a drag from it aims, and a tap fires at the nearest enemy ahead.
  - Planes get a bomb button.
- **Firing.**
  - Soldiers shoot at the aimed point, within their range, after a reload.
  - Tanks and ships fire shells.
  - The server resolves every hit.
- **Server.**
  - A fast loop (every `pilot.every` ms, 50) moves only piloted units, from the latest input, within their speed and the terrain.
  - Your own client moves your unit at once and corrects to the server; everyone else sees it moving smoothly.
  - Inputs have their own rate limit, separate from orders.

Evidence: unit tests for input checks (speed and terrain), and a browser test piloting a soldier with keys and with the touch stick.

## Part E: planes and bombing

- **Research.** Flight (Industrial), after Steam power. It unlocks the airfield, the biplane fighter and the bomber. Modern fighters and bombers come with the Modern era.
- **The airfield** builds and bases planes. At most 100 planes per player.
- **Flying.**
  - Planes fly straight over land and sea and have a range from their airfield.
  - They return to rearm and refuel on their own when short.
- **Orders:**
  - patrol an area, where fighters attack enemy planes;
  - bomb a spot, where bombers drop on arrival;
  - return.
- **Bombs:**
  - kill soldiers in a radius;
  - thin a bot stack;
  - cut the home troops' defence of the plots hit for a while;
  - damage buildings.
- **Defence:** fighters on patrol, and a flak gun (a tower with `antiAir`).
- **Piloting:** fly by hand with the Part D controls and drop bombs with the bomb button.

Evidence: unit tests for range, rearming, bombing and the limit; a smoke world where a bomber hits a stack; the bench with 100 planes per player.

## Progress

- **Part A (28 September 2026, branch `m7-boats`).** Built as planned.
  - Group crossings share one key and still sail one boat per stack, so the far side shows the whole group.
  - Found while testing: with the Town card open, the selected stack's card was squeezed until its buttons scrolled out of sight. On a phone held sideways, the folded feed grew past its column when both tabs showed a count. Both are fixed in `public/index.html`.
  - Evidence:
    - `npm test`: 242 of 242, with three new boat tests.
    - Reference: 95 of 95.
    - `npm run ui` on the test map: 167 of 167, including M and a click on another island (`49b-move-boat.png`).
    - `npm run smoke`: 111 of 111.

## Ryan's checks

Each part is its own branch and pull request, and Ryan checks it before the next: A, then B, then C, D and E.
