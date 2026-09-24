import math
import random
from core import C, P, hx, shade, mix, add, TEAM

T0, T1, T2 = TEAM


def wheels(c, xs, y0, y1):
    for x in xs:
        c.rect(x, y0, 2, 1, "black")
        c.rect(x, y1, 2, 1, "black")


def hull(c, x, y, w, h, col):
    c.rect(x, y, w, h, col)
    c.hline(x, x + w - 1, y, shade(col, .2))
    c.hline(x, x + w - 1, y + h - 1, shade(col, -.25))
    for (px_, py_) in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        c.a[py_, px_] = 0


def v_aa_halftrack():
    c = C(16, 16)
    for yy in (3, 12):
        c.rect(2, yy, 7, 2, "dgrey")
        for xx in range(2, 9, 2):
            c.px(xx, yy, "black")
    wheels(c, [11], 3, 12)
    hull(c, 2, 5, 12, 6, "olive")
    c.rect(3, 6, 5, 4, T0)
    c.rect(10, 6, 3, 4, "olive_d")
    c.px(12, 7, "window")
    c.hline(4, 9, 7, "dgrey")
    c.line(6, 7, 9, 4, "black")
    c.line(6, 8, 9, 5, "black")
    return c


def v_spaag():
    c = C(16, 16)
    for yy in (3, 12):
        c.rect(2, yy, 11, 2, "dgrey")
        for xx in range(2, 13, 2):
            c.px(xx, yy, "black")
    hull(c, 2, 5, 12, 6, "camo")
    c.rect(3, 6, 10, 4, T0)
    c.rect(5, 6, 6, 4, "olive_d")
    c.disc(8, 8, 2.4, "olive")
    c.line(10, 7, 15, 5, "black")
    c.line(10, 9, 15, 7, "black")
    c.px(6, 6, "metal_l")
    return c


def v_radar_truck():
    c = C(16, 16)
    hull(c, 1, 4, 14, 8, "olive")
    c.rect(11, 5, 3, 6, "olive_d")
    c.px(13, 6, "window")
    c.px(13, 9, "window")
    c.rect(2, 5, 8, 6, "metal_d")
    c.ellipse(6, 8, 4.2, 3.4, "offwhite")
    c.ring(6, 8, 4.2, "lgrey")
    c.disc(6, 8, 1, "dgrey")
    c.line(6, 8, 9, 5, "dgrey")
    wheels(c, [2, 7, 11], 3, 12)
    c.px(3, 5, T0)
    c.px(3, 10, T0)
    return c


def v_abm_truck():
    c = C(16, 16)
    hull(c, 0, 4, 16, 8, "camo")
    c.rect(12, 5, 3, 6, "olive_d")
    c.px(14, 6, "window")
    for i, y in enumerate((5, 7, 9)):
        c.rect(2, y, 9, 2, "metal_d")
        c.hline(2, 10, y, "metal_l")
        c.px(1, y, "white")
        c.px(1, y + 1, "red")
    wheels(c, [1, 5, 9, 12], 3, 12)
    c.px(6, 4, T0)
    return c


def v_laser_vehicle():
    c = C(16, 16)
    hull(c, 1, 4, 14, 8, "metal")
    c.rect(2, 5, 8, 6, "metal_l")
    c.rect(11, 5, 3, 6, "metal_d")
    c.px(13, 7, "window")
    c.disc(6, 8, 2.6, "metal_d")
    c.disc(6, 8, 1.4, "neon2")
    c.hline(8, 14, 8, "metal_l")
    c.px(15, 8, "neon2")
    c.hline(2, 9, 11, "neon2")
    wheels(c, [2, 6, 11], 3, 12)
    return c


VEHICLES = [
    ("aa_halftrack", "I", v_aa_halftrack),
    ("spaag", "Mo", v_spaag),
    ("radar_truck", "Mo", v_radar_truck),
    ("abm_launcher_truck", "Mo", v_abm_truck),
    ("laser_vehicle", "F", v_laser_vehicle),
]


def projectile(k):
    c = C(16, 16, 9)
    if k == "interceptor":
        c.rect(4, 7, 8, 2, "white")
        c.poly([(12, 7), (15, 8), (12, 9)], "red")
        c.px(5, 6, "lgrey"); c.px(5, 9, "lgrey")
        c.hline(1, 3, 8, "fire_l")
        c.px(0, 8, (255, 220, 140, 120))
    elif k == "flak_shell":
        c.rect(6, 7, 4, 2, "dgrey")
        c.px(10, 7, "metal_l"); c.px(10, 8, "metal_l")
    elif k == "sam_missile":
        c.rect(3, 7, 9, 2, "offwhite")
        c.poly([(12, 7), (15, 8), (12, 9)], "olive_d")
        c.px(4, 6, "red"); c.px(4, 9, "red")
        c.hline(0, 2, 8, "fire")
    elif k == "laser_beam":
        c.hline(0, 15, 7, (79, 224, 216, 120))
        c.hline(0, 15, 8, "neon2")
        c.hline(0, 15, 9, (79, 224, 216, 120))
    elif k == "ballistic_missile":
        c.rect(2, 6, 10, 3, "offwhite")
        c.poly([(12, 6), (15, 7.5), (12, 9)], "red")
        c.px(3, 5, "lgrey"); c.px(3, 9, "lgrey")
        c.hline(0, 1, 7, "fire_l")
    if k not in ("laser_beam",):
        c.outline(.35)
    return c


def flak_burst(f):
    c = C(16, 16, 10 + f)
    rng = random.Random(f * 3)
    if f == 0:
        c.disc(8, 8, 3.2, "fire")
        c.disc(8, 8, 2, "fire_l")
        c.disc(8, 8, 1, "white")
        for i in range(8):
            a = i * 0.785
            c.line(8 + math.cos(a) * 3, 8 + math.sin(a) * 3, 8 + math.cos(a) * 6, 8 + math.sin(a) * 6, "fire_l")
    elif f == 1:
        for i in range(30):
            a = rng.random() * 6.283
            d = rng.random() * 5.5
            c.px(8 + math.cos(a) * d, 8 + math.sin(a) * d, rng.choice(["smoke", "dgrey", "fire"]))
        c.disc(8, 8, 2.2, "fire")
        c.disc(8, 8, 1.2, "fire_l")
    else:
        for i in range(34):
            a = rng.random() * 6.283
            d = 1 + rng.random() * 6.5
            c.px(8 + math.cos(a) * d, 8 + math.sin(a) * d - 1, (140, 140, 148, 200 - int(d * 12)))
        c.disc(7, 8, 2, (110, 110, 118, 180))
    return c


def intercept_burst(f):
    c = C(32, 32, 20 + f)
    r = 4 + f * 6
    c.ring(16, 16, r, (255, 240, 200, 220 - f * 60), 2)
    for i in range(10):
        a = i * 0.628 + f * 0.2
        c.line(16 + math.cos(a) * (r - 3), 16 + math.sin(a) * (r - 3), 16 + math.cos(a) * (r + 3), 16 + math.sin(a) * (r + 3), (255, 220, 150, 200 - f * 55))
    if f == 0:
        c.disc(16, 16, 4, "white")
        c.disc(16, 16, 6, (255, 240, 180, 160))
    else:
        c.disc(16, 16, max(1, 6 - f * 2), "fire_l")
    return c


def launch_smoke(f):
    c = C(16, 16, 30 + f)
    rng = random.Random(f + 5)
    c.disc(8, 13 - f, 3 + f, (225, 222, 215, 220 - f * 50))
    c.disc(5 + f, 14 - f, 2.4 + f * .6, (205, 202, 196, 200 - f * 45))
    c.disc(11 - f, 14 - f, 2.2 + f * .6, (215, 212, 206, 200 - f * 45))
    for i in range(10 + f * 5):
        x = 8 + rng.gauss(0, 1.4 + f * .8)
        y = 12 - rng.random() * (3 + f * 5)
        c.px(x, y, (235, 233, 228, 210 - f * 45))
    if f == 0:
        c.disc(8, 14, 2, "fire_l")
        c.disc(8, 14, 1, "white")
    return c


def missile_trail(f):
    c = C(16, 16, 40 + f)
    for x in range(16):
        a = max(0, 200 - x * 12 - f * 40)
        if a:
            c.px(x, 8 + (1 if (x + f) % 4 == 0 else 0), (235, 235, 240, a))
    return c


def shield_impact(f):
    c = C(32, 32, 50 + f)
    r = 13
    for i in range(200):
        a = i / 200 * 6.283
        c.px(16 + math.cos(a) * r, 16 + math.sin(a) * r, (79, 224, 216, 190 - f * 45))
    hx0, hy0 = 24, 10
    c.disc(hx0, hy0, 5 - f, (255, 255, 255, 220 - f * 60))
    c.disc(hx0, hy0, 7 - f, (150, 250, 240, 150 - f * 40))
    for i in range(6):
        a = -0.9 + i * 0.3
        c.line(hx0, hy0, hx0 + math.cos(a) * (9 + f * 3), hy0 + math.sin(a) * (9 + f * 3), (190, 255, 250, 170 - f * 50))
    for y in range(32):
        for x in range(32):
            d = math.hypot(x - 16, y - 16)
            if d < r - 1 and (x + y) % 6 == 0:
                c.px(x, y, (79, 224, 216, 45 - f * 12))
    return c


def radar_sweep(f):
    c = C(32, 32, 60 + f)
    c.ring(16, 16, 15, (110, 220, 200, 90), 1)
    c.ring(16, 16, 10, (110, 220, 200, 60), 1)
    c.ring(16, 16, 5, (110, 220, 200, 60), 1)
    a0 = f * 1.57
    for t in range(15):
        a = a0 + t * 0.02
        for d in range(15):
            c.px(16 + math.cos(a) * d, 16 + math.sin(a) * d, (140, 255, 220, 150 - d * 8))
    c.px(16, 16, "neon2")
    return c


def coverage(kind):
    c = C(16, 16, 70 + len(kind))
    col = {"radar_coverage": (110, 220, 200, 60), "sam_coverage": (230, 120, 90, 60), "shield_coverage": (120, 170, 255, 70)}[kind]
    for y in range(16):
        for x in range(16):
            if (x + y) % 4 == 0:
                c.px(x, y, col)
    c.hline(0, 15, 0, (col[0], col[1], col[2], 90))
    c.vline(0, 0, 15, (col[0], col[1], col[2], 90))
    return c


def marker(kind):
    c = C(16, 16, 80 + len(kind))
    if kind == "missile_track":
        for x in range(0, 16, 4):
            c.px(x, 8, "red")
            c.px(x + 1, 8, (220, 90, 70, 150))
    elif kind == "intercept_point":
        c.ring(8, 8, 6, "yellow", 1.5)
        c.line(4, 4, 11, 11, "yellow")
        c.line(11, 4, 4, 11, "yellow")
    elif kind == "incoming_target":
        c.ring(8, 8, 7, "red", 2)
        c.ring(8, 8, 3.5, (220, 70, 60, 160), 1.5)
        c.px(8, 8, "red")
    elif kind == "shield_dome":
        for i in range(120):
            a = math.pi + i / 120 * math.pi
            c.px(8 + math.cos(a) * 7.5, 11 + math.sin(a) * 7.5, (120, 200, 255, 160))
        for y in range(4, 12):
            for x in range(1, 15):
                if (x - 8) ** 2 / 56 + (y - 11) ** 2 / 56 <= 1 and (x + y) % 5 == 0:
                    c.px(x, y, (120, 200, 255, 60))
    return c


def icon(kind):
    c = C(16, 16, 90 + len(kind))
    if kind == "alert_missile_incoming":
        c.disc(8, 8, 7.5, "red_d")
        c.rect(5, 7, 7, 2, "white")
        c.poly([(12, 6), (15, 8), (12, 10)], "white")
        c.px(4, 6, "offwhite"); c.px(4, 10, "offwhite")
    elif kind == "alert_intercepted":
        c.disc(8, 8, 7.5, "green_d")
        c.line(3, 8, 6, 11, "white")
        c.line(6, 11, 13, 4, "white")
        c.rect(4, 3, 5, 1, "white")
    elif kind == "ui_air_defence":
        c.rect(2, 11, 12, 4, "olive")
        c.hline(2, 13, 11, "olive_d")
        for x in (3, 6, 9):
            c.rect(x, 12, 2, 2, "metal_d")
        c.rect(9, 5, 2, 6, "offwhite")
        c.poly([(8, 5), (10, 1), (12, 5)], "red")
        c.px(9, 11, "fire_l"); c.px(10, 11, "fire")
        c.ellipse(4, 7, 3, 2.2, "lgrey")
        c.ring(4, 7, 3, "offwhite")
    elif kind == "ui_coverage":
        c.ring(8, 12, 9, "neon2", 1.5)
        c.ring(8, 12, 5.5, (79, 224, 216, 150), 1.2)
        c.rect(7, 9, 2, 5, "metal_l")
        c.disc(8, 8, 1.6, "white")
    elif kind == "ui_intercept":
        c.line(1, 14, 9, 6, "white")
        c.line(15, 2, 9, 8, "red")
        c.disc(9, 7, 3, "fire_l")
        c.disc(9, 7, 1.4, "white")
    elif kind == "ui_silo":
        c.disc(8, 9, 7, "yellow")
        c.disc(8, 9, 5.5, "dgrey")
        c.rect(3, 8, 11, 1, "black")
        c.rect(7, 4, 2, 5, "offwhite")
        c.px(7, 3, "red"); c.px(8, 3, "red")
    c.outline_outer()
    return c


def build():
    for (n, era, fn) in VEHICLES:
        im = fn()
        im.outline(.4)
        add(n, "vehicles", "air_defence", im, era=era, tags=["team"], note="faces east; rotate in game")
    for k in ("interceptor", "flak_shell", "sam_missile", "laser_beam", "ballistic_missile"):
        add(f"proj_{k}", "effects", "projectiles", projectile(k), note="faces east")
    for f in range(3):
        add(f"flak_burst_{f}", "effects", "air_defence", flak_burst(f), frame=f)
        add(f"intercept_burst_{f}", "effects", "air_defence", intercept_burst(f), fp=(2, 2), frame=f)
        add(f"launch_smoke_{f}", "effects", "air_defence", launch_smoke(f), frame=f)
        add(f"missile_trail_{f}", "effects", "air_defence", missile_trail(f), frame=f, tags=["tileable"])
        add(f"shield_impact_{f}", "effects", "air_defence", shield_impact(f), fp=(2, 2), frame=f)
    for f in range(4):
        add(f"radar_sweep_{f}", "effects", "air_defence", radar_sweep(f), fp=(2, 2), frame=f, tags=["overlay"])
    for k in ("radar_coverage", "sam_coverage", "shield_coverage"):
        add(f"ov_{k}", "overlays", "air_defence", coverage(k), tags=["tileable", "overlay"])
    for k in ("missile_track", "intercept_point", "incoming_target", "shield_dome"):
        add(f"ov_{k}", "overlays", "air_defence", marker(k))
    for k in ("alert_missile_incoming", "alert_intercepted", "ui_air_defence", "ui_coverage", "ui_intercept", "ui_silo"):
        grp = "alerts" if k.startswith("alert") else "general"
        add(k, "ui", grp, icon(k))
