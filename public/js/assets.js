import { loadAtlas } from "./render/atlas.js";

let assets = null;
export const loadAssets = async () => (assets ??= await Promise.all([
  loadAtlas("/assets/sheets", ["markers", "mapicons", "terrain", "overlays", "civic", "military", "industry", "transport", "housing", "commercial", "resources", "agriculture", "effects", "people", "units", "vehicles", "ships", "energy", "aircraft", "tourism", "features"]),
  fetch("/assets/terrain/palettes.json").then(r => r.json()),
]).then(([atlas, pal]) => ({ atlas, palettes: pal.seasons })));

const gzCache = new Map(), depCache = new Map();

export const depositsGz = async (dir, hash) => {
  if (!depCache.has(hash)) {
    const r = await fetch(`/${dir}/deposits.bin.gz?v=${hash}`);
    depCache.set(hash, r.ok ? new Uint8Array(await r.arrayBuffer()) : null);
  }
  return depCache.get(hash);
};

export const terrainGz = async (dir, hash) => {
  if (!gzCache.has(hash)) {
    const r = await fetch(`/${dir}/terrain.bin.gz?v=${hash}`);
    if (!r.ok) throw new Error(`The map file ${dir}/terrain.bin.gz is missing on the server.`);
    gzCache.set(hash, new Uint8Array(await r.arrayBuffer()));
  }
  return gzCache.get(hash);
};
