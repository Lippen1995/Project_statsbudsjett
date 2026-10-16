import type { AccessRule } from "./interventions";
import { project } from "../geo/projection";

export interface TransportSource {
  version: number;
  origin: [number, number];
  nodes: Record<string, [number, number]>;
  ways: { id: string; nodeIds: string[]; tags: Record<string, string> }[];
  provenance: {
    licence: string;
    topology: string;
    turnRestrictionAudit: string;
  };
}
export interface Edge {
  id: string;
  wayId: string;
  name: string;
  from: string;
  to: string;
  nodeIds: string[];
  points: [number, number][];
  lengthM: number;
  corridor: boolean;
  modelAccess?: AccessRule;
  capacityVph: number; // Model assumption, never an OSM observation.
}
export interface Network {
  edges: Edge[];
  nodeIds: string[];
}
const CORRIDOR = new Set(["way/9649862", "way/488690111"]);
const MOTOR = /^(primary|secondary|tertiary|unclassified|residential)(_link)?$/;

/** Split only at shared source node IDs. Crossing lines do not imply a junction. */
export function buildNetwork(source: TransportSource): Network {
  if (
    source.version !== 1 ||
    source.ways.length < 1 ||
    source.ways.length > 100 ||
    source.provenance?.licence !== "ODbL-1.0" ||
    source.origin?.length !== 2 ||
    !source.origin.every(Number.isFinite)
  )
    throw new Error("Invalid or unbounded transport snapshot.");
  const seen = new Set<string>();
  const usage = new Map<string, number>();
  for (const way of source.ways) {
    if (
      seen.has(way.id) ||
      !/^way\/\d+$/.test(way.id) ||
      way.nodeIds.length < 2 ||
      way.nodeIds.length > 1000 ||
      new Set(way.nodeIds).size !== way.nodeIds.length
    )
      throw new Error("Invalid source way identity or geometry.");
    seen.add(way.id);
    if (
      !MOTOR.test(way.tags.highway) ||
      way.tags.bridge ||
      way.tags.tunnel ||
      ["no", "private"].includes(way.tags.motor_vehicle ?? way.tags.access) ||
      (way.tags.oneway && !["yes", "no", "1", "-1"].includes(way.tags.oneway))
    )
      throw new Error("Unreviewed road access, direction or grade separation.");
    for (const id of new Set(way.nodeIds)) {
      const p = source.nodes[id];
      if (
        !/^\d+$/.test(id) ||
        !p ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0] - source.origin[0]) > 0.05 ||
        Math.abs(p[1] - source.origin[1]) > 0.05
      )
        throw new Error("Missing or invalid original OSM node.");
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
  const edges: Edge[] = [];
  for (const way of source.ways) {
    let start = 0;
    for (let i = 1; i < way.nodeIds.length; i++) {
      if (i !== way.nodeIds.length - 1 && usage.get(way.nodeIds[i]) === 1)
        continue;
      const nodeIds = way.nodeIds.slice(start, i + 1);
      const points = nodeIds.map((id) =>
        project(source.nodes[id], source.origin),
      );
      const lengthM = points
        .slice(1)
        .reduce(
          (sum, p, j) =>
            sum + Math.hypot(p[0] - points[j][0], p[1] - points[j][1]),
          0,
        );
      if (!(lengthM > 0.01)) throw new Error("Degenerate source edge.");
      const capacityVph = way.tags.highway.startsWith("primary")
        ? 600
        : way.tags.highway.startsWith("secondary")
          ? 420
          : way.tags.highway.startsWith("tertiary")
            ? 300
            : 250;
      const add = (reverse: boolean) => {
        const ids = reverse ? [...nodeIds].reverse() : [...nodeIds];
        edges.push({
          id: `${way.id}:${ids[0]}:${ids.at(-1)}`,
          wayId: way.id,
          name: way.tags.name ?? "Unnamed mapped road",
          from: ids[0],
          to: ids.at(-1)!,
          nodeIds: ids,
          points: reverse ? [...points].reverse() : points,
          lengthM,
          corridor: CORRIDOR.has(way.id),
          capacityVph,
        });
      };
      if (way.tags.oneway !== "-1") add(false);
      if (!["yes", "1"].includes(way.tags.oneway)) add(true);
      start = i;
    }
  }
  return {
    edges,
    nodeIds: [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort(),
  };
}
