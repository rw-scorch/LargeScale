# Piece 4: Combat and bots

## Goal

Stacks fight when they meet, nations can be wiped out, bots fill empty land without being a threat, and the game knows when someone has won.

## Already decided

- Bots are weak and slow to expand, and they fill leftover land.
- Win condition: last player or faction standing. Bots do not count.

## Depends on

Piece 3.

## Example code

`example/combat.js` handles battles and `example/bots.js` handles bots and the victory check. `combat.test.js` has 5 tests covering:

- the square-law duel result
- a real fight between two moving stacks
- allies not fighting
- bots growing without touching the player
- victory with factions

### How battles work

- **Engagement.** Hostile stacks within one plot of each other (including diagonals) are engaged. Engaged stacks stop moving until the fight ends.
- **Power.** `troops × attack bonus × supply multiplier`, then:
  - × 1.1 × terrain defence if standing on your own land
  - × 1.25 if holding still under a hold order
- **Losses.** Each second, each side loses `0.08 × enemy power`. If a stack fights several enemies at once, its power is split between them.
- **What that means.** This is Lanchester's square law, so size matters a lot:
  - 1,000 against 600 leaves about 800, which is the square root of 1,000² minus 600², not 400.
  - Bringing a bigger stack is far better than feeding in small ones.
  - `simulateDuel(a, b)` lets you check any match-up quickly.
- **Destruction.** A stack is destroyed below half a troop, and a `stack_destroyed` event is sent.

### How bots work

- **Spawning.** `spawnBots` places bots on free land, with the same spawn gap rule as players.
- **Thinking.** Every 5 seconds, a bot with no active advance and a garrison above half its cap sends 35 percent of its troops as a stack from its best border plot, and orders it to advance.
- **Weakness.** Bot stacks move and advance at 40 percent speed.
- **Peace with players.** With `attackPlayers` off, the default, bots and humans are never hostile to each other. Players can still attack bots and take their land, which is how bots get soaked up.
- **Victory.** `checkVictory` returns a winner once at least two humans have played and only one human group (a nation, or a faction from piece 11) is still alive.

## Steps

1. Call `installCombat(world)` and `installBots(world, rng)` when the world starts. The host setting from piece 14 gives the bot count.
2. **Client.**
   - Marker states: `army_<era>_fighting` while engaged, `moving` while on a path, `selected` when picked.
   - Effects: `explosion_small`, `smoke`, `muzzle_flash`.
   - Stacks shrinking in real time is the clearest feedback.
3. Send events for captured plots, destroyed stacks and eliminations to every player, so the chat or alert panel can show them.
4. **End of game.**
   - When `checkVictory` returns a winner, freeze orders and show a result screen with stats (peak plots, battles won, era reached).
   - Keep the world readable afterwards, as a museum.

## Tuning notes

- `lethality` sets how long fights last. At 0.08, the example's `simulateDuel` gives these results:

  | Fight | Result |
  | --- | --- |
  | 500 against 400 | Over in about 14 seconds, 297 survive |
  | 500 against 250 | Over in 7 seconds |
  | Two equal stacks | Grind for about 85 seconds before both are nearly gone |

  That is decisive, but it leaves little time to react. On a days-long world you may want fights to last longer, so players can send help. At 0.03, 500 against 400 takes about 37 seconds.
- `holdBonus` and `ownLandBonus` make defence worth something. With offline defence (piece 12) on top, an offline nation is about 1.5 × 1.25 × 1.1 × terrain, roughly twice as tough on flat land.

## Done when

- The tests pass.
- Two players can fight a clear battle, and the bigger stack reliably wins.
- Bots visibly grow on empty land but never cross into a player.
- Eliminating the last rival shows a win.

## Pitfalls

- Resolve all losses at the same time (the example collects them first and then applies them), so stack order in the list never matters.
- When a stack dies mid-path, clear anything pointing at it: selection on clients, supply links.
- Watch for stacks stuck engaged forever, for example at diagonal contact across water. Add a rule that stacks on different sides of water do not engage unless one has ranged units.

## Thoughts

- A simple retreat order is worth adding soon: leave the fight and path home, taking a 10 percent loss. Otherwise the only way out of a bad fight is to lose it.
- Consider a "last stand" bonus for a nation's capital. That makes finishing someone off a real event, which matters when the game is about being the last one standing.
