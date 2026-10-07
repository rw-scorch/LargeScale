# Milestone 11: engineers and terrain engineering

Written 8 October 2026, after milestone ten. Ryan asked to keep going until the project is done, so this plan is my reading of the design, for him to correct.

## What the design already says

- **Nothing is truly impassable**, only very slow (`reference/HANDOVER.md`).
- **Terrain has hit points**, not a timer, so several players can chip at a plot, stop and come back.
- **Only engineers dig**, and it costs gold as well as time. Charges are bought with gold or simply carried; they are not a produced resource.
- **Pace.** A mountain plot falls in about a minute of work, or seconds with charges.
- **Rubble.** Destroyed rock becomes rubble, which is still slow. Whoever owns the plot can clear it.
- **Nothing is permanent.** Materials rebuild what was destroyed, and rebuilding costs no more than destroying.
- **Digging in enemy land** needs a war, and the defender is warned while it happens. Nearby enemies never interrupt the work.
- **Building terrain up.** Engineers also make causeways, embankments, levelled ground and replanted forest. Player-built terrain can be destroyed by the same rules.
- **Bridges and roads** fall far faster than rock.
- **Breaches by accident.** Nukes and heavy bombardment can open a route by accident.
- **Tunnels** are a slower project that leaves the mountain standing, with an entrance at each end.
- **Damaged terrain is drawn**, not just counted.
- The kit's piece 19 (`reference/tasks/19-terrain-engineering`) has an example module, `engineering.js`, with hit points by terrain class, dig jobs, charges and build recipes. It is not in `src/sim` yet; it comes in as the base, the way the other kit modules did.

## My reading, for Ryan to correct

1. **Engineers are a troop type**, trained at the war camp or barracks like any other, after a new Medieval node, Sappers.
   - Every 10 engineer troops is one engineer soldier, as with any type.
   - Engineers fight weakly.
2. **A dig is an order on a plot, not on a company.**
   - Every engineer within 1 plot of the target works on it: 1 hit point a second each, at most 5 to a plot.
   - So a full team takes a mountain plot (300 hit points) in a minute, as the design says.
   - A charge costs 200 gold and does 150 damage at once. It needs one engineer beside the plot, so two charges open a mountain plot in seconds.
3. **Hit points by class, from the kit:** rock 300, hard 180, soft 90, made 40.
   - Rock (mountains, cliffs, canyons) becomes rubble.
   - Hard ground (hills, highlands, boulders) becomes scree, and scree becomes rubble.
   - Forest, jungle and swamp become cleared land.
   - A road or bridge on the plot goes first, at 40 hit points.
   - Digging through a cliff opens what was impassable.
4. **Building up** is the `terraform` order, paid in gold when the work starts. The work goes at 1 point a second per engineer, at most 5.
   - **Causeway:** shallows, swamp, marsh, bog, mudflat or mangrove becomes cleared land. On shallows it makes new land, which needs land beside it.
   - **Levelled ground:** hills, boulders, scree, badlands, rocky desert or rubble becomes plains.
   - **Embankment:** plains, grassland, meadow or cleared land becomes hills, which defend better.
   - **Replant forest:** cleared land, grassland, plains or scrub becomes forest.
   - **Clear rubble:** rubble, crater or scorched ground becomes cleared land. Only the owner can do this.
   - **Restore:** a dug plot goes back to what the map had there, for no more gold than it took to dig it.
5. **Tunnels** (Industrial, a Tunnelling node).
   - Engineers dig a tunnel between two plots through hard or rock ground. It moves like a road, and the mountain stays.
   - A tunnel entrance building stands at each end.
6. **The engineering vehicle** (Industrial, from the vehicle factory) works as 5 engineers wherever it stands.
7. **Accidents.**
   - Bombs and battleship shells damage the hit points of the terrain they hit, so heavy bombing can open a pass.
   - Nukes already turn their inner area into crater, which is passable.
8. **Bots do not dig.**

## The parts

### Part A: digging

- **Base module.** `src/sim/engineering.js`, from the kit's example, installed in `world.js`.
  - Hit points, jobs and charges.
  - Every change of terrain goes through `setTerrain`, so saving and the client's terrain edits already work.
  - A change that makes a plot passable or impassable marks the land route graph and the water graph to rebuild.
- **Content.** The `engineer` troop and the Sappers node.
- **Orders.**
  - `dig` on a plot, with `charge` to add a charge.
  - A `cancel` order.
- **Rules.** War is needed in foreign land. The owner is warned when work starts and again at half hit points (`terrain_dug`). Rules go in `rules.json` `engineering`.
- **Saving.** Damaged plots are saved as a row.
- **Client.**
  - Damaged plots and active jobs reach the client in the state feed and are drawn: `feat_rockfall`, `feat_landslide`, `feat_rubble_pass`, and `feat_demolition_charge` while a charge is set.
  - The ring offers Dig here and Set a charge when your engineers stand beside the plot.
  - A small card shows the plot's hit points and the time left at the current rate.

### Part B: building terrain up

- The `terraform` order, with the recipes above.
- Causeways onto shallows make new land, owned by the builder.
- Restoring uses the map's original terrain.
- Client: Build terrain in the ring, the recipes with their gold, and causeway sprites on causeway plots.

### Part C: tunnels and the engineering vehicle

- **Tunnels.**
  - A tunnel road kind, which only engineers can lay, through hard and rock ground.
  - The job digs from the end where engineers stand, plot by plot.
  - When it opens, a tunnel entrance building appears at each end.
- **The engineering vehicle**, a machine of the vehicle factory.

### Part D: accidents, and the checks

- Bomb and shell damage to terrain hit points.
- Smoke, UI, soak and bench additions.

## Evidence for each part

- Unit tests for each rule, and the content checks (sprites, the research tree, descriptions).
- `npm test`, the reference tests, smoke, `npm run ui` and the soak on a dev server. The UI run goes once per milestone, because it is heavy on Ryan's machine.
- `npm run bench` with jobs running for every player.
