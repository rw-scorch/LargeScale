# Milestone two: the first towns

Goal: a nation is more than land and troops. Players zone towns that civilians fill and grow, place their own buildings, dig and farm the land for materials, and research from the Tribal era into the Medieval one, with the whole economy carrying on while they are away. This is pieces 5, 6, 8 and 9 of the kit, plus the economy side of piece 12.

Roads, convoys and army supply (piece 7) come in milestone three unless Ryan wants them here (question 2). Until then goods sit in one stock per nation, as the kit's guides allow.

## Decisions (answered by Ryan, 24 September 2026)

| # | Question | Answer | What it means for the build |
| --- | --- | --- | --- |
| 1 | Is this plan agreed? | Yes | |
| 2 | Roads, convoys and army supply now or next? | Next milestone | One stock per nation until then |
| 3 | Where does money come from early? | Automatic: 1 gold a second, plus income tax on the population | A fixed tax rate for now, in `data/rules.json`. Later the player sets it, and a higher tax makes people leave |
| 4 | Troop cap | A percentage of the population for now | Cap = a small base + a set share of the population, in `data/rules.json`. Later a slider, where a high share hurts the economy |
| 5 | Buildings on captured land | Pass over | Buildings and residents pass to the capturer. Residents may move away, but do not have to |
| 6 | Bots with economies? | No | Bots keep simple troop growth |
| 7 | Starting kit | Yes | A free chieftain hut at the capital, plus 50 food and 40 wood |

Later, from the answers: a tax slider (people leave above some rate) and a conscription slider (a high share lowers the economy). Both are out of scope here, but the rules should read a per-nation rate so the sliders only need a message and a panel.

## Budgets to hold

Measured at the end of milestone one, and what this milestone must stay within.

| Budget | Now | Limit for this milestone |
| --- | --- | --- |
| Worst tick, Earth, 400 bots, 8 players | 23 to 27 ms | 50 ms, with 8 player economies running |
| Worst tick, fine Europe, 100 bots | 27 ms | 50 ms, with economies |
| Server memory, Earth | about 58 MB of heap | under 100 MB of the 128 MB a world gets |
| Rows written per save | 2 to 4 | at most 6, and only for layers that changed |
| Join size, Earth | about 150 KB with 400 bots | under 400 KB with towns built |

Memory is the tight one. The kit keeps full-size arrays of 4 bytes per plot for civilian buildings, player buildings and forest wood. On the Earth map, 5.2 million plots, those three alone would add 62 MB. The plan below replaces them with one sparse building index and one byte per plot where a layer is needed, about 16 MB on Earth and 3 MB on fine Europe.

## Steps

### 1. One building layer and save format 3

- One building registry for civilian and player buildings, with a `civilian` flag, as the construction guide asks. The plot index is a sparse map from plot to building, not an array per plot.
- One-byte layers for zones and forest wood (wood kept as a fraction of full in 255 steps).
- Save format 3: the zone and wood layers are run-length encoded like the owner layer, and the building list is one row. Each save writes only the layers that changed. Worlds from save format 2 load with empty layers, so the live world keeps running.
- Captured plots follow question 5.
- Tuning numbers move from the kit modules into `data/rules.json`.
- **Done when:** tests cover the registry, the save round trip and capture; `npm run bench` reports memory with 8 nations holding 2,000 buildings each; a format 2 world loads.
- **Done (25 September 2026).** 72 unit tests and 95 kit tests pass. Earth bench with 16,000 buildings: worst tick 11.7 ms, 47 MB settled heap (40 MB without buildings), every layer one row (buildings 352 KB, wood 140 KB, zone 3 KB). Fine Europe at 100 bots: worst tick 13.4 ms, 21 MB. A format 2 world made on `main` loaded under `wrangler dev` as format 3, and a format 3 world reloads with identical layer hashes.

### 2. Player construction (piece 8, first half)

- A `build` message and a `demolish` message, validated on the server with `canPlace` and the unlocked list.
- Build menu panel: tabs by category, cost and build time, greyed items with the reason.
- Placement ghost with the valid and invalid overlays, and the reason next to the pointer. The client runs the same `canPlace` from `src/shared` for instant feedback.
- Construction sites with the `_construction` sprite and a progress bar. Cost is paid up front from money and the nation's stock.
- Demolish refunds half and leaves rubble for a while.
- The renderer draws building sprites from the pack at close zoom and simple dots at mid zoom.
- **Done when:** the smoke test places, finishes and demolishes a building and a second client sees it; the browser test shows the ghost and a finished building; every placement rule shows a readable reason.

### 3. Civilians (piece 5)

- A `zone` message and paint and erase tools with the `ov_zone_*` overlays.
- The economy tick every 5 game seconds, with per-nation sets of free zoned plots instead of a map scan.
- Needs, growth, starvation, demand, building and self-upgrade as in the kit.
- Troop cap: a small base plus a set share of the population (question 4). Money: 1 gold a second plus a fixed tax per resident (question 3). Both rates are per nation, read from `data/rules.json` defaults.
- Stats panel: population, housing, jobs, food, goods, needs, and the three demand bars.
- **Done when:** a zoned area fills with huts and grows as food comes in; starving it visibly empties it; the benchmark passes with 8 player economies of a few thousand buildings each.

### 4. Resources (piece 6)

- Deposits are generated once per base map by the map pipeline and committed next to it, as a sparse list: `public/map/deposits.bin.gz` and `public/map/fine/deposits.bin.gz`. Region worlds cut theirs from the base list.
- Producer buildings (quarry, woodcutter camp, field, fishing hut, later the mines) are placed through the build menu, with `canPlaceProducer`'s reason.
- Forests are cut down and slowly regrow; deposits run dry and change sprite; farms follow fertility and the season.
- A deposits overlay toggle at mid zoom.
- Output multiplies by available workers from step 3.
- **Done when:** a quarry runs a deposit to zero and the sprite changes; a woodcutter clears the forest around it; winter farms make much less.

### 5. Research and eras (piece 9)

- `data/techtree.json` holds the kit's Tribal and Medieval tree, validated against the sprite list at startup.
- A `research` message and a research queue, so research carries on offline.
- Research panel: four branches with era rows, node states, costs, unlocks and the reason a node cannot be taken yet.
- An era change is announced to everyone, plays `era_up` on the capital, and switches the stack markers to the new era.
- The build menu and civilian self-upgrades follow what is unlocked, checked on the server.
- **Done when:** a new nation researches through Tribal into Medieval, sees new buildings in its menu, and its huts start turning into timber cottages without help.

### 6. Bulk upgrade menu (piece 8, second half)

- The list of upgradable buildings, lowest first, with identical rows grouped into one line with a count.
- Swipe to select a range, select all, a live total, and one button to upgrade at the 1.5 instant premium.
- A summary of what was done and what was skipped, with reasons.
- A civilian filter.
- **Done when:** selecting 20 watchtowers and upgrading them costs exactly 20 x 1.5 x the stone tower cost, lowest first, with the rest explained when money runs out.

### 7. The economy while away (piece 12)

- Catch-up on wake runs the economy, construction and research, not only troop growth, still capped at 72 hours.
- Away players produce 90 percent, as decided.
- A "while you were away" summary on return: buildings finished, population change, research done, land lost.
- **Done when:** a world left for 12 hours of game time wakes in under 2 seconds with the economy advanced, and the summary shows it.

### 8. Ryan's check

- Ryan deploys and plays a weekend world on fine Europe with at least one friend.
- Fix what they report before calling the milestone done.

## Out of scope for milestone two

Roads, convoys, stockpile nodes and army supply (milestone three, unless question 2 says otherwise), the market, diplomacy beyond war and peace, units, ships and aircraft, nukes, weather, terrain engineering, eras beyond Medieval, the tutorial and the map editor.
