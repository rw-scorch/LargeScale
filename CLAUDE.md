# Large Scale

Browser strategy game for Ryan and up to seven friends. One persistent world on a real Earth map, running for days or weeks. Territory is taken pixel by pixel like OpenFront, and troops are a number moved by hand as stacks. Cloudflare Worker plus one Durable Object per world, WebSockets, SQLite inside each object. No other services.

Planning is finished. The job now is building the real game, one milestone at a time. The current milestone is in `plans/milestone-1.md`.

## Which document wins

When two documents disagree, the one higher in this list wins:

1. `reference/HANDOVER.md`: the whole project state, and the latest decisions.
2. `reference/DESIGN_QUESTIONS.md`: all 182 answered questions. Round 4 is the newest. Its header still says round 4 is open; that is stale.
3. `reference/docs/design-decisions.md`
4. Everything else in `reference/`. `reference/TASK_SUMMARY.md` is out of date on the market: it is now a board of player listings with no world price, not an automatic market.

Known contradictions to ignore:

- `reference/tasks/01-map-renderer/GUIDE.md` lists a fog-of-war overlay. There is no fog of war; everything is visible to everyone.
- The same guide says to put the renderer in `client/src/render/`. Use `public/js/render/`.

## Commands

Ryan is on Windows with PowerShell. Give him commands in PowerShell form.

```powershell
npm install
npm test                  # simulation, Discord and integration tests (10)
npm run test:reference    # the kit's 95 example tests, kept green as a regression check
npm run bench             # Earth-scale tick benchmark, fails if the worst tick is over 50 ms
npm run dev               # wrangler dev on http://localhost:8787
$env:INVITE = "code-from-.dev.vars"; npm run smoke   # end to end, needs npm run dev running
```

`npm run bench` takes `-- --bots 400 --players 8 --ticks 80 --budget 50`. Local secrets go in `.dev.vars` (copy `.dev.vars.example`, set `INVITE_CODE` and `PEPPER`).

## Layout

```
src/index.js       Worker: routes, static files, websocket handover
src/directory.js   Directory object: accounts, sessions, worlds, members
src/world.js       World object: one per world. Sockets, tick loop, saving, catch-up
src/sim/           the simulation, 21 modules, plain JavaScript
src/shared/        the only code both server and client import
public/            the client. public/map and public/assets are generated, not committed
data/              stat files. Tuning numbers live in data/rules.json
tools/             build_earth.py, bench_earth.mjs, one-off scripts
test/              node --test unit tests plus smoke.mjs
reference/         the dev kit: docs, 19 piece guides with example code, handover, question record
plans/             milestone plans
```

## Rules

1. `src/sim/` never imports anything from Cloudflare. That keeps tests fast in plain Node, and lets the client reuse the code.
2. `src/shared/` is the only code crossing between server and client.
3. Generated files are not committed: `public/map/`, `public/assets/`, `.wrangler/`, `.dev.vars`.
4. Never edit or remove the `migrations` block in `wrangler.jsonc`. A class rename needs a new migration entry. Deleting a class deletes its saved worlds.
5. Tuning constants go in `data/rules.json`, never as numbers typed into the simulation.
6. New systems are one module in `src/sim/`, installed once in `world.js`. New message types are a validated case in `world.js`. Panels are one file each in `public/js/ui/`.
7. Content is data, with one registry per kind of thing, append-only ids and versioned formats. Mods come later as data packs.
8. No hyper-management. Prefer bulk actions, standing orders, automatic resupply and one list of everything idle.

## The code in `src/sim/` is the base

The modules in `src/sim/` are the tested kit examples, identical apart from import paths. Build on them; do not rewrite them from scratch. Change them where scale or the design requires it, and keep their tests passing. `reference/tasks/NN-*/GUIDE.md` explains each one and says what to change for the Earth map.

## How Ryan works

- **Comments.** Few inline code comments. Explain the code separately in chat, in plain language.
- **Style.** No emojis. Direct answers, no padding.
- **Push back.** Say so when something he asks for is a bad idea.
- **Evidence.** Test what you build and show the actual output: test counts, benchmark numbers, screenshots. Do not say something "should work".
- **Pace.** Agree a plan before writing large amounts of code. Work one milestone step at a time.
- **Git.** Commit in small steps with clear messages.

## State at handoff (24 September 2026)

- **Tests and smoke.** All tests pass: 10 in `test/`, 95 in `reference/`. The smoke test passes 17 of 17 under `wrangler dev`, but on the 320 by 200 test map.
- **Deploy.** Not deployed. The Cloudflare account had no Workers.
- **Admin.** `ADMIN_NAMES` is `rw_scorch`. Ryan registers that name right after the first deploy.
- **Deploy commands.** Ryan deploys himself: `npx wrangler login`, `npx wrangler secret put INVITE_CODE`, `npx wrangler secret put PEPPER`, `npx wrangler deploy`. The first deploy creates both Durable Object classes.
- **Map.** The Earth map is already in `public/map/`: `terrain.bin` (3600 by 1440 bytes), `elevation.bin` (Int16) and `meta.json`. The terrain indexes match `src/shared/terrain.js`.

Problems found, which milestone one fixes (details in `plans/milestone-1.md`):

1. `world.js` wires territory and chat only. Combat and bots are not installed, despite what the handover says.
2. `world.js` loads `makeTestMap`, not the Earth map.
3. Join sends raw terrain plus raw owner data, which is 15.5 MB on the Earth map.
4. The bot think tick scans the whole grid once per bot. `npm run bench` currently fails: the worst tick is about 760 to 950 ms against a 50 ms budget.
5. `orderMove` caps pathfinding at 60,000 nodes, too few for long moves on Earth.
