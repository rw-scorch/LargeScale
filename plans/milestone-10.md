# Milestone 10: the Future era and cruise missiles

Written 30 September 2026, after milestone nine. Ryan asked to keep going until the project is done, so this plan is my reading of the design, for him to correct.

## What the design already says

- Eras end in a near future (`reference/docs/design-decisions.md`).
- Nukes and superweapons in Modern and Future, with interception, which the host can turn off.
- **Missile defence.**
  - Launchers work on their own, with no radar buildings.
  - Missiles can be intercepted.
  - Shields cover an area.
  - Anti-missile cover can move with an advance.
- **The later-eras guide (piece 16):**
  - Future buildings: arcology, dome habitat, eco tower, vertical farm, fusion reactor, shield generator, railgun battery, orbital uplink, orbital elevator.
  - Future units: hover tank, mech, VTOL gunship, drones.
  - "Keep it short: a few strong options, not a whole new game."
  - The orbital strike: radius 5, inner radius 2, a 10-second flight.
  - Shield generators stop missiles 80% of the time within 12 plots.
- The art kit has all of these, plus shield nodes, drone hangars, recon and strike drones, drone operators, and two Future wonders: the orbital elevator and the launch complex.

## My reading, for Ryan to correct

1. **Gold only**, as since milestone seven: missiles and every Future thing cost gold. There are no missile goods to carry.
2. **Cruise missiles are conventional, and Modern.**
   - Research Cruise missiles, and a missile silo can build them: cheap and quick next to a warhead.
   - One hits an area of about 2 plots:
     - troops there lose most of their men;
     - buildings are damaged;
     - no land is cleared or taken.
   - They fly like warheads and can be shot down the same way, but the launch is told only to the target, not the world.
3. **Future research is short:** the Future Age and about eight nodes after it, each unlocking one strong thing.
4. **The economy:**
   - The fusion reactor is a power plant with far more output and no fuel cost.
   - The arcology and dome habitat are dense housing that towns build by themselves, like skyscrapers.
   - The vertical farm is a farm that needs no fertile land.
   - The eco tower is a dense office.
   - The two Future wonders go on the Wonders tab.
5. **The army:**
   - Hover tank: the fastest land machine.
   - Mech: the strongest, and slow.
   - Drone operators: a Future troop type that is good against machines.
   - The drone hangar builds recon drones (fast and cheap, for patrols) and strike drones (a light bomber that needs no runway).
   - The VTOL gunship: the Future attack helicopter.
6. **Defences and superweapons:**
   - **Shield generator:** stops 80% of missiles and warheads landing within its cover, and halves bomb damage there. A shield node is a cheaper, smaller one.
   - **Railgun battery:** a building that shells hostile companies and machines in a long range by itself.
   - **Orbital uplink:** fires the orbital strike, a 10-second superweapon that clears land like a small nuke. It is one of the host's nuclear weapons, so turning nukes off turns it off too.
7. **Bots stay as they are.**

## The parts

### Part A: cruise missiles

- A `cruise` warhead in `rules.json` `nukes.warheads` with `conventional: true`, built in a missile silo after the Cruise missiles node.
- `detonate` gets a conventional branch: losses and damage only, no crater, no land cleared, and a smaller event (`missile_struck`).
- The launch goes only to the launcher and the target.
- The silo card lists it, and the feed reports it.

### Part B: the Future Age and its economy

- **Research:** the Future Age, Fusion power, Arcologies, Vertical farming, Shields, Railguns, Drones, Exo-armour and Orbital weapons.
- **Buildings:** fusion reactor, arcology, dome habitat, vertical farm, eco tower (it already exists, as a placeholder), and the orbital elevator and launch complex wonders.
- The planner proposes fusion power when a nation's grid is short.

### Part C: the Future army

- **Units:** hover tank, mech, drone operators, recon drone, strike drone and VTOL gunship.
- **The drone hangar:** an air base for drones only, and it needs no runway.
- The existing systems carry them: machines, planes, the `air` order, piloting.

### Part D: shields, railguns and orbital strikes

- **Shield generator and shield node.**
  - Placed like the SAM site, covering an area.
  - Interception at impact goes through `defencesAt`.
  - Bombs landing in the cover do half damage.
  - An overlay shows the cover.
- **Railgun battery:** shells hostile companies and machines within range every few seconds, like the battleship.
- **Orbital uplink:** an `orbital` warhead with a short flight. It can only be shot down by shields.
- **The planner** proposes shields near the capital once they are researched.

## Evidence for each part

- Unit tests for each rule, and the content checks (sprites, the research tree, descriptions).
- `npm test`, the reference tests, smoke, `npm run ui` and the soak on a dev server.
- `npm run bench` with Future content given to every player.
