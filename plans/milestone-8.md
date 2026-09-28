# Milestone 8: the Modern era

Drafted 29 September 2026, after milestone seven's dev server run. Nothing here is built yet. The choices at the end are Ryan's, and the parts change with his answers.

The design already settled most of the Modern era (`reference/docs/design-decisions.md`, piece 16, rounds 2 to 4 of the questions):

- Nukes and superweapons in Modern and Future, with interception, which the host can turn off.
- Tourism income from parks, museums, stadiums, resorts and wonders, changing with the season.
- Naval invasions and paratroopers.
- Air defence: launchers work on their own with no radar buildings, and planes entering cover are engaged automatically. Nukes and missiles can be intercepted. Everyone sees a launch alert with the blast circle, and the target sees where it will land.

Milestone seven changed three things that this plan follows:

- Gold is the only currency, so there is no uranium, fuel or missile stock to carry.
- Soldiers are companies of 10 troops a soldier, at most 1,000 a player.
- There are at most 100 planes, 100 warships and 100 tanks and guns a player.

## What already exists

- **Kit modules, not installed yet:**
  - `src/sim/nukes.js`: warheads, launch, interception and the blast (craters, scorched land, cleared ownership, rubble).
  - `src/sim/tourism.js`: tourism value by building and season, raised by an airport, a port and rail.
  - `src/sim/cbd.js`: city cores, where defence and attack grow near a nation's densest buildings.
- **Modern buildings in `data/buildings.json` that nobody can reach yet:** the concrete tower, apartment block, cafe, modern factory, open-pit mine, pumpjack, offshore rig and gas plant. There is no Modern research node, so the era never comes.
- **Art in the kit:**
  - Planes: jet fighter, strategic bomber, attack and transport helicopters, transport plane, drones.
  - Vehicles: main battle tank, APC, rocket artillery, SAM truck.
  - Ships: cruiser, battleship, submarine (with a submerged frame), aircraft carrier, landing craft, container ship.
  - Soldiers: soldier, special forces, anti-tank team, paratrooper, sniper, engineer.
  - Buildings: SAM sites, missile and ABM silos, the airport set (terminal, hangar, control tower, runway), nuclear plant, refinery, container terminal, skyscrapers, mall, stadium, hospital.
  - Tourism: parks, museums, zoo, stadium, resorts, casino, hotels and eleven wonders.
  - Effects: the nuke blast, craters and scorch, missile trails.
- **The map has uranium deposits.**

## Proposed parts

Each part is its own branch and pull request, and Ryan checks it before the next, as in milestone seven.

### Part A: the Modern Age and its army

- **Research.**
  - The Modern Age node comes after Railways, Armour, Flight and Universities. It needs 12 Industrial upgrades across 4 branches, like the eras before it.
  - About fifteen Modern nodes follow it. They unlock everything in parts B to E, and the Modern buildings listed above.
- **Soldiers.**
  - New types: soldier, special forces and anti-tank team.
  - They are stronger per soldier than stormtroopers, so 1,000 Modern soldiers hit harder than 1,000 Industrial ones.
  - They are trained at the barracks line, as now.
- **Land machines.**
  - The main battle tank.
  - The APC, which carries one company at vehicle speed and sets it down where it stops.
  - Rocket artillery, which cuts capture cost from 6 plots away, like siege.
  - All three count toward the 100 tanks and guns.
- Every new unit can be piloted with the Part D controls.

### Part B: Modern air power and air defence

- **Planes.**
  - The jet fighter: fast, with a long reach.
  - The strategic bomber: a big load and a long reach.
  - The attack helicopter: slow and low. It hovers over the front and shoots companies and machines instead of bombing.
  - The transport helicopter: it lifts one company and lands it on any land within reach of its base. On enemy land it lands fighting, like a boat landing.
  - All of them count toward the 100 planes.
- **Air bases.** The airfield upgrades to an air base, drawn with the terminal, hangar and runway art: a longer reach and more planes rearming at once.
- **Air defence.**
  - The SAM site replaces flak in the Modern era. It fires at planes within 8 plots and holds 4 missiles, which reload by themselves for gold.
  - The SAM truck is a mobile SAM that can follow a company.
  - Overlapping sites combine their fire, but with less added by each extra site, so several cheap sites do not beat one strong one (round 2, questions 4 and 7).

### Part C: the Modern navy

- **Cruiser.** It fires at planes within 3 plots as well as at ships.
- **Battleship.** It shells the coast within 4 plots, which cuts capture cost and hits companies.
- **Submarine.** It dives. While submerged, only destroyers, cruisers, other submarines and helicopters can hit it. It sinks trade ships rather than capturing them.
- **Aircraft carrier.** A floating airfield for up to 12 planes, whose reach moves with it.
- **Landing craft.** After Amphibious warfare, the free transport boats become landing craft: half the loss, and faster.
- All of them count toward the 100 warships except landing craft, which are free like the boats they replace.

### Part D: nukes and missile defence

This part builds on the kit's `nukes.js`.

- **The missile silo.**
  - It builds one warhead at a time: atomic after Nuclear weapons, hydrogen after Thermonuclear weapons.
  - A warhead is paid in gold, and the nation must own a working uranium mine (see choice 2).
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
- **The host switch.** A world setting, `nukes`, is shown in World info. It is off by default, and the host turns it on (see choice 2).

### Part E: tourism and downtowns

This part builds on the kit's `tourism.js`.

- **Tourism buildings.**
  - Parks and plazas are Medieval, museums Gunpowder, zoos Industrial. Stadiums, resorts, casinos and hotels are Modern.
  - Each earns tourism gold, and resorts swing with the season at their latitude.
  - An airport terminal raises tourism by 25%, a port by 10% and rail by 10%.
  - Variety pays better than copies.
- **Wonders.** One of each per world, and whoever finishes it first owns it. Each adds 10% to tourism, and their art is in the kit.
- **Downtowns.** In the Modern era, shops in busy commercial zones with roads on two sides upgrade by themselves into office blocks and skyscrapers. That gives each nation a recognisable centre.
- **City cores** (the kit's `cbd.js`, piece 19). Defence grows near the densest part of a nation. This is optional; see choice 1.

## Not in this milestone

- The Future era: hover tanks, mechs, shields, drones and orbital strikes.
- Engineers and terrain destruction, conventional cruise missiles, and the market board.
- Bots stay as they are: they do not research, so they never reach Modern units.

## Evidence for each part

- Unit tests for every new rule.
- `npm test`, the reference tests, smoke and `npm run ui` on the test map.
- `npm run soak` with the new orders.
- The Earth and fine Europe benches with Modern units at the limits.

## Choices for Ryan

1. **Which parts, and in what order.** The draft order is A, B, C, D, E.
2. **How scarce nukes are.** The draft: a warhead costs gold, the nation must own a working uranium mine, and the host switch is off by default.
3. **Troops by air.** The draft: transport helicopters carry a company and land it within reach. Paratroopers, dropped from transport planes far behind the lines, could come too.
4. **What makes a submarine different** when there is no fog of war. The draft: while submerged, only some units can hit it.
