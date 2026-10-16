import type { Edge, Network } from "./network";
export type AccessRule = "all" | "local" | "service" | "closed";
export interface Intervention {
  segmentId: string;
  access: AccessRule;
  capacityFactor: number;
}
export interface Plan {
  version: 1;
  networkId: string;
  interventions: Intervention[];
}
export const CAPACITY_FACTORS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
] as const;
export function segmentId(edge: Edge): string {
  return [edge.wayId, ...[edge.from, edge.to].sort()].join(":");
}
export function segments(network: Network): Edge[] {
  const unique = new Map<string, Edge>();
  for (const edge of network.edges)
    if (!unique.has(segmentId(edge))) unique.set(segmentId(edge), edge);
  return [...unique.values()];
}
/** Compatibility checksum, not a security signature. Includes topology, rounded
 * geometry and baseline model capacities; never depends on the player's edits. */
export function networkId(network: Network): string {
  const text = JSON.stringify(
    network.edges.map((e) => [
      e.id,
      e.nodeIds,
      e.points.map((p) => p.map((n) => +n.toFixed(4))),
      e.capacityVph,
    ]),
  );
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return `bryggen-transport-model-1-${hash.toString(16).padStart(8, "0")}`;
}
export function emptyPlan(network: Network): Plan {
  return { version: 1, networkId: networkId(network), interventions: [] };
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a scenario object.");
  return value as Record<string, unknown>;
}
export function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
): void {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new Error("Unsupported scenario fields.");
}
export function validatePlan(input: unknown, network: Network): Plan {
  const p = object(input);
  exactKeys(p, ["version", "networkId", "interventions"]);
  if (
    p.version !== 1 ||
    p.networkId !== networkId(network) ||
    !Array.isArray(p.interventions) ||
    p.interventions.length > 31
  )
    throw new Error("Incompatible plan version or transport network.");
  const supported = new Set(segments(network).map(segmentId)),
    seen = new Set<string>();
  const edits = p.interventions.map((value) => {
    const e = object(value);
    exactKeys(e, ["segmentId", "access", "capacityFactor"]);
    if (
      typeof e.segmentId !== "string" ||
      !supported.has(e.segmentId) ||
      seen.has(e.segmentId) ||
      !["all", "local", "service", "closed"].includes(String(e.access)) ||
      typeof e.access !== "string" ||
      typeof e.capacityFactor !== "number" ||
      !(CAPACITY_FACTORS as readonly number[]).includes(e.capacityFactor) ||
      (e.access === "closed" && e.capacityFactor !== 1)
    )
      throw new Error(
        "Invalid, duplicate, unsupported or contradictory street edit.",
      );
    seen.add(e.segmentId);
    return {
      segmentId: e.segmentId,
      access: e.access as AccessRule,
      capacityFactor: e.capacityFactor,
    };
  });
  return {
    version: 1,
    networkId: p.networkId as string,
    interventions: edits
      .filter((e) => e.access !== "all" || e.capacityFactor !== 1)
      .sort((a, b) =>
        a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0,
      ),
  };
}
export function editPlan(
  plan: Plan,
  edit: Intervention | { segmentId: string },
  network: Network,
): Plan {
  if (!segments(network).some((e) => segmentId(e) === edit.segmentId))
    throw new Error("This street section is outside the verified model.");
  return validatePlan(
    {
      ...plan,
      interventions: [
        ...plan.interventions.filter((e) => e.segmentId !== edit.segmentId),
        ...("access" in edit ? [edit] : []),
      ],
    },
    network,
  );
}
export function applyPlan(network: Network, input: unknown): Network {
  const plan = validatePlan(input, network),
    edits = new Map(plan.interventions.map((e) => [e.segmentId, e]));
  const next = structuredClone(network);
  for (const edge of next.edges) {
    const edit = edits.get(segmentId(edge));
    edge.capacityVph *= edit?.capacityFactor ?? 1;
    edge.modelAccess = edit?.access ?? "all";
  }
  return next;
}
/** Pointer disambiguation only. This never establishes geographic connectivity. */
export function nearestSegment(
  network: Network,
  wayId: string,
  point: [number, number],
): string | null {
  let closest: string | null = null,
    distance = Infinity;
  for (const e of segments(network).filter((e) => e.wayId === wayId))
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1],
        b = e.points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
            (dx * dx + dz * dz || 1),
        ),
      );
      const d = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
      if (d < distance) {
        distance = d;
        closest = segmentId(e);
      }
    }
  return closest;
}
