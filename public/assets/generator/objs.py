from core import C, hx, shade, mix, TEAM


def cyl(c, cx, top, r, h, col):
    ry = max(1.5, r * .55)
    c.ellipse(cx, top + ry + h, r, ry, shade(col, -.3))
    for y in range(int(top + ry), int(top + ry + h) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if abs(x + .5 - cx) <= r:
                t = (x + .5 - cx) / r
                c.px(x, y, shade(col, .12 - t * .32))
    c.ellipse(cx, top + ry, r, ry, shade(col, .22))
    c.ellipse(cx, top + ry, r - 1.2, ry - .8, shade(col, .05))


def cooling(c, cx, top, r, h):
    col = "concrete_l"
    for y in range(int(top + r), int(top + r + h)):
        t = (y - top - r) / h
        rr = r * (1 - .18 * (1 - abs(t - .55) / .55))
        for x in range(int(cx - rr), int(cx + rr) + 1):
            s = (x + .5 - cx) / rr
            c.px(x, y, shade(col, .1 - s * .3))
    ry = r * .55
    c.ellipse(cx, top + r, r, ry, shade(col, .1))
    c.ellipse(cx, top + r, r - 1.5, ry - 1, "dgrey")


def crane(c, x, y, h, arm, col="yellow"):
    c.vline(x, y, y + h, col)
    c.vline(x + 1, y, y + h, shade(col, -.3))
    for yy in range(y, y + h, 2):
        c.px(x + 1, yy, col)
    c.hline(x - 2, x + arm, y, col)
    c.hline(x - 2, x + arm, y + 1, shade(col, -.3))
    c.rect(x - 3, y, 2, 2, "dgrey")
    c.vline(x + arm - 1, y + 2, y + 4, "black")


def dish(c, cx, cy, r):
    c.disc(cx, cy, r, "offwhite", shade_top=.3)
    c.ring(cx, cy, r, "lgrey")
    c.disc(cx, cy, 1, "dgrey")
    c.line(cx, cy, cx + r * .6, cy - r * .6, "dgrey")


def lattice(c, x, y, w, h, col="metal"):
    c.vline(x, y, y + h, col)
    c.vline(x + w, y, y + h, col)
    for yy in range(y, y + h, 3):
        c.line(x, yy, x + w, yy + 3, shade(col, -.2))
        c.hline(x, x + w, yy, col)


def turbine(c, cx, cy, r=7, ang=0):
    import math
    for i in range(3):
        a = ang + i * 2.094
        x1, y1 = cx + math.cos(a) * r, cy + math.sin(a) * r
        c.line(cx, cy, x1, y1, "white")
        c.line(cx + math.cos(a + 1.57) * .8, cy + math.sin(a + 1.57) * .8, (cx + x1) / 2 + math.cos(a + 1.57) * .8, (cy + y1) / 2 + math.sin(a + 1.57) * .8, "offwhite")
        c.px(x1, y1, "red")
    c.rect(cx - 1, cy - 1, 4, 3, "lgrey")
    c.px(cx - 1, cy - 1, "white")
    c.disc(cx - .5, cy + .5, 1.2, "offwhite")


def derrick(c, x, y, h, col="wood"):
    w = h // 2
    c.line(x, y + h, x + w // 2, y, col)
    c.line(x + w, y + h, x + w // 2, y, col)
    for yy in range(y + 3, y + h, 3):
        t = (yy - y) / h
        c.hline(int(x + w / 2 - t * w / 2), int(x + w / 2 + t * w / 2), yy, shade(col, -.15))
    c.px(x + w // 2, y, "black")


def pumpjack(c, x, y):
    c.rect(x, y + 6, 8, 2, "dgrey")
    c.line(x + 2, y + 6, x + 4, y + 2, "metal_d")
    c.line(x + 6, y + 6, x + 4, y + 2, "metal_d")
    c.line(x, y + 1, x + 8, y + 3, "orange")
    c.rect(x - 1, y, 2, 3, "orange")


def tank_sphere(c, cx, cy, r, col="offwhite"):
    c.vline(int(cx - r + 1), int(cy), int(cy + r + 1), "dgrey")
    c.vline(int(cx + r - 1), int(cy), int(cy + r + 1), "dgrey")
    c.disc(cx, cy, r, col, shade_top=.4)


def tree(c, x, y, col="leaf", r=2.5):
    c.disc(x + .5, y + .5, r, shade(col, -.3))
    c.disc(x + .2, y + .2, r - .7, col)
    c.px(int(x - r / 3), int(y - r / 3), shade(col, .3))


def pine(c, x, y, h=6, col="pine"):
    for i in range(h):
        w = (i + 1) // 2 + 1 if i < h - 1 else 0
        c.hline(x - w, x + w, y + i, col if i % 2 == 0 else shade(col, -.15))
    c.px(x, y + h, "wood_d")


def boat_small(c, x, y, col="wood", sail=False):
    c.hline(x + 1, x + 5, y, shade(col, .1))
    c.hline(x, x + 6, y + 1, col)
    c.hline(x + 1, x + 5, y + 2, shade(col, -.2))
    if sail:
        c.vline(x + 3, y - 4, y, "wood_d")
        c.rect(x + 1, y - 4, 2, 3, "canvas")


def ring_track(c, cx, cy, rx, ry, col):
    import math
    for i in range(160):
        a = i / 160 * 6.283
        c.px(cx + math.cos(a) * rx, cy + math.sin(a) * ry, col)


def ferris(c, cx, cy, r):
    import math
    c.ring(cx, cy, r, "red")
    for i in range(8):
        a = i * .785
        c.line(cx, cy, cx + math.cos(a) * r, cy + math.sin(a) * r, "lgrey")
        c.px(cx + math.cos(a) * r, cy + math.sin(a) * r, "yellow")
    c.line(cx - 3, cy + r + 2, cx, cy, "dgrey")
    c.line(cx + 3, cy + r + 2, cx, cy, "dgrey")


def obelisk(c, x, y, h, col="stone_l"):
    for i in range(h):
        w = 1 if i > 1 else 0
        c.hline(x - w, x + w, y + i, col if i % 3 else shade(col, -.1))
    c.hline(x - 2, x + 2, y + h, shade(col, -.2))
    c.px(x, y, "gold")


def statue(c, x, y, col="stone_l"):
    c.rect(x - 2, y + 6, 5, 3, "stone_d")
    c.rect(x - 1, y + 2, 3, 4, col)
    c.disc(x + .5, y + 1.2, 1.2, col)
    c.px(x + 2, y + 1, col)
    c.px(x + 2, y, col)


def fountain(c, cx, cy, r):
    c.disc(cx, cy, r, "stone_l")
    c.disc(cx, cy, r - 1, "water_l")
    c.disc(cx, cy, 1, "white")


def draw_obj(W, H, o, seed, oy=0):
    c = C(W, H, seed, oy)
    k, a = o[0], o[1:]
    fn = {"cyl": cyl, "cooling": cooling, "crane": crane, "dish": dish, "lattice": lattice, "turbine": turbine,
          "derrick": derrick, "pumpjack": pumpjack, "sphere": tank_sphere, "tree": tree, "pine": pine,
          "boat": boat_small, "ring": ring_track, "ferris": ferris, "obelisk": obelisk, "statue": statue,
          "fountain": fountain}[k]
    fn(c, *a)
    if k not in ("ring",):
        c.outline(.4)
    return c
