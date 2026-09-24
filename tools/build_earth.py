import argparse
import json
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

TERRAIN = ["deep_ocean", "ocean", "shallows", "lake", "river", "coral_reef", "beach", "desert", "dunes", "salt_flat", "dry_earth",
           "savanna", "steppe", "grassland", "plains", "meadow", "scrub", "forest", "pine_forest", "jungle", "swamp", "marsh",
           "mangrove", "hills", "highlands", "mountain", "high_mountain", "snow_peak", "cliff", "volcano", "lava", "tundra", "snow",
           "glacier", "sea_ice", "farmland", "cleared", "scorched", "crater", "rubble", "urban"]
T = {n: i for i, n in enumerate(TERRAIN)}

KOPPEN = {1: "jungle", 2: "jungle", 3: "savanna", 4: "desert", 5: "desert", 6: "steppe", 7: "steppe", 8: "scrub", 9: "scrub",
          10: "grassland", 11: "grassland", 12: "grassland", 13: "meadow", 14: "forest", 15: "forest", 16: "meadow", 17: "scrub",
          18: "forest", 19: "pine_forest", 20: "pine_forest", 21: "forest", 22: "forest", 23: "pine_forest", 24: "pine_forest",
          25: "forest", 26: "forest", 27: "pine_forest", 28: "pine_forest", 29: "tundra", 30: "glacier"}


class Proj:
    def __init__(self, w, h, north, south):
        self.w, self.h, self.north, self.south = w, h, north, south

    def xy(self, lon, lat):
        return (lon + 180.0) / 360.0 * self.w, (self.north - lat) / (self.north - self.south) * self.h

    def lat(self, row):
        return self.north - (row + 0.5) / self.h * (self.north - self.south)


def open_layer(path):
    """Yield (geometry dict, record dict) from a .geojson or a .shp, so either works."""
    if path.endswith(".shp") or os.path.exists(path + ".shp"):
        import shapefile
        r = shapefile.Reader(path[:-4] if path.endswith(".shp") else path)
        fields = [f[0] for f in r.fields[1:]]
        for sr in r.iterShapeRecords():
            yield sr.shape.__geo_interface__, dict(zip(fields, sr.record))
    else:
        data = json.load(open(path, encoding="utf-8"))
        for f in data["features"]:
            yield f["geometry"], f.get("properties", {})


def rings(geom):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        for p in geom["coordinates"]:
            yield p


def raster_polygons(path, proj, value=1, into=None):
    img = Image.new("L", (proj.w, proj.h), 0) if into is None else into
    d = ImageDraw.Draw(img)
    for geom, _rec in open_layer(path):
        for poly in rings(geom):
            d.polygon([proj.xy(*pt[:2]) for pt in poly[0]], fill=value)
            for hole in poly[1:]:
                d.polygon([proj.xy(*pt[:2]) for pt in hole], fill=0)
    return img if into is not None else np.array(img, dtype=bool)


def raster_bathymetry(folder, proj):
    """Natural Earth bathymetry polygons, deepest first, give sea depth without any elevation raster."""
    import glob
    layers = []
    for p in sorted(glob.glob(os.path.join(folder, "ne_*_bathymetry_*.shp"))) or sorted(glob.glob(os.path.join(folder, "ne_*_bathymetry_*.geojson"))):
        name = os.path.basename(p)
        depth = None
        for geom, rec in open_layer(p):
            depth = rec.get("depth")
            break
        if depth is None:
            digits = "".join(c for c in name.split("_")[-1] if c.isdigit())
            depth = int(digits or 0)
        layers.append((int(depth), p))
    if not layers:
        return None
    layers.sort()  # shallow first, deeper polygons are nested inside and drawn on top
    depth_img = Image.new("I", (proj.w, proj.h), 0)
    d = ImageDraw.Draw(depth_img)
    for depth, p in layers:
        for geom, _rec in open_layer(p):
            for poly in rings(geom):
                d.polygon([proj.xy(*pt[:2]) for pt in poly[0]], fill=int(depth))
    return -np.array(depth_img, dtype=np.int32).astype(np.float32)


def raster_lines(path, proj, width=1):
    img = Image.new("L", (proj.w, proj.h), 0)
    d = ImageDraw.Draw(img)
    for g, _rec in open_layer(path):
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
        for ln in lines:
            pts = [proj.xy(*pt[:2]) for pt in ln]
            if len(pts) > 1:
                d.line(pts, fill=1, width=width)
    return np.array(img, dtype=bool)


def load_raster(path, proj, nearest=False):
    if path.endswith(".npy"):
        a = np.load(path).astype(np.float32)
    elif path.endswith(".nc"):
        import h5py
        with h5py.File(path, "r") as f:
            name = next((k for k in ("z", "elevation", "Band1", "band1") if k in f), None)
            if name is None:
                name = sorted(k for k in f.keys() if getattr(f[k], "ndim", 0) == 2)[0]
            a = np.array(f[name], dtype=np.float32)
        if a.shape[0] > 1 and a[0, 0] == a[0, 0]:
            a = np.flipud(a)
    else:
        try:
            Image.MAX_IMAGE_PIXELS = None
            img = Image.open(path)
            a = np.array(img, dtype=np.float32)  # palette images keep their class indexes
        except Exception:
            import tifffile
            a = tifffile.imread(path).astype(np.float32)
    if a.shape != (proj.h, proj.w):
        rows_per_deg = a.shape[0] / 180.0
        top = int(round((90 - proj.north) * rows_per_deg))
        bottom = int(round((90 - proj.south) * rows_per_deg))
        if 0 <= top < bottom <= a.shape[0] and (top or bottom != a.shape[0]):
            a = a[top:bottom]
        mode = Image.NEAREST if nearest else Image.BILINEAR
        a = np.array(Image.fromarray(a).resize((proj.w, proj.h), mode), dtype=np.float32)
    return a


def distance_to(mask):
    from scipy import ndimage
    return ndimage.distance_transform_edt(~mask)


def fake_elevation(land, proj, seed=3):
    rng = np.random.default_rng(seed)
    inland = distance_to(~land)
    sea = distance_to(land)
    noise = np.zeros(land.shape, np.float32)
    for scale, amp in ((64, 900), (24, 500), (8, 200)):
        g = rng.random((proj.h // scale + 2, proj.w // scale + 2)).astype(np.float32)
        noise += np.array(Image.fromarray(g).resize((proj.w, proj.h), Image.BICUBIC)) * amp
    ridge = np.clip(noise - 900, 0, None) * 3.0
    e = np.where(land, 10 + np.minimum(inland, 40) * 6 + ridge, -sea * 60 - 50)
    return e.astype(np.float32)


REGION_LIFT = {"Range/mtn": 2100, "Plateau": 900, "Basin": -120, "Plain": -40, "Delta": -60}


def natural_elevation(land, proj, regions_path, points_path=None, seed=3):
    """A plausible land surface built from Natural Earth's own named regions and peaks,
    for when a real elevation raster is not to hand."""
    from scipy import ndimage
    h, w = land.shape
    lift = np.zeros((h, w), np.float32)
    for name, metres in REGION_LIFT.items():
        img = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(img)
        found = False
        for geom, rec in open_layer(regions_path):
            cls = rec.get("FEATURECLA") or rec.get("featurecla")
            if cls != name:
                continue
            found = True
            for poly in rings(geom):
                d.polygon([proj.xy(*pt[:2]) for pt in poly[0]], fill=1)
        if found:
            lift += np.array(img, dtype=np.float32) * metres
    lift = ndimage.gaussian_filter(lift, sigma=max(1, proj.w / 600))
    if points_path:
        for geom, rec in open_layer(points_path):
            metres = rec.get("elevation") or rec.get("ELEVATION") or 0
            if not metres or geom["type"] != "Point":
                continue
            x, y = proj.xy(*geom["coordinates"][:2])
            x, y = int(x), int(y)
            if not (0 <= x < w and 0 <= y < h):
                continue
            r = max(2, int(proj.w / 900))
            for dy in range(-r * 2, r * 2 + 1):
                for dx in range(-r * 2, r * 2 + 1):
                    px_, py_ = x + dx, y + dy
                    if 0 <= px_ < w and 0 <= py_ < h:
                        fall = math.exp(-(dx * dx + dy * dy) / (2.0 * r * r))
                        lift[py_, px_] = max(lift[py_, px_], float(metres) * 0.55 * fall)
    rng = np.random.default_rng(seed)
    noise = np.zeros((h, w), np.float32)
    for scale, amp in ((48, 150), (16, 55)):
        g = rng.random((h // scale + 2, w // scale + 2)).astype(np.float32)
        noise += np.array(Image.fromarray(g).resize((w, h), Image.BICUBIC)) * amp
    coast = distance_to(~land)
    base = 40 + np.clip(coast, 0, 20) * 4
    return np.where(land, base + lift + noise - 110, -60).astype(np.float32)


def desert_mask(regions_path, proj):
    img = Image.new("L", (proj.w, proj.h), 0)
    d = ImageDraw.Draw(img)
    for geom, rec in open_layer(regions_path):
        cls = rec.get("FEATURECLA") or rec.get("featurecla")
        if cls != "Desert":
            continue
        for poly in rings(geom):
            d.polygon([proj.xy(*pt[:2]) for pt in poly[0]], fill=1)
    return np.array(img, dtype=bool)


def classify(land, lakes, rivers, elev, koppen, proj, seed=5, deserts=None):
    h, w = land.shape
    t = np.full((h, w), T["ocean"], np.uint8)
    sea_dist = distance_to(land)
    t[(~land) & (elev < -1500)] = T["deep_ocean"]
    t[(~land) & (elev >= -120)] = T["shallows"]
    t[(~land) & (sea_dist <= 1.5)] = T["shallows"]
    lat = np.array([proj.lat(r) for r in range(h)], np.float32)[:, None].repeat(w, 1)
    alat = np.abs(lat)
    t[(~land) & (alat > 70)] = T["sea_ice"]
    rng = np.random.default_rng(seed)
    moist = np.array(Image.fromarray(rng.random((h // 16 + 2, w // 16 + 2)).astype(np.float32)).resize((w, h), Image.BICUBIC))
    coast = distance_to(~land)
    if koppen is not None:
        base = np.full((h, w), T["grassland"], np.uint8)
        for code, name in KOPPEN.items():
            base[koppen == code] = T[name]
    else:
        base = np.full((h, w), T["grassland"], np.uint8)
        scale = proj.w / 360.0
        wet = 0.35 * moist + 0.65 * np.exp(-coast / (8 * scale))
        hadley = np.exp(-((alat - 24) / 9) ** 2)
        wet = wet - 0.45 * hadley + 0.25 * np.exp(-(alat / 8) ** 2)
        base[:] = T["grassland"]
        base[wet < 0.35] = T["steppe"]
        base[wet < 0.2] = T["desert"]
        base[(alat < 23) & (wet >= 0.35)] = T["savanna"]
        base[(alat < 12) & (wet >= 0.5)] = T["jungle"]
        base[(alat >= 35) & (alat < 58) & (wet >= 0.45)] = T["forest"]
        base[(alat >= 23) & (alat < 35) & (wet >= 0.45)] = T["scrub"]
        base[(alat >= 50) & (alat < 67) & (wet >= 0.2)] = T["pine_forest"]
        base[alat >= 67] = T["tundra"]
        base[alat >= 80] = T["glacier"]
    base[(alat >= 58) & (elev > 1500)] = T["glacier"]
    if deserts is not None:
        base[deserts & (alat < 45)] = T["desert"]
    land_t = base.copy()
    land_t[elev > 600] = T["hills"]
    land_t[(elev > 1200)] = T["highlands"]
    land_t[elev > 2000] = T["mountain"]
    land_t[elev > 3200] = T["high_mountain"]
    land_t[(elev > 4500) | ((elev > 2600) & (alat > 45))] = T["snow_peak"]
    land_t[base == T["glacier"]] = T["glacier"]
    desertish = np.isin(base, [T["desert"], T["steppe"]])
    land_t[(coast <= 1) & ~desertish & (elev < 30)] = T["beach"]
    land_t[(coast <= 1) & desertish] = T["beach"]
    t[land] = land_t[land]
    if lakes is not None:
        t[lakes & land] = T["lake"]
    if rivers is not None:
        t[rivers & land & (t != T["lake"])] = T["river"]
    return t


def preview(terrain, palettes, path, season="summer"):
    pal = palettes[season]
    lut = np.zeros((len(TERRAIN), 5, 3), np.uint8)
    for i, n in enumerate(TERRAIN):
        for k, c in enumerate(pal[n]):
            lut[i, k] = [int(c[j:j + 2], 16) for j in (1, 3, 5)]
    rng = np.random.default_rng(1)
    shade = np.clip((rng.random(terrain.shape) * 3.2 + 0.4).astype(int), 0, 4)
    Image.fromarray(lut[terrain, shade]).save(path)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the Earth terrain map for Large Scale")
    ap.add_argument("--land", required=True)
    ap.add_argument("--lakes")
    ap.add_argument("--rivers")
    ap.add_argument("--elevation", help="elevation in metres: GeoTIFF readable by Pillow, or .npy")
    ap.add_argument("--koppen", help="Koppen class raster (Beck et al. 1-30 codes)")
    ap.add_argument("--bathymetry", help="folder of Natural Earth bathymetry layers, used instead of an elevation raster at sea")
    ap.add_argument("--glaciers", help="ne_10m_glaciated_areas layer")
    ap.add_argument("--reefs", help="ne_10m_reefs layer")
    ap.add_argument("--playas", help="ne_10m_playas layer")
    ap.add_argument("--regions", help="ne_10m_geography_regions_polys, used for mountains, plateaus and deserts")
    ap.add_argument("--peaks", help="ne_10m_geography_regions_elevation_points, used to raise real summits")
    ap.add_argument("--palettes", default="../../../assets/terrain/palettes.json")
    ap.add_argument("--width", type=int, default=3600)
    ap.add_argument("--north", type=float, default=84)
    ap.add_argument("--south", type=float, default=-60)
    ap.add_argument("--out", default="earth_out")
    a = ap.parse_args(argv)
    height = int(round(a.width * (a.north - a.south) / 360))
    proj = Proj(a.width, height, a.north, a.south)
    os.makedirs(a.out, exist_ok=True)
    land = raster_polygons(a.land, proj)
    lakes = raster_polygons(a.lakes, proj) if a.lakes else None
    rivers = raster_lines(a.rivers, proj) if a.rivers else None
    sea = raster_bathymetry(a.bathymetry, proj) if a.bathymetry else None
    if a.elevation:
        elev = load_raster(a.elevation, proj)
    else:
        elev = natural_elevation(land, proj, a.regions, a.peaks) if a.regions else fake_elevation(land, proj)
        if sea is not None:
            elev = np.where(land, elev, sea)
    extras = {}
    for key, path in (("glaciers", a.glaciers), ("reefs", a.reefs), ("playas", a.playas)):
        if path:
            extras[key] = raster_polygons(path, proj)
    kop = load_raster(a.koppen, proj, nearest=True).astype(np.int32) if a.koppen else None
    deserts = desert_mask(a.regions, proj) if a.regions else None
    terrain = classify(land, lakes, rivers, elev, kop, proj, deserts=deserts)
    if "glaciers" in extras:
        terrain[extras["glaciers"] & land] = T["glacier"]
    if "reefs" in extras:
        terrain[extras["reefs"] & ~land] = T["coral_reef"]
    if "playas" in extras:
        terrain[extras["playas"] & land] = T["salt_flat"]
    terrain.tofile(os.path.join(a.out, "terrain.bin"))
    np.clip(elev, -32768, 32767).astype("<i2").tofile(os.path.join(a.out, "elevation.bin"))
    counts = {TERRAIN[i]: int(c) for i, c in enumerate(np.bincount(terrain.ravel(), minlength=len(TERRAIN))) if c}
    meta = {"w": proj.w, "h": proj.h, "north": a.north, "south": a.south, "projection": "equirectangular",
            "terrain": TERRAIN, "land_share": round(float(land.mean()), 4), "counts": counts,
            "fake_elevation": not a.elevation, "elevation_from_regions": bool(a.regions and not a.elevation), "sea_from_bathymetry": bool(a.bathymetry and not a.elevation),
            "extras": sorted(extras.keys())}
    json.dump(meta, open(os.path.join(a.out, "meta.json"), "w"), indent=1)
    if os.path.exists(a.palettes):
        preview(terrain, json.load(open(a.palettes))["seasons"], os.path.join(a.out, "preview.png"))
    print(json.dumps({k: meta[k] for k in ("w", "h", "land_share", "fake_elevation")}))
    return meta


if __name__ == "__main__":
    main()
