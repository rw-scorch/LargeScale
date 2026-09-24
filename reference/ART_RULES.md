# Large Scale sprite pack

3,444 pixel sprites for the Large Scale strategy game, generated from code so every sprite shares one palette, one scale and one look.

Open `index.html` to browse everything. It works straight from the folder, or drop the whole folder onto Netlify.

## Folder layout

| Path | What it holds |
| --- | --- |
| `index.html`, `data.js` | Asset browser: search, zoom, team colour, ground backdrops, per-sprite details |
| `sprites/<category>/<group>/<id>.png` | Every sprite as its own PNG at native size |
| `sprites/lots/` | Ground tiles that go under buildings |
| `sheets/<category>.png` | One packed sheet per category |
| `sheets/<category>.json` | Atlas for that sheet: `frames[id] = {x, y, w, h}` |
| `manifest.json` | Every sprite with category, group, era, footprint, state, frame, tags, notes, file and sheet position |
| `terrain/palettes.json` | Terrain colours: 5 seasons, 39 terrain types, 5 shades each |
| `terrain/sample_map_<season>.png` | Example pixel map drawn with those palettes |
| `terrain/palette_swatches.png` | All palettes as one image |
| `generator/` | The Python source that makes the whole pack |
| `DESIGN_QUESTIONS.md` | Every design question round with the answers, and the open round |
| `ASSET_BACKLOG.md` | Sprites still to make, in priority order |

## Conventions

**Scale.** One map plot is 16 x 16 px. Buildings fill whole plots: 1x1 is 16 px, 2x2 is 32 px, 3x3 is 48 px. The `footprint` field in the manifest gives size in plots.

**View.** Straight top-down with a slight tilt, so roofs and front walls both show. Light comes from the top left. Buildings carry a 1 px shadow down and right.

**Tall sprites.** Towers, chimneys, spires and similar sprites are taller than their footprint. The extra height sits above the footprint and is stored as `rise` in the manifest. Draw a sprite at `(plotX * 16, plotY * 16 - rise)`. Draw sprites in order of their footprint's bottom row, top of the map first, so a tower in front covers what is behind it.

**Lots.** Buildings no longer carry baked-in lawn, sand, snow or water. They sit straight on the world terrain, so they match every biome and season. Man-made ground is separate. A building with a `lot` value (`paving`, `asphalt`, `gravel` or `dirt`) expects those tiles under its footprint:

- Draw `lot_<type>_<mask>` on each plot the building covers, using the same neighbour masks as roads.
- Neighbouring buildings with the same lot type join into one continuous surface.
- Paving and asphalt get a kerb on open sides. Gravel and dirt fade into the terrain on open sides.
- The lot tiles are in the `lots` category, and you can use them on their own for plazas, yards and car parks.

**Team colour.** Three reserved magenta shades mark team colour:

| Key | Use |
| --- | --- |
| `#ff00ff` | Main team colour |
| `#c000c0` | Team shade |
| `#800080` | Team dark and outlines |

Swap these exact values for each nation's colours when loading a sheet. The browser page does this live, so check `sheetFor()` in `index.html` for a working example. Sprites tagged `team` contain these keys.

**Facing.** Units, vehicles, aircraft, ships and projectiles face east. Flip horizontally for west. Rotate vehicles, aircraft and ships freely. Infantry is side-on, so flip only.

**Building states.** Most buildings have four sprites:

- `<id>`, the active building
- `<id>_construction`
- `<id>_damaged`
- `<id>_rubble`

Ground-only sites like fields, quarries, parks and parking lots have one sprite.

**Night.** Buildings with windows, signs, fires or beacons have a `<id>_lights` sprite. At night:

1. Tint the whole world toward dark blue. The browser uses `pixel * 0.38 + #0c1234 * 0.62`.
2. Draw the `_lights` sprites on top, untinted, at the same position as the building.

This works for any terrain and season, and a dusk fade is just a smaller tint amount. Lights only match the active state, so skip them for construction, damaged and rubble. Tick Night in the browser to preview it.

**Infantry, cavalry and civilians.** These have three facings, named `<id>_<facing>_<frame>`:

- `e` faces east. Flip it for west.
- `s` faces south, toward the camera.
- `n` faces north, away from the camera.

Pick the facing closest to the direction of movement. The death frame `<id>_dead` is shared by all facings.

**Animation frames.**

| Sprite type | Frames |
| --- | --- |
| Infantry and cavalry | `_idle`, `_walk1`, `_walk2`, `_attack` per facing, plus `_dead` |
| Civilians | `_idle`, `_walk1`, `_walk2` |
| Effects | Numbered: `_0`, `_1`... |
| Crops | Growth stages `_0` to `_3` |
| Helicopters | `_rotor1`, `_rotor2` for spinning blades |
| Wind turbine | `wind_turbine`, `_1`, `_2` for spinning blades |

**Aircraft shadows.** Each aircraft has a `_shadow` silhouette. Draw it offset down and right, and grow the offset with altitude.

**Autotiles.** Roads, rail and walls join to their neighbours. The name lists which sides connect, from N, E, S and W, for example `road_paved_NES`. An isolated piece ends in `_dot`. To pick a tile, add up the neighbour bits:

| Neighbour | Bit |
| --- | --- |
| North | 1 |
| East | 2 |
| South | 4 |
| West | 8 |

Each piece also carries a matching tag in the manifest, such as `mask5` for north plus south.

**Stretchable frames.** Sprites named `frame_*` are 9-slice panels with 4 px borders. Tech tree nodes and the minimap frame use 6 px borders. Stretch the centre, keep the corners.

**Army stack markers.** `army_<era>_<state>` has states `idle`, `selected`, `moving` and `fighting`. The troop count is not baked in, so draw it as text beside the marker.

**Zoomed-out view.** The `mapicons` category holds 8 x 8 icons for world-map zoom, when full sprites are too small to read.

**Terrain.** Terrain is not tiles. Colour each map pixel from `terrain/palettes.json`, choosing one of the five shades with noise so large areas are not flat. Blend between seasons by interpolating shades. Decorations like trees and rocks live in the `terrain` category, with seasonal versions where it matters.


## Terrain features and chokepoints

The `features` category holds the things that make ground slow, and the edges that shape where armies can go.

**Edge tiles.** `cliff_*`, `canyon_rim_*`, `riverbank_*` and `ice_shelf_*` are drawn on the high side of a boundary. The mask names the sides that drop away, using the same letters as roads, so `cliff_SE` has a drop to the south and east. Fifteen masks each: a plot with no drop needs no tile.

**Line tiles.** `ridge_*`, `ravine_*` and `crevasse_*` connect along a line like a road, sixteen masks each. Use them for mountain spines, gullies and glacier cracks that armies must go around or cross at one point.

**Rough ground.** `feat_*` sprites sit on a single plot and mark what the terrain costs: boulder fields, scree, landslides, bogs, thickets, bamboo, quicksand, tar pits, dunes, ice ridges and more. Each carries a note in the manifest saying what it does to movement, for example "slow, blocks vehicles". `feat_pass_marker`, `feat_ford_marker`, `feat_stepping_stones`, `feat_mountain_path` and `feat_cave_entrance` mark the ways through.

**Crossings.** `pontoon_bridge_h/v`, `causeway_h/v`, `rope_bridge_h/v`, `cable_line_h/v` and `pipeline_mountain_h/v` are laid in a line across an obstacle. `road_mountain_*` is a sixteen-mask road set with rocky edges for switchbacks over a range.

**New terrain types.** Twelve types were added to the palettes for slow ground: badlands, canyon, escarpment, bog, thicket, bamboo, rocky desert, boulders, scree, ice field, mudflat and highland pass. They are appended to the end of the terrain list so existing saved maps keep their indexes. Suggested movement, defence and fertility values are in `terrain/terrain_gameplay_additions.json`.

**Movement overlays.** `ov_slow_ground`, `ov_rough_ground`, `ov_impassable`, `ov_fast_route`, `ov_defence_bonus`, `ov_chokepoint`, `ov_no_fly` and `ov_supply_reach` are tileable translucent overlays for showing the cost of ground on the map. `mapicon_pass`, `mapicon_ford`, `mapicon_bridge_point`, `mapicon_tunnel`, `mapicon_strait`, `mapicon_cliff` and `mapicon_ridge_icon` mark chokepoints at world zoom.

## Missile and air defence

Sites are in the `military` category, group `air_defence`:

| Era | Sprites |
| --- | --- |
| Industrial | `aa_gun`, `flak_tower`, `searchlight`, `listening_post`, `balloon_winch` |
| Modern | `radar_early_warning`, `radar_phased_array`, `sam_battery`, `sam_heavy`, `abm_silo`, `abm_silo_open`, `ciws_turret`, `aa_bunker`, `air_defence_command`, `decoy_site`, `reload_depot` |
| Future | `laser_turret`, `laser_battery`, `shield_node`, `interceptor_pad` |

Mobile versions are in `vehicles`, group `air_defence`: `aa_halftrack`, `spaag`, `radar_truck`, `abm_launcher_truck`, `laser_vehicle`.

Effects and overlays:

- Projectiles: `proj_interceptor`, `proj_sam_missile`, `proj_flak_shell`, `proj_ballistic_missile`, `proj_laser_beam`
- Frames: `flak_burst_0..2`, `intercept_burst_0..2`, `launch_smoke_0..2`, `missile_trail_0..2`, `shield_impact_0..2`, `radar_sweep_0..3`
- Overlays: `ov_radar_coverage`, `ov_sam_coverage`, `ov_shield_coverage`, `ov_missile_track`, `ov_intercept_point`, `ov_incoming_target`, `ov_shield_dome`
- Icons: `alert_missile_incoming`, `alert_intercepted`, `ui_air_defence`, `ui_coverage`, `ui_intercept`, `ui_silo`, `mapicon_air_defence`

`abm_silo_open` is the launch state of `abm_silo`, so swap sprites while a silo is firing.

## Mountain and pass buildings

`mountain_gate`, `pass_fort`, `mountain_watchpost`, `border_checkpoint`, `cable_car_station`, `ferry_landing` and `stairs_cliff`. These exist so a pass can be closed, watched, taxed or crossed, which is what makes a chokepoint worth holding.


## Reload states, abandoned vehicles and demolition

**Spent launchers.** `sam_battery_empty`, `sam_heavy_empty`, `abm_silo_empty` and `shield_node_offline` are the out-of-ammo looks: tubes empty, hatches dark, crates waiting. Swap to them while a site reloads, and back when it is ready.

**Abandoned vehicles.** Every land vehicle has an `<id>_abandoned` version, drained of team colour and dulled. Use it when a crew dismounts and leaves the vehicle behind, so it can be walked back to, re-crewed or captured. `ov_parked_vehicle` marks one on the map.

**Engineers.** `sapper` (Medieval), `demolition_team` (Industrial) and `tunneller` (Industrial) are full infantry sets with all three facings and the usual frames. Their attack frame is a satchel charge or a drill.

**Terrain destruction.** `feat_demolition_charge`, `feat_breach` (a blasted gap through rock), `feat_blasted_rock`, `feat_rubble_pass`, `feat_bomb_craters` and `feat_tunnel_dig`, plus `charge_blast_0..2` for the explosion and `ov_charge_placed` and `ov_terrain_target` for the interface.

**Coverage borders.** `ov_defence_border_*`, `ov_shield_border_*` and `ov_blast_ring_*` are fifteen-mask edge tiles that outline an area rather than filling it, for the defence-borders view. `ov_coverage_2` and `ov_coverage_3` are denser fills for two and three overlapping defences, so stacked cover reads at a glance. `ov_blast_fill` shades the area a warhead will hit.

**Extra interface.** `ui_defence_borders`, `ui_overlays`, `ui_ammo`, `ui_reload`, `ui_countermeasures`, `ui_stealth`, `ui_demolish_terrain`, `ui_blast_radius`, and `bar_ammo`, `bar_shield` and `bar_charge` fills. `chaff_flare_0..2` and `shield_down_0..2` cover countermeasures and a shield collapsing.


## Variety pass

**Building variants.** Thirty-six common buildings now have two extra looks each, `<id>_b` and `<id>_c`, with different roof and wall materials and full damage states. Pick one per plot from a hash of its position and a city stops looking like one house copied a hundred times.

**More soldiers.** Twelve new infantry types fill out the eras: slinger and hunter, crossbowman, man at arms and halberdier, line infantry and skirmisher, stormtrooper and flamethrower, heavy gunner, anti-tank team, scout, officer, drone operator and power armour. All have three facings and the usual frames.

**More civilians.** Builder, docker, fisher, herder, shopkeeper, scientist, nurse, teacher, priest and refugee.

**Animals.** `deco_herd_*` and `deco_flock_*` for cattle, sheep, goats, camels, reindeer, horses, pigs, chickens, elephants, wolves, fish and birds.

**Wrecks.** Every vehicle and ship has a `_wreck` version, burnt out and holed, for battlefields and sunken coasts.

**Wonders.** Stone circle, hanging gardens, triumphal arch, great exhibition, observatory and launch complex, one more per era.

**Ports, rail and airports.** Dry dock, container gantry, grain terminal, fuel farm, engine shed, signal box, marshalling yard, jet bridge, cargo apron and fishing harbour.

**Shoreline.** `coast_foam_*` and `river_edge_*` are fifteen-mask edge tiles, drawn on the water plot and the land plot respectively. They do more for how the map reads than anything else in this pass.

**Weapon effects.** Arrow volleys, cannon smoke, tracer fire, rocket salvos, laser lances, plasma bursts and shell splashes, three frames each, plus impact frames for dirt, stone, water, snow and sand.

**Orders and zones.** Selection frames for 1x1, 2x2 and 3x3 footprints, order arrows in eight directions for move, attack, patrol and retreat, and zone tiles in early, middle and modern looks for all four zones.

**Interface.** Map mode icons, toast frames in four severities, touch hint glyphs, rank badges, scoreboard icons and tech node frames in each branch colour and state.

**Flag parts.** Thirty-two stamps for the flag editor: bands, crosses, saltires, cantons, quarters, chevrons, and emblems from stars and crescents to gears, crowns, wheat and birds. They are drawn in white so the editor can recolour them.

## Regenerating

Needs Python 3 with Pillow and NumPy. In PowerShell:

```powershell
pip install pillow numpy
cd generator
$env:OUT = ".."
python build.py
```

This rewrites `sprites`, `sheets`, `terrain`, `manifest.json` and `data.js`. It leaves `index.html`, this README and `generator` alone.

To edit things, change these files:

| File | What it controls |
| --- | --- |
| `specs_a.py`, `specs_b.py`, `specs_c.py` | Building designs, one line each. Add `up=N` to make one N px taller |
| `bldg.py` | Roofs, walls, windows, decorations and night lights |
| `lots.py` | Lot ground tiles |
| `people.py` | Infantry and civilians |
| `vehicles.py` | Vehicles, aircraft and ships |
| `fx.py` | Effects and overlays |
| `ui.py` | Interface pieces |
| `terrain.py` | Palettes, decorations and deposits |
| `core.py` | Shared colour list, starting with `P` |

The output is the same every run, so a change only affects what you touched.
