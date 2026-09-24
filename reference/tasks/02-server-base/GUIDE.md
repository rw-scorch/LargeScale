# Piece 2: Server base

## Goal

A Cloudflare Worker that:

- serves the client
- handles accounts and invite-only registration
- lets hosts create worlds and friends join them
- runs each world as one Durable Object that owns the simulation, the sockets and the save

Everything later plugs into the world object.

## Already decided

- Cloudflare Workers and Durable Objects. GitHub Pages is static-only and cannot run a live world.
- One Durable Object per world, WebSockets with the hibernation API, SQLite storage.
- The world sleeps when empty and catches up on wake.
- The admin flag lives on the server, never in client code.

## Depends on

Nothing. The example borrows the piece 3 simulation so there is something real to run.

## Example code

`example/` is a complete Worker project. See `START_HERE.md` for the PowerShell commands to run it and its smoke test.

| File | Role |
| --- | --- |
| `wrangler.jsonc` | Worker settings: static assets from `public/`, two Durable Object classes (`Directory`, `World`) as SQLite classes, and variables `ADMIN_NAMES` and `TICK_MS` |
| `src/index.js` | Router: register and login (no token needed), `/api/me`, `/api/worlds` list and create, join, status, and `/ws/<world>`. Everything else goes to the static files |
| `src/auth.js` | PBKDF2 password hashing at 100,000 iterations with salt and pepper, random tokens, constant-time compare, name rules |
| `src/directory.js` | Directory object: accounts, sessions (stored hashed), worlds, members and login throttling (8 failures locks a name for 15 minutes) |
| `src/world.js` | World object: loads the map and saved chunks, runs catch-up, accepts sockets, runs the loop while anyone is on, saves dirty chunks, handles messages |
| `public/index.html` | A bare test client: register, log in, create or join a world, click to spawn and move, chat |
| `test/smoke.mjs` | 17 end-to-end checks against a running server, plus `RECHECK=1` mode for testing after a restart |

The `/ws/<world>` route checks membership, then forwards to the world with `X-Account`, `X-Name` and `X-Admin` headers that the Worker sets itself.

`src/world.js` in more detail:

- Every socket gets an attachment with account, name, admin and nation. Attachments survive hibernation and have a 2 KB limit.
- The loop is a `setInterval` started by the first connection and stopped by the last disconnect.
- It saves every 30 seconds and when the loop stops.

`test/smoke.mjs` covers:

- registration and the invite check
- the server-assigned admin flag
- wrong passwords refused and non-members refused
- the terrain frame
- spawning, chat between two players, creating a stack, advancing, ownership diffs
- the loop stopping when everyone leaves
- rejoining as the same nation

## How a world wakes and sleeps

1. A request arrives (a socket connection or an RPC like `status()`), and the runtime constructs the object.
2. The constructor runs inside `blockConcurrencyWhile`: it creates tables if missing, then `load()`.
3. `load()` does four things:
   1. rebuilds the map from its seed
   2. copies saved ownership chunks back in
   3. restores nations and stacks from the `state` row
   4. runs catch-up for the time since `savedAt`
4. The first socket starts the loop. From then on the object stays in memory and is billed for duration.
5. The last socket closing stops the loop and saves. With no timers left, the object becomes eligible for hibernation and stops being billed.

## Deploying for real

```powershell
cd tasks\02-server-base\example
npx wrangler login
npx wrangler secret put INVITE_CODE
npx wrangler secret put PEPPER
npx wrangler deploy
```

After deploying:

- Set `ADMIN_NAMES` in `wrangler.jsonc` to your account name before the first deploy. Register that name yourself straight away.
- Custom domains and the paid plan are set in the Cloudflare dashboard. The cost notes are in `docs/architecture.md`.

## Steps for the real game

1. Move the example into `server/`. Replace the demo map with the map loaded from piece 18 files. Terrain is static, so it can ship with the client and be checked by hash instead of being sent every time.
2. Put the simulation behind one function per message type. Keep `world.js` as plumbing: sockets, loop, save.
3. Add a short-lived connection ticket so tokens stay out of URLs.
4. Add client reconnect with backoff: wait 1, 2, 4, 8 seconds, then keep retrying every 15 seconds. After a reconnect, resend `hello` and a full owner frame.
5. Add a `version` field to `hello`, and refuse clients built for a different protocol version with a clear "refresh the page" message.
6. Save more layers as later pieces add them: buildings, zones, roads, deposits, units, market, diplomacy.
7. Add a daily backup: an admin-only route that dumps the world's tables as JSON to R2 storage, or to your machine.

## Done when

- The smoke test passes against both `wrangler dev` and the deployed Worker.
- A world keeps its state across a deploy.
- Nobody can join without the invite code, and nobody but you gets the admin flag.
- An empty world shows `looping: false` in its status.

## Pitfalls

- Do not await slow external calls inside message handlers. Storage calls are safe, but a `fetch` lets other messages interleave.
- The hibernation API needs `ctx.acceptWebSocket`. Using `ws.accept()` keeps the object billed for the whole connection.
- `setInterval` keeps the object awake, which is intended while playing. Make sure every path that empties the world clears it: close, error and a failed send.
- The 100,000-iteration hashing cap is only enforced in production, so do not raise it because it works locally.
- Keep the simulation free of Cloudflare imports so the Node tests keep working.

## Thoughts

With 2 to 8 players, the simplest thing that works is the right design. One world object doing everything is fine. Spend the effort on reconnects and clear error messages, because friends on phones will lose signal far more often than the server will struggle.
