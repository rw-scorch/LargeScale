from specs_a import B

# agriculture
B("orchard", "agriculture", "M", (1, 1), states=False, ground="lawn", parts=[], objs=[("tree", 3, 3, "leaf", 2.4), ("tree", 11, 3, "leaf", 2.4), ("tree", 3, 11, "leaf", 2.4), ("tree", 11, 11, "leaf", 2.4)],
  post=[("rect", 2, 2, 1, 1, "red"), ("rect", 12, 4, 1, 1, "red"), ("rect", 4, 12, 1, 1, "red"), ("rect", 10, 10, 1, 1, "red")])
B("vineyard", "agriculture", "M", (1, 1), states=False, ground="dirt", items=[("rows", 1, 2, 14, 12, "leaf"), ("rows", 3, 2, 1, 12, "purple"), ("rows", 9, 2, 1, 12, "purple")])
B("pasture_sheep", "agriculture", "T", (1, 1), states=False, ground="lawn", items=[("fence", 0, 0, 16, 16), ("sheep", [(3, 3), (9, 5), (5, 10), (11, 11)])])
B("pasture_cattle", "agriculture", "T", (1, 1), states=False, ground="lawn", items=[("fence", 0, 0, 16, 16), ("cattle", [(2, 3), (9, 6), (4, 11)])])
B("pasture_pigs", "agriculture", "T", (1, 1), states=False, ground="dirt", items=[("fence", 0, 0, 16, 16), ("rect", 3, 4, 3, 2, "pink"), ("rect", 9, 8, 3, 2, "pink"), ("rect", 5, 11, 3, 2, "pink"), ("disc", 11, 3, 1.5, "mud")])
B("pasture_chickens", "agriculture", "T", (1, 1), states=False, ground="dirt", items=[("fence", 0, 0, 16, 16), ("rect", 3, 3, 1, 1, "white"), ("rect", 8, 5, 1, 1, "white"), ("rect", 11, 10, 1, 1, "white"), ("rect", 5, 11, 1, 1, "wood_l"), ("rect", 10, 3, 1, 1, "white")])
B("barn", "agriculture", "G", (1, 1), roof="gable", roofc="slate", rmat="slate", wall="wood", wallc="red", wall_rows=6, win="none", door="wide")
B("ranch", "agriculture", "G", (2, 2), ground="lawn", parts=[dict(body=(1, 1, 14, 13), roof="gable", roofc="slate", rmat="slate", wall="wood", wallc="red", wall_rows=5, win="none", door="wide")],
  items=[("fence", 16, 1, 15, 30), ("fence", 1, 16, 15, 15), ("cattle", [(19, 5), (24, 12), (20, 22), (5, 21)]), ("hay", 10, 23)])
B("granary", "agriculture", "M", (1, 1), roof="cone", roofc="thatch", rmat="thatch", wall_rows=2, wallc="stone", body=(2, 1, 13, 14))
B("grain_windmill", "agriculture", "M", (1, 1), up=5, roof="gable", roofc="wood", rmat="shingle", wall="stone", wallc="stone_l", wall_rows=6, body=(4, 2, 11, 14), win="small", extras=[("sails",)])
B("fishing_hut", "agriculture", "T", (1, 1), parts=[dict(body=(1, 1, 9, 9), roof="cone", roofc="thatch", rmat="thatch", wall_rows=0)], items=[("dock", 9, 6, 7, 3)], objs=[("boat", 8, 12, "wood")])
B("fishing_dock", "agriculture", "M", (1, 1), states=False, items=[("dock", 2, 0, 5, 16), ("dock", 7, 6, 7, 3), ("crates", 2, 1, 1)], objs=[("boat", 8, 11, "wood", True)])
B("fish_farm", "agriculture", "Mo", (2, 2), states=False, ground="water", items=[("ringi", 9, 9, 6.5, "metal_l", 1), ("ringi", 23, 9, 6.5, "metal_l", 1), ("ringi", 9, 23, 6.5, "metal_l", 1), ("ringi", 23, 23, 6.5, "metal_l", 1), ("dock", 15, 0, 2, 32)])
B("greenhouse", "agriculture", "I", (2, 1), roof="glassroof", wall="glass", wallc="glass_l", wall_rows=4, win="none", door="glass", extras=[("garden", 10)])
B("vertical_farm", "agriculture", "F", (2, 2), up=22, roof="flat", roofc="green", wall="glass", wallc="green_d", wall_rows=24, win="none", door="glass", extras=[("greenery",), ("glow", "neon2")])

# energy and utilities
B("firewood_pile", "energy", "T", (1, 1), states=False, items=[("logs", 2, 4, 4), ("logs", 8, 7, 3), ("rock", 11, 2)])
B("watermill", "energy", "M", (1, 1), roof="gable", roofc="wood", rmat="shingle", wall="stone", wallc="stone", wall_rows=5, body=(1, 1, 10, 14), items=[("rect", 11, 0, 5, 16, "water")], post=[("wheel", 12, 9, 4)])
B("coal_plant", "energy", "I", (3, 2), rise=14, ground="gravel", parts=[dict(body=(1, 8, 34, 30), roof="flat", roofc="brick_d", wall="brick", wallc="brick", wall_rows=11, door="wide", extras=[("smokestack", 4, -14, 3, "brick"), ("smokestack", 14, -14, 3, "brick"), ("smokestack", 24, -14, 3, "brick")])],
  items=[("disc", 42, 22, 5, "black"), ("disc", 41, 21, 3, "dgrey")])
B("oil_plant", "energy", "Mo", (2, 2), rise=8, ground="paving", parts=[dict(body=(1, 12, 20, 30), roof="flat", roofc="metal_d", wall="metal", wallc="metal", wall_rows=7, door="wide", extras=[("smokestack", 14, -8, 2, "metal")])],
  objs=[("cyl", 26, 3, 4, 5, "offwhite"), ("cyl", 26, 17, 4, 5, "offwhite")])
B("gas_power", "energy", "Mo", (2, 2), rise=12, roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=8, door="wide", extras=[("smokestack", 22, -12, 3, "metal"), ("ac", 3)])
B("hydro_dam", "energy", "I", (3, 1), items=[("rect", 0, 0, 48, 7, "water_d")], parts=[dict(body=(0, 5, 47, 13), roof="flat", roofc="concrete_l", wall="concrete", wallc="concrete", wall_rows=4, win="none", door="none")],
  post=[("rect", 18, 14, 12, 2, "white"), ("rect", 20, 12, 8, 2, "water_l")])
B("solar_farm", "energy", "Mo", (2, 2), states=False, ground="lawn", items=[("panels", 1, 2, 30, 28)])
B("wind_turbine", "energy", "Mo", (1, 1), rise=14, parts=[], items=[("ln", 9, 14, 15, 9, (0, 0, 0, 60)), ("disc", 8, 14, 1.8, "concrete"), ("rect", 7, -6, 2, 20, "offwhite"), ("rect", 8, -6, 1, 20, "lgrey")],
  objs=[("turbine", 8, -7, 7, .4)], boxes=[(1, -14, 15, 14)],
  frames=[{"objs": [("turbine", 8, -7, 7, .4 + 2.094 / 3)]}, {"objs": [("turbine", 8, -7, 7, .4 + 2 * 2.094 / 3)]}], night=[("rect", 8, -8, 1, 1, "beacon")])
B("nuclear_plant", "energy", "Mo", (3, 3), ground="paving", parts=[
    dict(body=(2, 26, 30, 45), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=7, door="wide", extras=[("ac", 3)]),
], rise=10, objs=[("cooling", 11, -9, 8, 22), ("cooling", 30, -6, 8, 20)],
  post=[("disc", 39, 36, 6, "concrete_l"), ("disc", 38, 35, 4.5, "offwhite")])
B("fusion_reactor", "energy", "F", (3, 3), ground="paving", items=[("disc", 24, 24, 19, "metal_d"), ("disc", 24, 24, 17, "metal"), ("ringi", 24, 24, 13, "neon2", 3), ("disc", 24, 24, 7, "metal_l"), ("disc", 24, 24, 3, "white")])
B("power_pole", "energy", "I", (1, 1), states=False, items=[("rect", 7, 3, 2, 11, "wood"), ("rect", 3, 4, 10, 1, "wood_d"), ("rect", 3, 3, 1, 1, "lgrey"), ("rect", 12, 3, 1, 1, "lgrey")])
B("substation", "energy", "Mo", (1, 1), ground="gravel", parts=[], items=[("rect", 2, 3, 4, 4, "metal"), ("rect", 9, 3, 4, 4, "metal"), ("rect", 2, 9, 4, 4, "metal"), ("rect", 9, 9, 4, 4, "metal"), ("fence", 0, 0, 16, 16, "metal_d"), ("rect", 3, 4, 2, 1, "yellow")])
B("well", "energy", "T", (1, 1), rise=4, parts=[], items=[("disc", 8, 10, 5, "stone"), ("disc", 8, 10, 3.2, "stone_d"), ("disc", 8, 10, 2.4, "water_d")],
  post=[("rect", 3, 1, 1, 10, "wood_d"), ("rect", 12, 1, 1, 10, "wood_d"), ("poly", [(1, 2), (8, -4), (15, 2)], "wood"), ("poly", [(8, -4), (15, 2), (8, 2)], "wood_d"), ("rect", 4, 3, 8, 1, "wood_l"), ("rect", 7, 4, 2, 3, "wood")], boxes=[(1, -4, 14, 14)])
B("water_tower", "energy", "I", (1, 1), rise=10, parts=[], objs=[("lattice", 4, -1, 7, 15, "metal_d"), ("cyl", 8, -10, 5, 5, "metal_l")], boxes=[(3, -10, 12, 14)])
B("aqueduct", "energy", "M", (1, 1), states=False, items=[("rect", 0, 4, 16, 3, "water"), ("rect", 0, 3, 16, 1, "stone_l"), ("rect", 0, 7, 16, 5, "stone"), ("clear", 2, 9, 4, 3), ("clear", 10, 9, 4, 3)])
B("water_treatment", "energy", "Mo", (2, 2), ground="paving", parts=[dict(body=(1, 1, 14, 12), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=4)],
  items=[("basin", 24, 7, 6), ("basin", 8, 23, 6), ("basin", 23, 23, 6)])
B("sewage_plant", "energy", "Mo", (2, 2), ground="paving", parts=[dict(body=(1, 1, 14, 12), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=4)],
  items=[("basin", 24, 7, 6, "mud"), ("basin", 8, 23, 6, "mud"), ("basin", 23, 23, 6, "olive")])
B("landfill", "energy", "Mo", (2, 2), states=False, ground="dirt", items=[("disc", 16, 16, 13, "dirt_d"), ("disc", 15, 15, 10, "olive_d"), ("disc", 12, 12, 5, "grey"), ("rect", 18, 10, 3, 2, "blue"), ("rect", 9, 18, 2, 2, "red"), ("car", 25, 25, "yellow")])
B("recycling_centre", "energy", "Mo", (2, 1), roof="flat", roofc="green", wall="metal", wallc="metal_l", wall_rows=6, door="garage", extras=[("ac", 2)])

# civic and government
B("chieftain_hut", "civic", "T", (2, 2), ground="dirt", parts=[dict(body=(3, 2, 24, 23), roof="cone", roofc="thatch", rmat="thatch", wall_rows=3, wallc="mud")],
  items=[("fire", 25, 26)], post=[("rect", 28, 12, 1, 12, "wood_d"), ("rect", 28, 12, 1, 2, "red"), ("rect", 28, 14, 1, 2, "yellow"), ("rect", 28, 16, 1, 2, "teal")])
B("great_hall", "civic", "M", (2, 2), roof="gable", roofc="wood_d", rmat="shingle", wall="log", wallc="wood", wall_rows=9, door="double", body=(1, 3, 30, 28), extras=[("banners",), ("flag", 14, -2)])
B("town_hall", "civic", "G", (2, 2), rise=10, roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=10, door="double", extras=[("tower", 12, 6, -10, 16, "stone_l", "slate"), ("flag", 3, 1)])
B("palace", "civic", "G", (3, 3), ground="lawn", parts=[
    dict(body=(1, 10, 15, 36), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=10),
    dict(body=(32, 10, 46, 36), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=10),
    dict(body=(12, 4, 35, 38), roof="flat", roofc="stone", wall="stone", wallc="plaster", wall_rows=12, door="double", extras=[("dome", "gold", 7, -2), ("columns",), ("flag", 3, 0)]),
], post=[("path", 21, 39, 6, 9, "stone_l")], objs=[("fountain", 10, 42, 3), ("fountain", 38, 42, 3)])
B("parliament", "civic", "I", (3, 3), ground="paving", parts=[
    dict(body=(2, 12, 45, 40), roof="flat", roofc="stone", wall="stone", wallc="stone_l", wall_rows=12, door="double", win="row", extras=[("columns",), ("dome", "metal_l", 8, -1), ("flag", 3, 0), ("flag", 40, 0)]),
])
B("capitol_future", "civic", "F", (3, 3), ground="paving", parts=[
    dict(body=(3, 14, 44, 42), roof="flat", roofc="white", wall="glass", wallc="glass", wall_rows=10, door="glass", extras=[("dome", "glass_l", 11, -1), ("glow", "neon2"), ("flag", 3, 0)]),
])
B("courthouse", "civic", "G", (2, 1), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=7, win="none", door="double", extras=[("columns",)])
B("tax_office", "civic", "I", (1, 1), up=4, roof="flat", roofc="stone_d", wall="stone", wallc="stone", wall_rows=9, door="double", extras=[("sign", "gold", 0)])
B("embassy", "civic", "Mo", (2, 1), ground="lawn", roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=6, door="glass", body=(3, 1, 28, 11), extras=[("flag", 2, 1), ("flag", 20, 1)], items=[("path", 13, 12, 6, 4, "concrete_l")])
B("prison", "civic", "I", (2, 2), ground="gravel", parts=[dict(body=(6, 5, 25, 22), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=8, win="slit", door="std")],
  items=[("fence", 0, 0, 32, 32, "concrete_d"), ("fence", 2, 2, 28, 28, "metal_l"), ("rect", 0, 0, 3, 3, "concrete"), ("rect", 29, 0, 3, 3, "concrete"), ("rect", 0, 29, 3, 3, "concrete"), ("rect", 29, 29, 3, 3, "concrete")])
B("guardhouse", "civic", "M", (1, 1), roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone", wall_rows=5, win="slit", extras=[("flag", 2, 0)])
B("police_station", "civic", "I", (1, 1), roof="flat", roofc="navy", wall="brick", wallc="brick", wall_rows=8, door="double", extras=[("sign", "blue", 0), ("flag", 2, 1)])
B("police_hq", "civic", "Mo", (2, 1), ground="asphalt", roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=7, win="band", door="glass", body=(1, 1, 30, 12), extras=[("sign", "blue", 0), ("antenna", 25)],
  items=[("car", 4, 13, "blue"), ("car", 10, 13, "white"), ("car", 18, 13, "blue")])
B("fire_station", "civic", "I", (2, 1), roof="flat", roofc="brick_d", wall="brick", wallc="brick", wall_rows=7, win="row", win_rows=1, doors=[4, 12, 20], doorc="red", extras=[("sign", "red", 0)])
B("healer_hut", "civic", "T", (1, 1), ground="dirt", parts=[dict(body=(2, 1, 13, 12), roof="cone", roofc="thatch", rmat="thatch", wall_rows=2, wallc="mud")], items=[("rect", 1, 13, 3, 2, "leaf"), ("rect", 11, 13, 3, 2, "leaf_l"), ("rect", 12, 13, 1, 1, "pink")])
B("clinic", "civic", "I", (1, 1), roof="flat", roofc="offwhite", wall="plaster", wallc="white", wall_rows=7, door="glass", extras=[("clinic",)])
B("hospital", "civic", "Mo", (2, 2), up=8, roof="flat", roofc="offwhite", wall="plaster", wallc="white", wall_rows=14, win="band", door="glass", extras=[("helipad",), ("clinic",)])
B("school", "civic", "G", (2, 1), roof="gable", roofc="tile", wall="brick", wallc="brick", wall_rows=7, door="double", rise=6, extras=[("flag", 3, 0), ("tower", 13, 5, -6, 7, "brick_l", "slate")])
B("university", "civic", "I", (3, 2), ground="lawn", roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=10, door="double", body=(1, 1, 46, 25), rise=10, extras=[("tower", 21, 6, -10, 14, "stone_l", "slate"), ("flag", 3, 1)],
  items=[("path", 21, 26, 6, 6, "stone_l")])
B("library", "civic", "G", (2, 1), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=7, win="none", door="double", extras=[("columns",)])
B("research_lab", "civic", "Mo", (2, 2), up=4, roof="flat", roofc="concrete_l", wall="concrete", wallc="concrete_l", wall_rows=8, win="band", door="glass", extras=[("dome", "white", 6, -1), ("antenna", 26)])
B("shrine", "civic", "T", (1, 1), ground="gravel", parts=[dict(body=(3, 3, 12, 12), roof="pyramid", roofc="red", rmat="tile", wall="wood", wallc="wood_d", wall_rows=3, win="none", door="small")], items=[("rect", 2, 13, 12, 2, "stone_l")])
B("temple", "civic", "M", (2, 2), ground="paving", roof="hip", roofc="tile_d", wall="stone", wallc="stone_l", wall_rows=9, win="none", door="double", body=(2, 3, 29, 26), extras=[("columns",)], items=[("rect", 1, 27, 30, 3, "stone_l")])
B("cathedral", "civic", "G", (2, 3), roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone", wall_rows=12, win="slit", door="arch", body=(3, 1, 28, 46), rise=16, extras=[("tower", 11, 10, -16, 36, "stone", "slate")])
B("cemetery", "civic", "M", (1, 1), states=False, ground="lawn", items=[("headstones", 2, 2, 12, 11), ("fence", 0, 0, 16, 16, "stone_d")])
B("obelisk", "civic", "M", (1, 1), rise=8, ground="paving", parts=[], objs=[("obelisk", 8, -7, 20)], boxes=[(5, -7, 11, 14)])
B("statue", "civic", "G", (1, 1), ground="paving", parts=[], objs=[("statue", 7, 3)], boxes=[(4, 3, 11, 13)])
