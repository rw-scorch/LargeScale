import specs_a
from specs_a import SPECS

ROOFS = ["tile", "tile_d", "slate", "slate_l", "wood_d", "dgrey", "brick_d", "stone", "green_d", "teal"]
WALLS = ["plaster", "offwhite", "brick", "brick_l", "stone", "stone_l", "wood_l", "canvas", "sand", "concrete_l"]

VARY = {
    "hut_grass": [("roofc", "straw_d"), ("roofc", "olive")],
    "hut_mud": [("wallc", "clay"), ("wallc", "dirt")],
    "yurt": [("roofc", "offwhite"), ("roofc", "lgrey")],
    "longhouse": [("roofc", "straw_d"), ("wallc", "wood_d")],
    "cottage_timber": [("roofc", "straw_d"), ("roofc", "tile")],
    "cottage_stone": [("roofc", "tile_d"), ("wallc", "stone_l")],
    "farmhouse": [("roofc", "slate"), ("roofc", "wood_d")],
    "townhouse": [("roofc", "slate"), ("wallc", "offwhite")],
    "house_brick": [("roofc", "slate"), ("wallc", "brick_l")],
    "row_houses": [("roofc", "tile"), ("wallc", "plaster")],
    "manor": [("roofc", "tile_d"), ("wallc", "plaster")],
    "tenement": [("wallc", "brick_l"), ("roofc", "stone_d")],
    "terrace": [("roofc", "tile_d"), ("wallc", "brick_d")],
    "worker_housing": [("wallc", "brick_l"), ("roofc", "slate")],
    "house_suburban": [("roofc", "tile"), ("wallc", "sand")],
    "apartment_block": [("wallc", "sand"), ("wallc", "offwhite")],
    "villa": [("roofc", "tile"), ("wallc", "sand")],
    "general_store": [("roofc", "tile"), ("wallc", "plaster")],
    "bakery": [("roofc", "slate"), ("wallc", "stone_l")],
    "tavern": [("roofc", "thatch"), ("wallc", "wood_l")],
    "inn": [("roofc", "slate"), ("wallc", "stone")],
    "restaurant": [("roofc", "tile_d"), ("wallc", "plaster")],
    "cafe": [("roofc", "teal"), ("wallc", "offwhite")],
    "shop": [("roofc", "stone_d"), ("wallc", "brick_l")],
    "office_small": [("wallc", "concrete_l"), ("wallc", "stone_l")],
    "hotel": [("wallc", "stone_l"), ("roofc", "slate")],
    "motel": [("roofc", "teal"), ("wallc", "sand")],
    "school": [("roofc", "slate"), ("wallc", "brick_l")],
    "clinic": [("roofc", "teal"), ("wallc", "offwhite")],
    "police_station": [("roofc", "dgrey"), ("wallc", "brick_l")],
    "barn": [("wallc", "wood"), ("roofc", "tile_d")],
    "granary": [("roofc", "straw_d"), ("wallc", "wood")],
    "warehouse": [("roofc", "metal_l"), ("wallc", "concrete")],
    "trading_post": [("roofc", "thatch"), ("wallc", "wood_d")],
    "market_stall": [("roofc", "teal"), ("roofc", "blue")],
    "storage_yard": [("ground", "gravel"), ("ground", "dirt")],
}
SUFFIX = ["_b", "_c"]


def build():
    index = {row[0]: row for row in list(SPECS)}
    made = 0
    for sid, changes in VARY.items():
        row = index.get(sid)
        if not row:
            continue
        _, cat, era, fp, states, kw = row
        for i, (key, value) in enumerate(changes):
            new = dict(kw)
            new[key] = value
            new["variant_of"] = sid
            SPECS.append((sid + SUFFIX[i], cat, era, fp, states, new))
            made += 1
    return made
