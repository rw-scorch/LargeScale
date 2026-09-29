# Milestone 9: diplomacy, factions and the endgame

Written 30 September 2026, after milestone eight. Ryan asked to keep going step by step until the project is done, so this plan is my reading of what the design already settled. He corrects anything here that is wrong.

## Why this comes before the Future era

What is left of the design, after milestone eight:

- Diplomacy and factions (piece 11).
- The endgame: eliminated players, vassals, the public record.
- The Future era (piece 16).
- Engineers and terrain destruction (piece 19), and conventional cruise missiles.
- Atmosphere: day and night, weather (piece 17).
- Host rules and the dev panel (piece 14), and the rest of social (piece 13).

Diplomacy is the part the game is built around: the win is the last player or faction standing, and war needs a declaration. Today every nation is always at war with every other, and nothing in the code knows what an ally is. For a world of friends, that matters more than hover tanks, so it goes first.

## What the design already says

- War needs a declaration and a five-minute notice, and the host can change the notice.
- Alliances, treaties, embargoes and factions of up to four. The host can change the faction size.
- The last player or faction standing wins. Bots do not count.
- Chat has global, faction and private channels, with typing indicators.
- Players can mark map notes and share them with allies and faction members.
- An eliminated player can watch, join a friend's faction as a second commander, or surrender first and continue as a vassal.
- When a world ends, the full log and map history become public.
- Planes entering SAM cover are engaged automatically, except allies' and faction members'.

## My reading, for Ryan to correct

1. **Diplomacy is between players only.** You attack bots without declaring war, as now, and bots still never attack players unless the host allows it. Declaring war on 400 bots would be pointless busywork.
2. **Players start at peace.** Nothing can hurt another player until a declared war has run its notice. Worlds that exist today keep every pair of players at war, so a game in progress does not change under anyone.
3. **Peace between players means trade.** Trade ships already sail to any port that is not hostile, so ports of players at peace start trading. An embargo stops that, one way.
4. **The scheduled peace period still wins.** A war can be declared during it, but no attack lands until it ends.
5. **Alliances open borders.** Allies walk through each other's land and ports, never hit each other's planes, and see each other's map notes.
6. **Breaking an alliance or a treaty** stops you declaring war on that player for 15 minutes, so nobody can break an alliance and attack straight away.
7. **Peace talks need a war at least 10 minutes old**, and signing peace gives 10 minutes in which neither side can declare war again.
8. **A faction** has a name, a leader and up to four members (a host setting). Members are always allied. A war declared on one member reaches every member. A faction wins together.
9. **A second commander** is an eliminated player who joins a friend's nation. They give orders for that nation as if it were theirs. The friend invites them, and can remove them.
10. **A vassal** is a player who surrenders during a war. The war ends, and the vassal:
    - pays a quarter of its income to its overlord;
    - follows its overlord's wars and alliances, and cannot declare war itself;
    - counts on its overlord's side for the win.

    The overlord can set a vassal free.
11. **The public record.** Every diplomatic event and every elimination is logged. Once an hour, the world keeps a quarter-size picture of who owns what. When the world ends, World info shows the log and a slider through the pictures.

## The parts

### Part A: relations and war

- The kit's `src/sim/diplomacy.js`, extended, not replaced. `installDiplomacy` wraps `world.hostile` and `world.passable` for pairs of players and leaves bots alone.
- Everything runs on world time, so catch-up and the speed setting behave.
- **The `diplo` order:**
  - declare war;
  - propose peace, an alliance or a non-aggression treaty (for a number of minutes);
  - accept or decline a proposal;
  - leave an alliance, break a treaty;
  - embargo.
- **Effects of an embargo:**
  - the embargoed nation's stacks, boats and trains cannot cross the other's land;
  - no trade ships sail between them.
- **Saving.** Relations, proposals and embargoes are saved in a `diplomacy` row, written when they change.
- **Network.** `hello` carries the relations. A `diplomacy` message goes out when they change. Proposals go only to the two sides.
- **Alerts.** A war declared on you raises an alert with the countdown, and a push and Discord notice when you are away.
- **Client.**
  - The Diplomacy panel (J, and an icon in the corner): a row per player with the relation icon from the kit (`dip_war`, `dip_alliance`, `dip_treaty`, `dip_embargo`, `dip_peace`), the actions, and proposals with Accept and Decline.
  - The nation card gets the same actions.
  - The ring's Attack on a player at peace becomes Declare war.
  - The leaderboard shows relation icons.
  - A war countdown sits in the status bar.
- **Host settings.** War notice, in World info.

### Part B: factions, chat channels and map notes

- **Factions:** create, invite, join, leave, a leader who is replaced when they leave, a faction banner and colour ring on the leaderboard. Faction size is a host setting.
- **Victory:** `checkVictory` gets the faction key, so the last faction standing wins together.
- **Chat:** the kit's `ChatHub` gives global, faction and private channels with typing indicators. The feed's Chat tab picks the channel.
- **Map notes:** a note is a short text pinned to a plot, shared with allies and faction members, at most 20 each. The ring gets Add note, and notes are drawn as pins.

### Part C: the endgame

- **Second commanders**, through an invitation from the friend's nation. The socket carries the nation it commands. Commanders show on the leaderboard.
- **Surrender and vassals**, as read above, with tribute paid every 5 seconds.
- **The public record:** the event log in its own table, an owner picture every game hour at a quarter of the map's size (run-length encoded, a few kilobytes each), and a History tab in World info that opens when the world ends.

## Evidence for each part

- Unit tests for every rule, and the kit's 5 diplomacy tests kept green.
- `npm test`, the reference tests, smoke and `npm run ui` on the test map.
- `npm run soak` with random declarations, proposals and embargoes between the two players.
- `npm run bench`, to show that the hostility checks cost nothing measurable.

## After this milestone

In order: the Future era with cruise missiles; engineers and terrain destruction; atmosphere; host rules and the dev panel.
