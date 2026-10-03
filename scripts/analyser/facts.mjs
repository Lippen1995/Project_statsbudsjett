export function calculateFacts(first, last) {
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
  for (const f of Object.values(facts)) if (!f.text) f.text = `${number(f.value)} %`
  return facts
}
