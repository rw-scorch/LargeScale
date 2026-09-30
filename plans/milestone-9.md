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

## Progress

- **Part A, relations and war (30 September 2026, branch `m9-diplomacy`, stacked on `m8-tourism`).** Built as planned, with these specifics:
  - **`src/sim/diplomacy.js`**, the kit's module extended:
    - `installDiplomacy` wraps `world.hostile` and `world.passable` for pairs of players only. Which nations are players is read from a small array, not the nations map.
    - Relations are keyed by a number, not a string.
    - `check` holds the rules for each proposal, and runs again when a proposal is accepted, so an old alliance offer cannot be signed in the middle of a war.
    - The kit's `propose` and `accept`, and `decline`, `withdraw`, `save`, `load`, `view` and `proposalsOf`.
    - `diploTick` runs every second on world time, and in catch-up. It starts pending wars, drops old proposals, sends troops home and turns the log into events.
  - **The `diplo` order** (`diploOrder`): `war`, `propose` (peace, alliance, or a non-aggression treaty of 30, 60, 120 or 240 minutes), `accept`, `decline`, `withdraw`, `leave`, `break` and `embargo`.
    - Proposing what the other side has already proposed signs it at once.
    - A declaration against a bot is refused with the reason: bots need none.
  - **Rules** (`rules.json` `diplomacy`):
    - The notice is 5 minutes.
    - Peace talks open once a war is 10 minutes old, and a signed peace gives 10 minutes without war.
    - Breaking a treaty or leaving an alliance stops a declaration for 15 minutes.
    - **Changed from the kit:** proposals last a day of game time, not 10 minutes, because friends in a long world are away for hours.
  - **Troops sent home.** When peace is signed, an alliance is left or an embargo starts, stacks standing where they may no longer be are moved to their nation's nearest plot and set to hold (`sendHome`, the `troops_home` event). In a war an advance takes the land it stands on, so this matters mostly for allies' land.
  - **Embargoes.** `passable` is false for an embargoed traveller, and `friendly` in `src/sim/trade.js` (now exported) refuses trade either way.
  - **Reasons.** The attack, advance and landing orders give `peaceReason`: "declare war first", "the war with X starts in N s", "X is your ally" or "the peace period is still on".
  - **Old worlds** have no `diplomacy` in their state, so every pair of players starts at war. New worlds start at peace. The state row carries `diplomacy`.
  - **World.**
    - `hello` carries `diplomacy` (relations, embargoes, factions, and your own proposals) and `dipRules`.
    - `sendDiplomacy` sends a `diplomacy` message to each player when the version changes, and straight after a `diplo` order.
    - The eight diplomacy events go to everyone.
    - Away players get a notice for a war declared on them and for proposals.
    - The admin op `diplomacy` (World power) sets the war notice (1, 5, 10, 30 or 60 minutes). A world's config takes `warNotice` too, and test rules may set any notice.
  - **Away summary.** Wars, peace, alliances, treaties and embargoes from while you were away are listed. A war declared on you shows the summary even after a short absence.
  - **Client.**
    - The Diplomacy panel (`public/js/ui/diplomacy.js`, J, and a corner icon counting the proposals that wait for you). Each player's row has a relation icon, a live countdown and the actions that fit. Declare war, Leave alliance and Break treaty each ask twice.
    - The ring offers Declare war and Diplomacy on a player at peace, and greys out Attack while a war is pending.
    - The nation card shows the relation and has a Diplomacy button, and the leaderboard shows relation icons.
    - The status bar counts down a pending war (`#war-chip`).
    - World info shows the war notice, with a selector for the host.
    - `ClientWorld` has `setDiplomacy`, `relation(a, b)` and `canAttack`.
  - **Evidence:**
    - `npm test`: 318 of 318. `test/diplomacy.test.js` has 9 tests:
      - peace at the start, and bots left out;
      - the notice;
      - alliances and leaving one;
      - peace and treaties;
      - embargoes;
      - saving;
      - catch-up;
      - the browser against the server;
      - the away summary.

      `test/kit/diplomacy.test.js` runs the kit's 5 tests against `src/sim`. The reference tests: 95 of 95.
    - **Cost of the check.** Timed alone on 400 bots and 8 players, a hostility check costs 30.3 ns with diplomacy against 28.9 ns without. The bench makes 32,991 checks a tick, so that is about 0.05 ms a tick.
    - **`npm run bench`** (diplomacy installs with every player at war, so the game is the same; `--diplomacy 0` leaves it out):

      | Diplomacy | Median | p99 | Worst |
      | --- | --- | --- | --- |
      | On | 9.0 ms | 31.0 ms | 51.3 ms |
      | Off | 10.3 ms | 34.1 ms | 45.2 ms |

      The worst tick with diplomacy on was an economy tick, over the budget by 1.3 ms; the tick without the economy pass was 39.9 ms. Given the 0.05 ms measured, this is the bench's usual noise.
    - **Dev server run (30 September 2026):**
      - **Smoke: 123 of 123.** Players start at peace, and an attack needs a declaration ("you are at peace with friend: declare war first"). A proposal reaches only the two players and is declined. An embargo is heard. A declared war makes attacks wait ("the war with friend starts in 4 s") and then starts. With a war declared, the scheduled peace still stops attacks ("the peace period is still on").
      - The smoke test's battles now declare war first, with short notices set in test rules.
      - **`npm run ui`: 192 of 192.** In the browser, Declare war asks first ("Sure? War in 5 min"). Both players' bars then count down ("War with pal in 5:01"). The host's corner shows 1 proposal waiting; accepting peace gives "Treaty, 10 min left", and an alliance after it shows "Allied" in the panel and on the leaderboard (screens `85-diplomacy` and `86-diplomacy-allied`).
      - **Soak: 180 s, 1,194 rounds, 0 tick errors, no problems found.** Random declarations, proposals, accepts, embargoes, leaves and breaks, including their refusals. Both players saw the same relation at the end.
      - **Test fixes on the way.** An edit script dropped the backslashes from three regexes in the new checks. The helper check in the UI test now accepts a gift to either nation, since the friend has a nation now.
- **Part B, factions, chat channels and map notes (30 September 2026, branch `m9-factions`, stacked on `m9-diplomacy`).**
  - **Factions** (in `src/sim/diplomacy.js`, through the `diplo` order):
    - `faction` founds one. The name is 1 to 24 characters and no other faction may have it.
    - `invite` is the leader's, through the kit's `faction_invite` proposal, accepted like any other.
    - `quit` leaves, `expel` is the leader's, and `rename` is the leader's too.
    - When the leader leaves, the next member leads, and an empty faction ends.
    - Members are always allied, and a war declared on one reaches all of them.
    - Nobody at war with any member can join. The check runs again when an invitation is accepted.
    - Leaving, or being expelled, starts the 15-minute cooldown with each remaining member, and sends troops in their land home.
    - The size limit is 2, 3 or 4 players (`factionSizes`). It is a host setting, through the `diplomacy` admin op and World info, and cannot go below a faction's current size.
    - Events: `faction_created`, `faction_joined`, `faction_left` (with `by` for an expulsion) and `faction_renamed`. They go to everyone.
  - **Winning** (`victory`, `factionWin` and `mostLand` in `src/game.js`):
    - The last faction standing wins together. The victory carries the faction and its members, and is named with them, as in "North (Ann and Ben)".
    - **Added:** a faction that holds every player has beaten nobody, so it does not win until a player is out. Otherwise two friends allying at the start would end the world.
    - At the end time, the side with the most land wins, a faction's land counted together.
  - **Chat channels** (`src/world.js`):
    - `chat` takes `ch`: global, faction, or private with `to`. The chat table gains `ch`, `fid`, `a` and `b` columns, added to old worlds on start.
    - Faction and private lines go only to those who may read them (`sendTo`, `chatReach`). `hello.chat` holds global lines, your faction's and your private ones.
    - A `typing` message is passed on to the same readers, at most every 1.5 s per player.
    - A private message to someone away sends them a notice.
  - **Map notes** (`src/sim/notes.js`, `installNotes`, the `note` order):
    - Up to 20 notes a nation, 80 characters each, saved with the nation.
    - Seen by allies and faction members (`notesFor`).
    - Sent as a `notes` message when notes or relations change, and in `hello` with `noteRules`.
  - **Client.**
    - The Diplomacy panel's Faction section: found, members, rename, and leave (asked twice). Invite and Expel are on players' rows, invitations are among the proposals, and faction tags show on rows and the leaderboard.
    - The chat tab picks Everyone, your faction or one player; lines are tagged, and "Ben is typing" shows.
    - The ring's Note item, and the note card (`public/js/ui/notes.js`): pin a note, list yours and your allies'.
    - Pins are drawn in the owner's colour (`drawNotes`), with the text from the icon zoom, and the tip shows a note.
  - **Found by the soak, fixed:** a company aboard a boat, ship, APC or plane was not counted against the 100-company limit. A player could board companies, form new ones up to 100 and then land the first ones, and the soak saw 101 to 103. A carrier holding a nation's troops now counts as one company (`companiesOf` in `src/sim/soldiers.js`). This has been possible since milestone seven.
  - **Evidence:**
    - `npm test`: 326 of 326. `test/factions.test.js` has 7 tests:
      - founding and inviting;
      - wars reaching every member, and joining refused while at war;
      - size, leaving, expelling and a new leader;
      - the faction win, and a faction of everyone;
      - the end-time win by side;
      - notes;
      - the browser's view.

      There is also a soldiers test for companies at sea.
    - **Dev server run (30 September 2026):**
      - **Smoke: 126 of 126.** A player founds "The North", invites the friend, and the friend accepts. Faction chat, private chat and a typing notice reach the right player, and writing to yourself is refused. A note is shared. On rejoining, the faction and private lines and the note come back. A faction of every player has won nothing.
      - **`npm run ui`: 194 of 194.** The host founds a faction in the panel. The friend reads "rw_scorch invites you to join The North." and accepts, and then reads "Your faction". Faction chat arrives as "[faction] rw_scorch: north only", and a pinned note shows in the friend's list and on the map (screens `87-faction` and `88-notes`).
      - **Soak: 180 s, 1,256 rounds, 0 tick errors, no problems found.** Factions were founded, joined, quit and expelled at random, with chat on every channel and notes added and removed. Both players saw the same relation and factions at the end. At 100 companies, orders are refused with the reason.
      - **Test fixes on the way.**
        - The smoke's friend now spawns where the host can walk: a boat trip replaces the host's stack, which failed the battle checks when the friend spawned across water.
        - Its road check also looks for vertical runs of free land.
        - The UI ring checks expect the new Note item.
        - One UI run failed the piloting check on timing; it passed on the next run.
