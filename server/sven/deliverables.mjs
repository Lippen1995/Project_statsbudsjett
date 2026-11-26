export const fileFormats = Object.freeze(['csv', 'xlsx', 'pptx', 'docx', 'pdf', 'svg'])

export const deliverableInstructions = `Chatten kan vise sorterbare tabeller, forklaringsillustrasjoner og kommunekart, og levere CSV, Excel (xlsx), PowerPoint (pptx), Word (docx), PDF og SVG. Velg verktøy etter hva brukeren vil oppnå. Hvis de ber om en fil, fyll ut deliverables.formats. Du kan velge flere formater fra samme tallgrunnlag.
Legg ved deliverables når oppgaven trenger det. Format:
{"title":"kort faglig tittel","formats":["xlsx","pptx"],"table":{"title":"tittel","columns":[{"label":"Kommunenavn"},{"label":"2021","unit":"kr"},{"label":"2025","unit":"kr"}],"rows":[["Navn",100,120]],"calculations":[{"label":"Nominell vekst","unit":"%","op":"growth","columns":[1,2]}],"sourceIds":["kilde-ID"]},"sections":[{"heading":"Hovedfunn","paragraphs":["Faglig tekst"],"sourceIds":["kilde-ID"]}],"illustration":{"title":"En forklaringsfigur","steps":[{"label":"Begrep eller steg","detail":"Kort forklaring"},{"label":"Neste steg","detail":"Kort forklaring"}],"sourceIds":["kilde-ID"]},"map":{"title":"Karttittel","year":2025,"unit":"kr per innbygger","areas":[{"code":"0301","value":100}],"sourceIds":["kilde-ID"]}}
Alle delene utenom title og formats er valgfrie. Bruk [] i formats hvis ingen fil er bestilt. Bruk table for tallfiler og tabellbestillinger. En graf kan leveres separat i chart med samme tall og enheter. Behold kildetall i råkolonnene. Bruk null hvis noe mangler. columns i en beregning er nullbaserte indekser til råkolonnene. Tilgjengelige op: difference [før, etter], growth [før, etter] i %, real_growth [før, etter, indeks før, indeks etter] i %, per_capita [beløp, innbyggere] med valgfri factor for å skalere beløpsenhet, ratio [teller, nevner] med valgfri factor, sum [a, b, ...], scenario [utgangspunkt, antatt endring i %]. Merk scenarioantakelsene. Regnearket får de samme beregningene som formler. Kartet støtter kjente kommunenummer. Bruk sammenlignbare enheter og ett år, oppgi brudd i kommunegrenser, og bruk null når tall mangler. Bruk sections til å strukturere lengre notater og presentasjoner. Send aldri kode, HTML eller formler i tekstfeltene. Oppgi kilder per del og bind alle relevante verdier til grunnlaget.`

const labelled = (value, length) => typeof value === 'string' && value.trim().length > 0 && value.length <= length &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)
const number = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
const validCell = cell => cell === null || number(cell) || labelled(cell, 1000)
const operations = { difference: 2, growth: 2, real_growth: 4, per_capita: 2, ratio: 2, sum: 0, scenario: 2 }

function references(ids, known) {
  if (!Array.isArray(ids) || ids.length > 60 || !ids.every(id => known.has(id))) return null
  return [...new Set(ids)]
}

export function calculateValue(calculation, row) {
  const { op, columns, factor = 1 } = calculation
  const values = columns.map(index => row[index])
  if (!values.every(number)) return null
  const [first, second, third, fourth] = values
  let result
  switch (op) {
    case 'difference': result = second - first; break
    case 'growth': result = first > 0 ? (second / first - 1) * 100 : null; break
    case 'real_growth': result = first > 0 && third > 0 && fourth > 0 ? (second / first * (third / fourth) - 1) * 100 : null; break
    case 'per_capita': result = second > 0 ? first / second * factor : null; break
    case 'ratio': result = second !== 0 ? first / second * factor : null; break
    case 'sum': result = values.reduce((sum, value) => sum + value, 0); break
    case 'scenario': result = first * (1 + second / 100); break
  }
  return number(result) ? Number(result.toPrecision(15)) : null
}

export function calculationFormula({ op, columns, factor = 1 }, address) {
  const cells = columns.map(address)
  const [a, b, c, d] = cells
  let formula
  switch (op) {
    case 'difference': formula = `${b}-${a}`; break
    case 'growth': formula = `IF(${a}>0,(${b}/${a}-1)*100,"")`; break
    case 'real_growth': formula = `IF(AND(${a}>0,${c}>0,${d}>0),(${b}/${a}*(${c}/${d})-1)*100,"")`; break
    case 'per_capita': formula = `IF(${b}>0,${a}/${b}*${factor},"")`; break
    case 'ratio': formula = `IF(${b}<>0,${a}/${b}*${factor},"")`; break
    case 'sum': formula = `SUM(${cells.join(',')})`; break
    case 'scenario': formula = `${a}*(1+${b}/100)`; break
  }
  return `IF(COUNT(${cells.join(',')})=${cells.length},${formula},"")`
}

function normalizeTable(value, sourceIds) {
  if (!value || !labelled(value.title, 180) || !Array.isArray(value.columns) ||
    value.columns.length === 0 || value.columns.length > 16 ||
    !value.columns.every(column => labelled(column?.label, 100) && (column.unit == null || labelled(column.unit, 80))) ||
    !Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 400 ||
    !value.rows.every(row => Array.isArray(row) && row.length === value.columns.length && row.every(validCell)) ||
    JSON.stringify(value.rows).length > 140_000) return null
  const ids = references(value.sourceIds, sourceIds)
  if (!ids || (sourceIds.size && !ids.length)) return null
  const formulas = value.calculations ?? []
  if (!Array.isArray(formulas) || formulas.length > 10 || !formulas.every(formula => {
    const { op, columns, factor } = formula ?? {}
    return labelled(formula?.label, 100) && labelled(formula.unit, 80) && Object.hasOwn(operations, op) &&
      Array.isArray(columns) && (op === 'sum' ? columns.length >= 2 && columns.length <= 16 : columns.length === operations[op]) &&
      columns.every(column => Number.isInteger(column) && column >= 0 && column < value.columns.length) &&
      (factor == null || (['ratio', 'per_capita'].includes(op) && number(factor) && factor > 0))
  })) return null
  const calculations = formulas.map(({ label, unit, op, columns, factor }) =>
    ({ label, unit, op, columns, ...(factor == null ? {} : { factor }) }))
  return { title: value.title, columns: value.columns.map(({ label, unit }) => ({ label, ...(unit ? { unit } : {}) })),
    rows: value.rows, calculations, sourceIds: ids,
    derived: value.rows.map(row => calculations.map(calculation => calculateValue(calculation, row))) }
}

function normalizeSections(sections, ids) {
  return Array.isArray(sections) ? sections.slice(0, 20).flatMap(section => {
    const sourceIds = references(section?.sourceIds, ids)
    if (!sourceIds || !labelled(section.heading, 150) || !Array.isArray(section.paragraphs) ||
      !section.paragraphs.length || section.paragraphs.length > 12 ||
      !section.paragraphs.every(paragraph => labelled(paragraph, 2400))) return []
    return [{ heading: section.heading, paragraphs: section.paragraphs, sourceIds }]
  }) : []
}

function normalizeIllustration(illustration, ids) {
  const sourceIds = references(illustration?.sourceIds, ids)
  if (!sourceIds || !labelled(illustration.title, 180) || !Array.isArray(illustration.steps) ||
    illustration.steps.length < 2 || illustration.steps.length > 8 ||
    !illustration.steps.every(step => labelled(step?.label, 110) && labelled(step.detail, 280))) return null
  return { title: illustration.title, steps: illustration.steps.map(({ label, detail }) => ({ label, detail })), sourceIds }
}

function normalizeMap(map, ids) {
  const sourceIds = references(map?.sourceIds, ids)
  if (!sourceIds || !labelled(map.title, 180) || !labelled(map.unit, 80) ||
    !Number.isInteger(map.year) || map.year < 1900 || map.year > 2100 ||
    !Array.isArray(map.areas) || !map.areas.length || map.areas.length > 40 ||
    !map.areas.every(area => typeof area?.code === 'string' && /^\d{4}$/.test(area.code) &&
      (area.value === null || number(area.value))) ||
    new Set(map.areas.map(({ code }) => code)).size !== map.areas.length) return null
  return { title: map.title, year: map.year, unit: map.unit, areas: map.areas.map(({ code, value }) => ({ code, value })), sourceIds }
}

export function validateDeliverables(value, ids, { hasChart = false } = {}) {
  if (!value || !labelled(value.title, 180) || !Array.isArray(value.formats)) return null
  const table = normalizeTable(value.table, ids)
  const sections = normalizeSections(value.sections, ids)
  const illustration = normalizeIllustration(value.illustration, ids)
  const map = normalizeMap(value.map, ids)
  const formats = [...new Set(value.formats.filter(format => fileFormats.includes(format) &&
    (!['csv', 'xlsx'].includes(format) || table || hasChart || map) &&
    (format !== 'svg' || hasChart || illustration || map)))]
  if (!table && !sections.length && !illustration && !map && !formats.length) return null
  return { title: value.title, formats, sections, ...(table ? { table } : {}),
    ...(illustration ? { illustration } : {}), ...(map ? { map } : {}) }
}

export function tableFromChart(chart) {
  return { title: chart.title, columns: [{ label: chart.axis }, ...chart.series.map(label => ({ label, unit: chart.unit }))],
    rows: chart.rows.map(({ label, values }) => [label, ...values]), calculations: [], derived: [], sourceIds: chart.sourceIds }
}

export function tableFromMap(map) {
  return { title: map.title, columns: [{ label: 'Kommune' }, { label: 'Kommunenummer' }, { label: String(map.year), unit: map.unit }],
    rows: map.areas.map(({ code, name, value }) => [name ?? code, code, value]), calculations: [], derived: [], sourceIds: map.sourceIds }
}
