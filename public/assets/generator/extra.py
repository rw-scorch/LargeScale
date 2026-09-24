import math
import random
from core import C, P, hx, shade, mix, add, REG, TEAM
from sets import mname

TEAM_RGB = [tuple(int(t[i:i + 2], 16) for i in (1, 3, 5)) for t in TEAM]
ABANDON_SKIP = {"hand_cart", "horse_wagon", "chariot", "supply_wagon", "catapult", "trebuchet", "cannon", "horse_artillery"}


def abandoned(img):
    c = img.copy()
    for y in range(c.h):
        for x in range(c.w):
            r, g, b, a = (int(v) for v in c.a[y, x])
            if not a:
                continue
            if (r, g, b) in TEAM_RGB:
                lum = 120
            else:
                lum = int(0.3 * r + 0.59 * g + 0.11 * b)
            lum = int(lum * 0.72)
            c.a[y, x] = (lum + 12, lum + 10, lum + 6, a)
    rng = random.Random(7)
    op = [(x, y) for y in range(c.h) for x in range(c.w) if c.a[y, x, 3] == 255]
    if op:
        for i in range(max(2, len(op) // 40)):
            x, y = rng.choice(op)
            c.px(x, y, "ink")
        x, y = rng.choice(op)
        c.px(x, y, "dirt_d")
    return c


def deco(k):
    c = C(16, 16, 11 + len(k))
    r = c.rng
    if k == "demolition_charge":
        c.rect(5, 7, 6, 5, "canvas_d")
        c.rect(6, 8, 4, 3, "khaki")
        c.rect(7, 5, 2, 2, "red")
        for i, (x, y) in enumerate(((11, 7), (13, 6), (15, 5))):
            c.px(x, y, "yellow")
        c.line(11, 8, 15, 10, "red")
        c.px(8, 12, "black")
    elif k == "breach":
        c.rect(0, 0, 16, 16, "stone_d")
        c.poly([(5, 0), (11, 0), (13, 16), (3, 16)], "dirt_l")
        for i in range(26):
            x, y = r.randrange(16), r.randrange(16)
            c.px(x, y, r.choice(["stone", "stone_l", "dirt_d"]))
        c.line(4, 0, 2, 15, "stone_l")
        c.line(12, 0, 14, 15, "stone_l")
    elif k == "blasted_rock":
        for i in range(60):
            x, y = r.randrange(16), r.randrange(16)
            c.px(x, y, r.choice(["stone", "stone_d", "stone_l", "dirt_d"]))
        for (x, y, s) in ((4, 5, 2.4), (11, 9, 2), (7, 12, 1.8)):
            c.disc(x, y, s, "stone_d")
            c.disc(x - .3, y - .3, s - .8, "stone")
        c.px(3, 3, "black"); c.px(12, 13, "black")
    elif k == "bomb_craters":
        for (x, y, s) in ((4, 4, 3), (11, 6, 2.4), (6, 11, 2.6), (13, 13, 2)):
            c.ellipse(x, y, s, s * .85, (70, 55, 40, 210))
            c.ellipse(x, y, s - 1, s * .6, (40, 32, 24, 230))
            c.ring(x, y, s, (120, 100, 75, 160))
    elif k == "tunnel_dig":
        c.disc(11, 10, 5, "dirt_d")
        c.disc(11, 10, 3.4, "dirt")
        c.rect(3, 6, 6, 7, "stone_d")
        c.rect(4, 8, 4, 5, "black")
        c.rect(3, 6, 6, 2, "wood")
        c.rect(9, 12, 6, 2, "wood_d")
        for i in range(10):
            c.px(r.randrange(8, 16), r.randrange(5, 16), "dirt_l")
    elif k == "rubble_pass":
        c.rect(0, 0, 16, 16, "stone_d")
        for i in range(70):
            x, y = r.randrange(16), r.randrange(16)
            c.px(x, y, r.choice(["stone", "stone_l", "stone_d", "dirt"]))
        c.line(1, 14, 14, 2, "dirt_l")
    c.outline(.3)
    return c


def border_tile(kind, m):
    c = C(16, 16, 20 + m + len(kind))
    col = {"defence_border": (110, 220, 200, 220), "blast_ring": (232, 90, 70, 220), "shield_border": (130, 190, 255, 220)}[kind]
    soft = (col[0], col[1], col[2], 70)
    if m & 1:
        for x in range(16):
            c.px(x, 0, col if (x // 2) % 2 == 0 else soft)
            c.px(x, 1, soft)
    if m & 4:
        for x in range(16):
            c.px(x, 15, col if (x // 2) % 2 == 0 else soft)
            c.px(x, 14, soft)
    if m & 8:
        for y in range(16):
            c.px(0, y, col if (y // 2) % 2 == 0 else soft)
            c.px(1, y, soft)
    if m & 2:
        for y in range(16):
            c.px(15, y, col if (y // 2) % 2 == 0 else soft)
            c.px(14, y, soft)
    return c


def fill_tile(kind):
    c = C(16, 16, 40 + len(kind))
    col = {"blast_fill": (232, 90, 70, 55), "coverage_2": (110, 220, 200, 90), "coverage_3": (140, 240, 220, 130)}[kind]
    step = {"blast_fill": 3, "coverage_2": 3, "coverage_3": 2}[kind]
    for y in range(16):
        for x in range(16):
            if (x + y) % step == 0:
                c.px(x, y, col)
    return c


def marker(kind):
    c = C(16, 16, 60 + len(kind))
    if kind == "parked_vehicle":
        c.ring(8, 9, 6, (200, 200, 205, 170), 1.2)
        c.rect(5, 7, 6, 4, (170, 170, 175, 160))
        c.px(8, 4, "yellow"); c.px(7, 5, "yellow"); c.px(9, 5, "yellow")
    elif kind == "charge_placed":
        c.rect(6, 7, 5, 4, "canvas_d")
        c.px(11, 6, "red")
        c.ring(8, 9, 6.5, (232, 90, 70, 150), 1)
    elif kind == "terrain_target":
        c.ring(8, 8, 6.5, "yellow", 1.4)
        c.line(8, 1, 8, 5, "yellow"); c.line(8, 11, 8, 15, "yellow")
        c.line(1, 8, 5, 8, "yellow"); c.line(11, 8, 15, 8, "yellow")
        c.px(8, 8, "red")
    return c


def effect(kind, f):
    if kind == "chaff_flare":
        c = C(16, 16, 70 + f)
        rng = random.Random(f)
        for i in range(4):
            x = 10 - i * 2 - f
            y = 8 + (i % 2 * 2 - 1) * (1 + f)
            c.px(x, y, "white")
            c.px(x - 1, y, "fire_l")
            c.px(x - 2, y, (255, 220, 140, 150 - f * 40))
        c.disc(12, 8, 1.4 + f * .4, (255, 240, 200, 200 - f * 50))
        return c
    if kind == "shield_down":
        c = C(32, 32, 80 + f)
        r = 13 - f * 3
        for i in range(160):
            a = i / 160 * 6.283
            if (i + f * 20) % 9 < 5:
                c.px(16 + math.cos(a) * r, 16 + math.sin(a) * r, (120, 200, 255, 180 - f * 55))
        for i in range(8):
            a = i * 0.785
            c.px(16 + math.cos(a) * (r + 3 + f), 16 + math.sin(a) * (r + 3 + f), (200, 235, 255, 150 - f * 45))
        return c
    c = C(16, 16, 90 + f)
    rng = random.Random(f + 3)
    if f == 0:
        c.disc(8, 9, 4.2, "fire")
        c.disc(8, 9, 2.8, "fire_l")
        c.disc(8, 9, 1.4, "white")
        for i in range(8):
            a = i * 0.785
            c.line(8 + math.cos(a) * 4, 9 + math.sin(a) * 4, 8 + math.cos(a) * 7, 9 + math.sin(a) * 7, "fire_l")
    else:
        for i in range(14 + f * 8):
            a = rng.random() * 6.283
            d = rng.random() * (4 + f * 3)
            c.px(8 + math.cos(a) * d, 9 + math.sin(a) * d * .8, rng.choice(["stone", "stone_d", "dirt_d", "smoke"]))
        c.disc(8, 9, max(1, 3 - f), "fire" if f == 1 else (150, 150, 156, 160))
    return c


def icon(kind):
    c = C(16, 16, 100 + len(kind))
    if kind == "ui_defence_borders":
        c.ring(8, 12, 9, "neon2", 1.4)
        for x in range(0, 16, 3):
            c.px(x, 3, "neon2")
        c.ellipse(8, 12, 4, 3, "offwhite")
        c.rect(7, 9, 2, 3, "metal_l")
    elif kind == "ui_overlays":
        c.poly([(8, 2), (15, 6), (8, 10), (1, 6)], "lgrey")
        c.poly([(8, 6), (15, 10), (8, 14), (1, 10)], "blue")
        c.poly([(8, 8), (13, 11), (8, 14), (3, 11)], "neon2")
    elif kind == "ui_ammo":
        c.rect(4, 3, 8, 11, "olive_d")
        c.rect(5, 4, 6, 9, "olive")
        for y in (5, 8, 11):
            c.rect(6, y, 4, 2, "gold_d")
            c.px(6, y, "gold")
    elif kind == "ui_reload":
        c.ring(8, 8, 6, "white", 1.6)
        c.a[0:8, 8:16] = 0
        c.poly([(15, 6), (10, 3), (10, 9)], "white")
        c.rect(6, 6, 4, 5, "gold_d")
    elif kind == "ui_countermeasures":
        c.poly([(2, 8), (9, 5), (9, 11)], "metal_l")
        for i, (x, y) in enumerate(((10, 4), (12, 7), (11, 11))):
            c.px(x, y, "white"); c.px(x + 1, y, "fire_l"); c.px(x + 2, y, (255, 220, 140, 140))
    elif kind == "ui_stealth":
        c.poly([(1, 8), (12, 4), (15, 8), (12, 12)], "dgrey")
        c.poly([(3, 8), (11, 6), (13, 8), (11, 10)], "grey")
        for y in (2, 14):
            for x in range(1, 16, 3):
                c.px(x, y, (200, 200, 210, 150))
    elif kind == "ui_demolish_terrain":
        c.poly([(1, 14), (5, 6), (10, 5), (14, 14)], "stone")
        c.poly([(4, 14), (6, 8), (9, 8), (11, 14)], "stone_d")
        c.rect(6, 9, 4, 3, "canvas_d")
        c.px(10, 8, "red")
        c.px(11, 7, "fire_l"); c.px(12, 6, "yellow")
    elif kind == "ui_blast_radius":
        for i in range(48):
            a = i / 48 * 6.283
            if i % 4 < 2:
                c.px(8 + math.cos(a) * 7, 8 + math.sin(a) * 7, "red")
        c.disc(8, 8, 3, (232, 90, 70, 150))
        c.disc(8, 8, 1.4, "fire_l")
    c.outline_outer()
    return c


def bar(kind):
    c = C(32, 6, 6)
    col = {"ammo": "gold", "shield": "#7fb8ff", "charge": "neon2"}[kind]
    c.rect(0, 0, 30, 4, col)
    c.hline(0, 29, 0, shade(col, .3))
    c.hline(0, 29, 3, shade(col, -.25))
    return c


def build():
    land = [r for r in list(REG) if r["cat"] == "vehicles" and r["group"] in ("military", "civilian", "air_defence") and r["id"] not in ABANDON_SKIP]
    for r in land:
        add(f"{r['id']}_abandoned", "vehicles", r["group"], abandoned(r["img"]), era=r["era"], state="abandoned", family=r["id"],
            note="crew has dismounted; can be re-crewed or captured")
    for k in ("demolition_charge", "breach", "blasted_rock", "bomb_craters", "tunnel_dig", "rubble_pass"):
        add(f"feat_{k}", "features", "demolition", deco(k), note="made by engineers with explosives")
    for kind in ("defence_border", "blast_ring", "shield_border"):
        for m in range(1, 16):
            add(f"ov_{kind}_{mname(m)}", "overlays", "coverage", border_tile(kind, m), tags=["autotile", "overlay", f"mask{m}"],
                note="mask marks the sides that face outside the area")
    for k in ("blast_fill", "coverage_2", "coverage_3"):
        add(f"ov_{k}", "overlays", "coverage", fill_tile(k), tags=["tileable", "overlay"])
    for k in ("parked_vehicle", "charge_placed", "terrain_target"):
        add(f"ov_{k}", "overlays", "map_overlays", marker(k))
    for f in range(3):
        add(f"chaff_flare_{f}", "effects", "air_defence", effect("chaff_flare", f), frame=f)
        add(f"shield_down_{f}", "effects", "air_defence", effect("shield_down", f), fp=(2, 2), frame=f)
        add(f"charge_blast_{f}", "effects", "explosions", effect("charge_blast", f), frame=f)
    for k in ("ui_defence_borders", "ui_overlays", "ui_ammo", "ui_reload", "ui_countermeasures", "ui_stealth", "ui_demolish_terrain", "ui_blast_radius"):
        add(k, "ui", "general", icon(k))
    for k in ("ammo", "shield", "charge"):
        add(f"bar_{k}", "ui", "bars", bar(k), fp=(2, .375), note="fill draws inside bar_frame")
