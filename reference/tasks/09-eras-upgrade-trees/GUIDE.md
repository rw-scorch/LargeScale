# Piece 9: Eras and upgrade trees

## Goal

The climb from grass huts to arcologies:

- Four branching trees of upgrades per era.
- Research points to buy them.
- An "age of" node that moves a nation to the next era once it has enough upgrades across enough branches.

## Already decided

- Everyone starts Tribal.
- Eras follow real history and advance independently.
- Branching trees: military, economy, civic and government.
- Tribal and Medieval come first.
- Civilian self-upgrades are gated by era.

## Depends on

Piece 8. The tree unlocks buildings to place.

## Example code

- **`example/techtree.sample.json`.** A complete Tribal and Medieval tree: 28 nodes, 12 Tribal, 14 Medieval and 2 era nodes.
  - Every unlock refers to a real sprite in the pack, and the test checks this.
  - Era nodes carry `advances` and a `need` rule:
    - Age of Kingdoms needs 8 Tribal upgrades across 3 branches.
    - Age of Gunpowder needs 10 Medieval upgrades across 4 branches.
- **`example/techtree.js`.**
  - `validateTree` catches duplicates, unknown eras or branches, missing or later-era requirements, cycles, era nodes that skip an era, and unlocks with no sprite.
  - `available` lists what can be researched now.
  - `canResearch` explains why not, for example "needs 8 T upgrades across 3 branches (have 5 across 3)".
  - `setResearch` and `researchTick` spend points on the current node and carry leftover points to the next one. Points earned with nothing queued go into a bank, capped at 500, which pays into the next queued node.
  - `complete` adds the node, applies its effects, and moves the era for era nodes.
  - `unlockedBuildings` returns the set the build menu should show.
  - `researchRate` gives research points per second from population plus civic buildings, times research effects.
- 5 tests, including one that loads the real asset manifest.

## Node format

```json
{
  "id": "iron_working",
  "name": "Iron working",
  "branch": "military",
  "era": "M",
  "cost": 150,
  "requires": ["age_medieval"],
  "icon": "res_weapons",
  "unlocks": {
    "buildings": ["forge", "mine_pit"],
    "units": ["spearman", "swordsman"],
    "effects": { "defence": 0.05 },
    "zones": ["ind"],
    "features": ["market"]
  }
}
```

`effects` are named numbers the simulation reads, for example:

- `troop_cap` multiplies the cap by 1 plus the value
- `research` multiplies research
- `wood_rate` multiplies wood output
- `pop_growth`
- `defence`

Keep the list of effect names in `docs/data-formats.md` and have the simulation read only those names.

## Steps

1. Load the tree from `data/techtree.json` on the server. Validate it at startup and refuse to start with errors.
2. **Research panel.**
   - A four-column tree with era rows, drawn with `tech_node_locked`, `tech_node_available`, `tech_node_in_progress` and `tech_node_researched`.
   - Lines between nodes, and each node's icon.
   - Tapping a node shows its cost, what it unlocks with sprite thumbnails, and why it cannot be researched yet.
3. **Research points.** 0.2 per second base, plus 0.002 per person, plus civic buildings. Starting values:

   | Building | Points per second |
   | --- | --- |
   | `shrine` | 0.3 |
   | `temple` | 0.8 |
   | `library` | 1.5 |
   | `university` | 4 |
   | `research_lab` | 10 |

   With about 100 people, a Tribal nation earns about 0.4 per second, and a 250-point era node takes about 10 minutes of pure research once its requirements are done.
4. **Era change.**
   - Announce it to everyone, since others seeing a rival reach the next age matters.
   - Play `era_up` on the capital.
   - Swap the army marker style (`army_<era>_*`) and the convoy capacity (piece 7).
5. **Write the other four eras.** The same shape, with nodes unlocking the pack's Gunpowder, Industrial, Modern and Future buildings and units. Run `validateTree` with the sprite list, and it will catch every typo.

## Balance thinking

- **Era length.** On a world lasting two to three weeks, a sensible pace:

  | Era | Length |
  | --- | --- |
  | Tribal | a few hours |
  | Medieval | about a day |
  | Gunpowder | two days |
  | Industrial | three days |
  | Modern | the rest |
  | Future | reachable only by the leaders near the end |

  Set node costs to hit that with a typical nation's research rate, and tune with the dev panel (piece 14).
- **Needing branches** stops a pure military rush from skipping the economy.
- **Buying upgrades on the market** (piece 10) lets those who fall behind catch up at a price, which keeps the laggards in the game.

## Done when

- The tests pass.
- A new nation can research through Tribal into Medieval, and sees new buildings appear in its build menu.
- Its huts begin upgrading to cottages without help.

## Pitfalls

- Never trust the client's view of what is unlocked. Check `unlockedBuildings` on the server for every build.
- Changing the tree mid-world through the dev panel must not break nations: never remove a node anyone knows. Adding nodes and changing costs is safe.
