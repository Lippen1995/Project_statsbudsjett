export type Point = [number, number];
export type Point3 = [number, number, number];
export type HeightStatus = "osm-height" | "levels-estimate" | "unknown";
export interface Feature {
  id: string;
  name: string;
  kind: "building" | "road" | "landmark";
  center: Point;
  location: Point;
  elevation: number;
  tags: Record<string, string>;
}
export interface Building extends Feature {
  kind: "building";
  rings: Point[][];
  height: number | null;
  heightStatus: HeightStatus;
  ground?: number[][];
}
export interface Road extends Feature {
  kind: "road";
  points: Point3[];
  roadClass: string;
  renderStatus?: "surface" | "unresolved-bridge" | "subsurface";
}
export interface CityData {
  version: 1;
  origin: Point;
  bounds: [number, number, number, number];
  extent: [number, number, number, number];
  provenance: {
    importedAt: string;
    osmTimestamp: string;
    osmEndpoint: string;
    osmSha256: string;
    elevation: string;
    terrainResolution: number;
    terrainTiles: {
      url: string;
      sha256: string;
      imagerySources?: string;
      lastModified?: string;
    }[];
    notes: string[];
    refinement?: {
      baselineCommit: string;
      terrainSource: string;
      rasterSha256: string;
      contextSha256: string;
      landcoverFeatures: number;
      importer: string;
    };
  };
  terrain: { positions: number[]; indices: number[]; cover?: number[] };
  coastline: Point[][];
  coastElevation?: number[][];
  water: { rings: Point[][]; elevation: number }[];
  buildings: Building[];
  roads: Road[];
  landmarks: Feature[];
}

// Reject incompatible or incomplete snapshots before allocating GPU resources.
export function parseCityData(value: unknown): CityData {
  if (!value || typeof value !== "object")
    throw new Error("Missing geographic data.");
  const data = value as CityData;
  if (
    data.version !== 1 ||
    !Array.isArray(data.buildings) ||
    !data.buildings.length ||
    !Array.isArray(data.roads) ||
    !Array.isArray(data.landmarks) ||
    !data.terrain?.positions?.length ||
    data.terrain.positions.length % 3 !== 0 ||
    !data.terrain.indices?.length ||
    !data.coastline?.length ||
    !data.provenance?.osmSha256 ||
    data.terrain.positions.some((v) => !Number.isFinite(v)) ||
    (data.terrain.cover &&
      (data.terrain.cover.length !== data.terrain.positions.length / 3 ||
        data.terrain.cover.some((v) => ![0, 1, 2].includes(v)))) ||
    data.buildings.some(
      (b) =>
        b.ground &&
        (b.ground.length !== b.rings.length ||
          b.ground.some(
            (ring, i) =>
              ring.length !== b.rings[i].length ||
              ring.some((v) => !Number.isFinite(v)),
          )),
    ) ||
    data.terrain.indices.some(
      (v) =>
        !Number.isInteger(v) || v < 0 || v >= data.terrain.positions.length / 3,
    )
  ) {
    throw new Error(
      "The Bergen snapshot is incomplete or incompatible. No substitute geography was loaded.",
    );
  }
  return data;
}
