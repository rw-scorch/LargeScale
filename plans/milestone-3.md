# Milestone three: troop types, then machine units, then a new interface

Ryan's order (26 September 2026): unit types inside stacks first (option 2 of the four put to him), then machine units (option 4), then a rework of the whole interface after studying openfront.io and frontwars.io. This takes the place of the old milestone-three list (roads, convoys, stockpile nodes and army supply), which moves after it.

## Decisions (answered by Ryan, 26 September 2026)

1. **Training buildings: one building line.** A war camp in the Tribal era upgrades to a barracks, and it trains every type your research has unlocked. The Archery and Stirrups research unlock only the soldier types.
2. **No counters.** Each type has attack, defence and speed, nothing more.
3. **Everyone sees the full mix** of every stack.
4. **Troop types now.** Milestone two's step 7 (the economy while away) and step 8 (Ryan's check) wait until after.

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
- A stack's power is the sum over its types of count times attack, or defence while it holds, times its experience bonus. Battles stay Lanchester's square law, so fighting strength is quality times numbers squared: a knight with three times a levy's attack is worth about 1.7 levies in a straight fight. Losses come out of every type in proportion to its count.
- Taking land costs a stack fewer troops the stronger its attack, and mounted troops take land faster. A stack moves at the speed of its slowest type.
- Experience belongs to each stack. Fighting and taking enemy land earn it. The levels are Green, Seasoned (+10%), Veteran (+20%) and Elite (+35%). Merging averages it by troops, splitting keeps it on both halves, and disbanding loses it.
- The garrison's defence counts trained troops at their defence power, so a trained reserve at home makes your land harder to take.
- Bots keep levies only.
- **Done when:** unit tests show a knight stack beating a levy stack half as large again, experience raising power, and splits, merges and disbands keeping every type's count right; the bench still passes.
- **Done (26 September 2026).**
  - `src/sim/troops.js` and `data/units.json`. Nine unit tests: a bot world runs identically with or without troop types; forming a stack takes the same share of every type; losses, splits, merges and disbands keep each type's count; 400 knights beat 600 levies with about 200 left, as the square law predicts; experience adds 10, 20 and 35%; knights take land half as fast again for a third of the troops; a trained reserve makes land dearer to take; a stack moves at its slowest type's speed; state rows carry the mix only when there is one.
  - Smoke: 200 knights given to the host, a half-share stack takes about 100, and both players see the mix. Browser script: the stack panel lists "240 levies, 29 knights".
  - Totals: 129 unit tests, smoke 86 of 86 on the test map, browser script 74 of 74 on the test map.
  - Bench: this laptop measured over budget both with and without the change (worst tick 53.6 ms with it, 58.8 ms without, back to back), against 36.5 ms earlier in the day. The troops module itself costs nothing measurable.

### A2. Training

- Training buildings: a war camp (Tribal, new, unlocked by Clubs) that upgrades to the barracks (Medieval). The art has both.
- A new Army panel lists the types you have unlocked, with power, cost and how many you have. For each type you set how many to keep. Training buildings turn levies from your garrison into those types over time and charge a little gold, plus wood or iron ore for some. More buildings train faster. No queues per building.
- Forming a stack takes the same share of every type in your reserve, so a 30% stack takes 30% of your archers too. The Army panel can set a different mix for new stacks.
- **Done when:** a nation with a barracks keeps its target of spearmen topped up from the garrison while the gold lasts, and forming a stack takes its share of them.
- **Done (26 September 2026).**
  - Unit tests: a war camp keeps 40 club warriors topped up at 1 a second for 0.4 gold each, turning levies into them so the total stays the same, and refills the reserve after a stack takes half; a barracks trains swordsmen as far as iron and levies allow and says why when it stops; the army order refuses locked, unknown and negative targets.
  - Smoke: after Clubs research and a war camp, the host's 20 club warriors are trained. Browser script: the Army panel (K) keeps 12 club warriors, shows "Training 8 a second", and knights say "Needs Stirrups research".

### A3. Showing them

- At close zoom each stack draws a few soldier figures of its main type, walking when it moves and attacking when it fights, with a chevron for experience. At other zooms the marker shows the main type.
- The stack panel lists the mix and the experience, for your stacks and everyone else's.
- **Done when:** the browser script sees soldier figures of the right type and the mix in the panel.
- **Done (26 September 2026).** The browser script sees a stack of mostly knights drawn as five knight figures, with the mix "306 levies, 10 club warriors, 566 knights" in the panel and Veteran chevrons over the flag (`.screens/27-soldiers.png`).

### A4. Ryan's check

### Ryan's notes while part A was built (26 September 2026)

- **Autodefend.** The design's standing orders were kit code in `src/sim/offline.js` that was never installed. The world now runs them every `standingEvery` (2) seconds for human nations with no open game. Hold is the default: an advancing stack stops and drops its path, so an absent player's stacks no longer go on seeking land. Fall back retreats to the nearest safe plot when enemies within `threatRadius` (6 plots, scaled on fine maps) outnumber the stack `fallbackRatio` (1.5) to 1. The `standing` order sets one stack, or every stack and new ones; the stack panel has the choice under "While you are away, this stack". Absent players still defend at 0.95.
- **Land-taking notices.** `plot_lost` was keyed by the losing nation per tick, so a second attacker in the same tick was folded into the first: the victim saw the wrong name and the second attacker got no notice. It is keyed by loser and attacker now. Closing a pocket (`fillEnclaves`) took the enclosed land with no event; it reports it now. The away summary (`summarise`) counts plots rather than events. A seeking stack that stops says it found nothing it can reach by land. Which wrong notice Ryan saw is not known; if one still shows, its exact text is needed.
- **Online light.** The world broadcasts `presence` (the nations online) when it changes, and `hello` carries `online`. The nations list shows a green dot for players online and a grey one for those away; bots have none.

## Part B: machine units

Draft, for Ryan to agree before it is built (26 September 2026).

The kit's piece 15 (`src/sim/units.js`, copied in with its tests but not installed) has 17 machines, from catapults and galleys to battleships, tanks and fighter planes: individual units with hit points, and `embark` and `disembark` for ships carrying stacks. The research tree only reaches the Medieval era, where Siegecraft unlocks the siege workshop, the catapult and the trebuchet, and Harbours the harbour, the fishing boat, the galley and the cog. The art for all five is in the kit, wrecks included; the trebuchet and the fishing boat need adding to the machine list. Tanks, destroyers and aircraft come with the later eras (piece 16), as data in the same registry.

### B1. Machines in the simulation
- The machine list moves into `data/units.json` as `kind: "machine"` entries with a cost, a build time and `builtAt`.
- Each machine is one object with hit points, outside the troop count. Land machines pay terrain move costs; ships sail water only.
- A machine on the same plot as a friendly stack adds its attack and defence to that stack's power, so a catapult helps an advance without touching the troop count. Siege machines also make capture cheaper next to them.
- Battles damage machines. At 0 hit points a machine becomes a wreck for a while.

### B2. Building them
- The siege workshop builds catapults and trebuchets; the harbour builds galleys and cogs. One at a time or a batch, for gold and materials, over time like construction.

### B3. Ships carry stacks
- A stack next to its own galley (120) or cog (200) embarks up to the ship's capacity. The ship sails, and the stack lands on a coast next to it, losing 15% (`rules.json` `landing`), or nothing into its own port. Landing on enemy or unclaimed land pays the normal capture cost.
- This is the first way across water.

### B4. Showing and ordering them
- Machines are selected and moved like stacks: click, right-click or a drawn path. Ships show their cargo. Counts stay small, tens rather than hundreds.

### B5. Ryan's check

### Decisions for Ryan
1. Medieval machines now (catapult, trebuchet, galley, cog) and the rest with the later eras, or the later eras first.
2. Whether ships carrying stacks across the sea is in. It changes the map: islands and other continents become reachable.

## Part C: the new interface

Study how openfront.io and frontwars.io lay out their screens, then plan a rework of every panel. Its own plan after part B.

## Budgets

- `npm run bench`: worst tick under 50 ms with 400 bots and 8 players, as now.
- Protocol changes stay additive where they can.
