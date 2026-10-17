import { validateBuilding, type BuildingProposal } from "../physical/buildings";
import {
  MONEY,
  civicCost,
  validateManagement,
  type CapacityRecord,
  type ManagementInputs,
  type ManagementMonth,
} from "./model";
import { fundOperations, installment } from "./finance";
/** At most eight parameter-only projects, one monthly state, no geometry or clock. */
export class ConstructionSimulation {
  readonly input: ManagementInputs;
  private current!: ManagementMonth;
  private readonly buildings: BuildingProposal[];
  private readonly capacities: CapacityRecord[];
  constructor(
    input: unknown,
    buildings: BuildingProposal[],
    capacities: CapacityRecord[],
  ) {
    this.buildings = buildings.map(validateBuilding);
    this.input = validateManagement(input, this.buildings);
    if (capacities.length !== buildings.length)
      throw new Error("Invalid potential capacity records.");
    this.capacities = capacities.map((c, i) => {
      if (
        c.id !== this.buildings[i].id ||
        c.purpose !== this.buildings[i].purpose ||
        !Number.isSafeInteger(c.capacity) ||
        c.capacity < 0 ||
        c.capacity > 100000
      )
        throw new Error("Invalid potential capacity record.");
      return { id: c.id, purpose: c.purpose, capacity: c.capacity };
    });
    this.buildings.forEach((b) => {
      Object.freeze(b.center);
      Object.freeze(b);
    });
    Object.freeze(this.buildings);
    this.capacities.forEach(Object.freeze);
    Object.freeze(this.capacities);
    this.input.projects.forEach(Object.freeze);
    Object.freeze(this.input.projects);
    Object.freeze(this.input.budget);
    Object.freeze(this.input);
    if (this.input.mode !== "scheduled")
      throw new Error(
        "Legacy immediate commissioning uses the unchanged 5A engine.",
      );
    this.reset();
  }
  reset() {
    const b = this.input.budget;
    this.current = {
      month: 0,
      projects: this.buildings.map((bld) => ({
        id: bld.id,
        phase: "planned",
        actualStart: null,
        commissionMonth: null,
        workMonths: 0,
        costCents: civicCost(bld, b),
        paidCents: 0,
        reservedCents: 0,
        deferred: false,
      })),
      capitalBalanceCents: b.startingCapital * MONEY,
      capitalReservedCents: 0,
      capitalFreeCents: b.startingCapital * MONEY,
      capitalIncomeCents: 0,
      capitalCommittedCents: 0,
      capitalSpentCents: 0,
      capitalReleasedCents: 0,
      totalCapitalCommittedCents: 0,
      totalCapitalSpentCents: 0,
      totalCapitalReleasedCents: 0,
      unfundedRequestsCents: 0,
      capitalFundingGapCents: 0,
      operatingBalanceCents: b.startingOperating * MONEY,
      operatingIncomeCents: 0,
      operatingAvailableCents: b.startingOperating * MONEY,
      operatingRequiredCents: 0,
      operatingSpentCents: 0,
      operatingShortfallCents: 0,
      totalOperatingSpentCents: 0,
      potentialServiceCapacity: 0,
      fundedServiceCapacity: 0,
    };
    return this.freeze();
  }
  private freeze() {
    this.current.projects.forEach(Object.freeze);
    Object.freeze(this.current.projects);
    return Object.freeze(this.current);
  }
  snapshot() {
    return this.current;
  }
  step() {
    const old = this.current,
      m = old.month + 1,
      b = this.input.budget;
    if (m > 24) throw new Error("Construction is bounded to 24 months.");
    const projects = old.projects.map((p) => ({ ...p, deferred: false }));
    let balance = old.capitalBalanceCents + b.monthlyCapital * MONEY,
      reserved = old.capitalReservedCents,
      committed = 0,
      spent = 0,
      released = 0;
    // 1. Cancellation is before work/commissioning; spent money is never refunded.
    for (const p of projects) {
      const s = this.input.projects.find((s) => s.id === p.id)!;
      if (
        p.phase !== "operational" &&
        s.cancelMonth !== null &&
        s.cancelMonth <= m
      ) {
        released += p.reservedCents;
        reserved -= p.reservedCents;
        p.reservedCents = 0;
        p.phase = "cancelled";
      } else if (p.phase === "under-construction" && m === p.commissionMonth) {
        p.phase = "operational";
      }
    }
    // 2. Full-cost reservation in priority then stable-ID order. Private work is uncharged.
    for (const s of [...this.input.projects].sort(
      (a, b) =>
        a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )) {
      const p = projects.find((p) => p.id === s.id)!;
      if (p.phase !== "planned" || m < s.startMonth) continue;
      if (p.costCents > balance - reserved) {
        p.deferred = true;
        continue;
      }
      p.phase = "under-construction";
      p.actualStart = m;
      p.commissionMonth = m + s.durationMonths;
      p.reservedCents = p.costCents;
      reserved += p.costCents;
      committed += p.costCents;
    }
    // 3. Spend reserved installments, including the actual start month.
    for (const p of projects) {
      if (p.phase !== "under-construction") continue;
      const s = this.input.projects.find((s) => s.id === p.id)!;
      p.workMonths++;
      const cost = installment(p.costCents, s.durationMonths, p.workMonths);
      p.paidCents += cost;
      p.reservedCents -= cost;
      balance -= cost;
      reserved -= cost;
      spent += cost;
    }
    // 4. Fund all commissioned potential service capacity proportionally, not just utilization.
    const potential = this.capacities
      .filter(
        (c) =>
          c.purpose === "civic" &&
          projects.find((p) => p.id === c.id)?.phase === "operational",
      )
      .reduce((n, c) => n + c.capacity, 0);
    const op = fundOperations(
      old.operatingBalanceCents,
      b.monthlyOperating,
      potential,
      b.operatingPerService,
    );
    const unfunded = projects
      .filter((p) => p.deferred)
      .reduce((n, p) => n + p.costCents, 0);
    this.current = {
      month: m,
      projects,
      capitalBalanceCents: balance,
      capitalReservedCents: reserved,
      capitalFreeCents: balance - reserved,
      capitalIncomeCents: b.monthlyCapital * MONEY,
      capitalCommittedCents: committed,
      capitalSpentCents: spent,
      capitalReleasedCents: released,
      totalCapitalCommittedCents: old.totalCapitalCommittedCents + committed,
      totalCapitalSpentCents: old.totalCapitalSpentCents + spent,
      totalCapitalReleasedCents: old.totalCapitalReleasedCents + released,
      unfundedRequestsCents: unfunded,
      capitalFundingGapCents: Math.max(0, unfunded - (balance - reserved)),
      operatingBalanceCents: op.balanceCents,
      operatingIncomeCents: op.incomeCents,
      operatingAvailableCents: op.availableCents,
      operatingRequiredCents: op.requiredCents,
      operatingSpentCents: op.spentCents,
      operatingShortfallCents: op.shortfallCents,
      totalOperatingSpentCents: old.totalOperatingSpentCents + op.spentCents,
      potentialServiceCapacity: potential,
      fundedServiceCapacity: op.fundedCapacity,
    };
    return this.freeze();
  }
}
