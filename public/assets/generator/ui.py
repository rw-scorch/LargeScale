import math
from core import C, hx, shade, mix, add, TEAM, P

T0, T1, T2 = TEAM


def ingot(c, col):
    c.poly([(3, 11), (5, 6), (11, 6), (13, 11)], col)
    c.poly([(5, 6), (11, 6), (10, 8), (6, 8)], shade(col, .3))
    c.hline(3, 12, 11, shade(col, -.3))


def mound(c, col, speck):
    c.poly([(1, 13), (4, 6), (8, 3), (12, 6), (15, 13)], "stone")
    c.poly([(4, 6), (8, 3), (10, 5), (6, 8)], "stone_l")
    for (x, y) in ((6, 9), (9, 7), (11, 10), (5, 12), (9, 11)):
        c.px(x, y, speck); c.px(x + 1, y, shade(speck, .3))


def arrow_up(c, col, x=8, y=2, h=12):
    c.poly([(x - 5, y + 5), (x, y), (x + 5, y + 5)], col)
    c.rect(x - 2, y + 5, 4, h - 5, col)


def person_icon(c, col):
    c.disc(8, 4.5, 2.5, "skin"); c.poly([(3, 15), (4, 9), (12, 9), (13, 15)], col)


def gear(c, col):
    for i in range(8):
        a = i * .785
        c.rect(8 + math.cos(a) * 5 - 1, 8 + math.sin(a) * 5 - 1, 3, 3, col)
    c.disc(8, 8, 5, col)
    clr_disc(c, 8, 8, 2)


def swords(c):
    c.line(2, 13, 13, 2, "metal_l"); c.line(2, 2, 13, 13, "metal_l")
    c.line(3, 9, 6, 12, "gold"); c.line(9, 12, 12, 9, "gold")


def bubble(c, col="white"):
    c.rect(2, 3, 12, 8, col); c.poly([(4, 10), (4, 14), (8, 10)], col)


def clr(c, x0, y0, x1, y1):
    c.a[y0:y1, x0:x1] = 0


def clr_disc(c, cx, cy, r):
    for y in range(16):
        for x in range(16):
            if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r:
                c.a[y, x] = 0


def moon(c):
    c.disc(8, 8, 6, "lit")
    clr_disc(c, 10.5, 6, 5)


def help_icon(c):
    c.disc(8, 8, 7, "purple")
    c.hline(6, 9, 3, "white"); c.px(5, 4, "white"); c.px(10, 4, "white"); c.px(10, 5, "white"); c.px(9, 6, "white"); c.px(8, 7, "white")
    c.rect(7, 8, 2, 2, "white"); c.rect(7, 11, 2, 2, "white")


def sell_icon(c):
    c.poly([(2, 7), (14, 7), (12, 15), (4, 15)], "wood_l")
    c.rect(7, 2, 2, 6, "orange"); c.poly([(4, 3), (8, -1), (12, 3)], "orange")


R = {}


def icon(name):
    def deco(fn):
        R[name] = fn
        return fn
    return deco


# resources
R["res_money"] = lambda c: (c.disc(8, 8, 6, "gold", .4), c.disc(8, 8, 4, "gold_d"), c.disc(8, 8, 3, "gold"), c.rect(7, 5, 2, 6, "gold_d"))
R["res_food"] = lambda c: (c.ellipse(8, 9, 6.5, 4, "wood_l"), c.ellipse(8, 8, 5.5, 3, "straw"), c.line(5, 7, 6, 9, "wood"), c.line(8, 6, 9, 9, "wood"), c.line(11, 7, 12, 9, "wood"))
R["res_wood"] = lambda c: (c.rect(2, 5, 10, 7, "wood"), c.hline(2, 11, 5, "wood_l"), c.disc(12, 8.5, 3.6, "straw", .3), c.ring(12, 8.5, 2, "wood_l"))
R["res_stone"] = lambda c: (c.poly([(2, 13), (3, 6), (8, 3), (14, 6), (14, 13)], "stone"), c.poly([(3, 6), (8, 3), (14, 6), (8, 8)], "stone_l"))
R["res_clay"] = lambda c: (c.rect(2, 6, 12, 6, "clay"), c.hline(2, 13, 6, shade("clay", .25)), c.vline(7, 6, 11, "brick_d"))
R["res_iron"] = lambda c: ingot(c, "metal")
R["res_copper"] = lambda c: ingot(c, "orange")
R["res_tin"] = lambda c: ingot(c, "lgrey")
R["res_gold"] = lambda c: ingot(c, "gold")
R["res_silver"] = lambda c: ingot(c, "offwhite")
R["res_steel"] = lambda c: (c.rect(2, 3, 12, 2, "metal_l"), c.rect(7, 5, 2, 6, "metal"), c.rect(2, 11, 12, 2, "metal_d"))
R["res_coal"] = lambda c: (c.poly([(2, 12), (4, 6), (9, 4), (14, 8), (13, 13)], "black"), c.px(6, 7, "grey"), c.px(10, 6, "dgrey"), c.px(9, 10, "grey"))
R["res_oil"] = lambda c: (c.poly([(8, 1), (13, 9), (8, 15), (3, 9)], "black"), c.disc(8, 10, 5, "black"), c.px(6, 8, "grey"), c.px(6, 9, "dgrey"))
R["res_fuel"] = lambda c: (c.rect(3, 4, 10, 11, "red"), c.rect(9, 2, 3, 2, "dgrey"), c.line(4, 5, 12, 14, "red_d"), c.line(12, 5, 4, 14, "red_d"))
R["res_gas"] = lambda c: (c.poly([(8, 1), (13, 10), (8, 15), (3, 10)], "blue"), c.poly([(8, 6), (11, 11), (8, 14), (5, 11)], "neon2"))
R["res_power"] = lambda c: c.poly([(9, 1), (3, 9), (7, 9), (6, 15), (13, 6), (9, 6)], "yellow")
R["res_water"] = lambda c: (c.poly([(8, 1), (13, 9), (8, 15), (3, 9)], "water_l"), c.disc(8, 10, 5, "water_l"), c.px(6, 8, "white"))
R["res_goods"] = lambda c: (c.rect(2, 4, 12, 10, "wood_l"), c.frame(2, 4, 12, 10, "wood_d"), c.line(2, 4, 13, 13, "wood_d"), c.line(13, 4, 2, 13, "wood_d"))
R["res_tools"] = lambda c: (c.line(3, 13, 10, 6, "wood"), c.line(4, 13, 11, 6, "wood"), c.rect(9, 2, 5, 3, "metal"), c.rect(11, 5, 2, 2, "metal_d"))
R["res_weapons"] = lambda c: (c.line(3, 13, 12, 4, "metal_l"), c.line(4, 13, 13, 4, "metal"), c.line(3, 9, 7, 13, "gold"))
R["res_ammo"] = lambda c: [(c.rect(x, 6, 2, 8, "gold_d"), c.rect(x, 4, 2, 2, "dgrey")) for x in (3, 7, 11)]
R["res_uranium"] = lambda c: (c.poly([(2, 12), (4, 6), (9, 3), (14, 8), (13, 13)], "green_l"), c.disc(8, 8, 2.5, "yellow"))
R["res_electronics"] = lambda c: (c.rect(4, 4, 8, 8, "green_d"), [c.px(x, y, "gold") for x in (2, 13) for y in (5, 8, 11)], c.rect(6, 6, 4, 4, "black"))
R["res_gems"] = lambda c: (c.poly([(4, 5), (12, 5), (15, 8), (8, 15), (1, 8)], "teal"), c.poly([(4, 5), (12, 5), (10, 8), (6, 8)], "neon2"))
R["res_fish"] = lambda c: (c.ellipse(7, 8, 5, 3, "metal"), c.poly([(11, 8), (15, 5), (15, 11)], "metal"), c.px(4, 7, "black"))
R["res_population"] = lambda c: person_icon(c, "teal")
R["res_troops"] = lambda c: (c.ellipse(8, 9, 6, 4, "olive"), c.rect(2, 9, 12, 2, "olive_d"), c.hline(1, 14, 11, "olive_d"))
R["res_happiness"] = lambda c: (c.disc(8, 8, 6.5, "yellow", .3), c.px(6, 6, "black"), c.px(10, 6, "black"), c.hline(5, 11, 10, "black"), c.px(4, 9, "black"), c.px(12, 9, "black"))
R["res_research"] = lambda c: (c.rect(6, 2, 4, 5, "glass_l"), c.poly([(6, 7), (2, 14), (14, 14), (10, 7)], "glass_l"), c.poly([(4, 11), (3, 14), (13, 14), (12, 11)], "green_l"))
R["res_tourism"] = lambda c: (c.rect(2, 5, 12, 9, "dgrey"), c.rect(5, 3, 4, 2, "dgrey"), c.disc(8, 9.5, 3, "glass"), c.px(12, 6, "red"))
R["res_trade"] = lambda c: (c.poly([(2, 5), (7, 1), (7, 3), (13, 3), (13, 7), (7, 7), (7, 9)], "green"), c.poly([(14, 11), (9, 7), (9, 9), (3, 9), (3, 13), (9, 13), (9, 15)], "orange"))
R["res_influence"] = lambda c: (c.vline(3, 2, 14, "dgrey"), c.poly([(4, 2), (14, 5), (4, 9)], T0))

# alerts
R["alert_attack"] = lambda c: (c.disc(8, 8, 7.5, "red_d"), swords(c))
R["alert_starving"] = lambda c: (c.disc(8, 8, 7.5, "orange"), c.ellipse(8, 10, 5, 2.5, "offwhite"), c.hline(3, 13, 9, "wood"))
R["alert_no_power"] = lambda c: (c.disc(8, 8, 7.5, "dgrey"), c.poly([(9, 2), (4, 9), (7, 9), (6, 14), (12, 6), (9, 6)], "yellow"), c.line(2, 2, 13, 13, "red"))
R["alert_no_fuel"] = lambda c: (c.disc(8, 8, 7.5, "dgrey"), c.rect(5, 5, 6, 7, "red"), c.line(2, 2, 13, 13, "white"))
R["alert_trade"] = lambda c: (c.rect(3, 3, 10, 11, "canvas"), c.hline(3, 12, 3, "canvas_d"), [c.hline(5, 10, y, "wood_d") for y in (6, 8, 10)])
R["alert_research_done"] = lambda c: (R["res_research"](c), c.px(12, 2, "yellow"), c.px(13, 3, "yellow"), c.px(11, 3, "yellow"), c.px(12, 4, "yellow"))
R["alert_offline"] = moon
R["alert_built"] = lambda c: (c.disc(8, 8, 7.5, "green_d"), c.line(4, 8, 7, 11, "white"), c.line(7, 11, 12, 5, "white"))
R["alert_era_up"] = lambda c: (c.disc(8, 8, 7.5, "gold_d"), arrow_up(c, "white", 8, 2, 12))
R["alert_nuke"] = lambda c: (c.disc(8, 8, 7.5, "yellow"), c.disc(8, 8, 1.5, "black"), [c.poly([(8, 8), (8 + 6 * math.cos(a - .5), 8 + 6 * math.sin(a - .5)), (8 + 6 * math.cos(a + .5), 8 + 6 * math.sin(a + .5))], "black") for a in (-1.57, .52, 2.62)])
R["alert_ally"] = lambda c: (c.disc(8, 8, 7.5, "blue"), c.ring(6, 8, 3.5, "white", 1.5), c.ring(10, 8, 3.5, "white", 1.5))

# diplomacy
R["dip_alliance"] = lambda c: (c.ring(6, 8, 4.5, "gold", 2), c.ring(10, 8, 4.5, "gold", 2))
R["dip_war"] = lambda c: swords(c)
R["dip_treaty"] = lambda c: (c.rect(3, 2, 10, 12, "canvas"), c.rect(2, 2, 12, 2, "canvas_d"), c.rect(2, 13, 12, 2, "canvas_d"), [c.hline(5, 10, y, "wood_d") for y in (6, 8)], c.disc(10, 11, 1.5, "red"))
R["dip_embargo"] = lambda c: (R["res_goods"](c), c.ring(8, 8, 7.5, "red", 1.5), c.line(3, 3, 12, 12, "red"))
R["dip_peace"] = lambda c: (c.vline(3, 1, 14, "wood"), c.rect(4, 2, 9, 6, "white"), c.hline(4, 12, 7, "offwhite"))
R["dip_faction"] = lambda c: (c.vline(3, 1, 14, "gold_d"), c.poly([(4, 2), (13, 2), (13, 10), (8.5, 8), (4, 10)], T0), c.rect(7, 4, 3, 3, "gold"))
R["dip_declare"] = lambda c: (c.rect(2, 3, 12, 10, "red_d"), swords(c))

# market
R["mkt_buy"] = lambda c: (c.poly([(2, 7), (14, 7), (12, 15), (4, 15)], "wood_l"), c.poly([(8, 1), (12, 5), (4, 5)], "green"), c.rect(7, 4, 2, 5, "green"))
R["mkt_sell"] = sell_icon
R["price_up"] = lambda c: (c.poly([(8, 2), (14, 9), (2, 9)], "green"), c.rect(6, 9, 4, 5, "green"))
R["price_down"] = lambda c: (c.poly([(8, 14), (14, 7), (2, 7)], "red"), c.rect(6, 2, 4, 5, "red"))
R["price_flat"] = lambda c: (c.rect(2, 7, 9, 3, "lgrey"), c.poly([(10, 4), (15, 8.5), (10, 13)], "lgrey"))
R["mkt_tab_resources"] = lambda c: R["res_goods"](c)
R["mkt_tab_upgrades"] = lambda c: (c.disc(8, 8, 7, "gold_d"), arrow_up(c, "white", 8, 2, 12))
R["mkt_tab_info"] = lambda c: (c.ellipse(8, 8, 7, 4.5, "white"), c.disc(8, 8, 3, "blue"), c.disc(8, 8, 1.5, "black"))
R["mkt_chart"] = lambda c: (c.rect(2, 2, 12, 12, "navy"), c.line(3, 11, 6, 7, "green_l"), c.line(6, 7, 9, 9, "green_l"), c.line(9, 9, 13, 4, "green_l"))

# chat
R["chat_bubble"] = lambda c: bubble(c)
R["chat_typing"] = lambda c: (bubble(c), [c.rect(x, 6, 2, 2, "dgrey") for x in (4, 7, 10)])
R["chat_global"] = lambda c: (c.disc(8, 8, 7, "water", .3), c.poly([(4, 4), (8, 3), (9, 7), (5, 9)], "green"), c.poly([(9, 10), (13, 8), (12, 13)], "green"))
R["chat_faction"] = lambda c: R["dip_faction"](c)
R["chat_private"] = lambda c: (c.rect(1, 4, 14, 9, "offwhite"), c.line(1, 4, 8, 9, "lgrey"), c.line(14, 4, 8, 9, "lgrey"))
R["chat_send"] = lambda c: (c.poly([(1, 7), (15, 2), (10, 14), (8, 9)], "white"), c.line(8, 9, 15, 2, "lgrey"))
R["chat_emote"] = lambda c: R["res_happiness"](c)

# flag editor
R["tool_pencil"] = lambda c: (c.line(3, 12, 12, 3, "yellow"), c.line(4, 13, 13, 4, "gold_d"), c.px(2, 13, "black"), c.px(3, 13, "wood_l"), c.rect(12, 2, 2, 2, "pink"))
R["tool_fill"] = lambda c: (c.poly([(3, 6), (8, 2), (13, 7), (8, 12)], "metal_l"), c.poly([(3, 6), (8, 11), (8, 12)], "metal_d"), c.disc(13, 12, 2, "blue"), c.px(13, 9, "blue"))
R["tool_eraser"] = lambda c: (c.poly([(2, 10), (8, 4), (14, 9), (8, 15)], "pink"), c.poly([(2, 10), (5, 7), (11, 12), (8, 15)], "white"))
R["tool_eyedrop"] = lambda c: (c.line(3, 13, 10, 6, "glass_l"), c.line(4, 13, 11, 6, "glass_l"), c.disc(12, 4, 2.5, "dgrey"), c.px(3, 13, "red"))
R["tool_undo"] = lambda c: (c.ring(9, 9, 5, "white", 2), clr(c, 0, 9, 8, 16), c.poly([(1, 8), (6, 4), (6, 12)], "white"))
R["tool_redo"] = lambda c: (c.ring(7, 9, 5, "white", 2), clr(c, 8, 9, 16, 16), c.poly([(15, 8), (10, 4), (10, 12)], "white"))
R["tool_grid"] = lambda c: ([c.vline(x, 1, 14, "lgrey") for x in (1, 5, 10, 14)], [c.hline(1, 14, y, "lgrey") for y in (1, 5, 10, 14)])
R["tool_clear"] = lambda c: (c.rect(3, 4, 10, 10, "lgrey"), c.rect(2, 2, 12, 2, "dgrey"), c.rect(6, 1, 4, 1, "dgrey"), [c.vline(x, 6, 12, "dgrey") for x in (5, 8, 11)])
R["tool_mirror"] = lambda c: (c.vline(8, 1, 14, "white"), c.poly([(2, 8), (6, 4), (6, 12)], "lgrey"), c.poly([(14, 8), (10, 4), (10, 12)], "lgrey"))

# bulk upgrade and building
R["upg_sort"] = lambda c: [c.rect(2, y, w, 2, "white") for (y, w) in ((3, 4), (7, 8), (11, 12))]
R["upg_select_all"] = lambda c: ([c.px(x, 1, "white") for x in range(1, 15, 2)], [c.px(x, 14, "white") for x in range(1, 15, 2)], [c.px(1, y, "white") for y in range(1, 15, 2)], [c.px(14, y, "white") for y in range(1, 15, 2)], c.line(4, 8, 7, 11, "green_l"), c.line(7, 11, 12, 5, "green_l"))
R["upg_upgrade"] = lambda c: (arrow_up(c, "green_l", 8, 1, 14))
R["upg_filter"] = lambda c: c.poly([(1, 2), (15, 2), (10, 8), (10, 14), (6, 12), (6, 8)], "white")
R["upg_civilian"] = lambda c: (c.poly([(1, 8), (8, 2), (15, 8)], "tile"), c.rect(3, 8, 10, 7, "plaster"), c.rect(7, 11, 2, 4, "wood_d"))
R["upg_government"] = lambda c: (c.poly([(1, 6), (8, 2), (15, 6)], "stone_l"), [c.rect(x, 7, 2, 6, "white") for x in (3, 7, 11)], c.rect(1, 13, 14, 2, "stone"))
R["upg_military"] = lambda c: R["res_troops"](c)
R["upg_swipe"] = lambda c: (c.rect(2, 5, 12, 6, (240, 210, 90, 120)), c.frame(2, 5, 12, 6, "yellow"), c.poly([(10, 8), (14, 12), (11, 12), (13, 15)], "white"))
R["build_hammer"] = lambda c: (c.line(3, 14, 10, 7, "wood"), c.line(4, 14, 11, 7, "wood_l"), c.rect(7, 2, 8, 4, "metal"), c.rect(7, 2, 8, 1, "metal_l"))
R["build_demolish"] = lambda c: (c.line(3, 14, 10, 7, "wood"), c.poly([(5, 3), (13, 3), (14, 6), (12, 6), (10, 5), (7, 5)], "metal"), c.line(2, 2, 13, 13, "red"))
R["build_road"] = lambda c: (c.poly([(5, 1), (11, 1), (15, 15), (1, 15)], "asphalt"), [c.vline(8, y, y + 1, "yline") for y in (3, 7, 11)])
R["build_zone"] = lambda c: (c.rect(1, 1, 14, 14, (90, 200, 90, 160)), c.frame(1, 1, 14, 14, "green_l"))
R["build_rotate"] = lambda c: (c.ring(8, 8, 5.5, "white", 2), clr(c, 8, 0, 16, 8), c.poly([(8, 0), (13, 3), (8, 6)], "white"))

# general
R["ui_zoom_in"] = lambda c: (c.ring(7, 7, 5, "white", 1.5), c.line(10, 10, 14, 14, "white"), c.line(11, 10, 15, 14, "white"), c.hline(5, 9, 7, "white"), c.vline(7, 5, 9, "white"))
R["ui_zoom_out"] = lambda c: (c.ring(7, 7, 5, "white", 1.5), c.line(10, 10, 14, 14, "white"), c.line(11, 10, 15, 14, "white"), c.hline(5, 9, 7, "white"))
R["ui_menu"] = lambda c: [c.rect(2, y, 12, 2, "white") for y in (3, 7, 11)]
R["ui_settings"] = lambda c: gear(c, "lgrey")
R["ui_close"] = lambda c: (c.line(3, 3, 12, 12, "white"), c.line(4, 3, 13, 12, "white"), c.line(12, 3, 3, 12, "white"), c.line(13, 3, 4, 12, "white"))
R["ui_confirm"] = lambda c: (c.line(2, 8, 6, 12, "green_l"), c.line(3, 8, 7, 12, "green_l"), c.line(6, 12, 13, 3, "green_l"), c.line(7, 12, 14, 3, "green_l"))
R["ui_info"] = lambda c: (c.disc(8, 8, 7, "blue"), c.rect(7, 7, 2, 5, "white"), c.rect(7, 4, 2, 2, "white"))
R["ui_help"] = help_icon
R["ui_pause"] = lambda c: (c.rect(4, 3, 3, 10, "white"), c.rect(9, 3, 3, 10, "white"))
R["ui_play"] = lambda c: c.poly([(4, 2), (13, 8), (4, 14)], "white")
R["ui_fast"] = lambda c: (c.poly([(1, 3), (8, 8), (1, 13)], "white"), c.poly([(8, 3), (15, 8), (8, 13)], "white"))
R["ui_map"] = lambda c: (c.poly([(1, 3), (5, 2), (10, 4), (15, 3), (15, 13), (10, 14), (5, 12), (1, 13)], "sand"), c.vline(5, 2, 12, "sand_d"), c.vline(10, 4, 14, "sand_d"), c.px(12, 7, "red"))
R["ui_stats"] = lambda c: [c.rect(x, 15 - h, 3, h, col) for (x, h, col) in ((2, 5, "blue"), (6, 9, "green"), (10, 13, "orange"))]
R["ui_army"] = lambda c: (c.vline(4, 1, 15, "wood_d"), c.poly([(5, 1), (14, 3.5), (5, 7)], T0))
R["ui_lock"] = lambda c: (c.ring(8, 6, 3.5, "lgrey", 1.5), c.rect(3, 7, 10, 8, "gold"), c.rect(7, 9, 2, 3, "gold_d"))
R["ui_unlock"] = lambda c: (c.ring(8, 4, 3.5, "lgrey", 1.5), clr(c, 8, 4, 12, 8), c.rect(3, 7, 10, 8, "gold"), c.rect(7, 9, 2, 3, "gold_d"))
R["ui_eye"] = lambda c: R["mkt_tab_info"](c)
R["ui_flag"] = lambda c: (c.vline(3, 1, 15, "dgrey"), c.rect(4, 2, 10, 7, T0), c.rect(4, 2, 5, 4, T1))
R["ui_colour"] = lambda c: [c.disc(x, y, 3, col) for (x, y, col) in ((5, 5, "red"), (11, 5, "yellow"), (5, 11, "blue"), (11, 11, "green"))]
R["ui_profile"] = lambda c: person_icon(c, T0)
R["ui_trophy"] = lambda c: (c.poly([(3, 2), (13, 2), (12, 8), (8, 10), (4, 8)], "gold"), c.rect(7, 10, 2, 3, "gold_d"), c.rect(4, 13, 8, 2, "gold_d"))
R["ui_dev"] = lambda c: (c.rect(1, 2, 14, 12, "black"), c.line(3, 5, 6, 8, "green_l"), c.line(6, 8, 3, 11, "green_l"), c.hline(8, 12, 11, "green_l"))


def draw_icon(name):
    c = C(16, 16, 1)
    R[name](c)
    c.outline_outer()
    return c


ERA_COL = {"T": "wood", "M": "stone", "G": "tile", "I": "dgrey", "Mo": "blue", "F": "teal"}
ROMAN = {"T": "I", "M": "II", "G": "III", "I": "IV", "Mo": "V", "F": "VI"}
GLYPH = {"I": ["x", "x", "x", "x", "x"], "V": ["x...x", "x...x", ".x.x.", ".x.x.", "..x.."]}


def era_badge(era):
    c = C(24, 24, 2)
    c.disc(12, 12, 11, "gold_d"); c.disc(12, 12, 9.6, ERA_COL[era], .35); c.ring(12, 12, 8, "gold")
    s = ROMAN[era]
    glyphs = []
    for ch in s:
        glyphs.append(GLYPH[ch])
    w = sum(len(g[0]) for g in glyphs) + len(glyphs) - 1
    x = 12 - w // 2
    for g in glyphs:
        for y, row in enumerate(g):
            for i, ch in enumerate(row):
                if ch == "x":
                    c.px(x + i, 10 + y, "white")
        x += len(g[0]) + 1
    c.outline(.4)
    return c


def nine(kind):
    c = C(16, 16, 3)
    spec = {
        "panel": ("#2e3440", "#4c566a", "#1f232b"), "panel_light": ("#d8cfb8", "#f0e8d2", "#a89c80"),
        "button_normal": ("#3f6fb5", "#5d8fd0", "#284a7a"), "button_hover": ("#4f82cc", "#76a6e6", "#2f5690"),
        "button_pressed": ("#2f5690", "#284a7a", "#5d8fd0"), "button_disabled": ("#6a6a70", "#808088", "#4c4c55"),
        "button_danger": ("#b5403a", "#d0605a", "#7a2a26"), "button_confirm": ("#4f9a45", "#70bc64", "#336b2c"),
        "tab_active": ("#3a4252", "#5a6680", "#3a4252"), "tab_inactive": ("#262b35", "#343b48", "#1b1f27"),
        "input_field": ("#14171d", "#0c0e12", "#3a4252"), "tooltip": ("#fff4d0", "#ffffff", "#b8a878"),
        "chat_bubble_self": ("#3f6fb5", "#5d8fd0", "#284a7a"), "chat_bubble_other": ("#e8e4da", "#ffffff", "#a8a49a"),
        "listing_row": ("#262b35", "#303644", "#1b1f27"), "listing_row_selected": ("#3a4a2a", "#4f6a38", "#26331b"),
    }[kind]
    base, hi, lo = spec
    c.rect(1, 1, 14, 14, base)
    c.hline(1, 14, 1, hi); c.vline(1, 1, 14, hi)
    c.hline(1, 14, 14, lo); c.vline(14, 1, 14, lo)
    c.frame(0, 0, 16, 16, "#0e1014")
    for (x, y) in ((0, 0), (15, 0), (0, 15), (15, 15)):
        c.a[y, x] = 0
    if kind.startswith("tab_") and kind.endswith("active"):
        c.hline(1, 14, 15, base)
    return c


def tech_node(state):
    c = C(24, 24, 4)
    col = {"locked": ("dgrey", "grey"), "available": ("navy", "yellow"), "researched": ("green_d", "gold"), "in_progress": ("navy", "neon2")}[state]
    c.rect(1, 1, 22, 22, col[0]); c.frame(1, 1, 22, 22, col[1]); c.frame(0, 0, 24, 24, "black")
    c.frame(3, 3, 18, 18, shade(col[0], .15))
    if state == "locked":
        c.ring(12, 10, 3, "lgrey", 1.3); c.rect(8, 11, 8, 6, "lgrey")
    if state == "researched":
        c.line(8, 12, 11, 15, "gold"); c.line(11, 15, 16, 8, "gold")
    if state == "in_progress":
        c.rect(4, 18, 9, 2, "neon2")
    return c


def cursor(k):
    c = C(16, 16, 5)
    if k == "default":
        c.poly([(1, 1), (1, 13), (4, 10), (7, 15), (9, 14), (6, 9), (11, 9)], "white")
    elif k == "move":
        for (a, b) in (((8, 0), (8, 15)), ((0, 8), (15, 8))):
            c.line(a[0], a[1], b[0], b[1], "white")
        for pts in ([(8, 0), (5, 3), (11, 3)], [(8, 15), (5, 12), (11, 12)], [(0, 8), (3, 5), (3, 11)], [(15, 8), (12, 5), (12, 11)]):
            c.poly(pts, "white")
    elif k == "attack":
        c.ring(8, 8, 6, "red", 1.5); c.hline(0, 4, 8, "red"); c.hline(11, 15, 8, "red"); c.vline(8, 0, 4, "red"); c.vline(8, 11, 15, "red"); c.px(8, 8, "red")
    elif k == "build":
        R["build_hammer"](c)
    elif k == "invalid":
        c.ring(8, 8, 7, "red", 2); c.line(3, 3, 12, 12, "red"); c.line(4, 3, 13, 12, "red")
    elif k == "select":
        c.poly([(1, 1), (1, 10), (3, 8), (5, 12), (7, 11), (5, 7), (8, 7)], "white")
        for x in range(8, 16, 2):
            c.px(x, 9, "yellow"); c.px(x, 15, "yellow")
        for y in range(9, 16, 2):
            c.px(8, y, "yellow"); c.px(15, y, "yellow")
    elif k == "paint":
        R["tool_pencil"](c)
    c.outline_outer("black")
    return c


def bar(kind):
    c = C(32, 6, 6)
    if kind == "frame":
        c.rect(0, 0, 32, 6, "black"); c.rect(1, 1, 30, 4, "#1f232b")
    else:
        col = {"green": "green", "red": "red", "yellow": "yellow", "blue": "blue", "team": T0}[kind]
        c.rect(0, 0, 30, 4, col)
        if kind != "team":
            c.hline(0, 29, 0, shade(col, .3)); c.hline(0, 29, 3, shade(col, -.25))
    return c


def slider(k):
    c = C(16, 16, 7)
    if k == "track":
        c.rect(0, 6, 16, 4, "#14171d"); c.hline(0, 15, 6, "#0c0e12")
    elif k == "knob":
        c.disc(8, 8, 5.5, "offwhite", .35); c.ring(8, 8, 5.5, "dgrey")
    elif k == "checkbox_off":
        c.rect(2, 2, 12, 12, "#14171d"); c.frame(2, 2, 12, 12, "lgrey")
    elif k == "checkbox_on":
        c.rect(2, 2, 12, 12, "blue"); c.frame(2, 2, 12, 12, "white"); c.line(4, 8, 7, 11, "white"); c.line(7, 11, 12, 5, "white")
    elif k == "radio_off":
        c.disc(8, 8, 5.5, "#14171d"); c.ring(8, 8, 5.5, "lgrey")
    elif k == "radio_on":
        c.disc(8, 8, 5.5, "#14171d"); c.ring(8, 8, 5.5, "white"); c.disc(8, 8, 2.8, "blue")
    return c


def minimap_frame():
    c = C(32, 32, 8)
    c.frame(0, 0, 32, 32, "#0e1014"); c.frame(1, 1, 30, 30, "gold_d"); c.frame(2, 2, 28, 28, "gold"); c.frame(3, 3, 26, 26, "#0e1014")
    for (x, y) in ((1, 1), (27, 1), (1, 27), (27, 27)):
        c.rect(x, y, 4, 4, "gold"); c.px(x + 1, y + 1, "white")
    return c


def radial(k):
    c = C(32, 32, 9)
    if k == "ring":
        c.ring(16, 16, 15, (30, 34, 43, 220), 9); c.ring(16, 16, 15, "gold_d", 1); c.ring(16, 16, 7, "gold_d", 1)
    else:
        c.disc(16, 16, 6, (30, 34, 43, 240)); c.ring(16, 16, 6, "gold")
    return c


MAPICON = {
    "housing": ("green", ["..x..", ".xxx.", "xxxxx", ".x.x.", ".xxx."]),
    "commercial": ("blue", ["xxxxx", "x.x.x", "xxxxx", ".x.x.", ".xxx."]),
    "industry": ("yellow", ["x....", "x.x.x", "xxxxx", "xxxxx", "xxxxx"]),
    "agriculture": ("gold", ["x.x.x", "x.x.x", "xxxxx", "..x..", "..x.."]),
    "energy": ("orange", ["..xx.", ".xx..", "xxxxx", "..xx.", ".xx.."]),
    "civic": ("purple", ["..x..", ".xxx.", "x.x.x", "x.x.x", "xxxxx"]),
    "transport": ("lgrey", ["xxxxx", "x...x", "xxxxx", ".x.x.", "....."]),
    "tourism": ("pink", ["..x..", "xxxxx", ".xxx.", ".x.x.", "x...x"]),
    "military": ("red", ["x...x", ".x.x.", "..x..", ".x.x.", "x...x"]),
    "infantry": (T0, ["..x..", ".xxx.", "..x..", ".x.x.", ".x.x."]),
    "vehicle": (T0, [".xxx.", "xxxxx", "xxxxx", "x...x", "....."]),
    "aircraft": (T0, ["..x..", "xxxxx", "..x..", ".xxx.", "....."]),
    "ship": (T0, ["..x..", "..xx.", "..x..", "xxxxx", ".xxx."]),
    "city": ("white", ["x.x.x", "xxxxx", "xxxxx", "xxxxx", "x.x.x"]),
    "capital": ("gold", ["..x..", "x.x.x", "xxxxx", "xxxxx", "....."]),
}


def map_icon(k):
    c = C(8, 8, 10)
    col, pat = MAPICON[k]
    c.rect(0, 0, 8, 8, "#14171d")
    for y, row in enumerate(pat):
        for x, ch in enumerate(row):
            if ch == "x":
                c.px(x + 1, y + 1, col)
    c.a[0, 0] = c.a[0, 7] = c.a[7, 0] = c.a[7, 7] = 0
    return c


def logo():
    c = C(64, 32, 11)
    c.rect(0, 4, 64, 24, "#1f232b"); c.frame(0, 4, 64, 24, "gold_d"); c.frame(1, 5, 62, 22, "gold")
    import random
    rng = random.Random(3)
    for y in range(8, 24):
        for x in range(4, 28):
            d = ((x - 16) / 11) ** 2 + ((y - 16) / 7) ** 2 + rng.random() * .25
            if d < 1:
                c.px(x, y, "green" if d < .7 else "sand")
            else:
                c.px(x, y, "water_d")
    c.rect(12, 12, 4, 4, T0); c.rect(18, 15, 3, 3, "red")
    for i, h in enumerate([6, 10, 14, 9, 12, 7]):
        c.rect(32 + i * 5, 24 - h, 4, h, "stone_l"); c.hline(32 + i * 5, 35 + i * 5, 24 - h, "white")
        for y in range(26 - h, 24, 2):
            c.px(33 + i * 5, y, "lit")
    return c


def build():
    for n in R:
        grp = n.split("_")[0]
        group = {"res": "resources", "alert": "alerts", "dip": "diplomacy", "mkt": "market", "price": "market", "chat": "chat", "tool": "flag_editor",
                 "upg": "bulk_upgrade", "build": "build_tools", "ui": "general"}[grp]
        add(n, "ui", group, draw_icon(n))
    for e in ERA_COL:
        add(f"era_badge_{e}", "ui", "eras", era_badge(e), era=e, fp=(1.5, 1.5))
    for k in ("panel", "panel_light", "button_normal", "button_hover", "button_pressed", "button_disabled", "button_danger", "button_confirm", "tab_active", "tab_inactive",
              "input_field", "tooltip", "chat_bubble_self", "chat_bubble_other", "listing_row", "listing_row_selected"):
        add(f"frame_{k}", "ui", "frames_9slice", nine(k), note="9-slice, 4px borders")
    for s in ("locked", "available", "in_progress", "researched"):
        add(f"tech_node_{s}", "ui", "tech_tree", tech_node(s), fp=(1.5, 1.5), note="9-slice, 6px borders")
    for k in ("default", "move", "attack", "build", "invalid", "select", "paint"):
        add(f"cursor_{k}", "ui", "cursors", cursor(k), note="hotspot top-left" if k in ("default", "select") else "hotspot centre")
    for k in ("frame", "green", "red", "yellow", "blue", "team"):
        add(f"bar_{k}", "ui", "bars", bar(k), fp=(2, .375), note="fill draws at 1,1 inside frame; stretch horizontally")
    for k in ("track", "knob", "checkbox_off", "checkbox_on", "radio_off", "radio_on"):
        add(f"ctl_{k}", "ui", "controls", slider(k))
    add("minimap_frame", "ui", "frames_9slice", minimap_frame(), fp=(2, 2), note="9-slice, 6px borders")
    add("radial_menu_ring", "ui", "mobile", radial("ring"), fp=(2, 2))
    add("radial_menu_centre", "ui", "mobile", radial("centre"), fp=(2, 2))
    for k in MAPICON:
        add(f"mapicon_{k}", "mapicons", "zoomed_out", map_icon(k), fp=(.5, .5), tags=["team"] if MAPICON[k][0] == T0 else [])
    add("logo_mark", "ui", "branding", logo(), fp=(4, 2), note="placeholder mark; no title text")
