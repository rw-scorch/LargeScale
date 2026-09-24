from core import C, hx, shade, mix, add, TEAM

DIRS = [(1, "N"), (2, "E"), (4, "S"), (8, "W")]


def mname(m):
    s = "".join(d for b, d in DIRS if m & b)
    return s or "dot"


def arms(m, half, fn):
    lo, hi = 8 - half, 7 + half
    fn(lo, lo, hi, hi, "c")
    if m & 1:
        fn(lo, 0, hi, lo - 1, "v")
    if m & 4:
        fn(lo, hi + 1, hi, 15, "v")
    if m & 2:
        fn(hi + 1, lo, 15, hi, "h")
    if m & 8:
        fn(0, lo, lo - 1, hi, "h")


def road(kind, m):
    c = C(16, 16, m)
    spec = {"dirt": (4, "dirt_l"), "cobble": (4, "stone"), "paved": (5, "asphalt"), "highway": (7, "asphalt"), "mountain": (3, "dirt")}[kind]
    half, col = spec

    def fill(x0, y0, x1, y1, o):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                v = hx(col)
                if kind == "cobble" and ((x % 3 == 0) ^ (y % 2 == 0)) and (x + y) % 2 == 0:
                    v = shade(col, -.15)
                if kind in ("dirt", "mountain"):
                    v = shade(col, -.06) if (x * 7 + y * 3) % 5 == 0 else v
                c.px(x, y, v)
    arms(m, half, fill)
    lo, hi = 8 - half, 7 + half

    def edges(x0, y0, x1, y1, o):
        ec = {"dirt": shade(col, -.2), "cobble": shade(col, -.3), "paved": hx("concrete"), "highway": hx("line"), "mountain": hx("stone_d")}[kind]
        if o == "h":
            c.hline(x0, x1, y0, ec); c.hline(x0, x1, y1, ec)
        elif o == "v":
            c.vline(x0, y0, y1, ec); c.vline(x1, y0, y1, ec)
    arms(m, half, edges)
    ec = {"dirt": shade(col, -.2), "cobble": shade(col, -.3), "paved": hx("concrete"), "highway": hx("line"), "mountain": hx("stone_d")}[kind]
    for (b, cx, cy, horiz) in ((1, None, lo, True), (4, None, hi, True), (2, hi, None, False), (8, lo, None, False)):
        if not m & b:
            if horiz:
                c.hline(lo, hi, cy, ec)
            else:
                c.vline(cx, lo, hi, ec)
    straight_v = m == 5
    straight_h = m == 10
    if kind == "paved":
        if straight_v:
            for y in range(0, 16, 4):
                c.vline(7, y, y + 1, "yline")
        if straight_h:
            for x in range(0, 16, 4):
                c.hline(x, x + 1, 7, "yline")
    if kind == "highway":
        if straight_v:
            c.vline(7, 0, 15, "concrete_l"); c.vline(8, 0, 15, "concrete_d")
            for y in range(0, 16, 4):
                c.px(4, y, "line"); c.px(11, y, "line")
        if straight_h:
            c.hline(0, 15, 7, "concrete_l"); c.hline(0, 15, 8, "concrete_d")
            for x in range(0, 16, 4):
                c.px(x, 4, "line"); c.px(x, 11, "line")
    if kind == "mountain":
        for y in range(16):
            for x in range(16):
                if not c.solid(x, y):
                    continue
                edge = not (c.solid(x - 1, y) and c.solid(x + 1, y) and c.solid(x, y - 1) and c.solid(x, y + 1))
                if edge and (x * 5 + y * 3) % 4 == 0:
                    c.px(x, y, "stone_d" if (x + y) % 2 else "stone")
        for i in range(6):
            x, y = c.rng.randrange(16), c.rng.randrange(16)
            if c.solid(x, y):
                c.px(x, y, "stone")
    if kind == "dirt":
        if straight_v:
            c.vline(6, 0, 15, "dirt"); c.vline(9, 0, 15, "dirt")
        if straight_h:
            c.hline(0, 15, 6, "dirt"); c.hline(0, 15, 9, "dirt")
    return c


def rail(m):
    c = C(16, 16, m)
    lo, hi = 4, 11

    def sleepers(x0, y0, x1, y1, o):
        if o == "v":
            for y in range(y0, y1 + 1, 3):
                c.hline(lo, hi, y, "wood_d")
        elif o == "h":
            for x in range(x0, x1 + 1, 3):
                c.vline(x, lo, hi, "wood_d")
        else:
            c.rect(lo, lo, 8, 8, "stone_d")
    arms(m, 4, lambda x0, y0, x1, y1, o: c.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, "stone"))
    arms(m, 4, sleepers)

    def rails(x0, y0, x1, y1, o):
        if o == "v":
            c.vline(5, y0, y1, "metal_l"); c.vline(10, y0, y1, "metal_l")
        elif o == "h":
            c.hline(x0, x1, 5, "metal_l"); c.hline(x0, x1, 10, "metal_l")
    arms(m, 4, rails)
    if m & 5 and not m & 10:
        c.vline(5, 4, 11, "metal_l"); c.vline(10, 4, 11, "metal_l")
    if m & 10 and not m & 5:
        c.hline(4, 11, 5, "metal_l"); c.hline(4, 11, 10, "metal_l")
    if m & 5 and m & 10:
        c.vline(5, 4, 11, "metal_l"); c.vline(10, 4, 11, "metal_l")
        c.hline(4, 11, 5, "metal_l"); c.hline(4, 11, 10, "metal_l")
    return c


def wall(kind, m):
    c = C(16, 16, m)
    half = 3
    col = {"palisade": "wood", "stone": "stone", "concrete": "concrete", "barbed": "metal_d", "trench": "dirt_d"}[kind]

    def body(x0, y0, x1, y1, o):
        if kind == "barbed":
            return
        if kind == "trench":
            c.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, "dirt_d")
            return
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                v = hx(col)
                if kind == "palisade" and x % 2 == 0:
                    v = shade(col, -.15)
                if kind == "stone" and ((y % 3 == 0) or (x + (y // 3) * 2) % 4 == 0):
                    v = shade(col, -.12)
                if kind == "concrete" and (x % 5 == 0 and o == "h" or y % 5 == 0 and o == "v"):
                    v = shade(col, -.15)
                c.px(x, y, v)
    arms(m, half, body)
    if kind in ("palisade", "stone", "concrete"):
        c.outline(.4)
        for y in range(16):
            for x in range(16):
                if c.solid(x, y) and not c.solid(x, y - 1):
                    c.px(x, y, shade(col, .25))
        if kind == "stone":
            for y in range(16):
                for x in range(16):
                    if c.solid(x, y) and not c.solid(x, y - 1) and x % 2 == 0:
                        c.px(x, y, shade(col, .45))
        if kind == "palisade":
            for y in range(16):
                for x in range(16):
                    if c.solid(x, y) and not c.solid(x, y - 1) and x % 2 == 1:
                        c.px(x, y, "wood_l")
    elif kind == "barbed":
        def wire(x0, y0, x1, y1, o):
            if o == "h":
                for x in range(x0, x1 + 1):
                    c.px(x, 6 + (x % 2), "metal_d"); c.px(x, 9 - (x % 2), "metal_d")
                    if x % 4 == 1:
                        c.vline(x, 5, 10, "wood_d")
            elif o == "v":
                for y in range(y0, y1 + 1):
                    c.px(6 + (y % 2), y, "metal_d"); c.px(9 - (y % 2), y, "metal_d")
                    if y % 4 == 1:
                        c.hline(5, 10, y, "wood_d")
            else:
                c.rect(6, 6, 4, 4, "metal_d"); c.rect(7, 7, 2, 2, "wood_d")
        arms(m, half, wire)
    elif kind == "trench":
        def bags(x0, y0, x1, y1, o):
            if o == "h":
                for x in range(x0, x1 + 1, 2):
                    c.px(x, y0 - 1, "khaki"); c.px(x + 1, y0 - 1, "sand_d")
                    c.px(x, y1 + 1, "khaki"); c.px(x + 1, y1 + 1, "sand_d")
            elif o == "v":
                for y in range(y0, y1 + 1, 2):
                    c.px(x0 - 1, y, "khaki"); c.px(x0 - 1, y + 1, "sand_d")
                    c.px(x1 + 1, y, "khaki"); c.px(x1 + 1, y + 1, "sand_d")
        arms(m, half, bags)
        arms(m, half - 1, lambda x0, y0, x1, y1, o: c.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, "mud_d"))
    return c


def bridge(kind, o):
    c = C(16, 16, 3)
    deck = {"wood": "wood_l", "stone": "stone", "steel": "asphalt", "suspension": "asphalt"}[kind]
    rail_c = {"wood": "wood_d", "stone": "stone_l", "steel": "metal", "suspension": "red"}[kind]
    if o == "h":
        c.rect(0, 4, 16, 8, deck)
        if kind == "wood":
            for x in range(0, 16, 2):
                c.vline(x, 4, 11, "wood")
        if kind in ("steel", "suspension"):
            for x in range(0, 16, 4):
                c.hline(x, x + 1, 8, "line")
        c.hline(0, 15, 3, rail_c); c.hline(0, 15, 12, rail_c)
        if kind == "steel":
            for x in range(0, 16, 4):
                c.line(x, 2, x + 3, 3, "metal_d"); c.line(x, 13, x + 3, 12, "metal_d")
        if kind == "suspension":
            for x in range(0, 16, 3):
                c.px(x, 2, "lgrey"); c.px(x, 13, "lgrey")
        if kind == "stone":
            c.hline(0, 15, 13, (0, 0, 0, 70))
    else:
        c.rect(4, 0, 8, 16, deck)
        if kind == "wood":
            for y in range(0, 16, 2):
                c.hline(4, 11, y, "wood")
        if kind in ("steel", "suspension"):
            for y in range(0, 16, 4):
                c.vline(8, y, y + 1, "line")
        c.vline(3, 0, 15, rail_c); c.vline(12, 0, 15, rail_c)
        if kind == "steel":
            for y in range(0, 16, 4):
                c.line(2, y, 3, y + 3, "metal_d"); c.line(13, y, 12, y + 3, "metal_d")
        if kind == "suspension":
            for y in range(0, 16, 3):
                c.px(2, y, "lgrey"); c.px(13, y, "lgrey")
        if kind == "stone":
            c.vline(13, 0, 15, (0, 0, 0, 70))
    return c


def bridge_tower(kind):
    c = C(16, 16, 4)
    col = "red" if kind == "suspension" else "metal"
    c.rect(2, 2, 3, 12, col); c.rect(11, 2, 3, 12, col)
    c.rect(2, 2, 12, 2, col)
    c.rect(5, 4, 6, 10, "asphalt")
    c.outline(.4)
    return c


def airfield_piece(name):
    c = C(16, 16, 5)
    if name.startswith("runway"):
        horiz = name.endswith(("_h", "_e", "_w"))
        c.rect(0, 0, 16, 16, "asphalt")
        if horiz:
            c.hline(0, 15, 1, "line"); c.hline(0, 15, 14, "line")
            if name.endswith("_h"):
                for x in range(0, 16, 6):
                    c.hline(x, x + 2, 7, "line"); c.hline(x, x + 2, 8, "line")
            else:
                x = 2 if name.endswith("_w") else 10
                for y in range(3, 13, 2):
                    c.hline(x, x + 3, y, "line")
        else:
            c.vline(1, 0, 15, "line"); c.vline(14, 0, 15, "line")
            if name.endswith("_v"):
                for y in range(0, 16, 6):
                    c.vline(7, y, y + 2, "line"); c.vline(8, y, y + 2, "line")
            else:
                y = 2 if name.endswith("_n") else 10
                for x in range(3, 13, 2):
                    c.vline(x, y, y + 3, "line")
    elif name.startswith("taxiway"):
        if name.endswith("_h"):
            c.rect(0, 3, 16, 10, "asphalt_l"); c.hline(0, 15, 7, "yline")
        elif name.endswith("_v"):
            c.rect(3, 0, 10, 16, "asphalt_l"); c.vline(7, 0, 15, "yline")
        else:
            c.rect(0, 3, 16, 10, "asphalt_l"); c.rect(3, 0, 10, 16, "asphalt_l")
            c.hline(0, 15, 7, "yline"); c.vline(7, 0, 15, "yline")
    elif name == "apron":
        c.rect(0, 0, 16, 16, "concrete")
        c.hline(0, 15, 0, "concrete_d"); c.vline(0, 0, 15, "concrete_d")
        c.vline(8, 2, 13, "yline"); c.hline(5, 11, 13, "yline")
    return c


def line_piece(kind, o):
    c = C(16, 16, 6)
    if kind == "pipeline":
        if o == "h":
            c.rect(0, 6, 16, 3, "metal"); c.hline(0, 15, 6, "metal_l"); c.hline(0, 15, 8, "metal_d")
            c.rect(7, 5, 2, 5, "metal_d")
        else:
            c.rect(6, 0, 3, 16, "metal"); c.vline(6, 0, 15, "metal_l"); c.vline(8, 0, 15, "metal_d")
            c.rect(5, 7, 5, 2, "metal_d")
    else:
        if o == "h":
            c.hline(0, 15, 5, "black"); c.hline(0, 15, 10, "black")
            c.px(4, 11, (0, 0, 0, 50)); c.px(11, 12, (0, 0, 0, 50))
        else:
            c.vline(5, 0, 15, "black"); c.vline(10, 0, 15, "black")
    return c


CROPS = {"wheat": ("green_l", "gold"), "rice": ("green", "hay"), "corn": ("green_d", "yellow"), "vegetables": ("leaf", "orange"), "cotton": ("green", "white"), "potatoes": ("leaf_d", "leaf_l")}


def crop(name, stage):
    c = C(16, 16, stage * 11 + len(name))
    grow, ripe = CROPS[name]
    base = "water" if name == "rice" else "dirt"
    c.rect(0, 0, 16, 16, base)
    for y in range(1, 16, 3):
        c.hline(0, 15, y, "dirt_d" if name != "rice" else "water_d")
        c.hline(0, 15, y + 1, "dirt_l" if name != "rice" else "water_l")
    if stage == 0:
        return c
    for y in range(1, 16, 3):
        for x in range(1 if y % 2 else 0, 16, 2):
            if stage == 1:
                if (x + y) % 4 == 1:
                    c.px(x, y, grow)
            elif stage == 2:
                c.px(x, y, grow); c.px(x, y - 1, shade(grow, .2))
            else:
                if name == "wheat":
                    c.px(x, y, "gold"); c.px(x, y - 1, "yellow"); c.px(x + 1, y, "gold_d")
                elif name == "rice":
                    c.px(x, y, "hay"); c.px(x, y - 1, "green_l")
                elif name == "corn":
                    c.px(x, y, "green_d"); c.px(x, y - 1, "green"); c.px(x + 1, y - 1, "yellow")
                elif name == "vegetables":
                    c.px(x, y, "leaf"); c.px(x, y - 1, c.rng.choice(["orange", "red", "leaf_l", "purple"]))
                elif name == "cotton":
                    c.px(x, y, "green"); c.px(x, y - 1, "white")
                elif name == "potatoes":
                    c.px(x, y, "leaf_d"); c.px(x, y - 1, "leaf_l")
    return c


def build():
    for kind in ("dirt", "cobble", "paved", "highway", "mountain"):
        era = {"dirt": "T", "cobble": "M", "paved": "I", "highway": "Mo", "mountain": "M"}[kind]
        for m in range(16):
            add(f"road_{kind}_{mname(m)}", "transport", f"road_{kind}", road(kind, m), era=era, tags=["autotile", f"mask{m}"])
    for m in range(16):
        add(f"rail_{mname(m)}", "transport", "rail", rail(m), era="I", tags=["autotile", f"mask{m}"])
    for kind in ("palisade", "stone", "concrete", "barbed", "trench"):
        era = {"palisade": "T", "stone": "M", "concrete": "Mo", "barbed": "I", "trench": "I"}[kind]
        for m in range(16):
            add(f"wall_{kind}_{mname(m)}", "military", f"wall_{kind}", wall(kind, m), era=era, tags=["autotile", f"mask{m}"])
    for kind in ("wood", "stone", "steel", "suspension"):
        era = {"wood": "T", "stone": "M", "steel": "I", "suspension": "Mo"}[kind]
        for o in ("h", "v"):
            add(f"bridge_{kind}_{o}", "transport", "bridges", bridge(kind, o), era=era)
        if kind in ("steel", "suspension"):
            add(f"bridge_{kind}_tower", "transport", "bridges", bridge_tower(kind), era=era)
    for n in ("runway_h", "runway_e", "runway_w", "runway_v", "runway_n", "runway_s", "taxiway_h", "taxiway_v", "taxiway_x", "apron"):
        add(n, "transport", "airport_pieces", airfield_piece(n), era="I")
    for k in ("pipeline", "powerline"):
        for o in ("h", "v"):
            add(f"{k}_{o}", "energy", "lines", line_piece(k, o), era="I")
    for n in CROPS:
        for s in range(4):
            add(f"crop_{n}_{s}", "agriculture", "crops", crop(n, s), era="T" if n in ("wheat", "rice", "vegetables", "potatoes") else "M", frame=s, tags=["growth"])
