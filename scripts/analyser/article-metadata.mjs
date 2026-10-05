export function articleMetadata(report, date) {
  const budget = report.kind === 'budget-comparison'
  return {
    slug: `${budget ? 'budsjett' : 'utgifter-per-innbygger'}-${report.scopeId}-${report.start}-${report.end}-${date}`,
    topic: budget
      ? 'Statsbudsjettet'
      : report.scopeId === 'state'
        ? 'Statsfinanser'
        : report.scopeName,
    geography: 'Staten',
    type: budget
      ? report.comparison === 'proposal-to-adopted-budget'
        ? 'Forslag mot vedtak'
        : 'Budsjettforslag'
      : 'Utvikling over tid',
  }
}
