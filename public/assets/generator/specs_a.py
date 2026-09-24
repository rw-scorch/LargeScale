SPECS = []


def B(sid, cat, era, fp, states=True, **kw):
    kw["fp"] = fp
    kw["era"] = era
    SPECS.append((sid, cat, era, fp, states, kw))


# housing
B("hut_grass", "housing", "T", (1, 1), roof="cone", roofc="thatch", rmat="thatch", wall_rows=0, body=(2, 2, 13, 13))
B("hut_mud", "housing", "T", (1, 1), roof="cone", roofc="straw_d", rmat="thatch", wall_rows=2, wallc="mud", body=(2, 1, 13, 14))
B("yurt", "housing", "T", (1, 1), roof="cone", roofc="canvas", rmat="canvas", wall_rows=2, wallc="canvas_d", body=(2, 1, 13, 14))
B("longhouse", "housing", "T", (2, 1), roof="gable", roofc="thatch", rmat="thatch", wall="log", wallc="wood", wall_rows=5, body=(1, 2, 30, 14))
B("cottage_timber", "housing", "M", (1, 1), roof="gable", roofc="thatch", rmat="thatch", wall="timber", wall_rows=5, extras=[("chimney", 9, 1)])
B("cottage_stone", "housing", "M", (1, 1), roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone", wall_rows=5)
B("farmhouse", "housing", "M", (2, 1), roof="gable", roofc="tile", wall="timber", wall_rows=6, extras=[("chimney", 22, 1), ("chimney", 4, 1)])
B("townhouse", "housing", "M", (1, 1), up=3, roof="gable", roofc="tile_d", wall="plaster", wallc="plaster", wall_rows=7, body=(2, 1, 13, 14))
B("house_brick", "housing", "G", (1, 1), roof="gable", roofc="tile", wall="brick", wallc="brick", wall_rows=6, extras=[("chimney", 2, 1, "brick")])
B("row_houses", "housing", "G", (2, 1), roof="gable", roofc="slate", rmat="slate", wall="brick", wallc="brick", wall_rows=6, win="small", doors=[3, 10, 17, 24], extras=[("chimney", 6, 1, "brick"), ("chimney", 20, 1, "brick")])
B("manor", "housing", "G", (2, 2), ground="lawn", roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=9, body=(3, 2, 28, 22),
  items=[("path", 14, 22, 4, 10, "dirt_l"), ("tree", 1, 25), ("tree", 26, 25), ("tree", 5, 27)], extras=[("chimney", 4, 2), ("chimney", 20, 2)])
B("tenement", "housing", "I", (1, 1), up=6, roof="flat", roofc="brick_d", wall="brick", wallc="brick", wall_rows=10, extras=[("vents", 2), ("chimney", 9, 1, "brick")])
B("terrace", "housing", "I", (2, 1), roof="gable", roofc="slate_l", rmat="slate", wall="brick", wallc="brick_l", wall_rows=7, win="small", doors=[2, 9, 16, 23])
B("worker_housing", "housing", "I", (2, 2), up=8, roof="flat", roofc="concrete_d", wall="brick", wallc="brick", wall_rows=16, extras=[("vents", 4), ("chimney", 4, 2, "brick"), ("chimney", 22, 2, "brick")])
B("house_suburban", "housing", "Mo", (1, 1), ground="lawn", roof="hip", roofc="dgrey", rmat="shingle", wall="plaster", wallc="offwhite", wall_rows=5, door="garage", body=(1, 1, 14, 12), items=[("path", 5, 13, 6, 3, "concrete")])
B("apartment_block", "housing", "Mo", (2, 2), up=12, roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=18, win="grid", door="glass", extras=[("ac", 3)])
B("high_rise", "housing", "Mo", (2, 2), up=24, roof="flat", roofc="metal_d", wall="glass", wallc="glass", wall_rows=23, win="none", door="glass", extras=[("antenna", 20), ("ac", 2)])
B("villa", "housing", "Mo", (2, 2), ground="lawn", roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=7, win="band", door="glass", body=(2, 2, 22, 17),
  items=[("pool", 18, 22, 11, 6), ("tree", 2, 22), ("tree", 7, 25), ("path", 10, 18, 4, 14, "concrete_l")])
B("eco_tower", "housing", "F", (2, 2), up=24, roof="flat", roofc="green_d", wall="glass", wallc="teal", wall_rows=22, win="none", door="glass", extras=[("greenery",)])
B("arcology", "housing", "F", (3, 3), ground="paving", parts=[
    dict(up=26, body=(14, 1, 33, 18), roof="flat", roofc="glass_l", wall="glass", wallc="teal", wall_rows=10, win="none", door="none", extras=[("antenna", 9)]),
    dict(up=12, body=(6, 8, 41, 32), roof="flat", roofc="green_d", wall="glass", wallc="glass", wall_rows=14, win="none", door="none", extras=[("greenery",)]),
    dict(body=(1, 22, 46, 45), roof="flat", roofc="concrete_l", wall="glass", wallc="glass_d", wall_rows=12, win="band", door="glass", extras=[("glow", "neon2")]),
])
B("dome_habitat", "housing", "F", (2, 2), ground="paving", roof="flat", roofc="concrete_l", wall="concrete", wallc="concrete_l", wall_rows=4, win="none", door="glass", extras=[("dome", "glass_l", 12, 1), ("glow", "neon2")])

# commercial
B("market_stall", "commercial", "T", (1, 1), ground="dirt", roof="stripes", roofc="red", wall_rows=0, body=(2, 2, 13, 9), items=[("crates", 2, 11, 2), ("crates", 9, 11, 2)])
B("trading_post", "commercial", "M", (1, 1), roof="gable", roofc="wood", rmat="shingle", wall="log", wallc="wood_l", wall_rows=5, extras=[("sign", "wood_d")])
B("general_store", "commercial", "G", (1, 1), roof="gable", roofc="wood_d", rmat="shingle", wall="wood", wallc="wood_l", wall_rows=7, win="shop", door="std", extras=[("awning", "green")])
B("bakery", "commercial", "M", (1, 1), roof="gable", roofc="tile", wall="timber", wall_rows=5, extras=[("chimney", 3, 1), ("sign", "gold")])
B("tavern", "commercial", "M", (2, 1), roof="gable", roofc="slate", rmat="slate", wall="timber", wall_rows=6, extras=[("sign", "wood"), ("chimney", 20, 1)])
B("inn", "commercial", "M", (2, 1), roof="gable", roofc="tile", wall="timber", wall_rows=7, extras=[("sign", "gold"), ("chimney", 5, 1)])
B("restaurant", "commercial", "G", (1, 1), roof="gable", roofc="tile", wall="brick", wallc="brick", wall_rows=7, win="shop", door="std", extras=[("awning", "red")])
B("cafe", "commercial", "Mo", (1, 1), roof="flat", roofc="concrete_l", wall="plaster", wallc="plaster", wall_rows=7, win="shop", door="glass", extras=[("awning", "teal")])
B("bar", "commercial", "I", (1, 1), roof="flat", roofc="brick_d", wall="brick", wallc="brick_d", wall_rows=7, win="shop", door="std", extras=[("awning", "navy"), ("neon", "neon")])
B("fast_food", "commercial", "Mo", (1, 1), roof="flat", roofc="red", wall="plaster", wallc="yellow", wall_rows=6, win="shop", door="glass", extras=[("sign", "red", 0)])
B("fine_dining", "commercial", "Mo", (1, 1), roof="flat", roofc="black", wall="stone", wallc="dgrey", wall_rows=7, win="shop", door="std", extras=[("awning", "navy"), ("sign", "gold", 0)])
B("shop", "commercial", "I", (1, 1), roof="flat", roofc="brick_d", wall="brick", wallc="brick", wall_rows=7, win="shop", door="std", extras=[("awning", "blue")])
B("supermarket", "commercial", "Mo", (2, 2), ground="asphalt", roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=7, win="shop", door="glass", body=(1, 1, 30, 17), extras=[("ac", 3), ("sign", "red", 0)],
  items=[("parking", 1, 20, 30, 10)])
B("department_store", "commercial", "I", (2, 2), up=6, roof="flat", roofc="stone_d", wall="stone", wallc="stone_l", wall_rows=15, win="shop", door="glass", extras=[("awning", "gold"), ("flag", 3, 1)])
B("mall", "commercial", "Mo", (3, 3), ground="asphalt", roof="flat", roofc="concrete", wall="concrete", wallc="concrete_l", wall_rows=8, win="shop", door="glass", body=(2, 2, 45, 29), extras=[("skylight",), ("ac", 4)],
  items=[("parking", 2, 33, 44, 12)])
B("car_dealership", "commercial", "Mo", (2, 2), ground="asphalt", roof="flat", roofc="metal_d", wall="glass", wallc="glass", wall_rows=7, win="none", door="glass", body=(1, 1, 30, 15),
  items=[("car", 3, 20, "red"), ("car", 8, 20, "blue"), ("car", 13, 20, "white"), ("car", 18, 20, "yellow"), ("car", 23, 20, "dgrey"), ("car", 3, 25, "teal"), ("car", 8, 25, "red"), ("car", 13, 25, "offwhite")])
B("gas_station", "commercial", "Mo", (2, 1), ground="asphalt", parts=[
    dict(body=(1, 1, 17, 9), roof="flat", roofc="red", wall_rows=0, extras=[("glow", "white")]),
    dict(body=(20, 3, 30, 13), roof="flat", roofc="concrete_l", wall="plaster", wallc="white", wall_rows=5, win="shop", door="glass"),
], post=[("pumps", 3, 11, 3)])
B("bank_early", "commercial", "G", (2, 1), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=7, win="none", door="double", extras=[("columns",)])
B("bank_modern", "commercial", "Mo", (2, 2), up=16, roof="flat", roofc="metal_d", wall="glass", wallc="glass_d", wall_rows=20, win="none", door="glass", extras=[("sign", "gold", 1), ("ac", 2)])
B("stock_exchange", "commercial", "I", (2, 2), roof="flat", roofc="stone", wall="stone", wallc="stone_l", wall_rows=12, win="none", door="double", extras=[("columns",), ("flag", 3, 1), ("flag", 25, 1)])
B("office_small", "commercial", "I", (1, 1), up=6, roof="flat", roofc="stone_d", wall="brick", wallc="brick_l", wall_rows=10, door="glass", extras=[("vents", 2)])
B("office_mid", "commercial", "Mo", (2, 2), up=12, roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=18, win="band", door="glass", extras=[("ac", 3)])
B("skyscraper_a", "commercial", "Mo", (2, 2), up=32, roof="flat", roofc="metal_d", wall="glass", wallc="glass", wall_rows=26, win="none", door="glass", extras=[("antenna", 14)])
B("skyscraper_b", "commercial", "Mo", (2, 2), up=28, roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=25, win="grid", door="glass", extras=[("helipad",)])
B("skyscraper_c", "commercial", "Mo", (2, 2), parts=[
    dict(up=30, body=(7, 1, 24, 16), roof="flat", roofc="metal_d", wall="glass", wallc="glass_d", wall_rows=10, win="none", door="none", extras=[("antenna", 9)]),
    dict(up=10, body=(1, 12, 30, 30), roof="flat", roofc="metal", wall="glass", wallc="glass", wall_rows=14, win="none", door="glass"),
])
B("skyscraper_d", "commercial", "F", (2, 2), up=34, roof="flat", roofc="green_d", wall="glass", wallc="teal", wall_rows=26, win="none", door="glass", extras=[("glow", "neon2"), ("garden", 8), ("antenna", 20)])
B("corporate_hq", "commercial", "F", (3, 3), ground="paving", parts=[
    dict(up=34, body=(11, 1, 36, 32), roof="flat", roofc="metal_d", wall="glass", wallc="glass_d", wall_rows=24, win="none", door="none", extras=[("helipad",)]),
    dict(body=(1, 28, 46, 45), roof="flat", roofc="concrete_l", wall="glass", wallc="glass", wall_rows=9, win="none", door="glass", extras=[("glow", "neon2")]),
])
B("motel", "commercial", "Mo", (2, 1), ground="asphalt", roof="flat", roofc="concrete", wall="plaster", wallc="plaster", wall_rows=6, win="small", doors=[3, 9, 15, 21, 27], body=(1, 1, 30, 11),
  extras=[("neon", "neon")], items=[("car", 4, 13, "red"), ("car", 16, 13, "blue")])
B("hotel", "commercial", "I", (2, 2), up=10, roof="flat", roofc="brick_d", wall="brick", wallc="brick_l", wall_rows=18, door="double", extras=[("awning", "red"), ("flag", 4, 1), ("flag", 24, 1)])
B("luxury_hotel", "commercial", "Mo", (2, 2), up=20, roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=24, win="band", door="glass", extras=[("helipad",), ("sign", "gold", 1)])
B("cinema", "commercial", "I", (2, 1), roof="flat", roofc="brick_d", wall="brick", wallc="brick", wall_rows=8, win="none", door="double", extras=[("marquee", "gold")])
B("theatre", "commercial", "G", (2, 1), roof="hip", roofc="tile_d", wall="stone", wallc="stone_l", wall_rows=8, win="none", door="double", extras=[("columns",)])
B("nightclub", "commercial", "Mo", (1, 1), roof="flat", roofc="black", wall="concrete", wallc="dgrey", wall_rows=7, win="none", door="std", extras=[("neon", "neon"), ("glow", "neon2")])
B("casino", "commercial", "Mo", (2, 2), roof="flat", roofc="gold_d", wall="plaster", wallc="red", wall_rows=12, win="none", door="glass", extras=[("marquee", "gold"), ("dome", "gold", 5, 0)])

# industry
B("woodcutter_camp", "industry", "T", (1, 1), ground="dirt", roof="tent", roofc="canvas", wall_rows=0, body=(1, 1, 8, 8), items=[("logs", 8, 9, 3), ("rock", 2, 11)])
B("sawmill", "industry", "M", (2, 1), roof="gable", roofc="wood", rmat="shingle", wall="wood", wallc="wood_l", wall_rows=6, door="wide", body=(1, 1, 21, 14), items=[("logs", 24, 3, 5)])
B("quarry", "industry", "T", (2, 2), states=False, ground="gravel", items=[("terraces", 16, 16, 14, 13, 4), ("rock", 3, 3), ("rock", 26, 4), ("rock", 5, 26)])
B("clay_pit", "industry", "T", (1, 1), states=False, ground="dirt", items=[("disc", 8, 8, 6, "clay"), ("disc", 8, 8, 4, "brick_d"), ("ln", 2, 14, 6, 10, "dirt_d")])
B("brickworks", "industry", "M", (2, 1), rise=8, roof="gable", roofc="tile_d", wall="brick", wallc="brick", wall_rows=6, extras=[("smokestack", 24, -8, 3, "brick")], items=[("crates", 1, 12, 2)])
B("forge", "industry", "M", (1, 1), roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone", wall_rows=5, door="std", doorc="fire", extras=[("chimney", 9, 0, "stone_d")])
B("foundry", "industry", "G", (2, 1), rise=8, roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone_d", wall_rows=7, door="wide", doorc="fire", extras=[("smokestack", 24, -8, 3, "brick")])
B("steel_mill", "industry", "I", (3, 2), rise=12, roof="sawtooth", roofc="metal", wall="metal", wallc="metal_d", wall_rows=8, door="wide", doorc="fire",
  extras=[("smokestack", 6, -12, 3, "metal"), ("smokestack", 16, -12, 3, "metal"), ("smokestack", 26, -12, 3, "metal"), ("glow", "fire")])
B("mine_pit", "industry", "T", (1, 1), ground="dirt", parts=[], items=[("rect", 4, 5, 8, 7, "black"), ("rect", 5, 6, 6, 5, "ink"), ("ln", 3, 4, 12, 4, "wood"), ("ln", 3, 4, 3, 12, "wood"), ("ln", 12, 4, 12, 12, "wood"), ("rock", 1, 12)], boxes=[(3, 4, 12, 12)])
B("mine_shaft", "industry", "I", (1, 1), ground="dirt", parts=[dict(body=(1, 8, 8, 14), roof="gable", roofc="metal", rmat="metal", wall="wood", wallc="wood", wall_rows=3, win="none")],
  objs=[("lattice", 9, 1, 4, 11, "metal_d")], items=[("rect", 10, 12, 4, 3, "black")])
B("mine_openpit", "industry", "Mo", (3, 3), states=False, ground="dirt", items=[("terraces", 24, 24, 22, 20, 6), ("car", 30, 12, "yellow"), ("car", 12, 30, "yellow")])
B("mine_automated", "industry", "F", (2, 2), ground="dirt", roof="flat", roofc="metal_l", wall="metal", wallc="metal", wall_rows=6, door="wide", body=(1, 1, 30, 15), extras=[("glow", "neon2"), ("ac", 3)],
  items=[("rect", 6, 20, 20, 8, "black"), ("rect", 8, 22, 16, 4, "ink"), ("pipe", 14, 16, 14, 21, "metal_l")])
B("oil_derrick", "industry", "I", (1, 1), ground="dirt", parts=[], objs=[("derrick", 3, 1, 12, "wood")], items=[("disc", 9, 13, 2.5, "black")], boxes=[(3, 1, 12, 14)])
B("pumpjack", "industry", "Mo", (1, 1), ground="dirt", parts=[], objs=[("pumpjack", 4, 5)], items=[("disc", 3, 12, 1.5, "black")], boxes=[(3, 5, 12, 13)])
B("offshore_rig", "industry", "Mo", (2, 2), parts=[dict(body=(3, 10, 28, 26), roof="flat", roofc="metal_d", wall="metal", wallc="metal_d", wall_rows=4, win="none", door="none", extras=[("helipad",)])],
  objs=[("lattice", 5, 1, 5, 12, "orange"), ("crane", 20, 6, 6, 8)])
B("refinery", "industry", "Mo", (3, 2), ground="paving", parts=[dict(body=(1, 18, 16, 30), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=5, door="std")],
  objs=[("lattice", 22, 2, 3, 18, "metal"), ("lattice", 30, 5, 3, 15, "metal"), ("cyl", 8, 3, 5, 6, "offwhite"), ("cyl", 40, 4, 5, 5, "offwhite"), ("cyl", 40, 17, 4, 5, "offwhite")],
  items=[("pipe", 2, 16, 46, 16, "metal_l"), ("pipe", 20, 24, 46, 24, "metal_l")])
B("gas_plant", "industry", "Mo", (2, 2), ground="paving", parts=[dict(body=(1, 20, 14, 30), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=4)],
  objs=[("sphere", 7, 7, 5), ("sphere", 21, 8, 5), ("sphere", 23, 22, 4.5)])
B("chemical_plant", "industry", "Mo", (2, 2), ground="paving", parts=[dict(body=(1, 14, 20, 30), roof="flat", roofc="metal_d", wall="metal", wallc="metal", wall_rows=6, door="wide", extras=[("smokestack", 4, 14, 2, "metal")])],
  objs=[("cyl", 25, 2, 4, 6, "teal"), ("cyl", 9, 1, 4, 5, "offwhite")], items=[("pipe", 20, 18, 30, 12, "yellow")])
B("textile_mill", "industry", "I", (2, 2), rise=10, roof="sawtooth", roofc="slate", wall="brick", wallc="brick", wall_rows=10, door="wide", extras=[("smokestack", 25, -10, 3, "brick")])
B("factory_early", "industry", "I", (2, 2), rise=10, roof="sawtooth", roofc="slate_l", wall="brick", wallc="brick_d", wall_rows=8, door="wide", extras=[("smokestack", 4, -10, 3, "brick"), ("smokestack", 24, -8, 3, "brick")])
B("factory_modern", "industry", "Mo", (2, 2), roof="flat", roofc="metal_l", wall="metal", wallc="metal", wall_rows=8, door="garage", extras=[("ac", 4), ("vents", 4)])
B("vehicle_factory", "industry", "I", (3, 2), rise=8, roof="sawtooth", roofc="metal", wall="metal", wallc="metal_d", wall_rows=8, door="garage", extras=[("smokestack", 40, -8, 3, "metal")])
B("aircraft_factory", "industry", "Mo", (3, 3), ground="asphalt", roof="barrel", roofc="metal", wall="metal", wallc="metal_d", wall_rows=10, door="wide", body=(2, 2, 45, 36), items=[("rect", 0, 40, 48, 8, "asphalt_l")])
B("shipyard_small", "industry", "G", (2, 2), ground="dirt", parts=[dict(body=(1, 1, 14, 12), roof="gable", roofc="wood", rmat="shingle", wall="wood", wallc="wood", wall_rows=5, door="wide")],
  items=[("rect", 0, 20, 32, 12, "water"), ("dock", 16, 4, 14, 24), ("hull", 18, 9, 11, 5, "wood_l")])
B("shipyard_large", "industry", "I", (3, 3), ground="paving", parts=[dict(body=(1, 1, 18, 14), roof="sawtooth", roofc="metal", wall="metal", wallc="metal_d", wall_rows=6, door="wide")],
  items=[("rect", 6, 20, 36, 16, "water_d"), ("hull", 8, 24, 30, 8, "metal_d")], objs=[("crane", 4, 16, 18, 14), ("crane", 40, 16, 18, -8)])
B("munitions_factory", "industry", "I", (2, 2), ground="gravel", roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=8, door="garage", body=(2, 2, 29, 20),
  items=[("crates", 2, 24, 4), ("crates", 20, 24, 4), ("fence", 0, 0, 32, 32, "metal_d")], extras=[("flag", 3, 2)])
B("electronics_plant", "industry", "Mo", (2, 2), roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=8, win="band", door="glass", extras=[("solar",)])
B("warehouse", "industry", "I", (2, 1), roof="barrel", roofc="metal", wall="metal", wallc="metal_d", wall_rows=5, door="garage")
B("storage_yard", "industry", "M", (1, 1), states=False, ground="dirt", items=[("crates", 2, 2, 4), ("logs", 9, 3, 2), ("crates", 8, 9, 2), ("fence", 0, 0, 16, 16, "wood_l")])
B("silo", "industry", "I", (1, 1), rise=8, parts=[], objs=[("cyl", 8, -7, 5, 15, "metal_l")], boxes=[(3, -7, 12, 14)])
B("logistics_depot", "industry", "Mo", (2, 2), ground="asphalt", parts=[dict(body=(1, 1, 30, 13), roof="flat", roofc="concrete_d", wall="metal", wallc="metal_l", wall_rows=5, door="garage", extras=[("ac", 2)])],
  items=[("containers", 2, 18, 18, 10), ("car", 24, 20, "white", True), ("car", 28, 20, "red", True)])
B("fuel_tanks", "industry", "I", (2, 1), ground="gravel", parts=[], objs=[("cyl", 8, 1, 6, 5, "offwhite"), ("cyl", 23, 1, 6, 5, "offwhite")], boxes=[(2, 1, 29, 14)])
