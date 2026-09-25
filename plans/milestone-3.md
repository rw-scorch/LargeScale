# Milestone three: troop types, then machine units, then a new interface

Ryan's order (26 September 2026): unit types inside stacks first (option 2 of the four put to him), then machine units (option 4), then a rework of the whole interface after studying openfront.io and frontwars.io. This takes the place of the old milestone-three list (roads, convoys, stockpile nodes and army supply), which moves after it.

## Decisions

To be answered by Ryan before code:

1. Training buildings: the four the tech tree already names, or one building line.
2. Counters between types, or plain attack, defence and speed.
3. How much of a stack's mix other players see.
4. Whether milestone two's step 7 (the economy while away) and step 8 (Ryan's check) come first.

## Part A: troop types

Troops stay a count, so "troops are a count" still holds. What changes is that every stack and every nation's reserve holds counts by type, and each type has a power level.

### A1. Types and power in the simulation

- `data/units.json` becomes the one registry for every unit, with `kind` either `troop` (counted in stacks) or `machine` (individual units, part B), and append-only `num` ids like buildings. `reference/docs/data-formats.md` already describes it for machines.
- Troop types follow the tech tree, which already unlocks them:
  - levies: the plain troops every nation has now
  - Tribal: club warrior and spear thrower (Clubs), horse archer (Bows)
  - Medieval: spearman and swordsman (Iron working), archer (Archery), pikeman (Pikes), knight (Stirrups)
  - later eras when their trees are built; the art already has musketeers, riflemen, machine gunners and thirty more
- Each type has attack, defence, speed, a capture rate and a cost per soldier, all in the data. For example a levy is 1 attack and 1 defence, a spearman 1.5 and 2, a knight 3 and 2 and half again as fast.
- A stack's power is the sum over its types of count times attack, or defence while it holds, times its experience bonus. Battles stay Lanchester's square law. Losses come out of every type in proportion to its share of the power.
- Taking land costs a stack fewer troops the stronger its attack, and mounted troops take land faster. A stack moves at the speed of its slowest type.
- Experience belongs to each stack. Fighting and taking enemy land earn it. The levels are Green, Seasoned (+10%), Veteran (+20%) and Elite (+35%). Merging averages it by troops, splitting keeps it on both halves, and disbanding loses it.
- The garrison's defence counts trained troops at their defence power, so a trained reserve at home makes your land harder to take.
- Bots keep levies only.
- **Done when:** unit tests show a knight stack beating a levy stack twice its size, experience raising power, and splits, merges and disbands keeping every type's count right; the bench still passes.

### A2. Training

- Training buildings: see decision 1. The art has a war camp, barracks, archery range and stable.
- A new Army panel lists the types you have unlocked, with power, cost and how many you have. For each type you set how many to keep. Training buildings turn levies from your garrison into those types over time and charge a little gold, plus wood or iron ore for some. More buildings train faster. No queues per building.
- Forming a stack takes the same share of every type in your reserve, so a 30% stack takes 30% of your archers too. The Army panel can set a different mix for new stacks.
- **Done when:** a nation with a barracks keeps its target of spearmen topped up from the garrison while the gold lasts, and forming a stack takes its share of them.

### A3. Showing them

- At close zoom each stack draws a few soldier figures of its main type, walking when it moves and attacking when it fights, with a chevron for experience. At other zooms the marker shows the main type.
- The stack panel lists the mix and the experience. What other players see depends on decision 3.
- **Done when:** the browser script sees soldier figures of the right type and the mix in the panel.

### A4. Ryan's check

## Part B: machine units

The kit's piece 15, with its example code and tests: land vehicles, ships and aircraft as individual units built at buildings (siege workshop, tank depot, naval yard, airfield), naval invasions, paratroopers and mines. It gets its own detailed plan when part A is done. Ships lean on ports (piece 7).

## Part C: the new interface

Study how openfront.io and frontwars.io lay out their screens, then plan a rework of every panel. Its own plan after part B.

## Budgets

- `npm run bench`: worst tick under 50 ms with 400 bots and 8 players, as now.
- Protocol changes stay additive where they can.
