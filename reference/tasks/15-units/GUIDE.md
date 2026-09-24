# Piece 15: Units

## Goal

Individual machines on top of the troop counts:

- vehicles, ships and aircraft
- naval invasions and paratroopers
- mines

## Already decided

- Vehicles, aircraft and ships are individual units, not part of the troop number.
- Naval invasions and paratroopers exist.
- Explosive mines can be placed.

## Depends on

Piece 4 (combat) and piece 7 (supply and ports).

## Example code

`example/units.js` and 4 tests.

- **`UNIT_TYPES`.** 17 units across three domains, each with hit points, attack, defence, range, speed and sometimes capacity:
  - land: catapult, cannon, armoured car, early tank, field artillery, APC, main battle tank
  - sea: galley, cog, galleon, landing craft, destroyer, submarine, battleship
  - air: transport plane, early fighter, transport helicopter
- **Movement.** `unitCost` gives each domain its own map:
  - land units use terrain move costs
  - ships may only enter water, and never sea ice
  - aircraft fly straight, limited by range

  `orderUnit` pathfinds, and `stepUnits` moves everything.
- **Naval invasion.**
  - `embark(stack, ship)` loads troops from a stack standing next to a transport, up to its capacity.
  - `disembark(ship, plot)` lands on a coastal plot next to the ship:
    - 15 percent are lost in the landing, 5 percent for a landing craft, none into your own port
    - if the plot is enemy or unowned, the normal capture cost applies
    - too few troops means the landing fails entirely, with a `landing_failed` event
- **Paratroopers.**
  - `paradrop(plane, plot, troops, rng)` checks the aircraft type, its capacity and range, that the target is land, and that the nation has the troops.
  - 10 percent are lost on the drop, and a further 35 percent if a hostile SAM covers the target and the roll goes against you.
  - The drop arrives after a flight time, and `landParatroopers` then creates the stack and captures the plot.
- **Mines.**
  - `placeMine` allows your own land, or no-man's land touching your border.
  - `triggerMines` hits hostile stacks entering the plot for a quarter of their troops (up to 200), or 60 damage to a land vehicle, and consumes the mine.
  - `visibleMines` shows mines only to their owner and allies.

## Steps

1. **Production.** Units are built at buildings: barracks and stables for land, shipyards and naval docks for ships, airfields and hangars for aircraft. Building one costs money and materials and takes time, like construction in piece 8.
2. **Selection and orders.** Tap to select a unit or drag a box for several. Move, attack, patrol and load are the basic orders. Show range circles for artillery and aircraft.
3. **Units and stacks together.** Keep them separate objects, but let units in the same plot as a friendly stack add their attack and defence to piece 4's battle power. That way a tank column supports an advance without complicating the troop count.
4. **Ranged fire.** Artillery, warships and SAMs need a fire step: every few seconds, pick the best target in range, apply damage, and play `proj_shell` or `proj_missile` with `muzzle_flash` and `explosion_small`.
5. **Aircraft.** Missions rather than free movement works better on a big map: pick a target within range, the aircraft flies there, does its job (strike, transport, recon) and returns to base. Draw the shadow sprite offset from the aircraft, and grow the offset with altitude.
6. **Ports and embarking.** Loading a stack should be a two-tap action on mobile: tap the stack, tap the ship. The example's `embark` is exactly that rule.
7. **Submarines.** Use the `submarine_submerged` sprite for enemies who cannot see it, and reveal it when it fires.

## Done when

- The tests pass.
- A stack can be shipped across water and land on a hostile coast, with visible losses.
- Paratroopers can take an undefended plot behind the lines, and a SAM makes that risky.
- A mined border hurts the first enemy stack through it, and the mine is then gone.

## Pitfalls

- Aircraft that can be everywhere make land war pointless. Keep ranges short enough that airbases matter, and make aircraft expensive in fuel (piece 6 and 7).
- Landing rules decide how scary invasions are. The 15 percent loss plus capture cost means you cannot drop 50 troops onto a defended coast and win, which is right.
- Hidden mines annoy people if they are invisible forever. Give the victim a `mine` event and a crater mark, so they learn the border is mined.
- Check the domain on every order. A ship ordered inland should say "ships cannot go there", not silently fail.

## Thoughts

Because troops are a number, individual units are what give the late game texture: a tank column, a carrier group, a bomber wing. Keep their counts small, in the tens rather than hundreds, so each one feels like a piece on the board and the server stays light.
