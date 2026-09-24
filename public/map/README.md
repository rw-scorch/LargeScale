# Earth maps

Two base maps, both committed in compressed form. The server and the client only read the `.gz` files.

| File | What it is |
| --- | --- |
| `terrain.bin.gz` | 3600 x 1440 plots at 0.1 degrees, one terrain index per plot, row by row from the north-west corner, gzipped (243 KB). The whole Earth uses it, and region worlds made before the fine map. |
| `meta.json` | size, latitude range (84 north to 60 south), projection, the terrain name list, land share and plot counts per terrain |
| `fine/terrain.bin.gz` | 7200 x 2880 plots at 0.05 degrees, gzipped (634 KB). Region worlds such as Europe use it. |
| `fine/meta.json` | the same for the fine map |

Not committed: the raw `terrain.bin` (5.2 MB), `elevation.bin` and `preview.png`. If a raw `terrain.bin` is present, the build step refreshes `terrain.bin.gz` from it when the two differ. The game does not read elevation.

Built from Natural Earth 1:10m physical vectors and the Beck et al. 2018 Köppen-Geiger climate map. Sources and rebuild commands are in `reference/docs/map-data-sources.md`.
