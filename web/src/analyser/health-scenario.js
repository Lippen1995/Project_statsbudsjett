const keys = ['fte', 'timeSaving', 'realization', 'cashShare', 'annualEmployerCost',
  'nonStaffSavings', 'upfrontCost', 'ongoingCost', 'rampYears', 'years', 'discountRate']

export function healthScenario(input) {
  if (!input || Object.keys(input).length !== keys.length || keys.some(k => !Number.isFinite(input[k])))
    throw Error('Every scenario assumption must be explicit and finite')
  const { fte, timeSaving, realization, cashShare, annualEmployerCost, nonStaffSavings,
    upfrontCost, ongoingCost, rampYears, years, discountRate } = input
  if ([fte, annualEmployerCost, nonStaffSavings, upfrontCost, ongoingCost].some(x => x < 0) ||
      [timeSaving, realization, cashShare, discountRate].some(x => x < 0 || x > 1) ||
      !Number.isInteger(years) || years < 1 || years > 30 ||
      !Number.isInteger(rampYears) || rampYears < 1 || rampYears > years)
    throw Error('Invalid scenario bounds')
  let cumulativeCash = -upfrontCost, npv = -upfrontCost
  const rows = [{ year: 0, netCash: -upfrontCost, cumulativeCash, releasedFte: 0, capacityFte: 0, cashFte: 0 }]
  for (let year = 1; year <= years; year++) {
    const phase = Math.min(year / rampYears, 1)
    const releasedFte = fte * timeSaving * realization * phase
    const cashFte = releasedFte * cashShare
    const capacityFte = releasedFte - cashFte
    const staffCashSaving = cashFte * annualEmployerCost
    const netCash = staffCashSaving + nonStaffSavings * phase - ongoingCost
    cumulativeCash += netCash
    npv += netCash / (1 + discountRate) ** year
    rows.push({ year, releasedFte, cashFte, capacityFte, staffCashSaving, netCash, cumulativeCash })
  }
  const breakEvenYear = rows.find(r => r.cumulativeCash >= 0)?.year ?? null
  return { assumptions: { ...input }, rows, npv, breakEvenYear,
    warning: 'Illustrativ følsomhetsberegning, ikke en prognose, bemanningsbeslutning eller samfunnsøkonomisk analyse.' }
}
