import random
from core import C, hx, shade, add
from bldg import ground_fill
from sets import mname

LOTS = {"paving": ("hard", "concrete_d", "M"), "asphalt": ("hard", "concrete", "I"), "gravel": ("soft", None, "M"), "dirt": ("soft", None, "T")}
N, E, S, W = 1, 2, 4, 8


def edge_dist(x, y, m):
    d = []
    if not m & N:
        d.append(y)
    if not m & S:
        d.append(15 - y)
    if not m & W:
        d.append(x)
    if not m & E:
        d.append(15 - x)
    return min(d) if d else 99


def corner_cut(x, y, m, r):
    for (bits, cx, cy) in ((N | W, 0, 0), (N | E, 15, 0), (S | W, 0, 15), (S | E, 15, 15)):
        if not m & (bits & (N | S)) and not m & (bits & (E | W)):
            if abs(x - cx) + abs(y - cy) < r:
                return True
    return False


def lot(kind, m):
    style, kerb, _ = LOTS[kind]
    c = C(16, 16, 40 + m)
    ground_fill(c, kind, 16, 16)
    rng = random.Random(m * 7 + len(kind))
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, m)
            if style == "hard":
                if corner_cut(x, y, m, 2):
                    c.a[y, x] = 0
                elif d == 0:
                    c.a[y, x] = hx(kerb)
                elif d == 1:
                    c.a[y, x] = shade(tuple(int(v) for v in c.a[y, x]), -.08)
            else:
                p = {0: .75, 1: .45, 2: .18, 3: .05}.get(d, 0)
                if corner_cut(x, y, m, 4):
                    p = max(p, .9)
                if rng.random() < p:
                    c.a[y, x] = 0
    return c


def build():
    for kind, (style, _, era) in LOTS.items():
        for m in range(16):
            add(f"lot_{kind}_{mname(m)}", "lots", f"lot_{kind}", lot(kind, m), era=era, tags=["autotile", f"mask{m}"],
                note="kerbed edge" if style == "hard" else "soft edge fades into terrain")
