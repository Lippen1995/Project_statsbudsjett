import { BufferAttribute, BufferGeometry } from "three";
import type { CityData } from "../geo/types";
import type { FeatureRange } from "../geo/geometry";
import catalogue from "./catalogue.json";

export { catalogue };
export const enhancementIds = new Set(catalogue.buildings.map((b) => b.id));

export function assertEnhancementSnapshot(data: CityData) {
  if (
    catalogue.version !== 1 ||
    catalogue.buildings.length > 16 ||
    JSON.stringify(data.origin) !== JSON.stringify(catalogue.origin) ||
    JSON.stringify(data.bounds) !== JSON.stringify(catalogue.bounds)
  )
    throw new Error(
      "Incompatible public-geodata pilot; original geometry retained.",
    );
  for (const r of catalogue.buildings) {
    const b = data.buildings.find((b) => b.id === r.id);
    if (
      !b ||
      b.height !== null ||
      b.heightStatus !== "unknown" ||
      b.elevation !== r.sourceElevation ||
      JSON.stringify(b.ground) !== JSON.stringify(r.sourceGround) ||
      ![undefined, "gabled"].includes(b.tags["roof:shape"]) ||
      JSON.stringify(b.rings) !== JSON.stringify(r.footprint)
    )
      throw new Error(
        "Public-geodata source mismatch; original geometry retained.",
      );
  }
}

/** Index view only. Handles the existing R1C index without copying source attributes. */
export function withoutEnhancements(source: {
  geometry: BufferGeometry;
  ranges: FeatureRange[];
}) {
  const index: number[] = [],
    ranges: FeatureRange[] = [];
  let start = 0;
  for (const r of source.ranges) {
    if (!enhancementIds.has(r.feature.id)) {
      for (let i = start * 3; i < r.end * 3; i++)
        index.push(source.geometry.index?.getX(i) ?? i);
      ranges.push({ end: index.length / 3, feature: r.feature });
    }
    start = r.end;
  }
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.geometry.attributes))
    geometry.setAttribute(name, attribute);
  geometry.setIndex(new BufferAttribute(new Uint32Array(index), 1));
  geometry.boundingSphere = source.geometry.boundingSphere?.clone() ?? null;
  return { geometry, ranges };
}
