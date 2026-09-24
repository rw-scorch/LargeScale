from specs_a import B

# air and missile defence
B("aa_gun", "military", "I", (1, 1), ground="dirt", parts=[], items=[("ringi", 8, 9, 7, "khaki", 3), ("disc", 8, 9, 5, "dirt_l"), ("rect", 6, 7, 5, 5, "olive"), ("rect", 7, 8, 3, 3, "olive_d")],
  post=[("ln", 9, 9, 15, 3, "black"), ("ln", 10, 9, 16, 3, "black"), ("rect", 6, 6, 2, 2, "#ff00ff")], boxes=[(1, 2, 14, 14)])
B("flak_tower", "military", "I", (2, 2), up=14, ground="paving", roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=8, win="slit", door="std", body=(3, 3, 28, 28),
  extras=[("crenel",)], post=[("rect", 4, 4, 3, 3, "dgrey"), ("rect", 25, 4, 3, 3, "dgrey"), ("rect", 4, 22, 3, 3, "dgrey"), ("rect", 25, 22, 3, 3, "dgrey"),
  ("ln", 6, 5, 11, 1, "black"), ("ln", 27, 5, 31, 1, "black"), ("ln", 6, 23, 11, 19, "black"), ("ln", 27, 23, 31, 19, "black")])
B("searchlight", "military", "I", (1, 1), ground="gravel", parts=[], items=[("rect", 5, 10, 6, 4, "dgrey"), ("rect", 4, 13, 8, 2, "metal_d"), ("disc", 8, 8, 4, "metal"), ("disc", 8, 8, 3, "offwhite"), ("disc", 8, 8, 1.6, "lit")],
  night=[("disc", 8, 8, 4.5, (248, 230, 160, 150)), ("poly", [(8, 7), (16, 0), (16, 7)], (248, 230, 160, 110))], boxes=[(3, 4, 13, 14)])
B("listening_post", "military", "I", (1, 1), ground="dirt", parts=[], items=[("rect", 4, 11, 8, 3, "wood"), ("rect", 5, 13, 6, 2, "wood_d"),
  ("poly", [(1, 3), (6, 6), (6, 9), (1, 8)], "metal_d"), ("poly", [(2, 4), (5, 6.5), (5, 8), (2, 7)], "metal_l"),
  ("poly", [(15, 3), (10, 6), (10, 9), (15, 8)], "metal_d"), ("poly", [(14, 4), (11, 6.5), (11, 8), (14, 7)], "metal"),
  ("ln", 6, 8, 8, 11, "metal"), ("ln", 10, 8, 8, 11, "metal"), ("rect", 7, 8, 2, 3, "olive")], boxes=[(1, 3, 15, 14)])
B("radar_early_warning", "military", "Mo", (2, 2), rise=16, ground="paving",
  parts=[dict(body=(1, 20, 14, 30), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete_l", wall_rows=4, win="small", door="std")],
  objs=[("lattice", 18, 2, 8, 16, "metal_d"), ("dish", 22, -6, 9)], post=[("rect", 21, -14, 2, 2, "beacon")])
B("radar_phased_array", "military", "Mo", (2, 2), rise=8, ground="paving",
  parts=[dict(body=(2, 14, 29, 30), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=6, win="band", door="std", extras=[("antenna", 26)])],
  post=[("poly", [(4, -6), (27, -6), (29, 13), (2, 13)], "navy"), ("poly", [(5, -5), (26, -5), (27, 4), (4, 4)], "#2a4f8a"),
  ("ln", 4, 0, 28, 0, "metal_d"), ("ln", 3, 6, 29, 6, "metal_d"), ("ln", 10, -6, 10, 13, "metal_d"), ("ln", 21, -6, 21, 13, "metal_d")],
  night=[("rect", 6, -4, 20, 1, "neon2"), ("rect", 6, 8, 20, 1, "neon2")])
B("sam_battery", "military", "Mo", (2, 1), ground="gravel",
  parts=[dict(body=(19, 4, 30, 14), roof="flat", roofc="olive", wall="metal", wallc="olive_d", wall_rows=4, win="small", door="small")],
  items=[("rect", 1, 5, 14, 8, "olive"), ("rect", 2, 6, 12, 6, "olive_d")],
  post=[("rect", 2, 6, 3, 2, "offwhite"), ("rect", 2, 9, 3, 2, "offwhite"), ("rect", 7, 6, 3, 2, "offwhite"), ("rect", 7, 9, 3, 2, "offwhite"),
  ("rect", 5, 6, 1, 1, "red"), ("rect", 5, 9, 1, 1, "red"), ("rect", 10, 6, 1, 1, "red"), ("rect", 10, 9, 1, 1, "red"),
  ("rect", 12, 4, 1, 9, "metal_l"), ("disc", 24, 2, 2.5, "offwhite"), ("rect", 1, 13, 14, 1, "#ff00ff")])
B("sam_heavy", "military", "Mo", (2, 2), rise=6, ground="gravel",
  parts=[dict(body=(20, 18, 30, 29), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=5, win="slit", door="std", extras=[("antenna", 8)])],
  items=[("fence", 0, 0, 32, 32, "metal_d"), ("rect", 2, 3, 16, 12, "olive"), ("rect", 3, 4, 14, 10, "olive_d"), ("rect", 2, 18, 15, 11, "olive")],
  post=[("rect", 4, -1, 3, 12, "offwhite"), ("rect", 9, -1, 3, 12, "offwhite"), ("rect", 14, -1, 3, 12, "offwhite"),
  ("rect", 4, -3, 3, 2, "red"), ("rect", 9, -3, 3, 2, "red"), ("rect", 14, -3, 3, 2, "red"),
  ("rect", 4, 20, 11, 3, "metal_d"), ("rect", 4, 24, 11, 3, "metal_d"), ("disc", 25, 15, 3, "offwhite"), ("rect", 2, 30, 14, 1, "#ff00ff")])
B("abm_silo", "military", "Mo", (2, 2), ground="paving",
  items=[("rect", 1, 1, 30, 30, "concrete"), ("fence", 0, 0, 32, 32, "metal_d")],
  post=[("disc", 9, 9, 5.5, "yellow"), ("disc", 9, 9, 4.5, "dgrey"), ("ln", 4, 9, 14, 9, "black"),
  ("disc", 23, 9, 5.5, "yellow"), ("disc", 23, 9, 4.5, "dgrey"), ("ln", 18, 9, 28, 9, "black"),
  ("disc", 9, 23, 5.5, "yellow"), ("disc", 9, 23, 4.5, "dgrey"), ("ln", 4, 23, 14, 23, "black"),
  ("disc", 23, 23, 5.5, "yellow"), ("disc", 23, 23, 4.5, "dgrey"), ("ln", 18, 23, 28, 23, "black")])
B("abm_silo_open", "military", "Mo", (2, 2), states=False, ground="paving",
  items=[("rect", 1, 1, 30, 30, "concrete"), ("fence", 0, 0, 32, 32, "metal_d")],
  post=[("disc", 9, 9, 5.5, "yellow"), ("disc", 9, 9, 4.5, "ink"), ("rect", 7, 6, 4, 6, "offwhite"), ("poly", [(7, 6), (9, 2), (11, 6)], "red"),
  ("disc", 23, 9, 5.5, "yellow"), ("disc", 23, 9, 4.5, "dgrey"), ("ln", 18, 9, 28, 9, "black"),
  ("disc", 9, 23, 5.5, "yellow"), ("disc", 9, 23, 4.5, "dgrey"), ("ln", 4, 23, 14, 23, "black"),
  ("disc", 23, 23, 5.5, "yellow"), ("disc", 23, 23, 4.5, "dgrey"), ("ln", 18, 23, 28, 23, "black"),
  ("disc", 9, 13, 3, (235, 233, 228, 180)), ("disc", 12, 15, 2, (215, 212, 206, 150))])
B("ciws_turret", "military", "Mo", (1, 1), ground="paving", parts=[], items=[("rect", 4, 10, 8, 4, "metal_d"), ("disc", 8, 8, 4, "offwhite"), ("disc", 8, 8, 2.6, "white"), ("rect", 7, 3, 2, 4, "dgrey"), ("rect", 6, 2, 4, 2, "metal_d")],
  boxes=[(3, 2, 13, 14)])
B("aa_bunker", "military", "Mo", (1, 1), ground="dirt", roof="flat", roofc="camo", wall="concrete", wallc="concrete_d", wall_rows=4, win="slit", door="none", body=(1, 4, 14, 13),
  post=[("rect", 6, 2, 4, 3, "dgrey"), ("ln", 8, 3, 13, 0, "black"), ("ln", 9, 3, 14, 0, "black")])
B("laser_turret", "military", "F", (1, 1), ground="paving", parts=[], items=[("rect", 4, 10, 8, 4, "metal"), ("rect", 5, 6, 6, 5, "metal_d"), ("rect", 6, 4, 4, 3, "metal_l"), ("rect", 7, 2, 2, 3, "neon2"), ("disc", 8, 2, 1.6, "white")],
  night=[("disc", 8, 3, 3.4, (79, 224, 216, 130))], boxes=[(3, 2, 13, 14)])
B("laser_battery", "military", "F", (2, 1), rise=4, ground="paving",
  parts=[dict(body=(1, 4, 16, 14), roof="flat", roofc="metal_l", wall="metal", wallc="metal", wall_rows=5, win="none", door="std", extras=[("glow", "neon2")])],
  post=[("rect", 18, 0, 11, 9, "metal_d"), ("rect", 19, 1, 9, 7, "metal"), ("disc", 24, 4, 3.2, "neon2"), ("disc", 24, 4, 1.8, "white"), ("rect", 18, 10, 11, 3, "metal_d"), ("rect", 20, 11, 2, 1, "neon2"), ("rect", 25, 11, 2, 1, "neon2")])
B("shield_node", "military", "F", (1, 1), rise=8, ground="paving", parts=[], items=[("disc", 8, 13, 5, "metal_d"), ("disc", 8, 13, 3.5, "metal")],
  post=[("rect", 7, -6, 2, 18, "metal_l"), ("rect", 6, -8, 4, 3, "metal_d"), ("ringi", 8, -7, 4, "neon2", 2), ("disc", 8, -7, 1.6, "white")],
  night=[("disc", 8, -7, 6, (79, 224, 216, 110))], boxes=[(2, -8, 14, 14)])
B("air_defence_command", "military", "Mo", (2, 2), ground="gravel",
  parts=[dict(body=(1, 8, 26, 30), roof="flat", roofc="camo", wall="concrete", wallc="concrete_d", wall_rows=8, win="slit", door="double", extras=[("antenna", 6), ("antenna", 20), ("dome", "metal_l", 4, -2)])],
  objs=[("dish", 27, 6, 5)], items=[("fence", 0, 0, 32, 32, "metal_d")], post=[("rect", 2, 9, 3, 1, "#ff00ff")])
B("decoy_site", "military", "Mo", (1, 1), ground="dirt", parts=[], items=[("ringi", 8, 9, 6, "khaki", 2), ("rect", 4, 6, 8, 6, "canvas_d"), ("rect", 5, 7, 6, 4, "canvas"), ("rect", 5, 4, 2, 3, "canvas_d"), ("rect", 9, 4, 2, 3, "canvas_d"), ("ln", 2, 12, 14, 12, "wood_d")],
  boxes=[(2, 3, 14, 14)])
B("reload_depot", "military", "Mo", (2, 1), ground="asphalt",
  parts=[dict(body=(16, 2, 30, 14), roof="flat", roofc="metal_l", wall="metal", wallc="metal_d", wall_rows=5, door="garage")],
  items=[("crates", 1, 2, 4), ("rect", 1, 9, 12, 2, "offwhite"), ("rect", 1, 12, 12, 2, "offwhite"), ("rect", 12, 9, 1, 1, "red"), ("rect", 12, 12, 1, 1, "red")],
  objs=[("crane", 9, 1, 6, 6, "yellow")])
B("interceptor_pad", "military", "F", (1, 1), ground="paving", parts=[], items=[("disc", 8, 8, 6.5, "asphalt"), ("ringi", 8, 8, 6.5, "neon2", 1), ("rect", 5, 7, 6, 2, "metal_l"), ("rect", 7, 5, 2, 6, "metal_d"), ("disc", 8, 8, 1.4, "neon2")],
  night=[("ringi", 8, 8, 6.5, "neon2", 1)])
B("balloon_winch", "military", "I", (1, 1), rise=14, ground="dirt", parts=[], items=[("rect", 5, 11, 6, 3, "wood"), ("rect", 6, 9, 4, 2, "metal_d")],
  post=[("ln", 8, 9, 8, -4, "lgrey"), ("disc", 8, -8, 4.5, "canvas"), ("disc", 8, -8, 3, "canvas_d"), ("rect", 7, -4, 2, 2, "wood")], boxes=[(3, -12, 13, 14)])

# mountains, passes and crossings
B("mountain_gate", "military", "M", (2, 1), up=4, ground="gravel", roof="flat", roofc="stone", wall="stone", wallc="stone", wall_rows=8, win="slit", door="arch", body=(1, 1, 30, 14),
  extras=[("crenel",), ("flag", 3, 0), ("flag", 25, 0)])
B("pass_fort", "military", "G", (2, 2), up=6, ground="gravel",
  roof="flat", roofc="stone_l", wall="stone", wallc="stone", wall_rows=10, win="slit", door="arch", body=(2, 6, 29, 29), extras=[("crenel",), ("flag", 14, 0)],
  post=[("cannon", 4, 3), ("cannon", 22, 3)])
B("mountain_watchpost", "military", "M", (1, 1), rise=6, ground="gravel",
  parts=[dict(body=(3, -5, 12, 6), roof="gable", roofc="slate", rmat="slate", wall="stone", wallc="stone", wall_rows=4, win="slit", door="none")],
  items=[("disc", 8, 12, 6, "stone_d"), ("disc", 8, 11, 4.5, "stone")], post=[("rect", 13, -6, 1, 5, "wood_d"), ("rect", 14, -6, 3, 2, "#ff00ff")])
B("border_checkpoint", "transport", "Mo", (1, 1), ground="asphalt",
  parts=[dict(body=(1, 4, 6, 12), roof="flat", roofc="white", wall="plaster", wallc="white", wall_rows=4, win="small", door="small")],
  items=[("rect", 0, 7, 16, 5, "asphalt_l"), ("rect", 0, 9, 16, 1, "yline")],
  post=[("rect", 7, 6, 9, 1, "red"), ("rect", 8, 6, 2, 1, "white"), ("rect", 12, 6, 2, 1, "white"), ("rect", 7, 5, 1, 3, "dgrey")])
B("cable_car_station", "transport", "Mo", (1, 1), rise=6, ground="gravel",
  parts=[dict(body=(2, -2, 13, 12), roof="flat", roofc="metal_d", wall="metal", wallc="metal_l", wall_rows=6, win="band", door="small")],
  post=[("ln", 0, -4, 15, -1, "dgrey"), ("rect", 3, -5, 4, 3, "red"), ("rect", 4, -4, 2, 2, "window")])
B("ferry_landing", "transport", "M", (1, 1),
  items=[("rect", 0, 0, 16, 7, "water"), ("dock", 4, 5, 8, 9), ("rect", 5, 2, 6, 4, "wood_d")],
  post=[("rect", 2, 10, 1, 4, "wood_d"), ("rect", 13, 10, 1, 4, "wood_d")])
B("stairs_cliff", "transport", "M", (1, 1), items=[("rect", 4, 0, 8, 16, "stone_d")],
  post=[("rect", 4, 1, 8, 1, "stone_l"), ("rect", 4, 4, 8, 1, "stone_l"), ("rect", 4, 7, 8, 1, "stone_l"), ("rect", 4, 10, 8, 1, "stone_l"), ("rect", 4, 13, 8, 1, "stone_l"), ("rect", 3, 0, 1, 16, "stone"), ("rect", 12, 0, 1, 16, "stone")])

# spent and offline states, swapped in while a site reloads
B("sam_battery_empty", "military", "Mo", (2, 1), states=False, ground="gravel",
  parts=[dict(body=(19, 4, 30, 14), roof="flat", roofc="olive", wall="metal", wallc="olive_d", wall_rows=4, win="small", door="small")],
  items=[("rect", 1, 5, 14, 8, "olive"), ("rect", 2, 6, 12, 6, "olive_d")],
  post=[("rect", 2, 6, 3, 2, "dgrey"), ("rect", 2, 9, 3, 2, "dgrey"), ("rect", 7, 6, 3, 2, "dgrey"), ("rect", 7, 9, 3, 2, "dgrey"),
  ("rect", 12, 4, 1, 9, "metal_l"), ("disc", 24, 2, 2.5, "offwhite"), ("rect", 1, 13, 14, 1, "#ff00ff"), ("crates", 1, 1, 2)])
B("sam_heavy_empty", "military", "Mo", (2, 2), states=False, rise=6, ground="gravel",
  parts=[dict(body=(20, 18, 30, 29), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=5, win="slit", door="std", extras=[("antenna", 8)])],
  items=[("fence", 0, 0, 32, 32, "metal_d"), ("rect", 2, 3, 16, 12, "olive"), ("rect", 3, 4, 14, 10, "olive_d"), ("rect", 2, 18, 15, 11, "olive")],
  post=[("rect", 4, 6, 3, 5, "dgrey"), ("rect", 9, 6, 3, 5, "dgrey"), ("rect", 14, 6, 3, 5, "dgrey"),
  ("rect", 4, 20, 11, 3, "metal_d"), ("rect", 4, 24, 11, 3, "metal_d"), ("disc", 25, 15, 3, "offwhite"), ("crates", 20, 3, 4), ("rect", 2, 30, 14, 1, "#ff00ff")])
B("shield_node_offline", "military", "F", (1, 1), states=False, rise=8, ground="paving", parts=[], items=[("disc", 8, 13, 5, "metal_d"), ("disc", 8, 13, 3.5, "metal")],
  post=[("rect", 7, -6, 2, 18, "metal_l"), ("rect", 6, -8, 4, 3, "metal_d"), ("ringi", 8, -7, 4, "dgrey", 2), ("disc", 8, -7, 1.6, "grey")], boxes=[(2, -8, 14, 14)])
B("abm_silo_empty", "military", "Mo", (2, 2), states=False, ground="paving",
  items=[("rect", 1, 1, 30, 30, "concrete"), ("fence", 0, 0, 32, 32, "metal_d")],
  post=[("disc", 9, 9, 5.5, "dgrey"), ("disc", 9, 9, 4.5, "ink"), ("disc", 23, 9, 5.5, "dgrey"), ("disc", 23, 9, 4.5, "ink"),
  ("disc", 9, 23, 5.5, "dgrey"), ("disc", 9, 23, 4.5, "ink"), ("disc", 23, 23, 5.5, "dgrey"), ("disc", 23, 23, 4.5, "ink"), ("crates", 14, 14, 4)])
