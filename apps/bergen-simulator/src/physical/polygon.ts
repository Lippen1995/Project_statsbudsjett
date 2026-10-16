import type { Point } from "../geo/types";
export const EPS = 1e-7;
export const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const signedArea = (p: Point[]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
export const area = (p: Point[]) => Math.abs(signedArea(p));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export function pointSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return distance(p, [a[0] + t * dx, a[1] + t * dz]);
}
export function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const x = cross(a, b, c),
    y = cross(a, b, d),
    z = cross(c, d, a),
    w = cross(c, d, b);
  return (
    (((x > EPS && y < -EPS) || (x < -EPS && y > EPS)) &&
      ((z > EPS && w < -EPS) || (z < -EPS && w > EPS))) ||
    (Math.abs(x) <= EPS && pointSegment(c, a, b) <= EPS) ||
    (Math.abs(y) <= EPS && pointSegment(d, a, b) <= EPS) ||
    (Math.abs(z) <= EPS && pointSegment(a, c, d) <= EPS) ||
    (Math.abs(w) <= EPS && pointSegment(b, c, d) <= EPS)
  );
}
export function inside(p: Point, ring: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (pointSegment(p, a, b) < EPS) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
export const inFootprint = (p: Point, rings: Point[][]) =>
  inside(p, rings[0]) && !rings.slice(1).some((r) => inside(p, r));
export function boundaryDistance(
  a: Point[],
  b: Point[],
  closedB = true,
): number {
  let d = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length - (closedB ? 0 : 1); j++) {
      const aa = a[i],
        ab = a[(i + 1) % a.length],
        ba = b[j],
        bb = b[(j + 1) % b.length];
      if (intersects(aa, ab, ba, bb)) return 0;
      d = Math.min(
        d,
        pointSegment(aa, ba, bb),
        pointSegment(ab, ba, bb),
        pointSegment(ba, aa, ab),
        pointSegment(bb, aa, ab),
      );
    }
  return d;
}
export function overlaps(a: Point[], rings: Point[][]): boolean {
  return (
    a.some((p) => inFootprint(p, rings)) ||
    rings[0].some((p) => inside(p, a)) ||
    rings.some((r) => boundaryDistance(a, r) < EPS)
  );
}
export function simple(p: Point[]): boolean {
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (intersects(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]))
        return false;
    }
  return area(p) > EPS;
}
/** Bounded ear clipping: <=8 vertices, at most n² candidates, no unbounded loop. */
export function triangulate(p: Point[]): Point[][] {
  const vertices = signedArea(p) > 0 ? [...p] : [...p].reverse(),
    result: Point[][] = [];
  for (let pass = 0; vertices.length > 3 && pass < p.length; pass++) {
    let found = false;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[(i + vertices.length - 1) % vertices.length],
        b = vertices[i],
        c = vertices[(i + 1) % vertices.length];
      if (
        cross(a, b, c) <= EPS ||
        vertices.some(
          (v) => v !== a && v !== b && v !== c && inside(v, [a, b, c]),
        )
      )
        continue;
      result.push([a, b, c]);
      vertices.splice(i, 1);
      found = true;
      break;
    }
    if (!found)
      throw new Error(
        "Polygon has ambiguous or collinear vertices. Move or remove a vertex.",
      );
  }
  if (vertices.length !== 3 || area(vertices) < EPS)
    throw new Error("Polygon cannot be triangulated.");
  result.push(vertices);
  return result;
}
/** Intersection with a convex clip polygon. Used for exact TIN coverage and draping. */
export function clip(subject: Point[], triangle: Point[]): Point[] {
  let out = subject;
  const t = signedArea(triangle) > 0 ? triangle : [...triangle].reverse();
  for (let i = 0; i < t.length; i++) {
    const a = t[i],
      b = t[(i + 1) % t.length],
      input = out;
    out = [];
    if (!input.length) break;
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        cp = cross(a, b, p),
        cq = cross(a, b, q);
      if (cp >= -EPS) out.push(p);
      if (cp >= -EPS !== cq >= -EPS) {
        const f = cp / (cp - cq);
        out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
      }
    }
  }
  return out;
}
export const bounds = (p: Point[]) => [
  Math.min(...p.map((v) => v[0])),
  Math.min(...p.map((v) => v[1])),
  Math.max(...p.map((v) => v[0])),
  Math.max(...p.map((v) => v[1])),
];
export const boxesIntersect = (a: number[], b: number[], pad = 0) =>
  a[0] - pad <= b[2] &&
  a[2] + pad >= b[0] &&
  a[1] - pad <= b[3] &&
  a[3] + pad >= b[1];
