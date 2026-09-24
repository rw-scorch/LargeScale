# Piece 6: Resources

## Goal

Give the land value:

- finite ore deposits in fixed places
- forests that are cut down
- farms whose yield follows fertility, season and weather
- fish that never runs out

This is what makes one piece of land worth fighting for over another.

## Already decided

- Ore deposits are finite and fixed.
- Terrain and weather affect play.
- The economy has money plus physical goods.

## Depends on

Piece 3. Piece 7 then moves the goods around.

## Example code

`example/resources.js` and 5 tests.

- **`DEPOSITS`.** 17 deposit types. Each has the terrains it appears on, a chance per plot, an amount range and a vein length, so deposits come in short wandering clusters rather than single dots.
  - Stone, iron and copper sit in hills and mountains.
  - Oil and gas sit in deserts, steppe, tundra and shallows.
  - Lithium sits on salt flats.
  - Fish sits on shallows, reefs and lakes, and is infinite.
- **`generateDeposits(map, rng)`.** Runs once at map build time. It returns a type array and an amount array.
- **`PRODUCERS`.** What each producer building needs and makes:
  - mines, pits and derricks need a deposit on or near their plot
  - woodcutters and sawmills need forest within 3 or 4 plots
  - fields need fertile land
  - pastures need grassland
- **`produce(world, dt)`.** Returns what each nation made this step:
  - deposits drain nearest first
  - forest plots lose wood and turn into cleared land at zero
  - farms yield `rate × fertility × season × weather`
- **Events.** `deposit_depleted` fires when a deposit runs out, and the client swaps to the `deposit_<type>_depleted` sprite.
- **`regrowForests`.** Slowly turns unowned cleared land next to healthy forest back into young forest.

## Numbers to start from

| Producer | Rate per second | Note |
| --- | --- | --- |
| `quarry` | 0.25 stone | A 5,000-stone deposit lasts about 5.5 hours of real time |
| `mine_pit` | 0.12 of the ore | Medieval |
| `mine_shaft` | 0.4 | Industrial, more deposit types |
| `mine_openpit` | 1.2 | Modern, drains a 3 by 3 area |
| `woodcutter_camp` | 0.15 wood | Clears a forest plot of 250 wood in about 28 minutes |
| `field` | 0.04 food × fertility × season | Summer ×1.2, winter ×0.2 |
| `fishing_hut` | 0.05 food | Never runs out |

A finite resource that lasts a few real hours per plot means each world will genuinely run dry in places over days. That is the intent: it pushes expansion and trade.

## Money-like resources

Decided in the third round: gold is the currency, and the other ores are worth a fraction of gold and can be spent as if they were money. Suggested worth per unit, relative to gold: silver 0.4, copper 0.12, iron 0.1, tin 0.15, coal 0.06, stone 0.05. A nation short of gold can pay with iron at its rate. Explosives, missiles, fuel and uranium are never spendable as money, because those are the decisions worth keeping.

## Steps

1. Run `generateDeposits` in the map build (piece 18) and save the result with the map. Deposits are part of the map, not random at every start.
2. Show deposits:
   - `deposit_<type>` sprites at close zoom
   - a toggle that highlights them at mid zoom
   - an optional market product that reveals deposits in a region (piece 10)
3. Producer buildings are player-placed through piece 8. Their placement check is `canPlaceProducer`, which returns a plain reason string like "needs a deposit" for the UI.
4. Until piece 7 exists, add production straight into a nation-wide stock. Piece 7 then changes that to the nearest stockpile node.
5. Let workers matter: multiply each producer's output by `min(1, available workers / needed workers)` from piece 5. The example has a `workforce` field for this.

## Done when

- The tests pass.
- A mine visibly runs a deposit to zero and the sprite changes.
- A woodcutter slowly clears the forest around it.
- Winter farms produce much less.

## Pitfalls

- Store deposit amounts sparsely for the Earth map: a `Map` from plot to amount. A float per plot is 20 MB for nothing.
- Floating point: compare depleted as `amount <= 0` and clamp. Never assume a subtraction lands exactly on zero.
- Do not let the market (piece 10) make deposits pointless. Market buying should stay more expensive than mining at home, which the fee and price curve already do.

## Thoughts

- A resource map is the strongest reason to go to war on a real Earth map, so make deposits readable.
- Real geography helps: oil in the Gulf, iron in Australia. Piece 18 could bias deposit chances by real regions so the map feels familiar.
