export function articleMetadata(report, date) {
  if (report.question === 'health-reform') return {
    slug: `helsereformen-forslag-og-regnestykke-${date}`,
    topic: 'Helse og omsorg', geography: 'Norge', type: 'Politikk og økonomi',
  }
  if (report.kind === 'oil-funds') return {
    slug: `oljepengebruk-${report.year}-${date}`, topic: 'Statsfinanser',
    geography: 'Staten', type: 'Budsjettforslag',
  }
  const budget = report.kind === 'budget-comparison'
  return {
    slug: `${budget ? 'budsjett' : 'utgifter-per-innbygger'}-${report.scopeId}-${report.start}-${report.end}${report.question ? '-' + report.question : ''}-${date}`,
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
