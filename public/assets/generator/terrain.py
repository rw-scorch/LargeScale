import math
import random
import numpy as np
from core import C, hx, shade, mix, add, P

BASE = {
    "deep_ocean": "#1d3f6e", "ocean": "#27548a", "shallows": "#3a78b0", "lake": "#3f7fb8", "river": "#4a8ac0", "coral_reef": "#3f9ab0",
    "beach": "#e0cc8e", "desert": "#d8b872", "dunes": "#e2c07a", "salt_flat": "#e6e0d0", "dry_earth": "#b89868",
    "savanna": "#b8b060", "steppe": "#a8a868", "grassland": "#79ad4f", "plains": "#8ab65a", "meadow": "#6fb05a", "scrub": "#8c9a58",
    "forest": "#4c8a3c", "pine_forest": "#346a42", "jungle": "#2f7a3a", "swamp": "#4f6a3c", "marsh": "#5f7f4a", "mangrove": "#3f6a44",
    "hills": "#7f9a52", "highlands": "#8a8a62", "mountain": "#8a847a", "high_mountain": "#a8a39a", "snow_peak": "#eef2f6", "cliff": "#6f6a62",
    "volcano": "#5a4a44", "lava": "#e0602a", "tundra": "#9aa88a", "snow": "#e6eef4", "glacier": "#cfe6f2", "sea_ice": "#dcecf4",
    "farmland": "#a88a52", "cleared": "#9a8a60", "scorched": "#4a4038", "crater": "#3a3430", "rubble": "#8a8378", "urban": "#9c988c",
    "badlands": "#a8764c", "canyon": "#8a5638", "escarpment": "#7d7266", "bog": "#5a6046", "thicket": "#4f7a3c",
    "bamboo": "#7aa84a", "rocky_desert": "#c0a070", "boulders": "#8f8a80", "scree": "#9b9288", "ice_field": "#d8e8f2",
    "mudflat": "#8c7f68", "highland_pass": "#96a072",
}
WATER = {"deep_ocean", "ocean", "shallows", "lake", "river", "coral_reef"}
SEASON_SHIFT = {
    "spring": {"green": .08, "tint": "#9fd070", "amt": .10},
    "summer": {"green": 0, "tint": None, "amt": 0},
    "autumn": {"green": -.05, "tint": "#c08a3a", "amt": .30},
    "winter": {"green": -.1, "tint": "#dfe8ee", "amt": .45},
    "dry": {"green": -.05, "tint": "#c8b070", "amt": .35},
}
VEG = {"savanna", "steppe", "grassland", "plains", "meadow", "scrub", "forest", "jungle", "swamp", "marsh", "mangrove", "hills", "highlands", "tundra", "farmland", "cleared",
       "bog", "thicket", "bamboo", "highland_pass", "badlands"}
EVERGREEN = {"pine_forest", "jungle", "mangrove", "bamboo", "thicket"}


NEW_TYPE_RULES = {
    "badlands": dict(move=2.2, defence=1.4, capture=1.3, fertility=0.05, build=True, note="dry eroded gullies, slow and broken"),
    "canyon": dict(move=4.0, defence=2.0, capture=2.0, fertility=0.05, build=False, note="only crossable at fords and bridges"),
    "escarpment": dict(move=3.2, defence=2.0, capture=1.8, fertility=0.1, build=False, note="steep rock step, a wall across the map"),
    "bog": dict(move=3.2, defence=1.1, capture=1.4, fertility=0.3, build=False, note="wet peat, impassable to vehicles"),
    "thicket": dict(move=2.4, defence=1.5, capture=1.5, fertility=0.3, build=True, note="dense scrub, good cover"),
    "bamboo": dict(move=2.2, defence=1.5, capture=1.4, fertility=0.5, build=True, note="fast growing, cuts to timber"),
    "rocky_desert": dict(move=1.8, defence=1.2, capture=0.9, fertility=0.05, build=True, note="stony hamada, hard going for wheels"),
    "boulders": dict(move=2.6, defence=1.7, capture=1.6, fertility=0.05, build=False, note="boulder field, infantry only"),
    "scree": dict(move=2.8, defence=1.3, capture=1.6, fertility=0.0, build=False, note="loose slope below cliffs"),
    "ice_field": dict(move=3.0, defence=1.1, capture=1.4, fertility=0.0, build=False, note="crevassed ice, risky for heavy units"),
    "mudflat": dict(move=2.2, defence=1.0, capture=1.1, fertility=0.2, build=False, note="tidal flat, floods at high tide"),
    "highland_pass": dict(move=1.6, defence=1.8, capture=1.6, fertility=0.2, build=True, note="the way through a range, the classic chokepoint"),
}


def to_hex(c):
    return "#%02x%02x%02x" % tuple(c[:3])


def palette(t, season):
    base = hx(BASE[t])
    s = SEASON_SHIFT[season]
    col = base
    if s["tint"] and (t in VEG or (season == "winter" and t in EVERGREEN | {"mountain", "high_mountain", "cliff"})):
        amt = s["amt"]
        if t in EVERGREEN:
            amt *= .4
        if season == "winter" and t in ("mountain", "high_mountain"):
            amt = .6
        col = mix(col, s["tint"], amt)
    if season == "winter" and t in ("lake", "river"):
        col = mix(col, "#cfe6f2", .55)
    shades = [shade(col, -.16), shade(col, -.07), col, shade(col, .09), shade(col, .18)]
    return [to_hex(x) for x in shades]


def palettes():
    out = {}
    for season in SEASON_SHIFT:
        out[season] = {t: palette(t, season) for t in BASE}
    return out


def vnoise(w, h, scale, seed):
    rng = np.random.default_rng(seed)
    gw, gh = int(w / scale) + 3, int(h / scale) + 3
    g = rng.random((gh, gw))
    ys, xs = np.mgrid[0:h, 0:w]
    fx, fy = xs / scale, ys / scale
    x0, y0 = fx.astype(int), fy.astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx
    b = g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def sample_map(season, w=240, h=150, seed=5):
    elev = vnoise(w, h, 40, seed) * .55 + vnoise(w, h, 16, seed + 1) * .3 + vnoise(w, h, 6, seed + 2) * .15
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xs - w / 2) / (w / 2)) ** 2 + ((ys - h / 2) / (h / 2)) ** 2)
    elev = elev - d * .45 + .12
    moist = vnoise(w, h, 30, seed + 7)
    lat = ys / h
    pal = palettes()[season]
    rng = np.random.default_rng(seed + 9)
    jitter = rng.random((h, w))
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            e, m = elev[y, x], moist[y, x]
            if e < .18:
                t = "deep_ocean"
            elif e < .26:
                t = "ocean"
            elif e < .3:
                t = "shallows"
            elif e < .315:
                t = "beach"
            elif e > .62:
                t = "snow_peak"
            elif e > .56:
                t = "high_mountain"
            elif e > .5:
                t = "mountain"
            elif e > .45:
                t = "hills"
            else:
                if lat[y, x] < .12:
                    t = "tundra"
                elif m < .3:
                    t = "desert" if lat[y, x] > .55 else "steppe"
                elif m < .42:
                    t = "savanna" if lat[y, x] > .55 else "plains"
                elif m < .55:
                    t = "grassland"
                elif m < .68:
                    t = "forest" if lat[y, x] < .6 else "jungle"
                elif m < .75:
                    t = "pine_forest"
                else:
                    t = "swamp"
            sh = pal[t]
            k = min(4, max(0, int(2 + (e * 30 % 1 - .5) * 1.2 + (jitter[y, x] - .5) * 2.2)))
            img[y, x] = hx(sh[k])
    return img


def deco(k, season="summer"):
    c = C(16, 16, len(k))
    leaf = {"spring": "leaf_l", "summer": "leaf", "autumn": "orange", "winter": None}[season]
    if k == "oak":
        c.ellipse(9, 13.5, 5, 1.5, (0, 0, 0, 60))
        c.rect(7, 9, 2, 5, "wood_d")
        if leaf:
            c.disc(8, 7, 5.5, shade(leaf, -.3)); c.disc(7.5, 6.5, 4.5, leaf); c.disc(6, 5, 2, shade(leaf, .25))
            if season == "autumn":
                c.px(10, 8, "red"); c.px(5, 8, "yellow")
        else:
            c.line(8, 9, 4, 4, "wood_d"); c.line(8, 9, 12, 4, "wood_d"); c.line(8, 8, 8, 2, "wood_d"); c.px(4, 3, "snow"); c.px(12, 3, "snow")
    elif k == "pine":
        c.ellipse(9, 14, 4, 1.3, (0, 0, 0, 60))
        for i in range(10):
            w = i // 2 + 1
            c.hline(8 - w, 8 + w - 1, 3 + i, "pine" if i % 2 == 0 else "pine_d")
        c.rect(7, 13, 2, 2, "wood_d")
        if season == "winter":
            for i in range(0, 10, 2):
                c.hline(8 - i // 2 - 1, 8 + i // 2, 3 + i, "snow")
    elif k == "palm":
        c.line(6, 14, 8, 6, "wood"); c.line(7, 14, 9, 6, "wood_l")
        for (dx, dy) in ((-5, 1), (5, 1), (-3, -3), (3, -3), (0, -4)):
            c.line(8, 6, 8 + dx, 6 + dy, "green"); c.line(8, 7, 8 + dx, 7 + dy, "green_d")
        c.px(8, 7, "wood_d")
    elif k == "jungle_tree":
        c.disc(8, 8, 7, "leaf_d"); c.disc(6, 6, 4, "green"); c.disc(11, 9, 3.5, "green_d"); c.disc(5, 5, 1.5, "green_l")
    elif k == "dead_tree":
        c.line(8, 14, 8, 5, "wood_d"); c.line(8, 9, 4, 5, "wood_d"); c.line(8, 7, 12, 3, "wood_d"); c.line(4, 5, 3, 3, "wood_d")
    elif k == "birch":
        c.rect(7, 7, 2, 7, "white"); c.px(7, 9, "black"); c.px(8, 12, "black")
        if leaf:
            c.disc(8, 6, 4.5, "leaf_l" if season != "autumn" else "yellow"); c.disc(7, 5, 2, shade("leaf_l", .2))
    elif k == "bush":
        c.disc(8, 10, 4.5, shade(leaf or "olive", -.3)); c.disc(7.5, 9.5, 3.5, leaf or "olive"); c.px(6, 8, "red")
    elif k == "cactus":
        c.rect(7, 4, 3, 10, "green"); c.rect(4, 7, 2, 4, "green"); c.rect(11, 6, 2, 4, "green"); c.hline(4, 6, 10, "green"); c.hline(10, 12, 9, "green"); c.vline(8, 4, 13, "green_l")
    elif k == "rock_small":
        c.disc(8, 10, 3.5, "stone_d"); c.disc(7.5, 9.5, 2.7, "stone"); c.px(6, 8, "stone_l")
    elif k == "rock_large":
        c.poly([(2, 14), (3, 8), (7, 4), (12, 5), (14, 10), (13, 14)], "stone_d"); c.poly([(3, 8), (7, 4), (12, 5), (9, 9), (4, 10)], "stone"); c.px(6, 6, "stone_l"); c.px(7, 5, "stone_l")
    elif k == "reeds":
        for x in (4, 6, 8, 10, 12):
            h = 5 + (x * 3) % 4
            c.vline(x, 14 - h, 14, "olive"); c.px(x, 14 - h, "wood")
    elif k == "flowers":
        for (x, y, col) in ((3, 6, "yellow"), (8, 4, "pink"), (12, 8, "white"), (5, 11, "red"), (10, 12, "purple"), (13, 3, "yellow")):
            c.px(x, y, col); c.px(x, y + 1, "green_d")
    elif k == "stump":
        c.disc(8, 10, 3, "wood"); c.disc(8, 9.5, 2.2, "straw"); c.px(8, 9, "wood_l")
    elif k == "snow_drift":
        c.ellipse(8, 11, 6, 2.5, "snow_d"); c.ellipse(7, 10, 5, 2, "snow")
    elif k == "tall_grass":
        for x in range(2, 14, 2):
            c.line(x, 14, x + 1, 9 + x % 3, leaf or "straw")
    elif k == "seaweed":
        for x in (5, 9, 12):
            c.line(x, 14, x - 1, 8, (60, 120, 70, 200)); c.line(x - 1, 8, x, 5, (60, 120, 70, 200))
    elif k == "iceberg":
        c.poly([(3, 12), (5, 6), (9, 4), (13, 8), (13, 12)], "snow"); c.poly([(9, 4), (13, 8), (13, 12), (10, 12)], "ice"); c.hline(2, 14, 12, "white")
    elif k == "waves":
        c.hline(3, 6, 6, (230, 240, 255, 150)); c.hline(9, 12, 10, (230, 240, 255, 150)); c.px(7, 7, (230, 240, 255, 100))
    elif k == "lava_bubble":
        c.disc(8, 9, 3, "#e0602a"); c.disc(7, 8, 1.5, "fire_l")
    if k not in ("waves", "flowers", "seaweed", "reeds", "tall_grass"):
        c.outline(.35)
    return c


DEPOSITS = {"stone": "stone_l", "clay": "clay", "iron": "#b06a4a", "copper": "orange", "tin": "lgrey", "coal": "black", "gold": "gold", "silver": "white",
            "gems": "neon2", "uranium": "green_l", "bauxite": "#c86a4a", "lithium": "#e0e8f0", "sulfur": "yellow", "salt": "offwhite"}


def deposit(k, depleted=False):
    c = C(16, 16, len(k))
    if k in DEPOSITS:
        speck = DEPOSITS[k]
        c.poly([(1, 14), (3, 8), (8, 4), (13, 8), (15, 14)], "stone_d")
        c.poly([(3, 8), (8, 4), (11, 6), (6, 9)], "stone")
        if k == "coal":
            c.poly([(4, 13), (6, 9), (10, 8), (12, 13)], "black")
        for (x, y) in ((6, 10), (9, 7), (11, 11), (4, 12), (8, 12), (10, 9)):
            c.px(x, y, speck); c.px(x + 1, y, shade(speck, .3) if k != "coal" else "dgrey")
    elif k == "oil":
        c.ellipse(8, 10, 6, 3.5, "black"); c.px(6, 9, "purple"); c.px(7, 9, "teal"); c.px(10, 11, "dgrey")
    elif k == "gas":
        c.disc(8, 11, 2.5, "dgrey"); c.disc(8, 6, 4, (120, 170, 230, 110)); c.disc(9, 4, 2.5, (140, 190, 240, 90))
    elif k == "offshore_oil":
        c.ellipse(8, 9, 6.5, 3.5, (20, 20, 30, 180)); c.px(6, 8, "purple"); c.px(9, 8, "teal")
    elif k == "fish":
        c.ellipse(7, 8, 4, 2, "metal"); c.poly([(10, 8), (14, 5), (14, 11)], "metal"); c.px(4, 7, "black"); c.hline(3, 13, 12, (230, 240, 255, 120))
    elif k == "fertile_soil":
        c.ellipse(8, 9, 6.5, 4.5, "dirt_d"); c.px(5, 8, "green_l"); c.px(9, 7, "green_l"); c.px(11, 10, "green_l"); c.px(7, 11, "green_l")
    elif k == "fresh_spring":
        c.disc(8, 9, 5, "stone"); c.disc(8, 9, 3.5, "water_l"); c.px(7, 8, "white")
    elif k == "timber":
        for (x, y) in ((4, 4), (11, 5), (7, 10)):
            c.disc(x, y, 2.8, "pine_d"); c.disc(x - .3, y - .3, 2, "pine")
    if depleted:
        for y in range(16):
            for x in range(16):
                if c.a[y, x, 3]:
                    r, g, b, a = c.a[y, x]
                    l = int(.3 * r + .59 * g + .11 * b)
                    c.a[y, x] = (l, l, l, a // 2 + 40)
        c.line(4, 5, 8, 9, (40, 40, 40, 200)); c.line(8, 9, 7, 13, (40, 40, 40, 200))
    else:
        c.outline(.35)
    return c


def build():
    for k in ("oak", "birch", "bush", "tall_grass"):
        for s in ("spring", "summer", "autumn", "winter"):
            add(f"deco_{k}_{s}", "terrain", "decorations", deco(k, s), state=s, tags=["season"])
    for s in ("summer", "winter"):
        add(f"deco_pine_{s}", "terrain", "decorations", deco("pine", s), state=s, tags=["season"])
    for k in ("palm", "jungle_tree", "dead_tree", "cactus", "rock_small", "rock_large", "reeds", "flowers", "stump", "snow_drift", "seaweed", "iceberg", "waves", "lava_bubble"):
        add(f"deco_{k}", "terrain", "decorations", deco(k))
    for k in list(DEPOSITS) + ["oil", "gas", "offshore_oil", "fish", "fertile_soil", "fresh_spring", "timber"]:
        add(f"deposit_{k}", "resources", "deposits", deposit(k), state="active")
        add(f"deposit_{k}_depleted", "resources", "deposits", deposit(k, True), state="depleted")
