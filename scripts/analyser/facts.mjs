import { largestAnnualChange } from '../../web/src/analyser/insights.js'

export function calculateFacts(first, last, rows) {
  const start = first.year,
    end = last.year
  const number = (v, digits = 1) =>
    new Intl.NumberFormat('nb-NO', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(v)
  const fact = (value, text, label) => ({ value, text, label })
  const facts = {
    startYear: fact(start, String(start), 'Første regnskapsår'),
    endYear: fact(end, String(end), 'Siste regnskapsår'),
    nominalGrowth: fact(
      (last.expenditure / first.expenditure - 1) * 100,
      '',
      'Vekst i løpende utgifter',
    ),
    populationGrowth: fact((last.population / first.population - 1) * 100, '', 'Befolkningsvekst'),
    priceGrowth: fact((last.cpi / first.cpi - 1) * 100, '', 'Prisvekst målt med KPI'),
    realPerCapitaGrowth: fact(
      (last.perCapita / first.perCapita / (last.cpi / first.cpi) - 1) * 100,
      '',
      'Realvekst per innbygger',
    ),
    firstPerCapita: fact(
      first.perCapita,
      `${number(first.perCapita, 0)} kr`,
      'Per innbygger i startåret, løpende kroner',
    ),
    lastPerCapita: fact(
      last.perCapita,
      `${number(last.perCapita, 0)} kr`,
      'Per innbygger i sluttåret, løpende kroner',
    ),
    firstRealPerCapita: fact(
      (first.perCapita * last.cpi) / first.cpi,
      `${number((first.perCapita * last.cpi) / first.cpi, 0)} kr`,
      'Startåret i sluttårets priser',
    ),
    total: fact(
      last.expenditure / 1000,
      `${number(last.expenditure / 1000)} mrd. kr`,
      'Utgifter i sluttåret',
    ),
  }
  if (rows) {
    const largest = largestAnnualChange(rows)
    const previous = rows.find((row) => row.year === largest.previousYear)
    const changed = rows.find((row) => row.year === largest.year)
    const growth = (a, b) => ((b.perCapita / a.perCapita) * (a.cpi / b.cpi) - 1) * 100
    Object.assign(facts, {
      nominalPerCapitaGrowth: fact(
        (last.perCapita / first.perCapita - 1) * 100,
        '',
        'Vekst per innbygger, løpende kroner',
      ),
      previousYear: fact(previous.year, String(previous.year), 'Året før største årlige endring'),
      largestChangeYear: fact(
        changed.year,
        String(changed.year),
        'År med største årlige endring i absoluttverdi',
      ),
      largestAnnualChange: fact(
        largest.change,
        '',
        'Største årlige endring, KPI-justert per innbygger',
      ),
      growthBeforeChange: fact(
        growth(first, previous),
        '',
        `KPI-justert vekst per innbygger, ${first.year}–${previous.year}`,
      ),
      growthSinceChange: fact(
        growth(previous, last),
        '',
        `KPI-justert vekst per innbygger, ${previous.year}–${last.year}`,
      ),
      growthAfterChange: fact(
        growth(changed, last),
        '',
        `KPI-justert vekst per innbygger, ${changed.year}–${last.year}`,
      ),
    })
  }
  for (const f of Object.values(facts)) if (!f.text) f.text = `${number(f.value)} %`
  return facts
}
