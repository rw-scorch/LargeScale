# Pacing: making a world last without going flat

A world is meant to run for days or weeks with 2 to 8 friends who log in at different times. Two things can ruin that:

- **It ends early.** One player snowballs, and by day three everyone else knows the result.
- **It drags.** Nothing changes between logins, so people stop coming back.

The goal is a long world that still gives every session something to decide. This is a plan for getting there, grouped by lever, with the pieces each one touches and the risk it carries.

## The shape to aim for

A 14-day world, playing perhaps an hour a day each:

| Day | Era for most | What players are doing | What the systems must deliver |
| --- | --- | --- | --- |
| 1 | Tribal | Spawn, grab land, zone the first town, first huts | Fast, obvious growth. Nothing lost by logging off |
| 2 to 3 | Medieval | Borders meet bots and neighbours, first small wars, first roads and mines | Contact without elimination. Losing a border town must not be fatal |
| 4 to 6 | Gunpowder | Real economies, first alliances and treaties, first market trading | A reason to specialise, and a reason to talk |
| 7 to 9 | Industrial | Rail, factories, mass armies, the first serious war | Logistics decide the war, not the biggest number |
| 10 to 12 | Modern | Air, sea, nukes as deterrent, factions form up | Politics, not just fronts |
| 13 to 14 | Modern and Future | Endgame, the last one or two blocs | A clean, fast finish |

Every lever below either widens that timeline or keeps a day from feeling empty.

## Lever 1: time that passes while you are away

This is the foundation. It already exists in piece 12, and the point is to make offline time matter but never decide anything.

- **Offline gives growth, not conquest.** Economy, research, construction and population run while you sleep. Combat never does.
- **Cap it.** 72 hours of catch-up means a player returning from a week away is behind, but not hopelessly.
- **Make coming back a moment.** The "while you were away" summary should read like news: borders lost, buildings finished, era reached by a rival, market prices moved.
- **Queues make offline time productive.** A research queue, a build queue, convoy standing orders and stack standing orders all mean "I set things up, and they happened". Without queues, logging off means stopping. With them, an hour of play sets up ten hours of world.

Pieces: 12 (offline), 9 (research queue), 8 (build queue), 7 (standing dispatch).

## Lever 2: distance and travel time

The cheapest way to stretch a game without adding grind is to make the map big enough that moving matters.

- **Marches take real minutes.** At 1.5 plots per second, crossing 200 plots of grassland takes about two minutes, and mountains double that. Crossing a continent is a session-long commitment.
- **Convoys make roads a project.** A road built today pays off all week.
- **Supply range caps how deep an offensive can go** before it weakens, so conquest happens in steps with pauses between them, which is exactly the pacing you want.
- **Ships and aircraft come later on purpose.** Early wars are local and slow, and only the Industrial era makes the whole map reachable.

Pieces: 3 (speed), 7 (roads and supply), 15 (ships and aircraft).

Risk: travel time that is pure waiting is boring. Fix it by making travel visible and interruptible: show paths, let players intercept, and let a stack be redirected mid-march.

## Lever 3: anti-snowball rules

A runaway leader is the main reason a long world dies early. Four rules, in the order I would add them:

1. **Integration time on captured land.** A newly captured plot produces nothing for, say, 10 minutes, then ramps to full over another 20. Taking twenty towns in an afternoon gives you land, not power, this evening. Implement as a per-plot timestamp and a multiplier on civilian output and troop cap for those plots. This is the single most effective anti-snowball rule, and it is not unrest: the civilians are fine, they are just not yours yet.
2. **Administration upkeep.** Money cost per plot per second, rising slightly with the total: for example `0.0005 × plots^1.1`. A large empire needs a real economy to hold it, so sprawl has a price.
3. **Garrison density.** Already in piece 3: your defence is your troops spread over your plots, so a huge nation is thinner everywhere. Keep that, and make sure players can see it, with a plots-per-troop readout.
4. **Catch-up pricing on the market.** Already in piece 10: upgrades get cheaper the more nations own them, so falling one era behind is recoverable at a price.

Pieces: 3, 5, 8, 10.

What not to do: rubber-band bonuses that punish the leader directly. Friends notice, and it feels unfair. Costs that grow with size feel like logistics. Bonuses that appear because someone is winning feel like the game cheating.

## Lever 4: seasons as a campaign rhythm

Seasons are already in piece 17, and they are the best pacing tool you have because they are visible and fair.

- **Winter slows movement (1.7 to 2.5 times) and drops farm yield to a fifth.** That is a natural lull: armies stall, granaries matter, and people build and plot instead of fighting.
- **Spring is the campaign season.** Food comes back and movement is cheap.
- **Six game days per season, at one hour per game day, gives a six-hour cycle**, so every real day contains a full year. If that feels too fast, the host can stretch the day length. A three-hour game day with six-day seasons gives an 18-hour season, so each real day has a mood.
- **Tourism swings with the season**, which gives peaceful players their own calendar.

Risk: a winter that only blocks play is annoying. Keep the upsides: rivers freeze into crossings, defence bonuses hold, and production of anything indoors carries on.

## Lever 5: goals that refill

People come back for something to aim at. A long world needs a supply of goals larger than "more land".

- **Era advancement** is the big one, and it is already gated on breadth of research, so it takes real planning.
- **Wonders** as long projects: a build time measured in hours, a global announcement at 25, 50 and 100 percent, and a real bonus. Anyone can see who is building what, which creates a target and a race.
- **World events on a timer.** A few simple ones go a long way, all implementable as a scheduled event in the world object:
  - a resource discovery that reveals a new deposit cluster
  - a market demand spike for one resource for two hours
  - a migration wave that offers population to whoever has spare housing
  - a harsh winter that doubles food consumption for a season
- **Personal milestones** with a small reward: first port, first railway between two cities, first nation to 10,000 population, first to research an era node.
- **The scoreboard** (piece 13) is the cheapest engagement tool in the game. People check rankings.

Risk: events that hand out power randomly feel unfair. Make them opportunities that must be taken (build there, ship goods there), not gifts.

## Lever 6: make each session a clear loop

For an asynchronous group, a login should have an obvious 20 to 40 minute shape:

1. Read the "while you were away" summary and the world log.
2. Answer diplomacy: proposals, chat, faction talk.
3. Spend: research choice, bulk upgrade pass, place new buildings.
4. Set the economy: zones, convoy priorities, market orders.
5. Move the army: stacks, standing orders, one attack or one defensive shift.
6. Log off knowing what will have happened by tomorrow.

Things that support this loop:

- A **to-do panel**: idle stacks, buildings that can be upgraded, research finished with nothing queued, storage nodes that are full or starving.
- **Automation unlocks** so the chores do not grow with the empire: auto-dispatch convoys (piece 7), an auto-upgrade rule per building type, auto-recruit to a target garrison. Every automation should be a research node, so removing chores is itself progress.
- **Bulk everything**: the bulk upgrade menu is the model. The same idea applies to zoning and to giving many stacks the same standing order.

## Lever 7: slow the parts that end games

- **Attacking must cost something.** Capture costs troops, landings lose troops, supply drains far from home. Wars should leave both sides needing a rebuild.
- **War notice of five minutes** means no one is wiped out while they make tea.
- **Peace has a floor.** A war cannot end in the first ten minutes, so declarations are meaningful.
- **Nukes deter rather than decide.** They are announced, interceptable, expensive, and clear land rather than capture it.
- **A surrender or vassal option** shortens the boring tail: when a nation is clearly beaten, it can submit to a faction, keeping its land under the winner's banner and its player in the game as a member. The world still ends with the last faction standing, but nobody spends two evenings being slowly eaten. This is the one addition I would make to the win condition, and it is small: it is a faction join with a flag saying "not by choice".

## Lever 8: host settings that shape the length

Everything above should be tunable per world, in piece 14:

| Setting | Effect on length |
| --- | --- |
| `speed` | Scales all rates. 0.5 doubles the world's length |
| `dayLengthMinutes`, `daysPerSeason` | The rhythm of day and season |
| research cost multiplier | The main era-pacing dial |
| `peaceMinutes` at world start | No attacks for the first hour, so nobody is killed in their first session |
| integration minutes | How fast conquest converts into power |
| attack window hours | Optional: attacks only allowed between set hours, so battles happen when people are awake |
| `maxCatchupHours` | How much a returning player recovers |

A "weekend world" preset (speed 2, short seasons, 6 bots) and a "fortnight world" preset (speed 0.75, long seasons, 20 bots) would cover most of what you and your friends will actually play.

## What to measure while playtesting

Numbers beat opinions, and the dev panel already gives you the levers. Log these per world:

- **Time to first contact** between two players. If it is under 20 minutes, the map is too small or spawns are too close.
- **Time to first war**, and how long wars last.
- **Share of land held by the leader** at the end of each day. If it passes about 40 percent before day 7 in a 14-day world, the anti-snowball rules need strengthening.
- **Era timing per player**, and the gap between first and last. A gap of more than one era for long is a sign that catch-up pricing is too weak.
- **Minutes played per session, and actions per session.** A session with fewer than about 20 meaningful decisions is a chore session, so look at what the automation should have handled.
- **How many plots change hands per day** across the world. Near zero for a day means a stalemate that needs a shake-up (an event, a season change, or a diplomatic reason to move).

## An order to build these in

Nothing here needs to be in the first playable world. Suggested order:

1. **Free with the current plan:** travel time, supply, garrison density, era gating, offline catch-up with queues, seasons.
2. **Small additions, biggest effect:** integration time on captured land, administration upkeep, the to-do panel, the world log, the scoreboard.
3. **Once the world runs for real:** wonders with announcements, world events on a timer, automation research nodes, surrender or vassalage.
4. **Only if playtests show a need:** attack windows, longer seasons, per-world presets.
