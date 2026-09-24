# Piece 12: Offline play

## Goal

A world that lasts weeks, where friends log in at different times:

- Nobody comes back to find their nation gone overnight.
- Nobody comes back to find the world frozen.
- Everyone gets a clear summary of what happened while they were away.

## Already decided

- The world runs while everyone is offline, by sleeping and catching up.
- Attacks only happen while someone is connected.
- Offline players are protected by defences that fight on their own.
- Standing orders: hold, or fall back to the nearest city when outnumbered.
- Attack alerts.

## Depends on

Piece 2 (sleep and wake) and piece 4 (combat).

## Example code

`example/offline.js` and 5 tests.

- **`Presence`.** Counts connections per nation, so two tabs count as one player, and records when each was last seen.
- **`applyOfflineDefence`.** Sets `defenceMult` to 0.95 on human nations with nobody connected, and 1 otherwise. Piece 3's capture cost already multiplies by it. This reverses the earlier plan: being away is now a small penalty rather than a shield, because attacks can only happen while someone is connected anyway.
- **`trackOutput` and `offlineOutput`.** While a player is online, a rolling half-hour average of their production is kept. While they are away they earn that average minus 10 percent. A player who logs in and does nothing earns almost nothing overnight; a player who sets up farms and mines keeps earning.
- **`standingOrders`.** Runs every tick for stacks of offline humans:
  - `hold` stacks stop advancing and stay put. They get piece 4's hold bonus.
  - `fallback` stacks look for hostile troops within 6 plots. If those are more than 1.5 times their own size, they path to the nearest safe city: the capital or a listed city still owned. They are flagged as retreating until safe.
- **`collectAlerts` and `summarise`.** Collect relevant events for players who are away:
  - plots lost, stacks destroyed, convoys lost
  - wars declared, eliminations, buildings finished, deposits depleted

  `summarise` then turns them into a report: plots lost per attacker, stacks and convoys lost, who declared war, and what was built.
- **`planCatchUp` and `runCatchUp`.** Catch-up after sleeping:
  - The elapsed time is capped (72 hours by default), then split into 60-second steps.
  - `runCatchUp` runs steps until a time budget is used and returns `false` if there is more to do, so the work can continue on the next tick.
  - The test checks that catch-up growth matches live growth within 5 percent.

## What catch-up covers

Only things that are safe without anyone watching:

- troop growth
- civilian economy and growth
- production and delivery (convoys arrive instantly during catch-up)
- construction progress
- research
- market drift

Stacks do not move and no combat happens, because nobody was connected to fight.

## Steps

1. Call `applyOfflineDefence` and `standingOrders` every tick in the world object.
2. Store each player's alert inbox in the world storage. On connect, send the summary in `hello`, then clear it once shown.
3. **Client.**
   - A "while you were away" panel with the summary.
   - A timeline of alerts. Tapping one jumps the map to it.
   - `alert_offline` on nations of offline players in the diplomacy list.
   - `ov_offline_shield` over their capitals.
4. Standing order toggles on each stack: hold or fall back. Also a default for new stacks in settings.
5. **Defensive buildings fight on their own.**
   - Towers, bunkers, artillery and SAM sites attack hostile stacks and units in range every few seconds.
   - Their damage goes through piece 4's loss rule, as if they were a stack with a fixed power.
   - This works the same whether the owner is online or not. Being online just lets you also move stacks.
6. **Wake-up.** Plan the catch-up in `load()`, then continue it across the first ticks with `runCatchUp`, a 50 ms budget per tick. Send "catching up" progress to the first player until it is done.
7. **Optional web push.** A service worker can show "Your border is under attack" on phones. That needs push keys and subscription storage. Worth it later, since the in-game summary covers the basics.

## Done when

- The tests pass.
- Logging out mid-war and back in shows an accurate summary.
- A fallback stack actually retreats when a bigger enemy approaches.
- A world left alone overnight wakes in under a few seconds with its economy grown.

## Pitfalls

- **The catch-up cap is what keeps a forgotten world from exploding.** Without it, a world left for a month would jump a month of growth at once. Tell players when time was dropped: `plan.dropped` holds it.
- **Presence is by nation, not socket.** A player with two tabs who closes one is still online.
- **One player can keep a world awake and attack everyone else all night.** That is allowed by the rules. The offline defence bonus is what balances it, so tune the bonus with real play.

## Thoughts

For a small group, a host rule "no attacks between 11 pm and 7 am in the host's time zone" may do more for fairness than any bonus. Easy to add to piece 14 as a setting.
