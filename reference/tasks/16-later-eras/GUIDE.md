# Piece 16: Later eras

## Goal

Fill in Gunpowder, Industrial, Modern and the near Future:

- their buildings, units and tech
- tourism income
- nukes and superweapons

## Already decided

- Eras follow real history, ending in a near future.
- Ports, airports, CBDs, tourism, manufacturing.
- Nukes and superweapons, which the host can switch off.
- No pollution, so nuclear strikes leave craters and scorched ground, not lasting fallout.

## Depends on

Piece 9 (tech) and piece 15 (units).

## Example code

`example/nukes.js`, `example/tourism.js` and 4 tests.

### Nukes

- **Warheads.**

  | Warhead | Era | Radius | Inner radius | Flight | Cost |
  | --- | --- | --- | --- | --- | --- |
  | atomic | Modern | 8 | 3 | 60 s plus distance | 20,000 money and 40 uranium |
  | hydrogen | Modern | 14 | 5 | 75 s plus distance | 60,000 and 90 uranium |
  | orbital strike | Future | 5 | 2 | 10 s | 40,000 and 50 electronics |

- **`launch`** checks the host setting and that you are at war with the target's owner, then announces `nuke_launched` to everyone with the arrival time. Everyone seeing it is the point: it should cause a scramble.
- **`tryIntercept`** rolls each defence in range: SAM sites at 25 percent within 10 plots, shield generators at 80 percent within 12.
- **`detonate`** applies the blast:
  - inner ring: land becomes crater at the centre and scorched around it, ownership is cleared, buildings become rubble, residents are gone
  - outer ring: buildings are damaged and lose 70 percent of residents
  - stacks inside the inner ring die, and lose 60 percent in the outer ring

### Tourism

`tourismIncome(types, season, links)`:

- Each tourism building has a value, and some change with the season: beach resorts pay best in summer, ski resorts in winter.
- Wonders add 10 percent each.
- An airport adds 25 percent, a port 10 percent and rail 10 percent, because visitors have to get there.
- Variety is rewarded slightly over ten copies of the same thing.

## Content to write

The pack already has the sprites. What each era needs in `data/`:

| Era | Buildings | Units | Notes |
| --- | --- | --- | --- |
| Gunpowder | bank, theatre, school, courthouse, star fort, cannon foundry, harbour, shipyard | musketeer, grenadier, cannon, light cavalry, galleon, ship of the line | Money and banking matter here |
| Industrial | factories, textile mill, steel mill, coal plant, rail and stations, tenements, university, hospital | rifleman, machine gunner, artillery, early tank, biplane, steamship, ironclad, destroyer | Rail and coal are the theme |
| Modern | skyscrapers and CBD blocks, supermarket, mall, airport terminal, hangar, nuclear plant, refinery, container terminal, stadium, hospital | main battle tank, APC, jets, helicopters, carrier, submarine, SAM, missile silo | Tourism, logistics and air power |
| Future | arcology, dome habitat, eco tower, vertical farm, fusion reactor, shield generator, railgun battery, orbital uplink, orbital elevator | hover tank, mech, VTOL gunship, drones | Keep it short: a few strong options, not a whole new game |

**CBDs.** Rather than a new system, let commercial buildings upgrade into towers when:

- population nearby is high
- the era is Modern
- the plot is in a commercial zone with roads on two sides

That produces a natural downtown cluster from the rules you already have.

## Steps

1. Write the era nodes into `data/techtree.json` and validate with piece 9's checker, which will catch any sprite id typo.
2. Add the missing production chains: ore to steel at a steel mill, oil to fuel at a refinery, goods from factories. These make the later eras about logistics rather than more buildings.
3. Add silos, SAM sites and shield generators as placeable buildings, and wire them into `tryIntercept`.
4. **Nuke UI.**
   - A launch screen: pick a warhead, pick a target, confirm twice.
   - A world alert with a countdown for everyone.
   - `alert_nuke` and the `nuke_0` to `nuke_4` animation, plus the crater afterwards.
5. Tourism income into the treasury every economy tick, shown as its own line in the money panel, with the season effect visible.

## Balance thinking

- **Nukes should be a threat that shapes politics, not a way to win quietly.** The public launch warning, interception and the cost are what do that. A nuke costs about as much as a small army and takes uranium, which only exists in a few places on the map.
- **Ownership clearing in the inner ring means nukes do not take land.** They deny it. Good.
- **The Future era should be short and sharp.** By the time anyone gets there, the world is deciding a winner.

## Done when

- The tests pass.
- A nuke can be launched, seen by everyone, intercepted sometimes, and leaves a visible scar.
- A modern nation has a recognisable downtown, an airport and a container port.
- Tourism gives a real income to a peaceful player, and swings with the seasons.

## Pitfalls

- Do not let a nuke remove a nation outright: clearing ownership in the inner ring only, never the capital plot's owner if that would eliminate them, keeps the fight going.
- Watch the economy tipping into runaway: factories making goods that make money that builds factories. Cap it with input resources, which run out.
