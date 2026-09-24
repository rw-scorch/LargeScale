import math
import random
from core import C, hx, shade, mix, add, TEAM


def puff(c, cx, cy, r, col, rng, lumps=5):
    c.disc(cx, cy, r, col)
    for i in range(lumps):
        a = rng.random() * 6.28
        c.disc(cx + math.cos(a) * r * .7, cy + math.sin(a) * r * .7, r * .55, col)


def explosion(size, f, seed=1):
    c = C(size, size, seed)
    rng = random.Random(seed + f)
    m = size / 2
    s = size / 16
    if f == 0:
        c.disc(m, m, 2.5 * s, "fire_l"); c.disc(m, m, 1.3 * s, "white")
        for i in range(6):
            a = i * 1.047
            c.line(m, m, m + math.cos(a) * 5 * s, m + math.sin(a) * 5 * s, "fire_l")
    elif f == 1:
        puff(c, m, m, 5 * s, "fire", rng); puff(c, m, m, 3.5 * s, "fire_l", rng); c.disc(m, m, 1.5 * s, "white")
    elif f == 2:
        puff(c, m, m - s, 6 * s, "smoke", rng); puff(c, m, m, 4.5 * s, "fire", rng); puff(c, m, m, 2.5 * s, "fire_l", rng)
    else:
        puff(c, m, m - 2 * s, 6.5 * s, (150, 150, 157, 190), rng)
        puff(c, m - s, m - 2.5 * s, 4.2 * s, (176, 176, 183, 170), rng)
        puff(c, m + 1.5 * s, m - 1.2 * s, 3.2 * s, (128, 128, 135, 180), rng)
        for i in range(int(6 * s)):
            a = rng.random() * 6.283
            d = rng.random() * 6 * s
            c.px(m + math.cos(a) * d, m + math.sin(a) * d, "fire" if rng.random() < .5 else "orange")
    if f < 3:
        c.outline(.3)
    return c


def nuke(f):
    c = C(48, 48, 7)
    rng = random.Random(f)
    if f == 0:
        c.disc(24, 38, 20, (255, 245, 205, 150))
        c.disc(24, 38, 13, (255, 250, 225, 220))
        c.disc(24, 38, 8, "white")
        for i in range(16):
            a = i * 0.39
            c.line(24 + math.cos(a) * 12, 38 + math.sin(a) * 12, 24 + math.cos(a) * 22, 38 + math.sin(a) * 22, (255, 245, 210, 170))
    elif f == 1:
        puff(c, 24, 36, 10, "fire", rng, 7); puff(c, 24, 36, 7, "fire_l", rng); c.disc(24, 36, 3, "white")
    elif f == 2:
        c.rect(21, 22, 6, 18, "fire"); c.rect(22, 22, 4, 18, "fire_l")
        puff(c, 24, 18, 10, "fire", rng, 7); puff(c, 24, 18, 6, "fire_l", rng)
        c.ellipse(24, 42, 16, 4, "smoke")
    elif f == 3:
        c.rect(21, 20, 6, 22, "smoke"); c.rect(22, 20, 3, 22, "orange")
        puff(c, 24, 14, 13, "smoke", rng, 8); puff(c, 24, 16, 8, "orange", rng); c.disc(24, 17, 4, "fire_l")
        c.ellipse(24, 43, 20, 4, "smoke")
    else:
        c.rect(21, 20, 6, 22, (138, 138, 144, 170))
        puff(c, 24, 13, 14, (138, 138, 144, 190), rng, 8); puff(c, 24, 15, 8, (160, 120, 90, 190), rng)
        c.ellipse(24, 43, 22, 4, (138, 138, 144, 150))
    return c


def smoke(f):
    c = C(16, 16, 3)
    rng = random.Random(f + 3)
    for i in range(4):
        y = 14 - i * 3.6 - f * 1.4
        if y < -2:
            continue
        r = 1.6 + i * 0.9 + f * 0.3
        a = max(50, 215 - i * 40 - f * 30)
        shade_col = (150 - i * 8, 150 - i * 8, 158 - i * 6, a)
        puff(c, 8 + math.sin(i * 1.3 + f) * 2, y, r, shade_col, rng, 4)
    for i in range(4):
        x, y = rng.randrange(3, 13), rng.randrange(0, 6)
        c.px(x, y, (190, 190, 198, 90))
    return c


def fire(f):
    c = C(16, 16, 4)
    rng = random.Random(f * 5 + 1)
    for (x, base_h) in ((3, 8), (7, 11), (11, 9), (5, 6), (9, 7)):
        h = base_h + ((f + x) % 3) - 1
        lean = 0
        for i in range(h):
            t = i / max(1, h - 1)
            w = 2 if t < .35 else (1 if t < .7 else 0)
            lean += rng.choice([-1, 0, 0, 1]) if t > .4 else 0
            col = "red_d" if t < .12 else "fire" if t < .45 else "fire_l" if t < .8 else "yellow"
            c.hline(x - w + lean, x + w + lean, 14 - i, col)
        c.px(x + lean, 14 - h, "yellow")
    for x in range(2, 14):
        c.px(x, 15, "red_d")
        if rng.random() < .4:
            c.px(x, 14, "fire")
    for i in range(3):
        c.px(rng.randrange(3, 13), rng.randrange(1, 5), (255, 200, 90, 170))
    return c


def muzzle(f):
    c = C(16, 16, 5)
    if f == 0:
        c.poly([(2, 8), (8, 5), (14, 8), (8, 11)], "fire_l"); c.poly([(4, 8), (8, 6.5), (11, 8), (8, 9.5)], "white")
    else:
        c.disc(6, 8, 2.5, (200, 200, 200, 150)); c.disc(10, 7, 2, (200, 200, 200, 110))
    return c


def projectile(k):
    c = C(16, 16, 6)
    if k == "arrow":
        c.hline(3, 12, 8, "wood_l"); c.px(13, 8, "metal_l"); c.px(12, 7, "metal"); c.px(12, 9, "metal"); c.px(3, 7, "white"); c.px(3, 9, "white")
    elif k == "spear_thrown":
        c.hline(1, 12, 8, "wood"); c.poly([(12, 7), (15, 8), (12, 9)], "metal_l")
    elif k == "stone":
        c.disc(8, 8, 2.8, "stone_d")
        c.disc(7.6, 7.6, 2, "stone")
        c.px(7, 7, "stone_l")
    elif k == "cannonball":
        c.disc(8, 8, 2.6, "black")
        c.disc(7.7, 7.7, 1.8, "dgrey")
        c.px(7, 7, "grey")
        c.px(11, 9, (120, 120, 126, 120)); c.px(12, 9, (120, 120, 126, 70))
    elif k == "bullet_tracer":
        c.hline(4, 12, 8, (255, 230, 120, 140)); c.hline(10, 13, 8, "fire_l")
    elif k == "shell":
        c.rect(4, 7, 7, 3, "gold_d")
        c.hline(4, 10, 7, "gold")
        c.poly([(11, 7), (14, 8.5), (11, 10)], "dgrey")
        c.px(3, 8, (255, 220, 140, 130)); c.px(2, 8, (255, 220, 140, 80))
    elif k == "rocket":
        c.rect(5, 7, 6, 2, "olive"); c.px(11, 7, "red"); c.px(11, 8, "red"); c.px(3, 7, "fire_l"); c.px(4, 8, "fire")
    elif k == "missile":
        c.rect(4, 7, 8, 2, "white"); c.px(12, 7, "red"); c.px(12, 8, "red"); c.px(5, 6, "lgrey"); c.px(5, 9, "lgrey"); c.px(2, 7, "fire_l"); c.px(3, 8, "fire")
    elif k == "bomb":
        c.ellipse(9, 8, 4, 2.4, "dgrey")
        c.ellipse(9, 7.4, 3, 1.4, "metal")
        c.poly([(5, 5), (2, 8), (5, 11)], "dgrey")
        c.px(4, 6, "metal_l"); c.px(12, 8, "black")
    elif k == "plasma_bolt":
        c.hline(3, 12, 8, (79, 224, 216, 120)); c.hline(8, 12, 8, "neon2"); c.px(12, 8, "white")
    elif k == "torpedo":
        c.rect(4, 7, 8, 3, "dgrey")
        c.hline(4, 11, 7, "metal_l")
        c.poly([(12, 7), (14, 8.5), (12, 10)], "metal")
        c.px(3, 7, "lgrey"); c.px(3, 9, "lgrey")
        for x in range(0, 4):
            c.px(x, 8, (230, 240, 250, 150 - x * 30))
    elif k == "icbm":
        c.rect(3, 6, 9, 3, "white"); c.poly([(12, 6), (14, 7.5), (12, 9)], "red"); c.px(4, 5, "lgrey"); c.px(4, 9, "lgrey"); c.hline(0, 2, 7, "fire_l")
    if k not in ("bullet_tracer", "plasma_bolt", "torpedo"):
        c.outline(.35)
    return c


def crater(size):
    c = C(size, size, 8)
    m = size / 2
    c.ellipse(m, m, m - 1, m - 2, (60, 45, 30, 200))
    c.ellipse(m, m, m - 3, m - 4, (40, 30, 20, 230))
    c.ellipse(m - 1, m - 1, m / 3, m / 3.5, (25, 20, 15, 240))
    for i in range(size):
        a = c.rng.random() * 6.28
        r = m - 1 + c.rng.random() * 2
        c.px(m + math.cos(a) * r, m + math.sin(a) * r * .9, (90, 70, 50, 160))
    return c


def scorch():
    c = C(16, 16, 9)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, (y - 8) * 1.2) / 7.5
            if d > 1:
                continue
            a = int(170 * (1 - d ** 1.6)) + c.rng.randint(-25, 25)
            if a > 10:
                c.px(x, y, (26, 20, 15, min(200, a)))
    for i in range(14):
        c.px(c.rng.gauss(8, 3), c.rng.gauss(8, 2.4), (60, 50, 40, 150))
    return c


def dust(f):
    c = C(16, 16, 10)
    rng = random.Random(f + 2)
    for i in range(4 + f * 2):
        x = 2 + i * 2.4 + rng.random() * 2
        y = 13 - f * 1.5 - rng.random() * (2 + f * 2)
        puff(c, x, y, 1.2 + f * .6, (198, 178, 140, 190 - f * 45), rng, 3)
    for i in range(8):
        c.px(rng.randrange(1, 15), rng.randrange(8 - f * 2, 15), (170, 150, 115, 150 - f * 30))
    c.hline(1, 14, 15, (150, 132, 100, 120 - f * 30))
    return c


def splash(f):
    c = C(16, 16, 11)
    rng = random.Random(f + 9)
    if f == 0:
        c.ellipse(8, 11, 3.5, 1.6, (210, 235, 250, 200))
        c.rect(7, 4, 2, 7, "white")
        c.rect(6, 6, 1, 4, "water_l"); c.rect(9, 6, 1, 4, "water_l")
        c.px(7, 3, "white"); c.px(9, 4, (230, 245, 255, 180))
    elif f == 1:
        c.ellipse(8, 11, 5.5, 2.4, (200, 230, 248, 170))
        c.ring(8, 11, 5.5, "white")
        for (x, y) in ((4, 5), (11, 4), (7, 2), (13, 7), (2, 7)):
            c.px(x, y, "white"); c.px(x, y + 1, (200, 230, 248, 150))
        c.rect(7, 5, 2, 5, (225, 242, 255, 190))
    else:
        c.ring(8, 11, 7, (190, 225, 245, 150))
        c.ring(8, 11, 4.5, (190, 225, 245, 90))
        for i in range(6):
            c.px(rng.randrange(1, 15), rng.randrange(2, 8), (210, 235, 250, 110))
    return c


def capture(f):
    c = C(16, 16, 12)
    c.vline(4, 2, 14, "dgrey"); c.hline(3, 5, 14, "black")
    y = [10, 6, 2][f]
    c.rect(5, y, 6, 4, TEAM[0]); c.hline(5, 10, y + 3, TEAM[1])
    if f == 2:
        for (x, yy) in ((12, 2), (13, 5), (11, 7)):
            c.px(x, yy, "yellow")
    return c


def sparkle(f):
    c = C(16, 16, 13)
    pts = [[(8, 8)], [(5, 5), (11, 9), (8, 12)], [(3, 8), (12, 4), (10, 12), (6, 2)]][f]
    for (x, y) in pts:
        c.px(x, y, "white")
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c.px(x + dx, y + dy, "yellow")
    return c


def era_burst(f):
    c = C(32, 32, 14)
    r = 5 + f * 5
    c.ring(16, 16, r, (240, 210, 90, 230 - f * 60), 2)
    for i in range(8):
        a = i * .785 + f * .2
        c.line(16 + math.cos(a) * (r - 3), 16 + math.sin(a) * (r - 3), 16 + math.cos(a) * (r + 3), 16 + math.sin(a) * (r + 3), (255, 245, 200, 230 - f * 60))
    if f == 0:
        c.disc(16, 16, 3, "white")
    return c


def weather(k, f=0):
    c = C(16, 16, 20 + f)
    rng = random.Random(f * 7 + len(k))
    if k == "rain":
        for i in range(10):
            x, y = rng.randrange(16), rng.randrange(16)
            for d in range(3):
                c.px((x - d) % 16, (y + d) % 16, (175, 205, 235, 190 - d * 45))
    elif k == "snow":
        for i in range(9):
            x, y = rng.randrange(16), rng.randrange(16)
            c.px(x, y, (255, 255, 255, 230))
            if i % 3 == 0:
                c.px((x + 1) % 16, y, (235, 243, 250, 150))
                c.px(x, (y + 1) % 16, (235, 243, 250, 150))
    elif k == "fog":
        for y in range(16):
            for x in range(16):
                v = 60 + int(40 * math.sin(x * .7 + f) * math.sin(y * .5))
                c.px(x, y, (220, 225, 230, max(20, v)))
    elif k == "sandstorm":
        for y in range(16):
            for x in range(16):
                if rng.random() < .3:
                    c.px(x, y, (200, 170, 110, 90))
    elif k == "night":
        c.rect(0, 0, 16, 16, (20, 25, 60, 120))
    elif k == "war_fog":
        for y in range(16):
            for x in range(16):
                c.px(x, y, (30, 30, 40, 170 + ((x * 3 + y * 5) % 7) * 6))
    return c


def lightning(f):
    c = C(16, 32, 15)
    x = 8
    pts = [(x, 0)]
    rng = random.Random(f + 2)
    for y in range(4, 30, 4):
        x = max(2, min(13, x + rng.choice([-3, -2, 2, 3])))
        pts.append((x, y))
    for (a, b) in zip(pts, pts[1:]):
        c.line(a[0], a[1], b[0], b[1], "white")
        c.line(a[0] + 1, a[1], b[0] + 1, b[1], (200, 220, 255, 160))
    return c


def cloud_shadow():
    c = C(32, 32, 16)
    rng = random.Random(4)
    puff(c, 16, 16, 9, (0, 0, 20, 50), rng, 6)
    return c


def parachute():
    c = C(16, 16, 17)
    c.ellipse(8, 5, 6, 3.5, "offwhite"); c.hline(2, 14, 6, "canvas_d")
    for x in (2, 8, 14):
        c.line(x, 6, 8, 12, "lgrey")
    c.rect(7, 11, 2, 3, TEAM[0]); c.px(7, 10, "skin")
    return c


def overlay(k):
    c = C(16, 16, 18)
    if k.startswith("zone_"):
        col = {"zone_residential": (90, 200, 90), "zone_commercial": (80, 140, 230), "zone_industrial": (230, 190, 60), "zone_farmland": (200, 150, 80)}[k]
        for y in range(16):
            for x in range(16):
                c.px(x, y, (*col, 110 if (x + y) % 4 == 0 else 55))
        c.frame(0, 0, 16, 16, (*col, 160))
    elif k == "ghost_valid":
        c.rect(0, 0, 16, 16, (90, 220, 120, 90)); c.frame(0, 0, 16, 16, (120, 240, 150, 220))
    elif k == "ghost_invalid":
        c.rect(0, 0, 16, 16, (230, 70, 60, 90)); c.frame(0, 0, 16, 16, (240, 90, 80, 220)); c.line(3, 3, 12, 12, (240, 90, 80, 220)); c.line(12, 3, 3, 12, (240, 90, 80, 220))
    elif k == "select_corners":
        for (x, y, dx, dy) in ((0, 0, 1, 1), (15, 0, -1, 1), (0, 15, 1, -1), (15, 15, -1, -1)):
            c.hline(min(x, x + dx * 3), max(x, x + dx * 3), y, "white"); c.vline(x, min(y, y + dy * 3), max(y, y + dy * 3), "white")
    elif k == "tile_highlight":
        c.rect(0, 0, 16, 16, (255, 255, 255, 50)); c.frame(0, 0, 16, 16, (255, 255, 255, 170))
    elif k == "path_dot":
        c.disc(8, 8, 1.6, "white"); c.ring(8, 8, 2.5, (0, 0, 0, 90))
    elif k == "supply_dot":
        c.rect(7, 7, 2, 2, "yellow"); c.frame(6, 6, 4, 4, (0, 0, 0, 90))
    elif k == "attack_arrowhead":
        c.poly([(3, 3), (14, 8), (3, 13), (6, 8)], "red"); c.outline(.35)
    elif k == "move_arrowhead":
        c.poly([(3, 3), (14, 8), (3, 13), (6, 8)], "white"); c.outline(.35)
    elif k == "rally_flag":
        c.vline(5, 2, 14, "dgrey"); c.poly([(6, 2), (13, 4.5), (6, 7)], TEAM[0]); c.ellipse(5, 14, 3, 1, (0, 0, 0, 80))
    elif k == "waypoint":
        c.disc(8, 6, 4, "yellow"); c.disc(8, 6, 1.7, "ink"); c.poly([(5, 8), (8, 14), (11, 8)], "yellow"); c.outline(.35)
    elif k == "range_dot":
        c.px(8, 8, (255, 255, 255, 180)); c.px(7, 8, (255, 255, 255, 90)); c.px(9, 8, (255, 255, 255, 90))
    elif k == "border_dash":
        for x in range(0, 16, 4):
            c.hline(x, x + 1, 8, TEAM[0])
    elif k == "under_attack_ring":
        c.ring(8, 8, 7, "red", 1.5); c.ring(8, 8, 4, (220, 60, 50, 140))
    elif k == "offline_shield":
        c.poly([(8, 1), (14, 3), (13, 10), (8, 15), (3, 10), (2, 3)], (120, 160, 220, 140)); c.poly([(8, 3), (12, 4.5), (11.5, 9.5), (8, 13), (4.5, 9.5), (4, 4.5)], (170, 200, 240, 110))
    return c


def build():
    for f in range(4):
        add(f"explosion_small_{f}", "effects", "explosions", explosion(16, f, 1), frame=f)
    for f in range(4):
        add(f"explosion_large_{f}", "effects", "explosions", explosion(32, f, 2), fp=(2, 2), frame=f)
    for f in range(5):
        add(f"nuke_{f}", "effects", "explosions", nuke(f), fp=(3, 3), frame=f, era="Mo")
    for f in range(3):
        add(f"smoke_{f}", "effects", "smoke_fire", smoke(f), frame=f)
        add(f"fire_{f}", "effects", "smoke_fire", fire(f), frame=f)
        add(f"dust_{f}", "effects", "smoke_fire", dust(f), frame=f)
        add(f"splash_{f}", "effects", "water", splash(f), frame=f)
        add(f"capture_{f}", "effects", "feedback", capture(f), frame=f, tags=["team"])
        add(f"sparkle_{f}", "effects", "feedback", sparkle(f), frame=f)
        add(f"era_up_{f}", "effects", "feedback", era_burst(f), fp=(2, 2), frame=f)
    for f in range(2):
        add(f"muzzle_flash_{f}", "effects", "combat", muzzle(f), frame=f)
        add(f"lightning_{f}", "effects", "weather", lightning(f), fp=(1, 2), frame=f)
    for k in ("arrow", "spear_thrown", "stone", "cannonball", "bullet_tracer", "shell", "rocket", "missile", "bomb", "plasma_bolt", "torpedo", "icbm"):
        add(f"proj_{k}", "effects", "projectiles", projectile(k), note="faces east")
    add("crater_small", "effects", "ground_marks", crater(16))
    add("crater_large", "effects", "ground_marks", crater(32), fp=(2, 2))
    add("scorch", "effects", "ground_marks", scorch())
    for k in ("rain", "snow"):
        for f in range(3):
            add(f"weather_{k}_{f}", "effects", "weather", weather(k, f), frame=f, tags=["tileable", "overlay"])
    for k in ("fog", "sandstorm", "night", "war_fog"):
        add(f"weather_{k}", "effects", "weather", weather(k), tags=["tileable", "overlay"])
    add("cloud_shadow", "effects", "weather", cloud_shadow(), fp=(2, 2))
    add("parachute", "effects", "combat", parachute(), tags=["team"])
    for k in ("zone_residential", "zone_commercial", "zone_industrial", "zone_farmland", "ghost_valid", "ghost_invalid", "select_corners", "tile_highlight",
              "path_dot", "supply_dot", "attack_arrowhead", "move_arrowhead", "rally_flag", "waypoint", "range_dot", "border_dash", "under_attack_ring", "offline_shield"):
        add(f"ov_{k}", "overlays", "map_overlays", overlay(k), tags=["team"] if k in ("rally_flag", "border_dash") else [])
