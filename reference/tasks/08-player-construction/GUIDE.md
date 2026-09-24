# Piece 8: Player construction

## Goal

You place the buildings civilians do not: government, military, infrastructure, ports and producers. They go through construction. Then you upgrade them in bulk through the menu you described.

## Already decided

- The player places government, military and infrastructure buildings.
- No automatic visual upgrade for player buildings. Instead, a bulk upgrade menu:
  1. open the menu
  2. sort to the lowest upgraded version
  3. swipe-select all
  4. upgrade in bulk, instantly, paid from treasury and stockpile
- Civilian buildings also appear in the same menu, with a civilian-only filter.

## Depends on

Piece 5 (civilian buildings in the menu) and piece 7 (materials delivered to sites).

## Example code

`example/construction.js` and 5 tests.

- **`PLAYER_BUILDINGS`.** Upgrade chains:
  - civic: `chieftain_hut`, `great_hall`, `town_hall`, `parliament`
  - military: `watchtower_wood`, `tower_stone`, `tower_concrete`
  - storage: `storage_yard`, `warehouse`, `logistics_depot`
  - ports: `jetty`, `harbour`, `port_commercial`
  - also `barracks` and `offshore_rig`

  Each entry has an era, a footprint, a cost, a build time, the next step and an optional placement rule.
- **`canPlace(world, nation, type, anchor)`.** Returns `null` or a plain reason:
  - "era locked"
  - "off the map"
  - "something is already there" (checks civilian buildings too)
  - "not your land"
  - "cannot build on water"
  - "terrain too rough"
  - "must sit on the coast": the footprint must mix owned land and water
  - "must sit in shallow water" and "too far from your coast", for rigs within 3 plots of your land
- **`place`.** Pays the full cost up front from money and stock, then creates a construction site. `progressConstruction` finishes it after its build time.
- **`listUpgradable(world, nation, {filter, category})`.** Lists active buildings with a next step, sorted by level in their chain (lowest first), then era, chain and id. `filter` is `all`, `civilian` or `player`.
- **`selectRange(rows, from, to)`.** What a swipe produces: every row between the finger-down row and the finger-up row, in either direction.
- **`bulkUpgrade(world, nation, picks)`.** Upgrades each pick in list order, so the lowest go first.
  - Each upgrade checks the era, that the bigger footprint fits, and money.
  - The price is the next step's cost × 1.5, the instant premium. Missing materials are bought at 4 money each, then the premium is applied.
  - It returns `done`, `skipped` with a reason each, and `spent`.
  - It stops cleanly when money runs out, rather than refusing the whole batch.

## Steps

1. **Build menu.**
   - Tabs by category, using the `upg_civilian`, `upg_government`, `upg_military` and `build_*` icons.
   - Only list buildings unlocked by research (piece 9).
   - Show cost and build time.
   - Grey out items that cannot be afforded, and say why.
2. **Placement ghost.**
   - While choosing a spot, draw the sprite at 50 percent opacity with `ov_ghost_valid` or `ov_ghost_invalid` on each footprint plot.
   - Show `canPlace`'s reason next to the cursor.
   - The client runs the same `canPlace` for instant feedback, and the server runs it again for the truth.
3. **Construction.**
   - Draw sites with the `_construction` sprite and a progress bar (`bar_frame` and `bar_yellow`).
   - With piece 7, change `place` so the site creates a node with `want` set to its materials, and only progresses while materials are delivered.
   - Pay money up front, and materials as they arrive.
4. **Bulk upgrade menu.**
   - A scrolling list: sprite thumbnail, name, level badge (`era_badge_<era>`), next step, cost.
   - A sort toggle (`upg_sort`), a filter (`upg_filter`) and a civilian toggle.
   - A swipe gesture across rows highlights them (`upg_swipe`), and "Select all" (`upg_select_all`) covers the rest.
   - The total cost updates live, and one button upgrades everything selected.
   - Afterwards, a summary shows done and skipped with reasons.
5. **Demolish** (`build_demolish`). Refund 50 percent, and leave a `_rubble` sprite for a while.
6. **Damage.** Buildings take damage from combat, artillery and nukes, showing the `_damaged` sprite. Repair costs a fraction of the build cost.

## Done when

- The tests pass.
- Every placement rule shows a readable reason.
- Swipe-selecting 20 watchtowers and upgrading them costs exactly 20 × 1.5 × the stone tower cost, done lowest first, with the rest explained if money runs out.
- Civilian houses can be upgraded from the same menu with the filter on.

## Pitfalls

- A footprint growing on upgrade (a 2 by 2 hall becoming a 3 by 3 parliament) can collide with neighbours. Always check the new footprint, and say "no room to grow" rather than failing silently.
- Keep one building registry in the real game. The example keeps player and civilian buildings in separate maps because they come from separate pieces. Merge them with a `civilian` flag when you combine the code.
- The bulk menu on a large nation can list thousands of rows. Group identical rows (same type and level) into one line with a count, and let a swipe take counts.

## Thoughts

The instant premium is what makes the bulk menu a decision rather than a chore:

- Pay 1.5 times to have it now.
- Or wait for civilians, who upgrade their own buildings for the normal cost and time.

You could make the premium a host setting.
