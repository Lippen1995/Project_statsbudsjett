import { object, exactKeys } from "../simulation/interventions";
import type { BuildingProposal } from "../physical/buildings";
import {
  MONEY,
  civicCost,
  type CapacityRecord,
  type ManagementInputs,
  type ManagementMonth,
  type ProjectState,
} from "./model";
import { capitalIdentity, operatingIdentity } from "./finance";
const cashKeys = [
  "capitalBalanceCents",
  "capitalReservedCents",
  "capitalFreeCents",
  "capitalIncomeCents",
  "capitalCommittedCents",
  "capitalSpentCents",
  "capitalReleasedCents",
  "totalCapitalCommittedCents",
  "totalCapitalSpentCents",
  "totalCapitalReleasedCents",
  "unfundedRequestsCents",
  "capitalFundingGapCents",
  "operatingBalanceCents",
  "operatingIncomeCents",
  "operatingAvailableCents",
  "operatingRequiredCents",
  "operatingSpentCents",
  "operatingShortfallCents",
  "totalOperatingSpentCents",
] as const;
export function equal(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6)
    throw new Error("Management accounting or construction identity failed.");
}
const money = (n: unknown) => {
  if (
    typeof n !== "number" ||
    !Number.isSafeInteger(n) ||
    n < 0 ||
    n > 1_000_000_000
  )
    throw new Error("Invalid or unbounded financial subunits.");
};
export function validateManagementMonth(
  value: unknown,
  input: ManagementInputs,
  buildings: BuildingProposal[],
  caps: CapacityRecord[],
  month: number,
): ManagementMonth {
  const v = object(value);
  exactKeys(v, [
    "month",
    "projects",
    ...cashKeys,
    "potentialServiceCapacity",
    "fundedServiceCapacity",
  ]);
  if (
    input.mode !== "scheduled" ||
    v.month !== month ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 24 ||
    !Array.isArray(v.projects) ||
    v.projects.length !== buildings.length
  )
    throw new Error("Invalid management month or project count.");
  for (const k of cashKeys) money(v[k]);
  const r = v as unknown as ManagementMonth,
    b = input.budget;
  const projects = r.projects.map((val, i) => {
    const p = object(val);
    exactKeys(p, [
      "id",
      "phase",
      "actualStart",
      "commissionMonth",
      "workMonths",
      "costCents",
      "paidCents",
      "reservedCents",
      "deferred",
    ]);
    const s = input.projects.find((s) => s.id === buildings[i].id)!,
      q = p as unknown as ProjectState;
    if (
      q.id !== buildings[i].id ||
      !["planned", "under-construction", "operational", "cancelled"].includes(
        q.phase,
      ) ||
      typeof q.deferred !== "boolean" ||
      !Number.isInteger(q.workMonths) ||
      q.workMonths < 0 ||
      q.workMonths > s.durationMonths
    )
      throw new Error("Invalid construction state.");
    for (const k of ["costCents", "paidCents", "reservedCents"] as const)
      money(q[k]);
    equal(q.costCents, civicCost(buildings[i], b));
    if (
      q.actualStart !== null &&
      (!Number.isInteger(q.actualStart) ||
        q.actualStart < s.startMonth ||
        q.actualStart > month)
    )
      throw new Error("Invalid actual construction date.");
    if (
      q.commissionMonth !==
      (q.actualStart === null ? null : q.actualStart + s.durationMonths)
    )
      throw new Error(
        "Commissioning date does not match actual start and duration.",
      );
    if (q.phase === "planned") {
      if (
        q.actualStart !== null ||
        q.workMonths !== 0 ||
        q.paidCents !== 0 ||
        q.reservedCents !== 0 ||
        q.deferred !== month >= s.startMonth
      )
        throw new Error(
          "Unstarted project cannot contribute work or spending.",
        );
    } else if (q.phase === "cancelled") {
      if (
        s.cancelMonth === null ||
        month < s.cancelMonth ||
        q.reservedCents !== 0 ||
        q.deferred ||
        q.paidCents > q.costCents
      )
        throw new Error("Invalid cancellation or refund.");
      equal(
        q.workMonths,
        q.actualStart === null ? 0 : s.cancelMonth - q.actualStart,
      );
    } else {
      if (
        q.actualStart === null ||
        q.deferred ||
        (s.cancelMonth !== null && s.cancelMonth <= month)
      )
        throw new Error(
          "Construction requires an actual start, without prior cancellation.",
        );
      equal(
        q.workMonths,
        Math.min(s.durationMonths, month - q.actualStart + 1),
      );
      equal(q.paidCents + q.reservedCents, q.costCents);
      if ((q.phase === "operational") !== month >= q.commissionMonth!)
        throw new Error("Capacity became operational on the wrong month.");
      if (q.phase === "operational") equal(q.reservedCents, 0);
    }
    if (q.phase !== "planned") {
      const installments =
        Math.floor(q.costCents / s.durationMonths) * q.workMonths +
        (q.workMonths === s.durationMonths
          ? q.costCents % s.durationMonths
          : 0);
      equal(q.paidCents, installments);
    }
    return { ...q };
  });
  if (
    !capitalIdentity(
      b,
      month,
      r.capitalBalanceCents,
      r.totalCapitalSpentCents,
    ) ||
    !operatingIdentity(
      b,
      month,
      r.operatingBalanceCents,
      r.totalOperatingSpentCents,
    )
  )
    throw new Error("Public funding must equal balances plus expenditure.");
  if (projects.some((p) => p.deferred && p.costCents <= r.capitalFreeCents))
    throw new Error("A funded project cannot be marked deferred.");
  equal(
    r.capitalReservedCents,
    projects.reduce((n, p) => n + p.reservedCents, 0),
  );
  equal(r.capitalFreeCents, r.capitalBalanceCents - r.capitalReservedCents);
  equal(
    r.totalCapitalSpentCents,
    projects.reduce((n, p) => n + p.paidCents, 0),
  );
  equal(
    r.totalCapitalCommittedCents,
    r.totalCapitalSpentCents +
      r.totalCapitalReleasedCents +
      r.capitalReservedCents,
  );
  equal(
    r.unfundedRequestsCents,
    projects.filter((p) => p.deferred).reduce((n, p) => n + p.costCents, 0),
  );
  equal(
    r.capitalFundingGapCents,
    Math.max(0, r.unfundedRequestsCents - r.capitalFreeCents),
  );
  equal(r.capitalIncomeCents, month ? b.monthlyCapital * MONEY : 0);
  equal(r.operatingIncomeCents, month ? b.monthlyOperating * MONEY : 0);
  equal(
    r.operatingAvailableCents,
    r.operatingBalanceCents + r.operatingSpentCents,
  );
  const potential = caps
    .filter(
      (c) =>
        c.purpose === "civic" &&
        projects.find((p) => p.id === c.id)?.phase === "operational",
    )
    .reduce((n, c) => n + c.capacity, 0);
  equal(r.potentialServiceCapacity, potential);
  equal(r.operatingRequiredCents, potential * b.operatingPerService * MONEY);
  equal(
    r.operatingSpentCents,
    Math.min(r.operatingRequiredCents, r.operatingAvailableCents),
  );
  equal(
    r.operatingShortfallCents,
    r.operatingRequiredCents - r.operatingSpentCents,
  );
  equal(
    r.fundedServiceCapacity,
    r.operatingSpentCents / (b.operatingPerService * MONEY),
  );
  if (month === 0) {
    for (const k of [
      "capitalCommittedCents",
      "capitalSpentCents",
      "capitalReleasedCents",
      "totalCapitalCommittedCents",
      "totalCapitalSpentCents",
      "totalCapitalReleasedCents",
      "totalOperatingSpentCents",
    ] as const)
      equal(r[k], 0);
    if (projects.some((p) => p.phase !== "planned"))
      throw new Error("Scheduled projects start planned at month zero.");
  }
  return { ...r, projects };
}
export function validateManagementTransition(
  p: ManagementMonth,
  r: ManagementMonth,
) {
  equal(
    r.capitalBalanceCents,
    p.capitalBalanceCents + r.capitalIncomeCents - r.capitalSpentCents,
  );
  equal(
    r.totalCapitalCommittedCents,
    p.totalCapitalCommittedCents + r.capitalCommittedCents,
  );
  equal(
    r.totalCapitalSpentCents,
    p.totalCapitalSpentCents + r.capitalSpentCents,
  );
  equal(
    r.totalCapitalReleasedCents,
    p.totalCapitalReleasedCents + r.capitalReleasedCents,
  );
  equal(
    r.capitalReservedCents,
    p.capitalReservedCents +
      r.capitalCommittedCents -
      r.capitalSpentCents -
      r.capitalReleasedCents,
  );
  equal(
    r.operatingAvailableCents,
    p.operatingBalanceCents + r.operatingIncomeCents,
  );
  equal(
    r.totalOperatingSpentCents,
    p.totalOperatingSpentCents + r.operatingSpentCents,
  );
  for (let i = 0; i < p.projects.length; i++) {
    const a = p.projects[i],
      b = r.projects[i];
    if (
      a.id !== b.id ||
      b.paidCents < a.paidCents ||
      b.workMonths < a.workMonths ||
      (a.actualStart !== null && a.actualStart !== b.actualStart) ||
      (["cancelled", "operational"].includes(a.phase) && a.phase !== b.phase)
    )
      throw new Error(
        "Invalid construction transition or refunded expenditure.",
      );
  }
}
