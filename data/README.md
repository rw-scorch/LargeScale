Stat files loaded by the server at world start, and editable through the dev panel.

- buildings.json   every building: era, footprint, cost, time, next step, jobs, housing, storage
- units.json       every unit: domain, hit points, attack, defence, range, speed, capacity, cost
- terrain.json     the terrain table, in the same order as the sprite pack palettes
- techtree.json    the upgrade trees (a Tribal and Medieval tree is already here)
- rules.json       tuning constants: territory, combat, civilians, supply, market, landings

The formats are described in the development kit under docs/data-formats.md.

Effects a tech node can give, and what reads them: research (research points), troop_cap (troop cap), wood_rate and food_rate (producer output of that good), pop_growth (civilian growth), defence (capture cost against the nation). Any other name does nothing.
