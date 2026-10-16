import * as THREE from "three";
import type { Network } from "../simulation/network";
import type { Result } from "../simulation/engine";
import type { SurfaceSampler } from "./surface";

export function trafficColor(vc: number): THREE.Color {
  const stops = ["#458ca0", "#58b59b", "#edc167", "#df684d"];
  const n = Math.min(3, Math.max(0, vc * 2));
  return new THREE.Color(stops[Math.floor(n)]).lerp(
    new THREE.Color(stops[Math.min(3, Math.floor(n) + 1)]),
    n % 1,
  );
}
/** One merged pass. Undirected strips use the worse directional V/C; source
 * vertices are subdivided solely to drape the original line on the existing TIN. */
export function trafficGeometry(
  network: Network,
  result: Result | null,
  sample: SurfaceSampler,
  corridor: boolean,
  baseline: boolean,
) {
  const vertices: number[] = [],
    colors: number[] = [],
    ranges: { end: number; wayId: string }[] = [];
  const groups = new Map<string, number[]>();
  network.edges.forEach((e, i) => {
    const key = [e.wayId, ...[e.from, e.to].sort()].join(":");
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const indices of groups.values()) {
    const edge = network.edges[indices[0]];
    if (corridor && !edge.corridor) continue;
    const color = corridor
      ? new THREE.Color(baseline ? "#a5e5ed" : "#ffd179")
      : trafficColor(Math.max(...indices.map((i) => result?.edgeVc[i] ?? 0)));
    const points: [number, number][] = [];
    edge.points.slice(1).forEach((b, i) => {
      const a = edge.points[i],
        steps = Math.max(
          1,
          Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8),
        );
      if (i === 0) points.push(a);
      for (let j = 1; j <= steps; j++)
        points.push([
          a[0] + ((b[0] - a[0]) * j) / steps,
          a[1] + ((b[1] - a[1]) * j) / steps,
        ]);
    });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!length) continue;
      const width = corridor ? 12 : 6,
        ox = ((-(b[1] - a[1]) / length) * width) / 2,
        oz = (((b[0] - a[0]) / length) * width) / 2;
      const p = (point: [number, number], sign: number) => {
        const x = point[0] + ox * sign,
          z = point[1] + oz * sign;
        const y = sample(x, z);
        if (y === null)
          throw new Error("Transport overlay lies outside verified terrain.");
        return [x, y + (corridor ? 0.42 : 0.55), z];
      };
      const p1 = p(a, 1),
        p2 = p(a, -1),
        p3 = p(b, 1),
        p4 = p(b, -1);
      vertices.push(...p1, ...p3, ...p2, ...p2, ...p3, ...p4);
      for (let v = 0; v < 6; v++) colors.push(color.r, color.g, color.b);
    }
    ranges.push({ end: vertices.length / 9, wayId: edge.wayId });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return { geometry, ranges };
}
