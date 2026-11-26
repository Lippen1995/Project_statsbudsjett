export const chartInstructions = `Legg til feltet chart når brukeren ber om en graf og det finnes et tallgrunnlag.
Format: {"type":"line"|"bar","title":"Hva grafen viser","unit":"Enhet","axis":"Etikett for x-aksen","series":["Navn på serie"],"rows":[{"label":"Kategori eller periode","values":[123]}],"sourceIds":["kilde-ID"]}.
Bruk line for utvikling med jevne tidsintervaller og bar for sammenligninger. Bruk inntil fire serier med samme enhet. Oppgi én verdi per serie i hver rad. Ordne tidsserier kronologisk, og bruk null for manglende observasjoner. Behold enhet, prisgrunnlag og budsjettfase i tittel, enhet eller serienavn når det er relevant. Oppgi tall som JSON-tall, uten formatering. Bruk bare tall som kan etterprøves i grunnlaget. Forklar i svaret dersom grunnlaget ikke holder til grafen. Ellers kan chart utelates.`

const label = (value, maxLength) => typeof value === 'string' && value.trim() && value.length <= maxLength

export function validateChart(chart, sourceIds) {
  if (!chart || !['line', 'bar'].includes(chart.type) || !label(chart.title, 180) ||
      !label(chart.unit, 80) || !label(chart.axis, 80) ||
      !Array.isArray(chart.series) || !chart.series.length || chart.series.length > 4 ||
      !chart.series.every(name => label(name, 100)) || new Set(chart.series).size !== chart.series.length ||
      !Array.isArray(chart.rows) || chart.rows.length < (chart.type === 'line' ? 2 : 1) || chart.rows.length > 120 ||
      !chart.rows.every(row => label(row?.label, 150) && Array.isArray(row.values) &&
        row.values.length === chart.series.length && row.values.every(value => value === null ||
          (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER))) ||
      new Set(chart.rows.map(row => row.label)).size !== chart.rows.length ||
      !chart.rows.some(row => row.values.some(Number.isFinite)) ||
      !Array.isArray(chart.sourceIds) || (sourceIds.size ? !chart.sourceIds.length : chart.sourceIds.length > 0) ||
      !chart.sourceIds.every(id => sourceIds.has(id))) return null

  const { type, title, unit, axis, series, rows } = chart
  return { type, title, unit, axis, series, rows: rows.map(({ label, values }) => ({ label, values })),
    sourceIds: [...new Set(chart.sourceIds)] }
}
