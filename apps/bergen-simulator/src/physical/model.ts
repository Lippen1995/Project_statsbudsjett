import type { CityData, Point, Point3 } from "../geo/types";
import type { Network } from "../simulation/network";
import {
  exactKeys,
  object,
  segmentId,
  segments,
} from "../simulation/interventions";
import {
  area,
  bounds,
  boxesIntersect,
  boundaryDistance,
  clip,
  cross,
  distance,
  inside,
  overlaps,
  simple,
  triangulate,
} from "./polygon";
export const LIMITS = Object.freeze({
  minArea: 25,
  maxArea: 2500,
  maxVertices: 8,
  maxProposals: 4,
  maxSpan: 100,
  maxGrade: 0.15,
  clearance: 0.25,
  roadBuffer: 4,
  connectionDistance: 8,
});
// Authoring window only: no ownership, permission or real-world access assertion.
export const WINDOW = [-145, -335, 145, -65] as const;
export interface PublicSpace {
  id: string;
  name: string;
  kind: "pedestrian" | "landscaped";
  vertices: Point[];
}
export interface PhysicalPlan {
  version: 1;
  geographyId: string;
  proposals: PublicSpace[];
}
interface Triangle {
  points: Point[];
  xyz: Point3[];
  box: number[];
  grade: number;
}
export interface PlacementContext {
  id: string;
  triangles: Triangle[];
  buildings: { id: string; rings: Point[][]; box: number[] }[];
  water: Point[][][];
  coastline: Point[][];
  network: Network;
  accessRoads?: {
    id: string;
    kind: string;
    surface: boolean;
    points: Point[];
  }[];
}
export interface Placement {
  valid: boolean;
  errors: string[];
  areaM2: number;
  maxGrade: number;
  conflicts: { segmentId: string; wayId: string; name: string }[];
  connected: boolean;
  triangles: Point3[][];
}
function checksum(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}
export function placementContext(
  data: CityData,
  network: Network,
): PlacementContext {
  const { positions: p, indices } = data.terrain,
    triangles: Triangle[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const xyz = indices
        .slice(i, i + 3)
        .map((id) => p.slice(id * 3, id * 3 + 3) as Point3),
      points = xyz.map((v) => [v[0], v[2]] as Point),
      box = bounds(points);
    if (!boxesIntersect(box, [...WINDOW])) continue;
    const [a, b, c] = xyz,
      den = cross(points[0], points[1], points[2]);
    if (Math.abs(den) < 1e-8) continue;
    const gx =
      ((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])) / den;
    const gz =
      ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / den;
    triangles.push({ xyz, points, box, grade: Math.hypot(gx, gz) });
  }
  // Bind imported designs to all placement-relevant snapshot records, not just a timestamp.
  const id =
    "bergen-physical-1-" +
    checksum(
      JSON.stringify([
        data.origin,
        data.terrain,
        data.buildings.map((b) => [b.id, b.rings]),
        data.coastline,
        data.water,
      ]),
    );
  return {
    id,
    triangles,
    buildings: data.buildings
      .filter((b) =>
        boxesIntersect(bounds(b.rings[0]), [...WINDOW], LIMITS.clearance),
      )
      .map((b) => ({ id: b.id, rings: b.rings, box: bounds(b.rings[0]) })),
    water: data.water.map((w) => w.rings),
    coastline: data.coastline,
    network,
    accessRoads: data.roads
      .filter((r) =>
        boxesIntersect(
          bounds(r.points.map((p) => [p[0], p[2]])),
          [...WINDOW],
          5,
        ),
      )
      .map((r) => ({
        id: r.id,
        kind: r.roadClass,
        surface: !r.renderStatus || r.renderStatus === "surface",
        points: r.points.map((p) => [p[0], p[2]] as Point),
      })),
  };
}
export const emptyPhysical = (context: PlacementContext): PhysicalPlan => ({
  version: 1,
  geographyId: context.id,
  proposals: [],
});
export function validateSpaceShape(value: unknown): PublicSpace {
  const v = object(value);
  exactKeys(v, ["id", "name", "kind", "vertices"]);
  if (
    typeof v.id !== "string" ||
    !/^[\w-]{1,64}$/.test(v.id) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 60 ||
    [...v.name].some((c) => c.charCodeAt(0) < 32) ||
    !["pedestrian", "landscaped"].includes(String(v.kind)) ||
    typeof v.kind !== "string"
  )
    throw new Error("Invalid public-space identity, name or treatment.");
  if (
    !Array.isArray(v.vertices) ||
    v.vertices.length < 3 ||
    v.vertices.length > LIMITS.maxVertices ||
    v.vertices.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n) => typeof n !== "number" || !Number.isFinite(n)),
    )
  )
    throw new Error("Use 3–8 finite [east, south] metre coordinates.");
  const vertices = v.vertices.map((p) => [...p] as Point);
  return {
    id: v.id,
    name: v.name.trim(),
    kind: v.kind as PublicSpace["kind"],
    vertices,
  };
}
export function placement(
  space: PublicSpace,
  context: PlacementContext,
  others: PublicSpace[] = [],
): Placement {
  const result: Placement = {
    valid: false,
    errors: [],
    areaM2: 0,
    maxGrade: 0,
    conflicts: [],
    connected: false,
    triangles: [],
  };
  let p: Point[];
  try {
    p = validateSpaceShape(space).vertices;
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }
  const box = bounds(p);
  result.areaM2 = area(p);
  if (
    p.some(
      (v) =>
        v[0] < WINDOW[0] ||
        v[0] > WINDOW[2] ||
        v[1] < WINDOW[1] ||
        v[1] > WINDOW[3],
    )
  )
    result.errors.push(
      "Outside the Bryggen authoring window. Move the design back to the waterfront.",
    );
  if (box[2] - box[0] > LIMITS.maxSpan || box[3] - box[1] > LIMITS.maxSpan)
    result.errors.push("A footprint may span at most 100 m on either axis.");
  if (!simple(p))
    result.errors.push("Edges cross or the polygon has no surface area.");
  if (p.some((a, i) => distance(a, p[(i + 1) % p.length]) < 1))
    result.errors.push("Adjacent vertices must be at least 1 m apart.");
  if (result.areaM2 < LIMITS.minArea || result.areaM2 > LIMITS.maxArea)
    result.errors.push(
      "Proposed area must be 25–2,500 m² (horizontal footprint).",
    );
  if (result.errors.length) return result;
  let pieces: Point[][];
  try {
    pieces = triangulate(p);
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }
  let covered = 0;
  for (const t of context.triangles) {
    if (!boxesIntersect(box, t.box)) continue;
    for (const piece of pieces) {
      const poly = clip(piece, t.points),
        a = poly.length > 2 ? area(poly) : 0;
      if (a < 1e-8) continue;
      covered += a;
      result.maxGrade = Math.max(result.maxGrade, t.grade);
      const [pa, pb, pc] = t.points,
        [a3, b3, c3] = t.xyz,
        den = cross(pa, pb, pc);
      const lifted = poly.map((q) => {
        const v = cross(pa, q, pc) / den,
          w = cross(pa, pb, q) / den;
        return [
          q[0],
          a3[1] + v * (b3[1] - a3[1]) + w * (c3[1] - a3[1]),
          q[1],
        ] as Point3;
      });
      for (let i = 1; i < lifted.length - 1; i++)
        result.triangles.push([lifted[0], lifted[i], lifted[i + 1]]);
    }
  }
  if (Math.abs(covered - result.areaM2) > 0.001)
    result.errors.push(
      "The entire footprint must lie on mapped land terrain; coast, water gaps and missing terrain cannot be spanned.",
    );
  if (result.maxGrade > LIMITS.maxGrade + 1e-8)
    result.errors.push(
      "Touches terrain steeper than the prototype limit of 15% grade. This uses the display terrain, not an engineering survey.",
    );
  for (const b of context.buildings)
    if (
      boxesIntersect(box, b.box, LIMITS.clearance) &&
      (overlaps(p, b.rings) ||
        b.rings.some((r) => boundaryDistance(p, r) <= LIMITS.clearance))
    ) {
      result.errors.push(
        `Observed building conflict (${b.id}); keep 0.25 m clear of its footprint.`,
      );
      break;
    }
  if (
    context.water.some(
      (r) => boxesIntersect(box, bounds(r[0])) && overlaps(p, r),
    )
  )
    result.errors.push("Intersects mapped inland water.");
  if (
    context.coastline.some(
      (r) =>
        boxesIntersect(box, bounds(r), LIMITS.clearance) &&
        boundaryDistance(p, r, false) <= LIMITS.clearance,
    )
  )
    result.errors.push("Touches mapped coastline; keep 0.25 m clear.");
  if (
    others.some(
      (o) =>
        o.id !== space.id &&
        boxesIntersect(box, bounds(o.vertices)) &&
        overlaps(p, [o.vertices]),
    )
  )
    result.errors.push("Overlaps or touches another proposed public space.");
  for (const e of segments(context.network)) {
    if (!boxesIntersect(box, bounds(e.points), LIMITS.connectionDistance))
      continue;
    const d = e.points.some((q) => inside(q, p))
      ? 0
      : boundaryDistance(p, e.points, false);
    if (d <= LIMITS.connectionDistance) result.connected = true;
    if (d <= LIMITS.roadBuffer)
      result.conflicts.push({
        segmentId: segmentId(e),
        wayId: e.wayId,
        name: e.name,
      });
  }
  result.valid = result.errors.length === 0;
  return result;
}
export function validatePhysical(
  input: unknown,
  context: PlacementContext,
): PhysicalPlan {
  const p = object(input);
  exactKeys(p, ["version", "geographyId", "proposals"]);
  if (
    p.version !== 1 ||
    p.geographyId !== context.id ||
    !Array.isArray(p.proposals) ||
    p.proposals.length > LIMITS.maxProposals
  )
    throw new Error(
      "Incompatible geography or physical plan. Maximum four proposals.",
    );
  const proposals = p.proposals.map(validateSpaceShape),
    ids = new Set<string>();
  for (const s of proposals) {
    if (ids.has(s.id)) throw new Error("Duplicate public-space identity.");
    ids.add(s.id);
    const check = placement(s, context, proposals);
    if (!check.valid) throw new Error(`${s.name}: ${check.errors.join(" ")}`);
  }
  return { version: 1, geographyId: context.id, proposals };
}
