import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Building, CityData, Feature, Point, Road } from "./types";

export function polygonShape(rings: Point[][]): THREE.Shape {
  const shape = new THREE.Shape(
    rings[0].map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  for (const hole of rings.slice(1)) {
    shape.holes.push(
      new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
  }
  return shape;
}

export function buildingGeometry(building: Building): THREE.BufferGeometry {
  const shape = polygonShape(building.rings);
  const geometry =
    building.height === null
      ? new THREE.ShapeGeometry(shape)
      : new THREE.ExtrudeGeometry(shape, {
          depth: building.height,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, building.elevation + 0.3, 0);
  return geometry;
}

function withColor(
  geometry: THREE.BufferGeometry,
  wall: string,
  roof?: string,
) {
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  const sideColor = new THREE.Color(wall);
  const roofColor = new THREE.Color(roof ?? wall);
  for (let i = 0; i < normal.count; i++) {
    (normal.getY(i) > 0.5 ? roofColor : sideColor).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
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

export function makeBuildings(data: CityData) {
  return mergeFeatures(data.buildings, (f) => {
    const b = f as Building;
    return withColor(
      buildingGeometry(b),
      "#e4ddcc",
      b.tags["building:material"] === "glass" ? "#819a9a" : "#b48366",
    );
  });
}

export function roadGeometry(road: Road) {
  const vertices: number[] = [];
  // Schematic width by road class; centreline locations remain observed OSM data.
  const width = /^(primary|secondary|tertiary|trunk)/.test(road.roadClass)
    ? 7
    : /^(footway|path|steps|cycleway)$/.test(road.roadClass)
      ? 1.8
      : 4;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i];
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      length = Math.hypot(dx, dz);
    if (!length) continue;
    const ox = ((-dz / length) * width) / 2,
      oz = ((dx / length) * width) / 2;
    const p = [a[0] + ox, a[1] + 0.8, a[2] + oz];
    const q = [a[0] - ox, a[1] + 0.8, a[2] - oz];
    const r = [b[0] + ox, b[1] + 0.8, b[2] + oz];
    const s = [b[0] - ox, b[1] + 0.8, b[2] - oz];
    vertices.push(...p, ...r, ...q, ...q, ...r, ...s);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function makeRoads(data: CityData) {
  return mergeFeatures(data.roads, (f) => roadGeometry(f as Road));
}

export function makeTerrain(data: CityData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(data.terrain.positions, 3),
  );
  geometry.setIndex(data.terrain.indices);
  geometry.computeVertexNormals();
  const colors = new Float32Array(data.terrain.positions.length);
  const low = new THREE.Color("#b6c5a6"),
    high = new THREE.Color("#718f7c");
  for (let i = 0; i < data.terrain.positions.length; i += 3) {
    low
      .clone()
      .lerp(high, Math.min(1, data.terrain.positions[i + 1] / 350))
      .toArray(colors, i);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
