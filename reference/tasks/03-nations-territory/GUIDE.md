# Piece 3: Nations and territory

## Goal

The OpenFront core:

- nations spawn, own plots, and grow a troop count
- troops split into stacks you move by hand
- stacks take land by walking into it or by advancing along a front

## Already decided

- Pixel-by-pixel ownership.
- Troops are a number like OpenFront, but moved by hand as stacks.
- Terrain changes movement, defence and capture cost.

## Depends on

Piece 2 to run online. The code itself is plain JavaScript and runs anywhere.

## Example code

`example/territory.js` is the `World` class. `territory.test.js` has 8 tests.

| Part | What it does |
| --- | --- |
| `owner` | `Uint16Array`, one nation id per plot, 0 for nobody. `claim(i, nid)` keeps each nation's plot count and a `dirty` set for broadcasting |
| `spawn(nid, x, y)` | Claims a land disc of radius 4. Refuses land within 12 plots of anyone else. Sets a capital and half the base troops |
| `growTroops(dt)` | Logistic growth toward `maxTroops`, with a small floor so tiny nations still recover |
| `createStack`, `splitStack`, `mergeStacks`, `disbandStack` | Move troops between the garrison and stacks. Stacks must start on your own land |
| `orderMove(stack, plot)` | Pathfinds over land using terrain move costs |
| `orderAdvance(stack)` | Sweeps the front around the stack |
| `captureCost(plot, attacker)` | What a plot costs to take (formula below) |
| `fillEnclaves` | Takes any small pocket (96 plots or fewer) you have completely surrounded |
| `checkEliminations` | Removes nations with no plots, and their stacks |
| `hostile(a, b)`, `passable(a, b)` | Replaced by diplomacy in piece 11 |
| `hooks` | `preTick`, `postMove` and `postTick`, used by later pieces |

## The numbers

These are starting points for playtesting.

- **Troop cap.** `1000 + 4 × plots`. Piece 5 replaces this with a population-based cap.
- **Growth per second.** `2 + 0.03 × troops × (1 − troops / cap)`. It is fastest at half the cap. This rewards keeping a working garrison over hoarding, as in OpenFront.
- **Unowned plot cost.** `0.6 × terrain capture`: 0.6 troops on grassland, 1.3 on mountain.
- **Enemy plot cost.** `max(1, defender troops per plot × 1.2 × terrain defence × defence bonus)`. A thin, spread-out nation is cheap to eat, and a dense small one is expensive. Half of that cost is also taken from the defender's garrison.
- **Stack speed.** 1.5 plots per second on cost-1 terrain, divided by the terrain move cost.
- **Advance.** Up to 6 plots per second, within 5 plots of the stack, nearest first. It stops when the stack would drop below 10 troops.

## Steps

1. Wire `World` into the world object from piece 2. The example already does this for spawn, stack, move, advance and chat.
2. Client: click a plot to spawn, and show valid spawn areas greyed out. Select a stack by tapping its marker. Tap a destination to move, or use an advance button.
3. **Stack UI.**
   - Show the troop count on every marker.
   - Offer split buttons: quarter, half, all.
   - Drag one stack onto another to merge.
   - Long-press on mobile opens the same menu.
4. **Border tracking for scale.** The example's frontier scan looks at every plot in a square around the stack, which is fine. What does not scale to 5 million plots is anything that loops over the whole map each tick. Keep per-nation border sets up to date in `claim()`.
5. Send the path to the owner's client so it can draw the path dots (`ov_path_dot`).

## Done when

- All 8 tests pass.
- Two players on the test map can spawn, split, move and advance, and both see the same borders.
- Taking a neighbour's land costs clearly more than empty land.
- Surrounded pockets are absorbed automatically.

## Pitfalls

- **Capture must be done by the server.** The client only shows it.
- **Ties at spawn time.** Two players clicking close spots in the same tick. The second spawn is simply refused and gets a clear error, which the example already does.
- **Pathfinding cost.** A* over millions of plots can be slow for long orders.
  - The example caps the search at 60,000 nodes.
  - For the Earth map, add hierarchical pathfinding: a coarse grid of 32 by 32 regions, path region to region, then refine inside each region.

## Thoughts

- OpenFront's appeal comes from how quickly the land moves. Stacks slow that down on purpose, so the advance order is what brings the flow back.
- Players should be able to send one big stack to advance and watch it eat the front.
- Consider an order that repeats: advance, then return home when below a threshold. That is what people will want on a long-running world.
