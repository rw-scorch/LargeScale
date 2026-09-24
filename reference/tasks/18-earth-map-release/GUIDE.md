# Piece 18: Earth map and release

## Goal

Turn real world data into the game's map, then get a world running with your friends: balance, backups, and a map editor afterwards.

## Already decided

- The first finished version uses the Earth map.
- The map editor comes later.
- Terrain is pixel by pixel, one plot per map pixel.

## Depends on

Everything else. Build it last, but run the pipeline early so you know what the map feels like.

## Example code

`example/build_earth.py`, tested on real data with `test_build_earth.py`.

### Inputs

The pipeline reads shapefiles as well as GeoJSON, and can build a complete map with no elevation raster at all: sea depth comes from the Natural Earth bathymetry polygons, and land relief from the mountain, plateau and basin polygons plus the 711 named summit points. See `docs/map-data-sources.md` for every source and the fallbacks.


- **Land, lakes and rivers.** Natural Earth GeoJSON, public domain. The 110 metre files are bundled in `example/data/`. For release, download the 10 metre files from the same repository for much finer coastlines.
- **Elevation, optional but recommended.** ETOPO 2022 at 60 arc-seconds, or GEBCO. Any raster Pillow or `tifffile` can read, or a `.npy` array. Without it, the script invents a plausible elevation so you can test the pipeline.
- **Köppen climate, optional.** The Beck et al. raster with classes 1 to 30. With it, biomes are real. Without it, a latitude and coastal-distance model is used, which already puts the Sahara, the Amazon and the boreal forests in the right places.

### Output

| File | Contents |
| --- | --- |
| `terrain.bin` | one byte per plot, indexes into the terrain table |
| `elevation.bin` | 16-bit metres |
| `meta.json` | size, latitude range, projection, terrain names, land share, counts |
| `preview.png` | the map drawn with the summer palette |

`example/sample_output/` holds a 1,200 by 480 preview built from the bundled data.

### How it works

1. Equirectangular projection, cropped to 84 degrees north and 60 degrees south, which drops Antarctica and the worst polar stretching.
2. Land, lake and river polygons and lines are rasterised with Pillow, including polygon holes.
3. Water depth splits into deep ocean, ocean, shallows, and sea ice above 70 degrees.
4. Biomes come from Köppen, or from latitude plus coastal distance and noise.
5. Elevation then overrides with hills, highlands, mountains, high mountains and snow peaks, and ice sheets where it is high and far north.
6. Beaches go on the coast, lakes and rivers on top.

### Running it

The command is in `START_HERE.md`. Add `--width 3600` for the real map.

## Choosing the size

| Width | Plots | Metres per plot at equator | Notes |
| --- | --- | --- | --- |
| 1,800 | 1.3 million | 22 km | Small, fast, countries feel tiny |
| 3,600 | 5.2 million | 11 km | Recommended. About 63 MB of layers on the server |
| 7,200 | 20.7 million | 5.5 km | Too big for one Durable Object without splitting layers |

At 3,600 wide, a plot is 0.1 degrees. Away from the equator the east-west spacing shrinks, so around France a plot is about 11 km north to south and 8 km east to west. France then covers roughly 120 by 90 plots, about 6,000 land plots: enough for several city clusters, farms and a border to defend. A small country like New Zealand is about 2,500 land plots.

## Release checklist

1. **Map.** Build at 3,600 with real elevation. Check the coastlines at close zoom in the renderer, and that rivers are continuous enough to matter.
2. **Deposits.** Run piece 6's generator over the finished map and save the result with it. Consider hand-placing a few famous ones, for example oil in the Gulf and iron in Western Australia.
3. **Spawns.** Pre-pick 12 to 16 good spawn regions spread over the continents, and let players choose from them. A free-for-all click on the world map ends with everyone in Europe.
4. **Performance pass.**
   - Server: one tick under 50 ms with 8 nations, 40 bots, 200 stacks, 5,000 buildings.
   - Client: 30 fps on a mid-range phone at a busy city.
   - Network: under 30 KB per second per player during a battle.
5. **Save and restore drill.** Deploy a code change mid-world and confirm nothing is lost. Take a backup, wipe, restore.
6. **Balance pass with friends.** Play a short world (a weekend) on a smaller map first. Watch for:
   - a runaway leader by hour three
   - eras too fast or too slow
   - offline players being farmed
   - the market fixing every shortage too easily
7. **Rules of the world.** Decide the starting settings and write them in the invite: length, bots, nukes, faction size, whether night attacks are allowed.
8. **Map editor** afterwards: the same terrain format, a brush per terrain type, deposit placement, spawn markers, export to the same three files. Your earlier OpenFront map editor work is the obvious base.

## Done when

- The pipeline builds the full map in a few minutes and the preview looks like Earth.
- A world runs on it with friends for a weekend without a crash, a rollback or a runaway winner.

## Pitfalls

- 10 metre Natural Earth files are much larger. Rasterising them at 3,600 wide takes minutes and a lot of memory. Do it once and keep the output.
- The fallback climate model is a stand-in. Check it against a real biome map before release, or use the Köppen raster.
- Fresh water matters for gameplay. If rivers vanish at this resolution, thicken them to at least one plot wide, which the pipeline does by drawing lines.
- Keep the terrain file versioned and hashed. The client caches it, and a silent change would corrupt everyone's view.
