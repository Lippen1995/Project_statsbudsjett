import { BufferAttribute, BufferGeometry } from "three";
import type { CityData } from "../geo/types";
import type { FeatureRange } from "../geo/geometry";
import catalogue from "./catalogue.json";
export { catalogue };
export const assetIds = new Set(catalogue.buildings.map((b) => b.id));

/** Render-only compatibility check. Never changes placement geography or saved inputs. */
export function assertAssetSnapshot(data: CityData) {
  for (const record of catalogue.buildings) {
    const b = data.buildings.find((b) => b.id === record.id);
    if (
      !b ||
      JSON.stringify(b.rings) !== JSON.stringify(record.footprint) ||
      b.height !== record.sourceHeight ||
      b.elevation !== record.sourceElevation
    )
      throw new Error(
        "Architectural asset/source mismatch; original geometry retained.",
      );
  }
}

/** One index buffer replaces matching ranges atomically; source attributes stay immutable. */
export function fallbackWithoutAssets(source: {
  geometry: BufferGeometry;
  ranges: FeatureRange[];
}) {
  if (source.geometry.index) throw new Error("Expected unindexed source batch");
  const indices: number[] = [],
    ranges: FeatureRange[] = [];
  let start = 0;
  for (const r of source.ranges) {
    if (!assetIds.has(r.feature.id)) {
      for (let i = start * 3; i < r.end * 3; i++) indices.push(i);
      ranges.push({ end: indices.length / 3, feature: r.feature });
    }
    start = r.end;
  }
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.geometry.attributes))
    geometry.setAttribute(name, attribute);
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.boundingSphere = source.geometry.boundingSphere?.clone() ?? null;
  return { geometry, ranges };
}

/** Geographic tile hysteresis, evaluated only on already-requested scene frames. */
export function architecturalLod(
  distance: number,
  active: boolean,
  balanced: boolean,
) {
  return (
    balanced &&
    Number.isFinite(distance) &&
    distance >= 0 &&
    distance < (active ? 750 : 600)
  );
}
