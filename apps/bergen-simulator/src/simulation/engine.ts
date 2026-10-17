import { applyPlan, emptyPlan, type Plan } from "./interventions";
import type { Edge, Network } from "./network";

export type Access = "through" | "local" | "service";
export interface Demand {
  from: string;
  to: string;
  access: Access;
  vehiclesPerTick: number;
  tickVehicles?: number[]; // Optional exact 60-tick integer demand; legacy pulse is unchanged.
}
export const TICK_SECONDS = 30;
export const TOTAL_TICKS = 60; // A synthetic 30-minute planning period.
export const DEMAND: readonly Demand[] = [
  { from: "75457133", to: "645599", access: "through", vehiclesPerTick: 4 },
  { from: "645599", to: "75457133", access: "through", vehiclesPerTick: 4 },
  { from: "75457133", to: "645523", access: "local", vehiclesPerTick: 1 },
  { from: "645523", to: "75457133", access: "local", vehiclesPerTick: 1 },
  { from: "75457133", to: "645523", access: "service", vehiclesPerTick: 1 },
  { from: "645523", to: "645599", access: "service", vehiclesPerTick: 1 },
];
export interface Result {
  tick: number;
  requested: number;
  served: number;
  unrouted: number;
  vehicleMinutes: number;
  vehicleKm: number;
  emissionBurden: number; // Arbitrary distance/congestion proxy, not grams CO2.
  throughMetres: number;
  throughServed: number;
  corridorTrips: number;
  corridorThroughTrips: number;
  unroutedByAccess: Record<Access, number>;
  edgeVehicles: number[];
  edgeVc: number[]; // Period-average directional volume / assumed hourly capacity.
  nodeBalance: Record<string, number>; // Inflow minus outflow, for conservation audit.
  endpointBalance: Record<string, number>;
}
export function initialResult(network: Network): Result {
  return {
    tick: 0,
    requested: 0,
    served: 0,
    unrouted: 0,
    vehicleMinutes: 0,
    vehicleKm: 0,
    emissionBurden: 0,
    throughMetres: 0,
    throughServed: 0,
    corridorTrips: 0,
    corridorThroughTrips: 0,
    unroutedByAccess: { through: 0, local: 0, service: 0 },
    edgeVehicles: network.edges.map(() => 0),
    edgeVc: network.edges.map(() => 0),
    nodeBalance: {},
    endpointBalance: {},
  };
}
export function permitted(edge: Edge, access: Access): boolean {
  const rule = edge.modelAccess ?? "all";
  return (
    rule === "all" ||
    (rule === "local" && access !== "through") ||
    (rule === "service" && access === "service")
  );
}
export function travelSeconds(edge: Edge, vehicles: number): number {
  // Assumed free-flow speed 20 km/h. BPR-style curve, bounded at V/C 4.
  const vc = Math.min(
    4,
    (Math.max(0, vehicles) * 3600) / TICK_SECONDS / edge.capacityVph,
  );
  return (edge.lengthM / (20000 / 3600)) * (1 + 0.15 * vc ** 4);
}
/** Deterministic Dijkstra. Finite node visits and stable edge order break ties. */
export function route(
  network: Network,
  from: string,
  to: string,
  access: Access,
  loads: readonly number[],
): number[] | null {
  if (!network.nodeIds.includes(from) || !network.nodeIds.includes(to))
    return null;
  const distance = new Map([[from, 0]]),
    previous = new Map<string, number>(),
    visited = new Set<string>();
  for (let step = 0; step < network.nodeIds.length; step++) {
    let current: string | undefined;
    let best = Infinity;
    for (const id of network.nodeIds)
      if (!visited.has(id) && (distance.get(id) ?? Infinity) < best) {
        current = id;
        best = distance.get(id)!;
      }
    if (current === undefined) return null;
    if (current === to) {
      const path: number[] = [];
      let node = to;
      for (let i = 0; node !== from && i < network.nodeIds.length; i++) {
        const e = previous.get(node);
        if (e === undefined) return null;
        path.push(e);
        node = network.edges[e].from;
      }
      return node === from ? path.reverse() : null;
    }
    visited.add(current);
    network.edges.forEach((edge, i) => {
      if (edge.from !== current || !permitted(edge, access)) return;
      const next = best + travelSeconds(edge, (loads[i] ?? 0) + 1);
      if (next < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, next);
        previous.set(edge.to, i);
      }
    });
  }
  return null;
}
export class TrafficSimulation {
  private readonly network: Network;
  private readonly demand: Demand[];
  private result: Result;
  constructor(
    network: Network,
    plan: Plan = emptyPlan(network),
    demand: readonly Demand[] = DEMAND,
  ) {
    if (
      network.edges.length > 500 ||
      network.nodeIds.length > 300 ||
      new Set(network.nodeIds).size !== network.nodeIds.length ||
      network.edges.some(
        (e) =>
          !Number.isFinite(e.lengthM) ||
          e.lengthM <= 0 ||
          !Number.isFinite(e.capacityVph) ||
          e.capacityVph <= 0 ||
          !network.nodeIds.includes(e.from) ||
          !network.nodeIds.includes(e.to),
      ) ||
      demand.length > 100 ||
      demand.reduce((sum, d) => sum + d.vehiclesPerTick, 0) > 60 ||
      Array.from({ length: TOTAL_TICKS }, (_, tick) =>
        demand.reduce(
          (sum, d) =>
            sum +
            (d.tickVehicles?.[tick] ??
              d.vehiclesPerTick * (tick >= 20 && tick < 40 ? 2 : 1)),
          0,
        ),
      ).some((n) => n > 120) ||
      demand.some(
        (d) =>
          (d.tickVehicles !== undefined &&
            (!Array.isArray(d.tickVehicles) ||
              d.tickVehicles.length !== TOTAL_TICKS ||
              d.vehiclesPerTick !== 0 ||
              d.tickVehicles.some(
                (n) => !Number.isInteger(n) || n < 0 || n > 4,
              ))) ||
          !Number.isInteger(d.vehiclesPerTick) ||
          d.vehiclesPerTick < 0 ||
          d.vehiclesPerTick > 100 ||
          d.from === d.to ||
          !["through", "local", "service"].includes(d.access),
      )
    )
      throw new Error("Invalid or unbounded scenario inputs.");
    // Own copies: running/resetting cannot mutate either source or callers.
    this.network = applyPlan(network, plan);
    this.demand = structuredClone(demand) as Demand[];
    this.result = initialResult(this.network);
  }
  reset(): Result {
    this.result = initialResult(this.network);
    return this.snapshot();
  }
  snapshot(): Result {
    return structuredClone(this.result);
  }
  step(): Result {
    const r = this.result;
    if (r.tick >= TOTAL_TICKS) return this.snapshot();
    const loads = this.network.edges.map(() => 0);
    // Ten quiet minutes, ten peak minutes, ten quiet minutes. No stochastic input.
    const multiplier = r.tick >= 20 && r.tick < 40 ? 2 : 1;
    const delta = (
      record: Record<string, number>,
      node: string,
      value: number,
    ) => {
      record[node] = (record[node] ?? 0) + value;
    };
    // Incremental assignment within each fixed tick; routes respond to loads using
    // exactly the same cost function for every policy. Not a vehicle movement model.
    for (const od of this.demand)
      for (
        let trip = 0;
        trip < (od.tickVehicles?.[r.tick] ?? od.vehiclesPerTick * multiplier);
        trip++
      ) {
        r.requested++;
        const path = route(this.network, od.from, od.to, od.access, loads);
        if (!path) {
          r.unrouted++;
          r.unroutedByAccess[od.access]++;
          continue;
        }
        r.served++;
        delta(r.endpointBalance, od.from, -1);
        delta(r.endpointBalance, od.to, 1);
        if (path.some((i) => this.network.edges[i].corridor)) {
          r.corridorTrips++;
          if (od.access === "through") r.corridorThroughTrips++;
        }
        let distanceM = 0;
        for (const i of path) {
          loads[i]++;
          r.edgeVehicles[i]++;
          const edge = this.network.edges[i];
          distanceM += edge.lengthM;
          delta(r.nodeBalance, edge.from, -1);
          delta(r.nodeBalance, edge.to, 1);
        }
        if (od.access === "through") {
          r.throughServed++;
          r.throughMetres += distanceM;
        }
      }
    this.network.edges.forEach((edge, i) => {
      const vc = (loads[i] * 3600) / TICK_SECONDS / edge.capacityVph;
      r.vehicleMinutes += (loads[i] * travelSeconds(edge, loads[i])) / 60;
      r.vehicleKm += (loads[i] * edge.lengthM) / 1000;
      r.emissionBurden +=
        ((loads[i] * edge.lengthM) / 1000) *
        (1 + 0.2 * Math.max(0, vc - 0.6) ** 2);
    });
    r.tick++;
    r.edgeVc = r.edgeVehicles.map(
      (n, i) =>
        (n * 3600) /
        (r.tick * TICK_SECONDS) /
        this.network.edges[i].capacityVph,
    );
    return this.snapshot();
  }
}
