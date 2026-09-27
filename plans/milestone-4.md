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

### Progress (26 September 2026, branch `m4-gunpowder`, stacked on `m3-controls`)
- **G1 to G3, data.**
  - 14 research nodes, 4 troops and 4 machines (unit numbers 14 to 21), and 8 buildings (numbers 48 to 55).
  - The barracks trains the new troops; the cannon foundry builds cannons, and the shipyard (a port) builds the three ships.
  - All of it reads its numbers from `data/`; no machine or troop code changed.
- **G4, effects and forts.**
  - `src/sim/effects.js` adds up building effects every two seconds, with each type's cap, and readers now take research and building effects together (`effectOf`).
  - Banks raise income, courthouses the troop cap, and libraries and schools add research points; theatres gather goods.
  - Forts: land within a tower's or star fort's radius defends at its strength (the strongest covering fort counts), in capture cost and for stacks holding their own land. They are indexed on a 16-plot grid per nation, and a lookup takes about 45 ns.
  - `rules.json` `effects` holds the timing and grid size.
- **G5, on screen.**
  - A selected or placed fort draws its reach, and the hover tip says when land is fortified.
  - The research panel opens at your era, and the Town panel points to theatres when people lack goods.
  - Admins can give iron.
- **Evidence.**
  - `npm test` 160 of 160, including 5 new effect tests.
  - Reference 95 of 95; smoke 93 of 93.
  - `npm run ui` 118 of 118 on the test map and on fine Europe. A new nation researches into the Gunpowder era; a bank takes income from 1 to 1.08 gold a second; the Army panel offers the four troops; a cannon foundry casts a cannon; and a star fort draws its reach and fortifies the tip.
  - `npm run bench`, now with star forts, towers, banks and courthouses: Earth worst tick about 37 ms, fine Europe 37.5 ms.

## Ryan's asks after PR 19 (27 September 2026, branch `m4-asks`, stacked on `m2-policies`)

Ryan's answers: guard means stacks and troops at home that watch enemy movement and go to intercept and fight; the town hall and parliament gather; the Industrial slice comes after his check. His notes: the research panel was confusing (a tree with side paths wanted), queueing needed prerequisites researched first, notices said he was attacking himself, and panels should move and resize from Settings. A new main menu comes later.

- **Research queue.** An era node needs a number of upgrades across branches as well as its prerequisites, so a queue through one stopped and waited. `planPath` now adds the cheapest missing upgrades of that era, uncovered branches first. Every node, Gunpowder included, queues a path that never waits.
- **Self-attack notices.** Closing a pocket mid-advance claimed plots further down the same frontier list, and the loop then "captured" them from its own nation: it paid troops and reported you taking your own land. The advance skips your own plots now.
- **Seats of government gather.** The town hall gathers 0.10 food and 0.06 wood a second, and the parliament 0.12 and 0.07, continuing the chieftain hut and great hall.
- **Guard** (`src/sim/guard.js`).
  - **Who goes.** Stacks with the Guard standing order, and troops at home when the Army panel's Guard my land is on (`n.guard`).
  - **What counts as a threat.** Every 2 seconds it finds hostile stacks on your land, walking into it, or advancing within reach of your border.
  - **Where they go.** To the point where each threat enters your land or where it is headed.
  - **How many.** Idle guard stacks go first, nearest first, until they have 1.5 times the threat's strength. Then a stack is formed from home, keeping a quarter of the troop cap at home.
  - **Afterwards.** Pulled stacks walk back; formed ones fold home without loss, as far as the cap has room.
  - **Control.** Any order you give a stack takes it off guard duty. It runs online and away, never in catch-up.
  - Rules are in `rules.json` `guard`.
- **Research tree** (`public/js/ui/research.js`).
  - Eras run left to right as bands, with each advance at the end of its band, and branches are lanes.
  - Lines join nodes to their prerequisites. Nodes no era advance needs are side upgrades, with dashed borders.
  - Picking a node outlines what Add to queue would queue. Details sit beside the tree, which scrolls by drag or wheel.
- **Arrange panels** (`public/js/ui/layout.js`, Settings, Layout). Frames for nine panels, moved by dragging and resized by the corner, with a mouse or a finger. The layout is kept in `ls_layout` as fractions of the screen, and there is a reset per panel and for all.
- **Evidence.**
  - `npm test` 177 of 177, with `test/guard.test.js`, a pocket test, an era-queue test for every Gunpowder node, and a hall-chain test.
  - Reference 95 of 95; smoke 98 of 98, where the friend's attack meets a guard stack of 226 formed from home.
  - `npm run ui` 129 of 129 on the test map and on fine Europe: Guard on a phone, the tree, and layout by mouse and by touch.
  - `npm run bench`: all 8 players on Guard against 400 bots, guard pass 4 ms, worst tick 34.2 ms.

## Ryan's asks after PR 22 (27 September 2026, branch `m4-swipe`, stacked on `m4-asks`)

Ryan's list: selecting troops by swiping; zoning only moved the screen; troops stopped advancing into unclaimed land while he was away; scheduled games that show everyone when each event happens; an overtime that forces players to fight. Individual military units come later. His answers: overtime is a shrinking border, the schedule covers every event with all settings and info shown to everyone, and the winner is the last player standing.

- **Zoning with the crosshair.** Zoning and painting needed Select held down, so on a phone a drag moved the map instead. Select is now a toggle there: press, move, press again. Esc cancels.
- **Away advances.** Standing orders held every advance of an absent player. An advance into unclaimed land now goes on, and a plain advance carries on into unclaimed land only, back to normal when the player returns. An advance at one nation still holds.
- **Swipe selection** (`public/js/ui/group.js`). A drag that starts on one of your stacks sweeps up every stack it passes; Shift and a mouse drag draws a box. The group panel and ring send one `group` order for up to 100 stacks: advance, take unclaimed land, advance on a nation, move (keeping the formation), gather on the biggest stack, halt and disband.
- **Schedules** (`src/shared/schedule.js`, admin op `schedule`).
  - Four times, all optional, in order: the world starts, peace ends, overtime begins, the world ends. At most 60 days ahead.
  - Before the start only picking a spot is allowed, and the world does not tick; catch-up measures from the start.
  - Until peace ends players cannot attack each other; bots can still be fought.
  - At the end the player with the most land wins (`by: "time"`); before that the last player standing wins, as before.
  - Everyone sees the times: the World info panel (I, or the countdown in the status bar), feed reminders an hour, ten minutes and a minute before, a feed line as each happens, and the next event on the world list.
- **Overtime** (`src/sim/overtime.js`). Every `shrinkEvery` seconds (the host picks 30 s to an hour; 2 minutes by default) every nation's outer ring of land turns unclaimed, bots included. Capitals are never taken, so nobody is eliminated by the shrink alone. Large shrinks are spread at 4,000 plots a tick.
- **Evidence.**
  - `npm test` 182 of 182 (`test/schedule.test.js`: rules, phases, the ring, spreading); reference 95 of 95.
  - Smoke 102 of 102: a schedule set and heard, a spawn allowed and a stack refused before the start, an attack refused in peace, the host's land shrinking from 49 to 29 plots in overtime, and a win at the end time. The cog landing check failed once on a shore it could not reach and passed on both reruns.
  - `npm run ui` 144 of 144 on the test map and on fine Europe: the editor, a refused order, the world list line, a phone opening World info from the countdown, the one-minute reminder, overtime in the bar and the feed, and the end-time win.
  - `npm run bench`: one full overtime shrink on the whole Earth with 400 bots takes 75,262 plots over 20 ticks, worst tick 14.4 ms; the normal worst tick is 31.3 ms, and the border sets still match a full scan.

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
