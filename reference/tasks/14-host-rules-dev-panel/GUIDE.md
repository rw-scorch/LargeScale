# Piece 14: Host rules and dev panel

## Goal

Two control surfaces:

- **Host settings** for the person creating a world, deciding how that world plays.
- **A dev panel** only your account can open, for editing the stats of every building, unit and rule while a world runs.

## Already decided

- The host sets world rules.
- Stats are editable, but only through an in-game dev panel restricted to your login, checked by the server.

## Depends on

Piece 2 for accounts and the admin flag.

## Example code

`example/config.js`, `example/devpanel.js` and 4 tests.

### `config.js`

- `WORLD_SCHEMA` is every host setting with its type, range and default:

  | Setting | Default |
  | --- | --- |
  | name, map, maxPlayers | New world, test_small, 8 |
  | bots, botsAttackPlayers | 12, off |
  | speed | 1 |
  | startEra | T |
  | peaceMinutes | 60 |
  | warNoticeSeconds | 300 |
  | offlineDefence | 1.5 |
  | maxCatchupHours | 72 |
  | factionSize | 4 |
  | nukes | on |
  | dayLengthMinutes | 60 |
  | daysPerSeason | 6 |
  | weather, fogOfWar, inviteOnly | on |

- `makeConfig` fills defaults, rejects bad values and reports unknown keys, so a bad or hostile create request cannot produce a broken world.
- `LIVE_EDITABLE` lists what the host can still change after the world starts: bots, speed, war notice, offline defence, catch-up, nukes, weather and day length. Map, player cap and starting era lock, because changing them mid-world would break saves.

### `devpanel.js`

- `STAT_RULES` says which fields are editable per table and their allowed range, for example building `time` from 1 to 36,000 seconds, unit `speed` from 0.05 to 50. Costs are checked as maps of resource names to numbers.
- `StatStore.apply(account, changes)`:
  - refuses non-admins
  - accepts 1 to 200 changes at a time
  - checks every change before applying any
  - bumps a version and writes an audit entry with the old values
- `undo` restores the last batch.
- `diffSince(version)` gives clients only what changed, so the panel can push updates live.

## Steps

1. **World creation screen.** One form from the schema, with plain descriptions. Show the invite link and code. Only the host sees the settings.
2. **Ship the stat files** as `data/*.json` (see `docs/data-formats.md`). Load them into a `StatStore` at world start. Save the audit log with the world, so an edited world keeps its changes after a restart.
3. **Dev panel UI** (`ui_dev` icon), only rendered when the account is admin:
   - A table per stat file, searchable, with the sprite thumbnail next to each row.
   - Edit in place, with the range shown and out-of-range values refused before sending.
   - A batch of pending edits, applied together.
   - Undo, and an audit list of who changed what and when.
   - Live reload: on success, broadcast `stats` with the version and the changed fields, and every client updates.
4. **Effects on running things.** Changing a building's cost only affects future builds. Changing a unit's speed affects existing units at once. Say which is which in the panel, so you are not surprised mid-playtest.
5. **Lock it down.**
   - The admin check happens in the world object, never on the client.
   - The client hides the panel for others, but hiding is not security.
   - Log every apply with the account id.
6. **Playtest workflow.** Keep a notes file of every change you make during a session, which the audit log gives you for free. Export it at the end and fold the good values back into `data/*.json` in your repository.

## Done when

- The tests pass.
- A non-admin account gets "not allowed" even when it sends the request by hand.
- Changing a stat in the panel shows up for every connected client within a second.
- Undo returns the exact previous values.
- A world reloaded from storage keeps its edited stats.

## Pitfalls

- Never let the panel edit arbitrary paths. The whitelist in `STAT_RULES` is what stops a typo from writing `units.knight.hp = "banana"` into a save.
- Keep ranges sane, since a speed of 500 makes stacks teleport and breaks pathing.
- If you change the tech tree live, only add nodes or change costs. Removing a node someone knows will break their state (piece 9).

## Thoughts

The dev panel is also your balancing tool for the long game. Pair it with a readout of key numbers per nation (troops, population, income, research rate) so you can see the effect of a change while friends keep playing.
