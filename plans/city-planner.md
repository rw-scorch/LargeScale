# The planner: cities, roadways and room to grow

Ryan's ask, 8 October 2026: "can you make like planning also plan for space to grow and like entire citys and roadways". This is my reading of it, for him to correct. It builds on the planner from milestone eight (`src/shared/planner.js`).

## What exists

- **Blocks.** A block is 7 by 7 with a cross of streets and four 3 by 3 lots, or 5 by 5 with one street. One is proposed when a zone runs short of free plots.
- **Town links.** A road joins each town to the capital's roads.
- **Spot search.** Buildings are put at the nearest free spot to a town, wherever that is.

## The additions

1. **Districts.** A project that lays a whole grid beside a town: G by G lots of 3 by 3, with a street on every side of every lot. G is 2 to 4, so 9 by 9 to 17 by 17 plots.
   - **Zones.**
     - Housing goes in the rows nearest the town.
     - Shops go along the middle column.
     - Works go in the far row, from the Medieval era on, where works can be zoned.
   - **Streets and links.** Streets reuse roads already there. A link road joins the grid to the town's roads.
   - **Room to grow.** Lots of 3 by 3 leave room for homes to grow into apartment blocks (2 by 2) and arcologies (3 by 3).
   - **When.** One district is offered for the capital and one for the biggest other town, when housing runs short, alongside the single block.
2. **A new city.** When you hold enough open land at least 24 plots from every town, the planner offers a 3 by 3 district there, with a road to the capital. It goes at the nearest such spot, to keep the road short.
3. **Main roads.** One project joins the capital's roads to every town, port, station, airfield and mine that is not on them yet. It replaces the separate town links, at up to 60 pieces.
4. **Room to grow.**
   - **Farms and power plants** keep 5 plots away from towns: their homes, shops and works, and zones already planned. Town features (civic buildings, attractions, defences) still go close in.
   - **Buildings that grow.** A planned building that becomes bigger when upgraded (harbour, airfield, town hall, and others) goes where its next size also fits, if such a spot exists. That room is kept clear of the other projects.
   - **Upgrades.** Proposals leave out buildings with no room to grow. This was done with the fixes, in PR 51.

## Rules

New values go in `rules.json` `planner`:

- `district` [2, 4]: the smallest and largest grid
- `growRoom` 5
- `newCityGap` 24
- `newCityMin` 400: own plots needed before a new city is offered

## Checks

- **Unit tests:**
  - the district's shape, zones and streets
  - a district reusing a road
  - the new city's distance and link road
  - the main roads' targets
  - farms keeping out of the growth room
  - a harbour placed with room for the commercial port
  - the server running a district to the end
- **Smoke** queues a district and sees it built.
- **UI** shows the district outline in the planner.

## Built (8 October 2026)

Built on branch `planner-cities`, stacked on `fix-controls` (PR 51).

### Changes from the plan

- **Districts and the new city come last.** The other projects are smaller and are placed first. They are proposed before districts and the new city, which take the land left over. The list is then sorted by kind, so towns projects are not cut by the 40-project limit.
- **Patchy ground.**
  - Streets may run over any of your land, rough ground included; rough ground costs more to lay road on.
  - A lot that is not all buildable is left empty, and a district needs three quarters of its lots good.
  - Districts keep off deposits, which are left for mines.
- **Main roads start from the capital itself** when it has no roads yet.
- **Smoke, not UI.** The district check is in the smoke test, in a world of its own grown to 900 plots. The UI test's world is still about 30 plots when the planner is checked.
- **Tests that differ from the list.**
  - Room for a next size is tested with an airfield and its air base, not a harbour.
  - No test yet checks a district reusing a road that is already there.

### Speed

- **Search.** Districts search a window around each town, and the new city a window around its 600 nearest candidate spots. Two running sums do the work: one for street ground and one for lot ground.
- **Main roads** make at most 12 tries, each with a smaller search budget (8,000 nodes).
- **Earth bench.** Proposing takes 31 to 118 ms a player, against 20 to 67 ms before. The browser does it every 5 s while the planner card is open.

## Evidence

- `npm test` 375, with 5 new planner tests.
- **Smoke:** 137 of 137. In its own world a district is offered, queued and laid out with nothing else pressed.
- **UI:** 202 of 202.
- **Soak:** clean, with 39 plan projects added.
- **Full Earth bench on an idle machine.** Every run fails the 50 ms worst-tick budget.

  | Run | Median tick | 99th percentile | Worst tick |
  |---|---|---|---|
  | This branch | 15.7 ms | 52.9 ms | 82.2 ms |
  | This branch, engineering off | 17.3 ms | 58.1 ms | 90.2 ms |
  | `main`, before this work | 15.6 ms | 54.2 ms | 79.2 ms |

  The failure is older than this work: no single system the bench times passes 50 ms.
