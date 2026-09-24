# Architecture

## The shape of the system

```
Browser (desktop or mobile)
  |  HTTPS: register, login, list/create/join worlds
  |  WebSocket: one per open world tab
  v
Cloudflare Worker (stateless router, serves the static client)
  |-- Directory Durable Object  (one, named "directory")
  |     accounts, sessions, worlds, members, login throttling
  '-- World Durable Object      (one per world, named by world id)
        the authoritative simulation, its SQLite save, all sockets for that world
```

The server is authoritative:

- Clients send intentions, for example "move stack 12 to plot 48211".
- The world validates them, simulates, and streams results back.
- Clients never decide outcomes. They only draw and predict for smoothness.

This is what makes cheating hard, and it keeps one copy of the truth.

## Why one Durable Object per world

A Durable Object is a single-threaded object with its own storage that lives in one place, which is exactly a game world. Everything that must be consistent (ownership, battles, the market) happens inside it with no locks. With 2 to 8 players, one world is far below the roughly 500 to 1,000 requests per second a single object handles.

The Directory is a single global object. Cloudflare's guidance warns against global singletons at scale, but with a group of friends logging in a few times a day it is not a bottleneck. If that ever changes, split it per account.

## Tick model

- **Two speeds.**
  - The world ticks every 250 ms while anyone is connected (setting `TICK_MS`).
  - Economy work (civilians, production, research) runs every 5 seconds of game time inside that tick.
  - Everything is written in per-second units and multiplied by `dt`, so changing the tick rate never changes game speed.
- **Loop only when needed.**
  - The loop is a `setInterval` started when the first socket connects and cleared when the last socket closes.
  - While it runs, the object is kept in memory and billed for duration.
  - When it stops, the object is idle, hibernatable and not billed, even with sockets still attached.
  - Do not use alarms for fast ticks, because each alarm counts as a billed request and a row write.
- **Catch-up on wake.**
  - When the world loads, it reads when it was last saved.
  - It fast-forwards the peaceful simulation in 60-second steps, capped by the host setting (72 hours by default).
  - The work is sliced by a time budget so one wake-up cannot hit the CPU limit (30 seconds per invocation by default, configurable up to 5 minutes).
  - See piece 12.
- **Determinism.**
  - Use the seeded random generator in `shared/rng.js` for anything that changes game state.
  - Never use `Math.random()` in the simulation.
  - This makes saves reproducible, lets you replay bugs, and lets the client predict.

## Message protocol

JSON for control messages, binary frames for map data. Binary frames start with a 4-byte header whose first byte is the frame type, so the typed array that follows is aligned.

| Direction | Message | Contents |
| --- | --- | --- |
| server to client | `hello` | your nation id, map size, nations, recent chat, seconds caught up |
| server to client | binary type 1 | terrain, `Uint8Array`, one byte per plot, sent once and cacheable |
| server to client | binary type 2 | full ownership, `Uint16Array` |
| server to client | binary type 3 | ownership diff, `Uint32Array` pairs of plot index and new owner |
| server to client | `state` | about once a second: nation summaries and stacks |
| server to client | `events` | battles, captures, eliminations, arrivals, alerts |
| server to client | `chat`, `joined`, `result`, `pong` | as named |
| client to server | `spawn` | x, y |
| client to server | `stack` | share of garrison (0.05 to 1), optional plot |
| client to server | `move` | stack id, target plot |
| client to server | `advance` | stack id |
| client to server | `chat` | text, channel, optional private target |
| client to server | `ping` | client time, for latency display |
| client to server | `admin` | admin-only operations, checked on the server |

Later pieces add their own messages in the same style: `zone`, `build`, `bulk_upgrade`, `research`, `market_buy`, `declare_war` and so on. Every message is validated as if it came from an attacker:

- check types and ranges
- check ownership, for example the stack belongs to the sender
- check the rule, for example the plot is buildable and the era is unlocked

For the Earth map, the terrain frame is about 5 MB. Send it compressed (gzip through `CompressionStream`) and have the client keep it in IndexedDB keyed by a map version, so it downloads once. Ownership compresses very well with run-length encoding.

## Persistence

SQLite inside the World object:

| Table | Holds |
| --- | --- |
| `meta` | key-value JSON: map info, world settings, nation and stack state, save time |
| `chunks` | map layers in square chunks: `layer`, `idx`, `data` BLOB |
| `chat` | recent chat lines |
| later | `buildings`, `units`, `market`, `diplomacy`, `audit` (stat edits) |

How map layers are stored:

- Map layers (ownership, buildings, zones, roads, deposits) live as chunks, and only dirty chunks are rewritten.
- The example uses 128 by 128 chunks (32 KB for a 16-bit layer).
- For the Earth map, 256 by 256 is a better fit: 128 KB per chunk, far under the 2 MB row limit, and fewer rows written per save.

When to save:

- every 30 seconds while running
- when the last player leaves
- on important events such as an elimination

Durable Objects give no shutdown hook, so never rely on saving at exit.

## Memory budget for the Earth map

A Durable Object has 128 MB. At 3,600 by 1,440 plots (5.18 million):

| Layer | Type | Size |
| --- | --- | --- |
| terrain | Uint8 | 5.2 MB |
| owner | Uint16 | 10.4 MB |
| building index | Int32 | 20.7 MB |
| zone | Uint8 | 5.2 MB |
| road | Uint8 | 5.2 MB |
| deposit type | Uint8 | 5.2 MB |
| deposit amount | sparse Map, deposit plots only | about 1 MB |
| forest wood | Uint16 instead of Float32 | 10.4 MB |
| total | | about 63 MB plus objects |

That fits, with room for nations, buildings, stacks and JavaScript overhead. The rules that keep it fitting:

- Use typed arrays, never arrays of objects per plot.
- Keep sparse things (deposit amounts, mines, lots) in `Map`s.
- Scan the whole map as rarely as possible. Keep per-nation sets of border plots and free zoned plots instead of looping over 5 million plots every tick.

The client holds the same layers plus canvases. A 3,600 by 1,440 canvas is fine on phones, but draw the territory overlay into chunked canvases (for example 256 by 256) so an update repaints only one chunk.

## Hosting cost, checked against Cloudflare's published pricing (September 2026)

Free plan:

- 100,000 Durable Object requests a day and 13,000 GB-s of duration a day.
- Incoming WebSocket messages count at 20 to 1. Outgoing messages are free.
- SQLite: 5 million rows read and 100,000 rows written a day, 5 GB stored.

Paid plan:

- A $5 monthly minimum.
- 1 million requests and 400,000 GB-s a month included.
- Then $0.15 per million requests and $12.50 per million GB-s.

Duration bills the full 128 MB, so a world running all day uses 86,400 s times 0.125 GB = 10,800 GB-s. What that means:

- **Development on the free plan.** One world awake around the clock fits the daily duration allowance. Messages are no problem: 8 players at 2 messages a second for 8 hours is about 460,000 messages, or 23,000 billed requests. Watch rows written. Saving 20 dirty chunks every 30 seconds is about 58,000 rows a day plus state rows, which is inside 100,000 but not by much. Save less often or use bigger chunks if you hit it.
- **Real worlds on the paid plan.** 400,000 GB-s is about 37 world-days of awake time a month, so one world awake all month is covered. Two such worlds would add about one million GB-s, around $12.50. Sleeping worlds cost nothing but storage.

## Client structure for the real project

```
client/
  index.html            shell, viewport, font loading
  src/net.js            socket, reconnect with backoff, message queue, binary frame decode
  src/state.js          client copy of world state, applies diffs and events
  src/render/           piece 1 renderer, split into terrain, territory, sprites, overlays, night
  src/ui/               panels: build, bulk upgrade, research, market, diplomacy, chat, flag editor, dev panel
  src/input.js          mouse, touch, pinch, long-press, keyboard shortcuts
  assets/               the sprite pack (sheets, atlases, palettes)
server/
  wrangler.jsonc
  src/index.js          Worker router
  src/directory.js      accounts and worlds
  src/world.js          World object: sockets, loop, save, message handlers
  src/sim/              pieces 3 to 17 as plain modules with no Cloudflare imports
  test/                 unit tests (node --test) and smoke tests (wrangler dev)
shared/                 code used by both sides: terrain table, rng, grid, protocol constants
data/                   stat files: terrain, buildings, units, techtree, combat, market
```

The most important rule is that the simulation (`server/src/sim/`) must not import anything from Cloudflare. That is how every example in this kit is tested with plain Node, and it lets the client run the same code for prediction.

## Security

- **Passwords.** PBKDF2 with SHA-256 at 100,000 iterations, a random 16-byte salt per account, and a server-side pepper stored as a secret.
  - 100,000 is the most Cloudflare's runtime allows. Asking for more throws an error in production, even though `wrangler dev` accepts it.
  - The pepper makes a stolen database much less useful.
- **Sessions.**
  - Random 32-byte tokens, stored only as SHA-256 hashes, expiring after 30 days.
  - Login attempts are throttled per name.
  - WebSockets cannot send headers from a browser, so the token rides in the query string.
  - To keep tokens out of logs, add a short-lived one-time ticket endpoint and connect with the ticket instead.
- **Admin.**
  - `ADMIN_NAMES` in the Worker settings lists admin account names.
  - The flag is recomputed at every login and passed to the world by the Worker in headers the client cannot forge. The Worker overwrites them.
  - Every admin action is checked again inside the world.
- **Invite code.** A secret. Registration fails without it.
- **Input.** Every message is length-limited, parsed in a try block, type-checked and ownership-checked. Chat is stripped of control and direction-override characters and rate-limited.
