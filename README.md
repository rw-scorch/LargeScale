# Large Scale

The game: a browser strategy world for a few friends, running on one Cloudflare Worker.

## Layout

```
large-scale/
  wrangler.jsonc        Worker and Durable Object settings. The objects are created on first deploy
  package.json          dev, deploy, test, smoke, map scripts
  .dev.vars             local secrets, never committed (copy .dev.vars.example)
  src/                  everything that runs on the server
    index.js            the Worker: routes, static files, websocket handover
    directory.js        Directory object: accounts, sessions, worlds, members
    world.js            World object: one per world. Sockets, tick loop, saving, catch-up
    auth.js             password hashing, tokens, name rules
    sim/                the simulation, plain JavaScript with no Cloudflare imports
    shared/             code both sides use: grid, rng, pathfinding, terrain table, test map
  public/               everything the browser downloads
    index.html          the client
    js/render/          map renderer
    js/ui/              panels
    assets/             the sprite pack (not committed, see below)
    map/                built map files (not committed)
  data/                 stat files: buildings, units, tech tree, tuning
  tools/                build_earth.py and other one-off scripts
  test/                 node --test unit tests, plus smoke.mjs against a running server
```

Two rules keep this working:

1. **`src/sim/` never imports anything from Cloudflare.** That is why the tests run in plain Node and why the client can reuse the same code for prediction.
2. **`src/shared/` is the only code imported by both sides.** Anything else stays on its own side.

## First run

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars        # set INVITE_CODE and PEPPER
npm run dev              # http://localhost:8787
```

In another window:

```powershell
npm test                 # simulation tests
$env:INVITE = "the invite code you chose"
$env:MAP = "europe"      # test, europe or earth
npm run smoke            # end to end against the running server
```

## Deploying

Durable Objects are not created by hand. They are declared in `wrangler.jsonc` under `durable_objects` and `migrations`, and the first deploy creates both classes.

```powershell
npx wrangler login
npx wrangler secret put INVITE_CODE
npx wrangler secret put PEPPER
npx wrangler deploy
```

`ADMIN_NAMES` in `wrangler.jsonc` is set to `rw_scorch`. Register that name in the game as soon as the Worker is live, so nobody else takes it. The flag is checked on the server at every login, so it cannot be faked from the browser.

Never remove or edit the `migrations` block after deploying. It is how Cloudflare tracks which classes already exist.

## Assets and maps

The sprite pack is not committed, because it is large and generated. Copy it in:

```powershell
Copy-Item -Recurse ..\assets public\assets
```

Build the Earth map once and copy the output into `public/map`:

```powershell
pip install numpy pillow scipy
python tools/build_earth.py --land data/map/ne_10m_land.geojson --elevation data/map/etopo.tif --width 3600 --out public/map
```

## The Discord bot, and notifications that send themselves

The bot lives in this Worker. There is no second process and nothing to keep running.

**How it answers commands.** Discord posts each slash command to `POST /discord/interactions`. `src/discord.js` verifies the Ed25519 signature on every request and refuses anything that fails, which is also the check Discord runs before it will save your endpoint URL. Four commands are included: `/status`, `/world`, `/alerts on|off` and `/link <code>`.

**How it sends messages on its own.** Three mechanisms, in order of how they fire:

1. **Game events.** While a world is awake, the tick loop raises events. `world.js` turns the relevant ones into notifications: land lost while you are offline, a missile inbound, an elimination.
2. **A Durable Object alarm.** Notifications are queued rather than sent one by one. The world sets an alarm, and when it fires, `alarm()` sends one tidy message per player. Repeats merge into "x3", missiles skip the queue, and quiet hours are respected. The alarm wakes the object even with nobody connected, which is what makes it self-sending.
3. **A cron trigger.** `wrangler.jsonc` runs the Worker every ten minutes. `scheduled()` calls `heartbeat()` on every world, which flushes anything pending and handles time-based things like a world reaching its end date.

Delivery is a direct message if the player has linked their Discord account, otherwise the shared channel webhook.

**Setting it up**

1. Create an application at the Discord Developer Portal, add a bot, and copy the application id, public key and bot token.
2. Put them in `.dev.vars` locally, and as secrets for the deployed Worker:

```powershell
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL   # optional, for the shared channel
```

3. Register the commands. With a server id they appear instantly; without one they are global and can take an hour:

```powershell
$env:DISCORD_APP_ID = "..."; $env:DISCORD_TOKEN = "..."; $env:DISCORD_GUILD_ID = "..."
npm run register
```

4. Set the Interactions Endpoint URL in the portal to `https://your-worker.workers.dev/discord/interactions`. Discord sends a signed ping and only saves the URL if verification works.
5. Invite the bot with the `bot` and `applications.commands` scopes.

**Testing it without Discord**

```powershell
npm run dev
npm run discord     # signs real requests with a throwaway key and checks the replies
```

`npm test` also covers signature verification, the command router, and the batching and quiet-hours rules, all offline.

**Linking accounts.** In the game, `POST /api/link-code` gives the player a six-character code. They type `/link CODE` in Discord and the two accounts are joined, after which alerts arrive as direct messages.

## What is already here

`src/sim/` holds the tested modules from the development kit: territory, combat, bots, civilians, resources, logistics, construction, tech tree, market order book, diplomacy, offline play, chat, flags, host config, dev panel, units, nukes, tourism, atmosphere, terrain engineering and city cores.

`src/world.js` currently wires up territory, combat and chat. Adding a system means importing it in `world.js`, calling its install function once, and handling its messages. The guides in the development kit say what each one needs.
