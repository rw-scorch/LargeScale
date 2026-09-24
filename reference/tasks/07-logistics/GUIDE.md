# Piece 7: Logistics

## Goal

Goods physically exist somewhere and have to be carried:

- Roads and rail make carrying faster.
- Convoys can be caught.
- Armies need supply, and weaken the further they get from it.

## Already decided

- Goods move physically by road, rail and ship.
- Armies need supplies and weaken far from supply lines.
- Supplies move as stacks, like troops.

## Depends on

Piece 6 for things to carry. Piece 3 for territory and stacks.

## Example code

`example/logistics.js` and 5 tests.

- **Road layer.** `road`, one byte per plot, using `ROADS`:

  | Value | Road type | Cost multiplier |
  | --- | --- | --- |
  | 0 | none | 1 |
  | 1 | dirt | 0.6 |
  | 2 | cobble | 0.45 |
  | 3 | paved | 0.3 |
  | 4 | highway | 0.2 |
  | 5 | rail | 0.12 |

  The cost multiplier is applied on top of the terrain move cost.
- **`roadMask`.** Gives the exact sprite name for a road plot, for example `road_cobble_ES` or `rail_dot`.
- **Stockpile nodes.** `addNode(world, nation, plot)` creates a node with:
  - `stock`: what is there now
  - `keep`: what it will not give away
  - `want`: what it asks for

  In the real game, every storage building is a node, from storage yard to logistics depot, and so is every town hall and port.
- **Convoys.** `sendConvoy` loads cargo up to the era's capacity (10 in Tribal, 30 in Medieval, 150 in Industrial, 500 in the Future era) and pathfinds over your own and allied land. `stepConvoys` moves it along its path.
  - Arriving adds the cargo to the destination.
  - Entering hostile land destroys it, with a `convoy_lost` event.
- **`dispatch(world, nation)`.** Automatic trade within your nation. For each good, it sends from the nearest node with a surplus above `keep` to any node below `want`. It sends at most one convoy per good per destination at a time.
- **Supply.** Three functions work together:
  - `supplySources` lists nodes holding food, plus supply stacks still carrying supplies.
  - `supplyField` runs one multi-source shortest-path pass over your land and roads, giving each plot a supply distance.
  - `applySupply` gives stacks within range 18 a supply multiplier of 1. Beyond that, the multiplier falls to a minimum of 0.5, and troops slowly desert. Combat power from piece 4 multiplies by it.

## Steps

1. **Road building.** Add a `build_road` message:
   - the player drags a line
   - the server checks ownership and terrain, charges per plot and lays the road
   - roads become available per era: dirt in Tribal, cobble with the Medieval "Paved roads" node, paved in Industrial, highway in Modern
2. **Bridges.** Rivers need bridges to be crossed cheaply. Use the `bridge_<kind>_h` and `_v` sprites, and treat a bridged river plot as a road.
3. **Nodes.** Make every storage building a node. When piece 6 produces goods, put them in the nearest node by supply distance, not straight into a nation stock.
4. **Build sites.** Construction sites from piece 8 set `want` for their materials. `dispatch` then feeds them automatically, which is how "physical goods" feels in play without micromanagement.
5. **Supply stacks.** Let the player load food from a node into a stack, which becomes a stack of kind `supply` with a supplies count. It can be moved like troops. While it has supplies, it is a supply source where it stands, and it drains per troop it feeds.
6. **Visuals.**
   - Convoys use the `supply_<era>` markers or the vehicle sprites (`hand_cart`, `horse_wagon`, `supply_truck`, trains).
   - Draw faint supply lines (`ov_supply_dot`) from a selected stack to its nearest source.
7. **Performance.** Recompute each nation's supply field every few seconds, not every tick. Limit it to twice the supply range around the nation's stacks for the Earth map.

## Rail and sea

- **Rail** is a road type with the lowest cost, but only trains may use it. Convoys between two stations with rail between them become trains, with a much bigger capacity.
- **Sea routes.** Add a port-to-port leg: ships from piece 15 carry convoys between your ports over water, using the same pathfinding with water costs.

## Done when

- The tests pass.
- Building a road visibly speeds up deliveries.
- A construction site far from stock waits for its convoy.
- Cutting a road with an enemy stack starves the far side.
- A stack marching deep into enemy land weakens unless followed by a supply stack.

## Pitfalls

- Pathfinding for every convoy is expensive. Cache paths between node pairs and invalidate the cache when a road changes or territory flips.
- Do not let dispatch ping-pong goods between two nodes. The rule that `keep` is always at least `want` on the same node prevents it.
- Convoys lost to enemies should give the cargo to the capturer only if you want raiding to pay. That is a design choice, and the example simply destroys it.

## Thoughts

- Logistics is where a long-running world gets its depth: roads you built last week still matter.
- Keep the defaults automatic, and let players override with `want` and `keep` sliders on each storage building for those who enjoy it.
