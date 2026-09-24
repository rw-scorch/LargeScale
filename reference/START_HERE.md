# Start here

This kit holds everything produced so far for Large Scale, the persistent OpenFront-style nation and army game for you and up to seven friends. It has four parts:

| Part | What it is |
| --- | --- |
| `assets/` | The full sprite pack, version 2: 1,999 sprites, sheets, atlases, manifest, terrain palettes and the asset browser |
| `overview.png` | Every sprite family on one image |
| `TASK_SUMMARY.md` | The whole project on a few pages: decisions, the 18 pieces, order, status and open questions |
| `docs/` | Cross-cutting reference: design decisions, architecture, data formats, pacing |
| `tasks/01-...` to `tasks/19-...` | One folder per development piece, each with a `GUIDE.md` and an `example/` folder of working code |
| `shared/` | Small modules used by several examples: grid, seeded random numbers, heap, pathfinding, terrain table, test map |
| `project-template/` | A working skeleton of the real repository: server, client, simulation, data, tools and tests, laid out the way the game should be built |

## Reading order

1. `TASK_SUMMARY.md`, for the big picture.
2. `docs/design-decisions.md`, so you know what is locked in and why.
3. `docs/architecture.md`, before writing any code.
4. The piece you are working on: `tasks/NN-name/GUIDE.md`, then its `example/` folder.
5. `docs/data-formats.md` whenever you touch stats, saves or map files.
6. `docs/pacing-and-longevity.md` when you start thinking about how long a world should last.

The pieces are numbered in build order. Pieces 1 to 4 give you a playable land grab you can test with friends before anything else exists.

## What the example code is, and is not

Every example is real, runnable code, and every one has been run:

- 81 automated tests cover pieces 3 to 17 plus the shared modules.
- The piece 2 server passes an end-to-end smoke test under `wrangler dev`, including a full server restart.
- The piece 1 renderer and the piece 13 flag editor were run and checked in a browser.
- The piece 18 Earth pipeline was run on real Natural Earth data.

They are reference implementations. They show one clear way to do each piece, with the numbers written down, so you are never starting from a blank file. They are not the finished game:

- They favour clarity over speed in places.
- They keep each piece separate so it can be read alone.
- Each guide says what to change when scaling up to the Earth map.

Treat the tuning numbers (troop growth, prices, costs) as starting points for playtesting.

## Running things on Windows (PowerShell)

You need Node 22 or newer for the JavaScript, and Python 3 for the map pipeline and the sprite generator.

Run every test:

```powershell
cd path\to\large-scale-dev-kit
npm test
```

Open the browser demos. They use JavaScript modules, so they need a local web server rather than double-clicking the file:

```powershell
python -m http.server 8080
```

Then visit:

- `http://localhost:8080/` for the hub page
- `http://localhost:8080/assets/` for the asset browser
- `http://localhost:8080/tasks/01-map-renderer/example/` for the renderer demo
- `http://localhost:8080/tasks/13-social/example/flag-editor.html` for the flag editor

Dragging the whole kit folder onto Netlify also works, and gives you the same pages online.

Run the multiplayer server locally:

```powershell
cd tasks\02-server-base\example
npm install
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
npx wrangler dev
```

In `.dev.vars`, set `INVITE_CODE` and `PEPPER`. Then open `http://localhost:8787` for the test client.

In a second window, run the smoke test, using the same invite code you put in `.dev.vars`:

```powershell
$env:INVITE = "the-invite-code-you-chose"
npm run smoke
```

Build the Earth map from the bundled Natural Earth data:

```powershell
cd tasks\18-earth-map-release\example
pip install numpy pillow scipy
python build_earth.py --land data\ne_110m_land.geojson --lakes data\ne_110m_lakes.geojson --rivers data\ne_110m_rivers_lake_centerlines.geojson --width 1200
```

Regenerate the sprites after editing the generator:

```powershell
cd assets\generator
pip install pillow numpy
$env:OUT = ".."
python build.py
```

## A note on the art

These sprites were generated from code as a consistent starting set. You said you would make or source the art yourself, so treat them as placeholders that already follow every rule your art must follow:

- 16 px per plot
- magenta team colour
- facings
- rise
- lots
- lights

If you replace a sprite and keep its id and size rules, nothing else changes. `assets/README.md` lists the rules.
