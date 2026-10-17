import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import {
  makeBuildings,
  makeRoads,
  makeTerrain,
  makeWater,
  makeCoastalEdge,
  type FeatureRange,
} from "./geometry";
import { parseCityData, type CityData, type Feature } from "./types";
import { terrainSampler } from "./surface";
const LAYERS = ["buildings", "roads", "terrain", "water", "coast"] as const;
type Layer = (typeof LAYERS)[number];
export interface PackedGeometry {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint16Array | Uint32Array | null;
  sphere: [number, number, number, number];
}
export interface PreparedReply {
  version: 1;
  requestId: number;
  layers: Record<Layer, PackedGeometry>;
  ranges: {
    buildings: { id: string; end: number }[];
    roads: { id: string; end: number }[];
  };
  stages: { name: string; durationMs: number }[];
}
export interface PreparedCity {
  buildings: { geometry: BufferGeometry; ranges: FeatureRange[] };
  roads: { geometry: BufferGeometry; ranges: FeatureRange[] };
  terrain: BufferGeometry;
  water: BufferGeometry;
  coast: BufferGeometry;
}
const fail = () => {
  throw new Error("Invalid or unbounded geographic preparation message.");
};
export function prepareCity(value: unknown, requestId: number): PreparedReply {
  const data = parseCityData(value);
  if (
    !Number.isSafeInteger(requestId) ||
    requestId < 1 ||
    data.buildings.length > 10000 ||
    data.roads.length > 10000 ||
    data.terrain.positions.length > 300000 ||
    data.terrain.indices.length > 500000
  )
    fail();
  let points = 0;
  for (const b of data.buildings) {
    if (b.rings.length > 32) fail();
    points += b.rings.reduce((n, r) => n + r.length, 0);
  }
  for (const r of data.roads) points += r.points.length;
  if (data.water.length > 1000 || data.coastline.length > 1000) fail();
  for (const w of data.water)
    points += w.rings.reduce((n, r) => n + r.length, 0);
  for (const r of data.coastline) points += r.length;
  if (points > 500000) fail();
  const stages: PreparedReply["stages"] = [];
  const measure = <T>(name: string, f: () => T) => {
    const start = performance.now();
    const r = f();
    stages.push({ name, durationMs: performance.now() - start });
    return r;
  };
  const sample = measure("terrain.index", () => terrainSampler(data.terrain));
  const buildings = measure("geometry.buildings", () =>
    makeBuildings(data, sample),
  );
  const roads = measure("geometry.roads", () => makeRoads(data, sample));
  const geometry = {
    buildings: buildings.geometry,
    roads: roads.geometry,
    terrain: measure("geometry.terrain", () => makeTerrain(data)),
    water: measure("geometry.water", () => makeWater(data)),
    coast: measure("geometry.coast", () => makeCoastalEdge(data)),
  };
  const pack = (g: BufferGeometry): PackedGeometry => {
    g.computeBoundingSphere();
    const s = g.boundingSphere!;
    return {
      position: g.getAttribute("position").array as Float32Array,
      normal: g.getAttribute("normal").array as Float32Array,
      color: g.getAttribute("color").array as Float32Array,
      index: (g.index?.array as Uint16Array | Uint32Array) ?? null,
      sphere: [s.center.x, s.center.y, s.center.z, s.radius],
    };
  };
  try {
    return {
      version: 1,
      requestId,
      layers: Object.fromEntries(
        LAYERS.map((k) => [k, pack(geometry[k])]),
      ) as PreparedReply["layers"],
      ranges: {
        buildings: buildings.ranges.map((r) => ({
          id: r.feature.id,
          end: r.end,
        })),
        roads: roads.ranges.map((r) => ({ id: r.feature.id, end: r.end })),
      },
      stages,
    };
  } finally {
    Object.values(geometry).forEach((g) => g.dispose());
  }
}
export function transferBuffers(reply: PreparedReply): ArrayBuffer[] {
  return [
    ...new Set(
      Object.values(reply.layers).flatMap((g) => [
        g.position.buffer,
        g.normal.buffer,
        g.color.buffer,
        ...(g.index ? [g.index.buffer] : []),
      ]),
    ),
  ] as ArrayBuffer[];
}
export function disposePrepared(city: PreparedCity) {
  [
    city.buildings.geometry,
    city.roads.geometry,
    city.terrain,
    city.water,
    city.coast,
  ].forEach((g) => g.dispose());
}
/** Validate before GPU allocation. Only fixed typed attributes, never imported meshes. */
export function unpackCity(
  value: unknown,
  data: CityData,
  requestId: number,
): PreparedCity {
  if (!value || typeof value !== "object") return fail();
  const r = value as PreparedReply;
  if (
    r.version !== 1 ||
    r.requestId !== requestId ||
    !r.layers ||
    !r.ranges ||
    !Array.isArray(r.stages) ||
    r.stages.length > 8 ||
    r.stages.some(
      (s) =>
        typeof s.name !== "string" ||
        s.name.length > 40 ||
        !Number.isFinite(s.durationMs) ||
        s.durationMs < 0,
    )
  )
    fail();
  let bytes = 0;
  for (const k of LAYERS) {
    const g = r.layers[k];
    if (
      !g ||
      !Array.isArray(g.sphere) ||
      g.sphere.length !== 4 ||
      g.sphere.some((v) => !Number.isFinite(v) || Math.abs(v) > 1000000) ||
      g.sphere[3] < 0
    )
      fail();
    if (
      !(g.position instanceof Float32Array) ||
      g.position.length % 3 ||
      g.position.length > 3000000 ||
      !(g.normal instanceof Float32Array) ||
      !(g.color instanceof Float32Array) ||
      g.normal.length !== g.position.length ||
      g.color.length !== g.position.length
    )
      fail();
    for (const a of [g.position, g.normal, g.color]) {
      bytes += a.byteLength;
      if (bytes > 64 * 1024 * 1024) fail();
      for (const v of a)
        if (!Number.isFinite(v) || Math.abs(v) > 1000000) fail();
    }
    if (g.index !== null) {
      if (
        !(g.index instanceof Uint16Array) &&
        !(g.index instanceof Uint32Array)
      )
        fail();
      bytes += g.index.byteLength;
      if (g.index.length % 3) fail();
      for (const v of g.index) if (v >= g.position.length / 3) fail();
    }
  }
  if (bytes > 64 * 1024 * 1024) fail();
  const ranges = (
    kind: "buildings" | "roads",
    features: Feature[],
  ): FeatureRange[] => {
    const rows = r.ranges[kind],
      count = r.layers[kind].position.length / 9;
    if (!Array.isArray(rows) || rows.length !== features.length) return fail();
    let previous = 0;
    return rows.map((row, i) => {
      if (
        row.id !== features[i].id ||
        !Number.isSafeInteger(row.end) ||
        row.end < previous ||
        row.end > count ||
        (i === rows.length - 1 && row.end !== count)
      )
        fail();
      previous = row.end;
      return { feature: features[i], end: row.end };
    });
  };
  const buildingRanges = ranges("buildings", data.buildings),
    roadRanges = ranges(
      "roads",
      data.roads.filter((r) => !r.renderStatus || r.renderStatus === "surface"),
    );
  const hydrate = (k: Layer) => {
    const p = r.layers[k],
      g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(p.position, 3));
    g.setAttribute("normal", new BufferAttribute(p.normal, 3));
    g.setAttribute("color", new BufferAttribute(p.color, 3));
    if (p.index) g.setIndex(new BufferAttribute(p.index, 1));
    g.boundingSphere = new Sphere(
      new Vector3(...p.sphere.slice(0, 3)),
      p.sphere[3],
    );
    return g;
  };
  return {
    buildings: { geometry: hydrate("buildings"), ranges: buildingRanges },
    roads: { geometry: hydrate("roads"), ranges: roadRanges },
    terrain: hydrate("terrain"),
    water: hydrate("water"),
    coast: hydrate("coast"),
  };
}
