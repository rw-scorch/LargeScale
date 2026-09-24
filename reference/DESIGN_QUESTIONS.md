# Design questions

Every question round, with what was decided. Rounds 1 to 3 are answered. Round 4 is open. The resolved rules live in `README.md` for art and in the dev kit's `docs/design-decisions.md` for gameplay; this file is the record of how they were decided.

## Round 1: the shape of the game (50 questions, answered)

The first round settled the frame: a browser game for 2 to 8 invited friends, one persistent Earth world lasting days or weeks, territory owned pixel by pixel, troops as a number moved by hand as stacks, civilians who build and upgrade their own homes in zones the player paints, six eras on branching trees, physical goods, one automatic market, factions and a last-player-or-faction-standing win. Out: unrest, pollution, government types, internal politics, spying, manual player-to-player trade and portrait mobile.

Answers are written up in full in the dev kit under `docs/design-decisions.md`.

## Round 2: missile defence and geography (50 questions, answered)

| # | Question | Answer |
| --- | --- | --- |
| 1 | Air defence needs separate radar buildings, not launchers with built-in range | False |
| 2 | Destroying radar should weaken nearby launchers | False |
| 3 | Launchers hold limited missiles and must be reloaded from a depot | True |
| 4 | Overlapping defences stack, so several cheap sites beat one strong one | False |
| 5 | Firing reveals a site's position | True, but it can also be found by looking carefully or by a defence-borders toggle |
| 6 | Decoy sites are worth having | False |
| 7 | Interception is a dice roll, not a guaranteed stop | Yes, but enough defences stop a missile; overlapping SAMs combine their fire |
| 8 | Players see the interception chance before launching | True |
| 9 | Aircraft entering SAM coverage are engaged automatically | True, except allies and faction members; it is a chance, and plane upgrades cut the risk |
| 10 | Air defence also hits helicopters and drones | True |
| 11 | Nukes are interceptable | True |
| 12 | Conventional missiles are interceptable | True |
| 13 | A downed missile leaves debris on the ground | False |
| 14 | Future shields block everything for a time rather than rolling per hit | Yes, until the ammo runs out, then they reload |
| 15 | Shields cost power and fail if power is cut | True |
| 16 | Mobile launchers beat fixed ones | True |
| 17 | Air defence is expensive enough that nobody covers everything | Needs balancing: yes late, no early or mid |
| 18 | Everyone sees a launch alert | Yes, with a hitbox showing the blast radius |
| 19 | The target sees the impact point before it lands | True |
| 20 | Air defence needs trained crews from the population | False |
| 21 | Some terrain is completely impassable | False, it is only very slow |
| 22 | Some terrain blocks vehicles but allows infantry | Troops dismount and can return for the vehicle; all terrain can be destroyed with explosives |
| 23 | Cliffs and canyons are crossable only at marked points | True |
| 24 | A range can split the map into theatres | True, though ranges can be slowly destroyed |
| 25 | Passes are chokepoints a small force can hold | True |
| 26 | Holding a pass needs a building | False, the pass is just the terrain; a small gap lets a squad beat a larger force |
| 27 | Rivers need a bridge or ford for anything heavier than infantry | True |
| 28 | Bridges are destructible by their owner | True |
| 29 | Mountain roads are expensive but transform movement | True |
| 30 | Tunnels can bypass a pass later | True |
| 31 | Terrain gives defence bonuses as well as movement penalties | True |
| 32 | Forests hide troop numbers | True |
| 33 | High ground extends vision | No fog at all: the whole map is visible, like an RTS |
| 34 | Weather can close a pass completely | False |
| 35 | Supply costs more through rough terrain | True |
| 36 | Ships bypass mountains, making coasts valuable | True, they move about on water from place to place |
| 37 | Aircraft ignore terrain but need airfields near the front | True |
| 38 | Players can change terrain | True |
| 39 | Nukes and bombardment can wreck terrain and block a route | True |
| 40 | Landslides happen on their own | False |
| 41 | Terrain matters more than numbers in the early eras | True |
| 42 | Later eras reduce terrain's grip | True |
| 43 | The map shows movement cost with an overlay | A toggle, off by default |
| 44 | Players see a route's travel time before committing | True |
| 45 | Armies take the cheapest route unless told otherwise | True |
| 46 | Chokepoints are marked before you scout them | False |
| 47 | Scouting is needed to see enemy defences | False, OpenFront style, everything is visible |
| 48 | Fortifying a chokepoint is a main way to survive being weaker | True |
| 49 | Air defence and terrain combine into near-unbreakable ground | True |
| 50 | An attacker needs about three to one to break a prepared defence | Depends |

## Round 3: destruction, ammunition, information (32 questions, answered)

| # | Question | Answer |
| --- | --- | --- |
| 1 | Blasting terrain is a timed job rather than terrain having hit points | Hit points, so people can come and go. Players can also build terrain with ores |
| 2 | Only engineer units can do it | True |
| 3 | It costs a resource as well as time | Yes, with resources kept currency-like and simple |
| 4 | Destroyed mountain becomes rubble that is still slow | True, and the rubble can be cleared |
| 5 | A destroyed route is permanent | False, materials rebuild it |
| 6 | You can destroy terrain inside enemy territory | True |
| 7 | Destroying terrain in enemy land requires war | True |
| 8 | The defender is warned while the work happens | True |
| 9 | Engineers can build terrain up | True |
| 10 | Blowing a bridge or road is much faster than rock | True |
| 11 | Nukes and bombardment can open a pass by accident | True |
| 12 | Tunnels are a slower project that keeps the mountain | True |
| 13 | Missiles are a physical resource rather than bought with money | False |
| 14 | Running out means useless until a convoy arrives | True |
| 15 | Air defence uses the normal convoy and stockpile system | True |
| 16 | Cutting supply is a real way to break a defended area | True |
| 17 | Guns need shells, lasers need power | True |
| 18 | Ammunition state is visible to the owner only | True |
| 19 | Ammunition is spent per shot, so saturation drains it | True |
| 20 | Reloading is ordered by the player | False, troops restock their own defences |
| 21 | Everyone sees every building, defences included | True |
| 22 | Stack counts are visible to everyone | True |
| 23 | The market stops selling intelligence | True |
| 24 | The market sells forecasts instead | Not really: it sells planes, ships, resources, vehicles |
| 25 | Alerts are automatic when something is aimed at you | True |
| 26 | Players can mark and share map notes with allies | True |
| 27 | There is a public world log during the game | False, a log for the developer, public once the game is over |
| 28 | An enemy can re-crew an abandoned vehicle | True |
| 29 | Re-crewing needs a specific unit type | False |
| 30 | Abandoned vehicles decay into wrecks | False |
| 31 | Vehicles can be abandoned anywhere | True |
| 32 | Troops on foot move the same whether or not they left a vehicle | True |

Standing notes from this round: avoid hyper-management, build the game so it is easy to expand later, and allow player-made mods after servers are running. City cores make attack and defence stronger the closer a fight is to them. While offline, a nation produces its online average minus 10 percent and its troops defend 5 percent weaker.

## Round 4: the gaps that are left (50 questions, answered)

| # | Question | Answer |
| --- | --- | --- |
| 1 | Engineers are stopped from digging while an enemy stack is in range | False |
| 2 | Rubble can be cleared by whoever owns the plot | True |
| 3 | Digging shows as damaged-terrain art, not just a number | True |
| 4 | A mountain plot takes a team most of a session to break | No, about a minute at most |
| 5 | Player-built terrain is destructible by the same rules | True |
| 6 | Tunnels need an entrance building at both ends | True |
| 7 | Explosives are made in factories from ore | No: bought with money, or the engineer simply carries them |
| 8 | Rebuilding terrain costs more than destroying it | False |
| 9 | Missiles are made at a dedicated building | False, a general factory |
| 10 | An empty site still looks like a site to attackers | True |
| 11 | Air defence can fire on ground targets, badly | True |
| 12 | Losing radar shortens the warning time | Radars are not needed and should not exist |
| 13 | Shields protect an area, not one building | True |
| 14 | Anti-missile defence can escort an advance | True |
| 15 | Ores spendable as money removes the need for a trade screen | True |
| 16 | Gold is worth far more than other ores | True |
| 17 | The market has a delivery time | True |
| 18 | Buying a machine costs more than building it | Everything on the market is listed by players |
| 19 | The market refuses goods from an era you have not reached | True |
| 20 | Selling is capped per day | False |
| 21 | Prices are the same for everyone | False, each listing has its own price |
| 22 | Any high-value building counts toward a city core | True |
| 23 | A nation can have several cores | True |
| 24 | Losing a core weakens the whole nation | True |
| 25 | Cores grow on their own as population rises | True |
| 26 | The core bonus applies to bots too | True |
| 27 | Every repeated action gets a bulk button | True |
| 28 | Convoys get standing orders too | True |
| 29 | Recruitment can run to a target garrison automatically | True |
| 30 | Idle things are listed in one place | True |
| 31 | The interface works one-handed on a phone | False |
| 32 | Overlays cycle from one button | False, a menu |
| 33 | Research can be queued | True |
| 34 | The tutorial is a first world with a guide layer | True |
| 35 | New players get a small head start | False |
| 36 | Offline rules are explained before the first log off | True |
| 37 | A glossary is reachable from anywhere | False |
| 38 | Discord alerts are worth having | True |
| 39 | In-game push notifications are worth the work | True |
| 40 | Notifications limited to attacks, missiles, wars and messages | Depends on the player's settings |
| 41 | Players stay logged in for weeks on a phone | True |
| 42 | An eliminated player can keep watching | True |
| 43 | An eliminated player can join a friend's faction as a second commander | True |
| 44 | A beaten nation can surrender and become a vassal | True |
| 45 | A world has a planned end date, announced at the start | True |
| 46 | The log and map history become public when a world ends | True |
| 47 | Mods are data packs only at first | True |
| 48 | The host chooses which mods a world uses | True |
| 49 | Custom maps are shareable as files | True |
| 50 | The art stays one consistent 16 px style | True |

Consequences worth carrying into the code: no radar buildings at all, so the radar sprites become scenery; explosives are a money cost rather than a supply chain; terrain gives way in about a minute of work; the market is a board of player listings rather than a shop with its own stock; there is no daily selling cap and no single world price; and an eliminated player stays in the world as a spectator, a second commander or a vassal.
