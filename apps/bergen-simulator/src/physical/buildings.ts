import type { Point } from "../geo/types";
import { object, exactKeys, segments } from "../simulation/interventions";
import {
  placement,
  validatePhysical,
  WINDOW,
  type PlacementContext,
  type PhysicalPlan,
} from "./model";
import {
  bounds,
  boxesIntersect,
  boundaryDistance,
  inside,
  overlaps,
} from "./polygon";
export const BUILDING_LIMITS = Object.freeze({
  minWidth: 6,
  minDepth: 8,
  maxDimension: 30,
  minArea: 48,
  maxArea: 600,
  maxStoreys: 6,
  minStoreyHeight: 2.8,
  maxStoreyHeight: 4,
  maxHeight: 26,
  maxGrade: 0.1,
  maxRelief: 1.5,
  maxCount: 8,
  roadClearance: 6,
  proposalClearance: 1,
  accessDistance: 25,
  roofRise: 2,
});
export type Purpose = "residential" | "commercial" | "civic";
export interface BuildingProposal {
  id: string;
  name: string;
  purpose: Purpose;
  center: Point;
  width: number;
  depth: number;
  rotation: number;
  storeys: number;
  storeyHeight: number;
  roof: "flat" | "gabled";
}
export interface DevelopmentPlan {
  version: 1;
  geographyId: string;
  proposals: BuildingProposal[];
}
export const emptyDevelopment = (
  context: PlacementContext,
): DevelopmentPlan => ({ version: 1, geographyId: context.id, proposals: [] });
export function validateBuilding(input: unknown): BuildingProposal {
  const b = object(input);
  exactKeys(b, [
    "id",
    "name",
    "purpose",
    "center",
    "width",
    "depth",
    "rotation",
    "storeys",
    "storeyHeight",
    "roof",
  ]);
  if (
    typeof b.id !== "string" ||
    !/^[\w-]{1,64}$/.test(b.id) ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 60 ||
    [...b.name].some((c) => c.charCodeAt(0) < 32) ||
    typeof b.purpose !== "string" ||
    !["residential", "commercial", "civic"].includes(b.purpose) ||
    typeof b.roof !== "string" ||
    !["flat", "gabled"].includes(b.roof)
  )
    throw new Error(
      "Invalid building identity, intended use or conceptual roof.",
    );
  if (
    !Array.isArray(b.center) ||
    b.center.length !== 2 ||
    b.center.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
    Math.abs(b.center[0]) > 2000 ||
    Math.abs(b.center[1]) > 2000
  )
    throw new Error(
      "Use finite local metre coordinates inside the mapped authoring area.",
    );
  for (const key of ["width", "depth", "rotation", "storeys", "storeyHeight"])
    if (typeof b[key] !== "number" || !Number.isFinite(b[key]))
      throw new Error("Building dimensions must be finite numbers.");
  const limits = BUILDING_LIMITS;
  const result = {
    ...b,
    center: [...b.center],
    name: b.name.trim(),
  } as unknown as BuildingProposal;
  if (
    result.width < limits.minWidth ||
    result.width > limits.maxDimension ||
    result.depth < limits.minDepth ||
    result.depth > limits.maxDimension ||
    result.width * result.depth < limits.minArea ||
    result.width * result.depth > limits.maxArea
  )
    throw new Error("Footprint: width 6–30 m, depth 8–30 m, area 48–600 m².");
  if (
    !Number.isInteger(result.storeys) ||
    result.storeys < 1 ||
    result.storeys > limits.maxStoreys ||
    result.storeyHeight < limits.minStoreyHeight ||
    result.storeyHeight > limits.maxStoreyHeight ||
    result.rotation < 0 ||
    result.rotation >= 360 ||
    buildingHeight(result) > limits.maxHeight
  )
    throw new Error(
      "Use 1–6 storeys, 2.8–4 m per storey, height ≤26 m and rotation 0–359.99°.",
    );
  return result;
}
export function footprint(b: BuildingProposal): Point[] {
  const theta = (b.rotation * Math.PI) / 180,
    c = Math.cos(theta),
    s = Math.sin(theta);
  return [
    [-b.width / 2, -b.depth / 2],
    [b.width / 2, -b.depth / 2],
    [b.width / 2, b.depth / 2],
    [-b.width / 2, b.depth / 2],
  ].map(([x, z]) => [b.center[0] + c * x - s * z, b.center[1] + s * x + c * z]);
}
export const buildingHeight = (b: BuildingProposal) =>
  b.storeys * b.storeyHeight +
  (b.roof === "gabled" ? BUILDING_LIMITS.roofRise : 0);
export function buildingPlacement(
  input: BuildingProposal,
  context: PlacementContext,
  physical: PhysicalPlan | null,
  others: BuildingProposal[] = [],
) {
  let b: BuildingProposal;
  try {
    b = validateBuilding(input);
  } catch (e) {
    return {
      valid: false,
      errors: [(e as Error).message],
      baseY: 0,
      minY: 0,
      relief: 0,
      grade: 0,
      accessDistance: Infinity,
      footprint: [] as Point[],
    };
  }
  const ring = footprint(b),
    base = placement(
      { id: b.id, name: b.name, kind: "pedestrian", vertices: ring },
      context,
      physical?.proposals,
    ),
    errors = [...base.errors];
  const ys = base.triangles.flat().map((p) => p[1]),
    baseY = ys.length ? Math.max(...ys) : 0,
    minY = ys.length ? Math.min(...ys) : 0;
  if (base.maxGrade > BUILDING_LIMITS.maxGrade + 1e-8)
    errors.push("Terrain exceeds the building prototype's 10% grade limit.");
  if (baseY - minY > BUILDING_LIMITS.maxRelief + 1e-8)
    errors.push(
      "Terrain relief exceeds 1.5 m; excavation and engineered foundations are not modelled.",
    );
  for (const other of others)
    if (other.id !== b.id) {
      const q = footprint(other);
      if (
        boxesIntersect(bounds(ring), bounds(q), 1) &&
        (overlaps(ring, [q]) ||
          boundaryDistance(ring, q) < BUILDING_LIMITS.proposalClearance)
      ) {
        errors.push(
          `Proposed building conflict (${other.name}); retain 1 m between conceptual buildings.`,
        );
        break;
      }
    }
  // Space conflicts are also checked by placement, including wholly contained polygons.
  if (
    physical?.proposals.some(
      (p) =>
        overlaps(ring, [p.vertices]) ||
        boundaryDistance(ring, p.vertices) < 0.25,
    )
  )
    errors.push(
      "Conflicts with a proposed public space; retain 0.25 m geometric separation.",
    );
  if (
    context.water.some((r) => r.some((q) => boundaryDistance(ring, q) <= 0.25))
  )
    errors.push("Keep 0.25 m clear of mapped inland-water boundaries.");
  let accessDistance = Infinity;
  for (const edge of segments(context.network)) {
    const d = edge.points.some((p) => inside(p, ring))
      ? 0
      : boundaryDistance(ring, edge.points, false);
    accessDistance = Math.min(accessDistance, d);
    if (d < BUILDING_LIMITS.roadClearance - 1e-8)
      errors.push(
        `Protected modelled road corridor (${edge.wayId}): keep 6 m from its centreline. This is a hypothetical clearance rule.`,
      );
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    baseY,
    minY,
    relief: baseY - minY,
    grade: base.maxGrade,
    accessDistance,
    footprint: ring,
  };
}
export function validateDevelopment(
  input: unknown,
  context: PlacementContext,
  physical: PhysicalPlan | null,
): DevelopmentPlan {
  const d = object(input);
  exactKeys(d, ["version", "geographyId", "proposals"]);
  if (
    d.version !== 1 ||
    d.geographyId !== context.id ||
    !Array.isArray(d.proposals) ||
    d.proposals.length > BUILDING_LIMITS.maxCount
  )
    throw new Error(
      "Incompatible building proposal contract/geography; maximum eight buildings.",
    );
  const proposals = d.proposals.map(validateBuilding),
    ids = new Set(physical?.proposals.map((p) => p.id));
  for (const b of proposals) {
    if (ids.has(b.id))
      throw new Error("Duplicate or ambiguous proposal identity.");
    ids.add(b.id);
    const check = buildingPlacement(b, context, physical, proposals);
    if (!check.valid) throw new Error(`${b.name}: ${check.errors.join(" ")}`);
  }
  return { version: 1, geographyId: context.id, proposals };
}
export function developmentMetrics(
  development: DevelopmentPlan | null,
  physical: PhysicalPlan | null,
) {
  const result = {
    count: 0,
    footprintM2: 0,
    grossFloorM2: 0,
    conceptualVolumeM3: 0,
    maxHeightM: 0,
    uses: { residential: 0, commercial: 0, civic: 0 },
    storeys: {} as Record<string, number>,
    publicSpaceM2: 0,
  };
  for (const b of development?.proposals ?? []) {
    const a = b.width * b.depth;
    result.count++;
    result.footprintM2 += a;
    result.grossFloorM2 += a * b.storeys;
    result.conceptualVolumeM3 +=
      a * b.storeys * b.storeyHeight +
      (b.roof === "gabled" ? (a * BUILDING_LIMITS.roofRise) / 2 : 0);
    result.maxHeightM = Math.max(result.maxHeightM, buildingHeight(b));
    result.uses[b.purpose] += a * b.storeys;
    result.storeys[b.storeys] = (result.storeys[b.storeys] ?? 0) + 1;
  }
  for (const p of physical?.proposals ?? [])
    result.publicSpaceM2 += Math.abs(
      p.vertices.reduce((a, v, i) => {
        const q = p.vertices[(i + 1) % p.vertices.length];
        return a + v[0] * q[1] - q[0] * v[1];
      }, 0) / 2,
    );
  return result;
}
export const QUARTER_OBJECTIVES = {
  minFloorArea: 1000,
  maxFloorArea: 1800,
  minPublicSpace: 120,
  maxPublicSpace: 350,
  minBuildings: 3,
  maxFootprint: 700,
  maxHeight: 18,
};
export function quarterChallenge(
  d: DevelopmentPlan,
  p: PhysicalPlan,
  context: PlacementContext,
) {
  let valid = true;
  try {
    validatePhysical(p, context);
    validateDevelopment(d, context, p);
  } catch {
    valid = false;
  }
  const m = developmentMetrics(d, p),
    checks = [
      valid && m.count >= 3 && m.count <= 6 && m.footprintM2 <= 700,
      m.grossFloorM2 >= 1000 && m.grossFloorM2 <= 1800,
      Object.values(m.uses).filter((a) => a > 0).length >= 2,
      m.publicSpaceM2 >= 120 && m.publicSpaceM2 <= 350,
      m.maxHeightM <= 18 &&
        d.proposals.every((b) => {
          const c = buildingPlacement(b, context, p, d.proposals);
          return c.valid && c.accessDistance <= 25;
        }),
    ];
  return { metrics: m, checks, passed: checks.every(Boolean) };
}
// Rectangle placement stays in the unchanged 4A Bryggen window.
export const DEVELOPMENT_WINDOW = WINDOW;

export function spaceBuildingErrors(
  space: import("./model").PublicSpace,
  development: DevelopmentPlan | null,
) {
  return (development?.proposals ?? [])
    .filter((b) => {
      const r = footprint(b);
      return (
        overlaps(space.vertices, [r]) ||
        boundaryDistance(space.vertices, r) < 0.25
      );
    })
    .map(
      (b) =>
        `Proposed building conflict (${b.name}); retain 0.25 m between space and construction.`,
    );
}
