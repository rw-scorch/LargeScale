from core import C, hx, shade, mix, add, TEAM

T0, T1, T2 = TEAM


def hull(c, x, y, w, h, col, rnd=True):
    c.rect(x, y, w, h, col)
    c.hline(x, x + w - 1, y, shade(col, .2))
    c.hline(x, x + w - 1, y + h - 1, shade(col, -.25))
    if rnd:
        for (px, py) in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
            c.a[py, px] = 0


def tracks(c, x, y, w, col="dgrey"):
    for yy in (y, y + 9):
        c.rect(x, yy, w, 2, col)
        for xx in range(x, x + w, 2):
            c.px(xx, yy, "black")


def wheels(c, xs, y0, y1):
    for x in xs:
        c.rect(x, y0, 2, 1, "black"); c.rect(x, y1, 2, 1, "black")


def horse_top(c, x, y, col="wood"):
    c.rect(x, y, 5, 2, col); c.rect(x + 5, y, 2, 2, shade(col, -.15)); c.px(x + 7, y, "black")
    c.px(x - 1, y + 1, "wood_d")


def v_hand_cart():
    c = C(16, 16); hull(c, 4, 5, 7, 6, "wood_l"); c.rect(5, 6, 5, 4, "wood"); wheels(c, [6], 4, 11); c.line(11, 7, 14, 7, "wood_d"); c.line(11, 8, 14, 8, "wood_d")
    return c


def v_horse_wagon():
    c = C(16, 16); hull(c, 1, 4, 8, 8, "wood_l"); c.rect(2, 5, 6, 6, "canvas"); c.hline(2, 7, 7, "canvas_d"); wheels(c, [2, 6], 3, 12)
    horse_top(c, 10, 5); horse_top(c, 10, 9, "wood_d"); return c


def v_supply_wagon():
    c = v_horse_wagon(); c.rect(3, 6, 4, 4, "wood"); c.px(4, 7, "wood_d"); c.px(3, 5, T0); c.px(4, 5, T0); return c


def v_chariot():
    c = C(16, 16); hull(c, 2, 5, 5, 6, "wood"); c.rect(3, 6, 3, 4, T0); wheels(c, [3], 4, 11); horse_top(c, 8, 5); horse_top(c, 8, 9, "wood_d"); return c


def v_catapult():
    c = C(16, 16); hull(c, 2, 4, 11, 8, "wood"); c.rect(3, 5, 9, 6, "wood_l"); c.line(4, 8, 13, 8, "wood_d"); c.disc(13, 8, 1.5, "stone_d"); wheels(c, [3, 10], 3, 12); c.px(2, 5, T0); return c


def v_trebuchet():
    c = C(16, 16); hull(c, 1, 3, 12, 10, "wood"); c.rect(2, 4, 10, 8, "wood_l"); c.line(2, 8, 15, 8, "wood_d"); c.rect(2, 6, 3, 4, "stone_d"); c.px(12, 5, T0); c.px(13, 5, T0); return c


def v_cannon():
    c = C(16, 16); c.rect(3, 6, 4, 4, "wood"); wheels(c, [4], 5, 10); c.rect(5, 7, 9, 2, "black"); c.hline(5, 13, 7, "dgrey"); c.px(3, 8, T0); return c


def v_horse_artillery():
    c = v_cannon(); c2 = C(16, 16); c2.blit(c, -3, 0); horse_top(c2, 10, 5); horse_top(c2, 10, 9, "wood_d"); return c2


def v_armoured_car():
    c = C(16, 16); hull(c, 2, 4, 12, 8, "olive"); c.rect(3, 5, 10, 6, T0); c.disc(8, 8, 2.2, "olive_d"); c.hline(9, 13, 8, "black"); wheels(c, [3, 10], 3, 12); return c


def tank(body, turret, gun_len=6, w=12, gx=0):
    c = C(16, 16)
    tracks(c, 2, 3, w)
    hull(c, 2, 5, w, 6, body)
    c.rect(3, 6, w - 2, 4, T0)
    c.hline(3, w, 6, T1)
    cx = 2 + w // 2 - 1 + gx
    c.rect(cx - 2, 6, 5, 4, turret); c.hline(cx - 2, cx + 2, 6, shade(turret, .2))
    c.hline(cx + 3, min(15, cx + 3 + gun_len), 8, "black")
    return c


def v_early_tank():
    c = tank("olive_d", "olive", 3); return c


def v_heavy_tank():
    return tank("dgrey", "grey", 5, 13)


def v_mbt():
    c = tank("camo", "olive", 7, 12, -1); c.px(6, 7, "black"); return c


def v_halftrack():
    c = C(16, 16); tracks(c, 2, 3, 7); wheels(c, [11], 3, 12); hull(c, 2, 5, 12, 6, "olive"); c.rect(3, 6, 6, 4, T0); c.rect(10, 6, 3, 4, "olive_d"); c.px(12, 7, "window"); return c


def v_field_artillery():
    c = C(16, 16); c.line(1, 5, 6, 8, "olive_d"); c.line(1, 11, 6, 8, "olive_d"); c.rect(6, 6, 3, 5, "olive"); wheels(c, [7], 5, 11); c.hline(8, 15, 8, "black"); c.px(6, 7, T0); return c


def v_apc():
    c = C(16, 16); hull(c, 2, 4, 12, 8, "camo"); c.rect(3, 5, 10, 6, T0); c.rect(9, 6, 3, 3, "olive_d"); c.hline(11, 14, 7, "black"); wheels(c, [3, 6, 9, 12], 3, 12); c.rect(4, 6, 3, 2, "olive_d"); return c


def v_rocket_artillery():
    c = C(16, 16); hull(c, 1, 4, 14, 8, "olive"); c.rect(11, 5, 3, 6, "olive_d"); c.px(13, 6, "window"); c.rect(2, 5, 8, 6, "dgrey")
    for y in range(6, 11, 2):
        for x in range(3, 10, 2):
            c.px(x, y, "black")
    wheels(c, [2, 6, 11], 3, 12); c.px(1, 7, T0); c.px(1, 8, T0); return c


def v_sam_truck():
    c = C(16, 16); hull(c, 1, 4, 14, 8, "olive"); c.rect(11, 5, 3, 6, "olive_d"); c.rect(2, 5, 8, 2, "white"); c.rect(2, 9, 8, 2, "white"); c.px(9, 5, "red"); c.px(9, 9, "red"); wheels(c, [2, 6, 11], 3, 12); c.px(6, 7, T0); c.px(6, 8, T0); return c


def truck(cargo, cab="olive_d", team=True):
    c = C(16, 16); hull(c, 1, 4, 14, 8, cab)
    if cargo == "canvas":
        c.rect(2, 5, 9, 6, "khaki"); c.hline(2, 10, 7, "olive")
    elif cargo == "tank":
        c.rect(2, 5, 9, 6, "metal_l"); c.hline(2, 10, 5, "white"); c.hline(2, 10, 10, "metal")
    elif cargo == "box":
        c.rect(2, 5, 9, 6, "white"); c.hline(2, 10, 5, "offwhite")
    elif cargo == "crane":
        c.rect(2, 5, 9, 6, "yellow"); c.line(3, 8, 10, 6, "black")
    c.rect(11, 5, 3, 6, cab); c.px(13, 6, "window"); c.px(13, 9, "window")
    wheels(c, [2, 7, 11], 3, 12)
    if team:
        c.px(12, 5, T0); c.px(12, 10, T0)
    return c


def v_hover_tank():
    c = C(16, 16); c.ellipse(8, 8, 7, 4.5, (79, 224, 216, 90)); hull(c, 2, 5, 12, 6, "metal"); c.rect(3, 6, 10, 4, T0); c.disc(7, 8, 2, "metal_l"); c.hline(9, 15, 8, "neon2"); return c


def v_mech():
    c = C(16, 16); c.rect(3, 2, 3, 4, "metal_d"); c.rect(3, 10, 3, 4, "metal_d"); c.rect(5, 5, 6, 6, T0); c.rect(6, 6, 4, 4, "metal"); c.px(9, 7, "neon2"); c.hline(10, 14, 5, "dgrey"); c.hline(10, 14, 10, "dgrey"); return c


def car(col, taxi=False):
    c = C(16, 16); hull(c, 3, 5, 10, 6, col); c.rect(6, 6, 4, 4, shade(col, -.15)); c.vline(9, 6, 9, "window"); c.vline(6, 6, 9, "window_l"); wheels(c, [4, 10], 4, 11)
    if taxi:
        c.rect(7, 7, 2, 2, "white")
    c.px(12, 6, "lit"); c.px(12, 9, "lit")
    return c


def v_bus():
    c = C(16, 16); hull(c, 0, 4, 16, 8, "yellow"); c.rect(1, 5, 14, 6, "offwhite"); c.hline(1, 14, 7, "window"); c.hline(1, 14, 8, "window"); c.vline(14, 5, 10, "window_l"); return c


def v_tractor():
    c = C(16, 16); c.rect(3, 3, 4, 3, "black"); c.rect(3, 10, 4, 3, "black"); hull(c, 4, 5, 9, 6, "red"); c.rect(5, 6, 3, 4, "window"); c.rect(10, 7, 3, 2, "red_d"); c.px(12, 5, "black"); return c


def loco(kind):
    c = C(16, 16)
    if kind == "steam":
        hull(c, 1, 5, 14, 6, "black"); c.rect(2, 6, 5, 4, "red_d"); c.disc(12, 8, 1.3, "dgrey"); c.px(11, 7, "fire_l"); c.hline(8, 14, 6, "dgrey")
    elif kind == "diesel":
        hull(c, 1, 5, 14, 6, "orange"); c.rect(2, 6, 12, 4, shade("orange", -.1)); c.rect(12, 6, 2, 4, "window"); c.hline(2, 11, 8, "black")
    elif kind == "electric":
        hull(c, 1, 5, 14, 6, "blue"); c.rect(2, 6, 12, 4, "offwhite"); c.rect(12, 6, 2, 4, "window"); c.line(4, 4, 7, 6, "dgrey"); c.line(7, 4, 4, 6, "dgrey")
    elif kind == "maglev":
        hull(c, 0, 5, 16, 6, "white"); c.poly([(11, 5), (16, 8), (11, 11)], "white"); c.rect(1, 7, 10, 2, "window"); c.hline(0, 12, 10, "neon2")
    elif kind == "carriage_passenger":
        hull(c, 0, 5, 16, 6, "green_d"); c.rect(1, 6, 14, 4, "green"); c.hline(1, 14, 7, "window"); c.hline(1, 14, 8, "window")
    elif kind == "carriage_cargo":
        hull(c, 0, 5, 16, 6, "wood"); c.rect(1, 6, 14, 4, "brick"); c.vline(8, 6, 9, "brick_d")
    elif kind == "carriage_tank":
        hull(c, 0, 5, 16, 6, "dgrey"); c.rect(1, 6, 14, 4, "metal_l"); c.hline(1, 14, 6, "white")
    elif kind == "carriage_coal":
        hull(c, 0, 5, 16, 6, "dgrey"); c.rect(1, 6, 14, 4, "black"); c.noise(1, 6, 14, 4, None, .2, .5)
    return c


def plane(W, H, fus_len, wing_span, wing_x, col, kind="jet", tail=True, engines=0, prop=False, bi=False, disc=False, heli=False):
    c = C(W, H)
    cy = H / 2
    fx0 = (W - fus_len) // 2
    fw = 3 if W <= 16 else (4 if W <= 24 else 5)
    if heli:
        c.ellipse(W / 2 - 1, cy, fus_len / 2 - 2, fw / 2 + 1, col)
        c.hline(2, int(W / 2 - 3), int(cy), col)
        c.rect(1, int(cy) - 2, 1, 5, col)
        c.ellipse(W / 2 + 1, cy, 1.5, 1.2, "window")
        c.px(int(W / 2 - 3), int(cy) - 1, T0); c.px(int(W / 2 - 3), int(cy) + 1, T0)
        return c
    c.rect(fx0, int(cy - fw / 2), fus_len, fw, col)
    c.poly([(fx0 + fus_len, cy - fw / 2), (fx0 + fus_len + 2, cy), (fx0 + fus_len, cy + fw / 2)], col)
    wx = fx0 + wing_x
    ww = max(2, fus_len // 4)
    if kind == "jet":
        c.poly([(wx + ww, cy - fw / 2), (wx, cy - wing_span / 2), (wx - 2, cy - wing_span / 2), (wx - ww // 2, cy - fw / 2)], shade(col, -.08))
        c.poly([(wx + ww, cy + fw / 2), (wx, cy + wing_span / 2), (wx - 2, cy + wing_span / 2), (wx - ww // 2, cy + fw / 2)], shade(col, -.15))
    else:
        c.rect(wx - ww // 2, int(cy - wing_span / 2), ww, wing_span, shade(col, -.08))
        c.rect(wx - ww // 2, int(cy), ww, int(wing_span / 2), shade(col, -.15))
        if bi:
            c.hline(wx - ww // 2, wx + ww // 2, int(cy - wing_span / 2), shade(col, .2))
    if tail:
        ts = max(3, wing_span // 3)
        c.poly([(fx0 + 3, cy - fw / 2), (fx0, cy - ts / 2), (fx0 - 1, cy - ts / 2), (fx0, cy)], shade(col, -.05))
        c.poly([(fx0 + 3, cy + fw / 2), (fx0, cy + ts / 2), (fx0 - 1, cy + ts / 2), (fx0, cy)], shade(col, -.2))
    c.hline(fx0, fx0 + fus_len, int(cy - fw / 2), shade(col, .2))
    c.px(fx0 + fus_len, int(cy), "window"); c.px(fx0 + fus_len - 1, int(cy), "window")
    for i in range(engines):
        off = (i // 2 + 1) * (wing_span // (engines + 2)) + 1
        side = -1 if i % 2 == 0 else 1
        c.rect(wx - 1, int(cy + side * off), 3, 1, "dgrey")
    if prop:
        c.vline(fx0 + fus_len + 2, int(cy) - 2, int(cy) + 2, (40, 40, 40, 150))
    if disc:
        c.disc(wx - 2, cy, 3, "white"); c.hline(wx - 5, wx + 1, int(cy), "dgrey")
    c.px(wx, int(cy - wing_span / 2) + 1, T0); c.px(wx, int(cy + wing_span / 2) - 1, T0)
    c.px(wx - 1, int(cy - wing_span / 2) + 1, T1); c.px(wx - 1, int(cy + wing_span / 2) - 1, T1)
    return c


AIRCRAFT = [
    ("observation_balloon", "I", 16, lambda: balloon()),
    ("biplane", "I", 16, lambda: plane(16, 16, 10, 14, 6, "wood_l", "prop", prop=True, bi=True)),
    ("early_fighter", "I", 16, lambda: plane(16, 16, 11, 13, 6, "olive", "prop", prop=True)),
    ("early_bomber", "I", 24, lambda: plane(24, 24, 16, 22, 9, "olive_d", "prop", engines=2, prop=True)),
    ("transport_plane", "I", 24, lambda: plane(24, 24, 17, 22, 9, "metal", "prop", engines=2, prop=True)),
    ("transport_heli", "Mo", 16, lambda: heli("olive", 2)),
    ("attack_heli", "Mo", 16, lambda: heli("camo", 1)),
    ("jet_fighter", "Mo", 16, lambda: plane(16, 16, 12, 12, 5, "metal", "jet")),
    ("strategic_bomber", "Mo", 32, lambda: plane(32, 32, 24, 30, 11, "dgrey", "jet", engines=4)),
    ("awacs", "Mo", 32, lambda: plane(32, 32, 22, 26, 10, "offwhite", "jet", engines=2, disc=True)),
    ("cargo_jet", "Mo", 32, lambda: plane(32, 32, 24, 28, 12, "metal_d", "jet", engines=4)),
    ("airliner_small", "Mo", 24, lambda: plane(24, 24, 18, 18, 9, "white", "jet", engines=2)),
    ("airliner_large", "Mo", 32, lambda: plane(32, 32, 26, 28, 12, "white", "jet", engines=4)),
    ("recon_drone", "Mo", 16, lambda: plane(16, 16, 8, 14, 5, "lgrey", "prop")),
    ("strike_drone", "Mo", 16, lambda: plane(16, 16, 9, 12, 4, "dgrey", "jet")),
    ("vtol_gunship", "F", 24, lambda: vtol()),
]


def balloon():
    c = C(16, 16)
    c.disc(8, 7, 6, "canvas", shade_top=.3)
    c.vline(8, 1, 13, "canvas_d"); c.hline(2, 14, 7, "canvas_d")
    c.rect(7, 13, 2, 2, "wood"); c.px(7, 7, T0); c.px(9, 7, T0)
    return c


def heli(col, rotors, frame=0):
    import math
    c = C(16, 16)
    c.hline(6, 13, 3, "dgrey"); c.hline(6, 13, 12, "dgrey")
    c.px(7, 4, "dgrey"); c.px(12, 4, "dgrey"); c.px(7, 11, "dgrey"); c.px(12, 11, "dgrey")
    c.ellipse(9.5, 7.5, 4.6, 3.3, col)
    c.hline(6, 13, 5, shade(col, .2))
    c.rect(1, 7, 5, 2, col); c.hline(1, 5, 7, shade(col, .15))
    c.vline(1, 5, 10, shade(col, -.2))
    c.ellipse(12.3, 7.5, 1.6, 2, "window"); c.px(12, 6, "window_l")
    c.vline(8, 5, 10, T0); c.vline(9, 5, 10, T1)
    hubs = [9] if rotors == 1 else [5, 12]
    a0 = frame * .5
    for hx0 in hubs:
        for i in range(2 if rotors == 2 else 4):
            a = a0 + i * (math.pi if rotors == 2 else math.pi / 2)
            c.line(hx0, 7.5, hx0 + math.cos(a) * 7, 7.5 + math.sin(a) * 7, (30, 30, 35, 200))
        c.px(hx0, 7, "black"); c.px(hx0, 8, "black")
    c.px(1, 5, (30, 30, 35, 200)); c.px(1, 10, (30, 30, 35, 200))
    return c


def vtol():
    c = C(24, 24)
    c.rect(4, 10, 16, 4, "metal"); c.poly([(20, 10), (23, 12), (20, 14)], "metal")
    c.rect(8, 3, 6, 18, "metal_d")
    c.disc(9, 4, 2.5, (79, 224, 216, 150)); c.disc(9, 20, 2.5, (79, 224, 216, 150))
    c.disc(15, 4, 2.5, (79, 224, 216, 150)); c.disc(15, 20, 2.5, (79, 224, 216, 150))
    c.rect(10, 11, 3, 2, T0); c.px(20, 12, "window")
    return c


def ship(W, kind, col="metal_d"):
    H = 16
    c = C(W, H)
    cy = H / 2
    hw = {"raft": 5, "canoe": 3, "small": 5, "mid": 7, "large": 9, "huge": 11}
    size = {"raft": "raft", "canoe": "canoe", "fishing_boat": "small", "patrol_boat": "small", "galley": "mid", "cog": "mid", "caravel": "mid",
            "galleon": "large", "ship_of_the_line": "large", "frigate": "large", "steamship": "mid", "ironclad": "mid", "destroyer": "mid", "cruiser": "large",
            "battleship": "huge", "submarine": "small", "submarine_submerged": "small", "aircraft_carrier": "huge", "landing_craft": "small", "cargo_ship": "large",
            "container_ship": "huge", "oil_tanker": "huge", "ferry": "large", "cruise_ship": "huge"}[kind]
    h = hw[size]
    x0, x1 = 1, W - 1
    if kind == "raft":
        c.rect(3, 4, 10, 8, "wood_l")
        for x in range(3, 13, 2):
            c.vline(x, 4, 11, "wood")
        c.vline(8, 2, 13, "wood_d"); c.rect(9, 3, 3, 4, "canvas")
        return c
    bow = h + 1 if kind not in ("landing_craft", "aircraft_carrier") else 2
    c.poly([(x0, cy - h / 2), (x1 - bow, cy - h / 2), (x1, cy), (x1 - bow, cy + h / 2), (x0, cy + h / 2)], col)
    c.poly([(x0 + 1, cy - h / 2 + 1), (x1 - bow, cy - h / 2 + 1), (x1 - 2, cy), (x1 - bow, cy + h / 2 - 1), (x0 + 1, cy + h / 2 - 1)], shade(col, .15))
    L = x1 - x0
    mid = int(cy)
    top, bot = int(cy - h / 2) + 1, int(cy + h / 2) - 1
    if kind == "canoe":
        c.rect(4, mid, 1, 1, T0); c.rect(9, mid, 1, 1, T0)
    elif kind == "fishing_boat":
        c.rect(4, top + 1, 4, 3, "white"); c.px(7, mid - 1, "window"); c.rect(9, mid - 1, 3, 2, "wood_d"); c.px(3, mid, T0)
    elif kind == "patrol_boat":
        c.rect(5, top + 1, 5, 3, "grey"); c.px(9, mid, "window"); c.hline(11, 14, mid, "black"); c.px(3, mid, T0)
    elif kind in ("galley", "cog", "caravel", "galleon", "ship_of_the_line", "frigate"):
        masts = {"galley": 1, "cog": 1, "caravel": 2, "galleon": 3, "ship_of_the_line": 3, "frigate": 3}[kind]
        if kind == "galley":
            for x in range(4, L - 4, 3):
                c.vline(x, top - 3, top - 1, "wood_d"); c.vline(x, bot + 1, bot + 3, "wood_d")
        if kind in ("ship_of_the_line", "frigate"):
            for x in range(4, L - 5, 3):
                c.px(x, top, "black"); c.px(x, bot, "black")
        for i in range(masts):
            mx = int(x0 + L * (i + 1) / (masts + 1))
            sw = h + 4 if kind != "galley" else h + 2
            c.rect(mx - 1, int(cy - sw / 2), 3, sw, "canvas")
            c.vline(mx + 1, int(cy - sw / 2), int(cy + sw / 2) - 1, "canvas_d")
            c.px(mx, int(cy - sw / 2), T0); c.px(mx, int(cy + sw / 2) - 1, T0)
            c.px(mx, mid, "wood_d")
    elif kind == "steamship":
        c.rect(6, top + 1, 10, h - 3, "white"); c.rect(10, mid - 1, 2, 2, "black"); c.px(10, mid - 1, "red"); c.px(4, mid, T0)
    elif kind == "ironclad":
        c.rect(10, top + 1, 6, h - 3, "dgrey"); c.hline(15, 22, mid, "black"); c.rect(6, mid - 1, 2, 2, "black"); c.px(4, mid, T0)
    elif kind in ("destroyer", "cruiser", "battleship"):
        n = {"destroyer": 2, "cruiser": 3, "battleship": 4}[kind]
        c.rect(int(L * .38), top + 1, int(L * .2), h - 3, "grey"); c.px(int(L * .38) + 1, mid, "window")
        c.rect(int(L * .45), mid - 1, 2, 2, "black")
        spots = [int(L * t) for t in (.78, .64, .2, .08)][:n]
        for sx in spots:
            c.disc(sx, mid + .5, 1.8, "dgrey"); c.hline(sx + 1, sx + 4 if sx > L / 2 else sx + 1, mid, "black")
            if sx < L / 2:
                c.hline(sx - 3, sx, mid, "black")
        c.px(3, mid, T0); c.px(4, mid, T0)
    elif kind in ("submarine", "submarine_submerged"):
        c.a[:] = 0
        colr = "dgrey" if kind == "submarine" else (40, 60, 90, 130)
        c.ellipse(W / 2, cy, W / 2 - 1, 2.5, colr)
        c.rect(int(W / 2) - 1, mid - 1, 3, 2, "black" if kind == "submarine" else (30, 40, 60, 130))
        if kind == "submarine":
            c.px(3, mid, T0)
        return c
    elif kind == "aircraft_carrier":
        c.rect(x0 + 1, top, L - 3, h - 1, "asphalt")
        c.line(4, bot - 1, L - 6, top + 1, "line")
        c.rect(int(L * .6), bot - 2, 6, 2, "grey"); c.px(int(L * .6) + 1, bot - 2, "window")
        for x in range(6, L - 6, 6):
            c.hline(x, x + 1, mid, "yline")
        c.px(3, top + 1, T0)
    elif kind == "landing_craft":
        c.rect(3, top + 1, L - 6, h - 3, "olive_d"); c.rect(3, mid - 1, 2, 2, "grey"); c.hline(L - 2, L - 1, mid, "olive")
        c.px(8, mid - 1, T0)
    elif kind == "cargo_ship":
        c.rect(3, top + 1, 6, h - 3, "white"); c.px(8, mid, "window")
        for x in range(11, L - 6, 5):
            c.rect(x, top + 1, 4, h - 3, "brick_d"); c.hline(x, x + 3, top + 1, "brick")
        c.px(4, mid, T0)
    elif kind == "container_ship":
        c.rect(3, top + 1, 5, h - 3, "white"); c.px(7, mid, "window")
        for x in range(10, L - 7, 3):
            for y in range(top + 1, bot, 2):
                c.rect(x, y, 2, 2, c.rng.choice(["red", "blue", "teal", "orange", "green", "grey"]))
        c.px(4, mid, T0)
    elif kind == "oil_tanker":
        c.rect(3, top + 1, 6, h - 3, "white"); c.px(8, mid, "window")
        c.hline(11, L - 7, mid, "metal_l")
        for x in range(12, L - 7, 5):
            c.disc(x, mid + .5, 1.5, "metal")
        c.px(4, mid, T0)
    elif kind == "ferry":
        c.rect(4, top + 1, L - 10, h - 3, "white"); c.hline(5, L - 8, mid - 1, "window"); c.hline(5, L - 8, mid + 1, "window"); c.rect(int(L * .5), mid - 1, 2, 2, "red")
    elif kind == "cruise_ship":
        c.rect(4, top + 1, L - 10, h - 3, "white")
        for y in (mid - 2, mid, mid + 2):
            c.hline(5, L - 9, y, "window")
        c.rect(int(L * .35), mid - 1, 3, 3, "blue"); c.rect(int(L * .55), mid - 1, 2, 2, "red")
    return c


SHIPS = [("raft", "T", 16, "wood"), ("canoe", "T", 16, "wood"), ("fishing_boat", "M", 16, "wood"), ("galley", "M", 32, "wood"), ("cog", "M", 32, "wood"),
         ("caravel", "G", 32, "wood"), ("galleon", "G", 48, "wood_d"), ("ship_of_the_line", "G", 48, "wood_d"), ("frigate", "G", 32, "wood"),
         ("steamship", "I", 32, "black"), ("ironclad", "I", 32, "dgrey"), ("destroyer", "I", 32, "metal_d"), ("cruiser", "I", 48, "metal_d"),
         ("battleship", "I", 48, "grey"), ("submarine", "I", 32, "dgrey"), ("submarine_submerged", "I", 32, "dgrey"), ("aircraft_carrier", "Mo", 64, "grey"),
         ("landing_craft", "I", 16, "olive"), ("patrol_boat", "Mo", 16, "grey"), ("cargo_ship", "I", 48, "navy"), ("container_ship", "Mo", 64, "navy"),
         ("oil_tanker", "Mo", 64, "red_d"), ("ferry", "I", 32, "navy"), ("cruise_ship", "Mo", 64, "navy")]

LAND = [
    ("hand_cart", "T", v_hand_cart, "civil"), ("horse_wagon", "M", v_horse_wagon, "civil"), ("chariot", "T", v_chariot, "mil"),
    ("supply_wagon", "M", v_supply_wagon, "mil"), ("catapult", "M", v_catapult, "mil"), ("trebuchet", "M", v_trebuchet, "mil"),
    ("cannon", "G", v_cannon, "mil"), ("horse_artillery", "G", v_horse_artillery, "mil"), ("armoured_car", "I", v_armoured_car, "mil"),
    ("early_tank", "I", v_early_tank, "mil"), ("heavy_tank", "I", v_heavy_tank, "mil"), ("halftrack", "I", v_halftrack, "mil"),
    ("field_artillery", "I", v_field_artillery, "mil"), ("main_battle_tank", "Mo", v_mbt, "mil"), ("apc", "Mo", v_apc, "mil"),
    ("rocket_artillery", "Mo", v_rocket_artillery, "mil"), ("sam_truck", "Mo", v_sam_truck, "mil"),
    ("supply_truck", "I", lambda: truck("canvas"), "mil"), ("fuel_truck", "Mo", lambda: truck("tank"), "mil"),
    ("engineering_vehicle", "Mo", lambda: truck("crane", "yellow"), "mil"), ("hover_tank", "F", v_hover_tank, "mil"), ("mech", "F", v_mech, "mil"),
    ("car_red", "I", lambda: car("red"), "civil"), ("car_blue", "Mo", lambda: car("blue"), "civil"), ("car_white", "Mo", lambda: car("white"), "civil"),
    ("car_green", "Mo", lambda: car("green_d"), "civil"), ("taxi", "Mo", lambda: car("yellow", True), "civil"), ("bus", "Mo", v_bus, "civil"),
    ("delivery_truck", "Mo", lambda: truck("box", "blue", False), "civil"), ("tractor", "I", v_tractor, "civil"),
]


def build():
    for (n, era, fn, kind) in LAND:
        im = fn(); im.outline(.4)
        add(n, "vehicles", "military" if kind == "mil" else "civilian", im, era=era, tags=["team"] if kind == "mil" else [], note="faces east; rotate in game")
    for k in ("steam", "diesel", "electric", "maglev"):
        im = loco(k); im.outline(.4)
        add(f"loco_{k}", "vehicles", "trains", im, era={"steam": "I", "diesel": "I", "electric": "Mo", "maglev": "F"}[k])
    for k in ("carriage_passenger", "carriage_cargo", "carriage_tank", "carriage_coal"):
        im = loco(k); im.outline(.4)
        add(k, "vehicles", "trains", im, era="I")
    for (n, era, sz, fn) in AIRCRAFT:
        im = fn(); im.outline(.4)
        add(n, "aircraft", "aircraft", im, era=era, fp=(sz // 16, sz // 16), tags=["team"], note="faces east; draw shadow offset below")
        add(f"{n}_shadow", "aircraft", "shadows", im.silhouette(), era=era, fp=(sz // 16, sz // 16))
    for n, col, rot in (("transport_heli", "olive", 2), ("attack_heli", "camo", 1)):
        for f in range(1, 3):
            im = heli(col, rot, f); im.outline(.4)
            add(f"{n}_rotor{f}", "aircraft", "aircraft", im, era="Mo", frame=f, tags=["team"])
    for (n, era, w, col) in SHIPS:
        im = ship(w, n, col)
        if n != "submarine_submerged":
            im.outline(.4)
        add(n, "ships", "ships", im, era=era, fp=(w // 16, 1), tags=["team"], note="faces east")
