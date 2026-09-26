# Milestone 4: the Gunpowder era

Agreed with Ryan on 26 September 2026 (decisions at the end). This is the first slice of the kit's piece 16 (`reference/tasks/16-later-eras/GUIDE.md`). Industrial, Modern and Future come later, one era at a time.

## Why now

Research stops where the Gunpowder era starts. The tree has 13 Tribal and 15 Medieval nodes, and the last one, Age of Gunpowder, moves a nation into the new era with nothing left to research. Ryan hit this in play.

## What is there already

- **Buildings.** Four Gunpowder buildings are in `data/buildings.json`, unlocked by the era alone: the town hall, brick house, general store and foundry. Industrial ones exist too, but nothing makes steel yet, so they wait for the Industrial slice.
- **Art.** The kit has every sprite this era needs:
  - troops: musketeer, grenadier, line infantry and light cavalry, plus a Gunpowder walker;
  - machines: the cannon, and the galleon, frigate and ship of the line;
  - buildings: early bank, theatre, school, library, courthouse, star fort, cannon foundry, musket range, and small and large shipyards.
- **Materials.** Clay pits and pit mines (iron, coal and more) already work, so no new resource is needed.
- **Training.** The barracks already trains every troop type research has unlocked, so new troops need no new training building.
- **Missing.** Gunpowder research, troops, ships and buildings. And no building changes combat yet: walls and towers say "no effect on combat yet".

## Steps

### G1. Research

Fourteen Gunpowder nodes across the four branches, in the same shape as the Medieval ones. They cost about twice as much (Medieval nodes are 110 to 260 points; these are 220 to 480).

| Branch | Node | Needs | Unlocks |
| --- | --- | --- | --- |
| military | Gunpowder | Age of Gunpowder | cannon foundry |
| military | Matchlocks | Gunpowder | musketeer |
| military | Bayonets | Matchlocks | line infantry; defence +5% |
| military | Grenades | Gunpowder | grenadier |
| military | Light cavalry | Matchlocks, Stirrups | light cavalry |
| military | Artillery | Gunpowder, Siegecraft | cannon |
| military | Star forts | Gunpowder, Castles | star fort |
| economy | Banking | Age of Gunpowder | bank |
| economy | Shipbuilding | Harbours | shipyard, galleon, frigate |
| economy | Navigation | Shipbuilding | ship of the line |
| civic | Printing | Age of Gunpowder | library; research +10% |
| civic | Schools | Printing | school |
| civic | Theatre | Printing | theatre |
| government | Courts | Age of Gunpowder | courthouse; troop cap +5% |

The tree is checked against the sprite list and the building registry by the existing test, as the Medieval tree is.

### G2. Troops

Trained at the barracks, like the Medieval ones.

| Troop | Attack | Defence | Speed | Takes land | Cost each | Role |
| --- | --- | --- | --- | --- | --- | --- |
| Musketeer | 3.5 | 3 | 1 | 1.2 | 3 gold, 0.3 iron, 0.4 food | the all-round Gunpowder soldier |
| Line infantry | 3 | 4.5 | 1 | 1 | 3.5 gold, 0.3 iron, 0.4 food | holds ground best |
| Grenadier | 5 | 2.5 | 1 | 1.6 | 5 gold, 0.5 iron, 0.5 food | breaks defenders, expensive |
| Light cavalry | 3.5 | 2 | 2 | 1.8 | 4 gold, 0.3 iron, 0.6 food | the fastest to take land |

The knight is 3 attack, 2.2 defence and 1.5 speed, so the new troops are about a quarter stronger per soldier. Levies stay the bulk of every army.

### G3. Machines

| Machine | Built at | Hit points | Attack | Defence | Range | Speed | Siege | Carries | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cannon | cannon foundry | 60 | 24 | 3 | 4 | 0.8 | 3 | | 250 gold, 40 iron, 20 wood |
| Galleon | shipyard | 120 | 10 | 10 | 1 | 2 | | 300 troops | 350 gold, 200 wood |
| Frigate | shipyard | 100 | 16 | 8 | 2 | 2.8 | | 80 troops | 400 gold, 180 wood, 20 iron |
| Ship of the line | shipyard | 200 | 30 | 16 | 2 | 1.8 | | 150 troops | 800 gold, 300 wood, 60 iron |

The cannon cuts capture cost as much as the trebuchet, moves faster, and is far stronger in battle. Frigates and ships of the line are the first ships worth building to fight rather than to carry troops.

### G4. Buildings and what they do

This needs one small new thing: an `effects` block on a building type, added up per nation in the same way research effects are. Research effects already use `troop_cap`, `defence` and `research`; this adds `income`.

| Building | Effect |
| --- | --- |
| Bank | income +8% each, up to 5 banks |
| Library | research +8% each, up to 5 |
| School | research +5% each, up to 10 |
| Theatre | counts as goods for people's needs, so Medieval and Gunpowder homes can upgrade (today they stall: nobody makes goods) |
| Courthouse | troop cap +3% each, up to 5 |
| Star fort | land within 6 plots of it defends at 1.5 times (see decision 1) |
| Cannon foundry | builds cannons |
| Shipyard | builds galleons, frigates and ships of the line; counts as a port |

The caps stop a nation from stacking a hundred banks.

### G5. Showing it

- The research panel gains a Gunpowder row on its own.
- The Army panel lists the new troops, and the building panel lists the new machines.
- Stacks of musketeers and the others are drawn with their figures at close zoom.
- The Town panel's next step and the guide mention the new buildings where they help.

### G6. Checks

- **Unit tests:**
  - the tree validates;
  - each troop's power;
  - the cannon's siege;
  - bank and library effects add up, and stop at their caps;
  - a star fort's defence.
- **Browser test:** a nation researches into Gunpowder, builds a bank and sees its income rise, trains musketeers and builds a cannon and a frigate.
- **Bench:** Earth and fine Europe with Gunpowder armies.

### G7. Ryan's check

## Decisions (answered by Ryan, 26 September 2026)

1. **Yes**: towers and forts change combat.
2. **Stop at the end of Gunpowder** ("I trust you"). Age of Industry comes with the Industrial slice.
3. **Gunpowder first**, then milestone two's step 7.

Two changes found while starting:
- Walls are not buildable today: the tree names wall sprites, but only the wooden, stone and concrete towers are buildings. The defence rule therefore goes to the three towers and the star fort.
- The research rate already adds a flat `research` number for each building that has one. Libraries and schools use that, at 0.2 and 0.1 points a second with the same caps, instead of percentages.

## The questions as asked

1. **Should forts, walls and towers finally change combat?** Recommended: yes. Land within reach of a star fort defends at 1.5 times. Walls and towers use the same rule with smaller numbers, so the Medieval defences stop being decoration too.
2. **Stop at the end of Gunpowder, or add Age of Industry now?** Recommended: stop. Reaching Industrial would unlock factories and tenements that need steel, which nothing makes yet. Age of Industry comes with the Industrial slice, together with its steel mill.
3. **This before milestone two's step 7 (economy while away), which was planned right after milestone three?** Recommended: Gunpowder first, because it is what players run into. Step 7 matters more once games run for days.

## Budgets

- No new resources, no protocol change, and no change to the tick loop apart from the building effects added up every economy tick.
- New unit and building numbers are appended; nothing already saved changes number.
