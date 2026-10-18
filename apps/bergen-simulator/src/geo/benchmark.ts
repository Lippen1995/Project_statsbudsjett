import type { Building, CityData, Feature, Point, Point3 } from "./types";

/** Presentation boundary only. Never used for topology, placement or simulation. */
export const HERO_BOUNDS = [-85, -330, 95, -120] as const;
export function inHeroBlock(b: Building): boolean {
  const [w, n, e, s] = HERO_BOUNDS;
  return b.rings.every((r) =>
    r.every(([x, z]) => x >= w && x <= e && z >= n && z <= s),
  );
}

// Additional mapper colour spellings found in the pinned pilot. A colour name
// has no measured RGB value: these swatches remain illustrative interpretations.
const SWATCHES: Record<string, string> = {
  mahogany: "#714338",
  darkgreen: "#31554b",
  darkred: "#873f36",
  lightgrey: "#b4b7b4",
  lightgray: "#b4b7b4",
  sienna3: "#cd6839",
};
export function sourceSwatch(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized)
    ? normalized
    : (SWATCHES[normalized] ?? null);
}

export const BENCHMARK_VIEWS = [
  {
    id: "waterfront",
    name: "Bryggen waterfront",
    position: [-145, 85, -45],
    target: [-12, 8, -260],
  },
  {
    id: "roofs",
    name: "Bryggen roofscape",
    position: [-105, 100, -385],
    target: [-23, 9, -263],
  },
  {
    id: "vagen",
    name: "Across Vågen",
    position: [-428.02, 301.42, 229.24],
    target: [1.98, 1.42, -270.76],
  },
] as const;
export type BenchmarkView = (typeof BENCHMARK_VIEWS)[number]["id"];

/** Frame the actual selected footprint instead of applying a city-scale offset. */
export function inspectionCamera(
  feature: Feature,
  data: CityData,
): { position: Point3; target: Point3 } {
  const b = data.buildings.find((b) => b.id === feature.id);
  const road =
    feature.kind === "road"
      ? data.roads.find((r) => r.id === feature.id)
      : undefined;
  const points: Point[] = b
    ? b.rings.flat()
    : road
      ? road.points.map((p) => [p[0], p[2]])
      : [feature.center];
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs),
    depth = Math.max(...zs) - Math.min(...zs);
  const height = b?.height ?? 0;
  const distance = Math.max(
    35,
    Math.min(550, Math.hypot(width, depth, height) * 1.65),
  );
  const target: Point3 = [
    feature.center[0],
    feature.elevation + height * 0.4,
    feature.center[1],
  ];
  return {
    target,
    position: [
      target[0] - distance * 0.62,
      target[1] + distance * 0.5,
      target[2] + distance * 0.72,
    ],
  };
}

/** Two stable shadow LODs, no per-input shadow-map regeneration. */
export function heroShadow(
  position: {
    x: number;
    y: number;
    z: number;
  },
  direction?: { x: number; y: number; z: number },
): boolean {
  const x = -position.x,
    y = -position.y,
    z = -245 - position.z;
  const distance = Math.hypot(x, y, z);
  if (!Number.isFinite(distance) || distance >= 900) return false;
  if (distance <= 330 || !direction) return true;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!length) return false;
  const along = (x * direction.x + y * direction.y + z * direction.z) / length;
  // A nearby camera looking away (e.g. toward Nordnes) still needs the
  // context shadow map. Camera distance alone cannot identify the hero view.
  return (
    along > 0 &&
    Math.sqrt(Math.max(0, distance * distance - along * along)) < 330
  );
}
