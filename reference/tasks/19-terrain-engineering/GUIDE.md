# Piece 19: Terrain engineering and city cores

## Goal

Two systems that came out of the third question round:

- **Terrain is destructible and buildable.** Nothing is permanently impassable. Engineers chip mountains down with work and explosives, and can build ground back up from materials.
- **City cores (CBDs) project strength.** The closer a fight is to a nation's core, the harder that nation hits and the harder it is to push in.

## Already decided

- Terrain has hit points, so several players can work on the same plot, stop, and come back later.
- Only engineer units do the work.
- It costs resources as well as time.
- Destroyed rock becomes rubble that is still slow, and rubble can be cleared.
- Nothing is permanent: materials can rebuild what was destroyed.
- You can dig inside enemy land, but only at war, and the defender is warned while the work runs.
- Engineers can also build terrain up, for example causeways and embankments.
- Bridges and roads go far faster than rock.
- Nukes and heavy bombardment can open a route by accident.
- Tunnels are a separate, slower project that leaves the mountain standing.
- Defence and attack both get stronger near a city core.

## Example code

`example/engineering.js`, `example/cbd.js` and 7 tests.

### Terrain hit points

- Terrain falls into four classes: rock (300 hp), hard (180), soft (90) and made things such as urban and rubble (40). At 6 hit points a second per engineer that is about a minute for a mountain plot, which is the pace decided in round four.
- `hpOf` returns the remaining hit points, and only damaged plots are stored, so an untouched map costs nothing to save.
- `damageState` gives intact, cracked, damaged or crumbling, which is what the renderer draws.

### Working

- `startJob(world, nation, plot, "dig", { engineers })` starts digging. Hand work is `digRate` (6 hp per second) per engineer, so two engineers need about two and a half minutes for a hillside and far longer for a mountain.
- `addCharge(job, nation)` costs 200 money and adds 150 damage on the next tick. Charges are bought rather than produced, and engineers are assumed to carry them.
- When the hit points run out the plot changes: rock becomes rubble, hard ground becomes scree, forest becomes cleared land.
- `canWork` refuses work in the land of someone you are not at war with, and refuses plots with no engineers nearby. Enemies standing nearby do not stop the work.
- Every tick emits `terrain_damaged`, which is how the defender gets warned before the plot falls.

### Building terrain back

`BUILD_RECIPES` are the reverse jobs, each with a source terrain, a result, a material cost and a work amount:

| Recipe | Turns | Into | Cost |
| --- | --- | --- | --- |
| `causeway` | swamp, marsh, bog, mudflat, shallows | cleared | 40 stone |
| `levelled_ground` | hills, boulders, scree, badlands, rubble | plains | 15 stone |
| `embankment` | plains, grassland, cleared | hills | 60 stone |
| `quarry_cut` | mountain, highlands | scree | 8 explosives |
| `reforest` | cleared, grassland | forest | 30 wood |

Work is paid for once the materials are present, so a job waits for its convoy rather than failing.

### City cores

- `setCentres` takes the nation's core buildings (town hall, parliament, CBD towers) with a value each.
- `strengthAt` is a falloff from 0.5 at the centre to 0 at the edge of the radius, which is 14 plots by default and scales with the centre's value.
- `defenceMultiplier` is `1 + strength`, and `attackMultiplier` is `1 + strength × 0.6`, so a nation fights best at home but the bonus favours defence.
- `installCombatHooks` wires both into capture cost, so pushing into someone's capital region costs far more than taking their frontier.

## Steps

1. **Terrain must now be saved.** Terrain used to be static map data cached by the client. Now it changes, so:
   - store it in chunks like ownership
   - send terrain diffs in the same frame format as ownership diffs
   - keep the map hash for the untouched base, and apply saved changes on load
2. **Engineer orders.** Select an engineer stack, tap a plot, pick dig, build or tunnel. Show the plot's hit points and the time left at the current rate.
3. **Warning.** A defender gets an alert the first time a plot of theirs is damaged, and again at half hit points. Mark the plot with `ov_terrain_target`.
4. **Draw the damage.** Use `damageState` to pick between the intact terrain, `feat_blasted_rock`, `feat_rubble_pass` and `feat_breach` as the work progresses.
5. **Bridges and roads** are separate, much quicker jobs: a few seconds of work and no explosives, using the made class.
6. **Tunnels** are a build job with a long work value that leaves the terrain alone and adds a tunnel link between two plots, drawn with the tunnel portal sprites.
7. **CBD centres** are recalculated when a core building is built or lost. Rebuild the field then, not every tick.
8. **Show the core.** Draw the CBD influence with `ov_defence_bonus` so an attacker can see where the ground gets hard, since the map has no fog.

## Balance thinking

- A mountain plot is about a minute of work, or two charges and a few seconds. Opening a whole pass is a job of several plots and several minutes, which keeps it a decision without making it a chore.
- Because charges cost money rather than a produced resource, the brake on demolition is simply your treasury.
- Because destroyed terrain can be rebuilt, a defender can close a breach again, which turns a mountain front into a back-and-forth rather than a one-time loss.

## Done when

- The tests pass.
- A player can blow a gap in a range, march through it, and the defender can rebuild it behind them.
- A defender sees warnings while the work is in progress.
- Fighting near a capital is visibly harder than fighting on the frontier.

## Pitfalls

- Terrain changes must go through one function, so the renderer, pathfinder and save all see the same thing.
- Cache invalidation: any cached path or supply field crossing a changed plot has to be recomputed.
- Watch for a player digging out their own mountains to farm rubble. Make rubble give little or nothing, with materials coming from quarries instead.
