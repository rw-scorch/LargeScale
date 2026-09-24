# Piece 5: Civilians

## Goal

A living population:

- civilians move into zones you paint and build their own homes, shops and workshops
- they grow when their needs are met and shrink when they starve
- they upgrade their buildings as eras unlock
- they supply the troops

## Already decided

- A simulated population with needs, and SimCity-style zoning.
- Civilians self-build homes, shops and restaurants.
- Civilians also self-upgrade over time, gated on the era being unlocked, needs being met and materials being available. The same buildings also show in the bulk upgrade menu (piece 8).
- Troops are drawn from the population. There is no unrest.

## Depends on

Piece 3. Piece 6 feeds it food and materials.

## Example code

`example/civilians.js` and 6 tests.

- **Data table `CIVIL`.** Civilian building chains per zone, with footprints, housing or jobs, cost, build time and the next step. The sprite ids are real pack sprites.
  - Residential: `hut_grass`, `cottage_timber`, `house_brick`, `tenement`, then `apartment_block` and `eco_tower`, which need 2 by 2.
  - Commercial: `market_stall`, `bakery`, `general_store`, `shop`, `cafe`.
  - Industrial: `forge`, `foundry` (2 by 1), then `factory_early` and `factory_modern` (2 by 2).
- **`zonePlots`.** Paints a zone on your own buildable plots.
- **`econTick(world, 5, rng)`.** Runs every 5 game seconds:
  1. Advances construction. A finished house gets 3 residents.
  2. Totals housing, jobs, goods made and population per nation.
  3. Works out needs. Food satisfaction is food in stock against what the population eats. Job satisfaction is jobs against workers (half the population). Goods satisfaction counts from the Medieval era on.
  4. Combines them: `needs = food × (0.6 + 0.4 jobs) × (0.8 + 0.2 goods)`.
  5. Moves each house toward `housing × needs` residents, 2 percent of the gap per second. Starvation takes an extra slice.
  6. Works out demand. Residential when housing is over 75 percent full. Commercial for 8 shop jobs per 100 people. Industrial for 15 workshop jobs per 100 people, from Medieval on.
  7. Tries up to 6 free zoned plots per zone with demand, building the best type the era allows.
  8. Gives each finished building a small chance each tick to upgrade, if it is over 90 percent full, needs are over 0.8, the next step's era is unlocked, and its footprint fits.
- **Troops.** The troop cap becomes `200 + 0.35 × population`. `conscript` turns people into troops, and each troop costs a quarter of a person.

## Steps

1. Add a `zone` message: a list of plots and a zone type. Validate ownership. Client tools: paint and erase zones with the `ov_zone_*` overlay tiles and the `build_zone` icon.
2. Call `installCivilians` at world start, and save `civ.zone`, `civ.bld` and the building list as chunks and rows.
3. **Growth into bigger buildings.** When an upgrade needs a bigger footprint, it only happens if the extra plots are free and zoned the same. The example already checks this.
   - To let cities densify, allow a civilian building to absorb a neighbouring empty zoned plot when it upgrades.
   - A later pass can merge four maxed small houses into one apartment block.
4. **Walkers.** These are client-only decoration. Spawn civilian walker sprites on roads near dense homes, roughly one per 50 residents on screen, using the era's walker type, and animate walk1 and walk2. The server does not simulate them.
5. **Stats panel.** Population, housing, jobs, food, goods, needs as percentages, and the demand bars (residential, commercial, industrial), which are the classic SimCity readout.

## Scaling to the Earth map

The example scans the map once per economy tick to find free zoned plots. On 5 million plots, keep per-nation sets instead:

- add a plot when it is zoned
- remove it when something is built there or the plot changes owner

`nationTotals` loops over buildings, not plots, and that stays fine.

## Done when

- The tests pass.
- A zoned area fills with huts, then grows as food comes in.
- Starving a city visibly empties it.
- Unlocking the Medieval era turns huts into timber cottages over the following minutes.
- The troop cap rises with population.

## Pitfalls

- Civilians must never build outside zones or on land you do not own. Check again at the moment of building, not only when the zone is painted.
- If you let food production depend on workers (piece 6), and workers on food, check for a death spiral at game start. The example starts each nation with food in stock for this reason.
- Round residents only for display. Keep them as floating point in the simulation.

## Thoughts

- Needs as simple ratios are easy to read and tune.
- Resist adding happiness. Unrest is out of the game, and needs already do that job through growth.
- If cities feel static, the lever to pull is upgrade chance, not more needs.
