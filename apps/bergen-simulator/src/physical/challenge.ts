import type { Result } from "../simulation/engine";
import type { PlacementContext, PhysicalPlan } from "./model";
import { placement } from "./model";
import type { Plan } from "../simulation/interventions";
export const WATERFRONT_OBJECTIVES = {
  minArea: 100,
  maxArea: 800,
  maxDistanceRatio: 3,
  maxVc: 3,
};
export function waterfrontChallenge(
  physical: PhysicalPlan,
  plan: Plan,
  context: PlacementContext,
  baseline: Result | null,
  result: Result | null,
) {
  const checks = physical.proposals.map((p) =>
    placement(p, context, physical.proposals),
  );
  const area = checks.reduce((sum, c) => sum + c.areaM2, 0);
  const resolved = checks.every((c) =>
    c.conflicts.every((e) =>
      plan.interventions.some(
        (i) => i.segmentId === e.segmentId && i.access !== "all",
      ),
    ),
  );
  const complete =
    !!baseline &&
    !!result &&
    result.tick === 60 &&
    baseline.tick === 60 &&
    result.requested === baseline.requested;
  const ratio =
    baseline && result && baseline.throughServed && result.throughServed
      ? result.throughMetres /
        result.throughServed /
        (baseline.throughMetres / baseline.throughServed)
      : Infinity;
  const goals = [
    checks.length > 0 &&
      checks.every((c) => c.valid) &&
      area >= WATERFRONT_OBJECTIVES.minArea &&
      area <= WATERFRONT_OBJECTIVES.maxArea,
    checks.length > 0 && checks.every((c) => c.connected) && resolved,
    complete && result!.unrouted === 0,
    complete &&
      ratio <= WATERFRONT_OBJECTIVES.maxDistanceRatio &&
      Math.max(...result!.edgeVc) <= WATERFRONT_OBJECTIVES.maxVc,
  ];
  return {
    area,
    checks: goals,
    complete,
    passed: complete && goals.every(Boolean),
  };
}
