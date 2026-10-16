import type { Building, Point } from "./types";

export function metreTag(value: string | undefined): number | null {
  if (!value || !/^\d+(?:[.,]\d+)?(?: m)?$/.test(value)) return null;
  const n = Number(value.replace(" m", "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : null;
}

// Conservative gables only: explicit total AND roof heights, no courtyard and
// a near-rectangular mapped footprint. Never infer a missing height or roof type.
export function gableProfile(b: Building) {
  const height = metreTag(b.tags["roof:height"]);
  if (
    b.heightStatus !== "osm-height" ||
    !b.height ||
    !height ||
    height >= b.height ||
    b.tags["roof:shape"] !== "gabled" ||
    b.rings.length !== 1
  )
    return null;
  const ring = b.rings[0].slice(0, -1);
  if (ring.length < 4) return null;
  let longest = 0,
    axis: Point = [0, 0],
    area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      c = ring[(i + 1) % ring.length],
      dx = c[0] - a[0],
      dz = c[1] - a[1],
      length = Math.hypot(dx, dz);
    area += a[0] * c[1] - c[0] * a[1];
    if (length > longest) {
      longest = length;
      axis = [dx / length, dz / length];
    }
  }
  let across: Point = [-axis[1], axis[0]];
  const along = ring.map((p) => p[0] * axis[0] + p[1] * axis[1]);
  const cross = ring.map((p) => p[0] * across[0] + p[1] * across[1]);
  const rectangle =
    (Math.max(...along) - Math.min(...along)) *
    (Math.max(...cross) - Math.min(...cross));
  if (!rectangle || Math.abs(area / 2) / rectangle < 0.9) return null;
  let orientation = "footprint-estimate";
  const direction = b.tags["roof:direction"];
  if (direction && /^\d+(\.\d+)?$/.test(direction) && Number(direction) < 360) {
    const radians = (Number(direction) * Math.PI) / 180;
    across = [Math.sin(radians), -Math.cos(radians)];
    orientation = "osm-direction";
  } else if (b.tags["roof:orientation"] === "across") across = axis;
  const coordinates = ring.map((p) => p[0] * across[0] + p[1] * across[1]);
  const lo = Math.min(...coordinates),
    hi = Math.max(...coordinates),
    middle = (lo + hi) / 2;
  if (hi - lo < 1) return null;
  const distance = (p: Point) => p[0] * across[0] + p[1] * across[1] - middle;
  const rise = (p: Point) =>
    height * Math.max(0, 1 - (Math.abs(distance(p)) * 2) / (hi - lo));
  return { height, orientation, distance, rise, ring };
}

export function clipAtRidge(
  ring: Point[],
  distance: (p: Point) => number,
  side: number,
): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      da = distance(a) * side,
      db = distance(b) * side;
    if (da >= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}
