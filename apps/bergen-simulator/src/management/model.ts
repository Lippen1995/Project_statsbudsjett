import { object, exactKeys } from "../simulation/interventions";
import type { BuildingProposal } from "../physical/buildings";
export const MONEY = 100; // 100 integer subunits = 1 fictional Planning Monetary Unit (PMU).
export const BUDGET_RULES = {
  startingCapital: {
    label: "Starting capital allocation",
    unit: "PMU",
    min: 0,
    max: 100000,
    value: 1000,
  },
  monthlyCapital: {
    label: "Monthly capital funding",
    unit: "PMU / month",
    min: 0,
    max: 10000,
    value: 0,
  },
  startingOperating: {
    label: "Starting operating allocation",
    unit: "PMU",
    min: 0,
    max: 100000,
    value: 0,
  },
  monthlyOperating: {
    label: "Monthly operating funding",
    unit: "PMU / month",
    min: 0,
    max: 10000,
    value: 40,
  },
  civicCapitalPerM2: {
    label: "Civic construction coefficient",
    unit: "PMU / m² gross floor area",
    min: 1,
    max: 20,
    value: 2,
  },
  operatingPerService: {
    label: "Service operating coefficient",
    unit: "PMU / capacity unit / month",
    min: 1,
    max: 10,
    value: 2,
  },
} as const;
export type BudgetKey = keyof typeof BUDGET_RULES;
export type BudgetInputs = { version: 1 } & Record<BudgetKey, number>;
export interface ProjectSchedule {
  id: string;
  startMonth: number;
  durationMonths: number;
  priority: number;
  cancelMonth: number | null;
}
export interface ManagementInputs {
  version: 1;
  mode: "scheduled" | "legacy-immediate";
  budget: BudgetInputs;
  projects: ProjectSchedule[];
}
export const defaultBudget = (): BudgetInputs =>
  ({
    version: 1,
    ...Object.fromEntries(
      Object.entries(BUDGET_RULES).map(([k, r]) => [k, r.value]),
    ),
  }) as BudgetInputs;
export function defaultManagement(
  buildings: BuildingProposal[] = [],
  legacy = false,
): ManagementInputs {
  return {
    version: 1,
    mode: legacy ? "legacy-immediate" : "scheduled",
    budget: legacy
      ? ({
          version: 1,
          ...Object.fromEntries(Object.keys(BUDGET_RULES).map((k) => [k, 0])),
        } as BudgetInputs)
      : defaultBudget(),
    projects: buildings.map((b) => ({
      id: b.id,
      startMonth: legacy ? 0 : 1,
      durationMonths: legacy
        ? 0
        : b.purpose === "civic"
          ? 4
          : b.purpose === "residential"
            ? 3
            : 2,
      priority: 4,
      cancelMonth: null,
    })),
  };
}
export function validateBudget(value: unknown, legacy = false): BudgetInputs {
  const b = object(value);
  exactKeys(b, ["version", ...Object.keys(BUDGET_RULES)]);
  if (b.version !== 1) throw new Error("Unsupported public budget version.");
  for (const [k, r] of Object.entries(BUDGET_RULES)) {
    const v = b[k];
    if (
      typeof v !== "number" ||
      !Number.isSafeInteger(v) ||
      (legacy ? v !== 0 : v < r.min || v > r.max)
    )
      throw new Error(
        legacy
          ? "Legacy immediate mode has no public budget: all coefficients and allocations must be zero."
          : `${r.label}: use whole values ${r.min}–${r.max} ${r.unit}.`,
      );
  }
  return {
    version: 1,
    ...Object.fromEntries(Object.keys(BUDGET_RULES).map((k) => [k, b[k]])),
  } as BudgetInputs;
}
export function validateManagement(
  value: unknown,
  buildings: BuildingProposal[],
): ManagementInputs {
  const m = object(value);
  exactKeys(m, ["version", "mode", "budget", "projects"]);
  if (
    m.version !== 1 ||
    !["scheduled", "legacy-immediate"].includes(m.mode as string) ||
    !Array.isArray(m.projects) ||
    m.projects.length !== buildings.length ||
    buildings.length > 8
  )
    throw new Error(
      "Management requires version 1, at most eight projects and exactly one schedule for each building.",
    );
  const legacy = m.mode === "legacy-immediate",
    ids = new Set<string>();
  const projects = m.projects.map((v) => {
    const p = object(v);
    exactKeys(p, [
      "id",
      "startMonth",
      "durationMonths",
      "priority",
      "cancelMonth",
    ]);
    if (
      typeof p.id !== "string" ||
      !buildings.some((b) => b.id === p.id) ||
      ids.has(p.id)
    )
      throw new Error("Unknown or duplicate construction project.");
    ids.add(p.id);
    for (const k of ["startMonth", "durationMonths", "priority"])
      if (!Number.isSafeInteger(p[k]))
        throw new Error(
          "Construction dates, duration and priority must be integers.",
        );
    const s = p as unknown as ProjectSchedule;
    if (s.priority < 1 || s.priority > 8)
      throw new Error(
        "Civic investment priority must be 1–8; lower numbers are funded first.",
      );
    if (legacy) {
      if (
        s.startMonth !== 0 ||
        s.durationMonths !== 0 ||
        s.cancelMonth !== null
      )
        throw new Error(
          "Legacy immediate projects must commission at month zero, without cancellation.",
        );
    } else {
      if (
        s.startMonth < 1 ||
        s.startMonth > 24 ||
        s.durationMonths < 1 ||
        s.durationMonths > 12
      )
        throw new Error(
          "Schedule a start in months 1–24 and a duration of 1–12 months.",
        );
      if (
        s.cancelMonth !== null &&
        (!Number.isInteger(s.cancelMonth) ||
          s.cancelMonth < 1 ||
          s.cancelMonth > 24 ||
          s.cancelMonth >= s.startMonth + s.durationMonths)
      )
        throw new Error(
          "Cancellation must be in months 1–24 and before the earliest commissioning month.",
        );
    }
    return {
      id: s.id,
      startMonth: s.startMonth,
      durationMonths: s.durationMonths,
      priority: s.priority,
      cancelMonth: s.cancelMonth,
    };
  });
  // Canonical building order; funding priority is explicit, with ID as a stable tie-break.
  return {
    version: 1,
    mode: m.mode as ManagementInputs["mode"],
    budget: validateBudget(m.budget, legacy),
    projects: buildings.map((b) => projects.find((p) => p.id === b.id)!),
  };
}
export function syncManagement(
  m: ManagementInputs,
  buildings: BuildingProposal[],
): ManagementInputs {
  const defaults = defaultManagement(buildings, m.mode === "legacy-immediate");
  return validateManagement(
    {
      ...m,
      projects: defaults.projects.map(
        (p) => m.projects.find((old) => old.id === p.id) ?? p,
      ),
    },
    buildings,
  );
}
export const civicCost = (b: BuildingProposal, budget: BudgetInputs) =>
  b.purpose === "civic"
    ? Math.round(
        b.width * b.depth * b.storeys * budget.civicCapitalPerM2 * MONEY,
      )
    : 0;
export type ProjectPhase =
  "planned" | "under-construction" | "operational" | "cancelled";
export interface ProjectState {
  id: string;
  phase: ProjectPhase;
  actualStart: number | null;
  commissionMonth: number | null;
  workMonths: number;
  costCents: number;
  paidCents: number;
  reservedCents: number;
  deferred: boolean;
}
export interface ManagementMonth {
  month: number;
  projects: ProjectState[];
  capitalBalanceCents: number;
  capitalReservedCents: number;
  capitalFreeCents: number;
  capitalIncomeCents: number;
  capitalCommittedCents: number;
  capitalSpentCents: number;
  capitalReleasedCents: number;
  totalCapitalCommittedCents: number;
  totalCapitalSpentCents: number;
  totalCapitalReleasedCents: number;
  unfundedRequestsCents: number;
  capitalFundingGapCents: number;
  operatingBalanceCents: number;
  operatingIncomeCents: number;
  operatingAvailableCents: number;
  operatingRequiredCents: number;
  operatingSpentCents: number;
  operatingShortfallCents: number;
  totalOperatingSpentCents: number;
  potentialServiceCapacity: number;
  fundedServiceCapacity: number;
}
export interface CapacityRecord {
  id: string;
  purpose: BuildingProposal["purpose"];
  capacity: number;
}
export function operationalCapacities(
  caps: CapacityRecord[],
  month: ManagementMonth,
): CapacityRecord[] {
  return caps.map((b) => ({
    ...b,
    capacity:
      month.projects.find((p) => p.id === b.id)?.phase !== "operational"
        ? 0
        : b.purpose === "civic"
          ? b.capacity *
            (month.potentialServiceCapacity > 0
              ? month.fundedServiceCapacity / month.potentialServiceCapacity
              : 0)
          : b.capacity,
  }));
}
