# Milestone one: the land grab

Goal: friends log in, pick a spawn on the real map, take land by hand-moved stacks, fight each other and bots, chat, log off and come back to the same world. Nothing from pieces 5 to 19 yet.

## Decisions Ryan still has to make

Ask these before the step they affect. Do not guess.

| # | Question | Affects | Suggested default |
| --- | --- | --- | --- |
| 1 | Is this plan agreed, or does he want changes? | everything | none |
| 2 | First playtest map: a region crop such as Europe, the full Earth, or both as options? | step 1 | build both, playtest on a crop first |
| 3 | How many bots on the full Earth, and how many on a crop? | steps 3 and 4 | 200 to 400 on Earth, scaled by land area on crops |
| 4 | Cloudflare plan: free or paid? | tick rate, how long a world stays awake | ask |
| 5 | Should the offline minus 10 percent production rule apply to troop growth now? | step 4 | defence rule now, production rule with the economy |

## Measurements at handoff

These came from loading the real map into `src/sim/territory.js` with 200 bots and 8 players; `npm run bench` reproduces them.

| Measurement | Value |
| --- | --- |
| median tick | about 4 ms |
| worst tick | 761 to 951 ms, on every bot think tick (every 5 s) |
| cause | `bestLaunchPlot` in `bots.js` scans all 5,184,000 plots once per bot |
| process memory | about 80 MB, within a Durable Object's 128 MB |
| raw join payload | 5.2 MB terrain plus 10.4 MB owner data |
| `terrain.bin` gzipped | 244 KB |
| owner layer as value runs | about 4,000 to 5,300 runs, so a few KB run-length encoded |
| land plots | 1,554,650 |

## Steps

Build steps 1 to 3 together first, since the client depends on the protocol and on the simulation staying fast.

### 1. Server loads the real map

- On world creation, the World object reads `map/terrain.bin` and `map/meta.json` through `env.ASSETS`. Bundling the file as a data module is the fallback, if the assets binding is not reachable from the object.
- Each world stores its own terrain copy in SQLite chunks (layer `terrain`, same 128 chunk scheme as `owner`), because terrain changes later through engineering and nukes. `load()` rebuilds from those chunks.
- World config accepts a map choice: `earth`, or a crop given as a lat/long box, cut from the Earth grid at creation. Store the crop in `info` so reloads match.
- Keep `makeTestMap` available for tests and a `test` map option.
- **Done when:** a world created on `earth` survives `wrangler dev` restart with identical terrain and owner layers, and the smoke test passes on both `test` and a crop.

### 2. Join protocol

- The client fetches `/map/terrain.bin` as a static file, which is cacheable and compressed by Cloudflare. It gets only the world's terrain differences from the base map over the socket.
- The owner snapshot is sent run-length encoded, split into frames that stay well under 1 MiB.
- Live updates stay as the existing `DIFF` frames.
- Every frame carries a protocol version. The client refuses a mismatch with a clear reload message.
- Reconnect resumes cleanly, reusing the existing account-to-nation mapping.
- **Done when:** a join on the Earth map transfers under 1 MB over the socket (measure it and report the number), and the smoke test checks the decoded owner layer equals the server's.

### 3. Simulation at Earth scale

- Keep a border set per nation: owned plots with at least one non-owned land neighbour, updated in `claim()`. Use it in `bestLaunchPlot` and anywhere else that scans the grid.
- Spread bot thinking across ticks, a slice of bots per tick, instead of all bots on one tick.
- Pathfinding for long moves: raise the cap, or run a coarse pre-pass on a downsampled grid, then plan fine paths near the stack. It must return within the tick budget, or run over several ticks.
- Check `fillEnclaves`, `frontier` and `findEngagements` under load with many stacks.
- Throttle event volume: one `plot_lost` per nation per tick is enough for notifications.
- **Done when:** `npm run bench -- --bots <agreed count> --players 8` passes with the worst tick under 50 ms, and all existing tests still pass.

### 4. Wire combat and bots into `world.js`

- Install `installCombat` and `installBots` in `load()`, with bots spawned once at world creation according to the agreed count.
- Bots never attack players by default (`attackPlayers: false`), but players can attack bots.
- Offline defence: a nation with no connected socket has `defenceMult` 0.95.
- Victory check through `checkVictory`, with an event and a notification.
- Stack messages beyond `stack`, `move` and `advance`:
  - `split`, `merge` and `disband`
  - `route`, which returns path length and travel time without committing (round 2, question 44)
- Every message is validated on the server: the owner, the ranges, and a rate limit.
- **Done when:** new unit tests cover each message, and the smoke test shows a battle between two players' stacks resolving and territory changing hands.

### 5. The real client

- Move `reference/tasks/01-map-renderer/example/atlas.js` and `renderer.js` into `public/js/render/`, and adapt them rather than rewriting.
- Territory overlay in 256 by 256 chunk canvases, so a change repaints one chunk.
- Camera:
  - pan and zoom with pointer events and `touch-action: none`
  - zoom from the whole Earth to 16 px per plot
  - device pixel ratio capped at 2
  - resizes with the window
- Screens:
  - login and register with invite code
  - world list, create world with map choice, join
- In game:
  - spawn picker
  - stack markers with counts
  - select a stack, then split, merge, move and advance
  - a route preview line with travel time before confirming
  - nation list with plots and troops
  - chat
  - connection status
- Landscape on mobile, full featured. One-handed use is not required.
- No fog of war. Every stack and count is visible to everyone.
- **Done when:** headless Chromium (Playwright) runs a scripted session of login, create world, spawn, advance and chat. Show the screenshots, and report frame times at world view and at 16 px per plot.

### 6. Ryan's check

- Ryan deploys with `npx wrangler deploy`, registers `rw_scorch`, and plays one test world with one friend.
- Fix what they report before calling the milestone done.

## Out of scope for milestone one

Civilians, resources, logistics, construction, tech tree, market, diplomacy beyond the default hostility, units, nukes, atmosphere, engineering, the tutorial and the map editor.
