from core import C, hx, shade, mix, add, TEAM

T0, T1, T2 = TEAM


def headgear(c, kind, hx0, hy):
    if kind == "band":
        c.hline(hx0, hx0 + 3, hy + 1, "red")
        c.px(hx0 - 1, hy + 2, "red")
    elif kind == "hood":
        c.rect(hx0, hy, 4, 2, "green_d"); c.px(hx0, hy + 2, "green_d"); c.px(hx0 - 1, hy + 1, "green_d")
    elif kind == "helm_iron":
        c.rect(hx0, hy - 1, 4, 2, "metal"); c.px(hx0 + 1, hy - 1, "metal_l"); c.px(hx0 + 3, hy + 1, "metal_d")
    elif kind == "helm_knight":
        c.rect(hx0, hy - 1, 4, 4, "metal"); c.hline(hx0 + 2, hx0 + 3, hy + 1, "black"); c.px(hx0 + 1, hy - 2, T0)
    elif kind == "tricorn":
        c.hline(hx0 - 1, hx0 + 4, hy, "black"); c.rect(hx0, hy - 1, 4, 1, "black")
    elif kind == "shako":
        c.rect(hx0, hy - 2, 4, 3, "black"); c.px(hx0 + 1, hy - 2, "gold"); c.hline(hx0, hx0 + 4, hy, "black")
    elif kind == "helmet_ww":
        c.rect(hx0 - 1, hy, 6, 1, "olive_d"); c.rect(hx0, hy - 1, 4, 1, "olive")
    elif kind == "helmet_modern":
        c.rect(hx0, hy - 1, 4, 2, "camo"); c.px(hx0 - 1, hy, "camo"); c.px(hx0 + 4, hy, "camo")
    elif kind == "beret":
        c.rect(hx0, hy - 1, 4, 1, "black"); c.px(hx0 - 1, hy, "black")
    elif kind == "boonie":
        c.hline(hx0 - 1, hx0 + 4, hy, "khaki"); c.rect(hx0, hy - 1, 4, 1, "khaki")
    elif kind == "hardhat":
        c.rect(hx0, hy - 1, 4, 2, "yellow"); c.hline(hx0 - 1, hx0 + 4, hy, "yellow")
    elif kind == "medic":
        c.rect(hx0, hy - 1, 4, 2, "white"); c.px(hx0 + 1, hy - 1, "green"); c.px(hx0 + 2, hy - 1, "green")
    elif kind == "visor":
        c.rect(hx0, hy - 1, 4, 4, "metal_d"); c.hline(hx0 + 1, hx0 + 3, hy + 1, "neon2")
    elif kind == "strawhat":
        c.hline(hx0 - 1, hx0 + 4, hy, "straw"); c.rect(hx0, hy - 1, 4, 1, "straw_d")
    elif kind == "lamp":
        c.rect(hx0, hy - 1, 4, 2, "orange"); c.px(hx0 + 3, hy - 1, "lit")
    elif kind == "hat":
        c.rect(hx0, hy - 1, 4, 1, "wood_d"); c.hline(hx0 - 1, hx0 + 4, hy, "wood_d")


def weapon(c, kind, ax, ay, frame):
    atk = frame == "attack"
    if kind == "club":
        if atk:
            c.line(ax, ay, ax + 3, ay - 4, "wood"); c.px(ax + 3, ay - 4, "wood_d"); c.px(ax + 4, ay - 4, "wood_d")
        else:
            c.line(ax, ay, ax + 1, ay + 4, "wood"); c.px(ax + 1, ay + 4, "wood_d")
    elif kind in ("spear", "pike", "lance"):
        L = 9 if kind == "pike" else 7
        if atk:
            c.hline(ax - 2, ax + L - 2, ay, "wood"); c.px(ax + L - 1, ay, "metal_l"); c.px(ax + L - 2, ay, "metal")
        else:
            c.vline(ax + 1, ay - L + 3, ay + 3, "wood"); c.px(ax + 1, ay - L + 2, "metal_l")
    elif kind == "bow":
        c.vline(ax + 2, ay - 3, ay + 3, "wood"); c.px(ax + 1, ay - 3, "wood"); c.px(ax + 1, ay + 3, "wood")
        c.vline(ax + 1, ay - 2, ay + 2, "offwhite")
        if atk:
            c.hline(ax - 2, ax + 3, ay, "wood_l"); c.px(ax + 4, ay, "metal_l")
    elif kind == "sword":
        if atk:
            c.line(ax, ay, ax + 4, ay - 3, "metal_l"); c.px(ax, ay, "gold")
        else:
            c.vline(ax + 1, ay - 3, ay, "metal_l"); c.px(ax + 1, ay + 1, "gold")
    elif kind == "sabre":
        if atk:
            c.line(ax, ay - 1, ax + 4, ay - 3, "metal_l")
        else:
            c.line(ax, ay, ax + 1, ay + 3, "metal_l")
    elif kind in ("musket", "rifle", "modern_rifle", "sniper", "plasma", "mg"):
        L = {"musket": 7, "rifle": 6, "modern_rifle": 5, "sniper": 8, "plasma": 5, "mg": 6}[kind]
        col = {"musket": "wood", "rifle": "wood_d", "modern_rifle": "black", "sniper": "olive_d", "plasma": "metal_l", "mg": "black"}[kind]
        if atk or kind == "mg":
            c.hline(ax - 1, ax + L - 1, ay, col); c.px(ax - 1, ay + 1, col)
            if kind == "mg":
                c.px(ax + 2, ay + 1, "dgrey"); c.px(ax + 3, ay + 1, "dgrey")
            if kind == "sniper":
                c.hline(ax + 1, ax + 3, ay - 1, "black")
            if atk:
                c.px(ax + L, ay, "neon2" if kind == "plasma" else "fire_l")
                c.px(ax + L + 1, ay, (255, 230, 120, 150) if kind != "plasma" else (79, 224, 216, 150))
        else:
            c.line(ax - 1, ay + 3, ax + 3, ay - L + 3, col)
            if kind == "musket":
                c.px(ax + 3, ay - L + 2, "metal_l")
    elif kind == "mortar":
        c.line(ax, ay + 3, ax + 3, ay - 1, "dgrey"); c.px(ax + 1, ay + 4, "black")
        if atk:
            c.px(ax + 4, ay - 3, "fire_l"); c.px(ax + 4, ay - 2, (220, 220, 220, 150))
    elif kind == "rammer":
        c.line(ax - 1, ay + 2, ax + 4, ay - 3 if not atk else ay, "wood_l")
    elif kind == "wrench":
        c.line(ax, ay, ax + 2, ay + 2 if not atk else ay - 2, "metal"); c.px(ax + 3, ay + (3 if not atk else -3), "metal_l")
    elif kind == "flamer":
        if atk:
            c.hline(ax - 1, ax + 3, ay, "metal_d")
            c.px(ax + 4, ay, "fire_l"); c.px(ax + 5, ay, "fire"); c.px(ax + 6, ay, "fire")
            c.px(ax + 5, ay - 1, "fire_l"); c.px(ax + 6, ay + 1, "orange")
        else:
            c.line(ax - 1, ay + 3, ax + 3, ay - 2, "metal_d")
    elif kind == "launcher":
        c.hline(ax - 2, ax + 5, ay - (1 if atk else 0), "olive_d")
        c.px(ax + 6, ay - (1 if atk else 0), "red")
        if atk:
            c.px(ax - 3, ay, "smoke"); c.px(ax - 4, ay, (200, 200, 205, 130))
    elif kind == "tablet":
        c.rect(ax, ay - 1, 3, 3, "metal_d")
        c.px(ax + 1, ay, "neon2")
        if atk:
            c.px(ax + 4, ay - 3, "neon2"); c.px(ax + 5, ay - 4, "neon2")
    elif kind == "satchel":
        if atk:
            c.rect(ax + 2, ay - 3, 3, 3, "canvas_d")
            c.px(ax + 4, ay - 4, "wood_d"); c.px(ax + 5, ay - 5, "fire_l")
        else:
            c.rect(ax, ay + 1, 3, 3, "canvas_d")
            c.px(ax + 1, ay, "wood_d")
    elif kind == "drill":
        c.line(ax, ay, ax + 2, ay + 3 if not atk else ay - 3, "metal")
        c.px(ax + 3, ay + (4 if not atk else -4), "metal_l")
    elif kind == "medkit":
        c.rect(ax, ay, 3, 2, "white"); c.px(ax + 1, ay, "green")
    elif kind == "hoe":
        c.line(ax, ay + 3, ax + 2, ay - 3, "wood"); c.hline(ax + 2, ax + 3, ay - 3, "metal")
    elif kind == "pick":
        c.line(ax, ay + 3, ax + 2, ay - 2, "wood"); c.line(ax + 1, ay - 3, ax + 4, ay - 1, "metal")
    elif kind == "box":
        c.rect(ax - 2, ay - 3, 4, 3, "wood_l"); c.frame(ax - 2, ay - 3, 4, 3, "wood_d")
    elif kind == "bag":
        c.rect(ax, ay + 1, 2, 3, "canvas_d")
    elif kind == "camera":
        c.rect(ax, ay - 1, 2, 2, "black")


def person(frame, head, arm_item, cloth=T0, cloth_d=T1, pants="wood_d", skin="skin", shield=None, bulky=False, pack=None):
    c = C(16, 16, 1)
    if frame == "dead":
        c.rect(3, 13, 3, 2, skin)
        c.rect(6, 13, 5, 2, cloth); c.hline(6, 10, 14, cloth_d)
        c.rect(11, 13, 3, 2, pants)
        c.px(2, 15, (120, 20, 20, 160)); c.px(5, 15, (120, 20, 20, 120))
        c.outline(.45)
        return c
    bx = 6
    lx = {"idle": (0, 0), "walk1": (-1, 1), "walk2": (1, -1), "attack": (-1, 1)}[frame]
    c.rect(bx + lx[0], 11, 1 + (1 if bulky else 0), 4, pants)
    c.rect(bx + 2 + lx[1], 11, 1 + (1 if bulky else 0), 4, shade(pants, -.2))
    c.px(bx + lx[0], 14, "black"); c.px(bx + 2 + lx[1], 14, "black")
    w = 5 if bulky else 4
    c.rect(bx - (1 if bulky else 0), 6, w, 5, cloth)
    c.vline(bx + w - 1 - (1 if bulky else 0), 6, 10, cloth_d)
    c.hline(bx - (1 if bulky else 0), bx + w - 1, 10, T2 if cloth == T0 else shade(cloth, -.3))
    if pack:
        c.rect(bx - 2, 6, 2, 4, pack)
    c.rect(bx, 2, 4, 4, skin)
    c.px(bx + 3, 3, "black")
    c.vline(bx + 4, 3, 4, "skin_d")
    headgear(c, head, bx, 2)
    ax, ay = bx + 3, 8
    c.px(ax, ay, skin)
    if shield:
        c.rect(bx + 3, 6, 2, 5, shield); c.vline(bx + 4, 6, 10, shade(shield, -.3))
    weapon(c, arm_item, ax, ay, frame)
    c.outline(.45)
    return c


def horse(c, frame, col="wood", x=1):
    y = 7
    c.rect(x + 2, y, 9, 4, col)
    c.hline(x + 2, x + 10, y + 3, shade(col, -.2))
    c.rect(x + 10, y - 3, 2, 4, col); c.rect(x + 11, y - 4, 3, 2, col); c.px(x + 13, y - 3, "black")
    c.px(x + 1, y, "wood_d"); c.px(x, y + 1, "wood_d")
    legs = {"idle": (0, 0, 0, 0), "walk1": (-1, 1, 1, -1), "walk2": (1, -1, -1, 1), "attack": (-1, 0, 1, 0), "dead": (0, 0, 0, 0)}[frame]
    for i, lx in enumerate((x + 3, x + 5, x + 8, x + 10)):
        c.vline(lx + legs[i], y + 4, y + 7, shade(col, -.25))
        c.px(lx + legs[i], y + 7, "black")


def rider(frame, head, item, cloth=T0, col="wood"):
    c = C(16, 16, 2)
    if frame == "dead":
        c.rect(1, 12, 12, 3, col); c.rect(12, 11, 3, 2, col); c.rect(4, 10, 4, 2, cloth)
        c.outline(.45)
        return c
    horse(c, frame, col)
    bx = 6
    c.rect(bx, 3, 4, 4, cloth); c.vline(bx + 3, 3, 6, T1)
    c.rect(bx - 1, 7, 6, 1, "red_d")
    c.rect(bx, -1 + 1, 4, 3, "skin"); c.px(bx + 3, 1, "black")
    headgear(c, head, bx, 0)
    weapon(c, item, bx + 3, 5, frame)
    c.outline(.45)
    return c


GUNS = {"musket": ("wood", 7), "rifle": ("wood_d", 6), "modern_rifle": ("black", 5), "sniper": ("olive_d", 8), "plasma": ("metal_l", 5), "mg": ("black", 6), "flamer": ("metal_d", 5), "launcher": ("olive_d", 7)}
POLES = {"spear": 7, "pike": 9, "lance": 8}
SHORT = {"club": "wood", "sword": "metal_l", "sabre": "metal_l", "wrench": "metal", "pick": "metal", "hoe": "wood", "rammer": "wood_l", "drill": "metal", "tablet": "metal_d"}


def weapon_fb(c, kind, facing, frame, sx):
    atk = frame == "attack"
    down = facing == "s"
    if kind in GUNS:
        col, L = GUNS[kind]
        flash = "neon2" if kind == "plasma" else "fire_l"
        if atk:
            if down:
                c.vline(8, 8, 8 + L // 2 + 1, col); c.px(7, 8, col)
                c.px(8, 9 + L // 2 + 1, flash); c.px(8, 10 + L // 2 + 1, (255, 230, 120, 150))
            else:
                c.vline(9, 8 - L // 2 - 1, 8, col)
                c.px(9, 7 - L // 2 - 1, flash); c.px(9, 6 - L // 2 - 1, (255, 230, 120, 150))
        else:
            if down:
                c.line(5, 10, 5 + L // 2 + 2, 10 - L // 2 - 1, col)
            else:
                c.vline(sx, 3, 3 + L, col)
    elif kind in POLES:
        L = POLES[kind]
        if atk:
            if down:
                c.vline(8, 7, min(15, 7 + L), "wood"); c.px(8, min(15, 7 + L), "metal_l")
            else:
                c.vline(9, max(0, 9 - L), 9, "wood"); c.px(9, max(0, 9 - L), "metal_l")
        else:
            c.vline(sx, max(0, 12 - L - 2), 12, "wood"); c.px(sx, max(0, 12 - L - 2), "metal_l")
    elif kind in SHORT:
        col = SHORT[kind]
        if atk:
            if down:
                c.line(sx, 7, sx + 3, 11, col)
            else:
                c.line(sx, 8, sx - 2, 2, col)
        else:
            c.vline(sx, 8, 11, col)
    elif kind == "bow":
        if atk:
            y = 9 if down else 5
            c.hline(5, 10, y, "wood"); c.px(4, y + (1 if down else -1), "wood"); c.px(11, y + (1 if down else -1), "wood")
            c.vline(8, y, y + (4 if down else -4), "wood_l")
        else:
            c.line(sx, 4, sx, 11, "wood")
    elif kind == "mortar":
        c.line(sx, 11, sx, 5, "dgrey")
        if atk:
            c.px(sx, 3, "fire_l")
    elif kind == "satchel":
        if atk:
            c.rect(7, 11 if down else 4, 3, 3, "canvas_d")
            c.px(8, 10 if down else 3, "fire_l")
        else:
            c.rect(sx - (1 if sx > 8 else 0), 9, 3, 3, "canvas_d")
    elif kind == "medkit":
        c.rect(sx - (1 if sx > 8 else 0), 9, 2, 2, "white"); c.px(sx, 9, "green")
    elif kind == "box":
        c.rect(6, 6, 4, 3, "wood_l"); c.frame(6, 6, 4, 3, "wood_d")
    elif kind == "bag":
        c.rect(sx, 9, 2, 3, "canvas_d")
    elif kind == "camera":
        if down:
            c.rect(7, 7, 2, 1, "black")


def person_fb(frame, facing, head, arm_item, cloth=T0, cloth_d=T1, pants="wood_d", skin="skin", shield=None, bulky=False, pack=None):
    c = C(16, 16, 1)
    ll, rl = {"idle": (0, 0), "walk1": (-1, 0), "walk2": (0, -1), "attack": (0, 0)}[frame]
    w = 6 if bulky else 4
    bx = 8 - w // 2
    c.rect(bx, 11, 2, 4 + ll, pants)
    c.rect(bx + w - 2, 11, 2, 4 + rl, shade(pants, -.2))
    c.hline(bx, bx + 1, 14 + ll, "black"); c.hline(bx + w - 2, bx + w - 1, 14 + rl, "black")
    c.rect(bx, 6, w, 5, cloth)
    c.vline(bx + w - 1, 6, 10, cloth_d)
    c.hline(bx, bx + w - 1, 10, T2 if cloth == T0 else shade(cloth, -.3))
    c.vline(bx - 1, 7, 9, cloth_d if facing == "n" else cloth)
    c.vline(bx + w, 7, 9, cloth_d)
    c.px(bx - 1, 9, skin); c.px(bx + w, 9, skin)
    if facing == "n" and pack:
        c.rect(bx, 6, w, 3, pack); c.hline(bx, bx + w - 1, 8, shade(pack, -.25))
    if facing == "s" and pack:
        c.vline(bx, 6, 9, shade(pack, -.2)); c.vline(bx + w - 1, 6, 9, shade(pack, -.2))
    c.rect(6, 2, 4, 4, skin)
    if facing == "s":
        c.px(7, 3, "black"); c.px(8, 3, "black")
        if head == "none":
            c.hline(6, 9, 2, "hair")
    else:
        c.rect(6, 2, 4, 3, "hair")
    headgear(c, head, 6, 2)
    sx = bx - 1 if facing == "s" else bx + w
    if shield:
        if facing == "s":
            c.rect(bx - 1, 6, 3, 5, shield); c.vline(bx + 1, 6, 10, shade(shield, -.3))
        else:
            c.rect(bx + w - 1, 6, 2, 5, shade(shield, -.15))
        sx = bx + w if facing == "s" else bx - 1
    weapon_fb(c, arm_item, facing, frame, sx)
    c.outline(.45)
    return c


def rider_fb(frame, facing, head, item, cloth=T0, col="wood"):
    c = C(16, 16, 2)
    legs = {"idle": (0, 0), "walk1": (-1, 1), "walk2": (1, -1), "attack": (0, 0)}[frame]
    if facing == "s":
        c.rect(5, 7, 6, 5, col); c.hline(5, 10, 11, shade(col, -.2))
        c.rect(7, 11, 2, 4, col); c.px(7, 14, "black"); c.px(8, 14, "black"); c.px(7, 12, "white")
        c.vline(5, 11, 14 + legs[0], shade(col, -.3)); c.vline(10, 11, 14 + legs[1], shade(col, -.3))
    else:
        c.rect(5, 7, 6, 6, col); c.hline(5, 10, 12, shade(col, -.2))
        c.vline(8, 12, 15, "wood_d"); c.px(7, 13, "wood_d")
        c.vline(5, 12, 15 + legs[0], shade(col, -.3)); c.vline(10, 12, 15 + legs[1], shade(col, -.3))
        c.px(6, 6, col); c.px(9, 6, col)
    c.rect(6, 3, 4, 4, cloth); c.vline(9, 3, 6, T1)
    c.rect(4, 7, 8, 1, "red_d")
    c.rect(6, 0, 4, 3, "skin")
    if facing == "s":
        c.px(7, 1, "black"); c.px(8, 1, "black")
    else:
        c.rect(6, 0, 4, 2, "hair")
    headgear(c, head, 6, 0)
    sx = 5 if facing == "s" else 10
    if item in POLES:
        if frame == "attack":
            c.vline(8, 5 if facing == "s" else 0, 15 if facing == "s" else 6, "wood")
        else:
            c.vline(sx, 0, 9, "wood"); c.px(sx, 0, "metal_l")
    else:
        weapon_fb(c, item, facing, frame, sx)
    c.outline(.45)
    return c


INFANTRY = [
    ("club_warrior", "T", dict(head="band", arm_item="club", pants="mud", cloth=T0)),
    ("spear_thrower", "T", dict(head="band", arm_item="spear", pants="mud")),
    ("spearman", "M", dict(head="helm_iron", arm_item="spear", pants="wood_d")),
    ("archer", "M", dict(head="hood", arm_item="bow", pants="wood_d")),
    ("swordsman", "M", dict(head="helm_iron", arm_item="sword", pants="wood_d", shield="wood_l")),
    ("pikeman", "M", dict(head="helm_iron", arm_item="pike", pants="dgrey")),
    ("musketeer", "G", dict(head="tricorn", arm_item="musket", pants="offwhite")),
    ("grenadier", "G", dict(head="shako", arm_item="musket", pants="offwhite", pack="wood_d")),
    ("cannon_crew", "G", dict(head="tricorn", arm_item="rammer", pants="offwhite")),
    ("rifleman", "I", dict(head="helmet_ww", arm_item="rifle", pants="olive_d", pack="khaki")),
    ("machine_gunner", "I", dict(head="helmet_ww", arm_item="mg", pants="olive_d")),
    ("mortar_team", "I", dict(head="helmet_ww", arm_item="mortar", pants="olive_d", pack="khaki")),
    ("soldier", "Mo", dict(head="helmet_modern", arm_item="modern_rifle", pants="camo", pack="olive")),
    ("special_forces", "Mo", dict(head="beret", arm_item="modern_rifle", pants="black")),
    ("sniper", "Mo", dict(head="boonie", arm_item="sniper", pants="camo")),
    ("engineer", "Mo", dict(head="hardhat", arm_item="wrench", pants="camo", pack="metal_d")),
    ("medic", "Mo", dict(head="medic", arm_item="medkit", pants="camo", pack="white")),
    ("paratrooper", "Mo", dict(head="helmet_modern", arm_item="modern_rifle", pants="camo", pack="khaki")),
    ("exo_soldier", "F", dict(head="visor", arm_item="plasma", pants="metal_d", bulky=True)),
    ("sapper", "M", dict(head="hood", arm_item="satchel", pants="wood_d", pack="canvas_d")),
    ("demolition_team", "I", dict(head="helmet_ww", arm_item="satchel", pants="olive_d", pack="canvas_d")),
    ("tunneller", "I", dict(head="lamp", arm_item="drill", pants="dgrey", pack="metal_d")),
    ("slinger", "T", dict(head="band", arm_item="club", pants="mud", cloth_d="mud_d")),
    ("hunter", "T", dict(head="hood", arm_item="bow", pants="wood_d", cloth="olive_d")),
    ("crossbowman", "M", dict(head="helm_iron", arm_item="bow", pants="wood_d", pack="wood_d")),
    ("man_at_arms", "M", dict(head="helm_knight", arm_item="sword", pants="dgrey", shield="metal")),
    ("halberdier", "M", dict(head="helm_iron", arm_item="pike", pants="wood_d", cloth_d="red_d")),
    ("line_infantry", "G", dict(head="shako", arm_item="musket", pants="offwhite", cloth_d="red_d")),
    ("skirmisher", "G", dict(head="tricorn", arm_item="rifle", pants="olive_d", cloth="green_d")),
    ("stormtrooper", "I", dict(head="helmet_ww", arm_item="rifle", pants="camo", pack="khaki", bulky=True)),
    ("flamethrower", "I", dict(head="helmet_ww", arm_item="flamer", pants="olive_d", pack="metal_d")),
    ("heavy_gunner", "Mo", dict(head="helmet_modern", arm_item="mg", pants="camo", pack="olive", bulky=True)),
    ("at_team", "Mo", dict(head="helmet_modern", arm_item="launcher", pants="camo", pack="olive")),
    ("scout", "Mo", dict(head="boonie", arm_item="modern_rifle", pants="khaki")),
    ("officer", "Mo", dict(head="beret", arm_item="sabre", pants="dgrey", cloth_d="gold_d")),
    ("drone_operator", "F", dict(head="visor", arm_item="tablet", pants="metal_d")),
    ("power_armour", "F", dict(head="visor", arm_item="plasma", pants="metal", bulky=True, pack="metal_l")),
]
RIDERS = [("knight", "M", "helm_knight", "lance", "offwhite"), ("light_cavalry", "G", "shako", "sabre", "wood"), ("horse_archer", "T", "band", "bow", "wood_l")]
FRAMES = ["idle", "walk1", "walk2", "attack", "dead"]

CIVS = [
    ("walker_tribal", "T", dict(head="none", arm_item="none", cloth="mud", cloth_d="mud_d", pants="mud_d")),
    ("walker_medieval", "M", dict(head="hat", arm_item="none", cloth="green_d", cloth_d="leaf_d", pants="wood_d")),
    ("walker_gunpowder", "G", dict(head="tricorn", arm_item="none", cloth="navy", cloth_d="black", pants="offwhite")),
    ("walker_industrial", "I", dict(head="hat", arm_item="none", cloth="dgrey", cloth_d="black", pants="black")),
    ("walker_modern", "Mo", dict(head="none", arm_item="none", cloth="teal", cloth_d="blue", pants="navy")),
    ("walker_future", "F", dict(head="none", arm_item="none", cloth="white", cloth_d="lgrey", pants="dgrey")),
    ("worker_carrying", "I", dict(head="hat", arm_item="box", cloth="brick", cloth_d="brick_d", pants="navy")),
    ("farmer", "M", dict(head="strawhat", arm_item="hoe", cloth="offwhite", cloth_d="canvas_d", pants="wood")),
    ("miner", "I", dict(head="lamp", arm_item="pick", cloth="dgrey", cloth_d="black", pants="navy")),
    ("trader", "M", dict(head="hat", arm_item="bag", cloth="purple", cloth_d="navy", pants="wood_d")),
    ("tourist", "Mo", dict(head="none", arm_item="camera", cloth="pink", cloth_d="red", pants="sand_d")),
    ("builder", "I", dict(head="hardhat", arm_item="wrench", cloth="orange", cloth_d="red_d", pants="navy")),
    ("docker", "I", dict(head="hat", arm_item="box", cloth="navy", cloth_d="black", pants="dgrey")),
    ("fisher", "M", dict(head="hood", arm_item="bag", cloth="teal", cloth_d="blue", pants="wood_d")),
    ("herder", "T", dict(head="strawhat", arm_item="club", cloth="canvas_d", cloth_d="mud", pants="mud_d")),
    ("shopkeeper", "G", dict(head="hat", arm_item="box", cloth="offwhite", cloth_d="canvas_d", pants="black")),
    ("scientist", "Mo", dict(head="none", arm_item="tablet", cloth="white", cloth_d="lgrey", pants="navy")),
    ("nurse", "Mo", dict(head="medic", arm_item="medkit", cloth="white", cloth_d="offwhite", pants="teal")),
    ("teacher", "I", dict(head="none", arm_item="box", cloth="purple", cloth_d="navy", pants="black")),
    ("priest", "M", dict(head="hood", arm_item="none", cloth="offwhite", cloth_d="canvas_d", pants="canvas_d")),
    ("refugee", "I", dict(head="hood", arm_item="bag", cloth="dirt", cloth_d="mud_d", pants="mud")),
]


def crowd():
    c = C(16, 16, 9)
    for (x, y, col) in ((2, 6, "red"), (6, 4, "blue"), (10, 6, "green"), (4, 9, "yellow"), (9, 9, "purple"), (12, 10, "teal")):
        c.rect(x, y + 2, 3, 3, col)
        c.rect(x, y, 3, 2, "skin")
        c.px(x, y, "hair"); c.px(x + 1, y, "hair")
    c.outline(.4)
    return c


ERA_ICON = {
    "T": ["..x..", "..x..", ".xxx.", "..x..", "..x.."],
    "M": ["....x", "...x.", "x.x..", ".x...", "x.x.."],
    "G": [".....", "xxxxx", "x.x..", "..x..", "....."],
    "I": ["..x..", ".xxx.", "xxxxx", "x...x", "....."],
    "Mo": [".xxx.", "xxxxx", "x...x", ".....", "....."],
    "F": ["x...x", ".x.x.", "..x..", ".x.x.", "x...x"],
}


def stack_marker(era, state):
    c = C(16, 16, 3)
    if state == "selected":
        c.ring(8, 8, 8, "yellow", 1.4)
    c.disc(8, 8, 6.6, T2)
    c.disc(8, 8, 5.6, T0)
    c.disc(7.6, 7.6, 3.8, T1)
    pat = ERA_ICON[era]
    for y, row in enumerate(pat):
        for x, ch in enumerate(row):
            if ch == "x":
                c.px(6 + x, 5 + y, "white")
    if state == "moving":
        c.poly([(12, 11), (16, 13.5), (12, 16)], "white")
    if state == "fighting":
        c.line(1, 1, 5, 5, "red"); c.line(5, 1, 1, 5, "red")
    return c


def supply_marker(era):
    c = C(16, 16, 4)
    c.rect(1, 3, 14, 10, T2); c.rect(2, 4, 12, 8, "offwhite")
    if era == "T":
        c.rect(5, 6, 4, 4, "wood_l"); c.vline(9, 5, 10, "wood_d")
    elif era in ("M", "G"):
        c.rect(4, 6, 7, 3, "wood"); c.px(5, 9, "black"); c.px(9, 9, "black"); c.hline(11, 12, 7, "wood_d")
    elif era in ("I", "Mo"):
        c.rect(4, 5, 5, 4, "olive"); c.rect(9, 6, 3, 3, "olive_d"); c.px(5, 9, "black"); c.px(10, 9, "black")
    else:
        c.rect(6, 7, 4, 2, "metal"); c.hline(3, 12, 6, "metal_l"); c.px(3, 5, "neon2"); c.px(12, 5, "neon2")
    c.rect(1, 13, 14, 2, T0)
    c.outline(.35)
    return c


DIRS = {"e": "faces east, flip for west", "s": "faces south, toward camera", "n": "faces north, away from camera"}


def build():
    for (n, era, kw) in INFANTRY:
        for d in DIRS:
            for f in FRAMES[:4]:
                im = person(f, **kw) if d == "e" else person_fb(f, d, **kw)
                add(f"{n}_{d}_{f}", "units", "infantry", im, era=era, state=d, frame=f, tags=["team"], family=n, note=DIRS[d])
        add(f"{n}_dead", "units", "infantry", person("dead", **kw), era=era, frame="dead", tags=["team"], family=n)
    for (n, era, head, item, col) in RIDERS:
        for d in DIRS:
            for f in FRAMES[:4]:
                im = rider(f, head, item, col=col) if d == "e" else rider_fb(f, d, head, item, col=col)
                add(f"{n}_{d}_{f}", "units", "cavalry", im, era=era, state=d, frame=f, tags=["team"], family=n, note=DIRS[d])
        add(f"{n}_dead", "units", "cavalry", rider("dead", head, item, col=col), era=era, frame="dead", tags=["team"], family=n)
    for (n, era, kw) in CIVS:
        for d in DIRS:
            for f in ("idle", "walk1", "walk2"):
                im = person(f, **kw) if d == "e" else person_fb(f, d, **kw)
                add(f"{n}_{d}_{f}", "people", "civilians", im, era=era, state=d, frame=f, family=n, note=DIRS[d])
    add("crowd", "people", "civilians", crowd(), era="G")
    for era in ERA_ICON:
        for st in ("idle", "selected", "moving", "fighting"):
            add(f"army_{era}_{st}", "markers", "army_stacks", stack_marker(era, st), era=era, state=st, tags=["team", "count_label_by_game"], family=f"army_{era}")
        add(f"supply_{era}", "markers", "supply_convoys", supply_marker(era), era=era, tags=["team"])
