import math
import random
from core import C, P, hx, shade, mix, add
from sets import mname, arms

EDGE_KINDS = {
    "cliff": {"rock": "stone", "dark": "stone_d", "rim": "stone_l", "era": None},
    "canyon_rim": {"rock": "clay", "dark": "mud_d", "rim": "sand_d", "era": None},
    "riverbank": {"rock": "dirt", "dark": "dirt_d", "rim": "leaf", "era": None},
    "ice_shelf": {"rock": "ice", "dark": "water_d", "rim": "snow", "era": None},
}
LINE_KINDS = {
    "ridge": {"rock": "stone", "dark": "stone_d", "light": "stone_l"},
    "ravine": {"rock": "dirt_d", "dark": "black", "light": "dirt_l"},
    "crevasse": {"rock": "ice", "dark": "#24506f", "light": "snow"},
}
DIRS = [(1, "N"), (2, "E"), (4, "S"), (8, "W")]


def edge_tile(kind, m, depth=6):
    spec = EDGE_KINDS[kind]
    c = C(16, 16, m * 7 + len(kind))

    def put(side, d, k, col):
        if side == "N":
            c.px(k, d, col)
        elif side == "S":
            c.px(k, 15 - d, col)
        elif side == "W":
            c.px(d, k, col)
        else:
            c.px(15 - d, k, col)

    def face(side):
        stripe = [c.rng.random() for _ in range(16)]
        for d in range(depth):
            t = 1 - d / max(1, depth - 1)
            for k in range(16):
                col = mix(spec["rock"], spec["dark"], .1 + .8 * t)
                if stripe[k] < .3 and d:
                    col = mix(col, "black", .35)
                elif stripe[k] > .82 and d:
                    col = mix(col, spec["rim"], .3)
                jitter = 1 if (stripe[(k + d) % 16] < .18 and 0 < d < depth - 1) else 0
                put(side, d + jitter, k, col)
        for k in range(16):
            put(side, 0, k, mix(spec["dark"], "black", .5))
            put(side, depth - 1, k, mix(spec["rock"], spec["dark"], .55))
            put(side, depth, k, spec["rim"] if k % 4 else mix(spec["rim"], spec["rock"], .45))
        if kind == "riverbank":
            for i in range(7):
                put(side, depth, c.rng.randrange(16), "leaf_d")
        if kind == "ice_shelf":
            for i in range(8):
                put(side, c.rng.randrange(depth), c.rng.randrange(16), "snow")

    for bit, name in DIRS:
        if m & bit:
            face(name)
    return c


def line_tile(kind, m):
    spec = LINE_KINDS[kind]
    c = C(16, 16, m * 13 + len(kind))
    half = 4 if kind in ("ravine", "ridge") else 3

    def band(x0, y0, x1, y1, o):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if kind == "ravine":
                    t = min(abs(x - 7.5), abs(y - 7.5)) if o == "c" else (abs(y - 7.5) if o == "h" else abs(x - 7.5))
                    col = spec["dark"] if t < 1.6 else mix(spec["rock"], spec["dark"], .4 if t < 3 else .1)
                elif kind == "crevasse":
                    t = abs(y - 7.5) if o == "h" else abs(x - 7.5) if o == "v" else min(abs(x - 7.5), abs(y - 7.5))
                    col = spec["dark"] if t < 1.2 else (spec["light"] if t < 2.4 else mix(spec["rock"], spec["light"], .5))
                else:
                    t = abs(y - 7.5) if o == "h" else abs(x - 7.5) if o == "v" else min(abs(x - 7.5), abs(y - 7.5))
                    col = spec["light"] if t < 1.2 else mix(spec["rock"], spec["dark"], .15 + t * .18)
                c.px(x, y, col)
    arms(m, half, band)
    if kind in ("ridge", "ravine"):
        src = c.a.copy()
        for y in range(16):
            for x in range(16):
                if src[y, x, 3]:
                    continue
                if (y > 0 and src[y - 1, x, 3]) or (x > 0 and src[y, x - 1, 3]):
                    c.px(x, y, (0, 0, 0, 60))
    if kind == "ridge":
        for i in range(14):
            x, y = c.rng.randrange(16), c.rng.randrange(16)
            if c.solid(x, y):
                c.px(x, y, c.rng.choice([spec["light"], spec["dark"]]))
    if kind == "ravine":
        for i in range(10):
            x, y = c.rng.randrange(16), c.rng.randrange(16)
            if c.solid(x, y):
                c.px(x, y, c.rng.choice(["dirt", "stone_d"]))
    return c


def deco(k):
    c = C(16, 16, len(k) * 3 + 1)
    r = c.rng
    if k == "boulder_field":
        for (x, y, s) in ((3, 5, 3), (9, 4, 2.4), (6, 10, 2.8), (12, 10, 2), (2, 12, 1.6)):
            c.disc(x, y + .6, s, "stone_d")
            c.disc(x - .3, y, s - .6, "stone")
            c.px(int(x - s / 2), int(y - s / 2), "stone_l")
    elif k == "scree_slope":
        for i in range(60):
            x, y = r.randrange(16), r.randrange(16)
            if y > 3 and r.random() < (y + 4) / 22:
                c.px(x, y, r.choice(["stone", "stone_d", "stone_l"]))
    elif k == "rockfall":
        c.poly([(2, 15), (6, 6), (9, 6), (13, 15)], "stone_d")
        c.poly([(4, 15), (7, 8), (9, 8), (11, 15)], "stone")
        for i in range(12):
            c.px(r.randrange(2, 14), r.randrange(8, 16), "stone_l")
    elif k == "hoodoo":
        c.ellipse(8, 15, 5, 1.6, "sand_d")
        c.poly([(6, 14), (7, 9), (6, 8), (7, 4), (10, 4), (9, 8), (10, 9), (11, 14)], "clay")
        c.poly([(7, 14), (8, 9), (7, 8), (8, 4), (9, 4), (9, 8), (9, 9), (9, 14)], "sand_d")
        c.rect(5, 2, 7, 3, "clay")
        c.rect(5, 2, 7, 1, "sand")
        c.rect(5, 8, 3, 2, "clay"); c.rect(9, 8, 3, 2, "clay")
    elif k == "rock_arch":
        c.rect(2, 4, 3, 11, "stone")
        c.rect(11, 4, 3, 11, "stone")
        c.rect(2, 3, 12, 3, "stone_l")
        c.rect(5, 6, 6, 9, (0, 0, 0, 0))
        c.hline(2, 13, 6, "stone_d")
    elif k == "cave_entrance":
        c.poly([(1, 15), (3, 6), (8, 3), (13, 6), (15, 15)], "stone_d")
        c.poly([(3, 6), (8, 3), (11, 6), (7, 8)], "stone")
        c.ellipse(8, 12, 3.5, 3.5, "black")
        c.ellipse(8, 11, 2.6, 2.4, "ink")
    elif k == "mountain_path":
        for y in range(16):
            x = 8 + int(3 * math.sin(y / 3.4))
            c.hline(x - 1, x + 1, y, "dirt_l")
            c.px(x - 2, y, "stone")
            c.px(x + 2, y, "stone_d")
    elif k == "pass_marker":
        c.poly([(0, 14), (5, 4), (8, 11), (11, 3), (16, 14)], "stone_d")
        c.poly([(1, 14), (5, 6), (8, 12), (11, 5), (15, 14)], "stone")
        c.hline(5, 11, 13, "dirt_l")
        c.hline(6, 10, 12, "dirt")
    elif k == "stepping_stones":
        for (x, y) in ((3, 4), (7, 6), (10, 9), (5, 11), (12, 13)):
            c.disc(x, y, 1.6, "stone_d")
            c.disc(x - .2, y - .3, 1.1, "stone_l")
    elif k == "ford_marker":
        c.rect(0, 5, 16, 6, "water_l")
        for i in range(14):
            c.px(r.randrange(16), r.randrange(5, 11), "white")
        c.hline(0, 15, 4, "dirt_l"); c.hline(0, 15, 11, "dirt_l")
        for x in range(1, 15, 4):
            c.px(x, 7, "stone_l"); c.px(x + 1, 8, "stone")
    elif k == "rapids":
        c.rect(0, 0, 16, 16, "water")
        for i in range(26):
            x, y = r.randrange(16), r.randrange(16)
            c.px(x, y, "white" if r.random() < .5 else "water_l")
        for (x, y) in ((4, 5), (11, 9), (7, 13)):
            c.disc(x, y, 1.4, "stone_d")
    elif k == "waterfall":
        c.rect(4, 0, 8, 20, "water_l")
        for i in range(30):
            c.px(r.randrange(4, 12), r.randrange(0, 20), "white")
        c.rect(0, 0, 4, 22, "stone_d"); c.rect(12, 0, 4, 22, "stone_d")
        c.rect(1, 0, 2, 22, "stone"); c.rect(13, 0, 2, 22, "stone")
        c.ellipse(8, 22, 6, 3, "water")
        c.ellipse(8, 22, 4, 2, "white")
    elif k == "landslide":
        c.poly([(1, 0), (7, 0), (13, 15), (3, 15)], "dirt_d")
        c.poly([(3, 0), (6, 0), (10, 15), (6, 15)], "dirt")
        for i in range(16):
            c.px(r.randrange(2, 13), r.randrange(16), r.choice(["stone", "stone_d", "wood_d"]))
    elif k == "sinkhole":
        c.disc(8, 8, 7, "dirt_d")
        c.disc(8, 8, 5.4, "mud_d")
        c.disc(8, 8, 3.4, "ink")
        c.ring(8, 8, 7, "dirt_l")
    elif k == "quicksand":
        c.disc(8, 8, 6.5, "sand_d")
        c.disc(8, 8, 4.5, "mud")
        c.ring(8, 8, 3, "sand")
        c.ring(8, 8, 1.6, "mud_d")
    elif k == "geyser":
        c.disc(8, 12, 5, "stone_l")
        c.disc(8, 12, 3, "water_l")
        c.rect(7, 2, 2, 9, (230, 240, 255, 170))
        c.rect(6, 1, 4, 3, (255, 255, 255, 120))
    elif k == "hot_spring":
        c.disc(8, 8, 6.5, "stone")
        c.disc(8, 8, 5, "teal")
        c.disc(8, 8, 3, "neon2")
        c.px(5, 5, "white"); c.px(11, 10, (255, 255, 255, 120))
    elif k == "fumarole":
        c.poly([(3, 15), (6, 8), (10, 8), (13, 15)], "stone_d")
        c.disc(8, 8, 2, "black")
        c.disc(8, 4, 2.6, (200, 200, 205, 120))
        c.disc(9, 1, 2, (200, 200, 205, 90))
    elif k == "tar_pit":
        c.ellipse(8, 9, 7, 5, "black")
        c.ellipse(8, 9, 5, 3.4, "ink")
        c.px(6, 7, "grey"); c.px(10, 10, "dgrey")
    elif k == "oasis":
        c.ellipse(8, 9, 6, 4, "green_d")
        c.ellipse(8, 9, 4, 2.6, "water_l")
        for (x, y) in ((2, 4), (13, 6), (4, 13)):
            c.line(x, y + 4, x, y, "wood")
            for (dx, dy) in ((-3, 1), (3, 1), (-2, -2), (2, -2)):
                c.line(x, y, x + dx, y + dy, "green")
    elif k == "wadi":
        for y in range(16):
            x = 8 + int(3.4 * math.sin(y / 4 + 1))
            c.hline(x - 2, x + 2, y, "sand_d")
            c.hline(x - 1, x + 1, y, "dirt_l")
            c.px(x - 3, y, "sand"); c.px(x + 3, y, "sand")
    elif k == "salt_crust":
        c.rect(0, 0, 16, 16, "offwhite")
        for i in range(30):
            x, y = r.randrange(16), r.randrange(16)
            c.px(x, y, "lgrey")
        for y in range(0, 16, 5):
            c.hline(0, 15, y, "sand_d")
        for x in range(0, 16, 6):
            c.vline(x, 0, 15, "sand_d")
    elif k == "dust_bowl":
        c.ellipse(8, 9, 7, 5, "dirt_l")
        for i in range(24):
            c.px(r.randrange(16), r.randrange(16), r.choice(["sand", "dirt", "dirt_d"]))
    elif k == "thicket_patch":
        for i in range(30):
            x, y = r.randrange(1, 15), r.randrange(2, 15)
            c.px(x, y, r.choice(["leaf_d", "green_d", "olive_d"]))
        for i in range(12):
            x, y = r.randrange(1, 15), r.randrange(2, 15)
            c.line(x, y, x + r.randint(-2, 2), y - 3, "wood_d")
    elif k == "bamboo_clump":
        for x in range(2, 15, 3):
            h = r.randint(8, 14)
            c.vline(x, 15 - h, 15, "green_l")
            c.vline(x + 1, 15 - h, 15, "green_d")
            for y in range(15 - h, 15, 4):
                c.px(x, y, "straw")
            c.line(x, 15 - h, x + 3, 15 - h - 2, "green")
    elif k == "vines":
        for x in range(1, 16, 3):
            h = r.randint(7, 15)
            for y in range(h):
                c.px(x + (y // 2) % 2, y, "leaf" if y % 3 else "leaf_d")
                if y % 4 == 3:
                    c.px(x + 2 - (y // 2) % 2, y, "green_l")
            c.px(x, h, "leaf_l")
        c.hline(0, 15, 0, "leaf_d")
        c.hline(0, 15, 1, "leaf")
    elif k == "fallen_log":
        c.rect(1, 7, 13, 4, "wood")
        c.hline(1, 13, 7, "wood_l")
        c.hline(1, 13, 10, "wood_d")
        c.disc(14, 9, 2.2, "straw")
        c.ring(14, 9, 1.2, "wood_d")
    elif k == "deadfall":
        for (x0, y0, x1, y1) in ((1, 12, 14, 8), (2, 5, 13, 11), (4, 14, 11, 3)):
            c.line(x0, y0, x1, y1, "wood_d")
            c.line(x0, y0 + 1, x1, y1 + 1, "wood")
    elif k == "bog_pool":
        c.ellipse(8, 9, 6.5, 4.5, "olive_d")
        c.ellipse(8, 9, 5, 3.2, "#3f4a32")
        c.px(6, 8, "leaf"); c.px(10, 10, "leaf_d")
        for x in (2, 13):
            c.vline(x, 6, 12, "olive")
    elif k == "tussock":
        for (x, y) in ((3, 10), (8, 7), (12, 12), (6, 14)):
            for d in range(-2, 3):
                c.line(x, y + 3, x + d, y, r.choice(["olive", "straw", "green_d"]))
    elif k == "peat_cut":
        c.rect(2, 4, 12, 9, "mud_d")
        for y in range(4, 13, 3):
            c.hline(2, 13, y, "dirt_d")
        c.rect(3, 5, 3, 2, "black"); c.rect(9, 8, 3, 2, "black")
    elif k == "ice_crack":
        c.line(2, 14, 7, 8, "#24506f"); c.line(7, 8, 9, 3, "#24506f")
        c.line(7, 8, 13, 6, "#24506f")
        for (x, y) in ((3, 13), (8, 5), (12, 6)):
            c.px(x, y, "ice")
    elif k == "pressure_ridge":
        for x in range(0, 16, 3):
            c.poly([(x, 11), (x + 2, 4), (x + 4, 11)], "snow")
            c.poly([(x + 2, 4), (x + 4, 11), (x + 3, 11)], "ice")
        c.hline(0, 15, 12, "snow_d")
    elif k == "snow_cornice":
        c.poly([(0, 8), (5, 5), (11, 6), (16, 4), (16, 10), (0, 12)], "snow")
        c.hline(0, 15, 12, "snow_d")
        c.poly([(2, 12), (6, 15), (12, 12)], (200, 215, 230, 120))
    elif k == "mangrove_root":
        c.rect(0, 0, 16, 16, (58, 120, 176, 110))
        for x in range(2, 15, 4):
            c.vline(x, 4, 13, "wood_d")
            c.line(x, 9, x - 2, 14, "wood_d")
            c.line(x, 9, x + 2, 14, "wood_d")
            c.disc(x, 3, 2.4, "pine")
    elif k == "tidal_pool":
        c.ellipse(8, 9, 6.5, 4.5, "sand_d")
        c.ellipse(8, 9, 4.5, 3, "water_l")
        c.px(6, 8, "teal"); c.px(10, 9, "pink")
        for i in range(10):
            c.px(r.randrange(16), r.randrange(16), "sand")
    elif k == "dune_crest":
        c.poly([(0, 12), (5, 6), (10, 9), (16, 4), (16, 16), (0, 16)], "sand")
        c.poly([(0, 13), (5, 8), (10, 11), (16, 6), (16, 16), (0, 16)], "sand_d")
        c.line(0, 12, 5, 6, "offwhite"); c.line(10, 9, 15, 4, "offwhite")
    elif k == "dune_ripples":
        for y in range(1, 16, 3):
            for x in range(16):
                c.px(x, y + (1 if (x // 3) % 2 else 0), "sand_d")
    if k not in ("ford_marker", "rapids", "salt_crust", "dune_ripples", "vines", "mangrove_root", "scree_slope", "thicket_patch", "dust_bowl"):
        c.outline(.3)
    return c


OVERLAYS = {
    "slow_ground": ("hatch", (200, 170, 90, 90)),
    "rough_ground": ("dots", (180, 150, 120, 110)),
    "impassable": ("cross", (220, 70, 60, 110)),
    "fast_route": ("arrows", (110, 220, 130, 110)),
    "defence_bonus": ("shieldpat", (110, 170, 230, 110)),
    "chokepoint": ("pinch", (232, 200, 74, 150)),
    "no_fly": ("ring", (220, 90, 70, 120)),
    "supply_reach": ("soft", (240, 210, 120, 70)),
}


def overlay(kind):
    style, col = OVERLAYS[kind]
    c = C(16, 16, 5 + len(kind))
    if style == "hatch":
        for i in range(-16, 32, 4):
            c.line(i, 0, i + 16, 16, col)
    elif style == "dots":
        for y in range(1, 16, 4):
            for x in range((y // 4 % 2) * 2 + 1, 16, 4):
                c.px(x, y, col)
                c.px(x + 1, y + 1, col)
    elif style == "cross":
        c.line(2, 2, 13, 13, col); c.line(13, 2, 2, 13, col)
        c.frame(0, 0, 16, 16, (col[0], col[1], col[2], 70))
    elif style == "arrows":
        for y in (3, 11):
            c.hline(2, 11, y, col)
            c.poly([(11, y - 3), (15, y), (11, y + 3)], col)
    elif style == "shieldpat":
        c.poly([(8, 2), (13, 4), (12, 10), (8, 14), (4, 10), (3, 4)], col)
    elif style == "pinch":
        c.poly([(0, 0), (6, 6), (6, 9), (0, 15)], col)
        c.poly([(15, 0), (9, 6), (9, 9), (15, 15)], col)
    elif style == "ring":
        c.ring(8, 8, 7, col, 1.5)
        c.line(3, 3, 12, 12, col)
    elif style == "soft":
        for y in range(16):
            for x in range(16):
                if (x + y) % 3 == 0:
                    c.px(x, y, col)
    return c


CHOKE_ICONS = {
    "pass": ("stone_l", ["x...x", ".x.x.", "..x..", ".....", "xxxxx"]),
    "ford": ("water_l", [".....", "xx.xx", "..x..", "xx.xx", "....."]),
    "bridge_point": ("wood_l", ["x...x", "xxxxx", "x...x", "xxxxx", "x...x"]),
    "tunnel": ("dgrey", [".xxx.", "x...x", "x...x", "x...x", "x...x"]),
    "strait": ("water", ["xx.xx", "xx.xx", "x...x", "xx.xx", "xx.xx"]),
    "cliff": ("stone", ["xxxxx", "x.x.x", ".x.x.", ".....", "....."]),
    "ridge_icon": ("stone_l", ["..x..", ".x.x.", "x...x", ".....", "xxxxx"]),
    "air_defence": ("#4fe0d8", ["..x..", ".x.x.", "x.x.x", "..x..", "xxxxx"]),
}


def choke_icon(k):
    col, pat = CHOKE_ICONS[k]
    c = C(8, 8, 3)
    c.rect(0, 0, 8, 8, "#14171d")
    for y, row in enumerate(pat):
        for x, ch in enumerate(row):
            if ch == "x":
                c.px(x + 1, y + 1, col)
    c.a[0, 0] = c.a[0, 7] = c.a[7, 0] = c.a[7, 7] = 0
    return c


DECOS = ["boulder_field", "scree_slope", "rockfall", "hoodoo", "rock_arch", "cave_entrance", "mountain_path", "pass_marker",
         "stepping_stones", "ford_marker", "rapids", "landslide", "sinkhole", "quicksand", "geyser", "hot_spring", "fumarole",
         "tar_pit", "oasis", "wadi", "salt_crust", "dust_bowl", "thicket_patch", "bamboo_clump", "vines", "fallen_log",
         "deadfall", "bog_pool", "tussock", "peat_cut", "ice_crack", "pressure_ridge", "snow_cornice", "mangrove_root",
         "tidal_pool", "dune_crest", "dune_ripples"]

SLOW_NOTE = {
    "boulder_field": "rough ground, slow for vehicles",
    "scree_slope": "loose rock, slow and tiring",
    "rockfall": "blocks a path until cleared",
    "cave_entrance": "shelter or a tunnel mouth",
    "mountain_path": "the only quick way over a ridge",
    "pass_marker": "chokepoint between two ranges",
    "stepping_stones": "slow river crossing for troops only",
    "ford_marker": "shallow crossing, no bridge needed",
    "rapids": "boats cannot pass",
    "landslide": "closes a road until repaired",
    "sinkhole": "impassable hole",
    "quicksand": "impassable to vehicles",
    "tar_pit": "impassable, damages units",
    "oasis": "water and shade in desert",
    "wadi": "dry river bed, floods in wet season",
    "salt_crust": "flat and fast, no cover",
    "thicket_patch": "slow, strong defence",
    "bamboo_clump": "slow, strong defence",
    "vines": "slow for infantry",
    "deadfall": "slow, blocks vehicles",
    "bog_pool": "impassable to vehicles",
    "tussock": "slow, marshy ground",
    "ice_crack": "risky for heavy units",
    "pressure_ridge": "slow sea ice",
    "snow_cornice": "avalanche risk above a pass",
    "mangrove_root": "slow, hides landings",
    "dune_crest": "slow climb, good vision",
}


def crossing(kind, o):
    c = C(16, 16, 7 + len(kind))
    horiz = o == "h"

    def band(x0, y0, w, h, col):
        if horiz:
            c.rect(0, y0, 16, h, col)
        else:
            c.rect(y0, 0, h, 16, col)

    if kind == "pontoon_bridge":
        band(0, 3, 16, 10, "metal_d")
        band(0, 4, 16, 8, "metal")
        for k in range(0, 16, 4):
            if horiz:
                c.rect(k, 2, 3, 2, "olive"); c.rect(k, 12, 3, 2, "olive")
            else:
                c.rect(2, k, 2, 3, "olive"); c.rect(12, k, 2, 3, "olive")
        if horiz:
            c.hline(0, 15, 7, "metal_l"); c.hline(0, 15, 8, "metal_d")
        else:
            c.vline(7, 0, 15, "metal_l"); c.vline(8, 0, 15, "metal_d")
    elif kind == "causeway":
        band(0, 3, 16, 10, "stone_d")
        band(0, 4, 16, 8, "stone")
        band(0, 6, 16, 4, "dirt_l")
        for k in range(0, 16, 3):
            if horiz:
                c.px(k, 4, "stone_l"); c.px(k + 1, 11, "stone_l")
            else:
                c.px(4, k, "stone_l"); c.px(11, k + 1, "stone_l")
    elif kind == "rope_bridge":
        band(0, 6, 16, 4, "wood")
        for k in range(0, 16, 2):
            if horiz:
                c.px(k, 6, "wood_d"); c.px(k, 9, "wood_d")
                c.px(k, 3, "canvas_d"); c.px(k, 12, "canvas_d")
            else:
                c.px(6, k, "wood_d"); c.px(9, k, "wood_d")
                c.px(3, k, "canvas_d"); c.px(12, k, "canvas_d")
    elif kind == "cable_line":
        if horiz:
            c.hline(0, 15, 6, "dgrey"); c.hline(0, 15, 10, "dgrey")
            c.rect(7, 4, 3, 2, "red"); c.rect(8, 5, 1, 1, "window")
        else:
            c.vline(6, 0, 15, "dgrey"); c.vline(10, 0, 15, "dgrey")
            c.rect(4, 7, 2, 3, "red"); c.rect(5, 8, 1, 1, "window")
    elif kind == "pipeline_mountain":
        band(0, 6, 16, 4, "metal")
        if horiz:
            c.hline(0, 15, 6, "metal_l"); c.hline(0, 15, 9, "metal_d")
            for k in range(2, 16, 5):
                c.rect(k, 10, 2, 4, "stone_d")
        else:
            c.vline(6, 0, 15, "metal_l"); c.vline(9, 0, 15, "metal_d")
            for k in range(2, 16, 5):
                c.rect(10, k, 4, 2, "stone_d")
    c.outline(.35)
    return c


def build():
    for kind in EDGE_KINDS:
        for m in range(1, 16):
            add(f"{kind}_{mname(m)}", "features", f"edge_{kind}", edge_tile(kind, m), tags=["autotile", "edge", f"mask{m}"],
                note="drawn on the high side, mask marks the sides that drop away")
    for kind in LINE_KINDS:
        for m in range(16):
            add(f"{kind}_{mname(m)}", "features", f"line_{kind}", line_tile(kind, m), tags=["autotile", f"mask{m}"],
                note="connects along a line like a road")
    for k in DECOS:
        fp = (1, 2) if k == "waterfall" else (1, 1)
        add(f"feat_{k}", "features", "rough_ground", deco(k), fp=fp, note=SLOW_NOTE.get(k))
    add("feat_waterfall", "features", "rough_ground", deco("waterfall"), fp=(1, 2), note="river drop, boats cannot pass")
    for k in OVERLAYS:
        add(f"ov_{k}", "overlays", "movement", overlay(k), tags=["tileable", "overlay"])
    for kind, era in (("pontoon_bridge", "I"), ("causeway", "M"), ("rope_bridge", "T"), ("cable_line", "Mo"), ("pipeline_mountain", "Mo")):
        for o in ("h", "v"):
            add(f"{kind}_{o}", "transport", "crossings", crossing(kind, o), era=era, note="lay in a line across the obstacle")
    for k in CHOKE_ICONS:
        add(f"mapicon_{k}", "mapicons", "zoomed_out", choke_icon(k), fp=(.5, .5))
