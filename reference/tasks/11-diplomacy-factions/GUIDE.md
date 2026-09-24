# Piece 11: Diplomacy and factions

## Goal

Rules for who can hurt whom:

- War needs a declaration and a warning period.
- Treaties and alliances hold until broken, and breaking them has a cost.
- Embargoes shut borders.
- Factions bind several nations into one team that wins or loses together.

## Already decided

- Alliances, treaties, embargoes and war declarations.
- Guild-style factions holding multiple nations.
- Win: last player or faction standing.

## Depends on

Piece 4. The world's `hostile` and `passable` hooks are replaced here.

## Example code

`example/diplomacy.js` (a `Diplomacy` class plus `wireToWorld`) and 5 tests.

### Relations between each pair

| Relation | Meaning |
| --- | --- |
| `peace` | The default |
| `war_pending` | A war has been declared and the notice period is running |
| `war` | Stacks fight and land can be taken |
| `alliance` | Borders are open |

Each pair also records:

- when its current state began
- any treaty end time
- a "no war before" time, set when something was broken

### Declaring war

`declareWar(a, b, now)` refuses when any of these is true:

- the two are in the same faction
- they are allied
- a non-aggression treaty is running
- `a` broke a treaty or left an alliance with `b` in the last 15 minutes
- they are already at war

Otherwise the war starts after 5 minutes (`warNotice`, a host setting). If `b` is in a faction, the declaration goes to every member, because the faction defends.

### Proposals

`propose` then `accept`:

- `alliance`: only from peace.
- `peace`: only once a war has run for 10 minutes, so wars cannot be declared and ended for free. Accepting peace also gives a 10-minute no-attack treaty.
- `non_aggression`: for a number of minutes.
- `faction_invite`: from the faction leader.

Proposals expire after 10 minutes.

### Breaking things

`leaveAlliance` and `breakTreaty` both start the 15-minute cooldown before war is allowed.

### Embargoes

`setEmbargo(owner, target, on)` is one-way. `blocksTransit(owner, traveller)` tells logistics (piece 7) and units (piece 15) whether the traveller may cross the owner's land and ports.

### Factions

- `createFaction`, `join` (up to 4 members), `leave` (starts a cooldown with each remaining member), and a leader who is replaced if they leave.
- Members are always allied, and cannot declare war on each other.
- `winnerKey` gives the faction id for piece 4's `checkVictory`.

### Wiring

`wireToWorld(world, dip)` makes the world's `hostile` and `passable` use diplomacy:

- Only `war` is hostile.
- Alliances can pass through each other's land.

## Steps

1. **Messages.** `declare_war`, `propose`, `accept`, `decline`, `leave_alliance`, `break_treaty`, `embargo`, `create_faction`, `leave_faction`. All go to the `Diplomacy` object, then broadcast the change.
2. **Diplomacy panel.**
   - A row per nation: flag, name and colour, relation icon (`dip_alliance`, `dip_war`, `dip_treaty`, `dip_embargo`, `dip_peace`), and action buttons.
   - Pending proposals, with accept and decline.
   - A war countdown on `war_pending` pairs.
3. **Faction panel.** Banner, members, leader, invite and leave. Faction chat comes from piece 13.
4. **Map feedback.**
   - Allied borders use a dashed style (`ov_border_dash`).
   - Countries at war with you get a red outline at the world zoom.
   - A war declaration against you raises `alert_attack` with the countdown.
5. **Shared vision.** Allies see each other's stacks. `sharesVision` is ready for when fog of war exists.
6. Save relations, proposals, embargoes and factions in the world's storage.

## Done when

- The tests pass.
- Nobody can be attacked without warning.
- Breaking an alliance and attacking straight away is impossible.
- Two players in a faction win together when everyone else is gone.

## Pitfalls

- Everything time-based uses world time, not wall clock, so catch-up and pauses behave.
- When a faction member leaves during a war declared on the faction, keep the war on the leaver too. It is simpler and fairer.
- Factions of 4 in an 8-player world can make the endgame two teams. That may be what you want. If not, make faction size a host setting (it already is in piece 14) and set 3.

## Open question

What else should an embargo do? The example blocks transit only, since there is no direct trade. An option is that the embargoed nation also pays a higher market fee while more than half the players embargo it.
