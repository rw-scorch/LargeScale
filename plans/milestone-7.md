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

### How it is built on companies (29 September 2026)

Soldiers are companies (Part C as built), so piloting works on a company or a machine.

- **Taking control.**
  - Piloting one soldier first detaches it, as any order on picked soldiers does. It then becomes a company of one.
  - The rest of the selection follows the piloted company: every second they are sent towards it, keeping their places.
- **Moving.** A piloted company or machine gets a position within its plot (`src/sim/pilot.js`).
  - When it crosses into another plot, a company enters it the way a walking stack does, so it takes land and pays for it.
  - A machine enters only land or water, as it can move.
  - The normal stack and machine movement leaves piloted ones alone.
- **Firing.** One shot a reload, at the enemy company, stack or machine nearest the aimed point within range.
  - A company's shot costs the target its power times `pilot.hit`.
  - A machine's shot uses its own attack and range.
- **Network.**
  - While anything is piloted, a small `pilots` message goes out every `pilot.sendEvery` ms with each piloted unit's position.
  - Shots go out as events, which clients draw as tracers.
- **Letting go.**
  - Esc, the button, leaving the game, or `pilot.idle` seconds without input hand the unit back.
  - It then holds where it stands.

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
- **Part B (29 September 2026, branch `m7-gold`, stacked on `m7-boats`).** Built as planned, with these differences:
  - **Kept.** The gas plant and the textile mill are not retired. The gas plant earns gold on a gas deposit like any mine, and the textile mill is a zone building like the factory.
  - **Market.** The market board was never installed in `world.js`, so nothing had to go.
  - **Trade ships.** A trade ship between two of your own ports needs them at least `trade.minPlots` apart. Foreign ports are picked `foreignWeight` (3) times as often as your own.
  - **While away,** trade is paid as an estimate per port and per station.
  - **Unknown orders.** They now get an "unknown order" answer. Before, an old client's wagon order got no answer at all.
  - **Evidence:**
    - `npm test`: 223 of 223. The count was 242: the stores, supply and sea-route tests went, and five trade tests came.
    - Reference: 95 of 95.
    - Earth bench: PASS, worst tick 34.9 ms (p99 17.8), with 24 ports, 8 trade ships at sea, 6 stations and 2 joined pairs.
    - Fine Europe bench (25 bots): PASS, worst tick 30.6 ms (p99 13.8), with 32 ports, 14 trade ships at sea and 2 trains. Peak memory was 89 MB.
    - Smoke, soak and `npm run ui` are rewritten for gold: trade ships between jetties, the Trade panel, rail at 12 gold a plot, and a vehicle factory on the grid. They have not been run yet, because the dev server stays off until Ryan asks for it.
- **Machine limits (29 September 2026, branch `m7-soldiers`).**
  - At most 100 land machines, 100 warships and 100 planes per player (`rules.json` `machines.limits`), counting machines built and queued. Transport boats and trade ships are not limited.
  - A queue waits if captures or gifts have filled the limit, and the building card shows the count.
- **Part C (29 September 2026, branch `m7-soldiers`, stacked on `m7-gold`).** Built with a different engine from the plan above, for the reasons below. What the player sees and does is as planned.
  - **Companies, not a new simulation.**
    - A player's stack is a company, and every 10 troops in it (`soldiers.troopsEach`) is a soldier.
    - The server keeps companies as stacks, so combat, taking land, boats, guard, standing orders, catch-up and saving all work unchanged, and bots fight players by the same rules.
    - The plan's own simulation would have needed all of those again for soldiers, side by side with bot stacks. It would also have needed a new network form.
  - **What is built.**
    - Soldiers are drawn one by one above `soldiers.drawZoom`, only on screen. At most one is drawn per `soldiers.drawArea` screen pixels, so a phone draws fewer.
    - Armies (V) picks them by swipe, Shift-drag box or tap. A tap on a picked soldier picks all of its kind on screen.
    - Orders on picked soldiers take exactly those soldiers, by type, out of their companies (the `detach` order).
    - At most 1,000 soldiers in the field. Bots keep their stacks.
    - Soldiers grow stronger by type, which rises by era (levy 1, knight 3, grenadier 5, stormtrooper 6), and by experience.
  - **Not built from the plan:** health bars per soldier, ranged types shooting from a few plots, bulk retraining of old soldiers at the barracks, and raising soldiers only at barracks (companies still form on any plot you own).
  - **Added:**
    - At most 100 companies per player, which bounds path work and network use.
    - Advancing stacks look for the border at most 8 a tick (`seeksPerTick`).
    - Stacks extend their paths at most 12 a tick while they have plots left to walk (`extendsPerTick`).
    - Without these, 100 companies ordered at once made an 84 ms tick.
  - **Evidence:**
    - `npm test`: 231 of 231, with six soldier tests, a machine limit test and a client test.
    - Reference: 95 of 95.
    - Earth bench, 8 players each with 1,000 soldiers in 100 companies, half advancing and half marching: PASS, worst tick 38.6 ms (p99 30.5). A state message is 17.8 KB at the median, sent once a second; peak memory is 126 MB.
    - Fine Europe: PASS, worst tick 46.1 ms (p99 29).
    - The renderer run in Node, with the numbers in the session notes:
      - a 1280 by 720 screen with 2,100 soldiers in view draws 1,025, its budget;
      - a phone draws 365;
      - no soldier stands on water;
      - a moving company glides between plots.
    - The browser and smoke checks for Armies mode and `detach` are written, but not run until the dev server is started.
- **Part D (29 September 2026, branch `m7-pilot`, stacked on `m7-soldiers`).** Built as described under "How it is built on companies", with one gap: there is no local prediction yet.
  - The camera follows the server's position, which arrives every 100 ms and is glided between samples. Input therefore shows after one round trip.
  - Prediction can come later if it feels slow in play.
  - **Evidence:**
    - `npm test`: 237 of 237. Five piloting tests cover:
      - speed and the speed cap;
      - taking land;
      - the shore;
      - firing, the reload and range;
      - a ship's throttle and turn, staying on water, and shells;
      - followers, and release when idle.
    - A client test covers pilot positions and shots.
    - The renderer run in Node: a piloted company stands where the pilot message puts it, and faces and walks the way it moves.
    - Written but not run until the dev server is started:
      - the smoke check: steer, the friend sees it, let go;
      - the browser checks: P, holding a key, Esc; on a phone, Pilot, the stick and Let go.
- **Part E (29 September 2026, branch `m7-air`, stacked on `m7-pilot`).** Built as planned, with these specifics:
  - **Research and content.**
    - Flight (Industrial, after Steam power, 900 points) unlocks the airfield (building 67), the biplane fighter (unit 33) and the bomber (unit 34).
    - Anti-aircraft guns (after Flight) unlock the flak tower (building 68).
    - Modern planes wait for the Modern era.
  - **Flying** (`src/sim/air.js`, `installAir`).
    - Planes fly straight at their speed, within their `radius` of an airfield, and burn `endurance` seconds of fuel.
    - They turn home when the fuel left is 1.25 times the way back, land, and rearm for 20 s.
    - A plane over a lost airfield is lost with it, and one that runs dry goes down.
  - **Fighters** on patrol circle the spot and chase any hostile plane within `air.detect` (6 plots) of their patrol area. They shoot at the machine battle rate times `air.dogfight`.
  - **Bombs.** A bomber's load hits everything hostile within 1.5 plots:
    - 90 troops from each company or stack;
    - 45 health from each land machine;
    - active buildings are damaged, and repair by themselves after 120 s;
    - the land hit costs half as much to take for 90 s.
  - **Anti-aircraft.** Flak towers hit hostile planes within 4 plots for 6 health a second; airfields for 2 within 2 plots.
  - **Orders.** The `air` order (patrol, bomb, return) takes one plane or several. The `machine` order refuses planes.
  - **Piloting.** Planes fly with the Part D controls, never slower than 30% of their speed, and a bomber's bomb input drops its load where it is.
  - **Client.**
    - The aircraft sheet is loaded. Planes are drawn turned to their heading, with shadows. Flak bursts and bomb blasts are shown.
    - The plane card and the ring have Patrol, Bomb, Fly home and Pilot. The feed reports bombings and planes shot down.
  - **Evidence:**
    - `npm test`: 243 of 243, with six air tests:
      - unlocks and basing;
      - range, the bombing run and all its effects, rearming and repair;
      - fuel and turning home;
      - a dogfight and flak;
      - the plane limit, catch-up and a piloted bomb;
      - rows reaching the client.
    - Reference: 95 of 95.
    - Earth bench with 100 planes per player on top of 1,000 soldiers each: PASS, worst tick 41.3 ms (p99 30.1). The planes flew 7,010 missions, made 4,151 bombing runs and lost 9 to fighters and flak.
    - Fine Europe, the same load: PASS, worst tick 44.1 ms (p99 31.3), with 5,785 missions, 3,426 bombing runs and 198 planes shot down.
    - Written but not run until the dev server is started:
      - the smoke check: after Flight, a bomber from a new airfield bombs the friend's company;
      - the browser check: an airfield bases a fighter, and Patrol sends it up.
- **The dev server run (29 September 2026, on `m7-air`).** Ryan asked for `npm run dev` to run smoke, soak and the browser test for Parts B to E, on the test map.
  - **Found and fixed in the game:**
    - **Trade while away.** Every port on water was paid the away estimate, even one with no port to trade with. A lone pair of jetties 9 plots apart earned 289 gold in the test's catch-up. Now only ports with a partner (`partnersOf` in `src/sim/trade.js`) and stations joined by rail to another station count, and a unit test holds it.
    - **Phone layout.** On a phone held sideways, the Armies button widened the action bar into the control panel and the feed. The action buttons are smaller on screens under 500 pixels high.
    - **Tax.** The vitals now carry `tax`, the part of gold income a bank raises.
    - **Admin gifts and the limit.** The admin's gift of machines skipped the limit, and the soak's host reached 106 planes. Gifts now stop at the limit and say so.
  - **Test fixes.** These were wrong in the tests, not in the game:
    - A soldier carries a share of the company's odd troops, so three levies are 30 to 39 troops.
    - State rows round troops down, so a split shows up to 2 troops fewer than it had.
    - The vehicle factory needs Field guns.
    - Jetties must be at least 12 plots apart to trade. The test now picks the furthest pair.
    - The soldier Move target may be unclaimed land.
    - Research at 40 times speed can finish Fire keeping before the test queues it.
    - The login helper waits for the world list or an error, not a fixed 3 seconds.
  - **Evidence:**
    - `npm test`: 244 of 244. Reference: 95 of 95.
    - `npm run ui` on the test map: 168 of 168. Among them:
      - two jetties 39 plots apart send a trade ship that earns 13 gold;
      - a company of 1,757 troops is drawn as 175 soldiers, and a box picks 87;
      - Move splits the company into 883 and 873;
      - P and D walk a company 1.9 plots, and so does the phone stick;
      - after Flight, an airfield bases a fighter and Patrol sends it up with 69 s of fuel.
    - `npm run smoke` on the test map: 113 of 113. Among them:
      - three picked soldiers leave a company of 186 as one of 31, leaving 154;
      - the host pilots a company 6.3 plots, and the friend sees it move;
      - rail between two stations runs trains worth 28.5 gold a trip;
      - a bomber flies 30 plots from a new airfield and bombs the friend's company: 90 troops lost, 1 building damaged.
    - `npm run soak` for 180 s now also sends `detach`, `pilot` (take, input, release) and `air` orders, and the host has Flight and an airfield. 1,111 rounds, 24 game minutes, 0 tick errors, no problems:
      - 119 detaches, 84 pilot sessions with 452 inputs, 81 plane orders;
      - planes held at 100 (the limit), soldiers in the field at most 999 of 1,000;
      - 646 bombings and 8 planes shot down.

## Ryan's checks

Each part is its own branch and pull request, and Ryan checks it before the next: A, then B, then C, D and E.
