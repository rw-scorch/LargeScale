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
- **Part B, the Modern Age and its army (29 September 2026, branch `m8-army`, stacked on `m8-modern`).** Built as planned, with these specifics:
  - **Research.**
    - The Modern Age (`age_modern`) sits in the Industrial column and costs 3,600 points. It comes after Railways, Armour, Flight and Universities, and needs 12 Industrial nodes across the 4 branches.
    - Twelve Modern nodes cost 800 to 1,400 points:
      - **military:** Modern infantry; Special operations; Anti-tank weapons (+5% defence); Mechanised warfare; Rocketry; Reinforced concrete (the concrete tower);
      - **economy:** Open-pit mining; Modern oil (pumpjack and offshore rig); Natural gas; Automation (the modern factory, +5% income);
      - **civic:** High-rise living (apartment blocks); Consumer society (cafes).
    - Every Modern building already in the registry is now behind one of them. Homes and shops upgrade to them only once they are known.
  - **Soldiers** (units 35 to 37, trained at the barracks line):

    | Type | Attack | Defence | Speed | Capture | Gold |
    | --- | --- | --- | --- | --- | --- |
    | Soldiers | 8 | 7 | 1.2 | 1.6 | 14 |
    | Special forces | 11 | 6 | 1.4 | 2.2 | 24 |
    | Anti-tank teams | 7 | 11 | 1 | 1.2 | 16 |

    Stormtroopers are 6 and 3.
  - **Machines** (units 38 to 40, built at the vehicle factory, all counting toward the 100):
    - main battle tank: 320 health, attack 64, defence 44, speed 1.8, 3,400 gold;
    - APC: carries up to 300 troops, 1,600 gold;
    - rocket artillery: cuts capture cost to 1/4.5 within 6 plots, 2,600 gold.
  - **APCs** use the ships' boarding code, widened to land machines with a `capacity`.
    - A company boards with `board`, or Board the APC in its ring, and walks onto the APC's plot.
    - A `machine` move with troops aboard sets them down where it stops, and the reply carries `unloads`. `land`, which is Unload on the card and Unload here in the ring, sets them down on a chosen plot.
    - There is no loss, and a hostile plot costs its capture cost.
    - Troops aboard count toward the 1,000 soldiers.
    - **Added:** a carrier with troops aboard is not captured. When an enemy stack comes beside it, the troops get out and fight. Before, a capture would have handed the enemy an APC with your troops still inside; now a capture empties it.
  - **The planner** places Modern buildings once they are known, and centres mines on their deposit. Before, a 3 by 3 open-pit mine only just reached its deposit and missed the one beside it.
  - **Evidence:**
    - `npm test`: 260 of 260, with six Modern tests:
      - the era and its unlocks;
      - soldiers and training;
      - the vehicle factory;
      - an APC's trip;
      - unloading on enemy land, and troops getting out;
      - rocket artillery's range.
    - It also has a planner test for Modern buildings.
    - `npm run smoke`: 115 of 115. After Mechanised warfare an APC took 300 troops aboard, drove 8 plots and set all 300 down where it stopped.
      - Two older checks depend on where the host lands, which changes with how far the bot has spread by then. One run in five had no free strip for the road check and a friend too far off to beat in 90 s.
      - The road check now searches a wider area, and the elimination check prints why if it fails.
    - `npm run ui`: 173 of 173 on the test map.
      - A company right-clicks the APC and gets in: 300 aboard.
      - The APC card has Unload, and its ring offers land, move, stop, pilot and info. Move here sets all 300 down where it stops.
      - The first two runs failed on the test itself: the company had not been formed yet, and the check compared the troops aboard with the whole company instead of the 300 the APC holds.
      - The screenshot showed "Your apc" and "The ship is full". Names starting with two capitals now keep them, and boarding and getting out name the APC.
- **Part C, air power and air defence (29 September 2026, branch `m8-air`, stacked on `m8-army`).** Built as planned, with these specifics:
  - **Research.** Five military Modern nodes:
    - Jet engines (1,300): the jet fighter and the air base.
    - Strategic bombing (1,400, after Jet engines): the strategic bomber.
    - Helicopters (1,200): attack and transport helicopters.
    - Airborne forces (1,000): paratroopers and the transport plane.
    - Guided missiles (1,200): the SAM site and the SAM truck.
  - **Planes** (units 42 to 46, built at the airfield or air base, all counting toward the 100):

    | Plane | Health | Speed | Reach | Fuel | Gold | Job |
    | --- | --- | --- | --- | --- | --- | --- |
    | Jet fighter | 90 | 5 | 90 | 80 s | 4,200 | shoots planes within 3 plots |
    | Strategic bomber | 160 | 3 | 140 | 150 s | 6,400 | 3 bombs in a line |
    | Attack helicopter | 110 | 1.6 | 30 | 110 s | 3,800 | hovers, shoots companies and vehicles |
    | Transport helicopter | 90 | 1.8 | 40 | 90 s | 2,600 | lifts 200 troops |
    | Transport plane | 120 | 2.6 | 110 | 130 s | 3,400 | drops 500 paratroopers |

  - **The air base** (building 69) is the airfield's upgrade: 5 by 3 plots, drawn from the terminal, hangar and runway art (`parts` in `data/buildings.json`). Its planes reach 1.5 times as far. It rearms 12 planes at once, the airfield 4 (`airbase.slots`); the rest wait their turn, and their rows and cards say so.
  - **The strategic bomber** drops its three bombs 1.5 plots apart along its heading, reported as one `bombed` event with `bombs`.
  - **The attack helicopter** hovers on its spot and hits the nearest enemy company (4 troops a second) or vehicle (6 health a second) within 2 plots (`strike`). It never shoots at planes; fighters, flak and SAMs shoot at it. Its attack of 14 is used only when piloted.
  - **Troops by air.**
    - A company boards a transport that is on the ground, as it boards a ship: Board in its ring, or the `board` order. The transport plane takes only the company's paratroopers.
    - The `air` order's `drop` flies there and sets them down: the helicopter without loss, the plane losing 5% in the jump. On enemy land they pay the plot's capture cost, as a boat landing does.
    - A transport shot down loses the troops aboard (`plane_down` carries `lost`). One on the ground at an airfield that is lost sets its troops down first.
    - Piloting a transport, B or the Drop button sets the troops down below.
  - **Paratroopers** (unit 41, barracks): attack 9, defence 7, capture 1.8, 22 gold.
  - **SAM sites and trucks.**
    - The SAM site (building 70) is the flak tower's upgrade, 2 by 2, drawn as the heavy SAM battery and as its empty launcher when it has no missiles. It fires at the nearest enemy plane within 8 plots: 4 missiles of 45 damage, one every 2 s, and one missile back every 15 s for 60 gold.
    - The SAM truck (unit 47, vehicle factory) carries 2 missiles with a 6-plot reach and follows a company like any land machine.
    - Each missile is a `sam_fired` event, drawn as a missile with a trail. Catch-up reloads as many as the gold pays for.
  - **Overlapping air defence.** Every hit from flak, airfield guns and SAMs on one plane in a tick is sorted, largest first, and each counts half as much as the one before (`air.overlap`, `combined` in `src/sim/air.js`). Two SAM sites on one jet do 45 and 22.5. Fighters' guns are not part of this.
  - **The planner** proposes SAM sites over the capital, the biggest town and airfields that no SAM site covers yet: at most 3 (`planner.sams`), within 5 plots (`samNear`). The civic buildings it proposes first fill the land within 3 plots of the capital.
  - **Client.**
    - Machine cards: Strike for the attack helicopter, Land troops or Drop paratroopers for transports, bombs and missiles aboard, and a place in the rearming queue.
    - Building cards: a SAM site's missiles; the planes at an airfield and how many wait to rearm.
    - The map: turning rotors, tracers from attack helicopters, SAM missiles, parachutes, a strategic bomber's line of blasts, and the reach ring of a selected SAM site or truck.
  - **Evidence:**
    - `npm test`: 269 of 269, with 8 air power tests in `test/airpower.test.js` and a planner test for SAM sites. The reference tests: 95 of 95.
    - `npm run bench` on mains power, with a Modern air force: each of the 8 players has 100 planes (jet fighters, strategic bombers, attack helicopters and early bombers), 4 SAM sites and 4 SAM trucks.
      - The air module's own tick: 1.05 ms at the median, 14.5 ms at worst, 3.3 s over 2,400 ticks. 1,655 missions were flown, 763 bomb runs, 19 SAM missiles fired and 4 planes shot down.
      - The whole tick: 19.2 ms at the median, 103.6 ms at worst, so the bench still fails its 50 ms budget. The worst tick is path extension (60 ms for 12 paths), as before this part; the bench now takes `--modern` and `--sams`.
    - Smoke, `npm run ui` and the soak have Part C checks written (a helicopter lift and a SAM site in the smoke; boarding, Land troops, Strike, the SAM card and the air base drawing in the UI test; transports, drops, SAM sites and trucks in the soak). They ran with the next branch, `m8-asks`, on 29 September 2026: smoke 117 of 117, `npm run ui` 183 of 183, and the soak clean (see below).
- **Ryan's asks after PR 38 (29 September 2026, branch `m8-asks`, stacked on `m8-air`).** His answers: a leader in front with ranks behind; cheats per player, admin rights for others and a Research all button; queueing in the research panel only; and on phones, taps that sometimes do nothing, plus colours for every part of the screen with ready-made themes.
  - **Cheats** (`src/sim/cheats.js`, `installCheats`, installed last so it runs after all spending):
    - `n.cheats` lists what is on: `gold` keeps gold at 1,000,000,000, `troops` keeps troops at 100,000 (`rules.json` `admin.cheats` can change both), `build` finishes that player's sites and paid machines at once, `research` finishes the queue at once.
    - The `cheat` admin op turns one on or off for any living player, bots included. The purse carries `cheats`, and the HUD shows the infinity sign for gold or troops.
    - Turning infinite gold or troops off puts them back to what they were when it went on, or less if the player now has less (`n.cheatBase`). Otherwise switching it off would leave a billion gold.
    - `researchAll` finishes every node in every era (`researchAll` in `src/sim/cheats.js`).
  - **Helpers.** An admin ticks powers for another player in one world: World (rename, save, end, reopen), Speed, Schedule, Remove players, Give and research, Cheats.
    - They are kept in the world's `meta` `powers` by account, checked by `adminAllowed` in `src/admin.js` for every admin op, and sent as `hello.powers` and a `powers` message when they change.
    - A helper gets the admin button and a Helper panel with only the ticked parts, plus the schedule editor in World info with Schedule. Only full admins give powers; deleting worlds and accounts stays theirs.
  - **Research.** The server already queued everything a node needs, eras included, but the queue held 40 nodes, and the path from the first era to a Modern node is longer, so the order was refused. The queue now holds 150; the tree has 78 nodes. The panel's buttons come first on its card and say how many they queue ("Research next, with the 23 it needs", "Queue all 24").
  - **Taps that did nothing.** Panels rebuild their buttons when what they show changes; the research card did it every few points. A finger that went down on a button that was replaced before it came up clicked nothing. Now any press on a button, box or ring item holds panel refreshes (at most 600 ms), and the click lets them go before its own action runs.
  - **Colours** (`public/js/ui/theme.js`, Settings, Colours):
    - Seven themes: Harbour (the old colours), Parchment, Iron, Forest, Crimson, Ocean and High contrast, and a panel opacity slider.
    - Ten parts of the screen can each take their own background, text, accent and button colours: the leaderboard, status line, corner buttons, your nation, the action bar, events and chat, the cards, the big panels, the orders ring, and the menu and world list. Reset gives a part the theme's colours again.
    - Kept in the browser (`ls_theme`). Buttons, fields and panels now read colour variables instead of fixed colours.
  - **A leader and ranks.** Drawn soldiers form up behind a leader: the first soldier walks in front, a little larger, with the company's marker above him, and the rest follow in ranks of at most 12 (`rankSlots` in `src/shared/soldiers.js`).
    - Each soldier walks to his place at his own pace (1.2 to 2.1 plots a second), so the ranks trail and close up as the company moves.
    - The company faces the way it moves, or the enemy beside it; in a fight the ranks loosen and sway.
    - When the company loses soldiers, the ones gone fall where they stood and fade over 3 s.
    - Orders and battles still work on the whole company; only the drawing changed.
  - **Found by the smoke run:** the browser copied the purse field by field and dropped `sams` and `cheats`, so SAM missiles and the infinity sign would never have shown. Fixed, and `test/client.test.js` now reads the purse fields from `src/world.js` and checks the browser keeps each one.
  - **Evidence:**
    - `npm test`: 277 of 277 (cheats, Research all, helper powers, queueing a Modern node from the first era, the ranks, the themes, the purse fields).
    - `npm run smoke` on the test map: 117 of 117, with Part C's helicopter lift and SAM site. Two earlier runs each had failures that depend on where the players land: once the moving company, once the road strip. They passed on the next run.
    - `npm run ui` on the test map: 183 of 183, with screenshots of the helper panel (`21b`), the cheats with gold shown as infinity (`21c`), the Iron theme with the events panel in its own colour (`2t`), and the ranks on a desktop and a phone (`66` to `69`). The new checks:
      - A press on a button while research points come in still lands: the panel waits instead of replacing the button.
      - "Queue all 40" on Jet engines, from the first era, queues all 48 nodes on the way.
      - A friend ticked for Give and research gets a Helper panel with only that part and can give gold; unticked, the button goes.
      - Infinite gold shows the infinity sign, and off again shows the number.
      - The Iron theme, one part's own colour, and Back to the usual colours.
      - Part C: a company boards a transport helicopter and is set down with Land troops; the attack helicopter's card has Strike; a SAM site's card reads "4 of 4 missiles"; the air base is drawn from its 7 parts.
    - Two runs before that each had failures from the tests themselves: a pattern that lost its backslash, and the cheat check leaving the host a billion gold, which stopped a later check setting gold to 400. That led to putting gold back when the cheat goes off. The upgrade checks also placed their towers on a sparse grid near the capital, which found only 2 free spots when the host held little land; they now search every plot within 12.
    - `npm run soak`, 180 s: 1,309 rounds, 24 game minutes, no tick errors, no problems. Both players saw 30 boardings, 28 landings, 128 SAM missiles, 210 bomb runs and 44 planes down.
- **Bombers reach anywhere (29 September 2026, branch `m8-bombers`, stacked on `m8-asks`).** Ryan asked for bomber range "WAY WAY higher, like able to travel circles around the world".
  - The map does not wrap east to west, so this reads as: a bomber reaches any spot on the map from any airfield, with fuel to cross it several times.
  - Both bombers reach 4,000 plots from their airfield, more than the Earth map's corner-to-corner distance of 3,877. The early bomber carries 6,000 s of fuel and the strategic bomber 8,000 s: at 3 and 4.5 plots a second (speed times the world's 1.5), that is about 5 and 10 Earth widths. Fighters, helicopters and transports keep their reach.
  - Crossing the Earth map one way takes the early bomber about 20 minutes and the strategic bomber about 13. They still turn home when fuel runs low, and still rearm at their airfield.
  - Evidence: `npm test` 278 of 278. A new test flies both bombers across a map 3,600 plots wide; they bomb the far end and land with over a third of their fuel left (the early bomber: back after 2,395 s with 3,605 s left).
- **Part D, the Modern navy (29 September 2026, branch `m8-navy`, stacked on `m8-bombers`).** Built as planned, with these specifics:
  - **Research.** Four military Modern nodes:
    - Modern navy (1,200): the cruiser and the battleship.
    - Submarines (1,100).
    - Aircraft carriers (1,400, after Modern navy and Jet engines).
    - Amphibious warfare (900): landing craft.
  - **Ships** (units 48 to 52). The first four are built at the naval dock and count toward the 100 warships; the landing craft is free.

    | Ship | Health | Attack | Defence | Range | Speed | Gold | Job |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | Cruiser | 260 | 34 | 26 | 3 | 3.4 | 4,400 | hunts submarines; fires at planes within 3 plots, 8 damage a second |
    | Battleship | 520 | 60 | 44 | 4 | 2.4 | 7,200 | shells companies within 4 plots, 5 troops a second; land there costs a third to take |
    | Submarine | 140 | 70 | 12 | 1 | 2.6 | 3,600 | torpedoes; dives |
    | Aircraft carrier | 600 | 8 | 30 | 1 | 2.4 | 9,000 | 12 planes, rearms 6 at once; fires at planes within 2 plots |
    | Landing craft | 60 | 0 | 3 | 1 | 4 | free | replaces the free transport boat |

  - **Submarines.**
    - Depth comes from the water under it (`diveOf` in `src/sim/units.js`): 0 in shallow water, 1 in open ocean, 2 in deep ocean.
    - Who can hit it (`canHit`): anything at depth 0; at depth 1 only ships marked `asw` (destroyers and cruisers), other submarines and attack helicopters; at depth 2 nothing.
    - Ship battles, flak, helicopter strikes and piloted fire all ask `canHit`. Bombs have never hit ships, so they do not hit submarines either.
    - A submarine that fires is held at depth 1 for 20 s (`navy.surfaceSeconds`), so a hunter can answer it.
    - It fights with its attack of 70 whether it attacks or is attacked. The torpedo is the attack: 70 against a destroyer's gun of 28.
    - It sinks trade ships rather than capturing them (`sink` in `src/sim/trade.js`). The `trade_sunk` event goes to both sides.
  - **Battleships** (`src/sim/navy.js`, `installNavy`, after the air module). Each tick a battleship fires at the nearest hostile company within 4 plots and records the plot it fires at (`u.shelling`). Siege 3 uses the existing siege code, so land within reach costs a third as much to take.
  - **Aircraft carriers.**
    - A plane's home is either an airfield or a carrier. `homeOf` in `src/sim/air.js` gives either one's position, reach and rearming slots, and `A.ship` marks a carrier home.
    - The `air` order's `base` sends a plane to one of your airfields or carriers. It flies there and makes it home. It is refused when the carrier is full ("that aircraft carrier is full: 12 planes") or too far for its fuel.
    - Planes on the deck sail with the carrier, and their reach is measured from wherever it is.
    - When a carrier sinks, the planes on deck are lost ("its carrier was lost"), and those in the air make for the nearest other home.
    - A new plane starts at the nearest airfield, or carrier with room.
  - **Anti-aircraft fire from ships.** Any machine with `antiAir` fires like a flak tower; the cruiser and the carrier have it.
  - **Landing craft.** Once Amphibious warfare is known, `boatType` in `src/sim/boats.js` makes every free crossing a landing craft: speed 4 instead of 2.5, and half the loss (`lossMult` 0.5). The Move preview's loss and time use it too.
  - **Rows.** A ship's machine row adds an eleventh field, `[dive, firing]`, only while it dives or fires; the tenth, the plane field, is empty for ships.
  - **Client.**
    - A submarine below the surface is drawn with its submerged frame, and faint when deep.
    - Torpedoes run from a firing submarine to its target. Battleships draw a tracer and a burst where the shells land.
    - The submarine's card says how deep it runs and what can hit it. A carrier's card counts the planes aboard. A plane's card has Base, and its ring over one of your carriers has "Base on this carrier".
    - The feed reports trade ships sunk, to both sides.
  - **Found by the bench: gifts in lakes.** The admin's gift put a ship in the water nearest the capital. On the Earth map that is often a lake, so the bench's ships and an admin's test ships could not reach the sea.
    - A given ship now comes out at one of the nation's docks or ports, the one on the biggest body of water. A dock that builds that ship wins a tie.
    - The nearest water is used only when the nation has neither.
    - The bench now gives its warships after placing its jetties, and counts the ships behind failed sail orders. Most bench players spawn inland and have only lake shores; 504 of the 824 ships never find a way to their random targets.
  - **Evidence:**
    - `npm test`: 287 of 287. `test/navy.test.js` has 8 tests:
      - the content;
      - the depth rules;
      - a deep submarine against an ironclad and a destroyer;
      - battleship shelling and siege;
      - a cruiser against a plane;
      - the carrier: basing, reach, sailing with planes aboard, full and sunk;
      - landing craft;
      - gifts at ports.
    - `test/trade.test.js` has a submarine sinking a trade ship. The reference tests: 95 of 95.
    - `npm run bench -- --navy 100` on mains power: each of the 8 players has 100 Modern warships (25 of each), plus the 100 planes, SAM sites and trucks of Part C.
      - The navy module's tick: 0.16 ms at the median, 1.1 ms at worst, with 40 submarines deep at the end.
      - Two full runs of the whole tick:

        | Run | Median | p99 | Worst | Path work in the worst tick |
        | --- | --- | --- | --- | --- |
        | 1 | 12.2 ms | 36.7 ms | 49.2 ms (pass) | 0.7 ms |
        | 2 | 12.5 ms | 37.9 ms | 54.5 ms (fail) | 0.7 ms |

        The worst ticks are economy ticks. Part C's run, before the navy, had a worst of 103.6 ms from path extension. Run 2's worst without the economy was 51.1 ms.
    - The Part D checks passed in the dev server run of 30 September 2026, on `m8-nukes`, which has Parts D and E. The numbers are under Part E. The checks are:
      - smoke: a submarine reports its depth, and a jet bases on a carrier and lands on it;
      - UI: right-clicking the carrier with a jet selected, the carrier card's plane count, and the submarine card's depth text (screens `77-carrier` and `78-submarine`);
      - soak: ship gifts and base orders.
- **Part E, nukes and missile defence (29 September 2026, branch `m8-nukes`, stacked on `m8-navy`).** Built as planned on the kit's `nukes.js`, with these specifics:
  - **Research.** Three military Modern nodes:
    - Nuclear weapons (1,800, after Rocketry and Guided missiles): the missile silo and the atomic warhead.
    - Thermonuclear weapons (2,000, after Nuclear weapons): the hydrogen warhead.
    - Missile defence (1,300, after Guided missiles): the ABM silo.

    The two nuclear nodes cost more than any other Modern node (800 to 1,400).
  - **The missile silo** (building 71, 1 plot, 8,000 gold). It holds one warhead, being built or ready; more warheads need more silos.

    | Warhead | Gold | Build time | Flattened within | Hit within | Flight |
    | --- | --- | --- | --- | --- | --- |
    | Atomic | 40,000 | 15 min | 3 plots | 8 plots | 60 s plus a thirtieth of a second a plot |
    | Hydrogen | 120,000 | 30 min | 5 plots | 14 plots | 75 s plus the same |

    - The gold is paid when the build starts. Take apart refunds all of it (`nukes.cancelRefund`), built or not.
    - A warhead is built only while its silo works, so a bombed silo pauses. A silo that is captured or destroyed loses its warhead (`warhead_lost`).
    - Silos and warheads in flight are kept on the nation (`n.nuke`), so they are saved with it and need no new save format.
  - **Launching** is the `nuke` order: `build`, `cancel`, `check` and `launch`.
    - It is refused when the host has turned nukes off, during the peace, and at your own land, unclaimed land or a nation you are not at war with.
    - `check` answers with the flight time, the chance of being shot down and the blast circles, without launching.
    - `nuke_launched` goes to everyone, with who launched, whose land, the circles and the impact time. The target's owner also gets a push notification.
  - **Interception** is rolled at impact (`defencesAt` and `resolve` in `src/sim/nukes.js`).
    - Every ABM silo (60% within 20 plots), SAM site and SAM truck (15% within their own reach) that covers the target, has a missile left and belongs to a nation at war with the launcher.
    - Strongest first, each counting half as much as the one before (`nukes.overlap`): one ABM silo is 60%, two are 72%, an ABM silo and a SAM site 63%.
    - Each defence that rolls spends a missile, until one hits.
    - ABM silos hold 2 interceptors and make one every 3 minutes for 1,500 gold.
    - Like SAM missiles, interceptors are not saved: after a reload they are full.
  - **The blast** (`detonate`), with lengths doubled on fine maps.
    - **Inner ring.**
      - The ground becomes crater within 1 plot of the centre and scorched ground around it. Rivers stay rivers.
      - Forest and roads are gone.
      - The land turns unclaimed, except any nation's capital plot.
      - Buildings become rubble, which clears like demolished rubble.
      - Companies are destroyed and machines wrecked.
    - **Outer ring.**
      - Buildings are damaged, lose 70% of their people, and repair themselves after 10 minutes.
      - Companies lose 60% of their troops, and machines 60% of their health.
    - Planes in the air or on the ground are hit the same way. A submarine deep in the ocean is spared.
    - `nuke_detonated` reports the troops and people lost, and the buildings destroyed and damaged.
  - **The host switch.**
    - It is `info.nukes`, on by default.
    - The admin op `nukes` (the World power) turns it on or off.
    - World info shows it, with a button for anyone who has the World power.
    - Off stops building and launching; warheads stay in their silos.
  - **The build cheat** finishes warheads at once.
  - **The planner** proposes ABM silos over the capital and the biggest town where no ABM silo covers them yet: at most 2 (`planner.abms`), within 6 plots (`abmNear`).
  - **Client.**
    - **The silo's card** (`public/js/ui/nukes.js`):
      - build a warhead (locked until the research is known);
      - time left, and Take apart;
      - Aim and launch. A click on enemy land asks the server for the check and draws the circles. Launch, then "Sure? Launch now".
    - **The alert** under the status pill has a row for every warhead in the air: who launched at whom, a countdown and Show. It pulses red when the warhead is aimed at you.
    - **The map:**
      - pulsing target circles;
      - the missile flying an arc from its silo, with a trail and launch smoke;
      - a flash and the `nuke_0` to `nuke_4` blast;
      - a burst for an interception.

      The crater and scorched ground arrive as ordinary terrain edits.
    - **Also:**
      - The ABM silo's card counts its interceptors, and an empty silo is drawn empty.
      - The research panel lists warheads under "Silos build".
      - The feed reports launches, interceptions, blasts, ready and lost warheads, and the host switch.
  - **Evidence:**
    - `npm test`: 295 of 295. `test/nukes.test.js` has 6 tests:
      - the content;
      - building, cancelling and losing a warhead;
      - the launch rules and the public event;
      - the blast;
      - interception, and the reload;
      - a save and a catch-up with a warhead in flight.

      There is also a planner test for ABM silos and a browser test for warheads, blasts and the silo purse. The reference tests: 95 of 95.
    - The drawing, run in Node against a recording canvas: the aim, flight and blast circles (6 arcs), the missile, the second blast frame and the interception burst.
    - `npm run bench` on mains power, now launching 2 warheads per player at bots halfway through (`--nukes`):
      - all 16 landed;
      - the nuke module's tick: 0.01 ms at the median, 2.1 ms at worst, blasts included;
      - the whole tick: 8.5 ms median, p99 30.2 ms, worst 42.6 ms. That passes the 50 ms budget.
    - **Dev server run (30 September 2026, on `m8-nukes`).** Ryan said go ahead.
      - **`npm run smoke`** on the test map: 119 of 119.
        - The first run failed the nuke check because of the test. The air check before it sets the speed back to 1, so the 61 s flight had not landed within the 40 s wait. The world still showed the warhead in flight, due 21 game seconds later.
        - The check now launches at 8 times speed. The rerun's warhead cleared 19 plots of the friend's land and left the capital.
      - **`npm run ui`**: 188 of 188, after two fixes.
        - The card only relabelled Launch as "Sure? Launch now" on its next refresh, so a quick second press launched before the player saw the question. It now redraws at once.
        - A bot retook the cleared land within seconds at 8 times speed, so the check now reads the blast's own count of cleared land.
        - Screens `79-nuke-aim` to `82-nuke-crater` show the circles, the alert, the blast and the crater.
        - The Part D checks: a jet right-clicks its carrier and lands on it, and the card reads "1 of 12 planes aboard". A submarine's card reads "surfaced in shallow water: anything can hit it".
      - **`npm run soak`**, 180 s: 1,155 rounds, 24 game minutes, no tick errors, no problems.
        - The host built 17 warheads, took 3 apart and launched 11 at the friend, who had an ABM silo.
        - Across both players' feeds there were 20 launch, 6 interception and 14 blast events: each saw 10 launches, 3 shot down and 7 blasts.
      - The run also found that Take apart answered "holds no warhead" for a building that is not a silo. It now checks the silo first.
    - The checks are:
      - **smoke:** a silo builds an atomic warhead, launches at the friend's land, everyone hears it, and the blast leaves a crater and clears the land but the capital;
      - **UI:** Aim and launch, the circles and chance, the second press, the alert and the blast (screens `79-nuke-aim` to `82-nuke-crater`);
      - **soak:** silos, ABM silos, builds, checks, launches and cancels.
- **Part F, tourism and downtowns (30 September 2026, branch `m8-tourism`, stacked on `m8-nukes`).** Built as planned on the kit's `tourism.js` and `cbd.js`, with these specifics:
  - **Tourism buildings** (numbers 73 to 82, the Tourism tab). They are paid in gold and need no workers.

    | Building | Era | Size | Gold | Visitors pay a second | Where |
    | --- | --- | --- | --- | --- | --- |
    | Park | Medieval | 1 by 1 | 120 | 0.25 | |
    | Plaza | Medieval | 1 by 1 | 160 | 0.3 | |
    | Museum | Gunpowder | 2 by 1 | 700 | 1.4 | |
    | Zoo | Industrial | 2 by 2 | 1,400 | 2.4 | |
    | Arena | Industrial | 2 by 2 | 1,800 | 3 | |
    | Stadium | Modern | 3 by 3 | 4,200 | 6.5 | |
    | Casino | Modern | 2 by 2 | 3,000 | 4.5 | |
    | Luxury hotel | Modern | 2 by 2 | 2,400 | 3.5 | |
    | Beach resort | Modern | 2 by 2 | 3,000 | 4.5, times 1.6 in summer and 0.3 in winter | on the coast |
    | Ski resort | Modern | 2 by 2 | 3,000 | 4.5, times 1.8 in winter and 0.2 in summer | within 3 plots of hills or mountains |

    - The Modern ones are behind Mass tourism (1,000 points).
    - At full variety each pays for itself in 8 to 11 minutes. Producers take 3 to 6 but need workers and deposits.
  - **Income** (`src/sim/tourism.js`, `installTourism`, every 5 s, for players):
    - What each attraction pays, with a resort times its season at its own latitude (`world.res.seasonOf`), ...
    - ... times variety: half is fixed, and half is the square root of kinds over attractions. Two parks earn 85% each and ten parks 66%.
    - ... times reach: 25% more with an air base (the airport terminal, `airport` on the air base), 10% more with a port, 10% more with a station.
    - ... times 10% more for each wonder.
    - Away players get their usual 90%, and catch-up pays for the whole step.
  - **Wonders** (numbers 85 to 93, the Wonders tab):

    | Wonder | Era | Gold | Build time | Visitors pay a second |
    | --- | --- | --- | --- | --- |
    | Stone circle | Tribal | 1,200 | 15 min | 1.5 |
    | Great pyramid | Tribal | 2,500 | 20 min | 2.5 |
    | Colossus | Medieval | 4,000 | 20 min | 3.5 |
    | Hanging gardens | Medieval | 5,000 | 25 min | 4 |
    | Clock tower | Gunpowder | 8,000 | 25 min | 6 |
    | Triumphal arch | Gunpowder | 7,000 | 25 min | 6.5 |
    | Grand tower | Industrial | 14,000 | 30 min | 9 |
    | Great exhibition | Industrial | 16,000 | 30 min | 10 |
    | Observatory | Modern (Mass tourism) | 30,000 | 40 min | 14 |

    - One per world. Placing one is refused when it already stands anywhere, or when you are already building it (`wonderErrorOf` in `src/shared/buildings.js`, used by the server, the build menu and the planner).
    - Several nations can race. The first to finish owns it, and every other site is removed with its gold refunded (`wonder_lost`). A finished site is caught on the tick it finishes.
    - `wonder_built` goes to everyone. A captured wonder changes hands with its plot, like any building.
    - The kit's two Future wonders wait for the Future era.
  - **Downtowns.**
    - Skyscrapers (1,200 points, after High-rise living and Consumer society) adds two buildings:
      - the office block (83): 1 plot and 40 jobs, drawn from the kit's three small offices;
      - the skyscraper (84): 2 by 2 and 160 jobs, drawn from three skyscrapers.
    - A café grows into an office block, and an office block into a skyscraper, at the town's usual upgrade chance, when two things hold (`downtownError` in `src/sim/civilians.js`, `rules.json` `downtown`):
      - the new footprint has roads on at least 2 of its 4 sides;
      - 6 shops of the same owner stand within 4 plots.
    - **Added:** a growing downtown building takes in the shops of the same owner that lie wholly inside its new footprint (`absorbable`). Before, a busy downtown, full of one-plot shops by definition, never had room for a 2 by 2 skyscraper.
  - **City cores** (`src/sim/cbd.js`, the kit's piece 19).
    - Office blocks (value 0.6) and skyscrapers (1) are core centres.
    - Within 14 plots times that value, land is up to 50% harder to take, falling to nothing at the edge. An attacker near its own core gets 60% of its bonus.
    - Only Modern downtowns make cores, so earlier eras fight as before.
    - The kit kept a full-map distance field per nation, which is 5 million entries each on the Earth map. The field now holds only the plots near a core, and is rebuilt every 5 s when the downtown changes. Capture cost skips it when neither side has a core.
  - **The planner** proposes up to 2 kinds of attraction you do not have yet, best first, near a town. It also proposes the best wonder nobody has, near the capital.
  - **Client.**
    - The `tourism` art sheet is loaded now.
    - The Tourism and Wonders tabs: each wonder's row says who has it or is building it.
    - Building cards say what visitors pay.
    - The Town panel has a Tourism line, and under it the attractions, kinds, variety, links, wonders and each resort's season.
    - The land tip shows "city core, N% harder to take" (`ClientWorld.coreAt`, the same formula as the server's).
    - Office blocks and skyscrapers pick one of their sprites by building number.
    - The feed reports wonders built and lost. The café's description says when it grows.
  - **Evidence:**
    - `npm test`: 304 of 304. `test/tourism.test.js` has 8 tests:
      - the content and its locks;
      - income with variety, links and wonders;
      - resorts' seasons and placement;
      - the wonder race;
      - downtown growth, including taking in a shop;
      - city cores in capture cost;
      - catch-up;
      - the browser's core and wonder standing against the server's.

      There is also a planner test. The reference tests: 95 of 95.
    - **`npm run bench`** on mains power. Every player now gets 20 attractions, 10 skyscrapers and a great pyramid near the capital, and all 8 race for the one pyramid (`--tourism 0` leaves them out).
      - At the midpoint: 161 attractions paid 302 gold a second in all, one pyramid was left, and 80 cores covered 18,951 plots, built in 5.1 ms.
      - The tourism pass every 5 s: 1.5 ms on average, 4.6 ms at worst. The core refresh: at most 2 ms. Capture cost is called 231 times a tick, and the core check adds at most 70 ns each.
      - Four full runs, alternating:

        | Tourism | Median | p99 | Worst |
        | --- | --- | --- | --- |
        | Off | 8.5 ms | 30.1 ms | 44.9 ms |
        | On | 9.9 ms | 32.2 ms | 43.4 ms |
        | Off | 8.7 ms | 31.2 ms | 41.4 ms |
        | On | 10.3 ms | 34.2 ms | 45.3 ms |

        All four pass the 50 ms budget. The median is about 1.5 ms higher with tourism, but the modules account for under 0.2 ms a tick. The runs are deterministic, and with tourism the game plays out differently: the 12-hour catch-up earns 18.4 million gold instead of 8.3 million. Path extension also takes 7% longer in total with slightly fewer stacks, which is not explained yet.
      - An earlier full run with tourism measured a worst tick of 55.8 ms, a tick with no economy pass and 1.6 ms of path work.
    - Smoke, `npm run ui` and the soak have Part F checks written; they need the dev server:
      - **smoke:** a park and the stone circle are built, everyone hears of the wonder, the purse shows tourism, and a second circle is refused;
      - **UI:** the Tourism and Wonders tabs, and the Town panel's tourism lines (screens `83-tourism-tab` and `84-town-tourism`);
      - **soak:** attractions and wonder races for both players.
