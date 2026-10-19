import type { Building, Point3 } from "../geo/types";

export const LANDMARK_ID = "way/393025479";
// Presentation cameras, never observed geography or alleged public walking routes.
export const LANDMARK_VIEWS = [
  {
    id: "gable",
    name: "Gable & doors",
    position: [77, 4.8, -117],
    target: [62, 4.6, -132],
  },
  {
    id: "quay",
    name: "Quay side",
    position: [32, 4.8, -124],
    target: [51, 4.6, -142],
  },
  {
    id: "street",
    name: "Street side",
    position: [71, 4.8, -161],
    target: [51, 4.6, -142],
  },
  {
    id: "capital",
    name: "Stone capital",
    position: [61, 10.3, -125],
    target: [59.17, 9.9, -128.53],
  },
] as const;
export type LandmarkView = (typeof LANDMARK_VIEWS)[number]["id"];

/** Conservative camera clearance only; not walkability, engineering or access rights.
 * Push from a source footprint's expanded local bounding box below its roof.
 * Bounded nearby list, deterministic, no source mutation. Unknown height => 40 m
 * safety envelope, never assigned to the building or rendered as measured height.
 */
export function clearInspectionPosition(
  position: Point3,
  ground: number | null,
  buildings: readonly Building[],
): Point3 {
  const p = [...position] as Point3;
  p[1] = Math.max(p[1], (ground ?? 2) + 1.1);
  for (let pass = 0; pass < 3; pass++)
    for (const b of buildings) {
      if (
        p[1] >
        b.elevation + (b.id === LANDMARK_ID ? 11 : (b.height ?? 40)) + 1
      )
        continue;
      const ring = b.rings[0];
      const a = ring[0],
        q = ring[1];
      const length = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (!length) continue;
      const ux = (q[0] - a[0]) / length,
        uz = (q[1] - a[1]) / length;
      const toLocal = ([x, z]: readonly number[]) => [
        (x - a[0]) * ux + (z - a[1]) * uz,
        -(x - a[0]) * uz + (z - a[1]) * ux,
      ];
      const points = ring.map(toLocal),
        local = toLocal([p[0], p[2]]);
      const lo = [
        Math.min(...points.map((v) => v[0])) - 1.1,
        Math.min(...points.map((v) => v[1])) - 1.1,
      ];
      const hi = [
        Math.max(...points.map((v) => v[0])) + 1.1,
        Math.max(...points.map((v) => v[1])) + 1.1,
      ];
      if (local.some((v, i) => v < lo[i] || v > hi[i])) continue;
      const exits = [
        local[0] - lo[0],
        hi[0] - local[0],
        local[1] - lo[1],
        hi[1] - local[1],
      ];
      const side = exits.indexOf(Math.min(...exits));
      local[side < 2 ? 0 : 1] =
        (side % 2 ? hi : lo)[side < 2 ? 0 : 1] + (side % 2 ? 0.01 : -0.01);
      p[0] = a[0] + local[0] * ux - local[1] * uz;
      p[2] = a[1] + local[0] * uz + local[1] * ux;
    }
  return p;
}

export function landmarkDetailLod(
  distance: number,
  active: boolean,
  viewportScale = 1,
) {
  return (
    Number.isFinite(distance) &&
    Number.isFinite(viewportScale) &&
    viewportScale > 0 &&
    distance >= 0 &&
    distance < (active ? 130 : 100) * Math.min(1, viewportScale)
  );
}
