export function annualChanges(rows) {
  return rows.slice(1).map((row, i) => {
    const previous = rows[i]
    return {
      year: row.year,
      previousYear: previous.year,
      change: ((row.perCapita / previous.perCapita) * (previous.cpi / row.cpi) - 1) * 100,
    }
  })
}

export function largestAnnualChange(rows) {
  return annualChanges(rows).reduce(
    (largest, row) => (!largest || Math.abs(row.change) > Math.abs(largest.change) ? row : largest),
    null,
  )
}

export function growthMeasures(report) {
  const first = report.rows[0],
    last = report.rows.at(-1)
  return [
    {
      label: 'Samlede utgifter',
      detail: 'Løpende kroner',
      value: (last.expenditure / first.expenditure - 1) * 100,
    },
    {
      label: 'Utgifter per innbygger',
      detail: 'Løpende kroner · justert for folketall',
      value: (last.perCapita / first.perCapita - 1) * 100,
    },
    {
      label: 'Utgifter per innbygger',
      detail: 'Faste kroner · justert for folketall og KPI',
      value: ((last.perCapita / first.perCapita) * (first.cpi / last.cpi) - 1) * 100,
    },
  ]
}
