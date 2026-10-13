# Map maker

Ryan asked for map making on 13 October 2026, after the player cap came off. The kit's notes set the shape: the map editor comes after release (`reference/docs/design-decisions.md`), custom maps are shareable as files (question 49), and the editor uses the same terrain format with a brush per terrain type (`reference/tasks/18-earth-map-release/GUIDE.md`, step 8).

## What is built

| Part | Where | What it does |
| --- | --- | --- |
| File format | `src/shared/mapfile.js` | One `.lsmap` file: gzip of `LSMAP`, a version byte, a JSON header (name, width, height, optional north and south latitudes) and one terrain index per plot. Reading checks the size, every terrain id, the latitudes and the land, and stops a file that unpacks past the plot limit. |
| Edit tools | `src/shared/mapedit.js` | Round brush, brush strokes as lines, scanline flood fill, an optional "only over land" or "only over water" limit, and undo and redo steps that store only the plots that changed. |
| Maker page | `public/maker.html`, `public/js/maker/` | Start from empty ocean, random islands (the test map generator) or a lat/long box of the Earth at fine or normal detail. Brush (B), fill (F), pick (I), move (H or hold space or the right button), size ([ and ]), zoom with the wheel, + and -, fit (0), Ctrl+Z, Ctrl+Y, Ctrl+S. Pinch to zoom on a phone. Status line with size, land share and the plot under the pointer. The map is kept as a draft in the browser. |
| Save and share | the maker | Save file downloads `name.lsmap`; Open file or dropping a file on the map reads one. |
| Publish | `POST /api/maps`, Directory `maps` table | Any account publishes; its maker can update or delete it, the host can delete any. Saved maps lists them all with the author. |
| Worlds | `src/worldconfig.js`, `src/world.js`, `public/js/ui/worlds.js` | The host picks a saved map in New world (`map: "custom:<id>"`). The world stores the base terrain in its own `base` row and serves it at `/api/worlds/<id>/terrain.bin.gz`, so the client joins the same way as on the Earth maps and a deleted saved map does not break the world. Deposits are generated from the drawn terrain; seasons follow the map's latitudes, or 45 degrees north without them. |

Limits (`maps` in `data/rules.json`): 64 to 2,000 plots a side, at most 4,000,000 plots, a name of up to 40 letters, at least 2,000 land plots, a file of at most 1.9 MB, 20 maps per account. Bots scale with land as on the Earth (up to 400).

## Not built yet

- Placing deposits by hand. They are generated from the terrain for now.
- Spawn markers.
- Elevation. The game does not read it.

## Evidence (13 October 2026)

- `npm test` 385 of 385, with 6 new tests in `test/mapmaker.test.js`. `npm run test:reference` 95 of 95.
- Smoke under `wrangler dev` on the test map: 147 of 147. New checks: a broken file and an all-sea map are refused; a friend publishes a 150 by 110 map (2,798 bytes) and the host sees it; the file downloads unchanged; someone else cannot overwrite it; the host makes a world from it; a missing map is refused; after its maker deletes the saved map the world still joins with terrain matching the drawn map; 198 deposit plots come from the drawn terrain; only saved-map worlds serve a base file.
- `npm run ui:maker`: 15 of 15. The palette has all 53 terrains; two brush strokes paint 24,700 plots as two undo steps; a water-only brush leaves the land alone; fill turns the sea to ocean in one step; four undos and a redo; an Earth box 11 W to 30 E, 35 to 60 N at fine detail is 820 by 500 with 240,882 land plots; Save file reads back the same map with its latitudes; Publish; the map is listed; a reload picks up the draft; the host makes a world from it and plays on 820 by 500; the page fits a phone held either way; no page errors.
