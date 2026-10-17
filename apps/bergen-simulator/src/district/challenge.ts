import {
  validateDevelopment,
  type DevelopmentPlan,
} from "../physical/buildings";
import {
  placement,
  validatePhysical,
  type PhysicalPlan,
  type PlacementContext,
} from "../physical/model";
import { area } from "../physical/polygon";
import {
  districtInput,
  validateMonth,
  HORIZON,
  type LivingInputs,
  type DistrictMonth,
} from "./model";
export const BALANCED_GOALS = Object.freeze({
  month: 24,
  households: 5,
  jobs: 7,
  housingUse: 0.6,
  jobUse: 0.35,
  serviceCover: 0.95,
  serviceUse: 0.2,
  minSpace: 120,
  maxSpace: 350,
});
export function balancedQuarter(
  development: DevelopmentPlan,
  physical: PhysicalPlan,
  context: PlacementContext,
  living: LivingInputs,
  result: DistrictMonth | undefined,
) {
  let valid = true;
  try {
    validatePhysical(physical, context);
    validateDevelopment(development, context, physical);
    if (result)
      validateMonth(result, districtInput(living, development.proposals));
  } catch {
    valid = false;
  }
  const publicArea = physical.proposals.reduce(
      (n, p) => n + area(p.vertices),
      0,
    ),
    complete = result?.month === HORIZON,
    q = BALANCED_GOALS;
  const checks = [
    valid &&
      development.proposals.length <= 8 &&
      new Set(development.proposals.map((b) => b.purpose)).size === 3,
    !!result &&
      result.occupiedHouseholds >= q.households &&
      result.householdUtilization >= q.housingUse,
    !!result &&
      result.filledJobs >= q.jobs &&
      result.jobUtilization >= q.jobUse,
    !!result &&
      result.serviceCoverage >= q.serviceCover &&
      result.serviceUtilization >= q.serviceUse,
    valid &&
      publicArea >= q.minSpace &&
      publicArea <= q.maxSpace &&
      physical.proposals.every((p) => placement(p, context).connected),
  ];
  return {
    complete,
    checks,
    publicArea,
    passed: complete && checks.every(Boolean),
  };
}
