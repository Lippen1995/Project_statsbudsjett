import {
  validateManagement,
  operationalCapacities,
  type ManagementInputs,
  type ManagementMonth,
} from "../management/model";
import {
  validateManagementMonth,
  validateManagementTransition,
} from "../management/validation";
import { exactKeys, object } from "../simulation/interventions";
import { validateBuilding, type BuildingProposal } from "../physical/buildings";
export const HORIZON = 24;
export const ASSUMPTIONS = {
  areaPerHousehold: {
    label: "Floor area per household",
    unit: "m² / household",
    min: 40,
    max: 160,
    step: 5,
    value: 80,
  },
  areaPerJob: {
    label: "Floor area per job",
    unit: "m² / position",
    min: 15,
    max: 80,
    step: 5,
    value: 30,
  },
  areaPerServicePlace: {
    label: "Civic area per service place",
    unit: "m² / resident-equivalent place",
    min: 10,
    max: 80,
    step: 5,
    value: 20,
  },
  householdSize: {
    label: "Assumed household size",
    unit: "resident equivalents / household",
    min: 1,
    max: 4,
    step: 0.1,
    value: 2.2,
  },
  workersPerHousehold: {
    label: "Resident workforce",
    unit: "worker equivalents / household",
    min: 0.5,
    max: 2,
    step: 0.1,
    value: 1.1,
  },
  householdArrivals: {
    label: "External household demand",
    unit: "households / month",
    min: 0,
    max: 8,
    step: 0.1,
    value: 2,
  },
  jobDemandArrivals: {
    label: "External business demand",
    unit: "requested positions / month",
    min: 0,
    max: 12,
    step: 0.1,
    value: 3,
  },
  externalJobOpportunities: {
    label: "Outside employment support",
    unit: "job equivalents outside this district",
    min: 0,
    max: 20,
    step: 1,
    value: 2,
  },
  externalWorkforce: {
    label: "Outside recruitment allowance",
    unit: "worker equivalents",
    min: 0,
    max: 20,
    step: 1,
    value: 2,
  },
  householdMoveInRate: {
    label: "Monthly household uptake limit",
    unit: "fraction of vacant capacity / month",
    min: 0.1,
    max: 1,
    step: 0.05,
    value: 0.45,
  },
  jobFillRate: {
    label: "Monthly job uptake limit",
    unit: "fraction of vacant capacity / month",
    min: 0.1,
    max: 1,
    step: 0.05,
    value: 0.4,
  },
  householdTurnover: {
    label: "Monthly household exits",
    unit: "fraction of occupied stock / month",
    min: 0,
    max: 0.2,
    step: 0.01,
    value: 0.02,
  },
  jobSeparation: {
    label: "Monthly job turnover",
    unit: "fraction of filled jobs / month",
    min: 0,
    max: 0.2,
    step: 0.01,
    value: 0.03,
  },
  minimumServiceAttraction: {
    label: "Uptake with no civic cover",
    unit: "fraction of otherwise supported uptake",
    min: 0,
    max: 0.5,
    step: 0.05,
    value: 0.25,
  },
} as const;
export type AssumptionKey = keyof typeof ASSUMPTIONS;
export type LivingInputs = { version: 1 } & Record<AssumptionKey, number>;
export const defaultLiving = (): LivingInputs =>
  ({
    version: 1,
    ...Object.fromEntries(
      Object.entries(ASSUMPTIONS).map(([key, s]) => [key, s.value]),
    ),
  }) as LivingInputs;
export function validateLiving(value: unknown): LivingInputs {
  const a = object(value);
  exactKeys(a, ["version", ...Object.keys(ASSUMPTIONS)]);
  if (a.version !== 1)
    throw new Error("Unsupported living-city input version.");
  for (const [key, rule] of Object.entries(ASSUMPTIONS)) {
    const v = a[key];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < rule.min ||
      v > rule.max
    )
      throw new Error(
        `${rule.label}: use ${rule.min}–${rule.max} ${rule.unit}.`,
      );
  }
  if ((a.workersPerHousehold as number) > (a.householdSize as number))
    throw new Error(
      "Resident workforce per household cannot exceed assumed household size.",
    );
  return {
    version: 1,
    ...Object.fromEntries(Object.keys(ASSUMPTIONS).map((key) => [key, a[key]])),
  } as LivingInputs;
}
export interface DistrictInput {
  version: 1 | 2;
  management?: ManagementInputs;
  living: LivingInputs;
  buildings: BuildingProposal[];
}
export function districtInput(
  living: unknown,
  buildings: unknown,
  management?: unknown,
): DistrictInput {
  const base = validateDistrictInput({ version: 1, living, buildings });
  if (management === undefined) return base;
  const m = validateManagement(management, base.buildings);
  // Explicit legacy contract in scenarios; preserve exact historical engine output shape.
  return m.mode === "legacy-immediate"
    ? base
    : { ...base, version: 2, management: m };
}
export function validateDistrictInput(value: unknown): DistrictInput {
  const d = object(value);
  exactKeys(d, [
    "version",
    "living",
    "buildings",
    ...(d.version === 2 ? ["management"] : []),
  ]);
  if (
    ![1, 2].includes(d.version as number) ||
    !Array.isArray(d.buildings) ||
    d.buildings.length > 8
  )
    throw new Error(
      "Use a version-1/2 district with at most eight proposed buildings.",
    );
  const buildings = d.buildings.map(validateBuilding),
    ids = new Set<string>();
  for (const b of buildings) {
    if (ids.has(b.id)) throw new Error("Duplicate district building.");
    ids.add(b.id);
  }
  const management =
    d.version === 2 ? validateManagement(d.management, buildings) : undefined;
  if (management?.mode === "legacy-immediate")
    throw new Error("Use the canonical legacy district input factory.");
  return {
    version: d.version as 1 | 2,
    living: validateLiving(d.living),
    buildings,
    ...(management ? { management } : {}),
  };
}
export type Role = "residential" | "commercial" | "civic";
export function capacities(input: DistrictInput) {
  const a = input.living;
  return input.buildings.map((b) => ({
    id: b.id,
    purpose: b.purpose,
    capacity: Math.floor(
      (b.width * b.depth * b.storeys) /
        (b.purpose === "residential"
          ? a.areaPerHousehold
          : b.purpose === "commercial"
            ? a.areaPerJob
            : a.areaPerServicePlace),
    ),
  }));
}
export const CONSTRAINTS = [
  "housing-capacity",
  "household-demand",
  "services",
  "workforce",
  "employment-capacity",
  "employment-support",
  "uptake",
] as const;
export type Constraint = (typeof CONSTRAINTS)[number];
export interface Activity {
  id: string;
  purpose: Role;
  capacity: number;
  used: number;
  utilization: number;
}
export interface DistrictMonth {
  management?: ManagementMonth;
  month: number;
  householdCapacity: number;
  occupiedHouseholds: number;
  residents: number;
  employmentCapacity: number;
  filledJobs: number;
  serviceCapacity: number;
  serviceDemand: number;
  usedService: number;
  unmetService: number;
  waitingHouseholds: number;
  waitingJobs: number;
  departedHouseholds: number;
  admittedHouseholds: number;
  exitedHouseholds: number;
  hiredJobs: number;
  vacatedJobs: number;
  recruitmentLabour: number;
  employmentSupport: number;
  serviceAdmissionCover: number;
  householdUtilization: number;
  jobUtilization: number;
  serviceUtilization: number;
  serviceCoverage: number;
  balance: number;
  constraint: Constraint;
  buildings: Activity[];
}
export const share = (used: number, capacity: number) =>
  capacity > 0 ? Math.max(0, Math.min(1, used / capacity)) : 0;
const numericKeys = [
  "month",
  "householdCapacity",
  "occupiedHouseholds",
  "residents",
  "employmentCapacity",
  "filledJobs",
  "serviceCapacity",
  "serviceDemand",
  "usedService",
  "unmetService",
  "waitingHouseholds",
  "waitingJobs",
  "departedHouseholds",
  "admittedHouseholds",
  "exitedHouseholds",
  "hiredJobs",
  "vacatedJobs",
  "recruitmentLabour",
  "employmentSupport",
  "serviceAdmissionCover",
  "householdUtilization",
  "jobUtilization",
  "serviceUtilization",
  "serviceCoverage",
  "balance",
];
const close = (a: number, b: number) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-6)
    throw new Error(
      "District output violates conservation or unit consistency.",
    );
};
export function validateMonth(
  value: unknown,
  input: DistrictInput,
): DistrictMonth {
  const v = object(value);
  exactKeys(v, [
    ...numericKeys,
    "constraint",
    "buildings",
    ...(input.version === 2 ? ["management"] : []),
  ]);
  for (const key of numericKeys)
    if (
      typeof v[key] !== "number" ||
      !Number.isFinite(v[key]) ||
      (v[key] as number) < 0 ||
      (v[key] as number) > 100000
    )
      throw new Error("Non-finite or unbounded district output.");
  const r = v as unknown as DistrictMonth,
    a = input.living,
    potential = capacities(input),
    management =
      input.version === 2
        ? validateManagementMonth(
            v.management,
            input.management!,
            input.buildings,
            potential,
            r.month,
          )
        : undefined,
    c = management ? operationalCapacities(potential, management) : potential,
    sum = (role: Role) =>
      c.filter((b) => b.purpose === role).reduce((n, b) => n + b.capacity, 0);
  if (
    !Number.isInteger(r.month) ||
    r.month < 0 ||
    r.month > HORIZON ||
    !CONSTRAINTS.includes(r.constraint) ||
    !Array.isArray(r.buildings) ||
    r.buildings.length !== c.length
  )
    throw new Error("Invalid district month or activity output.");
  close(r.householdCapacity, sum("residential"));
  close(r.employmentCapacity, sum("commercial"));
  close(r.serviceCapacity, sum("civic"));
  if (
    r.occupiedHouseholds > r.householdCapacity + 1e-6 ||
    r.filledJobs > r.employmentCapacity + 1e-6 ||
    r.filledJobs > r.recruitmentLabour + 1e-6 ||
    r.usedService > r.serviceCapacity + 1e-6 ||
    r.usedService > r.serviceDemand + 1e-6
  )
    throw new Error("District stocks exceed their capacity.");
  close(
    r.occupiedHouseholds + r.waitingHouseholds + r.departedHouseholds,
    r.month * a.householdArrivals,
  );
  close(r.filledJobs + r.waitingJobs, r.month * a.jobDemandArrivals);
  close(r.residents, r.occupiedHouseholds * a.householdSize);
  close(r.serviceDemand, r.residents);
  close(r.usedService + r.unmetService, r.serviceDemand);
  for (const key of [
    "employmentSupport",
    "serviceAdmissionCover",
    "householdUtilization",
    "jobUtilization",
    "serviceUtilization",
    "serviceCoverage",
    "balance",
  ] as const)
    if (r[key] > 1 + 1e-8) throw new Error("District share exceeds one.");
  close(
    r.householdUtilization,
    share(r.occupiedHouseholds, r.householdCapacity),
  );
  close(r.jobUtilization, share(r.filledJobs, r.employmentCapacity));
  close(r.serviceUtilization, share(r.usedService, r.serviceCapacity));
  close(
    r.serviceCoverage,
    r.serviceDemand > 0 ? share(r.usedService, r.serviceDemand) : 1,
  );
  close(
    r.balance,
    Math.min(r.householdUtilization, r.jobUtilization, r.serviceCoverage),
  );
  const buildings = r.buildings.map((value, i) => {
    const b = object(value);
    exactKeys(b, ["id", "purpose", "capacity", "used", "utilization"]);
    const expected = c[i];
    if (
      b.id !== expected.id ||
      b.purpose !== expected.purpose ||
      b.capacity !== expected.capacity ||
      typeof b.used !== "number" ||
      !Number.isFinite(b.used) ||
      b.used < 0 ||
      b.used > expected.capacity + 1e-6 ||
      typeof b.utilization !== "number"
    )
      throw new Error("Invalid per-building activity.");
    close(b.utilization, share(b.used, expected.capacity));
    return { ...b } as unknown as Activity;
  });
  for (const [role, total] of [
    ["residential", r.occupiedHouseholds],
    ["commercial", r.filledJobs],
    ["civic", r.usedService],
  ] as const)
    close(
      buildings
        .filter((b) => b.purpose === role)
        .reduce((n, b) => n + b.used, 0),
      total,
    );
  return { ...r, buildings, ...(management ? { management } : {}) };
}
export function validateHistory(
  values: unknown,
  input: DistrictInput,
): DistrictMonth[] {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > HORIZON + 1
  )
    throw new Error("Invalid district history length.");
  const result = values.map((v, i) => {
    const r = validateMonth(v, input);
    if (r.month !== i)
      throw new Error(
        "District months must be consecutive from the initial conditions.",
      );
    return r;
  });
  for (let i = 1; i < result.length; i++) {
    const r = result[i],
      p = result[i - 1];
    if (input.version === 2)
      validateManagementTransition(p.management!, r.management!);
    close(
      r.occupiedHouseholds,
      p.occupiedHouseholds - r.exitedHouseholds + r.admittedHouseholds,
    );
    close(r.departedHouseholds, p.departedHouseholds + r.exitedHouseholds);
    close(r.filledJobs, p.filledJobs - r.vacatedJobs + r.hiredJobs);
    close(
      r.waitingHouseholds,
      p.waitingHouseholds +
        input.living.householdArrivals -
        r.admittedHouseholds,
    );
    close(
      r.waitingJobs,
      p.waitingJobs +
        input.living.jobDemandArrivals +
        r.vacatedJobs -
        r.hiredJobs,
    );
  }
  return result;
}
