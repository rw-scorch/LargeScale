# Milestone 5: the Industrial era

A proposal, 27 September 2026, waiting for Ryan's answers to the questions at the end. This is the second slice of the kit's piece 16 (`reference/tasks/16-later-eras/GUIDE.md`), after Gunpowder. The kit's theme for this era is rail and coal: "logistics decide the war, not the biggest number" (`reference/docs/pacing-and-longevity.md`).

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
  - biplanes, early fighters and bombers (see question 2).
- **Code to build on.** The kit's `src/sim/logistics.js` has a road and rail layer, travel costs and a rail sprite picker. It has never been installed. The building effects system from milestone four (`n.bfx`, `world.effectOf`) takes new effect keys without new code.

## Steps

### I1. Research

Age of Industry, then about fourteen Industrial nodes across the four branches. They cost about twice as much as Gunpowder nodes (440 to 960 points, against 220 to 480).

| Branch | Node | Needs | Unlocks |
| --- | --- | --- | --- |
| era | Age of Industry | Star forts, Navigation, Schools, Courts; 10 Gunpowder nodes in all 4 branches | the Industrial era |
| economy | Steelmaking | Age of Industry | steel mill |
| economy | Steam power | Steelmaking | coal plant |
| economy | Railways | Steam power | rail and the large station (see question 1) |
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

- **Steel mill.** A new producer kind, `convert`: it takes 0.2 iron and 0.3 coal a second from the nation's stock and makes 0.2 steel, scaled by its staff like other producers. It stops, with a reason on its card, when either input runs out.
- **Coal plant.** Burns 0.2 coal a second. While it has coal: steel mills and factories make 10% more each, up to 5 plants. That is the effects system with a new `industry` key.
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

The early tank is the first machine that helps take land itself (siege 1.5 where it stands), not only in battle. Cruisers, battleships, submarines, heavy tanks and aircraft are left for the Modern slice (question 2).

### I5. Rail (question 1 decides this step)

The recommended version, rail for armies:

- **Building it.** A Rail tab in the build menu. You drag a line across your own land, the same way Draw path works, and see the cost before confirming: 4 gold and 1 steel a plot. Rail is built at once.
- **Using it.** Stacks and land machines move 4 times faster on rail. The stacks' path cost gains the kit's rail multiplier (0.12, from `logistics.js`), so routes prefer rail by themselves. The catch: the search's distance estimate has to assume every plot might be rail, which makes long searches slower. The bench must show long moves on Earth stay within budget; if not, rail gets its own coarse graph, like the land regions.
- **Capture.** Rail stays when land changes hands, so a captured line serves the new owner. That is the kit's "logistics decide the war", with nothing to micro-manage.
- **Protocol and saving.** Rail is one byte a plot, saved and sent like zones: a join frame and small diffs. It is drawn with the kit's rail sprites at close zoom, and as thin lines further out.
- **Not in this version.** Goods convoys, trains you manage, and army supply lines. Those are the kit's full piece 7, and they risk the hyper-management CLAUDE.md rule 8 warns about. They can be their own milestone later if play shows they are wanted.

### I6. Buildings and what they do

| Building | Effect |
| --- | --- |
| Steel mill | iron and coal into steel (I2) |
| Coal plant | industry +10% each, up to 5, while it has coal |
| Textile mill | makes goods, like the early factory, with fewer jobs |
| University | research +12% each, up to 3 |
| Clinic | population growth +10% each, up to 5 |
| Tax office | income +5% each, up to 5 |
| Vehicle factory | builds field artillery and tanks |
| Naval dock | builds steamships, ironclads and destroyers; counts as a port |
| Bunker | a fort: land within 3 plots defends at 1.4 times |
| Large station | rail loading: stacks within 2 plots board rail at no cost (only if question 1 is rail) |

### I7. Showing it

- The research tree gets its Industrial band.
- The Army panel lists the new troops, and the building panels the new machines.
- Riflemen and the others are drawn with their figures at close zoom, and tanks and ships with their sprites.
- Rail on the map, the Rail tab, and a cost preview while drawing.
- The Town panel's next step and the guide point at the steel mill once a nation reaches the era.

### I8. Checks

- **Unit tests:**
  - the tree validates;
  - the steel mill converts and stops when inputs run out;
  - coal plant effects add up and stop at their cap;
  - each troop's power;
  - a stack's speed on rail, and rail kept through a capture.
- **Smoke:** a nation researches into Industry, makes steel, lays rail and moves a stack along it.
- **Browser test:** the same through the interface, on a computer and a phone.
- **Bench:** Earth and fine Europe, with 8 players laying rail and fielding tanks. The worst tick must stay under 50 ms.

### I9. Ryan's check

## Budgets

- One new saved layer (rail, one byte a plot, written only when changed), one new join frame and one diff frame. Every other change is data or additive; the protocol changes only if rail needs it.
- New unit numbers start at 22 and building numbers at 56; nothing already saved changes number.

## Questions for Ryan

1. **Rail.** Recommended: rail for armies now (I5): you draw it on your land, stacks move 4 times faster on it, and it can be captured. The alternatives are the kit's full logistics (goods carried by convoys and trains, and armies weakened far from supply), as its own milestone before Industrial; or no rail yet.
2. **Aircraft.** Recommended: leave them for the Modern slice, where the kit puts air power. Planes need a new way to move (over water and enemy land, from an airfield), which is a system of its own. The alternative is biplanes now, as scouts and light bombers.
3. **Where to stop.** Recommended: at the end of the Industrial era, as with Gunpowder. Age of the Modern era comes with the Modern slice.
4. **Coal plants.** Recommended: a flat industry bonus while they burn coal (I2). The alternative is a real power grid, with poles, lines and powered areas. The kit has the art for it, but it is another system to manage.
