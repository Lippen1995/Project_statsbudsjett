import { MONEY, type BudgetInputs } from "./model";
/** Funding buys readiness for capacity, even when that capacity is unused. No debt. */
export function fundOperations(
  balanceCents: number,
  monthlyFunding: number,
  potentialCapacity: number,
  costPerUnit: number,
) {
  if (
    !Number.isSafeInteger(balanceCents) ||
    balanceCents < 0 ||
    balanceCents > 1_000_000_000 ||
    !Number.isSafeInteger(monthlyFunding) ||
    monthlyFunding < 0 ||
    monthlyFunding > 10000 ||
    !Number.isSafeInteger(potentialCapacity) ||
    potentialCapacity < 0 ||
    potentialCapacity > 100000 ||
    !Number.isSafeInteger(costPerUnit) ||
    costPerUnit < 1 ||
    costPerUnit > 10
  )
    throw new Error("Invalid operating-funding inputs.");
  const incomeCents = monthlyFunding * MONEY,
    availableCents = balanceCents + incomeCents;
  const requiredCents = Math.round(potentialCapacity * costPerUnit * MONEY),
    spentCents = Math.min(requiredCents, availableCents);
  return {
    incomeCents,
    availableCents,
    requiredCents,
    spentCents,
    balanceCents: availableCents - spentCents,
    shortfallCents: requiredCents - spentCents,
    fundedCapacity: spentCents / (costPerUnit * MONEY),
  };
}
export function capitalIdentity(
  budget: BudgetInputs,
  month: number,
  balance: number,
  spent: number,
) {
  return (
    budget.startingCapital * MONEY + month * budget.monthlyCapital * MONEY ===
    balance + spent
  );
}
export function operatingIdentity(
  budget: BudgetInputs,
  month: number,
  balance: number,
  spent: number,
) {
  return (
    budget.startingOperating * MONEY +
      month * budget.monthlyOperating * MONEY ===
    balance + spent
  );
}
/** The last active work month receives the rounding remainder; sum is exactly cost. */
export function installment(
  costCents: number,
  duration: number,
  workMonth: number,
) {
  if (
    !Number.isSafeInteger(costCents) ||
    costCents < 0 ||
    costCents > 1_000_000_000 ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 12 ||
    !Number.isInteger(workMonth) ||
    workMonth < 1 ||
    workMonth > duration
  )
    throw new Error("Invalid construction installment.");
  return (
    Math.floor(costCents / duration) +
    (workMonth === duration ? costCents % duration : 0)
  );
}
