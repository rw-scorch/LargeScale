# Milestone 8: the planner and the Modern era

Agreed 29 September 2026, after milestone seven's dev server run.

The design already settled most of the Modern era (`reference/docs/design-decisions.md`, piece 16, rounds 2 to 4 of the questions):

- Nukes and superweapons in Modern and Future, with interception, which the host can turn off.
- Tourism income from parks, museums, stadiums, resorts and wonders, changing with the season.
- Naval invasions and paratroopers.
- Air defence: launchers work on their own with no radar buildings, and planes entering cover are engaged automatically. Nukes and missiles can be intercepted. Everyone sees a launch alert with the blast circle, and the target sees where it will land.

Milestone seven changed three things that this plan follows:

- Gold is the only currency, so there is no uranium, fuel or missile stock to carry.
- Soldiers are companies of 10 troops a soldier, at most 1,000 a player.
- There are at most 100 planes, 100 warships and 100 tanks and guns a player.

## Decisions (29 September 2026)

1. **Everything is in:** the Modern army, air power and SAMs, the Modern navy, nukes, and tourism and downtowns.
2. **A planner, built first.** Ryan: "having all players manually build everything will be very tiresome, some sort of planning device, that is automatic, would be cool."
   - It proposes and you approve: it draws a plan as outlines with a price, and nothing is built until you press Build.
   - It looks after towns, the economy, civic buildings and upgrades, and defence.
3. **Nukes cost gold only, and are very expensive.** There is no uranium rule.
4. **Troops by air:** transport helicopters, and paratroopers dropped from transport planes.
5. **Submarines.** Ryan: "It's hard to hit, and it can fire torpedoes, it can also sink deep into the water, depending on the depth of the water, if the water is deep enough, it can't be attacked." A deep submarine rises to fire.

## What the decisions mean

This is how the answers are read. Ryan corrects anything here that is wrong.

- **The planner is a standing order, not a robot player.**
  - Your approved projects go into one queue.
  - The queue builds each piece in order when there is gold for it, and keeps building while you are away.
  - A piece that has become impossible is dropped with the reason, for example land lost or the spot taken.
- **Nukes are on by default in new worlds.** The design says the host can turn them off, so the switch defaults to on.
- **Water depth** comes from the terrain the maps already have:
  - shallows, lakes and reefs are shallow;
  - ocean is open water;
  - deep ocean is deep, and it is 54% of the Earth map.
  - A submarine cannot dive in shallow water, dives in open water, and goes deep in deep water.
- **Paratroopers are a soldier type.** Only paratroopers can jump from a plane. Any company can ride in a transport helicopter.

## What already exists

- **Kit modules, not installed yet:**
  - `src/sim/nukes.js`: warheads, launch, interception and the blast (craters, scorched land, cleared ownership, rubble).
  - `src/sim/tourism.js`: tourism value by building and season, raised by an airport, a port and rail.
  - `src/sim/cbd.js`: city cores, where defence and attack grow near a nation's densest buildings.
- **Modern buildings in `data/buildings.json` that nobody can reach yet:** the concrete tower, apartment block, cafe, modern factory, open-pit mine, pumpjack, offshore rig and gas plant. There is no Modern research node, so the era never comes.
- **Shared code the planner can use:**
  - `placeError` and `producerError` in `src/shared/buildings.js`;
  - `routePlan` in `src/shared/roads.js`;
  - `polePlan`, `gridsOf` and `coverOf` in `src/shared/power.js`;
  - the upgrade pricing in `src/shared/buildings.js`.
- **Art in the kit:**
  - Planes: jet fighter, strategic bomber, attack and transport helicopters, transport plane, drones.
  - Vehicles: main battle tank, APC, rocket artillery, SAM truck.
  - Ships: cruiser, battleship, submarine (with a submerged frame), aircraft carrier, landing craft, container ship.
  - Soldiers: soldier, special forces, anti-tank team, paratrooper, sniper, engineer.
  - Buildings: SAM sites, missile and ABM silos, the airport set (terminal, hangar, control tower, runway), nuclear plant, refinery, container terminal, skyscrapers, mall, stadium, hospital.
  - Tourism: parks, museums, zoo, stadium, resorts, casino, hotels and eleven wonders.
  - Effects: the nuke blast, craters and scorch, missile trails.

## Part A: the planner

### How it plans

- The plan is worked out in the browser, by shared code in `src/shared/planner.js`, from the client's copy of the world. The server spends nothing on proposals, and the same code is unit tested in Node.
- It proposes **projects**. Each project has:
  - a kind (towns, economy, civic, defence);
  - a reason ("Iron ore at 412, 180 unworked");
  - a price in gold;
  - its pieces: buildings, zones, roads, poles or upgrades.
- It uses the same placement rules as the build menu, so the server accepts what it proposes.
- **What it proposes:**
  - **Towns.**
    - Zones ahead of demand around each town, in blocks with a street grid: housing near the centre, shops along the main streets, works on the far side.
    - The block size follows the town panel's demand.
    - Roads joining each town to the capital's roads.
  - **Economy.**
    - The best unlocked mine or well on each deposit you own that nothing works.
    - Farms on fertile land near towns.
    - A plant and a pole line for buildings off the grid.
    - A port on each shore that has somewhere to trade.
    - Once Railways is known, stations and rail between your biggest towns.
  - **Civic and upgrades.**
    - Libraries, schools, banks, hospitals and the like near town centres, up to the number that still adds anything (each type's `cap`).
    - Upgrades you can afford, as one project.
  - **Defence.**
    - Towers and forts covering the border that faces your strongest neighbour.
    - Once Flight is known, an airfield near that border.
    - Later parts add SAM sites.

### How you use it

- **The Planner panel** (its own key, and a button in the action bar) lists the projects by kind, with the price and the reason. It shows the total and how long your income takes to pay for it.
- **Outlines.** While the panel is open, every proposed piece is drawn on the map as an outline in the planner's colour. A hover or tap on a project highlights its pieces.
- **Your choices.**
  - Build one project, all of one kind, or everything.
  - Skip a project, so the planner stops proposing it.
  - Paint **keep clear** land where it never plans.
- **The queue.**
  - Approved projects go into your build queue: the `plan` order, at most 400 pieces.
  - The queue appears on the map as blueprints, and in the panel with its progress, what it is waiting for, and a Cancel for each project.

### On the server

- `src/sim/planner.js` (`installPlanner`) keeps each nation's queue (`n.plan`) and keep-clear rectangles, and saves them.
- Every second it builds the next pieces it can pay for, through the same code as the `build`, `zone`, `road`, `poles` and `upgrade` orders. A piece that fails for good is dropped and reported in the feed.
- It runs in catch-up, so a queue keeps building while you are away, at the away rate.
- The purse carries the queue's progress.

### Evidence

- Unit tests of the proposals on test maps:
  - towns get blocks and streets;
  - every unworked deposit gets its mine;
  - nothing is proposed on keep-clear land;
  - every proposed piece passes `placeError`.
- A unit test of the queue: in order, as money allows, dropping what became impossible.
- A browser test: open the planner, see outlines, approve all, and watch the town grow with nothing else pressed.
- The bench with a queue per player.

## Part B: the Modern Age and its army

- **Research.**
  - The Modern Age node comes after Railways, Armour, Flight and Universities. It needs 12 Industrial upgrades across 4 branches, like the eras before it.
  - About fifteen Modern nodes follow it. They unlock everything in parts C to F, and the Modern buildings listed above.
- **Soldiers.**
  - New types: soldier, special forces, anti-tank team and paratrooper.
  - They are stronger per soldier than stormtroopers, so 1,000 Modern soldiers hit harder than 1,000 Industrial ones.
  - They are trained at the barracks line, as now.
- **Land machines.**
  - The main battle tank.
  - The APC, which carries one company at vehicle speed and sets it down where it stops.
  - Rocket artillery, which cuts capture cost from 6 plots away, like siege.
  - All three count toward the 100 tanks and guns.
- Every new unit can be piloted with the milestone seven controls.
- The planner learns the Modern buildings.

## Part C: Modern air power and air defence

- **Planes.**
  - The jet fighter: fast, with a long reach.
  - The strategic bomber: a big load and a long reach.
  - The attack helicopter: slow and low. It hovers over the front and shoots companies and machines instead of bombing.
  - All of them count toward the 100 planes.
- **Troops by air.**
  - The transport helicopter lifts any one company of up to 20 soldiers. It lands it on any land within reach of its base, and on hostile land the company lands fighting, like a boat landing.
  - The transport plane carries up to 50 paratroopers and drops them anywhere within its longer reach, with a small loss on landing.
- **Air bases.** The airfield upgrades to an air base, drawn with the terminal, hangar and runway art: a longer reach and more planes rearming at once.
- **Air defence.**
  - The SAM site replaces flak in the Modern era. It fires at planes within 8 plots and holds 4 missiles, which reload by themselves for gold.
  - The SAM truck is a mobile SAM that can follow a company.
  - Overlapping sites combine their fire, but with less added by each extra site, so several cheap sites do not beat one strong one (round 2, questions 4 and 7).
  - The planner proposes SAM sites for defence.

## Part D: the Modern navy

- **Cruiser.** It fires at planes within 3 plots as well as at ships.
- **Battleship.** It shells the coast within 4 plots, which cuts capture cost and hits companies.
- **Submarine.**
  - It depends on the water it is in:
    - **Shallow water:** it cannot dive, and anything can hit it.
    - **Open ocean:** it runs submerged, and only destroyers, cruisers, other submarines and helicopters can hit it.
    - **Deep ocean:** it can go deep, where nothing can hit it.
  - It fires torpedoes at ships, and they hit harder than guns.
  - Firing brings a deep submarine up to attack depth for about 20 seconds, so it can be answered.
  - It sinks trade ships rather than capturing them.
  - The submerged frame is drawn while it dives, and a deep one is drawn faint.
- **Aircraft carrier.** A floating airfield for up to 12 planes, whose reach moves with it.
- **Landing craft.** After Amphibious warfare, the free transport boats become landing craft: half the loss, and faster.
- All of them count toward the 100 warships except landing craft, which are free like the boats they replace.

## Part E: nukes and missile defence

This part builds on the kit's `nukes.js`.

- **The missile silo.**
  - It builds one warhead at a time: atomic after Nuclear weapons, hydrogen after Thermonuclear weapons.
  - Warheads cost gold only, and a lot of it: about 40,000 for an atomic and 120,000 for a hydrogen warhead, with long build times. The numbers are in `rules.json`.
- **Launching.**
  - Pick a warhead and a target. The launch screen shows the blast circle and the chance of interception, and asks to confirm twice.
  - Only hostile land can be targeted, and never during peace.
- **Everyone sees the launch.** The alert shows who launched, the blast circle, and a countdown to impact (60 s plus distance).
- **Interception.**
  - SAM sites and SAM trucks within range roll against the warhead.
  - ABM silos are the strong defence against it.
- **The blast.**
  - The inner ring becomes crater and scorched ground, and its ownership is cleared. The capital plot is spared, so a nuke never ends a nation outright.
  - Buildings in the inner ring become rubble; in the outer ring they are damaged.
  - Companies die in the inner ring and lose 60% in the outer one.
  - Planes in the air and ships in the blast are hit too.
- **The host switch.** A world setting, `nukes`, is on by default and shown in World info.
- The planner proposes ABM silos for defence once they are known.

## Part F: tourism and downtowns

This part builds on the kit's `tourism.js`.

- **Tourism buildings.**
  - Parks and plazas are Medieval, museums Gunpowder, zoos Industrial. Stadiums, resorts, casinos and hotels are Modern.
  - Each earns tourism gold, and resorts swing with the season at their latitude.
  - An airport terminal raises tourism by 25%, a port by 10% and rail by 10%.
  - Variety pays better than copies.
- **Wonders.** One of each per world, and whoever finishes it first owns it. Each adds 10% to tourism, and their art is in the kit.
- **Downtowns.** In the Modern era, shops in busy commercial zones with roads on two sides upgrade by themselves into office blocks and skyscrapers. That gives each nation a recognisable centre.
- **City cores** (the kit's `cbd.js`, piece 19). Defence grows near the densest part of a nation.
- The planner proposes tourism buildings as part of civic.

## Not in this milestone

- The Future era: hover tanks, mechs, shields, drones and orbital strikes.
- Engineers and terrain destruction, conventional cruise missiles, and the market board.
- Bots stay as they are. They could use the planner later, since it is shared code.

## Evidence for each part

- Unit tests for every new rule.
- `npm test`, the reference tests, smoke and `npm run ui` on the test map.
- `npm run soak` with the new orders.
- The Earth and fine Europe benches with Modern units at the limits.

## Progress

- **Part A, the planner (29 September 2026, branch `m8-modern`, stacked on `m7-air`).** Built as planned, with these specifics:
  - **Proposals** (`proposePlan` in `src/shared/planner.js`) are worked out from a view of the world. `ClientWorld.planView()` gives the browser's, and `planView` in `src/sim/planner.js` gives the server's, for tests and for bots later. A unit test builds both from one world and gets identical projects.
    - **Towns.**
      - A block is 7 by 7 plots: four 3 by 3 lots with two crossing streets, or 5 by 5 with one street where 7 by 7 does not fit.
      - A housing block comes when fewer than 6 free housing plots are left. Shops and works come only with demand.
      - Works start at least 6 plots out from the town centre.
      - A connecting road joins the block's streets to the nearest road, and towns whose roads do not reach the capital's get a road to it.
      - The best road known is used: cobble after Paved roads, otherwise dirt.
    - **Economy.**
      - The newest unlocked mine or well goes on each unworked deposit, at most 12 a kind, the kinds worth most first.
      - Fields come when workers have no job, one per spare worker, at most 12.
      - A building off the grid gets a pole line to the nearest grid within 40 plots, or a plant of its own. A grid short of power gets another plant.
      - A port comes if you have none, and a second one 12 plots or more from the first.
      - Once Railways is known, stations at your two biggest towns with rail between them.
    - **Civic.** Buildings that count up to their `cap`: income first, then research, town growth and troop limit, at most 2 of a kind at a time. Upgrades of every player building are one project.
    - **Defence.**
      - The strongest neighbour is the one with the most troops times the square root of the border you share.
      - The best one-plot tower is placed until that border is covered, at most 8.
      - An airfield comes once Flight is known, if none is within 20 plots of that border.
  - **The queue** (`installPlanner`, rank 5, every second).
    - Zones cost nothing and are painted at once.
    - Paid pieces are built in order. While one waits for gold, only zones may pass it.
    - A piece that cannot be placed any more is dropped at once with its reason (`plan_dropped`), and a finished project reports `plan_done`.
    - The `plan` order takes `add` (one project, up to 60 pieces, 400 in the queue), `cancel`, `clear` and `keep` (up to 32 areas, each up to 128 by 128).
    - A socket message is at most 4,000 characters, so the browser sends one project per order.
  - **Network.**
    - The purse carries a small `plan` summary.
    - The whole queue goes as a `plan` message only when it changes, and in `hello` with `planRules`.
  - **Client.**
    - The Planner card is `public/js/ui/planner.js`: the O key, and the Plan button in the action bar with the queue's progress.
    - It lists projects by kind with price, reason and pieces, and has Build, Show, Skip (kept per world in the browser), Build these, Build all and Look again.
    - Proposals are drawn as outlines while it is open (`drawPlan`); queued pieces are dashed blue.
    - Keep land clear paints areas with the zone drag. The feed reports finished and dropped projects.
  - **Evidence:**
    - `npm test`: 253 of 253, with nine planner tests:
      - blocks and streets;
      - mines, keep clear and skip;
      - fields, civic and upgrades;
      - towers and the airfield;
      - power;
      - the queue;
      - order checks;
      - the rules;
      - the browser's plan against the server's.
    - Reference: 95 of 95.
    - One plan, measured in Node:
      - fine Europe size (1400 by 760) with a 90,000-plot nation: 18 to 56 ms;
      - Earth size (3600 by 1440) with a 160,000-plot nation: 19 to 71 ms.
      - The browser plans again every 5 s while the card is open.
    - The drawing, run in Node against a recording canvas: 23 fills and 5 outlines for a known plan, as counted by hand, with queued items dashed.
    - **Bench.** It now queues every player's proposals twice during the run, and reports them under `planner`. It also reports `pathTotals`, the path work over the whole run.
      - A short run (1,300 ticks, 400 bots): the players, Medieval by then, queued 9 projects of 37 pieces in the first round. All were built, and none were dropped.
      - The bench cannot give a pass or fail today: the laptop is on battery (39%, Balanced plan), and the same code swings several times between runs.
        - The previous commit, without the planner, measured a p99 of 52.5 ms, where it measured 30.1 ms this morning.
        - Two runs of this branch, back to back: with the planner off, worst 273 ms (p99 159); with it on, worst 63 ms (p99 51). The median was 12 ms in both.
      - **Rerun on mains power** (afternoon of 29 September), full Earth bench, back to back:

        | Planner | Median tick | p99 | Worst | Path extends |
        | --- | --- | --- | --- | --- |
        | On (35 projects, 195 pieces queued) | 19.9 ms | 76.1 ms | 107 ms | 11,970 at 5.1 ms each |
        | Off | 18.1 ms | 74.9 ms | 97 ms | 11,655 at 4.7 ms each |

        The planner adds about 2 ms at the median. Both runs are over the 50 ms budget, but so is the same simulation without the planner: it measured 41 ms at worst this morning, so the machine is running about 2.5 times slower now. The bench needs a rerun with the laptop cool and in its best performance mode.
  - **Dev server run (29 September 2026).** Ryan said go ahead.
    - `npm run smoke` on the test map: 114 of 114. The planner proposed 3 projects in 25 to 35 ms, and the housing block it queued was built with nothing else pressed.
    - `npm run soak`, 180 s: 1,248 rounds, 0 tick errors, no problems. There were 150 plan additions and 58 kept areas, with up to 15 projects proposed at once.
    - `npm run ui`: 170 of 171.
      - O opens the planner, and Build builds a project with nothing else pressed.
      - The layout checks pass at 1280 by 720 and on a phone held sideways, after two changes: Deposits moved to the corner icons, and the zoom buttons are hidden on touch screens, where pinching zooms.
      - The one failure was the test, not the game. At speed 4 the free boat crosses a 7-plot strait before the browser sees it on the map. The check now also accepts the `boat_launched` event.
    - A first smoke run failed three stack checks once: the second stack was gone after a long move. The next run passed them, and the check now prints the stack and its events if it happens again.
    - Smoke, `npm run ui` and the soak have planner checks written, but they have not been run: the dev server stays off until Ryan asks for it.
