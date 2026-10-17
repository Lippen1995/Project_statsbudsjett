import type { Point } from "../geo/types";
import {
  footprint,
  buildingPlacement,
  type DevelopmentPlan,
} from "../physical/buildings";
import {
  WINDOW,
  type PlacementContext,
  type PhysicalPlan,
} from "../physical/model";
import {
  area,
  bounds,
  boxesIntersect,
  boundaryDistance,
  clip,
  distance,
  inside,
  intersects,
  overlaps,
  pointSegment,
  cross,
  signedArea,
} from "../physical/polygon";
import { exactKeys, networkId, object } from "../simulation/interventions";
import type { Network } from "../simulation/network";
export const ACCESS_LIMITS = Object.freeze({
  count: 8,
  vertices: 5,
  length: 80,
  minSegment: 2,
  clearance: 0.25,
  terminalRadius: 4,
  portalSnap: 2,
  vehicleWidth: 3,
  pedestrianWidth: 1.5,
  vehicleGrade: 0.1,
  pedestrianGrade: 0.12,
});
export type AccessMode = "pedestrian" | "vehicle";
export interface AccessConnection {
  id: string;
  buildingId: string;
  mode: AccessMode;
  nodeId: string;
  points: Point[];
}
export interface AccessPlan {
  version: 1;
  geographyId: string;
  networkId: string;
  connections: AccessConnection[];
}
export const emptyAccess = (c: PlacementContext): AccessPlan => ({
  version: 1,
  geographyId: c.id,
  networkId: networkId(c.network),
  connections: [],
});
export function attachmentPoints(network: Network) {
  return network.nodeIds.map((id) => {
    const edge = network.edges.find((e) => e.from === id || e.to === id)!;
    return {
      id,
      point: [
        ...(edge.from === id ? edge.points[0] : edge.points.at(-1)!),
      ] as Point,
      name: edge.name,
    };
  });
}
export function accessShape(input: unknown): AccessConnection {
  const v = object(input);
  exactKeys(v, ["id", "buildingId", "mode", "nodeId", "points"]);
  if (
    typeof v.id !== "string" ||
    !/^[\w-]{1,64}$/.test(v.id) ||
    typeof v.buildingId !== "string" ||
    !/^[\w-]{1,64}$/.test(v.buildingId) ||
    !["pedestrian", "vehicle"].includes(String(v.mode)) ||
    typeof v.mode !== "string" ||
    typeof v.nodeId !== "string" ||
    !/^\d+$/.test(v.nodeId) ||
    !Array.isArray(v.points) ||
    v.points.length < 2 ||
    v.points.length > ACCESS_LIMITS.vertices ||
    v.points.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some(
          (n) =>
            typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1000,
        ),
    )
  )
    throw new Error(
      "Use a bounded proposed connection: 2–5 metre-coordinate vertices and an original network node.",
    );
  return {
    id: v.id,
    buildingId: v.buildingId,
    mode: v.mode as AccessMode,
    nodeId: v.nodeId,
    points: v.points.map((p) => [...p] as Point),
  };
}
export function corridor(a: Point, b: Point, width: number): Point[] {
  const length = distance(a, b),
    x = ((-(b[1] - a[1]) / length) * width) / 2,
    z = (((b[0] - a[0]) / length) * width) / 2;
  return [
    [a[0] + x, a[1] + z],
    [b[0] + x, b[1] + z],
    [b[0] - x, b[1] - z],
    [a[0] - x, a[1] - z],
  ];
}
export function accessPlacement(
  input: AccessConnection,
  c: PlacementContext,
  development: DevelopmentPlan,
  physical: PhysicalPlan | null,
  others: AccessConnection[] = [],
) {
  const errors: string[] = [],
    warnings = new Set<string>();
  let a: AccessConnection;
  try {
    a = accessShape(input);
  } catch (e) {
    return {
      valid: false,
      errors: [(e as Error).message],
      warnings: [],
      lengthM: 0,
      maxGrade: 0,
    };
  }
  const owner = development.proposals.find((b) => b.id === a.buildingId),
    target = attachmentPoints(c.network).find((n) => n.id === a.nodeId);
  if (!owner || !target)
    return {
      valid: false,
      errors: [
        "Select an existing proposed building and an original endpoint in the active 27-way graph.",
      ],
      warnings: [],
      lengthM: 0,
      maxGrade: 0,
    };
  const ring = footprint(owner),
    width =
      a.mode === "vehicle"
        ? ACCESS_LIMITS.vehicleWidth
        : ACCESS_LIMITS.pedestrianWidth;
  if (
    Math.min(
      ...ring.map((p, i) =>
        pointSegment(a.points[0], p, ring[(i + 1) % ring.length]),
      ),
    ) > 0.01
  )
    errors.push(
      "Start on the selected building's conceptual footprint boundary; this is a proposed portal, not an observed entrance.",
    );
  if (distance(a.points.at(-1)!, target.point) > 0.001)
    errors.push(
      "The final point must equal the selected original graph node coordinate.",
    );
  if (
    others.some(
      (o) =>
        o.id !== a.id && o.buildingId === a.buildingId && o.mode === a.mode,
    )
  )
    errors.push(
      "Only one connection per access mode per building is supported.",
    );
  // Reject reversals and self-overlap across nonadjacent full-width legs.
  for (let i = 1; i < a.points.length - 1; i++) {
    const p = a.points[i - 1],
      q = a.points[i],
      r = a.points[i + 1],
      u: Point = [q[0] - p[0], q[1] - p[1]],
      v: Point = [r[0] - q[0], r[1] - q[1]];
    if (
      (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)) <
      -0.95
    )
      errors.push("Access must not double back on itself.");
  }
  for (let i = 1; i < a.points.length; i++)
    for (let j = 1; j < i - 1; j++) {
      if (
        distance(a.points[i - 1], a.points[i]) < 2 ||
        distance(a.points[j - 1], a.points[j]) < 2
      )
        continue;
      if (
        overlaps(corridor(a.points[i - 1], a.points[i], width), [
          corridor(a.points[j - 1], a.points[j], width),
        ])
      )
        errors.push("Nonadjacent access corridors overlap.");
    }
  const portalY = heightAt(c, a.points[0]),
    baseY = buildingPlacement(owner, c, physical, development.proposals).baseY;
  if (portalY === null || Math.abs(baseY - portalY) > 0.5 + 1e-8)
    errors.push(
      "Proposed portal differs from the conceptual foundation by over 0.5 m; engineered ramps are not modelled.",
    );
  let lengthM = 0,
    maxGrade = 0;
  const legs = a.points
    .slice(1)
    .map((p, i) => ({ from: a.points[i], to: p, joint: false }));
  for (const p of a.points.slice(1, -1))
    legs.push({
      from: [p[0] - width / 2, p[1]],
      to: [p[0] + width / 2, p[1]],
      joint: true,
    });
  for (let index = 0; index < legs.length; index++) {
    const { from, to, joint } = legs[index],
      i = index + 1,
      len = distance(from, to);
    if (!joint) lengthM += len;
    if (len > ACCESS_LIMITS.length) {
      errors.push("Each access leg must be at most 80 m.");
      continue;
    }
    if (!joint && len < ACCESS_LIMITS.minSegment) {
      errors.push("Every access leg must be at least 2 m long.");
      continue;
    }
    for (let j = 1; !joint && j < i - 1; j++)
      if (intersects(from, to, a.points[j - 1], a.points[j]))
        errors.push("Access legs must not cross or touch themselves.");
    const strip = corridor(from, to, width),
      box = bounds(strip);
    if (
      strip.some(
        (p) =>
          p[0] < WINDOW[0] ||
          p[0] > WINDOW[2] ||
          p[1] < WINDOW[1] ||
          p[1] > WINDOW[3],
      )
    )
      errors.push(
        "Keep the full corridor within the existing Bryggen authoring window.",
      );
    let covered = 0;
    for (const t of c.triangles)
      if (boxesIntersect(box, t.box)) {
        const intersection = clip(strip, t.points),
          coveredArea = intersection.length > 2 ? area(intersection) : 0;
        if (coveredArea > 1e-8) {
          covered += coveredArea;
          maxGrade = Math.max(maxGrade, t.grade);
        }
      }
    if (Math.abs(covered - area(strip)) > 0.001)
      errors.push(
        "The full access width must be covered by mapped terrain; no water or terrain gaps may be spanned.",
      );
    if (
      c.buildings.some(
        (b) =>
          boxesIntersect(box, b.box, 0.25) &&
          (overlaps(strip, b.rings) ||
            b.rings.some((r) => boundaryDistance(strip, r) <= 0.25)),
      )
    )
      errors.push("Observed building collision or less than 0.25 m clearance.");
    if (
      c.water.some(
        (r) =>
          overlaps(strip, r) ||
          r.some((q) => boundaryDistance(strip, q) <= 0.25),
      ) ||
      c.coastline.some((r) => boundaryDistance(strip, r, false) <= 0.25)
    )
      errors.push("Access intersects mapped water or coastline clearance.");
    for (const b of development.proposals) {
      const shape = footprint(b);
      if (
        b.id !== owner.id &&
        (overlaps(strip, [shape]) || boundaryDistance(strip, shape) < 0.25)
      )
        errors.push(`Conflicts with proposed building ${b.name}.`);
    }
    // Sample elevation continuity in addition to the full-strip TIN grade check.
    const samples = Math.ceil(len / 1);
    let prior = heightAt(c, from);
    for (let j = 1; j <= samples; j++) {
      const t = j / samples,
        y = heightAt(c, [
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
        ]);
      if (
        prior === null ||
        y === null ||
        Math.abs(y - prior) >
          ((a.mode === "vehicle" ? 0.1 : 0.12) * len) / samples + 0.01
      )
        errors.push(
          "Missing terrain or elevation discontinuity along the proposed access.",
        );
      prior = y;
    }
    // The first strip meets its own conceptual portal; its centreline must
    // immediately leave the owner. Other proposed/observed buildings get no exemption.
    const ownerContact = clipSegment(from, to, ring);
    if (
      ownerContact.length &&
      distance(ownerContact[0], ownerContact[1]) > (i === 1 ? 0.02 : 1e-8)
    )
      errors.push(
        "The centreline enters its own building; move the proposed portal or bend.",
      );
    if (i > 1 && overlaps(strip, [ring]))
      errors.push("Access returns through its proposed building.");
    if (
      physical?.proposals.some(
        (p) =>
          overlaps(strip, [p.vertices]) ||
          boundaryDistance(strip, p.vertices) < 0.25,
      )
    )
      errors.push(
        "Conflicts with a proposed public space; reshape one proposal explicitly.",
      );
    // Check every mapped surface road, not only graph edges. Footway crossings remain
    // hypothetical at-grade design conflicts, explicitly disclosed rather than new graph joins.
    for (const road of c.accessRoads ?? []) {
      if (!boxesIntersect(box, bounds(road.points), width / 2)) continue;
      for (let j = 1; j < road.points.length; j++) {
        const p = road.points[j - 1],
          q = road.points[j];
        const contact = clipSegment(p, q, strip);
        if (!contact.length) continue;
        if (
          road.surface &&
          ["footway", "path", "pedestrian"].includes(road.kind)
        ) {
          warnings.add(
            "Crosses a mapped walking route: hypothetical at-grade crossing only; continuity, rights and engineering are unverified.",
          );
          continue;
        }
        const incident = c.network.edges.some(
          (e) =>
            e.wayId === road.id && (e.from === a.nodeId || e.to === a.nodeId),
        );
        if (
          !road.surface ||
          !incident ||
          contact.some((v) => distance(v, target.point) > 4.001)
        )
          errors.push(
            `Unsupported crossing of ${road.id}; attach only within 4 m of an incident source-node endpoint.`,
          );
      }
    }
    for (const o of others)
      if (o.id !== a.id)
        for (let j = 1; j < o.points.length; j++) {
          const pieces = [
            corridor(
              o.points[j - 1],
              o.points[j],
              o.mode === "vehicle" ? 3 : 1.5,
            ),
          ];
          if (j < o.points.length - 1) {
            const p = o.points[j],
              w = o.mode === "vehicle" ? 3 : 1.5;
            pieces.push(
              corridor([p[0] - w / 2, p[1]], [p[0] + w / 2, p[1]], w),
            );
          }
          if (
            pieces.some(
              (other) =>
                overlaps(strip, [other]) ||
                boundaryDistance(strip, other) < 0.25,
            )
          )
            errors.push(
              "Overlaps another proposed access corridor; shared private junctions are not modelled.",
            );
        }
  }
  if (lengthM > ACCESS_LIMITS.length || lengthM < 2)
    errors.push("Proposed access length must be 2–80 m.");
  if (maxGrade > (a.mode === "vehicle" ? 0.1 : 0.12) + 1e-8)
    errors.push(
      `Terrain exceeds the ${a.mode === "vehicle" ? "10" : "12"}% corridor grade assumption.`,
    );
  if (!c.accessRoads)
    errors.push("Mapped-road crossing context is unavailable.");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...warnings],
    lengthM,
    maxGrade,
  };
}
export function validateAccess(
  value: unknown,
  c: PlacementContext,
  d: DevelopmentPlan,
  p: PhysicalPlan | null,
): AccessPlan {
  const v = object(value);
  exactKeys(v, ["version", "geographyId", "networkId", "connections"]);
  if (
    v.version !== 1 ||
    v.geographyId !== c.id ||
    v.networkId !== networkId(c.network) ||
    !Array.isArray(v.connections) ||
    v.connections.length > 8
  )
    throw new Error("Incompatible or unbounded proposed-access contract.");
  const connections = v.connections.map(accessShape),
    ids = new Set<string>();
  for (const a of connections) {
    if (
      ids.has(a.id) ||
      d.proposals.some((b) => b.id === a.id) ||
      p?.proposals.some((b) => b.id === a.id)
    )
      throw new Error("Duplicate access/proposal identity.");
    ids.add(a.id);
    const check = accessPlacement(a, c, d, p, connections);
    if (!check.valid) throw new Error(check.errors.join(" "));
  }
  return { ...emptyAccess(c), connections };
}
export function nearestPortal(
  building: DevelopmentPlan["proposals"][number],
  target: Point,
): Point {
  const ring = footprint(building);
  let best = Infinity,
    result = ring[0];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % 4],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(
        0.15,
        Math.min(
          0.85,
          ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) /
            (dx * dx + dz * dz),
        ),
      );
    const p: Point = [a[0] + dx * t, a[1] + dz * t];
    if (distance(p, target) < best) {
      best = distance(p, target);
      result = p;
    }
  });
  return result;
}

/** Exact convex-strip clipping: detects short crossings missed by point sampling. */
export function clipSegment(a: Point, b: Point, ring: Point[]): Point[] {
  let lo = 0,
    hi = 1;
  const sign = signedArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i],
      q = ring[(i + 1) % ring.length],
      x = sign * cross(p, q, a),
      y = sign * cross(p, q, b),
      delta = y - x;
    if (Math.abs(delta) < 1e-10) {
      if (x < -1e-8) return [];
      continue;
    }
    const t = -x / delta;
    if (delta > 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi + 1e-8) return [];
  }
  return [lo, hi].map((t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]);
}

export function heightAt(c: PlacementContext, p: Point): number | null {
  for (const t of c.triangles) {
    if (
      p[0] < t.box[0] - 1e-8 ||
      p[0] > t.box[2] + 1e-8 ||
      p[1] < t.box[1] - 1e-8 ||
      p[1] > t.box[3] + 1e-8 ||
      !inside(p, t.points)
    )
      continue;
    const [a, b, d] = t.points,
      den = cross(a, b, d),
      v = cross(a, p, d) / den,
      w = cross(a, b, p) / den;
    return (
      t.xyz[0][1] +
      v * (t.xyz[1][1] - t.xyz[0][1]) +
      w * (t.xyz[2][1] - t.xyz[0][1])
    );
  }
  return null;
}

/** Authoring assist for an explicitly selected hypothetical building only.
 * Never snaps or creates an observed road node/junction. */
export function terrainPortal(
  building: DevelopmentPlan["proposals"][number],
  point: Point,
): Point {
  const portal = nearestPortal(building, point);
  return distance(portal, point) <= ACCESS_LIMITS.portalSnap ? portal : point;
}
