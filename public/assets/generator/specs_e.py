from specs_a import B

# wonders, one more per era
B("wonder_stone_circle", "tourism", "T", (2, 2), ground="lawn", parts=[],
  items=[("disc", 16, 16, 12, "lawn_d"), ("ringi", 16, 16, 11, "dirt_l", 2)],
  post=[("rect", 15, 3, 3, 6, "stone_l"), ("rect", 24, 8, 3, 6, "stone"), ("rect", 25, 19, 3, 6, "stone_l"), ("rect", 15, 24, 3, 6, "stone"),
  ("rect", 5, 19, 3, 6, "stone_l"), ("rect", 4, 8, 3, 6, "stone"), ("rect", 13, 14, 7, 3, "stone_d")], boxes=[(3, 3, 28, 28)])
B("wonder_hanging_gardens", "tourism", "M", (3, 3), rise=10, ground="paving",
  parts=[dict(body=(2, 22, 45, 45), roof="flat", roofc="stone_l", wall="stone", wallc="stone_l", wall_rows=10, win="arch", door="arch", extras=[("greenery",)]),
         dict(body=(7, 10, 40, 30), roof="flat", roofc="green_d", wall="stone", wallc="stone", wall_rows=9, win="none", door="none", extras=[("greenery",)]),
         dict(body=(13, -2, 34, 18), roof="flat", roofc="green", wall="stone", wallc="stone_l", wall_rows=8, win="none", door="none", extras=[("greenery",), ("garden", 10)])])
B("wonder_triumphal_arch", "tourism", "G", (2, 2), rise=8, ground="paving", parts=[],
  post=[("rect", 3, -6, 8, 34, "stone_l"), ("rect", 21, -6, 8, 34, "stone_l"), ("rect", 2, -10, 28, 6, "stone"),
  ("poly", [(11, 10), (16, -2), (21, 10), (21, 28), (11, 28)], (0, 0, 0, 0)), ("rect", 2, -12, 28, 2, "gold_d"), ("rect", 12, -9, 8, 2, "gold")],
  items=[("rect", 0, 26, 32, 6, "stone_d")], boxes=[(2, -12, 30, 30)])
B("wonder_great_exhibition", "tourism", "I", (3, 2), rise=6, ground="lawn",
  parts=[dict(body=(1, 4, 46, 30), roof="barrel", roofc="glass_l", wall="glass", wallc="glass", wall_rows=10, win="none", door="glass", extras=[("skylight",)])],
  items=[("path", 20, 30, 8, 2, "stone_l")], post=[("rect", 4, 2, 2, 6, "#ff00ff"), ("rect", 42, 2, 2, 6, "#ff00ff")])
B("wonder_observatory", "tourism", "Mo", (2, 2), rise=8, ground="paving",
  parts=[dict(body=(3, 6, 28, 30), roof="flat", roofc="concrete_l", wall="concrete", wallc="concrete_l", wall_rows=12, win="band", door="glass", extras=[("dome", "white", 9, -3)])],
  post=[("ln", 14, -2, 20, -6, "dgrey"), ("rect", 13, -3, 6, 2, "metal_d")])
B("wonder_launch_complex", "tourism", "F", (3, 3), rise=26, ground="paving",
  parts=[dict(body=(2, 30, 20, 45), roof="flat", roofc="concrete_d", wall="concrete", wallc="concrete", wall_rows=8, win="band", door="glass")],
  objs=[("lattice", 26, -18, 8, 44, "metal_d")],
  post=[("rect", 34, -24, 6, 60, "offwhite"), ("rect", 36, -24, 2, 60, "lgrey"), ("poly", [(34, -24), (37, -34), (40, -24)], "red"),
  ("rect", 33, 28, 8, 8, "metal_d"), ("disc", 37, 38, 5, (255, 220, 150, 120))], boxes=[(2, -34, 45, 45)])

# ports, rail and airport detail
B("dry_dock", "transport", "I", (3, 2), items=[("rect", 0, 0, 48, 32, "concrete"), ("rect", 6, 6, 36, 20, "water_d"), ("rect", 7, 7, 34, 18, "water"), ("rect", 5, 5, 38, 1, "concrete_d"), ("rect", 5, 26, 38, 1, "concrete_d"), ("hull", 12, 10, 24, 12, "metal_d")],
  parts=[], objs=[("crane", 4, 2, 10, 12, "yellow"), ("crane", 40, 2, 10, -10, "yellow")], boxes=[(0, 0, 47, 31)])
B("container_gantry", "transport", "Mo", (3, 2), rise=10, ground="asphalt", parts=[],
  objs=[("lattice", 4, -8, 6, 34, "teal"), ("lattice", 38, -8, 6, 34, "teal")],
  post=[("rect", 2, -10, 44, 4, "teal"), ("rect", 2, -6, 44, 2, "metal_d"), ("rect", 20, -6, 6, 14, "metal_l"), ("rect", 21, 8, 4, 3, "yellow")],
  items=[("containers", 2, 18, 44, 12)], boxes=[(2, -10, 45, 31)])
B("grain_terminal", "transport", "I", (2, 2), ground="paving", rise=8, parts=[], objs=[("cyl", 7, -8, 5, 22, "offwhite"), ("cyl", 18, -8, 5, 22, "offwhite"), ("cyl", 28, -6, 4, 20, "offwhite")],
  post=[("rect", 2, 26, 28, 4, "metal_d"), ("rect", 4, 27, 24, 2, "metal_l")], boxes=[(2, -8, 31, 30)])
B("fuel_farm", "transport", "Mo", (2, 2), ground="gravel", parts=[], objs=[("cyl", 9, 3, 7, 7, "offwhite"), ("cyl", 24, 4, 6, 6, "offwhite"), ("cyl", 14, 20, 6, 6, "offwhite")],
  items=[("fence", 0, 0, 32, 32, "metal_d"), ("pipe", 2, 14, 30, 14, "metal_l")])
B("engine_shed", "transport", "I", (3, 2), ground="gravel", roof="sawtooth", roofc="slate", wall="brick", wallc="brick_d", wall_rows=8, door="wide", body=(1, 1, 46, 24),
  items=[("rect", 0, 26, 48, 2, "stone"), ("rect", 0, 29, 48, 2, "stone")], extras=[("smokestack", 38, 0, 3, "brick")])
B("signal_box", "transport", "I", (1, 1), rise=6, ground="gravel",
  parts=[dict(body=(2, -4, 13, 12), roof="gable", roofc="slate", rmat="slate", wall="wood", wallc="wood_l", wall_rows=5, win="band", door="small")],
  post=[("rect", 14, -6, 1, 8, "dgrey"), ("rect", 12, -6, 3, 1, "red")])
B("marshalling_yard", "transport", "I", (3, 2), states=False, ground="gravel", parts=[],
  items=[("rect", 0, 4, 48, 2, "stone"), ("rect", 0, 10, 48, 2, "stone"), ("rect", 0, 16, 48, 2, "stone"), ("rect", 0, 22, 48, 2, "stone"),
  ("rows", 0, 4, 48, 2, "metal_l"), ("rows", 0, 10, 48, 2, "metal_l"), ("rows", 0, 16, 48, 2, "metal_l"), ("rows", 0, 22, 48, 2, "metal_l"),
  ("containers", 4, 5, 18, 2), ("containers", 26, 11, 18, 2)])
B("jet_bridge", "transport", "Mo", (2, 1), states=False, ground="asphalt", parts=[],
  items=[("rect", 2, 6, 24, 5, "metal_l"), ("rect", 2, 6, 24, 1, "offwhite"), ("rect", 2, 10, 24, 1, "metal_d"), ("rect", 26, 4, 5, 9, "metal"), ("rect", 0, 4, 3, 9, "concrete")])
B("cargo_apron", "transport", "Mo", (2, 2), states=False, ground="asphalt", parts=[],
  items=[("rect", 0, 0, 32, 32, "concrete"), ("rect", 2, 2, 28, 1, "yline"), ("rect", 2, 29, 28, 1, "yline"), ("crates", 4, 6, 4), ("containers", 16, 6, 14, 6), ("car", 6, 22, "white"), ("car", 20, 24, "yellow")])
B("fishing_harbour", "transport", "M", (2, 2), items=[("rect", 0, 0, 32, 14, "stone"), ("rect", 0, 13, 32, 1, "stone_d"), ("dock", 6, 14, 4, 18), ("dock", 20, 14, 4, 18), ("crates", 2, 2, 4)],
  parts=[dict(body=(12, 1, 29, 12), roof="gable", roofc="tile", wall="wood", wallc="wood_l", wall_rows=4, door="wide")],
  objs=[("boat", 10, 20, "wood", True), ("boat", 24, 24, "wood")])
