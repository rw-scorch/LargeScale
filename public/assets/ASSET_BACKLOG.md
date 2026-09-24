# Asset backlog

Done since this list was written: building variants, twelve infantry types, ten civilian roles, animals, vehicle and ship wrecks, six wonders, ten port and rail buildings, coastline foam, river edges, weapon effects, surface impacts, order and selection overlays, zone tiles per era, map mode icons, toasts, touch hints, rank badges, tech node frames and flag parts. Fog of war art is no longer needed, since the map is fully visible.

What the pack still needs, in rough order of when the game will need it. Counts are estimates of new sprites. Everything here can be generated the same way as the rest: add a spec or a drawer, run `generator/build.py`.

## Tier 1: needed as soon as the game is playable

| Item | Est. | Notes |
| --- | --- | --- |
| Damaged, construction and rubble states for the new defence and mountain buildings | ~90 | The state machine already exists; these were generated for the older buildings only where `states=True` |
| Night lights for the new sites | ~25 | Radar, command, checkpoints and gates should glow at night like the rest |
| Selection and order overlays per footprint size | ~20 | Ring and corner marks for 1x1, 2x2 and 3x3, plus a drag-rectangle frame |
| Stack marker counts and health | ~12 | Small chips: full, weakened, out of supply, retreating, entrenched |
| Fog of war edges | 16 | Autotile so explored edges fade rather than ending in a hard square |
| Coastline foam | 16 | Autotile along the land and water boundary, one of the biggest wins for how the map reads |
| River autotiles with bends and mouths | 24 | Rivers are terrain pixels now; proper bends, confluences and deltas would look far better |
| Road junction extras | 12 | Roundabouts, level crossings where road meets rail, road ends at a port or gate |
| Zone tint tiles per era | 12 | Residential, commercial, industrial and farm, in a Tribal, Medieval and Modern look |
| Progress and health bars in more sizes | 8 | For buildings of 1, 2 and 3 plots wide |

## Tier 2: unit variety

The pack has one or two units per role. A long world needs a visible ladder inside each era.

| Item | Est. | Notes |
| --- | --- | --- |
| Infantry per era, second and third types | ~150 | Skirmisher, heavy, elite and engineer for each era, all three facings and five frames |
| Mounted and towed variants | ~60 | Camel and elephant riders, ox-drawn guns, horse-drawn supply, all three facings |
| Vehicle families | ~80 | Light, medium and heavy of each era, plus wrecked versions for battlefields |
| Turret rotation frames | ~120 | Eight facings for tanks, artillery, ships and turrets, so units point where they shoot |
| Ship families | ~60 | Transport, escort and capital ships per era, plus sails-down and damaged states |
| Aircraft | ~50 | Per era fighter, bomber, transport and recon, plus banking frames and afterburner |
| Unit wrecks and debris | ~30 | Burnt tanks, sunk hulls with masts, aircraft craters |
| Civilians at work | ~40 | Farmers by crop stage, miners, dockers, builders on scaffolds, market crowds |
| Animals | ~25 | Herds by biome: cattle, sheep, goats, camels, reindeer, fish shoals, birds over coasts |

## Tier 3: buildings the design implies but the pack lacks

| Item | Est. | Notes |
| --- | --- | --- |
| Second and third looks per building type | ~120 | So a city is not ten copies of one house. Two or three variants per civilian building, chosen by a hash of the plot |
| Regional building styles | ~150 | European, Middle Eastern, East Asian, African and Latin American looks for the civilian chains, picked by map region |
| Wonders | ~20 | Only five exist. One per era at least, each 3x3 with a build-in-progress version |
| Rail yards and depots | ~15 | Marshalling yard, engine shed, signal box, freight platform |
| Airport pieces | ~20 | Terminal gates, control tower variants, radar, fuel farm, cargo apron, hangars per era |
| Port pieces | ~20 | Dry dock, container gantry, grain silo, fishing fleet dock, naval pens |
| Power and pipes | ~15 | Substations, pylon autotiles, pumping stations, desalination |
| Farming detail | ~30 | Orchards by fruit, rice terraces, greenhouses, irrigation channels, windbreaks |
| Defensive lines | ~40 | Trench autotiles with firing bays, dragon's teeth, bunkers per era, wire belts, pillboxes |

## Tier 4: effects and feedback

| Item | Est. | Notes |
| --- | --- | --- |
| Weapon effects per era | ~60 | Arrow volleys, cannon smoke, machine gun tracer, rocket salvo, laser lance |
| Impact by surface | ~24 | Dirt, stone, water, snow and sand splash frames |
| Fire spreading and burnt-out states | ~20 | Buildings that burn for a while and leave a mark |
| Weather extras | ~30 | Hail, dust devils, heat shimmer, wind direction streaks, storm fronts at world zoom |
| Season transitions | ~20 | Leaf fall, snow build-up on roofs, spring bloom on trees |
| Capture and revolt feedback | ~15 | Flag change animation, plot flipping shimmer, rally markers |
| Nuke aftermath | ~15 | Blast ring frames at world zoom, scorched building variants, fallout-free but scarred ground |

## Tier 5: interface art

| Item | Est. | Notes |
| --- | --- | --- |
| Full panel set | ~60 | Build menu, research tree, market, diplomacy, faction, chat, settings, all as nine-slice frames with headers and tabs |
| Mobile controls | ~30 | Radial menu segments, drag handles, swipe hints, bottom sheet grips, safe-area padding frames |
| Scoreboard and world log | ~20 | Rank rows, era badges, nation cards with flags, event icons for the log |
| Tech tree art | ~40 | Node frames per branch, connector lines, branch headers, era dividers |
| Map modes | ~20 | Political, terrain, resources, supply, danger and weather mode icons and legends |
| Tutorial and hints | ~25 | Pointer hands, highlight rings, step cards, keyboard and touch hint glyphs |
| Notifications | ~20 | Toasts by severity, countdown chips for war notices and missile flight |
| Loading and empty states | ~10 | Loading screen art, empty market, no alerts, disconnected |
| Branding | ~10 | Logo lockups, favicon set, social preview image, in-game splash |

## Tier 6: identity and personalisation

| Item | Est. | Notes |
| --- | --- | --- |
| Flag builder parts | ~80 | Bands, crosses, cantons, stars, crescents, animals and emblems the editor can stamp |
| Heraldry for factions | ~40 | Banner shapes, borders and charges, so a faction has a look of its own |
| Nation avatars | ~30 | Small leader portraits or crest frames for chat and diplomacy |
| Unit insignia | ~20 | Division marks to put on stack markers |
| Colour-blind safe palettes | ~10 | A second nation palette set checked for deuteranopia and protanopia |

## Tier 7: the map editor and tools

| Item | Est. | Notes |
| --- | --- | --- |
| Editor UI | ~40 | Brush sizes, terrain palette swatches, deposit stamps, spawn markers, region tool, undo stack |
| Editor overlays | ~15 | Grid, latitude lines, distance ruler, symmetry guides |
| Terrain brush previews | ~41 | One swatch per terrain type at brush size |
| Validation marks | ~10 | Unreachable land, spawn too close, no fresh water nearby |

## Things to decide before generating

1. **How many variants per civilian building?** Two is enough to break repetition. Three is noticeably better in dense cities and costs 50 percent more sprites.
2. **Regional styles: worth it?** They are the single biggest visual upgrade for an Earth map, and also the biggest batch of work here.
3. **Eight-way turrets or four?** Four facings plus flipping gives six looks for half the sprites. Eight looks much better for tanks and ships.
4. **Wrecks: permanent or fading?** Permanent wrecks tell the story of a front, but they add clutter and another state per unit.
5. **Portraits at all?** They make chat and diplomacy feel personal, but they are the hardest thing to generate procedurally and the most likely to need hand-drawing.
