import math
import random
from core import C, P, hx, shade, mix, add, REG, TEAM
from sets import mname

T0, T1, T2 = TEAM
TEAM_RGB = [tuple(int(t[i:i + 2], 16) for i in (1, 3, 5)) for t in TEAM]


# wrecks, made from the finished vehicle and ship sprites
def wreck(img, seed=3):
    c = img.copy()
    rng = random.Random(seed)
    for y in range(c.h):
        for x in range(c.w):
            r, g, b, a = (int(v) for v in c.a[y, x])
            if not a:
                continue
            lum = 90 if (r, g, b) in TEAM_RGB else int(0.3 * r + 0.59 * g + 0.11 * b)
            lum = int(lum * 0.45)
            c.a[y, x] = (lum + 16, lum + 12, lum + 10, a)
    ops = [(x, y) for y in range(c.h) for x in range(c.w) if c.a[y, x, 3] == 255]
    if not ops:
        return c
    for i in range(max(3, len(ops) // 14)):
        x, y = rng.choice(ops)
        c.px(x, y, "ink")
    for i in range(max(2, len(ops) // 40)):
        x, y = rng.choice(ops)
        c.a[y, x] = 0
    for i in range(max(1, len(ops) // 60)):
        x, y = rng.choice(ops)
        c.px(x, y, "dirt_d")
    return c


ANIMALS = {
    "herd_cattle": [("wood", 5), ("wood_d", 3)],
    "herd_sheep": [("white", 7)],
    "herd_goats": [("canvas_d", 5)],
    "herd_camels": [("sand_d", 3)],
    "herd_reindeer": [("mud", 4)],
    "herd_horses": [("wood_d", 4)],
    "herd_pigs": [("pink", 5)],
    "flock_chickens": [("offwhite", 8)],
    "herd_elephants": [("grey", 2)],
    "pack_wolves": [("dgrey", 4)],
    "shoal_fish": [("metal", 9)],
    "flock_birds": [("ink", 7)],
}


def animals(kind):
    c = C(16, 16, len(kind) * 5)
    rng = c.rng
    water = kind in ("shoal_fish",)
    if water:
        c.rect(0, 0, 16, 16, (58, 120, 176, 90))
    for (col, n) in ANIMALS[kind]:
        for i in range(n):
            x, y = rng.randrange(1, 13), rng.randrange(1, 14)
            if kind == "flock_birds":
                c.px(x, y, col); c.px(x + 1, y - 1, col); c.px(x + 2, y, col)
            elif kind == "shoal_fish":
                c.px(x, y, col); c.px(x + 1, y, col); c.px(x + 2, y - 1 if i % 2 else y + 1, col)
            elif kind == "flock_chickens":
                c.px(x, y, col); c.px(x, y + 1, col); c.px(x + 1, y, "red")
            elif kind == "herd_elephants":
                c.rect(x, y, 5, 3, col); c.px(x + 5, y, col); c.px(x + 5, y + 1, shade(col, -.2)); c.px(x - 1, y + 1, col)
            else:
                w = 3 if kind not in ("herd_horses", "herd_camels") else 4
                c.rect(x, y, w, 2, col)
                c.px(x + w, y, shade(col, -.25))
                if kind == "herd_camels":
                    c.px(x + 1, y - 1, col)
                if kind == "herd_cattle":
                    c.px(x + 1, y, "white")
    if not water:
        c.outline(.35)
    return c


WEAPON_FX = {
    "arrow_volley": ("wood_l", 3),
    "cannon_smoke": ("smoke", 3),
    "tracer_fire": ("fire_l", 3),
    "rocket_salvo": ("fire", 3),
    "laser_lance": ("neon2", 3),
    "plasma_burst": ("neon", 3),
    "shell_splash": ("water_l", 3),
}


def weapon_fx(kind, f):
    c = C(16, 16, 40 + f + len(kind))
    rng = random.Random(f * 7 + len(kind))
    if kind == "arrow_volley":
        for i in range(5):
            x = 1 + i * 3
            y = 2 + f * 4 + (i % 2)
            c.line(x, y, x + 2, y + 2, "wood_l")
            c.px(x + 2, y + 2, "metal_l")
    elif kind == "cannon_smoke":
        for i in range(18 + f * 14):
            a = rng.random() * 2.2 - 1.1
            d = 1 + rng.random() * (5 + f * 4)
            c.px(3 + math.cos(a) * d, 8 + math.sin(a) * d * .8, (205, 205, 210, 220 - f * 50))
        c.disc(4 + f * 2, 8, 2.4 + f, (225, 225, 230, 200 - f * 50))
        if f == 0:
            c.disc(3, 8, 2.4, "fire_l")
            c.disc(6, 8, 1.6, "fire")
            c.px(8, 8, "orange")
    elif kind == "tracer_fire":
        for i in range(4):
            x = (i * 5 + f * 3) % 16
            c.hline(x, min(15, x + 2), 7 + (i % 3) - 1, "fire_l")
            c.px(min(15, x + 3), 7 + (i % 3) - 1, (255, 230, 150, 140))
    elif kind == "rocket_salvo":
        for i in range(3):
            x = 2 + i * 5
            y = 12 - f * 4 - i
            c.rect(x, y, 3, 2, "olive_d")
            c.px(x + 3, y, "red")
            c.px(x - 1, y, "fire_l"); c.px(x - 2, y + 1, (255, 200, 120, 140))
    elif kind == "laser_lance":
        w = 3 - f
        for y in range(8 - w, 8 + w + 1):
            alpha = 220 - abs(y - 8) * 60 - f * 30
            for x in range(16):
                c.px(x, y, (79, 224, 216, max(40, alpha)))
        c.hline(0, 15, 8, "white" if f == 0 else "neon2")
    elif kind == "plasma_burst":
        c.disc(8, 8, 3 + f * 2, (224, 79, 208, 170 - f * 45))
        c.disc(8, 8, max(1, 2.5 - f), "white")
        for i in range(6):
            a = i * 1.05 + f
            c.px(8 + math.cos(a) * (4 + f * 2), 8 + math.sin(a) * (4 + f * 2), "neon")
    elif kind == "shell_splash":
        c.ellipse(8, 12, 4 + f * 2, 1.8 + f * 0.8, (170, 215, 245, 160 - f * 35))
        c.ring(8, 12, 4.5 + f * 2.5, (225, 245, 255, 170 - f * 45))
        col_h = 6 - f * 2
        if col_h > 0:
            c.rect(7, 12 - col_h, 2, col_h, (235, 248, 255, 210 - f * 50))
            c.px(6, 12 - col_h + 1, (205, 235, 250, 160))
            c.px(9, 12 - col_h + 2, (205, 235, 250, 160))
        for i in range(4 + f * 2):
            c.px(rng.randrange(2, 14), rng.randrange(2, 11), (240, 250, 255, 170 - f * 40))
    return c


IMPACTS = {"dirt": ("dirt_d", "dirt_l"), "stone": ("stone_d", "stone_l"), "water": ("water_d", "white"), "snow": ("snow_d", "white"), "sand": ("sand_d", "offwhite")}


def impact(surface, f):
    c = C(16, 16, 60 + f + len(surface))
    rng = random.Random(f * 3 + len(surface))
    dark, light = IMPACTS[surface]
    if f == 0:
        c.disc(8, 10, 3, dark)
        c.disc(8, 10, 1.8, light)
        for i in range(7):
            a = -0.4 - rng.random() * 2.3
            d = 3 + rng.random() * 3
            c.px(8 + math.cos(a) * d, 10 + math.sin(a) * d, light)
        if surface == "water":
            c.rect(7, 5, 2, 5, (235, 248, 255, 200))
    else:
        for i in range(10 + f * 8):
            a = -0.2 - rng.random() * 2.7
            d = (2 + f * 3) * (0.4 + rng.random())
            x, y = 8 + math.cos(a) * d, 10 + math.sin(a) * d * .8
            c.px(x, y, light if rng.random() < .35 else dark)
        c.ellipse(8, 11, 3 + f, 1.4 + f * .5, (*hx(dark)[:3], 150 - f * 40))
    if surface == "water":
        c.ring(8, 11, 3 + f * 2.5, (200, 230, 250, 160 - f * 45))
    return c


def coast_foam(m):
    c = C(16, 16, 80 + m)
    col = (245, 250, 255, 200)
    soft = (225, 240, 250, 110)
    for bit, side in ((1, "N"), (2, "E"), (4, "S"), (8, "W")):
        if not m & bit:
            continue
        for k in range(16):
            wob = (k * 7 % 3)
            if side == "N":
                c.px(k, wob, col); c.px(k, wob + 1, soft)
            elif side == "S":
                c.px(k, 15 - wob, col); c.px(k, 14 - wob, soft)
            elif side == "W":
                c.px(wob, k, col); c.px(wob + 1, k, soft)
            else:
                c.px(15 - wob, k, col); c.px(14 - wob, k, soft)
    return c


def river_edge(m):
    c = C(16, 16, 100 + m)
    for bit, side in ((1, "N"), (2, "E"), (4, "S"), (8, "W")):
        if not m & bit:
            continue
        for k in range(16):
            d = (k * 5 % 2)
            if side == "N":
                c.px(k, d, "dirt_d"); c.px(k, d + 1, "leaf_d")
            elif side == "S":
                c.px(k, 15 - d, "dirt_d"); c.px(k, 14 - d, "leaf_d")
            elif side == "W":
                c.px(d, k, "dirt_d"); c.px(d + 1, k, "leaf_d")
            else:
                c.px(15 - d, k, "dirt_d"); c.px(14 - d, k, "leaf_d")
    return c


ZONE_COL = {"res": (90, 200, 90), "com": (80, 140, 230), "ind": (230, 190, 60), "farm": (200, 150, 80)}
ZONE_ERA = {"early": 3, "middle": 4, "modern": 5}


def zone_tile(zone, era):
    col = ZONE_COL[zone]
    step = ZONE_ERA[era]
    c = C(16, 16, 120 + len(zone) + len(era))
    for y in range(16):
        for x in range(16):
            if (x + y) % step == 0:
                c.px(x, y, (*col, 110))
            elif era == "modern" and (x % 4 == 0 or y % 4 == 0):
                c.px(x, y, (*col, 45))
    c.frame(0, 0, 16, 16, (*col, 150))
    return c


def selection(size):
    n = size * 16
    c = C(n, n, 140 + size)
    col = "yellow"
    L = max(4, n // 4)
    for (x, y, dx, dy) in ((0, 0, 1, 1), (n - 1, 0, -1, 1), (0, n - 1, 1, -1), (n - 1, n - 1, -1, -1)):
        for i in range(L):
            c.px(x + dx * i, y, col)
            c.px(x, y + dy * i, col)
            c.px(x + dx * i, y + dy, (232, 200, 74, 110))
            c.px(x + dx, y + dy * i, (232, 200, 74, 110))
    return c


def order_arrow(dir8, kind="move"):
    c = C(16, 16, 160 + dir8 + len(kind))
    col = {"move": "white", "attack": "red", "patrol": "neon2", "retreat": "orange"}[kind]
    a = dir8 * math.pi / 4
    cx, cy = 8 + math.cos(a) * 3, 8 + math.sin(a) * 3
    c.line(8 - math.cos(a) * 6, 8 - math.sin(a) * 6, cx, cy, col)
    for w in (-0.7, 0.7):
        c.line(cx + math.cos(a) * 3, cy + math.sin(a) * 3, cx + math.cos(a + w) * -0 + math.cos(a + math.pi - w) * 3 + math.cos(a) * 3, cy + math.sin(a + math.pi - w) * 3 + math.sin(a) * 3, col)
    c.px(cx + math.cos(a) * 3, cy + math.sin(a) * 3, col)
    c.outline_outer()
    return c


UI2 = ["map_political", "map_terrain", "map_resources", "map_supply", "map_danger", "map_weather",
       "toast_info", "toast_warn", "toast_danger", "toast_good",
       "hint_tap", "hint_drag", "hint_pinch", "hint_hold",
       "rank_1", "rank_2", "rank_3", "score_plots", "score_pop"]


def icon2(kind):
    c = C(16, 16, 180 + len(kind))
    if kind == "map_political":
        c.rect(1, 2, 7, 6, "blue"); c.rect(8, 2, 7, 6, "red"); c.rect(1, 8, 6, 6, "green"); c.rect(7, 8, 8, 6, "gold")
        c.frame(1, 2, 14, 12, "ink")
    elif kind == "map_terrain":
        c.rect(1, 9, 14, 5, "lawn")
        c.poly([(1, 9), (6, 3), (11, 9)], "stone")
        c.poly([(8, 9), (12, 5), (15, 9)], "stone_l")
        c.rect(1, 12, 14, 2, "water")
    elif kind == "map_resources":
        c.poly([(1, 14), (4, 6), (8, 3), (12, 7), (15, 14)], "stone_d")
        c.poly([(4, 6), (8, 3), (11, 7), (7, 9)], "stone")
        for (x, y, col) in ((5, 10, "gold"), (8, 8, "gold"), (10, 11, "orange"), (7, 12, "teal")):
            c.px(x, y, col); c.px(x + 1, y, shade(col, .3))
    elif kind == "map_supply":
        c.hline(1, 14, 8, "yline")
        c.rect(1, 6, 4, 5, "olive"); c.rect(11, 6, 4, 5, "olive_d")
        c.px(7, 7, "white"); c.px(9, 9, "white")
    elif kind == "map_danger":
        c.poly([(8, 1), (15, 14), (1, 14)], "red")
        c.rect(7, 6, 2, 5, "white"); c.rect(7, 12, 2, 2, "white")
    elif kind == "map_weather":
        c.disc(6, 6, 3.4, "lit")
        c.ellipse(9, 10, 5, 3, "offwhite")
        c.ellipse(6, 11, 3.4, 2.4, "lgrey")
    elif kind.startswith("toast_"):
        col = {"toast_info": "blue", "toast_warn": "orange", "toast_danger": "red", "toast_good": "green"}[kind]
        c.rect(0, 3, 16, 10, "#14171d")
        c.rect(0, 3, 3, 10, col)
        c.frame(0, 3, 16, 10, shade(col, -.3))
        c.hline(5, 13, 6, "lgrey"); c.hline(5, 11, 9, "grey")
    elif kind == "hint_tap":
        c.ring(8, 9, 5, "white", 1.2)
        c.disc(8, 9, 2, "white")
        c.ring(8, 9, 7.5, (255, 255, 255, 90), 1)
    elif kind == "hint_drag":
        c.disc(4, 9, 2.4, "white")
        for x in range(7, 14, 2):
            c.px(x, 9, (255, 255, 255, 170))
        c.poly([(13, 6), (16, 9), (13, 12)], "white")
    elif kind == "hint_pinch":
        c.disc(4, 5, 2.2, "white"); c.disc(12, 12, 2.2, "white")
        c.line(6, 7, 10, 11, (255, 255, 255, 150))
        c.poly([(6, 5), (9, 5), (6, 8)], (255, 255, 255, 120))
    elif kind == "hint_hold":
        c.ring(8, 9, 5, "white", 1.2)
        c.disc(8, 9, 2, "white")
        c.ring(8, 9, 7, "yellow", 1)
        c.px(14, 3, "yellow"); c.px(13, 2, "yellow")
    elif kind.startswith("rank_"):
        col = {"rank_1": "gold", "rank_2": "offwhite", "rank_3": "copper" if "copper" in P else "orange"}[kind]
        c.disc(8, 8, 6.5, col)
        c.ring(8, 8, 6.5, shade(col, -.35))
        n = kind[-1]
        c.vline(8, 5, 11, "ink")
        if n != "1":
            c.hline(6, 10, 5, "ink"); c.hline(6, 10, 11, "ink")
        if n == "3":
            c.hline(6, 10, 8, "ink")
    elif kind == "score_plots":
        for (x, y) in ((2, 2), (9, 2), (2, 9), (9, 9)):
            c.rect(x, y, 5, 5, "green" if (x + y) % 3 else "blue")
            c.frame(x, y, 5, 5, "ink")
    elif kind == "score_pop":
        for (x, col) in ((3, "teal"), (8, "blue"), (12, "green")):
            c.disc(x, 5, 2, "skin")
            c.poly([(x - 2, 14), (x - 1, 8), (x + 2, 8), (x + 3, 14)], col)
    c.outline_outer()
    return c


def tech_frame(branch, state):
    c = C(24, 24, 200 + len(branch) + len(state))
    base = {"military": "red_d", "economy": "gold_d", "civic": "teal", "government": "purple"}[branch]
    rim = {"locked": "dgrey", "available": "yellow", "in_progress": "neon2", "researched": "green_l"}[state]
    body = base if state != "locked" else "dgrey"
    c.rect(1, 1, 22, 22, body)
    c.frame(1, 1, 22, 22, rim)
    c.frame(0, 0, 24, 24, "ink")
    c.frame(3, 3, 18, 18, shade(body, .18))
    if state == "locked":
        c.ring(12, 10, 3, "lgrey", 1.3); c.rect(8, 11, 8, 6, "lgrey")
    if state == "researched":
        c.line(8, 12, 11, 15, rim); c.line(11, 15, 16, 8, rim)
    if state == "in_progress":
        c.rect(4, 18, 9, 2, rim)
    return c


FLAG_PARTS = ["band_h", "band_v", "triband_h", "triband_v", "cross", "saltire", "nordic_cross", "canton", "border", "quarters",
              "diagonal", "chevron", "pale", "fess", "sun_rays", "star", "star_ring", "crescent", "mountain", "wave",
              "anchor", "sword", "shield", "leaf", "gear", "tower", "flame", "eye", "crown", "hammer", "wheat", "bird"]


def flag_part(kind):
    c = C(32, 20, 220 + len(kind))
    ink = "white"
    if kind == "band_h":
        c.rect(0, 7, 32, 6, ink)
    elif kind == "band_v":
        c.rect(13, 0, 6, 20, ink)
    elif kind == "triband_h":
        c.rect(0, 0, 32, 6, ink); c.rect(0, 14, 32, 6, ink)
    elif kind == "triband_v":
        c.rect(0, 0, 10, 20, ink); c.rect(22, 0, 10, 20, ink)
    elif kind == "cross":
        c.rect(0, 8, 32, 5, ink); c.rect(13, 0, 5, 20, ink)
    elif kind == "saltire":
        for i in range(32):
            y = int(i * 20 / 32)
            for d in (-1, 0, 1, 2):
                c.px(i, y + d, ink); c.px(i, 19 - y + d, ink)
    elif kind == "nordic_cross":
        c.rect(0, 8, 32, 5, ink); c.rect(9, 0, 5, 20, ink)
    elif kind == "canton":
        c.rect(0, 0, 13, 10, ink)
    elif kind == "border":
        c.frame(0, 0, 32, 20, ink); c.frame(1, 1, 30, 18, ink)
    elif kind == "quarters":
        c.rect(0, 0, 16, 10, ink); c.rect(16, 10, 16, 10, ink)
    elif kind == "diagonal":
        for i in range(32):
            y = int(i * 20 / 32)
            for d in range(-2, 3):
                c.px(i, y + d, ink)
    elif kind == "chevron":
        for i in range(12):
            c.line(0, i, 12, 10, ink)
    elif kind == "pale":
        c.rect(0, 0, 8, 20, ink); c.rect(24, 0, 8, 20, ink)
    elif kind == "fess":
        c.rect(0, 0, 32, 5, ink); c.rect(0, 15, 32, 5, ink)
    elif kind == "sun_rays":
        c.disc(16, 10, 5, ink)
        for i in range(12):
            a = i * 0.52
            c.line(16 + math.cos(a) * 6, 10 + math.sin(a) * 6, 16 + math.cos(a) * 9, 10 + math.sin(a) * 9, ink)
    elif kind == "star":
        for i in range(5):
            a = -math.pi / 2 + i * 1.257
            c.line(16, 10, 16 + math.cos(a) * 7, 10 + math.sin(a) * 7, ink)
            c.line(16, 10, 16 + math.cos(a) * 6, 10 + math.sin(a) * 6, ink)
        c.disc(16, 10, 2.5, ink)
    elif kind == "star_ring":
        for i in range(8):
            a = i * 0.785
            c.px(16 + math.cos(a) * 7, 10 + math.sin(a) * 7, ink)
            c.px(16 + math.cos(a) * 7 + 1, 10 + math.sin(a) * 7, ink)
    elif kind == "crescent":
        c.disc(16, 10, 6, ink)
        for y in range(20):
            for x in range(32):
                if (x - 19) ** 2 + (y - 10) ** 2 < 25:
                    c.a[y, x] = 0
    elif kind == "mountain":
        c.poly([(4, 16), (12, 4), (20, 16)], ink)
        c.poly([(16, 16), (23, 7), (29, 16)], ink)
    elif kind == "wave":
        for x in range(32):
            c.px(x, 10 + int(math.sin(x / 3) * 3), ink)
            c.px(x, 11 + int(math.sin(x / 3) * 3), ink)
    elif kind == "anchor":
        c.rect(15, 4, 2, 12, ink); c.rect(12, 7, 8, 2, ink)
        for x in range(10, 22):
            c.px(x, 14 + (2 if 13 < x < 19 else 0), ink)
        c.ring(16, 4, 2, ink)
    elif kind == "sword":
        c.rect(15, 3, 2, 12, ink); c.rect(12, 12, 8, 2, ink); c.rect(14, 15, 4, 2, ink)
    elif kind == "shield":
        c.poly([(16, 3), (24, 6), (23, 13), (16, 17), (9, 13), (8, 6)], ink)
    elif kind == "leaf":
        c.ellipse(16, 10, 5, 7, ink)
        c.rect(15, 10, 2, 7, ink)
    elif kind == "gear":
        for i in range(8):
            a = i * 0.785
            c.rect(round(16 + math.cos(a) * 7) - 1, round(10 + math.sin(a) * 7) - 1, 3, 3, ink)
        c.disc(16, 10, 6, ink)
        for y in range(20):
            for x in range(32):
                if (x - 16) ** 2 + (y - 10) ** 2 < 6.5:
                    c.a[y, x] = 0
    elif kind == "tower":
        c.rect(12, 6, 8, 11, ink)
        for x in range(12, 20, 2):
            c.rect(x, 4, 1, 2, ink)
    elif kind == "flame":
        c.poly([(16, 2), (20, 9), (18, 12), (20, 16), (12, 16), (14, 12), (12, 9)], ink)
    elif kind == "eye":
        c.ellipse(16, 10, 8, 4, ink)
        c.ellipse(16, 10, 4, 3, (0, 0, 0, 0))
    elif kind == "crown":
        c.rect(9, 13, 14, 3, ink)
        c.poly([(9, 13), (10, 5), (13, 10), (16, 3), (19, 10), (22, 5), (23, 13)], ink)
        c.px(10, 4, ink); c.px(16, 2, ink); c.px(22, 4, ink)
    elif kind == "hammer":
        c.rect(15, 6, 2, 11, ink); c.rect(10, 4, 12, 4, ink)
    elif kind == "wheat":
        for base in (12, 16, 20):
            c.rect(base, 9, 2, 8, ink)
            for y in range(3, 11, 2):
                c.rect(base - 2, y + 1, 2, 2, ink)
                c.rect(base + 2, y, 2, 2, ink)
    elif kind == "bird":
        c.ellipse(16, 11, 3, 2.2, ink)
        c.poly([(15, 9), (6, 4), (13, 11)], ink)
        c.poly([(17, 9), (26, 4), (19, 11)], ink)
        c.px(19, 10, ink); c.px(20, 10, ink)
        c.poly([(13, 12), (16, 16), (19, 12)], ink)
    return c


def build():
    vehicles = [r for r in list(REG) if r["cat"] in ("vehicles", "ships") and r["state"] is None]
    for r in vehicles:
        add(f"{r['id']}_wreck", r["cat"], r["group"], wreck(r["img"]), era=r["era"], fp=r["fp"], state="wreck", family=r["id"],
            note="burnt out, blocks the plot until cleared")
    for k in ANIMALS:
        add(f"deco_{k}", "terrain", "animals", animals(k), note="decoration for pastures, plains and coasts")
    for k, (_, n) in WEAPON_FX.items():
        for f in range(n):
            add(f"fx_{k}_{f}", "effects", "weapons", weapon_fx(k, f), frame=f)
    for s in IMPACTS:
        for f in range(3):
            add(f"impact_{s}_{f}", "effects", "impacts", impact(s, f), frame=f)
    for m in range(1, 16):
        add(f"coast_foam_{mname(m)}", "terrain", "shoreline", coast_foam(m), tags=["autotile", "edge", f"mask{m}"],
            note="drawn on the water plot, mask marks the sides that touch land")
        add(f"river_edge_{mname(m)}", "terrain", "shoreline", river_edge(m), tags=["autotile", "edge", f"mask{m}"],
            note="drawn on the land plot beside a river")
    for z in ZONE_COL:
        for e in ZONE_ERA:
            add(f"ov_zone_{z}_{e}", "overlays", "zones", zone_tile(z, e), tags=["tileable", "overlay"])
    for size in (1, 2, 3):
        add(f"ov_select_{size}x{size}", "overlays", "orders", selection(size), fp=(size, size))
    for kind in ("move", "attack", "patrol", "retreat"):
        for d in range(8):
            add(f"ov_order_{kind}_{d}", "overlays", "orders", order_arrow(d, kind), tags=[f"dir{d * 45}"])
    for k in UI2:
        grp = "map_modes" if k.startswith("map_") else "notifications" if k.startswith("toast_") else "hints" if k.startswith("hint_") else "scoreboard"
        add(f"ui_{k}", "ui", grp, icon2(k))
    for branch in ("military", "economy", "civic", "government"):
        for state in ("locked", "available", "in_progress", "researched"):
            add(f"tech_{branch}_{state}", "ui", "tech_tree", tech_frame(branch, state), fp=(1.5, 1.5))
    for k in FLAG_PARTS:
        add(f"flagpart_{k}", "ui", "flag_parts", flag_part(k), fp=(2, 1.25),
            note="stamp for the flag editor; drawn in white, recoloured by the player")
