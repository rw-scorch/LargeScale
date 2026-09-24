from specs_a import B

# transport
B("station_small", "transport", "G", (2, 1), rise=5, roof="gable", roofc="slate", rmat="slate", wall="brick", wallc="brick", wall_rows=6, door="double", body=(1, 1, 30, 11), items=[("rect", 0, 12, 32, 4, "stone_l"), ("rect", 0, 15, 32, 1, "stone_d")], extras=[("tower", 13, 5, -5, 5, "brick_l", "slate")])
B("station_large", "transport", "I", (3, 2), parts=[
    dict(body=(1, 1, 46, 20), roof="barrel", roofc="glass_l", wall="metal", wallc="metal_d", wall_rows=3, win="none", door="none"),
    dict(body=(1, 18, 46, 30), roof="flat", roofc="brick_d", wall="brick", wallc="brick_l", wall_rows=7, door="double", extras=[("tower", 21, 6, -8, 10, "brick_l", "slate")]),
])
B("metro_entrance", "transport", "Mo", (1, 1), ground="paving", parts=[dict(body=(3, 3, 12, 11), roof="flat", roofc="glass_l", wall="metal", wallc="metal_d", wall_rows=3, win="none", door="none")],
  items=[("rect", 5, 12, 6, 3, "black")], post=[("rect", 12, 2, 3, 3, "blue"), ("rect", 13, 3, 1, 1, "white")])
B("tunnel_entrance", "transport", "I", (1, 1), states=False, items=[("disc", 8, 8, 8, "stone_d"), ("disc", 8, 7, 7, "stone"), ("rect", 4, 7, 8, 9, "black"), ("disc", 8, 7, 4, "black"), ("rect", 3, 6, 10, 1, "stone_l")])
B("jetty", "transport", "T", (1, 1), states=False, items=[("dock", 5, 0, 6, 16)])
B("harbour", "transport", "M", (2, 2), items=[("rect", 0, 0, 32, 12, "stone"), ("rect", 0, 11, 32, 1, "stone_d"), ("dock", 4, 12, 4, 20), ("dock", 20, 12, 4, 20)],
  parts=[dict(body=(8, 1, 25, 10), roof="gable", roofc="tile", wall="wood", wallc="wood_l", wall_rows=4, door="wide")], objs=[("boat", 10, 20, "wood", True), ("boat", 24, 25, "wood")])
B("port_commercial", "transport", "I", (3, 3), items=[("rect", 0, 0, 48, 30, "concrete"), ("rect", 0, 29, 48, 2, "concrete_d"), ("containers", 22, 3, 24, 12)],
  parts=[dict(body=(1, 1, 18, 16), roof="barrel", roofc="metal", wall="metal", wallc="metal_d", wall_rows=5, door="garage")], objs=[("crane", 10, 18, 12, 10), ("crane", 32, 18, 12, 10)])
B("container_terminal", "transport", "Mo", (3, 3), items=[("rect", 0, 0, 48, 34, "asphalt"), ("rect", 0, 33, 48, 2, "concrete_d"), ("containers", 2, 2, 44, 20), ("rect", 0, 24, 48, 1, "yline")],
  objs=[("crane", 8, 22, 12, 12, "teal"), ("crane", 26, 22, 12, 12, "teal")], parts=[])
B("naval_dock", "transport", "I", (2, 2), items=[("rect", 0, 0, 32, 18, "concrete_d"), ("rect", 0, 17, 32, 1, "dgrey"), ("dock", 12, 18, 6, 14)],
  parts=[dict(body=(1, 1, 22, 13), roof="flat", roofc="dgrey", wall="concrete", wallc="grey", wall_rows=5, door="garage", extras=[("flag", 16, 1), ("antenna", 3)])])
B("lighthouse", "transport", "M", (1, 1), rise=12, parts=[], items=[("disc", 8, 12, 4, "stone")], objs=[("cyl", 8, -10, 3, 21, "white")], post=[("rect", 5, -3, 6, 2, "red"), ("rect", 5, 4, 6, 2, "red"), ("rect", 6, -10, 4, 3, "lit"), ("rect", 7, -12, 2, 2, "red_d")], boxes=[(5, -10, 11, 14)])
B("canal_lock", "transport", "I", (1, 1), states=False, items=[("rect", 0, 0, 16, 16, "stone"), ("rect", 3, 0, 10, 16, "water"), ("rect", 3, 4, 10, 1, "wood_d"), ("rect", 3, 11, 10, 1, "wood_d"), ("rect", 1, 3, 1, 3, "wood"), ("rect", 14, 10, 1, 3, "wood")])
B("grass_airstrip", "transport", "I", (3, 1), states=False, ground="lawn", items=[("rect", 0, 5, 48, 6, "dirt_l"), ("rect", 44, 1, 1, 4, "lgrey"), ("rect", 45, 1, 2, 1, "orange")])
B("airfield", "transport", "I", (3, 2), ground="lawn", parts=[dict(body=(2, 1, 18, 14), roof="barrel", roofc="metal", wall="metal", wallc="metal_d", wall_rows=5, door="wide")],
  items=[("rect", 0, 19, 48, 8, "asphalt"), ("rect", 2, 22, 44, 1, "line"), ("rect", 22, 6, 4, 13, "asphalt_l")])
B("terminal", "transport", "Mo", (3, 2), ground="asphalt", roof="flat", roofc="white", wall="glass", wallc="glass", wall_rows=7, win="none", door="glass", body=(1, 1, 46, 17), extras=[("ac", 4)],
  items=[("rect", 8, 18, 2, 8, "metal_l"), ("rect", 22, 18, 2, 8, "metal_l"), ("rect", 36, 18, 2, 8, "metal_l"), ("rect", 0, 29, 48, 1, "yline")])
B("hangar", "transport", "Mo", (2, 2), ground="asphalt", roof="barrel", roofc="metal", wall="metal", wallc="metal_d", wall_rows=8, door="wide", body=(1, 1, 30, 25))
B("control_tower", "transport", "Mo", (1, 1), rise=14, parts=[
    dict(body=(5, -6, 10, 14), roof="flat", roofc="concrete", wall="concrete", wallc="concrete_l", wall_rows=19, win="none", door="small"),
    dict(body=(3, -11, 12, -5), roof="flat", roofc="dgrey", wall="glass", wallc="glass", wall_rows=4, win="none", door="none", extras=[("antenna", 5)]),
])
B("heliport", "transport", "Mo", (1, 1), states=False, items=[("disc", 8, 8, 7.5, "asphalt"), ("ringi", 8, 8, 7.5, "yellow", 1), ("rect", 5, 4, 1, 8, "white"), ("rect", 10, 4, 1, 8, "white"), ("rect", 6, 7, 4, 1, "white")])
B("bus_stop", "transport", "Mo", (1, 1), states=False, parts=[dict(body=(2, 5, 13, 10), roof="flat", roofc="glass_l", wall="metal", wallc="metal", wall_rows=2, win="none", door="none")], items=[("rect", 0, 12, 16, 4, "concrete_l"), ("rect", 14, 3, 1, 8, "dgrey"), ("rect", 13, 2, 3, 2, "blue")])
B("parking_lot", "transport", "Mo", (1, 1), states=False, ground="asphalt", items=[("parking", 0, 1, 16, 14)])

# tourism and leisure
B("park", "tourism", "G", (1, 1), states=False, ground="lawn", items=[("path", 7, 0, 2, 16, "sand"), ("path", 0, 7, 16, 2, "sand"), ("rect", 10, 11, 3, 1, "wood")], objs=[("tree", 3, 3), ("tree", 12, 3, "leaf_l"), ("tree", 3, 12, "leaf_d")])
B("plaza", "tourism", "G", (1, 1), states=False, ground="paving", objs=[("fountain", 8, 8, 5)])
B("campground", "tourism", "Mo", (1, 1), states=False, ground="lawn", items=[("tent", 1, 2, "orange"), ("tent", 9, 3, "teal"), ("tent", 4, 9, "yellow"), ("fire", 11, 11)])
B("zoo", "tourism", "I", (2, 2), states=False, ground="lawn", items=[("path", 15, 0, 3, 32, "sand"), ("fence", 1, 1, 13, 13), ("fence", 19, 1, 12, 13), ("fence", 1, 18, 13, 13), ("fence", 19, 18, 12, 13),
  ("rect", 5, 5, 4, 2, "yellow"), ("rect", 23, 6, 3, 3, "grey"), ("rect", 22, 22, 4, 4, "water"), ("rect", 5, 23, 2, 3, "orange"), ("rect", 9, 21, 2, 2, "black")])
B("museum", "tourism", "G", (2, 1), roof="hip", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=7, win="none", door="double", extras=[("columns",), ("banners", "red")])
B("theme_park", "tourism", "Mo", (3, 3), ground="lawn", parts=[], items=[("path", 0, 22, 48, 3, "sand"), ("path", 22, 0, 3, 48, "sand")], objs=[("ferris", 11, 10, 8), ("ring", 34, 34, 11, 9, "red"), ("ring", 34, 34, 8, 6, "yellow"), ("tree", 5, 40), ("tree", 40, 6)],
  post=[("umbrella", 30, 6, "teal"), ("umbrella", 6, 30, "pink")], boxes=[(2, 2, 45, 45)])
B("golf_course", "tourism", "Mo", (2, 2), states=False, ground="lawn", items=[("disc", 22, 9, 6, "green_l"), ("disc", 9, 23, 3.5, "sand"), ("disc", 25, 25, 4, "water"), ("rect", 22, 5, 1, 4, "white"), ("rect", 23, 5, 2, 1, "red")], objs=[("tree", 4, 4), ("tree", 10, 6, "leaf_d")])
B("marina", "tourism", "Mo", (2, 2), states=False, ground="water", items=[("rect", 0, 0, 32, 6, "concrete_l"), ("dock", 6, 6, 3, 24), ("dock", 20, 6, 3, 24)], objs=[("boat", 10, 12, "white"), ("boat", 10, 22, "white", True), ("boat", 24, 15, "white"), ("boat", 0, 20, "white")])
B("arena", "tourism", "I", (2, 2), ground="paving", parts=[], items=[("disc", 16, 16, 15, "stone_d"), ("disc", 16, 16, 14, "stone"), ("ringi", 16, 16, 11, "stone_l", 2), ("disc", 16, 16, 8, "sand")], boxes=[(1, 1, 30, 30)])
B("stadium", "tourism", "Mo", (3, 3), ground="asphalt", parts=[], items=[("disc", 24, 24, 23, "concrete_d"), ("disc", 24, 24, 22, "concrete"), ("ringi", 24, 24, 19, "red", 3), ("ringi", 24, 24, 15, "blue", 2),
  ("rect", 12, 15, 24, 18, "lawn"), ("rect", 23, 15, 1, 18, "white"), ("ringi", 24, 24, 3, "white", 1)], boxes=[(1, 1, 46, 46)])
B("beach_resort", "tourism", "Mo", (2, 2), ground="sand", parts=[dict(body=(1, 1, 30, 13), roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=6, win="band", door="glass")],
  items=[("pool", 3, 17, 10, 5), ("umbrella", 18, 18, "red"), ("umbrella", 25, 22, "teal"), ("umbrella", 17, 26, "yellow"), ("rect", 0, 29, 32, 3, "water_l")])
B("ski_resort", "tourism", "Mo", (2, 2), ground="snow", parts=[dict(body=(1, 14, 18, 30), roof="gable", roofc="wood_d", rmat="shingle", wall="log", wallc="wood", wall_rows=6, door="std", extras=[("chimney", 12, 0)])],
  items=[("ln", 20, 30, 30, 2, "dgrey")], objs=[("pine", 25, 18), ("pine", 5, 3), ("pine", 13, 6)])
B("wonder_pyramid", "tourism", "T", (3, 3), ground="sand", roof="pyramid", roofc="sand", rmat="slate", wall_rows=0, body=(2, 2, 45, 45))
B("wonder_colossus", "tourism", "M", (2, 2), ground="paving", parts=[dict(body=(6, 20, 25, 30), roof="flat", roofc="stone_l", wall="stone", wallc="stone", wall_rows=4, win="none", door="none")],
  post=[("rect", 13, 5, 6, 15, "gold"), ("disc", 16, 4, 3, "gold"), ("rect", 19, 1, 2, 9, "gold"), ("rect", 19, 0, 2, 2, "fire_l"), ("rect", 14, 6, 2, 13, "gold_d")])
B("wonder_clocktower", "tourism", "G", (2, 2), ground="paving", parts=[dict(up=20, body=(8, 1, 23, 30), roof="pyramid", roofc="slate", rmat="slate", wall="stone", wallc="stone_l", wall_rows=22, win="slit", door="arch")],
  post=[("disc", 16, -3, 3.5, "white"), ("ln", 16, -3, 16, -5, "black"), ("ln", 16, -3, 18, -3, "black")])
B("wonder_grand_tower", "tourism", "I", (2, 2), rise=20, ground="paving", parts=[], objs=[("lattice", 7, 12, 17, 18, "wood_d"), ("lattice", 11, -4, 9, 16, "wood_d"), ("lattice", 14, -16, 3, 12, "wood_d"), ("lattice", 15, -20, 1, 4, "wood_d")], boxes=[(7, -20, 24, 30)])
B("wonder_orbital_elevator", "tourism", "F", (2, 2), ground="paving", parts=[dict(body=(6, 16, 25, 30), roof="flat", roofc="white", wall="glass", wallc="glass", wall_rows=6, win="none", door="glass", extras=[("glow", "neon2")])],
  rise=24, post=[("rect", 15, -24, 2, 44, "neon2"), ("rect", 14, -24, 1, 44, (79, 224, 216, 110)), ("rect", 17, -24, 1, 44, (79, 224, 216, 110))])

# military
B("war_camp", "military", "T", (2, 2), ground="dirt", items=[("tent", 3, 3, "canvas"), ("tent", 14, 2, "canvas_d"), ("tent", 22, 6, "canvas"), ("tent", 5, 16, "canvas_d"), ("fire", 16, 17), ("fence", 0, 0, 32, 32, "wood")],
  parts=[], post=[("rect", 26, 20, 1, 8, "wood_d"), ("rect", 27, 20, 3, 2, "#ff00ff")], boxes=[(2, 2, 29, 29)])
B("watchtower_wood", "military", "T", (1, 1), rise=10, parts=[dict(body=(3, -9, 12, -4), roof="gable", roofc="thatch", rmat="thatch", wall="wood", wallc="wood", wall_rows=2, win="none", door="none")], objs=[("lattice", 4, -4, 7, 18, "wood")])
B("barracks", "military", "M", (2, 1), roof="gable", roofc="wood_d", rmat="shingle", wall="log", wallc="wood", wall_rows=6, door="double", extras=[("banners",), ("flag", 26, 0)])
B("stable", "military", "M", (2, 1), roof="gable", roofc="thatch", rmat="thatch", wall="wood", wallc="wood_l", wall_rows=6, win="none", doors=[3, 10, 17, 24], items=[("hay", 27, 11)])
B("archery_range", "military", "M", (2, 1), states=False, ground="lawn", items=[("target", 26, 3), ("target", 26, 10), ("rect", 2, 1, 1, 14, "wood"), ("rect", 5, 2, 2, 2, "#ff00ff")])
B("siege_workshop", "military", "M", (2, 2), roof="gable", roofc="wood", rmat="shingle", wall="timber", wall_rows=8, door="wide", body=(1, 1, 30, 22), items=[("logs", 3, 25, 3), ("logs", 20, 25, 3)])
B("keep", "military", "M", (2, 2), up=8, roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=12, win="slit", door="arch", extras=[("crenel",), ("flag", 14, 1)])
B("castle", "military", "M", (3, 3), ground="lawn", parts=[
    dict(body=(3, 3, 44, 12), roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=4, win="none", door="none", extras=[("crenel",)]),
    dict(body=(3, 3, 9, 44), roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=4, win="none", door="none", extras=[("crenel",)]),
    dict(body=(38, 3, 44, 44), roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=4, win="none", door="none", extras=[("crenel",)]),
    dict(body=(14, 10, 33, 30), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=9, win="slit", door="arch", extras=[("crenel",), ("flag", 9, 0)]),
    dict(body=(3, 36, 44, 44), roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=5, win="none", door="arch", extras=[("crenel",)]),
    dict(body=(0, 0, 11, 11), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=4, win="slit", door="none", extras=[("crenel",)]),
    dict(body=(36, 0, 47, 11), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=4, win="slit", door="none", extras=[("crenel",)]),
    dict(body=(0, 35, 11, 46), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=4, win="slit", door="none", extras=[("crenel",)]),
    dict(body=(36, 35, 47, 46), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=4, win="slit", door="none", extras=[("crenel",)]),
])
B("star_fort", "military", "G", (3, 3), ground="lawn", items=[("poly", [(24, 0), (31, 12), (47, 10), (37, 24), (47, 38), (31, 36), (24, 47), (17, 36), (1, 38), (11, 24), (1, 10), (17, 12)], "stone_d"),
  ("poly", [(24, 3), (30, 14), (43, 13), (35, 24), (43, 35), (30, 34), (24, 44), (18, 34), (5, 35), (13, 24), (5, 13), (18, 14)], "stone"), ("rect", 15, 15, 18, 18, "dirt_l")],
  parts=[dict(body=(17, 16, 30, 28), roof="gable", roofc="tile", wall="stone", wallc="stone_l", wall_rows=5, door="std", extras=[("flag", 6, 0)])], post=[("cannon", 21, 5), ("cannon", 38, 23), ("cannon", 5, 23)])
B("cannon_foundry", "military", "G", (2, 1), roof="gable", roofc="tile_d", wall="brick", wallc="brick", wall_rows=6, door="wide", doorc="fire", extras=[("smokestack", 25, 0, 3, "brick")])
B("musket_range", "military", "G", (2, 1), states=False, ground="lawn", items=[("target", 27, 4), ("target", 27, 11), ("rect", 0, 0, 32, 1, "wood"), ("rect", 0, 15, 32, 1, "wood"), ("rect", 3, 4, 4, 8, "stone")])
B("coastal_battery", "military", "G", (1, 1), items=[("disc", 8, 10, 7, "stone_d"), ("disc", 8, 10, 6, "stone"), ("disc", 8, 11, 4, "dirt_l")], parts=[], post=[("cannon", 5, 4)], boxes=[(1, 3, 14, 14)])
B("bunker", "military", "I", (1, 1), ground="dirt", roof="flat", roofc="camo", wall="concrete", wallc="concrete_d", wall_rows=3, win="slit", door="none", body=(1, 4, 14, 13))
B("artillery_emplacement", "military", "I", (1, 1), items=[("ringi", 8, 8, 7, "khaki", 2), ("disc", 8, 8, 5, "dirt"), ("rect", 5, 7, 5, 3, "olive_d"), ("rect", 10, 8, 5, 1, "black")], parts=[], boxes=[(1, 1, 14, 14)])
B("tank_depot", "military", "I", (3, 2), ground="asphalt", roof="sawtooth", roofc="olive", wall="metal", wallc="olive_d", wall_rows=7, door="garage", body=(1, 1, 46, 20), items=[("rect", 0, 24, 48, 1, "yline")])
B("naval_yard", "military", "I", (3, 2), items=[("rect", 0, 0, 48, 20, "concrete_d"), ("rect", 0, 19, 48, 1, "dgrey")], parts=[dict(body=(1, 1, 26, 15), roof="flat", roofc="dgrey", wall="metal", wallc="grey", wall_rows=6, door="garage", extras=[("flag", 20, 1)])],
  objs=[("crane", 34, 4, 16, 10, "yellow")])
B("military_base", "military", "Mo", (3, 3), ground="gravel", parts=[
    dict(body=(3, 4, 22, 14), roof="flat", roofc="olive", wall="concrete", wallc="khaki", wall_rows=4, win="small", door="std"),
    dict(body=(3, 18, 22, 28), roof="flat", roofc="olive", wall="concrete", wallc="khaki", wall_rows=4, win="small", door="std"),
    dict(body=(26, 4, 44, 20), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=5, win="band", door="glass", extras=[("flag", 14, 1), ("antenna", 3)]),
], items=[("fence", 0, 0, 48, 48, "metal_d"), ("disc", 35, 36, 8, "asphalt"), ("ringi", 35, 36, 8, "yellow", 1), ("rect", 32, 33, 1, 7, "white"), ("rect", 38, 33, 1, 7, "white"), ("rect", 33, 36, 5, 1, "white"), ("rect", 3, 32, 20, 12, "asphalt")])
B("radar_station", "military", "Mo", (1, 1), rise=6, ground="gravel", parts=[], objs=[("lattice", 6, 3, 4, 11, "metal_d"), ("dish", 8, 0, 5)], boxes=[(3, -5, 13, 14)])
B("sam_site", "military", "Mo", (1, 1), ground="gravel", items=[("ringi", 8, 8, 7, "khaki", 2), ("rect", 4, 6, 8, 5, "olive"), ("rect", 5, 4, 1, 4, "white"), ("rect", 7, 4, 1, 4, "white"), ("rect", 9, 4, 1, 4, "white"), ("rect", 11, 4, 1, 4, "white"), ("rect", 5, 4, 1, 1, "red"), ("rect", 9, 4, 1, 1, "red")], parts=[], boxes=[(1, 1, 14, 14)])
B("missile_silo", "military", "Mo", (1, 1), ground="paving", items=[("disc", 8, 8, 6.5, "yellow"), ("disc", 8, 8, 5.5, "dgrey"), ("ln", 3, 8, 13, 8, "black"), ("disc", 8, 8, 1.5, "metal")])
B("command_hq", "military", "Mo", (2, 2), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_d", wall_rows=8, win="band", door="double", extras=[("antenna", 4), ("dome", "white", 3.5, -2), ("flag", 25, 1)])
B("drone_hangar", "military", "Mo", (2, 1), ground="asphalt", roof="barrel", roofc="camo", wall="metal", wallc="olive_d", wall_rows=5, door="wide")
B("shield_generator", "military", "F", (2, 2), ground="paving", parts=[dict(body=(6, 18, 25, 29), roof="flat", roofc="metal", wall="metal", wallc="metal_d", wall_rows=5, win="none", door="std", extras=[("glow", "neon2")])],
  post=[("disc", 16, 11, 9, (79, 224, 216, 90)), ("disc", 16, 11, 5, (79, 224, 216, 170)), ("disc", 15, 10, 2, "white")])
B("railgun_battery", "military", "F", (2, 1), ground="paving", parts=[dict(body=(2, 6, 14, 14), roof="flat", roofc="metal_d", wall="metal", wallc="metal", wall_rows=3, win="none", door="none", extras=[("glow", "neon2")])],
  post=[("rect", 12, 8, 19, 2, "metal_l"), ("rect", 12, 10, 19, 1, "metal_d"), ("rect", 29, 8, 2, 2, "neon2")])
B("orbital_uplink", "military", "F", (2, 2), ground="paving", parts=[dict(body=(2, 22, 29, 30), roof="flat", roofc="metal", wall="metal", wallc="metal_d", wall_rows=3, win="none", door="std", extras=[("glow", "neon2")])],
  objs=[("dish", 16, 11, 10)], post=[("rect", 15, 0, 2, 5, "neon2")])
B("tower_stone", "military", "M", (1, 1), up=8, roof="flat", roofc="stone_l", wall="stone", wallc="stone", wall_rows=6, win="slit", door="none", extras=[("crenel",)])
B("tower_concrete", "military", "Mo", (1, 1), up=6, roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=6, win="slit", door="none", extras=[("antenna", 11)])
B("sandbags", "military", "I", (1, 1), states=False, items=[("ringi", 8, 8, 7, "khaki", 3), ("ringi", 8, 8, 5, "sand_d", 1)])
B("tank_traps", "military", "I", (1, 1), states=False, items=[("ln", 2, 2, 5, 5, "metal_d"), ("ln", 5, 2, 2, 5, "metal_d"), ("ln", 10, 3, 13, 6, "metal_d"), ("ln", 13, 3, 10, 6, "metal_d"), ("ln", 5, 10, 8, 13, "metal_d"), ("ln", 8, 10, 5, 13, "metal_d")])
B("minefield_marker", "military", "I", (1, 1), states=False, items=[("rect", 7, 6, 1, 8, "wood_d"), ("poly", [(4, 7), (7.5, 1), (11, 7)], "red"), ("rect", 7, 3, 1, 2, "white"), ("rect", 7, 6, 1, 1, "white")])
