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

## Progress

Built 8 October 2026 on branch `m11-engineers`, stacked on `m10-future`.

- **Part A, digging.** `src/sim/engineering.js` is the kit's module, extended, installed by `installDigging` in `world.js`. The engineer troop (unit 59) comes with Sappers. Rules are in `rules.json` `engineering`.
- **Part B, building up.** Causeway, levelled ground, embankment, replant forest, clear rubble (owner only) and restore. A causeway onto water claims the new land for the builder.
- **Part C, tunnels and the engineering vehicle.** Tunnelling (Industrial) unlocks the engineering vehicle (unit 60, vehicle factory), which works as 5 engineers.
- **Part D, accidents.** Bombs take 30 hit points from each enemy plot they hit, and roads take half that. A battleship's shells take 2 a second from the plot under the company it is shelling. The bomb line in the feed counts broken ground and cut roads.

### Where the build differs from the plan

- **One order.** It is a single `dig` order with `op` dig, charge, build, tunnel or cancel, not a separate `terraform` order.
- **Charges go off at once.** A charge is drawn as a blast, so there is no sprite for a set charge.
- **No card.** A plot's hit points and the time left show in the hover tip.
- **Tunnel entrances are drawn, not built.**
  - A tunnel is a road kind (`tunnel`). It moves at 0.4 whatever the rock, and can be cut like any road.
  - The `tunnel_entrance` sprite marks each end.
  - It costs 150 gold a plot, paid at once, and 120 work points a plot. It is at most 40 plots long.
  - Both ends must be open land of your own. A tunnel under someone else's land needs a war, and they are warned.
- **Route graphs.** When digging or building changes what can be crossed, the land and water route graphs are dropped. That happens at most every 30 s (`graphEvery`), because rebuilding one on Earth takes 120 to 220 ms.
- **Found and fixed along the way.**
  - Cached rail paths checked one version that every road change bumped. Once bombs could cut roads, every station pair searched again constantly, and the Earth bench's median tick went from 33 ms to 80 ms.
  - Rail paths now have their own version (`log.railVer`), bumped only when a rail plot changes: 31 ms.

## Evidence

The machine was busy all day: Minecraft was running, CPU load was about 40%, and the dev server sometimes took up to 10 s to serve a static file.

- **Unit tests.** `npm test`: 369 of 369. `test/engineering.test.js` has 14 tests, and `test/industry.test.js` has a new rail cache test. `npm run test:reference`: 95 of 95.
- **Smoke.** Four runs.
  - **Engineering.** The new check passed in three of the four runs: Sappers, 5 engineers dig a hills plot (180 hit points, 36 s), a charge does 150 more, and it breaks into scree.
    - It failed once, before its diagnostics were added, and the cause is not known. It did not recur.
  - **Test races fixed.** Several older checks failed only because of timing in the tests themselves:
    - The far move could pick land across water. The company then went aboard a boat and vanished from the next three checks. This was the "vanished stack" from milestone ten's first smoke run.
    - The planner can now finish a whole block in the tick it is added, before the queue message is sent.
    - The road check's plots could be built on by the town before the road was laid.
  - **Last run.** 135 of 136. The one failure was the rate-limit check, which passed in the three runs before and fails when the server takes too long over each message.
- **UI.** Not complete.
  - Three runs were cut short when the dev server stalled and workerd dropped the worker. That resets every world to its last save (up to 30 s old), so research the test had just finished was lost and the siege workshop was refused.
  - The test now gives gold first, waits for locks and retries on "slow down", but the engineering check at the end was never reached.
  - It needs a run on an idle machine.
- **Soak.** 180 s, clean.
  - 280 rounds and 21 game minutes, with 0 tick errors.
  - Engineering orders: 37 digs, 8 builds, 4 charges and 1 tunnel succeeded.
  - At the end both players saw the same 28 worn plots, 5 jobs and 12 changed plots.
- **Bench.** Only short runs (240 ticks) were possible on the busy machine. Each player had crews that dig, charge and tunnel; there were 8 crews, 8 digs, 8 charges and 1 tunnel.

  | Engineering | Median tick | Worst tick | Engineering hook (median / worst) |
  |---|---|---|---|
  | On | 30.9 ms | 158.5 ms | 0.02 ms / 1.4 ms |
  | Off | 33.3 ms | 229.4 ms | none |

  Both fail the 50 ms worst-tick budget on this machine. The full run needs an idle machine.
