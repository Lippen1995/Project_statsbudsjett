import type { CityData } from "./types";

export type SurfaceSampler = (x: number, z: number) => number | null;

// Spatial index of the *rendered* TIN, so road edges follow its triangles rather
// than a different DEM interpolation. Null explicitly means outside mapped land.
export function terrainSampler(terrain: CityData["terrain"]): SurfaceSampler {
  const { positions: p, indices: ids } = terrain;
  const size = 32,
    bins = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += 3) {
    const a = ids[i] * 3,
      b = ids[i + 1] * 3,
      c = ids[i + 2] * 3;
    for (
      let x = Math.floor(Math.min(p[a], p[b], p[c]) / size);
      x <= Math.floor(Math.max(p[a], p[b], p[c]) / size);
      x++
    )
      for (
        let z = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / size);
        z <= Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / size);
        z++
      ) {
        const key = `${x},${z}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key)!.push(i);
      }
  }
  return (x, z) => {
    for (const i of bins.get(
      `${Math.floor(x / size)},${Math.floor(z / size)}`,
    ) ?? []) {
      const a = ids[i] * 3,
        b = ids[i + 1] * 3,
        c = ids[i + 2] * 3;
      const den =
        (p[b + 2] - p[c + 2]) * (p[a] - p[c]) +
        (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
      if (Math.abs(den) < 1e-8) continue;
      const u =
        ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) /
        den;
      const v =
        ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) /
        den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
        return u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1];
    }
    return null;
  };
}
