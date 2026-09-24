# Project layout

`project-template/` in this kit is a working skeleton of the real game repository. Copy it out, rename it, and start from there. It already runs: `npm test` passes three integration tests, and `npm run dev` plus `npm run smoke` passes all seventeen end-to-end checks, including a world surviving a server restart.

## The folders and why they are split that way

```
large-scale/
  wrangler.jsonc     Worker and Durable Object declaration
  package.json       dev, deploy, test, smoke, map
  src/               server only
    index.js         the Worker: routing, static files, websocket handover
    directory.js     Directory object: accounts, sessions, worlds, members
    world.js         World object: one per world
    auth.js          hashing, tokens, name rules
    sim/             the simulation, 21 modules, no Cloudflare imports
    shared/          used by both sides: grid, rng, heap, pathfinding, terrain, test map
  public/            browser only
    index.html
    js/render/       renderer
    js/ui/           panels
    assets/          the sprite pack, copied in, not committed
    map/             built map files, not committed
  data/              stat files, editable through the dev panel
  tools/             build_earth.py and other one-off scripts
  test/              node --test unit tests plus smoke.mjs
```

Three rules make the split worth having:

1. **`src/sim/` never imports Cloudflare.** It is plain JavaScript, so it runs under `node --test` in a second, and the client can run the same code to predict movement between server updates. Break this rule once and testing gets ten times slower.
2. **`src/shared/` is the only shared code.** If both sides need something, it goes there. Nothing else crosses.
3. **Generated things are not committed.** The sprite pack, the built map and `.wrangler` all stay out of git, which keeps the repository small and stops two copies of the art drifting apart.

## Where new work goes

| Adding | Goes in |
| --- | --- |
| A new system (piece 5 to 19) | a module in `src/sim/`, installed once in `world.js` |
| A new message type | a case in `world.js`, validated there |
| A new panel | `public/js/ui/`, one file per panel |
| A new building or unit | `data/buildings.json` or `data/units.json`, plus a sprite id |
| A new tuning constant | `data/rules.json`, never a number typed into the simulation |
| A one-off script | `tools/` |
| A Discord command | `src/discord.js` for the declaration, `src/index.js` for the handler |
| A new alert | `world.js`, through `this.notify(nation, kind, text)` |

## Deploying, and what Cloudflare creates for you

Durable Objects are never created by hand in a dashboard. They are declared in `wrangler.jsonc`:

```jsonc
"durable_objects": { "bindings": [
  { "name": "DIRECTORY", "class_name": "Directory" },
  { "name": "WORLD", "class_name": "World" }
]},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["Directory", "World"] }]
```

The first `wrangler deploy` creates both classes with SQLite storage. Each world becomes its own object the first time someone opens it, named by the world id, and the Directory is a single object named "directory".

Things worth knowing:

- **Keep the `migrations` block forever.** It is how Cloudflare tracks which classes exist. Removing or renaming it breaks every existing world.
- **Renaming a class needs a new migration entry**, with `renamed_classes`, not an edit to the old one.
- **Deleting a class deletes its storage.** There is no undo, so back worlds up first.
- **Deploys restart objects.** Connected players are dropped and reconnect, and anything not saved is lost, which is why the world saves every 30 seconds and when the last player leaves.
- **Local development uses the same code path.** `wrangler dev` runs the real runtime with local storage under `.wrangler`, so a world persists between restarts on your machine too.

## Who does what

I can write every file, including the deploy scripts and the configuration, and I can run the server locally to prove it works. I cannot deploy it: that needs your Cloudflare login, which lives on your machine. The deploy itself is four commands, listed in the template's README.
