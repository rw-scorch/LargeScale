from core import C, P, hx, shade, mix, TEAM, LIGHT_RGB
import numpy as np
import random


def _ri(c, a, b):
    a, b = int(a), int(b)
    return a if b <= a else c.rng.randint(a, b)


def wall_fill(c, x0, y0, x1, y1, mat, col, pitched=True):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            v = col
            ry, rx = y - y0, x - x0
            if mat == "brick":
                if ry % 3 == 2 or (rx + (2 if (ry // 3) % 2 else 0)) % 4 == 0:
                    v = shade(col, .14)
            elif mat == "wood":
                if rx % 3 == 0:
                    v = shade(col, -.14)
            elif mat == "log":
                v = shade(col, .08) if ry % 2 == 0 else shade(col, -.1)
            elif mat == "stone":
                off = (ry // 2) * 3 % 5
                if ry % 2 == 1 or (rx + off) % 5 == 0:
                    v = shade(col, -.13)
            elif mat == "glass":
                v = mix(col, "glass_l", 0.35) if (rx + ry) % 7 in (0, 1) else col
                if rx % 3 == 0 or ry % 3 == 0:
                    v = shade(col, -.2)
            elif mat == "metal":
                v = shade(col, .1) if rx % 2 == 0 else shade(col, -.08)
            elif mat == "timber":
                v = hx("plaster")
                if rx % 5 == 0 or ry == 0 or ry == (y1 - y0) // 2:
                    v = hx("wood_d")
            elif mat == "canvas":
                v = shade(col, -.08) if rx % 4 == 0 else col
            c.px(x, y, v)
    if mat in ("mud", "plaster", "concrete", "canvas"):
        c.noise(x0, y0, x1 - x0 + 1, y1 - y0 + 1, None, .05, .3)
    c.hline(x0, x1, y1, shade(col, -.25))
    if pitched:
        c.hline(x0, x1, y0, shade(col, -.3))


def roof_fill(c, x0, y0, x1, y1, style, col, mat="tile"):
    h = y1 - y0 + 1
    w = x1 - x0 + 1
    mid = y0 + (h - 1) // 2
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            ry, rx = y - y0, x - x0
            if style in ("gable", "hip", "pyramid"):
                v = shade(col, .12) if y < mid else (shade(col, .3) if y == mid else col)
                if style in ("hip", "pyramid"):
                    inset = (h // 2) if style == "hip" else w // 2
                    d = inset - abs(y - mid)
                    if rx < d:
                        v = shade(col, -.06)
                    elif (x1 - x) < d:
                        v = shade(col, -.2)
                if y != mid:
                    if mat == "tile" and (ry % 2 == 1 or (rx + ry // 2) % 3 == 0):
                        v = shade(v, -.1)
                    elif mat == "slate" and (ry % 2 == 1 or (rx + (ry // 2) * 2) % 4 == 0):
                        v = shade(v, -.09)
                    elif mat == "metal" and rx % 3 == 0:
                        v = shade(v, .12)
                    elif mat == "shingle" and ry % 2 == 1:
                        v = shade(v, -.1)
                if style == "gable" and (x == x0 or x == x1):
                    v = shade(v, -.18)
            elif style == "flat":
                v = col
                if rx in (0, w - 1) or ry in (0, h - 1):
                    v = shade(col, .16)
                elif rx == 1 or ry == 1:
                    v = shade(col, -.12)
            elif style == "sawtooth":
                band = ry % 4
                v = [shade(col, .18), col, shade(col, -.14), hx("glass")][band]
            elif style == "barrel":
                t = abs(ry - (h - 1) / 2) / (h / 2)
                v = shade(col, .2 - t * .45)
                if rx % 3 == 0:
                    v = shade(v, -.1)
            elif style == "glassroof":
                v = mix("glass_l", "white", .2)
                if rx % 3 == 0 or ry % 3 == 0:
                    v = hx("metal_d")
            elif style == "stripes":
                v = col if (rx // 2) % 2 == 0 else hx("white")
                if ry == h - 1:
                    v = shade(v, -.25)
            elif style == "tent":
                cx = x0 + (w - 1) / 2
                v = col if x < cx else shade(col, -.15)
                if abs(x - cx) < .6:
                    v = shade(col, .2)
            else:
                v = col
            c.px(x, y, v)
    if mat == "thatch":
        c.noise(x0, y0, w, h, None, .1, .5)
        for x in range(x0, x1 + 1):
            if c.rng.random() < .4:
                c.px(x, y1 + 1, shade(col, -.2))


def cone_roof(c, x0, y0, x1, y1, col, wallcol=None, mat="thatch"):
    cx = (x0 + x1 + 1) / 2
    cy = (y0 + y1 + 1) / 2
    r = min(x1 - x0 + 1, y1 - y0 + 1) / 2
    if wallcol:
        c.disc(cx, cy + 1, r - .3, wallcol)
        c.disc(cx, cy - .6, r - .6, col, shade_top=.35)
    else:
        c.disc(cx, cy, r, col, shade_top=.35)
    rr = r - 1.5
    while rr > 1:
        c.ring(cx, cy - (.6 if wallcol else 0), rr, shade(col, -.12))
        rr -= 2.2
    if mat == "thatch":
        c.noise(int(cx - r), int(cy - r), int(2 * r + 1), int(2 * r + 1), None, .08, .35)
    c.px(int(cx), int(cy - (1 if wallcol else 0)), shade(col, .35))
    return cx, cy, r


def windows(c, x0, x1, wy0, wy1, style, door, rng, nrows=None):
    if style in (None, "none"):
        return
    width = x1 - x0 + 1
    if style == "shop":
        sy = wy1 - 3
        c.rect(x0 + 1, sy, width - 2, 3, "glass")
        c.hline(x0 + 1, x1 - 1, sy, "glass_l")
        for x in range(x0 + 1, x1, 4):
            c.px(x, sy + 1, "window_l")
        if MODE["night"] and MODE["era"] not in ("T",):
            c.rect(x0 + 1, sy, width - 2, 3, "lit2" if MODE["era"] in ("Mo", "F") else "lit")
            for x in range(x0 + 4, x1, 5):
                c.vline(x, sy, sy + 2, "metal_d")
        upper_end = sy - 3
        if upper_end - wy0 >= 2:
            windows(c, x0, x1, wy0, upper_end + 2, "row", None, rng)
        return
    ww, wh, per = 2, 2, 4
    if style == "slit":
        ww, wh, per = 1, 2, 3
    if style == "grid":
        ww, wh, per = 2, 2, 3
    if style == "small":
        ww, wh, per = 1, 1, 3
    vper = 3 if style == "grid" else 4
    ys = list(range(wy0 + 1, wy1 - 1, vper))
    if nrows:
        ys = ys[:nrows]
    n = max(1, (width - 2 + (per - ww)) // per)
    span = n * per - (per - ww)
    sx = x0 + (width - span) // 2
    for y in ys:
        if y + wh - 1 >= wy1:
            continue
        if style == "band":
            c.rect(x0 + 1, y, width - 2, 2, "window")
            c.hline(x0 + 1, x1 - 1, y, "window_l")
            for x in range(x0 + 1, x1, 3):
                c.vline(x, y, y + 1, "metal_d")
            continue
        for i in range(n):
            x = sx + i * per
            if door and not (x + ww - 1 < door[0] or x > door[2]) and y + wh - 1 >= door[1]:
                continue
            c.rect(x, y, ww, wh, "window")
            c.px(x, y, "window_l")
            if style == "lit" and rng.random() < .35:
                c.rect(x, y, ww, wh, "lit")


def door_draw(c, x0, x1, wy0, wy1, kind, col=None):
    if kind in (None, "none"):
        return None
    width = x1 - x0 + 1
    wr = wy1 - wy0 + 1
    dw = {"std": 3, "wide": 6, "double": 4, "glass": 4, "garage": 6, "arch": 3, "small": 2}.get(kind, 3)
    dw = min(dw, width - 2)
    dh = min(5 if kind in ("wide", "garage") else 4, wr - 1)
    if wr <= 3:
        dh = wr - 1
    dx = x0 + (width - dw) // 2
    dy = wy1 - dh + 1
    base = {"glass": "glass", "garage": "metal"}.get(kind, col or "wood_d")
    c.rect(dx, dy, dw, dh, base)
    if kind == "garage":
        for y in range(dy, dy + dh, 2):
            c.hline(dx, dx + dw - 1, y, "metal_d")
    elif kind == "glass":
        c.vline(dx + dw // 2, dy, dy + dh - 1, "metal_d")
        c.px(dx, dy, "glass_l")
    else:
        c.hline(dx, dx + dw - 1, dy, shade(base, -.3))
        if kind == "arch":
            c.px(dx, dy, None)
    return (dx, dy, dx + dw - 1, dy + dh - 1)


def extra(c, e, b, info):
    x0, y0, x1, y1 = b
    ry1 = info["ry1"]
    k = e[0]
    a = e[1:] if len(e) > 1 else ()
    if k == "chimney":
        x = x0 + (a[0] if a else (x1 - x0) * 2 // 3)
        top = y0 + (a[1] if len(a) > 1 else 1)
        c.rect(x, top, 2, 3, a[2] if len(a) > 2 else "stone_d")
        c.hline(x, x + 1, top, "black")
    elif k == "flag":
        x = x0 + (a[0] if a else 2)
        top = y0 + (a[1] if len(a) > 1 else 0)
        c.vline(x, top, top + 4, "dgrey")
        c.rect(x + 1, top, 3, 2, TEAM[0])
        c.px(x + 3, top + 1, TEAM[1])
    elif k == "sign":
        col = a[0] if a else "red"
        y = info["wy0"] + (a[1] if len(a) > 1 else 0)
        cx = (x0 + x1) // 2
        c.rect(cx - 2, y, 5, 1, col)
        hi = "lit2" if MODE["night"] and MODE["era"] in ("I", "Mo", "F") else shade(col, .5)
        c.px(cx - 1, y, hi)
        c.px(cx + 1, y, hi)
    elif k == "awning":
        col = a[0] if a else "red"
        y = info["wy1"] - 5
        for x in range(x0, x1 + 1):
            c.px(x, y, col if (x - x0) % 2 == 0 else "white")
            c.px(x, y + 1, shade(col if (x - x0) % 2 == 0 else "white", -.25))
    elif k == "ac":
        n = a[0] if a else 2
        rng = c.rng
        for i in range(n):
            x = _ri(c, x0 + 2, max(x0 + 2, x1 - 3))
            y = _ri(c, y0 + 2, max(y0 + 2, ry1 - 3))
            c.rect(x, y, 2, 2, "metal_l")
            c.px(x + 1, y + 1, "metal_d")
    elif k == "vents":
        for i in range(a[0] if a else 3):
            c.px(_ri(c, x0 + 2, x1 - 2), _ri(c, y0 + 2, ry1 - 2), "black")
    elif k == "solar":
        for y in range(y0 + 2, ry1 - 1, 3):
            for x in range(x0 + 2, x1 - 2, 4):
                c.rect(x, y, 3, 2, "navy")
                c.px(x, y, "glass")
    elif k == "helipad":
        cx, cy = (x0 + x1 + 1) / 2, (y0 + ry1 + 1) / 2
        r = min(x1 - x0, ry1 - y0) / 2 - 1.5
        c.disc(cx, cy, r, "dgrey")
        c.ring(cx, cy, r, "yellow")
        ix, iy = int(cx), int(cy)
        c.vline(ix - 2, iy - 2, iy + 1, "white"); c.vline(ix + 1, iy - 2, iy + 1, "white"); c.hline(ix - 1, ix, iy, "white")
    elif k == "dome":
        col = a[0] if a else "metal_l"
        cx, cy = (x0 + x1 + 1) / 2, (y0 + ry1 + 1) / 2 + (a[2] if len(a) > 2 else 0)
        r = a[1] if len(a) > 1 else min(x1 - x0, ry1 - y0) / 2 - 1
        c.disc(cx, cy, r, shade(col, -.35))
        c.disc(cx - .3, cy - .3, r - .7, col, shade_top=.4)
        c.px(int(cx - r / 2), int(cy - r / 2), shade(col, .5))
    elif k == "smokestack":
        x = x0 + a[0]
        top = a[1] if len(a) > 1 else 0
        bot = ry1 - 1
        w = a[2] if len(a) > 2 else 2
        col = a[3] if len(a) > 3 else "brick"
        for y in range(top, bot + 1):
            for i in range(w):
                c.px(x + i, y, shade(col, .12 if i == 0 else -.05))
        c.hline(x, x + w - 1, top, "black")
        if col != "brick":
            c.hline(x, x + w - 1, top + 2, "red"); c.hline(x, x + w - 1, top + 3, "white")
    elif k == "tower":
        tx = x0 + a[0]
        tw = a[1]
        top = y0 + (a[2] if len(a) > 2 else 0)
        bot = a[3] if len(a) > 3 else ry1
        col = a[4] if len(a) > 4 else "stone"
        rcol = a[5] if len(a) > 5 else "slate"
        wall_fill(c, tx, top + tw // 2 + 1, tx + tw - 1, bot, "stone" if col.startswith("stone") else "plaster", col, pitched=True)
        roof_fill(c, tx, top, tx + tw - 1, top + tw // 2, "pyramid", rcol, "slate")
        cy = top + tw // 2 + 2
        c.px(tx + tw // 2, cy, "white")
        if tw >= 4:
            c.px(tx + tw // 2 - 1, cy, "white")
    elif k == "columns":
        wy0, wy1 = info["wy0"], info["wy1"]
        for x in range(x0 + 1, x1):
            c.vline(x, wy0 + 1, wy1 - 1, "stone_d" if (x - x0) % 3 == 0 else ("white" if (x - x0) % 3 == 1 else "stone_l"))
        c.hline(x0, x1, wy0, "stone_l")
        c.hline(x0, x1, wy0 + 1, "stone_d")
        c.hline(x0, x1, wy1, "stone_l")
        cx = (x0 + x1) / 2
        ph = min(3, ry1 - y0)
        for i in range(ph):
            c.hline(int(cx - (ph - i) * 2), int(cx + (ph - i) * 2), ry1 - i, "stone_l" if i else "stone")
    elif k == "crenel":
        for x in range(x0, x1 + 1):
            if (x - x0) % 2 == 1:
                c.a[y0 + c.oy, x] = (0, 0, 0, 0)
        for y in range(y0, ry1 + 1):
            if (y - y0) % 2 == 1:
                c.a[y + c.oy, x0] = (0, 0, 0, 0)
                c.a[y + c.oy, x1] = (0, 0, 0, 0)
    elif k == "skylight":
        for x in range(x0 + 3, x1 - 2, 5):
            c.rect(x, y0 + 3, 2, max(1, ry1 - y0 - 5), "glass_l")
    elif k == "antenna":
        x = x0 + (a[0] if a else (x1 - x0) // 2)
        c.vline(x, y0 - 3, y0 + 2, "dgrey")
        c.px(x, y0 - 3, "beacon" if MODE["night"] else "red")
    elif k == "watertank":
        x = x0 + (a[0] if a else 2)
        y = y0 + (a[1] if len(a) > 1 else 2)
        c.disc(x + 1.5, y + 1.5, 1.8, "wood_l", shade_top=.3)
    elif k == "marquee":
        col = a[0] if a else "gold"
        y = info["wy0"] + 1
        c.rect(x0 + 1, y, x1 - x0 - 1, 2, "black")
        bulb = "lit" if MODE["night"] else col
        for x in range(x0 + 1, x1, 2):
            c.px(x, y, bulb)
            c.px(x + 1, y + 1, bulb)
    elif k == "neon":
        col = a[0] if a else "neon"
        for x in range(x0, x1 + 1, 2):
            c.px(x, info["wy0"], col)
    elif k == "greenery":
        for y in range(info["wy0"] + 2, info["wy1"] - 2, 4):
            for x in range(x0 + 1, x1):
                if c.rng.random() < .7:
                    c.px(x, y, c.rng.choice(["leaf", "leaf_l", "leaf_d"]))
        for x in range(x0 + 1, x1):
            for y in range(y0 + 1, ry1):
                if c.rng.random() < .25:
                    c.px(x, y, c.rng.choice(["leaf", "leaf_l"]))
    elif k == "sails":
        cx, cy = (x0 + x1 + 1) / 2 - .5, (y0 + ry1) / 2
        r = min(x1 - x0, ry1 - y0 + 4) / 2 + 1
        for dx, dy in ((1, 1), (1, -1)):
            c.line(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r, "wood_d")
        for dx, dy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
            for t in range(2, int(r) + 1):
                c.px(cx + dx * t + (1 if dy == dx else 0), cy + dy * t, "canvas")
        c.px(cx, cy, "black")
    elif k == "totem":
        x = x0 + a[0]
        for i, col in enumerate(["red", "yellow", "wood", "teal", "wood_d"]):
            c.px(x, y0 + i, col)
    elif k == "clinic":
        cx, y = (x0 + x1) // 2, info["wy0"]
        c.rect(cx - 1, y, 3, 3, "green")
        c.px(cx, y + 1, "white"); c.px(cx - 1, y + 1, "white"); c.px(cx + 1, y + 1, "white"); c.px(cx, y, "white"); c.px(cx, y + 2, "white")
    elif k == "banners":
        col = a[0] if a else TEAM[0]
        for x in range(x0 + 2, x1 - 1, 4):
            c.vline(x, info["wy0"] + 1, info["wy0"] + 3, col)
    elif k == "garden":
        for i in range(a[0] if a else 6):
            c.px(_ri(c, x0 + 1, x1 - 1), _ri(c, y0 + 1, ry1 - 1), c.rng.choice(["leaf", "leaf_l", "pink"]))
    elif k == "glow":
        col = a[0] if a else "neon2"
        c.hline(x0, x1, info["wy1"] - 1, col)
    elif k == "pad":
        c.rect(a[0], a[1], a[2], a[3], a[4])


def ground_fill(c, kind, W, H):
    if kind is None:
        return
    base = {"lawn": "lawn", "paving": "concrete_l", "dirt": "dirt_l", "asphalt": "asphalt", "sand": "sand",
            "gravel": "stone", "snow": "snow", "water": "water", "wood": "wood_l"}[kind]
    for y in range(H):
        for x in range(W):
            v = hx(base)
            if kind == "paving" and (x % 4 == 0 or y % 4 == 0):
                v = shade(base, -.08)
            if kind == "wood" and y % 3 == 0:
                v = shade(base, -.2)
            c.px(x, y, v)
    if kind in ("lawn", "dirt", "sand", "gravel", "snow"):
        c.noise(0, 0, W, H, None, .07, .3)
    if kind == "water":
        for i in range(W * H // 18):
            x, y = c.rng.randrange(W), c.rng.randrange(H)
            c.hline(x, x + 1, y, "water_l")


def ground_item(c, it):
    k = it[0]
    if k == "parking":
        x, y, w, h = it[1:5]
        c.rect(x, y, w, h, "asphalt")
        for xx in range(x + 1, x + w - 1, 3):
            c.vline(xx, y, y + 1, "line")
            c.vline(xx, y + h - 2, y + h - 1, "line")
        for i in range(max(1, w // 6)):
            cx = c.rng.randrange(x + 1, x + w - 2)
            col = c.rng.choice(["red", "blue", "white", "yellow", "dgrey"])
            c.rect(cx, y + c.rng.choice([0, h - 2]), 2, 2, col)
    elif k == "pool":
        x, y, w, h = it[1:5]
        c.rect(x - 1, y - 1, w + 2, h + 2, "concrete_l")
        c.rect(x, y, w, h, "water_l")
        c.hline(x, x + w - 1, y, "white")
    elif k == "tree":
        x, y = it[1], it[2]
        col = it[3] if len(it) > 3 else "leaf"
        c.px(x + 1, y + 3, (0, 0, 0, 70)); c.px(x + 2, y + 3, (0, 0, 0, 70))
        c.disc(x + 1.5, y + 1.5, 1.8, shade(col, -.3))
        c.disc(x + 1.3, y + 1.3, 1.3, col)
        c.px(x + 1, y + 1, shade(col, .3))
    elif k == "fence":
        x, y, w, h = it[1:5]
        col = it[5] if len(it) > 5 else "wood_l"
        for xx in range(x, x + w):
            if (xx - x) % 2 == 0 or True:
                c.px(xx, y, col); c.px(xx, y + h - 1, col)
        for yy in range(y, y + h):
            c.px(x, yy, col); c.px(x + w - 1, yy, col)
    elif k == "path":
        x, y, w, h = it[1:5]
        c.rect(x, y, w, h, it[5] if len(it) > 5 else "dirt_l")
    elif k == "rect":
        c.rect(it[1], it[2], it[3], it[4], it[5])
    elif k == "clear":
        c.a[it[2] + c.oy:it[2] + c.oy + it[4], it[1]:it[1] + it[3]] = 0
    elif k == "fire":
        x, y = it[1], it[2]
        c.px(x, y + 1, "wood_d"); c.px(x + 2, y + 1, "wood_d")
        c.px(x + 1, y, "fire"); c.px(x + 1, y + 1, "fire_l"); c.px(x, y, "fire"); c.px(x + 2, y, "fire")
        c.px(x + 1, y - 1, "fire_l")
    elif k == "logs":
        x, y, n = it[1], it[2], it[3] if len(it) > 3 else 3
        for i in range(n):
            c.hline(x, x + 4, y + i * 2, "wood_l")
            c.px(x + 4, y + i * 2, "straw")
            c.hline(x, x + 4, y + i * 2 + 1, "wood_d")
    elif k == "crates":
        x, y, n = it[1], it[2], it[3] if len(it) > 3 else 3
        for i in range(n):
            cx, cy = x + (i % 2) * 3, y + (i // 2) * 3
            c.rect(cx, cy, 3, 3, "wood_l")
            c.px(cx + 1, cy + 1, "wood_d")
            c.frame(cx, cy, 3, 3, "wood_d")
    elif k == "containers":
        x, y, w, h = it[1:5]
        for yy in range(y, y + h, 3):
            for xx in range(x, x + w, 6):
                col = c.rng.choice(["red", "blue", "teal", "orange", "green", "grey"])
                c.rect(xx, yy, 5, 2, col)
                c.hline(xx, xx + 4, yy, shade(col, .25))
    elif k == "headstones":
        x, y, w, h = it[1:5]
        for yy in range(y, y + h, 3):
            for xx in range(x, x + w, 3):
                c.px(xx, yy, "stone_l"); c.px(xx, yy + 1, "stone_d")
    elif k == "rows":
        x, y, w, h, col = it[1:6]
        for yy in range(y, y + h, 2):
            c.hline(x, x + w - 1, yy, col)
    elif k == "sheep":
        for (sx, sy) in it[1]:
            c.rect(sx, sy, 2, 2, "white"); c.px(sx + 2, sy, "black")
    elif k == "terraces":
        cx, cy, rx, ry, n = it[1:6]
        for i in range(n):
            f = 1 - i / n
            c.ellipse(cx, cy, rx * f, ry * f, shade("dirt_l", -.08 * i) if i % 2 == 0 else shade("dirt", -.08 * i))
        c.ellipse(cx, cy, rx / n, ry / n, "water_d")
    elif k == "wheel":
        cx, cy, r = it[1:4]
        c.ring(cx, cy, r, "wood_d")
        c.line(cx - r, cy, cx + r, cy, "wood"); c.line(cx, cy - r, cx, cy + r, "wood")
        c.px(cx, cy, "black")
    elif k == "poly":
        c.poly(it[1], it[2])
    elif k == "target":
        x, y = it[1], it[2]
        c.disc(x, y, 2.5, "white"); c.disc(x, y, 1.6, "red"); c.px(int(x), int(y), "yellow")
        c.vline(int(x), int(y) + 2, int(y) + 4, "wood_d")
    elif k == "tent":
        x, y = it[1], it[2]
        col = it[3] if len(it) > 3 else "canvas"
        c.poly([(x, y + 5), (x + 3, y), (x + 6, y + 5)], col)
        c.poly([(x + 3, y), (x + 6, y + 5), (x + 3, y + 5)], shade(col, -.2))
        c.px(x + 3, y + 4, "black"); c.px(x + 3, y + 3, "black")
    elif k == "umbrella":
        x, y = it[1], it[2]
        col = it[3] if len(it) > 3 else "red"
        c.disc(x + .5, y + .5, 2, col)
        c.px(x, y, "white"); c.px(x + 1, y + 1, "white")
        c.px(x + 2, y + 3, "white")
    elif k == "panels":
        x, y, w, h = it[1:5]
        for yy in range(y, y + h, 3):
            for xx in range(x, x + w, 5):
                c.rect(xx, yy, 4, 2, "navy")
                c.px(xx, yy, "glass"); c.px(xx + 2, yy, "glass_d")
    elif k == "car":
        x, y = it[1], it[2]
        col = it[3] if len(it) > 3 else "red"
        vert = it[4] if len(it) > 4 else False
        if vert:
            c.rect(x, y, 2, 3, col); c.px(x, y + 1, "window"); c.px(x + 1, y + 1, "window")
        else:
            c.rect(x, y, 3, 2, col); c.px(x + 1, y, "window"); c.px(x + 1, y + 1, "window")
    elif k == "basin":
        x, y, r = it[1:4]
        col = it[4] if len(it) > 4 else "water_l"
        c.disc(x, y, r, "concrete_l")
        c.disc(x, y, r - 1, col)
        c.line(x - r + 1, y, x + r - 1, y, "metal_d")
    elif k == "disc":
        c.disc(it[1], it[2], it[3], it[4])
    elif k == "ringi":
        c.ring(it[1], it[2], it[3], it[4], it[5] if len(it) > 5 else 1)
    elif k == "ln":
        c.line(it[1], it[2], it[3], it[4], it[5])
    elif k == "hay":
        x, y = it[1], it[2]
        c.disc(x + 1.5, y + 1.5, 2, "hay", shade_top=.3)
    elif k == "cannon":
        x, y = it[1], it[2]
        c.rect(x, y, 5, 2, "black"); c.hline(x + 5, x + 6, y, "black")
        c.px(x + 1, y + 2, "wood_d"); c.px(x + 3, y + 2, "wood_d")
    elif k == "dock":
        x, y, w, h = it[1:5]
        c.rect(x, y, w, h, "wood_l")
        for yy in range(y, y + h, 2):
            c.hline(x, x + w - 1, yy, "wood")
        for xx in (x, x + w - 1):
            for yy in range(y, y + h, 4):
                c.px(xx, yy, "wood_d")
    elif k == "hull":
        x, y, w, h = it[1:5]
        col = it[5] if len(it) > 5 else "wood"
        c.rect(x, y, w - h // 2, h, col)
        c.poly([(x + w - h // 2, y), (x + w, y + h / 2), (x + w - h // 2, y + h)], col)
        c.rect(x + 1, y + 1, w - h // 2 - 2, h - 2, shade(col, .15))
    elif k == "pumps":
        x, y, n = it[1:4]
        for i in range(n):
            c.rect(x + i * 5, y, 2, 3, "red"); c.px(x + i * 5, y, "white")
    elif k == "pipe":
        x0, y0, x1, y1 = it[1:5]
        col = it[5] if len(it) > 5 else "metal"
        c.line(x0, y0, x1, y1, col)
        c.line(x0, y0 + 1, x1, y1 + 1, shade(col, -.3))
    elif k == "rock":
        x, y = it[1], it[2]
        c.disc(x + 1.5, y + 1.5, 2, "stone_d"); c.disc(x + 1.2, y + 1.2, 1.4, "stone"); c.px(x + 1, y + 1, "stone_l")
    elif k == "cattle":
        for (sx, sy) in it[1]:
            c.rect(sx, sy, 3, 2, "wood"); c.px(sx + 3, sy, "wood_d"); c.px(sx + 1, sy, "white")


def body_default(W, H):
    return (1, 1, W - 2, H - 2)


MODE = {"night": False, "era": "M", "rng": random.Random(0)}


def lit_col():
    e = MODE["era"]
    r = MODE["rng"].random()
    if e in ("T", "M"):
        return "lit3" if r < .35 else None
    if e == "G":
        return ("lit3" if r < .5 else "lit") if r < .45 else None
    if e == "I":
        return ("lit" if r < .4 else "lit3") if r < .5 else None
    return ("lit" if r < .35 else "lit2") if r < .6 else None


def night_windows(c, x0, y0, x1, y1):
    seen = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x, y) in seen:
                continue
            if c.get(x, y)[:3] in (hx("window")[:3], hx("window_l")[:3]):
                blob = [(x, y)]
                seen.add((x, y))
                i = 0
                while i < len(blob):
                    bx, by = blob[i]
                    for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                        nx, ny = bx + dx, by + dy
                        if (nx, ny) not in seen and x0 <= nx <= x1 and y0 <= ny <= y1 and c.get(nx, ny)[:3] in (hx("window")[:3], hx("window_l")[:3]):
                            seen.add((nx, ny)); blob.append((nx, ny))
                    i += 1
                if len(blob) > 6:
                    for (bx, by) in blob:
                        if (bx - x0) % 3 == 0 and MODE["rng"].random() < .5:
                            c.px(bx, by, lit_col() or "window")
                        elif MODE["rng"].random() < .45:
                            col = lit_col()
                            if col:
                                c.px(bx, by, col)
                else:
                    col = lit_col()
                    if col:
                        for (bx, by) in blob:
                            c.px(bx, by, col)


def night_glass(c, x0, y0, x1, y1):
    for cy in range(y0 + 1, y1, 3):
        for cx in range(x0 + 1, x1, 3):
            col = lit_col()
            if col:
                for yy in range(cy, min(cy + 2, y1)):
                    for xx in range(cx, min(cx + 2, x1 + 1)):
                        if c.solid(xx, yy):
                            c.px(xx, yy, col)


def draw_part(W, H, R, p, seed):
    c = C(W, H + R, seed, R)
    x0, y0, x1, y1 = p.get("body") or body_default(W, H)
    up = p.get("up", 0)
    y0 -= up
    wr = p.get("wall_rows", 5) + (up if p.get("wall_rows", 5) > 0 else 0)
    roof = p.get("roof", "gable")
    rcol = p.get("roofc", "tile")
    rmat = p.get("rmat", "tile" if roof in ("gable", "hip", "pyramid") else None)
    wmat = p.get("wall", "plaster")
    wcol = p.get("wallc", wmat if wmat in P else "plaster")
    if wmat == "timber":
        wcol = "plaster"
    night = MODE["night"]
    info = {}
    if roof == "cone":
        cx, cy, r = cone_roof(c, x0, y0, x1, y1, rcol, p.get("wallc") if wr else None, rmat or "thatch")
        if p.get("door", "std") != "none":
            by = int(cy + r)
            c.rect(int(cx) - 1, by - 2, 2, 2, ("lit3" if MODE["rng"].random() < .7 else "black") if night else "black")
        info = {"ry1": y1, "wy0": y1 - 2, "wy1": y1}
    elif roof == "none":
        info = {"ry1": y0, "wy0": y0, "wy1": y1}
    else:
        wy0 = y1 - wr + 1
        ry1 = wy0 - 1
        info = {"ry1": ry1, "wy0": wy0, "wy1": y1}
        if wr > 0:
            wall_fill(c, x0, wy0, x1, y1, wmat, wcol, pitched=roof in ("gable", "hip", "pyramid", "tent"))
            if night and wmat == "glass":
                night_glass(c, x0, wy0, x1, y1 - 1)
            dk = p.get("door", "std")
            dbox = None
            if dk not in (None, "none"):
                width = x1 - x0 + 1
                dw = {"std": 3, "wide": 6, "double": 4, "glass": 4, "garage": 6, "arch": 3, "small": 2}.get(dk, 3)
                dx = x0 + (width - dw) // 2
                dbox = (dx - 1, y1 - 4, dx + dw, y1)
            windows(c, x0, x1, wy0, y1, p.get("win", "row"), dbox, c.rng, p.get("win_rows"))
            if night:
                night_windows(c, x0, wy0, x1, y1)
            doors = p.get("doors")
            if doors:
                for dxo in doors:
                    dc = p.get("doorc", "wood_d")
                    if night and MODE["era"] in ("Mo", "F", "I") and MODE["rng"].random() < .5:
                        dc = "lit3"
                    c.rect(x0 + dxo, y1 - min(3, wr - 1) + 1, 2, min(3, wr - 1), dc)
            else:
                box = door_draw(c, x0, x1, wy0, y1, dk, p.get("doorc"))
                if night and box and dk in ("glass", "double", "arch", "std", "wide"):
                    if dk == "glass" or MODE["rng"].random() < .6:
                        c.rect(box[0] + 1 if box[2] - box[0] > 1 else box[0], box[1] + 1, max(1, box[2] - box[0] - 1), box[3] - box[1], "lit2" if dk == "glass" else "lit3")
        if ry1 >= y0:
            roof_fill(c, x0, y0, x1, ry1, roof, rcol, rmat)
    for e in p.get("extras", []):
        extra(c, e, (x0, y0, x1, y1), info)
    if p.get("outline", True):
        c.outline(.45)
    return c, (x0, y0 + R, x1, y1 + R)


def composite(main, pc, shadow=True):
    if shadow:
        done = set()
        for y in range(pc.h):
            for x in range(pc.w):
                if pc.a[y, x, 3] > 200:
                    nx, ny = x + 1, y + 1
                    if nx < pc.w and ny < pc.h and pc.a[ny, nx, 3] == 0 and (nx, ny) not in done:
                        done.add((nx, ny))
                        if main.a[ny, nx, 3] == 255:
                            main.a[ny, nx] = shade(tuple(int(v) for v in main.a[ny, nx]), -.3)
                        elif main.a[ny, nx, 3] == 0:
                            main.a[ny, nx] = (0, 0, 0, 70)
    main.blit(pc, 0, 0)


def parts_of(spec):
    return spec["parts"] if "parts" in spec else ([spec] if any(k in spec for k in ("roof", "wall", "wall_rows")) else [])


def rise_of(spec):
    r = [spec.get("rise", 0)]
    for p in parts_of(spec):
        up = p.get("up", 0)
        r.append(up)
        if any(e[0] == "antenna" for e in p.get("extras", [])):
            y0 = (p.get("body") or (1, 1))[1]
            r.append(3 + up - y0)
    return max(r)


def render(spec, seed=1, night=False):
    from objs import draw_obj
    W, H = spec["fp"][0] * 16, spec["fp"][1] * 16
    R = rise_of(spec)
    MODE["night"] = night
    MODE["era"] = spec.get("era", "M")
    MODE["rng"] = random.Random(seed * 977 + 13)
    main = C(W, H + R, seed, R)
    for it in spec.get("items", []):
        ground_item(main, it)
    boxes = []
    layers = [("p", p) for p in parts_of(spec)] + [("o", o) for o in spec.get("objs", [])]
    for i, (kind, p) in enumerate(layers):
        if kind == "p":
            pc, box = draw_part(W, H, R, p, seed * 31 + i)
            boxes.append(box)
        else:
            pc = draw_obj(W, H + R, p, seed * 31 + i, R)
        composite(main, pc, shadow=spec.get("shadow", True))
    for it in spec.get("post", []):
        ground_item(main, it)
    if night:
        for e in spec.get("night", []):
            ground_item(main, e)
    if not boxes:
        boxes = [(b[0], b[1] + R, b[2], b[3] + R) for b in spec.get("boxes", [body_default(W, H)])]
    main.oy = 0
    MODE["night"] = False
    return main, boxes


def lights(spec, seed):
    img, _ = render(spec, seed, night=True)
    out = C(img.w, img.h)
    m = np.zeros((img.h, img.w), bool)
    for y in range(img.h):
        for x in range(img.w):
            if img.a[y, x, 3] and tuple(int(v) for v in img.a[y, x, :3]) in LIGHT_RGB:
                out.a[y, x] = img.a[y, x]
                m[y, x] = True
    if not m.any():
        return None
    for y in range(img.h):
        for x in range(img.w):
            if m[y, x]:
                continue
            n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < img.w and 0 <= y + dy < img.h and m[y + dy, x + dx])
            if n:
                out.a[y, x] = (250, 210, 120, 45 + 20 * n)
    return out


def st_construction(spec, boxes, seed):
    W = spec["fp"][0] * 16
    Ht = spec["fp"][1] * 16 + rise_of(spec)
    c = C(W, Ht, seed)
    pole = "wood_l" if spec.get("era") in ("T", "M", "G") else "yellow"
    for (x0, y0, x1, y1) in boxes:
        c.rect(x0, y0 + (y1 - y0) // 3, x1 - x0 + 1, (y1 - y0) * 2 // 3 + 1, "dirt_d")
        c.frame(x0, y0 + (y1 - y0) // 3, x1 - x0 + 1, (y1 - y0) * 2 // 3 + 1, "concrete_d")
        wr = max(3, (y1 - y0) // 3)
        wall_fill(c, x0, y1 - wr + 1, x1, y1, spec.get("wall", "wood") if spec.get("wall") in ("brick", "stone", "wood", "concrete", "log") else "wood", spec.get("wallc", "wood") if spec.get("wallc") in P else "wood", False)
        for x in range(x0, x1 + 1, 4):
            c.vline(x, y0 + 2, y1, pole)
        for y in range(y0 + 2, y1 + 1, 4):
            c.hline(x0, x1, y, pole)
        c.line(x0, y1, min(x1, x0 + (y1 - y0 - 2)), y0 + 2, shade(pole, -.2))
    if spec.get("era") in ("I", "Mo", "F") and W >= 32:
        c.vline(W - 4, 1, Ht - 4, "yellow")
        c.hline(3, W - 3, 2, "yellow")
        c.vline(5, 3, 6, "dgrey")
    c.outline(.35)
    return c


def st_damaged(img, seed):
    c = img.copy()
    c.rng = random.Random(seed)
    ops = [(x, y) for y in range(c.h) for x in range(c.w) if c.a[y, x, 3] == 255]
    if not ops:
        return c
    for i in range(max(3, len(ops) // 60)):
        x, y = c.rng.choice(ops)
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                if c.rng.random() < .6 and c.solid(x + dx, y + dy):
                    c.px(x + dx, y + dy, shade(c.get(x + dx, y + dy), -.55))
        c.px(x, y, "black")
    for i in range(max(2, len(ops) // 120)):
        x, y = c.rng.choice(ops)
        c.px(x, y, "fire")
    top = min(y for (x, y) in ops)
    for x in range(c.w):
        for y in range(top, top + 3):
            if c.solid(x, y) and c.rng.random() < .25:
                c.a[y, x] = (0, 0, 0, 0)
    return c


def st_rubble(img, spec, boxes, seed):
    W, H = img.w, img.h
    c = C(W, H, seed)
    cols = [tuple(int(v) for v in img.a[y, x]) for y in range(H) for x in range(W) if img.a[y, x, 3] == 255]
    if not cols:
        cols = [hx("stone")]
    cap = spec["fp"][1] * 16 * .5
    for (x0, y0, x1, y1) in boxes:
        cx = (x0 + x1) / 2
        hgt = min((y1 - y0) * .55, cap)
        for x in range(x0, x1 + 1):
            t = 1 - abs(x - cx) / ((x1 - x0) / 2 + 1)
            top = int(y1 - hgt * (0.4 + 0.6 * t) + _ri(c, -1, 1))
            for y in range(max(y0, top), y1 + 1):
                c.px(x, y, shade(c.rng.choice(cols), -.2 - c.rng.random() * .2))
        for i in range((x1 - x0) // 3):
            x = _ri(c, x0, x1 - 2)
            y = _ri(c, int(y1 - hgt), y1 - 1)
            c.hline(x, x + 2, y, "wood_d")
    c.outline(.35)
    out = C(W, H)
    composite(out, c)
    return out
