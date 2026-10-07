import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const clean = (text) => text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
const value = (text) => Number(text.replace(/\s/g, '').replace(',', '.'))
const format = (n, decimals = 1) => n.toLocaleString('nb-NO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

// Parse the official table rather than accepting editorially supplied macro facts.
export function parseOilSource(html, year) {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100 || !html.includes(`nasjonalbudsjettet ${year}`))
    throw Error('Feil år eller ukjent nøkkeltallskilde')
  const table = html.match(/<table\b[^>]*>[\s\S]*?Økonomiske hovedstørrelser[\s\S]*?<\/table>/)?.[0]
  if (!table) throw Error('Den offisielle nøkkeltallstabellen mangler')
  const cells = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => clean(c[1])),
  )
  const header = cells.find((r) => r[0]?.startsWith('Norsk økonomi'))
  const years = header?.slice(1).map(value)
  if (!years || years.length !== 3 || years.some((y, i) => y !== year - 2 + i))
    throw Error('Nøkkeltallstabellen har ukjent årsavgrensning')
  const series = (label) => {
    const matches = cells.filter((r) => r[0]?.startsWith(label))
    if (matches.length !== 1 || matches[0].length !== 4) throw Error(`Ukjent tabellformat: ${label}`)
    const values = matches[0].slice(1).map(value)
    if (values.some((n) => !Number.isFinite(n) || n <= 0)) throw Error('Ugyldige nøkkeltall')
    return values
  }
  const nominal = series('Strukturelt oljekorrigert budsjettunderskudd, mrd. kroner, løpende priser')
  const real = series(`Strukturelt oljekorrigert budsjettunderskudd, mrd. ${year}-kroner`)
  const fund = series('Uttak fra SPU, prosent')
  const trend = series('Strukturelt oljekorrigert budsjettunderskudd som prosentandel')
  const text = clean(html)
  if (!text.includes(`Tall for ${year - 1} er anslag på regnskap`) || !text.includes('realavkastningen på tre prosent'))
    throw Error('Anslagsmerking eller handlingsregel mangler i kilden')
  const ukraine = text.match(/inkluderer ([\d ,]+) milliarder kroner i støtte til Ukraina/)
  const capital = text.match(new RegExp(`Fondsverdien er beregningsteknisk anslått til ([\\d ]+) mrd\\. kroner ved inngangen til ${year}`))
  if (!ukraine || !capital) throw Error('Fondskapital eller Ukraina-beløp mangler i kilden')
  const rows = years.map((y, i) => ({ year: y, nominal: nominal[i], real: real[i], fundPercent: fund[i] }))
  if (real.at(-1) !== nominal.at(-1)) throw Error('Faste priser har feil basisår')
  return { rows, ukraine: value(ukraine[1]), fundValue: value(capital[1]), trendGdpPercent: trend.at(-1) }
}

export function oilFacts(data) {
  const first = data.rows[0], last = data.rows.at(-1), previous = data.rows.at(-2)
  const facts = {}
  const add = (id, n, label, unit = '', decimals = 1) => { facts[id] = { value: n, text: format(n, decimals) + unit, label } }
  add('startYear', first.year, 'Første sammenligningsår', '', 0)
  add('endYear', last.year, 'Forslagsår', '', 0)
  add('previousYear', previous.year, 'Året før forslaget', '', 0)
  for (const id of ['startYear', 'endYear', 'previousYear']) facts[id].text = String(facts[id].value)
  add('total', last.nominal, 'Strukturell oljepengebruk', ' mrd. kr')
  add('previousTotal', previous.nominal, 'Oppdatert anslag året før', ' mrd. kr')
  add('nominalChange', last.nominal - first.nominal, 'Nominell økning fra første år', ' mrd. kr')
  add('nominalGrowth', (last.nominal / first.nominal - 1) * 100, 'Nominell vekst gjennom perioden', ' %')
  add('realChange', last.real - first.real, 'Reell økning fra første år', ' mrd. kr')
  add('realGrowth', (last.real / first.real - 1) * 100, 'Realvekst gjennom perioden', ' %')
  add('annualNominalChange', last.nominal - previous.nominal, 'Nominell årsøkning', ' mrd. kr')
  add('annualNominalGrowth', (last.nominal / previous.nominal - 1) * 100, 'Nominell årsvekst', ' %')
  add('annualRealChange', last.real - previous.real, 'Reell årsøkning', ' mrd. kr')
  add('annualRealGrowth', (last.real / previous.real - 1) * 100, 'Reell årsvekst', ' %')
  add('fundPercent', last.fundPercent, 'Andel av fondskapital ved årets inngang', ' %')
  add('fundValue', data.fundValue, 'Anslått fondskapital ved årets inngang', ' mrd. kr', 0)
  add('ukraine', data.ukraine, 'Støtte til Ukraina', ' mrd. kr', 0)
  add('ukraineShare', data.ukraine / last.nominal * 100, 'Ukraina-beløp i forhold til strukturell bruk', ' %')
  add('trendGdpPercent', data.trendGdpPercent, 'Andel av trend-BNP for Fastlands-Norge', ' %')
  add('rulePercent', 3, 'Handlingsregelens langsiktige rettesnor', ' %', 0)
  return facts
}

export function buildOilReport(dataDir, year) {
  const source = JSON.parse(readFileSync(`${dataDir}/oil-funds/${year}.json`, 'utf8'))
  const html = readFileSync(`${dataDir}/oil-funds/${year}.html`, 'utf8')
  if (source.sha256 !== hash(html) || !new RegExp(`^https://www\\.regjeringen\\.no/no/aktuelt/nokkeltall-i-nasjonalbudsjettet-${year}/id\\d+/$`).test(source.url) || !Number.isFinite(Date.parse(source.checkedAt)))
    throw Error('Nøkkeltallenes kildearkiv er ugyldig')
  const data = parseOilSource(html, year)
  const report = {
    kind: 'oil-funds', scopeId: 'oil-funds', scopeName: 'Strukturell oljepengebruk', year,
    start: data.rows[0].year, end: year, forecastFrom: year - 1, dataUpdated: source.checkedAt,
    sourceArchive: source, ...data, incomeShare: null, facts: oilFacts(data),
    sources: [{ name: `Finansdepartementets nøkkeltall for ${year}`, url: source.url, description: 'Offisiell tabell og forklarende tekst. Original HTML og SHA-256 er arkivert; forrige år er anslag på regnskap.' }],
    methodology: ['Oljepengebruk er strukturelt oljekorrigert budsjettunderskudd, ikke faktisk fondsoverføring. Nominelle endringer beregnes fra løpende kroner; realendringer bruker departementets faste priser i forslagsåret.', 'Fondets uttaksandel følger den publiserte tabellen og gjelder kapitalen ved inngangen til året. Grafene skiller løpende kroner, faste priser og prosent.'],
    limitations: ['Dette er et budsjettforslag og oppdaterte anslag, ikke en sammenhengende regnskapsserie eller en verifisering av historisk rekord.', 'Faktisk fondsoverføring og samlede budsjettinntekter er ikke oppgitt i nøkkeltallskilden. Inntektsandelen er derfor uavklart; trend-BNP-andelen er et annet mål.', 'Ukraina-beløpet dokumenterer nivået, ikke et bidrag til årsøkningen. Andre finansieringsbehov omtales som mulige mekanismer, ikke dokumenterte årsaksandeler.'],
  }
  report.dataHash = hash(JSON.stringify(report))
  return report
}

export function validateOilReport(report) {
  const { dataHash, ...base } = report
  if (report.kind !== 'oil-funds' || report.scopeId !== 'oil-funds' || !Number.isSafeInteger(report.year) || report.end !== report.year || report.forecastFrom !== report.year - 1 || report.start !== report.year - 2 || report.rows?.length !== 3 || report.incomeShare !== null || !/^[a-f0-9]{64}$/.test(report.sourceArchive?.sha256 ?? '') || dataHash !== hash(JSON.stringify(base)))
    throw Error('Ugyldig eller endret oljepengegrunnlag')
  for (const [i, row] of report.rows.entries())
    if (row.year !== report.start + i || !['nominal', 'real', 'fundPercent'].every((k) => Number.isFinite(row[k]) && row[k] > 0)) throw Error('Ugyldig oljepengeserie')
  if (!['ukraine', 'fundValue', 'trendGdpPercent'].every((k) => Number.isFinite(report[k]) && report[k] > 0) || JSON.stringify(report.facts) !== JSON.stringify(oilFacts(report)))
    throw Error('Oljepengefakta samsvarer ikke med regnestykket')
  return report
}
