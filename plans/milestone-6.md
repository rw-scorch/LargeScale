# Milestone 6: the Industrial era

Ryan's answers of 27 September 2026 are under Decisions at the end: logistics comes first, as milestone five, and this milestone builds on it. The numbers here are a draft, to be checked again once logistics is done. This is the second slice of the kit's piece 16 (`reference/tasks/16-later-eras/GUIDE.md`), after Gunpowder. The kit's theme for this era is rail and coal: "logistics decide the war, not the biggest number" (`reference/docs/pacing-and-longevity.md`).

## Why now

Research stops again where the Industrial era starts: the last Gunpowder node leads nowhere, and there is no Age of Industry. The eight Industrial buildings already in `data/buildings.json` (tenement, shop, early factory, deep mine, oil derrick, warehouse, commercial port, parliament) all cost steel, and nothing makes steel. So a nation reaching the end of Gunpowder has nothing left to do but fight with Gunpowder armies.

## What is there already

- **Buildings.** The eight above, unlocked by the era alone.
- **Materials.** Pit mines and deep mines dig iron and coal, and oil derricks pump oil. Nothing turns them into steel, and nothing uses the oil.
- **Art.** The kit has sprites for everything below:
  - rail track in every direction, steam locomotives and carriages, a large station and an engine shed;
  - steel mill, coal plant, textile mill, vehicle factory, munitions factory, university, clinic, tax office, bunker;
  - riflemen, machine gunners, mortar teams and stormtroopers;
  - field artillery, early and heavy tanks, armoured cars;
  - steamship, ironclad, destroyer, cruiser, battleship, landing craft;
  - biplanes, early fighters and bombers, which wait for the Modern slice.
- **Code to build on.** The kit's `src/sim/logistics.js` has a road and rail layer, travel costs and a rail sprite picker. It has never been installed. The building effects system from milestone four (`n.bfx`, `world.effectOf`) takes new effect keys without new code.

## Steps

### I1. Research

Age of Industry, then about fourteen Industrial nodes across the four branches. They cost about twice as much as Gunpowder nodes (440 to 960 points, against 220 to 480).

| Branch | Node | Needs | Unlocks |
| --- | --- | --- | --- |
| era | Age of Industry | Star forts, Navigation, Schools, Courts; 10 Gunpowder nodes in all 4 branches | the Industrial era |
| economy | Steelmaking | Age of Industry | steel mill |
| economy | Steam power | Steelmaking | coal plant |
| economy | Railways | Steam power | rail and the large station |
| economy | Oil | Steam power | oil derrick |
| economy | Mass production | Steelmaking | early factory, textile mill |
| military | Rifling | Age of Industry | rifleman |
| military | Machine guns | Rifling | machine gunner; defence +5% |
| military | Trench warfare | Machine guns | mortar team, bunker |
| military | Field guns | Rifling, Steelmaking | field artillery, vehicle factory |
| military | Armour | Field guns, Oil | early tank |
| military | Steam navy | Steam power, Navigation | naval dock, steamship, ironclad |
| military | Destroyers | Steam navy | destroyer |
| civic | Universities | Age of Industry | university; research +10% |
| civic | Medicine | Universities | clinic |
| government | Bureaucracy | Age of Industry | tax office, parliament |

The existing test checks the tree against the sprite list and the building registry.

### I2. Steel and coal

- **Steel mill.** A new producer kind, `convert`: it takes 0.2 iron and 0.3 coal a second from the stores within its reach and makes 0.2 steel, scaled by its staff and its power (I5) like other producers. It stops, with a reason on its card, when either input runs out; the logistics network brings more.
- **Coal plant.** Burns coal to make power for the grid (I5).
- **Oil.** Tanks and ironclads cost oil to build, so derricks finally matter.
- **Why this shape.** The kit warns against factories making goods that make money that builds more factories. Steel needs two mined inputs, and deposits run out, so industry stays tied to land. That gives nations a reason to fight over iron and coal.

### I3. Troops

Trained at the barracks, like every troop so far.

| Troop | Attack | Defence | Speed | Takes land | Cost each | Role |
| --- | --- | --- | --- | --- | --- | --- |
| Rifleman | 4.5 | 4 | 1 | 1.3 | 4 gold, 0.2 steel, 0.4 food | the all-round Industrial soldier |
| Machine gunner | 3 | 7 | 0.8 | 0.8 | 5 gold, 0.4 steel, 0.4 food | holds a line, poor at taking land |
| Mortar team | 5 | 3 | 0.9 | 1.4 | 5 gold, 0.4 steel, 0.5 food | breaks defenders |
| Stormtrooper | 6 | 3 | 1.2 | 1.8 | 7 gold, 0.4 steel, 0.6 food | elite attackers, costly |

The musketeer is 3.5 attack and 3 defence, so these are about a third stronger per soldier. The machine gunner makes defending much stronger than attacking, as in the real era, and that is what artillery and tanks are for.

### I4. Machines

| Machine | Built at | Hit points | Attack | Defence | Range | Speed | Siege | Carries | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Field artillery | vehicle factory | 70 | 32 | 4 | 5 | 1 | 3.5 | | 300 gold, 40 steel |
| Early tank | vehicle factory | 150 | 30 | 20 | 1 | 1.4 | 1.5 | | 600 gold, 80 steel, 30 oil |
| Steamship | naval dock | 150 | 6 | 12 | 1 | 3.2 | | 600 troops | 400 gold, 60 steel |
| Ironclad | naval dock | 300 | 36 | 28 | 2 | 2.2 | | 100 troops | 900 gold, 150 steel, 20 oil |
| Destroyer | naval dock | 180 | 28 | 14 | 3 | 3.6 | | 60 troops | 700 gold, 90 steel, 30 oil |

The early tank is the first machine that helps take land itself (siege 1.5 where it stands), not only in battle. Cruisers, battleships, submarines, heavy tanks and aircraft are left for the Modern slice, as Ryan decided.

### I5. Rail and power

**Rail**, on milestone five's road layer:

- Rail is the road type the kit already names (travel cost 0.12), laid with the Roads tool once Railways is researched: 4 gold and 1 steel a plot.
- Stacks and land machines move fastest on it. Convoys between two large stations with rail between them run as trains, carrying 5 times an Industrial convoy.
- Captured rail serves the new owner, as roads do.

**Power grid**, Ryan's choice over a flat bonus. The draft, to agree in detail before building it:

- Coal plants make power while they have coal: 20 units each, burning 0.2 coal a second.
- Power reaches buildings within 6 plots of a plant, and power poles carry it on: a pole within reach of the grid extends it 4 more plots. Poles are dragged like roads, one every few plots, with the kit's pole and line sprites.
- Industrial buildings (steel mill, factories, textile mill, vehicle factory, naval dock, university) ask for power. On the grid they work at full rate; off it, at half. If a grid asks for more than its plants make, every building on it gets the same share.
- A grid belongs to one nation. Capturing a plant or cutting a line of poles splits the grid, and the building cards say what is short.
- Rule 8 still holds: nothing is wired by hand building by building, and one overlay shows powered land.

### I6. Buildings and what they do

| Building | Effect |
| --- | --- |
| Steel mill | iron and coal into steel (I2) |
| Coal plant | power for the grid while it has coal |
| Power pole | carries the grid 4 more plots |
| Textile mill | makes goods, like the early factory, with fewer jobs |
| University | research +12% each, up to 3 |
| Clinic | population growth +10% each, up to 5 |
| Tax office | income +5% each, up to 5 |
| Vehicle factory | builds field artillery and tanks |
| Naval dock | builds steamships, ironclads and destroyers; counts as a port |
| Bunker | a fort: land within 3 plots defends at 1.4 times |
| Large station | turns convoys on rail into trains, and is a store |

### I7. Showing it

- The research tree gets its Industrial band.
- The Army panel lists the new troops, and the building panels the new machines.
- Riflemen and the others are drawn with their figures at close zoom, and tanks and ships with their sprites.
- Rail on the map and in the Roads tool, trains drawn with the locomotive and carriage sprites, and a power overlay.
- The Town panel's next step and the guide point at the steel mill once a nation reaches the era.

### I8. Checks

- **Unit tests:**
  - the tree validates;
  - the steel mill converts and stops when inputs run out;
  - a grid's reach through poles, its share when short, and a split when a pole is captured;
  - each troop's power;
  - a convoy becomes a train between stations.
- **Smoke:** a nation researches into Industry, makes steel with power, lays rail and sends a train.
- **Browser test:** the same through the interface, on a computer and a phone.
- **Bench:** Earth and fine Europe, with 8 players laying rail and fielding tanks. The worst tick must stay under 50 ms.

### I9. Ryan's check

## Budgets

- Rail lives in milestone five's road layer. Power poles are buildings; the grid is worked out from them, not saved.
- New unit numbers start at 22 and building numbers at 56; nothing already saved changes number.

## Decisions (answered by Ryan, 27 September 2026)

1. **Full logistics first**, as its own milestone before this one (`plans/milestone-5.md`). Rail and trains come here, on its network.
2. **Aircraft wait for the Modern slice.**
3. **Stop at the end of the Industrial era.** Age of the Modern era comes with the Modern slice.
4. **A real power grid** for coal plants, not a flat bonus (I5).

## The questions as asked

1. Rail: rail for armies now (recommended), the kit's full logistics as its own milestone first, or no rail yet.
2. Aircraft: leave for Modern (recommended), or biplanes now.
3. Where to stop: the end of Industrial (recommended), or include the Age of the Modern era.
4. Coal plants: a flat industry bonus (recommended), or a real power grid.
