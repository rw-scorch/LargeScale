# Map data sources

What to download, what to do when a download will not open, and what the pipeline does with each file.

## Coastlines, lakes and rivers: Natural Earth 1:10m

Public domain, and the highest detail Natural Earth publishes.

- Browse: https://www.naturalearthdata.com/downloads/10m-physical-vectors/
- Whole physical set as one zip, which is what you already have: the "Download all 10m physical themes" link on that page
- GeoJSON copies, no conversion needed: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson

The pipeline reads **both shapefiles and GeoJSON**, so the zip works as downloaded. Layers it uses:

| Layer | Used for |
| --- | --- |
| `ne_10m_land` | the coastline |
| `ne_10m_lakes` | lakes |
| `ne_10m_rivers_lake_centerlines` | rivers |
| `ne_10m_bathymetry_*` | sea depth, deepest polygon wins |
| `ne_10m_glaciated_areas` | ice sheets and glaciers |
| `ne_10m_reefs` | coral reefs |
| `ne_10m_playas` | salt flats |
| `ne_10m_geography_regions_polys` | mountain ranges, plateaus, basins and deserts |
| `ne_10m_geography_regions_elevation_points` | 711 named summits with heights |

## Elevation: three ways, in order of preference

**1. No raster at all.** The bathymetry polygons give real sea depth, and the region polygons plus summit points give a believable land surface with the Andes, Rockies, Alps, Himalaya and Tibetan plateau in the right places. This is what `--regions` and `--peaks` do, and it is enough to play on.

**2. ETOPO 2022, if the GeoTIFF will not open.** The GeoTIFF from the portal is sometimes served in a way browsers mangle. Alternatives:

- NetCDF instead of GeoTIFF, which the pipeline now reads directly: the 30 and 60 arc-second global files under https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/ — take a `..._surface.nc` from the `30s` or `60s` folder. Ice Surface, not Bedrock, so Greenland reads as ice.
- Product page with all the download routes and the interactive grid extract: https://www.ncei.noaa.gov/products/etopo-global-relief-model
- If a download stalls, right-click and save rather than opening in the browser, or use `curl -O` from a terminal, which avoids the browser rewriting the file.

**3. GEBCO**, a good substitute at the same job: https://www.gebco.net/data_and_products/gridded_bathymetry_data/ — the global grid comes as NetCDF, which the pipeline reads.

Pass any of them with `--elevation path.nc` or `--elevation path.tif`. A `.npy` array also works.

## Climate: Köppen-Geiger, optional but a real upgrade

Beck et al. 2018, 1 km Köppen-Geiger maps, free:

- Data: https://figshare.com/articles/dataset/Present_and_future_K_ppen-Geiger_climate_classification_maps_at_1-km_resolution/6396959
- Paper: https://www.nature.com/articles/sdata2018214

The maps are GeoTIFFs of unsigned 8-bit integers with a `legend.txt` linking the numbers to the climate symbols, and they come at three resolutions: about 1 km, 10 km and 50 km. **Take the 10 km version** (0.083 degrees). At 3,600 plots wide a plot is 0.1 degrees, so the 1 km file is far more detail than the map can hold, and much slower to load.

Pass it with `--koppen Beck_KG_V1_present_0p083.tif`. The pipeline maps the 30 classes onto the game's terrain types, which replaces the estimated biomes with real ones. Two details the code already handles: the file is a palette image whose pixel values are the class numbers, so it must be read as indexes rather than converted to greyscale, and it must be sampled nearest-neighbour, since averaging class numbers is meaningless. Any raster covering the whole globe is also cropped to the map's latitude range before it is resized, so it lines up with the coastline.

The class numbers follow `legend.txt`: 1 to 3 tropical, 4 to 7 arid, 8 to 16 temperate, 17 to 28 cold, 29 tundra, 30 frost. The game maps them to jungle, savanna, desert, steppe, scrub, grassland, forest, pine forest, tundra and glacier.

## Building the map from the zip you have

```powershell
python tools/build_earth.py `
  --land data/map/ne_10m_land.shp `
  --lakes data/map/ne_10m_lakes.shp `
  --rivers data/map/ne_10m_rivers_lake_centerlines.shp `
  --bathymetry data/map `
  --glaciers data/map/ne_10m_glaciated_areas.shp `
  --reefs data/map/ne_10m_reefs.shp `
  --playas data/map/ne_10m_playas.shp `
  --regions data/map/ne_10m_geography_regions_polys.shp `
  --peaks data/map/ne_10m_geography_regions_elevation_points.shp `
  --width 3600 --out public/map
```

Add `--elevation` and `--koppen` when you have them. The build needs `pip install numpy pillow scipy pyshp`, plus `h5py` only if you use a NetCDF elevation file.

## The fine map for region worlds

Region maps such as Europe use a second base map at 0.05 degrees, 7200 by 2880 plots. It was built on 24 September 2026 from all the Natural Earth layers above, as GeoJSON, plus the 1 km Köppen file `Beck_KG_V1_present_0p0083.tif`, since the 10 km file is coarser than a fine plot. There is no elevation raster, as with the normal map.

Put the files in `data/map/`, then:

```powershell
npm run map:fine
```

That takes about 90 seconds and writes `public/map/fine/terrain.bin.gz` (about 634 KB) and `public/map/fine/meta.json`. Only those two are served. The raw 20.7 MB grid and the 41 MB elevation grid stay in `data/map/fine`, because Cloudflare refuses static files over 25 MiB and the game does not read elevation.

Rebuilding the normal 3600-wide map with the same sources and the 10 km Köppen file reproduces the shipped `terrain.bin` to within 670 of 5,184,000 plots.
