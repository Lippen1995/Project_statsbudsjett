import type { ProjectPhase } from "../management/model";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Color,
} from "three";
import type { Point3 } from "./types";
import type { SurfaceSampler } from "./surface";
import {
  footprint,
  validateBuilding,
  type BuildingProposal,
} from "../physical/buildings";
export const PURPOSE_COLORS = {
  residential: "#bd8970",
  commercial: "#689eac",
  civic: "#c4ac68",
};
export interface BuildingVisual {
  building: BuildingProposal;
  baseY: number;
  invalid?: boolean;
  selected?: boolean;
}
function buffer(positions: number[], colors: number[], normals = false) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  if (normals) geometry.computeVertexNormals();
  return geometry;
}
/** One merged body/roof pass and one edge pass, independent of proposal count. */
export function developmentGeometry(
  items: BuildingVisual[],
  surface: SurfaceSampler,
) {
  const positions: number[] = [],
    colors: number[] = [],
    lines: number[] = [],
    lineColors: number[] = [],
    ranges: { id: string; end: number; edgeEnd: number; selected: boolean }[] =
      [];
  for (const item of items.slice(0, 8)) {
    const b = item.building;
    try {
      validateBuilding(b);
    } catch {
      continue;
    }
    const ring = footprint(b),
      floor = item.baseY + 0.08,
      eave = floor + b.storeys * b.storeyHeight;
    const color = new Color(
        item.invalid ? "#d55f55" : PURPOSE_COLORS[b.purpose],
      ),
      roofColor = color.clone().multiplyScalar(0.72),
      edgeColor = new Color(
        item.invalid ? "#ff9181" : item.selected ? "#fff3bf" : "#e6ce9d",
      );
    const tri = (a: Point3, c: Point3, d: Point3, tint: Color) => {
      positions.push(...a, ...c, ...d);
      for (let i = 0; i < 3; i++) colors.push(tint.r, tint.g, tint.b);
    };
    const edge = (a: Point3, c: Point3) => {
      lines.push(...a, ...c);
      for (let i = 0; i < 2; i++)
        lineColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
    };
    const top = ring.map(([x, z]) => [x, eave, z] as Point3);
    // Source terrain is untouched. Schematic ground-contact skirt follows samples,
    // flat conceptual ground floor sits at the highest intersected terrain point.
    for (let i = 0; i < 4; i++) {
      const a = ring[i],
        c = ring[(i + 1) % 4],
        steps = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2);
      for (let j = 0; j < steps; j++) {
        const pts = [j / steps, (j + 1) / steps].map((t) => {
          const x = a[0] + (c[0] - a[0]) * t,
            z = a[1] + (c[1] - a[1]) * t;
          return {
            bottom: [x, surface(x, z) ?? floor, z] as Point3,
            top: [x, eave, z] as Point3,
          };
        });
        tri(pts[0].bottom, pts[0].top, pts[1].top, color);
        tri(pts[0].bottom, pts[1].top, pts[1].bottom, color);
      }
      edge(top[i], top[(i + 1) % 4]);
      edge([a[0], surface(...a) ?? floor, a[1]], top[i]);
    }
    if (b.roof === "flat") {
      tri(top[0], top[1], top[2], roofColor);
      tri(top[0], top[2], top[3], roofColor);
    } else {
      const r0: Point3 = [
          (top[0][0] + top[1][0]) / 2,
          eave + 2,
          (top[0][2] + top[1][2]) / 2,
        ],
        r1: Point3 = [
          (top[2][0] + top[3][0]) / 2,
          eave + 2,
          (top[2][2] + top[3][2]) / 2,
        ];
      tri(top[0], r0, r1, roofColor);
      tri(top[0], r1, top[3], roofColor);
      tri(r0, top[1], top[2], roofColor);
      tri(r0, top[2], r1, roofColor);
      tri(top[0], top[1], r0, color);
      tri(top[2], top[3], r1, color);
      edge(r0, r1);
      edge(top[0], r0);
      edge(top[1], r0);
      edge(top[2], r1);
      edge(top[3], r1);
    }
    ranges.push({
      id: b.id,
      end: positions.length / 9,
      edgeEnd: lines.length / 3,
      selected: !!item.selected,
    });
  }
  const body = buffer(positions, colors, true);
  body.setIndex(
    new Uint16BufferAttribute(
      Array.from({ length: positions.length / 3 }, (_, i) => i),
      1,
    ),
  );
  return {
    baseEdgeColors: new Float32Array(lineColors),
    baseColors: new Float32Array(colors),
    body,
    edges: buffer(lines, lineColors),
    ranges,
  };
}

const activityWarm = new Color("#efdbad");
/** Activity only uploads colours; positions, triangles, normals and draw passes stay fixed. */
export function applyDevelopmentActivity(
  batch: ReturnType<typeof developmentGeometry>,
  activity: Map<string, number> | null,
  excludedId?: string,
  phases: Map<string, ProjectPhase> | null = null,
) {
  const attribute = batch.body.getAttribute("color"),
    array = attribute.array;
  array.set(batch.baseColors);
  const edges = batch.edges.getAttribute("color"),
    index = batch.body.getIndex()!;
  edges.array.set(batch.baseEdgeColors);
  let indexCount = 0,
    edgeStart = 0;
  let start = 0;
  for (const range of batch.ranges) {
    const end = range.end * 9,
      phase = range.id === excludedId ? undefined : phases?.get(range.id),
      value =
        phase && phase !== "operational" ? undefined : activity?.get(range.id);
    if (phase !== "planned" && phase !== "cancelled")
      for (let i = start / 3; i < end / 3; i++) index.setX(indexCount++, i);
    if (phase === "under-construction") {
      const color = new Color("#a58c60");
      for (let i = start; i < end; i += 3) {
        array[i] = color.r;
        array[i + 1] = color.g;
        array[i + 2] = color.b;
      }
    }
    if (phase && !range.selected) {
      const color = new Color(
        phase === "planned"
          ? "#d3e4cf"
          : phase === "under-construction"
            ? "#d2ab65"
            : phase === "cancelled"
              ? "#6d7a77"
              : "#e6ce9d",
      );
      for (let i = edgeStart; i < range.edgeEnd * 3; i += 3) {
        edges.array[i] = color.r;
        edges.array[i + 1] = color.g;
        edges.array[i + 2] = color.b;
      }
    }
    edgeStart = range.edgeEnd * 3;
    if (
      value !== undefined &&
      range.id !== excludedId &&
      Number.isFinite(value)
    ) {
      const u = Math.max(0, Math.min(1, value)),
        mix = 0.2 * u,
        brightness = 0.55 + 0.45 * u,
        warm = [activityWarm.r, activityWarm.g, activityWarm.b];
      for (let i = start; i < end; i++)
        array[i] =
          (batch.baseColors[i] * (1 - mix) + warm[i % 3] * mix) * brightness;
    }
    start = end;
  }
  index.needsUpdate = true;
  batch.body.setDrawRange(0, indexCount);
  edges.needsUpdate = true;
  attribute.needsUpdate = true;
}
