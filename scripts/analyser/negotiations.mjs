import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const fact = (value, text, label) => ({ value, text, label })
const number = (value) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(value)
const partyIds = { Ap: 'A', SV: 'SV', Sp: 'Sp', R: 'R', MDG: 'MDG', H: 'H', FrP: 'FrP', V: 'V', KrF: 'KrF' }
export function negotiationFacts(evidence, rows, priorities = []) {
  if (!evidence) return {}
  if (evidence.version !== 1 || evidence.year !== 2027) throw Error('Ukjent forhandlingsgrunnlag')
  for (const source of [evidence.parliament, evidence.olderPopulation, ...evidence.documents]) {
    if (!Number.isFinite(Date.parse(source.retrievedAt)) ||
        hash(source.raw) !== source.sha256) throw Error('Forhandlingskildens original er endret')
  }
  if (evidence.parliament.url !== 'https://data.stortinget.no/eksport/representanter?stortingsperiodeid=2025-2029&format=json')
    throw Error('Ukjent mandatkilde')
  const members = JSON.parse(evidence.parliament.raw).representanter_liste
  if (!Array.isArray(members) || members.length !== 169 ||
      new Set(members.map((m) => m.id)).size !== 169 ||
      members.some((m) => m.vara_representant !== false || !Object.values(partyIds).includes(m.parti?.id)))
    throw Error('Mandatgrunnlaget må være de faste representantene')
  const counts = Object.fromEntries(Object.entries(partyIds).map(([id, sourceId]) =>
    [id, members.filter((m) => m.parti.id === sourceId).length]))
  const facts = { mandateTotal: fact(members.length, String(members.length), 'Faste representanter') }
  for (const [party, value] of Object.entries(counts)) facts[`mandate${party}`] = fact(value, String(value), `Mandater: ${party}`)
  const left = counts.Ap + counts.SV + counts.Sp + counts.R + counts.MDG
  const right = counts.H + counts.FrP + counts.KrF + counts.V
  for (const [id, value] of Object.entries({ mandateLeft: left, mandateRight: right,
    mandateWithoutMDG: left - counts.MDG, mandateWithoutNine: left - counts.Sp,
    mandateRightSp: right + counts.Sp, mandateWithV: left - counts.MDG + counts.V,
    mandateWithKrF: left - counts.MDG + counts.KrF, mandateApH: counts.Ap + counts.H }))
    facts[id] = fact(value, String(value), 'Beregnet mandatsum; ikke en avtale eller votering')
  const source = evidence.olderPopulation
  if (source.url !== 'https://www.ssb.no/statbank/table/10211/') throw Error('Ukjent alderskilde')
  const snapshot = JSON.parse(source.raw), data = snapshot.originalResponse
  const ages = Array.from({ length: 25 }, (_, i) => String(80 + i).padStart(3, '0')).concat('105+')
  const selections = { Alder: ages, Kjonn: ['0'], ContentsCode: ['Personer'], Tid: ['2014', '2020', '2025', '2026'] }
  if (JSON.stringify(snapshot.selections) !== JSON.stringify(selections) ||
      data.class !== 'dataset' || !Array.isArray(data.value) ||
      JSON.stringify([...data.id].sort()) !== JSON.stringify(Object.keys(selections).sort()))
    throw Error('Aldersuttrekket har feil utvalg')
  const order = data.id.map((id, index) => {
    const category = data.dimension[id].category
    const codes = Object.entries(category.index).sort((a, b) => a[1] - b[1]).map(([code]) => code)
    if (JSON.stringify([...codes].sort()) !== JSON.stringify([...selections[id]].sort()) || data.size[index] !== codes.length)
      throw Error('SSBs svar avviker fra utvalget')
    return codes
  })
  if (data.value.length !== data.size.reduce((a, b) => a * b, 1) || data.value.some((v) => !Number.isFinite(v) || v < 0))
    throw Error('Manglende aldersobservasjoner må ikke bli null')
  const sums = Object.fromEntries(selections.Tid.map((year) => [year, 0]))
  for (let i = 0; i < data.value.length; i++) {
    let remainder = i, year
    for (let j = order.length - 1; j >= 0; j--) {
      const code = order[j][remainder % order[j].length]
      remainder = Math.floor(remainder / order[j].length)
      if (data.id[j] === 'Tid') year = code
    }
    sums[year] += data.value[i]
  }
  facts.olderStartYear = fact(2020, '2020', 'Første observasjonsår')
  facts.olderEndYear = fact(2026, '2026', 'Siste observasjonsår')
  facts.olderAge = fact(80, '80', 'Laveste alder i eksplisitt sum')
  facts.olderStart = fact(sums['2020'], number(sums['2020']), 'Innbyggere på minst åtti år, ved årets start')
  facts.olderEnd = fact(sums['2026'], number(sums['2026']), 'Innbyggere på minst åtti år, ved årets start')
  const growth = (sums['2026'] / sums['2020'] - 1) * 100
  facts.olderGrowth = fact(growth, `${number(growth)} prosent`, 'Observert aldersgruppes vekst')
  if (!Array.isArray(evidence.documents) || evidence.documents.length > 10) throw Error('For mange forhandlingskilder')
  for (const [i, document] of evidence.documents.entries()) {
    if (!/^https:\/\/www\.regjeringen\.no\//.test(document.url) || !document.name ||
        typeof document.quote !== 'string' || document.quote.length < 30 || !document.raw.includes(document.quote))
      throw Error('Offisielt sitat mangler originalkilde')
    facts[`negotiation${String.fromCharCode(65 + i)}Quote`] = fact(0, document.quote, document.name)
  }
  const numeric = (pattern, quote, label) => {
    const match = pattern.exec(quote)
    if (!match) throw Error('Tall kan ikke utledes fra offisielt sitat: ' + label)
    const value = Number(match[1].replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(value)) throw Error('Ugyldig kildetall')
    return value
  }
  const tax = evidence.documents.find((d) => d.name === 'Proveny')?.quote
  const birth = evidence.documents.find((d) => d.name === 'Familie-fulltekst')?.quote
  if (!tax || !birth) throw Error('Skatte- og familiegrunnlag mangler')
  const income = -numeric(/Inntektsskatt for personer\s+(-[\d ]+)/, tax, 'personinntektsskatt')
  const changes = -numeric(/Forslag til nye skatte- og avgiftsendringer i 2027\s+(-[\d ]+)/, tax, 'nye skatteendringer')
  const previous = numeric(/Virkning i 2027 av vedtatte skatte- og avgiftsendringer i 2026\s+([\d ]+)/, tax, 'tidligere skatteendringer')
  const rates = [...birth.matchAll(/betale ut ([\d ]+) kroner per barn/g)].map((m) => Number(m[1].replace(/\s/g, '')))
  if (rates.length !== 2 || !rates.every(Number.isFinite)) throw Error('Engangsstønadssatser mangler')
  for (const [id, value] of Object.entries({ taxIncome: income, taxChanges: changes, taxPrevious: previous,
    taxNet: changes - previous, birthBefore: rates[0], birthAfter: rates[1], birthReduction: rates[0] - rates[1] }))
    facts[id] = fact(value, number(value), 'Beregnet fra frosset offisiell provenytabell eller satsvedtak')
  const documentQuote = (name) => {
    const quote = evidence.documents.find((d) => d.name === name)?.quote
    if (!quote) throw Error('Kildeutdrag mangler: ' + name)
    return quote
  }
  const derived = {
    trygdeReduction: numeric(/med ([\d ,]+)pst\.-enheter/, tax, 'trygdeavgift'),
    elcarRevenue: numeric(/fra 300 000 kroner til 150 000 kroner ([\d ]+)/, tax, 'elbilmoms') / 1000,
    elcarBefore: numeric(/fra ([\d ]+) kroner til/, documentQuote('Elbilmoms'), 'gammel elbilgrense'),
    elcarAfter: numeric(/til ([\d ]+) kroner/, documentQuote('Elbilmoms'), 'ny elbilgrense'),
    oilTotal: numeric(/fondsmidler på ([\d ,]+)milliarder/, documentQuote('Hovedramme'), 'oljepengebruk'),
    oilShare: numeric(/tilsvare ([\d ,]+)prosent/, documentQuote('Hovedramme'), 'fondsandel'),
    municipalityGrowth: numeric(/inntekter med ([\d ,]+)milliarder/, documentQuote('Kommunetotal'), 'kommunal realvekst'),
    municipalityRoom: numeric(/handlingsrom på ([\d ,]+)milliardar/, documentQuote('Kommunehandlingsrom'), 'kommunehandlingsrom'),
    hospitalOperating: numeric(/øker driftsbevilgningene med ([\d ,]+)mill/, documentQuote('Sykehusdemografi'), 'sykehusdrift') / 1000,
    hospitalDemography: numeric(/anslått til om lag ([\d ,]+)mill/, documentQuote('Sykehusdemografi'), 'sykehusdemografi') / 1000,
    hospitalTransfer: numeric(/flyttes ([\d ,]+)mill/, documentQuote('Sykehusflytting'), 'ompostering') / 1000,
    enovaNewReduction: numeric(/fondet med ([\d ,]+)milliarder/, documentQuote('Enova'), 'Enova'),
  }
  for (const [id, value] of Object.entries(derived)) facts[id] = fact(value, number(value), 'Beregnet fra offisielt kildeutdrag; milliarder eller prosent som angitt i teksten')
  const venstreQuote = priorities.find((p) => p.id === 'venstreskatt')?.quote
  facts.venstreExtra = fact(numeric(/minst ([\d ]+) kroner/, venstreQuote ?? '', 'Venstres skattekrav'), number(numeric(/minst ([\d ]+) kroner/, venstreQuote ?? '', 'Venstres skattekrav')), 'Kroner fra verifisert Venstre-utspill')
  const electricity = priorities.find((p) => p.id === 'spnorgespris')?.quote
  const ratesMatch = /fra (\d+) til (\d+) øre/.exec(electricity ?? '')
  if (!ratesMatch) throw Error('Norgespris mangler datert primærkilde')
  facts.electricityRateBefore = fact(Number(ratesMatch[1]), ratesMatch[1], 'Norgespris før avgifter, foregående sats')
  facts.electricityRateAfter = fact(Number(ratesMatch[2]), ratesMatch[2], 'Norgespris før avgifter, foreslått sats')
  // Postidentiteter kommer fra samme frosne budsjett som grafene, aldri fra AI-tekst.
  rows.forEach((row, i) => {
    let suffix = '', n = i + 1
    while (n) { n--; suffix = String.fromCharCode(65 + n % 26) + suffix; n = Math.floor(n / 26) }
    facts[`postKey${suffix}`] = fact(0, `${Number(row.id.split('-')[0])}/${row.id.split('-')[1]}`, `Kapittel/post: ${row.name}`)
  })
  return facts
}
export function loadNegotiations(dataDir, year) {
  const path = `${dataDir}/negotiation-research/${year}.json`
  if (!existsSync(path)) throw Error('Forhandlingsanalysen mangler kontrollert kildegrunnlag')
  return JSON.parse(readFileSync(path, 'utf8'))
}
export function negotiationSources(evidence) {
  return [evidence.parliament, evidence.olderPopulation, ...evidence.documents].map((source) => ({
    name: source.name, url: source.url,
    description: `Originalkilde frosset ${source.retrievedAt}, SHA-256 ${source.sha256}. Beregninger og utvalg inngår i godkjent datagrunnlag.`,
  }))
}
