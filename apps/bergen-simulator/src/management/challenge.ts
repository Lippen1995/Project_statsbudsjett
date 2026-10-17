import {
  defaultLiving,
  districtInput,
  validateHistory,
  type LivingInputs,
  type DistrictMonth,
} from "../district/model";
import { defaultBudget, type ManagementInputs, MONEY } from "./model";
import {
  validateDevelopment,
  type DevelopmentPlan,
} from "../physical/buildings";
import {
  validatePhysical,
  placement,
  type PhysicalPlan,
  type PlacementContext,
} from "../physical/model";
import { area } from "../physical/polygon";
export const SUSTAINABLE_GOALS = Object.freeze({
  month: 24,
  minHouseholds: 5,
  maxHouseholds: 8,
  minJobs: 7,
  maxJobs: 14,
  householdUse: 0.6,
  jobUse: 0.35,
  serviceCover: 0.95,
  serviceUse: 0.25,
  householdMonths: 90,
  maxCapital: 1200,
  maxOperating: 1000,
  minPublicSpace: 120,
  maxPublicSpace: 350,
});
export function sustainableQuarter(
  development: DevelopmentPlan,
  physical: PhysicalPlan,
  context: PlacementContext,
  living: LivingInputs,
  management: ManagementInputs,
  history: DistrictMonth[],
) {
  const q = SUSTAINABLE_GOALS,
    r = history.at(-1),
    b = management.budget;
  let valid = true;
  try {
    validatePhysical(physical, context);
    validateDevelopment(development, context, physical);
    validateHistory(
      history,
      districtInput(living, development.proposals, management),
    );
  } catch {
    valid = false;
  }
  const standard =
    JSON.stringify(living) === JSON.stringify(defaultLiving()) &&
    b.civicCapitalPerM2 === defaultBudget().civicCapitalPerM2 &&
    b.operatingPerService === defaultBudget().operatingPerService;
  const publicArea = physical.proposals.reduce(
      (n, p) => n + area(p.vertices),
      0,
    ),
    householdMonths = history.reduce((n, r) => n + r.occupiedHouseholds, 0);
  const checks = [
    valid &&
      standard &&
      management.mode === "scheduled" &&
      development.proposals.length <= 8 &&
      new Set(development.proposals.map((b) => b.purpose)).size === 3 &&
      !!r?.management &&
      r.management.projects.every((p) => p.phase === "operational"),
    !!r &&
      r.occupiedHouseholds >= q.minHouseholds &&
      r.occupiedHouseholds <= q.maxHouseholds &&
      r.householdUtilization >= q.householdUse &&
      householdMonths >= q.householdMonths,
    !!r &&
      r.filledJobs >= q.minJobs &&
      r.filledJobs <= q.maxJobs &&
      r.jobUtilization >= q.jobUse,
    !!r &&
      r.serviceUtilization >= q.serviceUse &&
      history
        .filter((r) => r.month >= 8)
        .every((r) => r.serviceCoverage >= q.serviceCover) &&
      history.every((r) => r.management?.operatingShortfallCents === 0),
    b.startingCapital + 24 * b.monthlyCapital <= q.maxCapital &&
      b.startingOperating + 24 * b.monthlyOperating <= q.maxOperating &&
      !!r?.management &&
      r.management.totalCapitalSpentCents <=
        (b.startingCapital + 24 * b.monthlyCapital) * MONEY,
    valid &&
      publicArea >= q.minPublicSpace &&
      publicArea <= q.maxPublicSpace &&
      physical.proposals.every((p) => placement(p, context).connected),
  ];
  return {
    complete: r?.month === 24,
    passed: r?.month === 24 && checks.every(Boolean),
    checks,
    publicArea,
    householdMonths,
  };
}
