import type { DistrictMonth } from "../district/model";
import type { DevelopmentPlan } from "../physical/buildings";
import { exactKeys, object } from "../simulation/interventions";
import { TOTAL_TICKS, type Demand } from "../simulation/engine";
import type { Network } from "../simulation/network";
import type { AccessPlan } from "./model";
export interface MobilityInputs {
  version: 1;
  enabled: boolean;
  month: number;
  householdTripEnds: number;
  jobTripEnds: number;
  cap: number;
  gatewayId: string;
}
export const defaultMobility = (): MobilityInputs => ({
  version: 1,
  enabled: false,
  month: 12,
  householdTripEnds: 1,
  jobTripEnds: 0.6,
  cap: 120,
  gatewayId: "645601",
});
/** Synthetic external boundary only, at a real graph endpoint. No commuting destination assertion. */
export function gateways(n: Network) {
  const points = n.nodeIds.map((id) => {
    const e = n.edges.find((e) => e.from === id || e.to === id)!;
    return { id, p: e.from === id ? e.points[0] : e.points.at(-1)! };
  });
  return [
    ...new Set(
      [0, 1].flatMap((axis) => {
        const ordered = [...points].sort(
          (a, b) => a.p[axis] - b.p[axis] || (a.id < b.id ? -1 : 1),
        );
        return ordered.length ? [ordered[0].id, ordered.at(-1)!.id] : [];
      }),
    ),
  ].sort();
}
export function validateMobility(input: unknown, n: Network): MobilityInputs {
  const v = object(input);
  exactKeys(v, [
    "version",
    "enabled",
    "month",
    "householdTripEnds",
    "jobTripEnds",
    "cap",
    "gatewayId",
  ]);
  if (
    v.version !== 1 ||
    typeof v.enabled !== "boolean" ||
    !Number.isInteger(v.month) ||
    Number(v.month) < 0 ||
    Number(v.month) > 24 ||
    typeof v.gatewayId !== "string" ||
    !gateways(n).includes(v.gatewayId) ||
    !Number.isInteger(v.cap) ||
    Number(v.cap) < 1 ||
    Number(v.cap) > 240 ||
    [v.householdTripEnds, v.jobTripEnds].some(
      (x) => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 4,
    )
  )
    throw new Error(
      "Mobility: month 0–24, 0–4 trip ends per equivalent / 30 minutes, cap 1–240 and a supported synthetic boundary gateway.",
    );
  return {
    version: 1,
    enabled: v.enabled,
    month: v.month as number,
    householdTripEnds: v.householdTripEnds as number,
    jobTripEnds: v.jobTripEnds as number,
    cap: v.cap as number,
    gatewayId: v.gatewayId,
  };
}
export interface TripLedger {
  version: 1;
  month: number;
  continuousTripEnds: number;
  roundingAdjustment: number;
  generated: number;
  capped: number;
  requested: number;
  blocked: number;
  assigned: number;
  routed: number;
  unrouted: number;
  sites: {
    id: string;
    used: number;
    generated: number;
    requested: number;
    blocked: number;
    connectionId: string | null;
  }[];
}
/** Monthly stocks are sampled once. Rates already describe ONE representative 30-minute
 * period: no multiplication/division by month length, no mode-share or commuter claim. */
export function generateTrips(
  m: MobilityInputs,
  state: DistrictMonth,
  d: DevelopmentPlan,
  a: AccessPlan,
  n: Network,
): { demand: Demand[]; ledger: TripLedger } {
  validateMobility(m, n);
  if (state.month !== m.month)
    throw new Error("Transport month must match recomputed Living City state.");
  const ledger: TripLedger = {
      version: 1,
      month: m.month,
      continuousTripEnds: 0,
      roundingAdjustment: 0,
      generated: 0,
      capped: 0,
      requested: 0,
      blocked: 0,
      assigned: 0,
      routed: 0,
      unrouted: 0,
      sites: [],
    },
    demand: Demand[] = [];
  if (!m.enabled) return { ledger, demand };
  let remaining = m.cap;
  for (const b of [...d.proposals].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (b.purpose === "civic") continue;
    const activity = state.buildings.find((x) => x.id === b.id);
    if (
      !activity ||
      !Number.isFinite(activity.used) ||
      activity.used < 0 ||
      activity.used > activity.capacity + 1e-8
    )
      throw new Error("Invalid calculated building activity.");
    const operational =
      !state.management ||
      state.management.projects.find((x) => x.id === b.id)?.phase ===
        "operational";
    const used = operational ? activity.used : 0,
      raw =
        used *
        (b.purpose === "residential" ? m.householdTripEnds : m.jobTripEnds),
      generated = Math.floor(raw + 0.5),
      requested = Math.min(remaining, generated);
    remaining -= requested;
    const connection = a.connections.find(
        (x) => x.buildingId === b.id && x.mode === "vehicle",
      ),
      blocked =
        !connection || connection.nodeId === m.gatewayId ? requested : 0;
    ledger.continuousTripEnds += raw;
    ledger.generated += generated;
    ledger.capped += generated - requested;
    ledger.requested += requested;
    ledger.blocked += blocked;
    ledger.assigned += requested - blocked;
    ledger.sites.push({
      id: b.id,
      used,
      generated,
      requested,
      blocked,
      connectionId: connection?.id ?? null,
    });
    if (connection && !blocked && requested) {
      // Each generated trip end is paired with exactly one external trip end. Alternate
      // outbound/inbound trips, spread evenly over the existing 60 fixed ticks.
      for (const inbound of [false, true]) {
        const ticks = Array<number>(TOTAL_TICKS).fill(0);
        for (let k = 0; k < requested; k++)
          if ((k % 2 === 1) === inbound)
            ticks[Math.min(59, Math.floor(((k + 0.5) * 60) / requested))]++;
        if (ticks.some(Boolean))
          demand.push({
            from: inbound ? m.gatewayId : connection.nodeId,
            to: inbound ? connection.nodeId : m.gatewayId,
            access: "local",
            vehiclesPerTick: 0,
            tickVehicles: ticks,
          });
      }
    }
  }
  ledger.roundingAdjustment = ledger.generated - ledger.continuousTripEnds;
  ledger.unrouted = ledger.blocked;
  return { ledger, demand };
}
