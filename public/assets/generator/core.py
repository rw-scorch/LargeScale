import numpy as np
import random

TEAM = ["#ff00ff", "#c000c0", "#800080"]
TEAM_PREVIEW = ["#4f8fe0", "#2f63b0", "#1d3d73"]
TEAM_RGB = {(255, 0, 255), (192, 0, 192), (128, 0, 128)}

P = {
    "ink": "#1b1a24", "shadow": "#000000",
    "white": "#f4f1e8", "offwhite": "#dcd6c6", "lgrey": "#a9a9a9", "grey": "#7a7a80", "dgrey": "#4c4c55", "black": "#26252d",
    "straw": "#d8b456", "straw_d": "#a9853a", "thatch": "#c49a45",
    "mud": "#9a6f45", "mud_d": "#74502f", "clay": "#b86a45",
    "wood": "#8b5a33", "wood_l": "#a8733f", "wood_d": "#5e3a22",
    "stone": "#9c978c", "stone_l": "#bcb7aa", "stone_d": "#6f6a62",
    "slate": "#556070", "slate_l": "#6c7a8c",
    "tile": "#b24a34", "tile_l": "#cf6a48", "tile_d": "#86331f",
    "brick": "#a4462f", "brick_l": "#bf5a3c", "brick_d": "#7a2f1f",
    "plaster": "#e2d6b8", "plaster_d": "#c2b491",
    "concrete": "#b0aea6", "concrete_d": "#8c8a83", "concrete_l": "#cac8c0",
    "metal": "#8f9aa3", "metal_d": "#66707a", "metal_l": "#b5bec5",
    "glass": "#5a8fb8", "glass_l": "#8fc0e0", "glass_d": "#35607f",
    "window": "#2b3a55", "window_l": "#6f8fb5", "lit": "#f2d36b", "lit2": "#f8e6a0", "lit3": "#f0a850", "beacon": "#ff4a3a",
    "canvas": "#e8dcc0", "canvas_d": "#c4b594",
    "red": "#c4403a", "red_d": "#8e2a26", "orange": "#e0873a", "yellow": "#e8c84a", "gold": "#e0b53a", "gold_d": "#a8811f",
    "green": "#5f9e45", "green_d": "#3f7131", "green_l": "#86c064", "lawn": "#6fae4f", "lawn_d": "#5a9540",
    "teal": "#3f9a95", "blue": "#3f6fb5", "navy": "#2a3f6a", "purple": "#7a4fa0", "pink": "#d86a9a",
    "water": "#3a78b0", "water_l": "#5d9bd0", "water_d": "#285a8a",
    "dirt": "#8a6a45", "dirt_l": "#a3825a", "dirt_d": "#6b5033",
    "sand": "#dcc68a", "sand_d": "#bfa56a",
    "asphalt": "#4a4a50", "asphalt_l": "#5c5c63", "line": "#e8e2c8", "yline": "#e2c040",
    "neon": "#e04fd0", "neon2": "#4fe0d8", "fire": "#f08a2a", "fire_l": "#f8d050", "smoke": "#8a8a90",
    "leaf": "#4f8a3a", "leaf_l": "#6fae4f", "leaf_d": "#35652a", "pine": "#2f6a45", "pine_d": "#1f4a30",
    "snow": "#eef3f7", "snow_d": "#c9d6e0", "ice": "#bfe0f0",
    "hay": "#d8c060", "skin": "#e0b088", "skin_d": "#b8835a", "hair": "#4a3020",
    "olive": "#6b7a3a", "olive_d": "#4d5a28", "khaki": "#a89a60", "camo": "#5a6a3a",
}


def hx(c, a=255):
    if isinstance(c, tuple):
        return c if len(c) == 4 else (*c, a)
    c = P.get(c, c).lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def shade(c, f):
    r, g, b, a = hx(c)
    if f >= 0:
        return (int(r + (255 - r) * f), int(g + (255 - g) * f), int(b + (255 - b) * f), a)
    f = -f
    return (int(r * (1 - f)), int(g * (1 - f)), int(b * (1 - f)), a)


def mix(c1, c2, t):
    a, b = hx(c1), hx(c2)
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


class C:
    def __init__(self, w, h, seed=0, oy=0):
        self.w, self.h = w, h
        self.oy = oy
        self.a = np.zeros((h, w, 4), dtype=np.uint8)
        self.rng = random.Random(seed)

    def px(self, x, y, c):
        x, y = int(x), int(y) + self.oy
        if 0 <= x < self.w and 0 <= y < self.h and c is not None:
            col = hx(c)
            if col[3] == 255 or self.a[y, x, 3] == 0:
                self.a[y, x] = col
            else:
                base = self.a[y, x].astype(float)
                t = col[3] / 255
                self.a[y, x, :3] = (base[:3] * (1 - t) + np.array(col[:3]) * t).astype(np.uint8)
                self.a[y, x, 3] = max(base[3], col[3])

    def get(self, x, y):
        x, y = int(x), int(y) + self.oy
        if 0 <= x < self.w and 0 <= y < self.h:
            return tuple(int(v) for v in self.a[y, x])
        return (0, 0, 0, 0)

    def solid(self, x, y):
        return self.get(x, y)[3] > 0

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def frame(self, x, y, w, h, c):
        for xx in range(x, x + w):
            self.px(xx, y, c); self.px(xx, y + h - 1, c)
        for yy in range(y, y + h):
            self.px(x, yy, c); self.px(x + w - 1, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(int(x0), int(x1) + 1):
            self.px(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(int(y0), int(y1) + 1):
            self.px(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def disc(self, cx, cy, r, c, shade_top=None):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                d = ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2) ** .5
                if d <= r:
                    if shade_top is not None:
                        t = ((x + .5 - cx) + (y + .5 - cy)) / (2 * r + .01)
                        self.px(x, y, shade(c, -t * shade_top) if t > 0 else shade(c, -t * shade_top * .8))
                    else:
                        self.px(x, y, c)

    def ring(self, cx, cy, r, c, th=1):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                d = ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2) ** .5
                if r - th < d <= r:
                    self.px(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1:
                    self.px(x, y, c)

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            yc = y + .5
            xs = []
            n = len(pts)
            for i in range(n):
                x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % n]
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[i])), int(round(xs[i + 1]))):
                    self.px(x, y, c)

    def noise(self, x, y, w, h, c, amt=0.08, density=0.35):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if self.solid(xx, yy) and self.rng.random() < density:
                    cur = self.get(xx, yy)
                    self.a[yy + self.oy, xx] = shade(cur, self.rng.choice([-amt, amt]))

    def outline(self, darken=0.55, only_outer=True):
        src = self.a.copy()
        h, w = self.h, self.w
        for y in range(h):
            for x in range(w):
                if src[y, x, 3] == 0:
                    continue
                edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h) or src[ny, nx, 3] == 0:
                        edge = True
                        break
                if edge:
                    cur = tuple(int(v) for v in src[y, x])
                    if cur[:3] in TEAM_RGB:
                        self.a[y, x] = hx(TEAM[2])
                    else:
                        self.a[y, x] = shade(cur, -darken)

    def outline_outer(self, col="ink"):
        src = self.a[:, :, 3] > 0
        c = hx(col)
        for y in range(self.h):
            for x in range(self.w):
                if src[y, x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[ny, nx] and self.a[ny, nx, 3] > 100:
                        self.a[y, x] = c
                        break

    def drop_shadow(self, dx=1, dy=1, alpha=70):
        src = self.a.copy()
        for y in range(self.h):
            for x in range(self.w):
                if src[y, x, 3] > 200:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and self.a[ny, nx, 3] == 0:
                        self.a[ny, nx] = (0, 0, 0, alpha)

    def blit(self, other, ox, oy):
        keep, self.oy = self.oy, 0
        self._blit(other, ox, oy)
        self.oy = keep

    def _blit(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                if other.a[y, x, 3]:
                    self.px(ox + x, oy + y, tuple(int(v) for v in other.a[y, x]))

    def flipx(self):
        n = C(self.w, self.h)
        n.a = self.a[:, ::-1].copy()
        return n

    def copy(self):
        n = C(self.w, self.h)
        n.a = self.a.copy()
        return n

    def silhouette(self, col=(0, 0, 0), alpha=90):
        n = C(self.w, self.h)
        m = self.a[:, :, 3] > 0
        n.a[m] = (*col, alpha)
        return n


REG = []


def add(sid, cat, group, img, era=None, fp=(1, 1), state=None, frame=None, tags=None, note=None, family=None, rise=0, lot=None):
    REG.append({"id": sid, "cat": cat, "group": group, "era": era, "fp": list(fp), "state": state, "frame": frame,
                "tags": tags or [], "note": note, "img": img, "family": family, "rise": rise, "lot": lot})


LIGHTS = ["#ff4a3a", "#f2d36b", "#f8e6a0", "#f0a850", "#e04fd0", "#4fe0d8", "#f08a2a", "#f8d050", "#e0602a"]
LIGHT_RGB = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in LIGHTS}


ERAS = {"T": "Tribal", "M": "Medieval", "G": "Gunpowder", "I": "Industrial", "Mo": "Modern", "F": "Future"}
