import { TOTAL_TICKS, type Result } from "./engine";
// Game objectives, verified achievable by a five-edit plan in regression tests.
// These thresholds are not municipal standards or transport forecasts.
export const OBJECTIVES = {
  throughReduction: 0.25,
  maxDistanceRatio: 2,
  maxVc: 2.5,
  maxUnrouted: 0,
} as const;
export function evaluateChallenge(baseline: Result, plan: Result) {
  const complete =
    baseline.tick === TOTAL_TICKS &&
    plan.tick === TOTAL_TICKS &&
    baseline.requested === plan.requested;
  const throughReduction =
    baseline.corridorThroughTrips > 0
      ? 1 - plan.corridorThroughTrips / baseline.corridorThroughTrips
      : 0;
  const baseDistance =
    baseline.throughMetres / Math.max(1, baseline.throughServed);
  const distanceRatio = plan.throughServed
    ? plan.throughMetres / plan.throughServed / Math.max(0.001, baseDistance)
    : Infinity;
  const vc = Math.max(0, ...plan.edgeVc);
  const checks = [
    throughReduction >= OBJECTIVES.throughReduction,
    plan.unrouted === 0,
    distanceRatio <= OBJECTIVES.maxDistanceRatio,
    vc <= OBJECTIVES.maxVc,
  ];
  // Accessibility dominates: every plan losing a trip scores below every plan
  // routing all demand, regardless of favourable routed-only raw metrics.
  const score = !complete
    ? null
    : plan.unrouted > 0
      ? -1000 - plan.unrouted
      : Math.max(
          -999,
          Math.round(
            100 * throughReduction -
              20 * Math.max(0, distanceRatio - 1) -
              10 * Math.max(0, vc - 2),
          ),
        );
  return {
    complete,
    throughReduction,
    distanceRatio,
    vc,
    checks,
    passed: complete && checks.every(Boolean),
    score,
  };
}
