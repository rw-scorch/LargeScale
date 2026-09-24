# Piece 1: Map renderer

## Goal

Draw the world in the browser at every zoom level, from the whole Earth down to single buildings, fast enough on a phone. This includes:

- terrain, pixel by pixel
- territory colours and borders
- lots, roads, decorations, buildings, units and stack markers
- night lights

The renderer only draws. It never decides game outcomes.

## Already decided

- Terrain is always pixel by pixel, one map pixel per plot, coloured from palettes.
- Sprites are 16 px per plot at native zoom. The view is straight top-down with a slight tilt.
- The same UI works on mobile, in landscape.
- The asset pack rules apply:
  - magenta team colour
  - `rise` for tall sprites
  - `lot` tiles under buildings
  - `_lights` overlays for night
  - three facings for people

## Depends on

Nothing. Build it alongside piece 2 using a generated test map.

## Example code

`example/` is a working demo. Serve the kit folder (`python -m http.server 8080`) and open `http://localhost:8080/tasks/01-map-renderer/example/`.

- `atlas.js` loads the sprite sheets from `assets/data.js`. It swaps the three magenta keys for a nation colour (full, 70 percent, 45 percent brightness) and caches one tinted copy per sheet per colour. `draw()` places a sprite by its top-left corner at a whole-pixel position, optionally flipped.
- `renderer.js` is the renderer:
  - `rebuildTerrain()` writes one pixel per plot into an offscreen canvas. The shade is picked from a stable hash of the plot position, so the pattern never flickers.
  - `rebuildTerritory()` writes two overlay canvases. One is fill plus thick borders, for zoomed out. The other is a light fill only, for zoomed in, where borders are drawn as thin lines instead.
  - `updatePlots(list)` repaints only changed plots and their neighbours.
  - `render()` picks a mode from the zoom.
- `demo.js` builds a 320 by 200 world:
  - two nations and four bots, using the piece 3 and 4 code
  - a modern city and a medieval city, each with roads and lots
  - farms, walking soldiers in east and south facings, a tank, a ship, a jet with its shadow, and two stack markers
- `index.html` has the HUD: seasons, night, jump to each city, zoom buttons, drag to pan, and wheel or pinch zoom.

## How drawing works

1. **Camera.** `{x, y, scale}`, where `x` and `y` are the plot at the screen centre and `scale` is screen pixels per plot. `plotToScreen` and `screenToPlot` convert. `zoomAt` keeps the point under the cursor fixed, so zooming feels anchored.
2. **Terrain and territory.** These are drawn with one `drawImage` each under a scale transform, with image smoothing off. That is a single draw call for millions of plots, which is why the world view is fast.
3. **Mode by zoom.**
   - Below 3 px per plot, only capitals show as icons.
   - From 3 to 10 px per plot, 8 by 8 map icons show per building. Small buildings are thinned out so the map does not turn to noise.
   - From 10 px per plot, the full sprite layer draws.
4. **Sprite layer order.**
   1. Ground: lot tiles, then roads.
   2. Territory borders as lines.
   3. Everything standing, sorted by the bottom row of its footprint and then by x: decorations, buildings, ground units.
   4. Aircraft on top.
   5. Stack markers with troop counts.
   Sorting by bottom row is what makes tall buildings overlap the plots behind them correctly. A building is drawn at `plotY * scale - rise * scale / 16`.
5. **Lots.**
   - Every plot under a building with a `lot` value remembers the lot type.
   - The tile is `lot_<type>_<mask>`, where the mask comes from neighbouring plots with the same lot type (N=1, E=2, S=4, W=8).
   - Neighbouring buildings with the same lot join up automatically.
6. **Roads.** Same mask idea, from the road layer: `road_<kind>_<mask>` or `rail_<mask>`.
7. **Night.**
   1. After everything is drawn, fill the whole canvas with `rgba(12,18,52,0.62)`.
   2. Then draw each building's `_lights` sprite on top, untinted.
   3. Zoomed out, draw a small warm square per lit building instead, which gives the city-lights look from far away.
   The same fill amount, scaled down, gives dusk and dawn. See piece 17.

## Steps for the real game

1. Copy `atlas.js` and `renderer.js` into `client/src/render/`.
2. Split the territory overlay into 256 by 256 chunk canvases for the Earth map. A change then repaints one chunk, not the whole 5-million-plot canvas.
3. Replace the demo state with the live client state from piece 2: terrain frame, owner frame, diffs.
4. Add overlays from the pack:
   - selection corners
   - placement ghosts (`ov_ghost_valid`, `ov_ghost_invalid`)
   - path dots, attack arrows, rally flags
   - zone tiles
   - fog of war (`weather_war_fog`)
5. Add hit-testing: screen point to plot, then the building or stack at that plot.
6. Cap device pixel ratio at 2 and resize the canvas with the window.
7. Measure frame time on your slowest phone at 32 px per plot over a dense city. If it drops below 30 fps, cache static sprites per chunk into canvases and only redraw moving things each frame.

## Assets used

| Group | Sprites |
| --- | --- |
| Terrain | `assets/terrain/palettes.json` |
| Buildings | every building family |
| Ground | `lot_*`, `road_*`, `rail_*` |
| Decorations | `deco_*` |
| Units and markers | units, `army_*` markers, `*_shadow` for aircraft |
| Map icons | `mapicon_*` |
| Night | `*_lights` |

## Done when

- The whole map draws at 60 fps on desktop, and at 30 fps or more on a mid-range phone, at every zoom.
- Zooming keeps the point under the finger or cursor still.
- Territory changes from the server appear without a full repaint.
- Tall buildings overlap correctly, lots join up, and roads pick the right joins.
- Night mode matches the asset browser's Night preview.
- Team colours match each nation.

## Pitfalls

- Never draw with image smoothing on. Pixel art turns to mush.
- Round sprite positions to whole pixels, or seams appear between lot tiles.
- Do not rebuild the terrain canvas on every frame. Only rebuild it on season change, or blend seasons with a second canvas and `globalAlpha`.
- Touch pan must use `pointer` events with `touch-action: none` on the canvas, or the page scrolls instead.

## Thoughts

The zoom thresholds (3 and 10) are the most important feel settings in the renderer, so try a few values with real players. For a strategy game, a mid-zoom that shows icons plus roads may be where people spend most of their time, so it deserves as much polish as the close-up view.
