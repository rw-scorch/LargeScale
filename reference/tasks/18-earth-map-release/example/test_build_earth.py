import json
import os
import tempfile
import numpy as np
import build_earth as be

HERE = os.path.dirname(os.path.abspath(__file__))


def test_110m():
    out = tempfile.mkdtemp()
    proj = be.Proj(720, 288, 84, -60)
    land = be.raster_polygons(os.path.join(HERE, "data", "ne_110m_land.geojson"), proj)
    flat = os.path.join(out, "flat.npy")
    elev = np.where(land, 100.0, -3000.0).astype(np.float32)
    gx0, gy0 = proj.xy(-50, 80)
    gx1, gy1 = proj.xy(-25, 65)
    box = elev[int(gy0):int(gy1), int(gx0):int(gx1)]
    box[box > 0] = 2500.0
    np.save(flat, elev)
    meta = be.main(["--land", os.path.join(HERE, "data", "ne_110m_land.geojson"), "--elevation", flat,
                    "--lakes", os.path.join(HERE, "data", "ne_110m_lakes.geojson"),
                    "--rivers", os.path.join(HERE, "data", "ne_110m_rivers_lake_centerlines.geojson"),
                    "--width", "720", "--palettes", os.path.join(HERE, "..", "..", "..", "assets", "terrain", "palettes.json"),
                    "--out", out])
    t = np.fromfile(os.path.join(out, "terrain.bin"), dtype=np.uint8).reshape(meta["h"], meta["w"])
    assert meta["h"] == 288
    assert 0.25 < meta["land_share"] < 0.34
    def at(lon, lat):
        x, y = proj.xy(lon, lat)
        return be.TERRAIN[t[int(y), int(x)]]

    def share(name, lon0, lon1, lat0, lat1):
        x0, y0 = proj.xy(lon0, lat1)
        x1, y1 = proj.xy(lon1, lat0)
        box = t[int(y0):int(y1), int(x0):int(x1)]
        landbox = box[~np.isin(box, [be.T[n] for n in ("ocean", "deep_ocean", "shallows", "lake", "river")])]
        return float((landbox == be.T[name]).mean()) if landbox.size else 0.0

    assert at(-30, 0) in ("ocean", "deep_ocean")
    assert share("desert", -5, 25, 18, 28) > 0.6, share("desert", -5, 25, 18, 28)
    assert share("jungle", -70, -50, -10, 2) > 0.4, share("jungle", -70, -50, -10, 2)
    assert share("pine_forest", 60, 120, 55, 65) > 0.5, share("pine_forest", 60, 120, 55, 65)
    assert at(-40, 75) == "glacier", at(-40, 75)
    assert share("glacier", 80, 140, 66, 74) < 0.1
    assert os.path.exists(os.path.join(out, "preview.png"))
    print("ok", meta["counts"].get("desert"), meta["counts"].get("jungle"))


if __name__ == "__main__":
    test_110m()
