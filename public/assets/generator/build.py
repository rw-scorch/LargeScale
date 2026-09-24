import os
import json
import base64
import io
import shutil
from PIL import Image
from core import REG, add, TEAM, TEAM_PREVIEW, hx, ERAS
import specs_a, specs_b, specs_c, specs_d, specs_e, variants
from bldg import render, st_construction, st_damaged, st_rubble, lights, rise_of
import sets, people, vehicles, fx, ui, terrain, lots, features, defences, extra, pack2

OUT = os.environ.get("OUT", "output")


def buildings():
    variants.build()
    for i, (sid, cat, era, fp, states, kw) in enumerate(specs_a.SPECS):
        lot = kw.get("ground") if kw.get("ground") in lots.LOTS else None
        R = rise_of(kw)
        common = dict(era=era, fp=fp, family=sid, rise=R, lot=lot)
        img, boxes = render(kw, i + 7)
        frames = kw.get("frames", [])
        add(sid, cat, cat, img, state="active", frame=0 if frames else None, **common)
        for k, over in enumerate(frames):
            fimg, _ = render(dict(kw, **over), i + 7)
            add(f"{sid}_{k + 1}", cat, cat, fimg, state="active", frame=k + 1, **common)
        if states:
            add(f"{sid}_construction", cat, cat, st_construction(kw, boxes, i), state="construction", **common)
            add(f"{sid}_damaged", cat, cat, st_damaged(img, i), state="damaged", **common)
            add(f"{sid}_rubble", cat, cat, st_rubble(img, kw, boxes, i), state="rubble", **common)
        lit = lights(kw, i + 7)
        if lit is not None:
            add(f"{sid}_lights", cat, cat, lit, state="lights", note="night overlay: draw on top after night tint", **common)


def pil(r):
    return Image.fromarray(r["img"].a, "RGBA")


def pack(items, maxw=512):
    items = sorted(items, key=lambda r: (-r["img"].h, -r["img"].w, r["id"]))
    x = y = rowh = 0
    pos = {}
    for r in items:
        w, h = r["img"].w, r["img"].h
        if x + w > maxw:
            x = 0; y += rowh + 1; rowh = 0
        pos[r["id"]] = (x, y)
        x += w + 1
        rowh = max(rowh, h)
    H = y + rowh
    sheet = Image.new("RGBA", (maxw, H), (0, 0, 0, 0))
    for r in items:
        sheet.alpha_composite(pil(r), pos[r["id"]])
    return sheet, pos


def family(r):
    if r["family"]:
        return r["family"]
    sid = r["id"]
    if "autotile" in r["tags"]:
        return r["group"]
    if sid.endswith("_shadow"):
        sid = sid[:-7]
    if r["state"] and sid.endswith("_" + r["state"]):
        sid = sid[:-len(r["state"]) - 1]
    if r["frame"] is not None:
        for suf in ("_" + str(r["frame"]), "_rotor" + str(r["frame"])):
            if sid.endswith(suf):
                sid = sid[:-len(suf)]
    return sid


def meta(r):
    m = {"id": r["id"], "family": family(r), "category": r["cat"], "group": r["group"], "w": r["img"].w, "h": r["img"].h, "footprint": r["fp"]}
    for k in ("era", "state", "frame", "note"):
        if r[k] is not None:
            m[k] = r[k] if k != "era" else ERAS.get(r[k], r[k])
    if r["tags"]:
        m["tags"] = r["tags"]
    if r["rise"]:
        m["rise"] = r["rise"]
    if r["lot"]:
        m["lot"] = r["lot"]
    return m


def main():
    buildings()
    sets.build(); lots.build(); features.build(); defences.build(); people.build(); vehicles.build(); fx.build(); ui.build(); terrain.build(); extra.build(); pack2.build()
    ids = [r["id"] for r in REG]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
    for sub in ("sprites", "sheets", "terrain"):
        if os.path.exists(os.path.join(OUT, sub)):
            shutil.rmtree(os.path.join(OUT, sub))
    os.makedirs(OUT, exist_ok=True)
    cats = []
    for r in REG:
        if r["cat"] not in cats:
            cats.append(r["cat"])
    manifest = {"tile": 16, "team_colours": TEAM, "categories": {}, "sprites": []}
    atlas_js = {}
    for cat in cats:
        items = [r for r in REG if r["cat"] == cat]
        for r in items:
            d = os.path.join(OUT, "sprites", cat, r["group"])
            os.makedirs(d, exist_ok=True)
            pil(r).save(os.path.join(d, r["id"] + ".png"))
        sheet, pos = pack(items, 512 if cat not in ("ui", "mapicons", "markers", "lots") else 256)
        os.makedirs(os.path.join(OUT, "sheets"), exist_ok=True)
        sheet.save(os.path.join(OUT, "sheets", f"{cat}.png"))
        frames = {}
        for r in items:
            m = meta(r)
            m["file"] = f"sprites/{cat}/{r['group']}/{r['id']}.png"
            m["sheet"] = f"sheets/{cat}.png"
            m["x"], m["y"] = pos[r["id"]]
            frames[r["id"]] = {"x": m["x"], "y": m["y"], "w": m["w"], "h": m["h"]}
            manifest["sprites"].append(m)
        with open(os.path.join(OUT, "sheets", f"{cat}.json"), "w") as f:
            json.dump({"image": f"{cat}.png", "size": list(sheet.size), "frames": frames}, f, indent=1)
        manifest["categories"][cat] = len(items)
        buf = io.BytesIO(); sheet.save(buf, "PNG")
        atlas_js[cat] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    pal = terrain.palettes()
    os.makedirs(os.path.join(OUT, "terrain"), exist_ok=True)
    with open(os.path.join(OUT, "terrain", "palettes.json"), "w") as f:
        json.dump({"note": "5 shades per terrain, darkest first; pick shade per map pixel from noise", "seasons": pal}, f, indent=1)
    with open(os.path.join(OUT, "terrain", "terrain_gameplay_additions.json"), "w") as f:
        json.dump({"note": "gameplay values for the terrain types added with the feature pack. Append them to the end of your terrain table so saved maps keep their indexes.",
                   "types": [dict(name=k, **v) for k, v in terrain.NEW_TYPE_RULES.items()]}, f, indent=1)
    maps = {}
    for s in terrain.SEASON_SHIFT:
        im = Image.fromarray(terrain.sample_map(s), "RGBA")
        im.save(os.path.join(OUT, "terrain", f"sample_map_{s}.png"))
        buf = io.BytesIO(); im.save(buf, "PNG")
        maps[s] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    sw = Image.new("RGBA", (len(terrain.BASE) * 12, len(pal) * 5 * 4), (0, 0, 0, 0))
    for si, s in enumerate(pal):
        for ti, t in enumerate(terrain.BASE):
            for k, col in enumerate(pal[s][t]):
                c = hx(col)
                for yy in range(4):
                    for xx in range(12):
                        sw.putpixel((ti * 12 + xx, si * 20 + k * 4 + yy), c)
    sw.save(os.path.join(OUT, "terrain", "palette_swatches.png"))
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    lite = [{k: m[k] for k in ("id", "family", "category", "group", "w", "h", "footprint", "era", "state", "frame", "tags", "note", "x", "y", "file", "rise", "lot") if k in m} for m in manifest["sprites"]]
    with open(os.path.join(OUT, "data.js"), "w") as f:
        f.write("window.PACK=" + json.dumps({"sheets": atlas_js, "sprites": lite, "maps": maps, "palettes": pal, "team": TEAM, "teamPreview": TEAM_PREVIEW}, separators=(",", ":")) + ";")
    print(len(REG), "sprites", {c: manifest["categories"][c] for c in cats})


if __name__ == "__main__":
    main()
