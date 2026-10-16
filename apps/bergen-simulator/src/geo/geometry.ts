import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Building, CityData, Feature, Point, Road } from "./types";
import { clipAtRidge, gableProfile, metreTag } from "./roofs";
import { terrainSampler, type SurfaceSampler } from "./surface";

export function polygonShape(rings: Point[][]): THREE.Shape {
  const shape = new THREE.Shape(
    rings[0].map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  for (const hole of rings.slice(1))
    shape.holes.push(
      new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
  return shape;
}
function withColor(geometry: THREE.BufferGeometry, wall: string, roof = wall) {
  const normal = geometry.getAttribute("normal"),
    colors = new Float32Array(normal.count * 3);
  const side = new THREE.Color(wall),
    top = new THREE.Color(roof);
  for (let i = 0; i < normal.count; i++)
    (normal.getY(i) > 0.5 ? top : side).toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function triangles(vertices: number[], color: string) {
  const g = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  g.computeVertexNormals();
  return withColor(g, color);
}
function ringArea(ring: Point[]) {
  return (
    ring.reduce((a, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
function appendFaces(target: number[], vertices: number[], reverse: boolean) {
  for (let i = 0; i < vertices.length; i += 9)
    target.push(
      ...vertices.slice(i, i + 3),
      ...vertices.slice(i + (reverse ? 6 : 3), i + (reverse ? 9 : 6)),
      ...vertices.slice(i + (reverse ? 3 : 6), i + (reverse ? 6 : 9)),
    );
}
function mergeParts(parts: THREE.BufferGeometry[]) {
  // Untextured city materials need no UVs. Procedural roofs/foundations and
  // Three's extrusions must share the same attribute layout before batching.
  parts.forEach((p) => p.deleteAttribute("uv"));
  const normalized = parts.map((p) => {
    if (!p.index) return p;
    const n = p.toNonIndexed();
    p.dispose();
    return n;
  });
  const g = mergeGeometries(normalized, false)!;
  normalized.forEach((p) => p.dispose());
  return g;
}
const WALLS = ["#d6cbb7", "#c5b396", "#d5d2c5", "#b7c3bd", "#d3bf9c"];
const ROOFS = ["#705247", "#845744", "#596566", "#795d50", "#4f5b60"];
const TINTS: Record<string, string> = {
  red: "#a85842",
  brown: "#77533e",
  white: "#e6ded0",
  beige: "#d1bb91",
  orange: "#bd8350",
  black: "#414a50",
  grey: "#7b8585",
  gray: "#7b8585",
  aqua: "#6d9b99",
};
export function buildingPalette(b: Building) {
  const hash = [...b.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return {
    wall: TINTS[b.tags["building:colour"]] ?? WALLS[hash % WALLS.length],
    roof:
      b.height === null
        ? "#7b928b"
        : (TINTS[b.tags["roof:colour"]] ?? ROOFS[hash % ROOFS.length]),
  };
}

export function buildingGeometry(
  b: Building,
  sample?: SurfaceSampler,
): THREE.BufferGeometry {
  const { wall, roof } = buildingPalette(b),
    profile = gableProfile(b),
    base = b.elevation + 0.3;
  const shape = polygonShape(b.rings);
  const body =
    b.height === null
      ? new THREE.ShapeGeometry(shape)
      : new THREE.ExtrudeGeometry(shape, {
          depth: b.height - (profile?.height ?? 0),
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
  body.rotateX(-Math.PI / 2);
  body.translate(0, base, 0);
  if (b.ground) {
    const heights = new Map<string, number>();
    b.rings.forEach((ring, r) =>
      ring.forEach(([x, z], i) => heights.set(`${x},${z}`, b.ground![r][i])),
    );
    const p = body.getAttribute("position");
    const corners = b.rings.flat();
    for (let i = 0; i < p.count; i++) {
      // Extend existing bottom wall vertices to ground instead of adding a
      // duplicate ring of foundation triangles. Roof and height stay unchanged.
      if (b.height !== null && Math.abs(p.getY(i) - base) > 0.001) continue;
      const x = p.getX(i),
        z = p.getZ(i);
      // Float32 conversion may round source coordinates, so use the terrain TIN
      // first, then the nearest retained footprint corner outside the land mask.
      const nearest = corners.reduce((a, c) =>
        Math.hypot(c[0] - x, c[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? c : a,
      );
      p.setY(
        i,
        (sample?.(x, z) ??
          heights.get(`${nearest[0]},${nearest[1]}`) ??
          b.elevation) + (b.height === null ? 0.3 : 0.05),
      );
    }
    body.computeVertexNormals();
  }
  const parts = [withColor(body, wall, roof)];
  if (profile) {
    const y = base + b.height! - profile.height,
      vertices: number[] = [],
      ends: number[] = [];
    for (const side of [-1, 1]) {
      const half = clipAtRidge(profile.ring, profile.distance, side);
      const faces = THREE.ShapeUtils.triangulateShape(
        half.map((p) => new THREE.Vector2(...p)),
        [],
      );
      for (const face of faces) {
        const pts = face.map((i) => half[i]);
        const [a, c, d] = pts;
        if ((c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]) > 0)
          pts.reverse();
        for (const p of pts) vertices.push(p[0], y + profile.rise(p), p[1]);
      }
    }
    for (let i = 0; i < profile.ring.length; i++) {
      const a = profile.ring[i],
        c = profile.ring[(i + 1) % profile.ring.length];
      const da = profile.distance(a),
        dc = profile.distance(c),
        edge = [a];
      if (da * dc < 0) {
        const t = da / (da - dc);
        edge.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
      }
      edge.push(c);
      for (let j = 1; j < edge.length; j++) {
        const p = edge[j - 1],
          q = edge[j];
        if (profile.rise(p) + profile.rise(q) < 0.001) continue;
        appendFaces(
          ends,
          [
            p[0],
            y,
            p[1],
            q[0],
            y,
            q[1],
            p[0],
            y + profile.rise(p),
            p[1],
            q[0],
            y,
            q[1],
            q[0],
            y + profile.rise(q),
            q[1],
            p[0],
            y + profile.rise(p),
            p[1],
          ],
          ringArea(profile.ring) > 0,
        );
      }
    }
    parts.push(triangles(vertices, roof), triangles(ends, wall));
  }
  return mergeParts(parts);
}

export interface FeatureRange {
  end: number;
  feature: Feature;
}
function mergeFeatures(
  features: Feature[],
  make: (f: Feature) => THREE.BufferGeometry,
) {
  let end = 0;
  const ranges: FeatureRange[] = [];
  const parts = features.map((feature) => {
    let part = make(feature);
    if (part.index) {
      const old = part;
      part = old.toNonIndexed();
      old.dispose();
    }
    end += part.getAttribute("position").count / 3;
    ranges.push({ end, feature });
    return part;
  });
  const geometry = parts.length
    ? mergeGeometries(parts, false)!
    : new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  geometry.computeBoundingSphere();
  return { geometry, ranges };
}
export function featureAtFace(
  ranges: FeatureRange[],
  face: number,
): Feature | null {
  if (face < 0 || !Number.isInteger(face)) return null;
  let low = 0,
    high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (face < ranges[mid].end) high = mid - 1;
    else low = mid + 1;
  }
  return ranges[low]?.feature ?? null;
}
export function makeBuildings(
  data: CityData,
  sample = terrainSampler(data.terrain),
) {
  return mergeFeatures(data.buildings, (f) =>
    buildingGeometry(f as Building, sample),
  );
}
export function roadWidth(road: Road) {
  const reported = metreTag(road.tags.width);
  return reported && reported <= 30
    ? reported
    : /^(primary|secondary|tertiary|trunk)/.test(road.roadClass)
      ? 7
      : /^(footway|path|steps|cycleway)$/.test(road.roadClass)
        ? 1.8
        : 4;
}
export function roadGeometry(road: Road, sample?: SurfaceSampler) {
  const vertices: number[] = [],
    width = roadWidth(road);
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      dx = b[0] - a[0],
      dz = b[2] - a[2],
      length = Math.hypot(dx, dz);
    if (!length) continue;
    const ox = ((-dz / length) * width) / 2,
      oz = ((dx / length) * width) / 2;
    const point = (p: typeof a, sign: number) => [
      p[0] + ox * sign,
      (sample?.(p[0] + ox * sign, p[2] + oz * sign) ?? p[1]) + 0.22,
      p[2] + oz * sign,
    ];
    const p = point(a, 1),
      q = point(a, -1),
      r = point(b, 1),
      s = point(b, -1);
    vertices.push(...p, ...r, ...q, ...q, ...r, ...s);
  }
  const g = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  g.computeVertexNormals();
  return g;
}
export function makeRoads(
  data: CityData,
  sample = terrainSampler(data.terrain),
) {
  return mergeFeatures(
    data.roads.filter((r) => !r.renderStatus || r.renderStatus === "surface"),
    (f) => {
      const r = f as Road,
        path = /^(footway|path|steps|cycleway)$/.test(r.roadClass),
        major = /^(primary|secondary|trunk)/.test(r.roadClass);
      return withColor(
        roadGeometry(r, sample),
        path ? "#c7bfa4" : major ? "#636e70" : "#969b90",
      );
    },
  );
}
export function makeTerrain(data: CityData) {
  const g = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(data.terrain.positions, 3),
  );
  g.setIndex(data.terrain.indices);
  g.computeVertexNormals();
  const colors = new Float32Array(data.terrain.positions.length),
    urban = new THREE.Color("#a6ad9d"),
    hill = new THREE.Color("#6e8873"),
    park = new THREE.Color("#819a68"),
    wood = new THREE.Color("#4e735d");
  for (let i = 0; i < data.terrain.positions.length; i += 3) {
    const cover = data.terrain.cover?.[i / 3] ?? 0;
    (cover === 2
      ? wood
      : cover === 1
        ? park
        : urban
            .clone()
            .lerp(hill, Math.min(1, data.terrain.positions[i + 1] / 280))
    ).toArray(colors, i);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeBoundingSphere();
  return g;
}
export function makeWater(data: CityData) {
  const [w, n, e, s] = data.extent,
    sea = new THREE.PlaneGeometry(
      Math.max(e - w, s - n) * 12,
      Math.max(e - w, s - n) * 12,
    );
  sea.rotateX(-Math.PI / 2);
  sea.translate((w + e) / 2, -0.6, (n + s) / 2);
  const parts = [withColor(sea, "#285563")];
  for (const water of data.water) {
    const g = new THREE.ShapeGeometry(polygonShape(water.rings));
    g.rotateX(-Math.PI / 2);
    g.translate(0, water.elevation + 0.08, 0);
    parts.push(withColor(g, "#426b70"));
  }
  const g = mergeParts(parts);
  g.computeBoundingSphere();
  return g;
}
export function makeCoastalEdge(data: CityData) {
  const vertices: number[] = [];
  data.coastline.forEach((line, l) => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        ay = data.coastElevation?.[l][i - 1] ?? 0,
        by = data.coastElevation?.[l][i] ?? 0;
      vertices.push(
        a[0],
        ay,
        a[1],
        b[0],
        by,
        b[1],
        a[0],
        -0.6,
        a[1],
        b[0],
        by,
        b[1],
        b[0],
        -0.6,
        b[1],
        a[0],
        -0.6,
        a[1],
      );
    }
  });
  return triangles(vertices, "#737e78");
}
