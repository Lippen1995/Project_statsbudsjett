import { runDistrict } from "../district/engine";
import { districtInput, type LivingInputs } from "../district/model";
import type { ManagementInputs } from "../management/model";
import {
  validateDevelopment,
  type DevelopmentPlan,
} from "../physical/buildings";
import {
  validatePhysical,
  type PhysicalPlan,
  type PlacementContext,
} from "../physical/model";
import {
  TrafficSimulation,
  DEMAND,
  TOTAL_TICKS,
  type Result,
} from "../simulation/engine";
import {
  emptyPlan,
  validatePlan,
  type Plan,
} from "../simulation/interventions";
import { validateAccess, type AccessPlan } from "./model";
import {
  generateTrips,
  validateMobility,
  type MobilityInputs,
  type TripLedger,
} from "./demand";
export interface ConnectedInput {
  version: 1;
  context: PlacementContext;
  development: DevelopmentPlan;
  physical: PhysicalPlan;
  living: LivingInputs;
  management: ManagementInputs;
  access: AccessPlan;
  mobility: MobilityInputs;
  plan: Plan;
}
export interface ConnectedResult {
  version: 1;
  baseline: Result;
  streetOnly: Result;
  combined: Result;
  additional: Result;
  ledger: TripLedger;
  unrestrictedAdditionalKm: number;
  occupiedHouseholds: number;
  filledJobs: number;
  challenge: { checks: boolean[]; passed: boolean };
}
const finish = (sim: TrafficSimulation) => {
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  return sim.snapshot();
};
export function runConnected(input: ConnectedInput): ConnectedResult {
  if (input.version !== 1)
    throw new Error("Unsupported connected simulation contract.");
  const c = input.context,
    n = c.network,
    physical = validatePhysical(input.physical, c),
    development = validateDevelopment(input.development, c, physical),
    access = validateAccess(input.access, c, development, physical),
    mobility = validateMobility(input.mobility, n),
    plan = validatePlan(input.plan, n);
  const state = runDistrict(
    districtInput(input.living, development.proposals, input.management),
    mobility.month,
  ).at(-1)!;
  const { demand, ledger } = generateTrips(
    mobility,
    state,
    development,
    access,
    n,
  );
  const baseline = finish(new TrafficSimulation(n)),
    streetOnly = finish(new TrafficSimulation(n, plan)),
    combined = finish(new TrafficSimulation(n, plan, [...DEMAND, ...demand])),
    additional = finish(new TrafficSimulation(n, plan, demand));
  // Additional-only attribution is a separate rerun, not a subtraction of nonlinear costs.
  // Demand is appended after base rows: base route assignments remain identical within ticks.
  ledger.routed = additional.served;
  ledger.unrouted = ledger.blocked + additional.unrouted;
  const unrestrictedAdditionalKm = finish(
    new TrafficSimulation(n, emptyPlan(n), demand),
  ).vehicleKm;
  if (
    ledger.generated !== ledger.requested + ledger.capped ||
    ledger.requested !== ledger.routed + ledger.unrouted ||
    ledger.assigned !== additional.requested ||
    combined.requested !== streetOnly.requested + ledger.assigned
  )
    throw new Error("Connected transport demand accounting failed.");
  const checks = [
    mobility.enabled &&
      mobility.month >= 12 &&
      state.occupiedHouseholds >= 3 &&
      state.filledJobs >= 3,
    development.proposals
      .filter((b) => b.purpose === "residential" || b.purpose === "commercial")
      .every((b) =>
        access.connections.some(
          (a) => a.buildingId === b.id && a.mode === "vehicle",
        ),
      ),
    ledger.generated >= 4 && ledger.capped === 0 && ledger.unrouted === 0,
    combined.unrouted === 0 && Math.max(...combined.edgeVc) <= 2.5,
    additional.vehicleKm <= Math.max(0.001, unrestrictedAdditionalKm) * 1.5,
    physical.proposals.length > 0 && state.serviceCoverage >= 0.9,
    mobility.householdTripEnds === 1 &&
      mobility.jobTripEnds === 0.6 &&
      mobility.gatewayId === "645601",
  ];
  return {
    version: 1,
    baseline,
    streetOnly,
    combined,
    additional,
    ledger,
    unrestrictedAdditionalKm,
    occupiedHouseholds: state.occupiedHouseholds,
    filledJobs: state.filledJobs,
    challenge: { checks, passed: checks.every(Boolean) },
  };
}
