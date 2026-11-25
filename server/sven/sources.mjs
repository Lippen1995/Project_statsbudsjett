import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReport } from '../../scripts/analyser/report.mjs'
import { peerBenchmark } from './municipal-peers.mjs'
import { municipalMetrics } from './municipal-metrics.mjs'
import { norwayPopulation, officialMunicipalCounts, publicCaseId, publicSchoolPupils, readPublicCase } from './policy-public-data.mjs'

const readJson = async (dir, file) => JSON.parse(await readFile(join(dir, file), 'utf8'))
const supportedPeriod = /\b(?:19|20)\d{2}\b/g
const yearRange = /\b((?:19|20)\d{2})\s*(?:[-–—]|til|t\.o\.m\.)\s*((?:19|20)\d{2})\b/g
const throughLatest = /\b(?:siden|fra)\s+((?:19|20)\d{2})\b/
const normalize = text => text.normalize('NFC').toLocaleLowerCase('nb-NO')

function requestedYears(question) {
  const periodText = question.replace(/\bkap(?:ittel)?\.?\s*\d{4}(?:[\s,]*post\s*\d{1,3})?/gi, '')
  const years = new Set(Array.from(periodText.matchAll(supportedPeriod), ([year]) => Number(year)))
  for (const [, from, to] of periodText.matchAll(yearRange)) {
    for (let year = Number(from) + 1; year < Number(to); year++) years.add(year)
  }
  return [...years].sort((left, right) => left - right)
}

function yearsThroughLatest(question, years, available) {
  const first = question.match(throughLatest)?.[1]
  return first && years.length === 1 ? available.filter(year => year >= Number(first)) : years
}

const serviceTerms = [
  ['FGK8b', 'Grunnskole', /grunnskol|skoleutgift|skolebruk|\bskolen?\b/],
  ['FGK7', 'Barnehage', /barnehage/],
  ['FGK9', 'Helse og omsorg', /helse[ -]+og omsorg|omsorgsutgift|pleie og omsorg/],
  ['FGK13', 'Barnevern', /barnevern/],
  ['FGK5', 'Samferdsel', /samferdsel/],
  ['FGK2', 'Kultur', /kultur/],
]
const overviewCodes = { revenues: 'AGD13', expenses: 'AGD9', net_result: 'AGD23', debt: 'KG31', investments: 'AGI1', net_expenses: 'AGD1' }

export const budgetPhases = Object.freeze([
  { id: 'forslag', label: 'Regjeringens forslag' },
  { id: 'saldert', label: 'Saldert budsjett · Stortingets vedtak' },
  { id: 'revidert', label: 'Løpende revidert budsjett · registrerte endringsvedtak' },
  { id: 'regnskap', label: 'Statsregnskap · faktisk bokført' },
])

function mentionsTerm(question, name) {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(question)
}

async function municipalSources(read, question, years, metrics, service, insights, lens) {
  const index = await read('kostra/index.json')
  const period = yearsThroughLatest(question, years, index.years ?? [])
  const selectedYears = period.length ? period : years.length ? years :
    lens === 'drivers' && index.years?.length > 1 ? index.years.slice(-2) : [index.latestYear]
  const entities = index.entities.filter(entity =>
    entity.kind === 'municipality' && entity.name.split(/\s+[–-]\s+/).some(name => name.length > 2 && mentionsTerm(question, name)))
  if (!entities.length) throw new Error('Oppgi kommunenavn for oppslag i kommuneregnskapet')
  if (entities.length > 12) throw new Error('Oppgi høyst tolv kommuner per oppslag')
  const source = index.sources.find(item => item.source_table === '12137')
  return (await Promise.all(entities.map(async entity => {
    const detail = await read(`kostra/entities/municipality-${entity.code}.json`)
    if (service) {
      const [code, name] = service
      const values = detail.services.find(serviceArea => serviceArea.code === code)?.metrics
      return [{ id: `kostra-${code.toLowerCase()}-${entity.code}`, title: `${name}, ${entity.name} kommunekonsern`,
        url: 'https://www.ssb.no/statbank/table/12362/',
        ...(insights ? { snapshotUrl: `https://fellestall.no/data/kostra/entities/municipality-${entity.code}.json`, municipality: entity.code } : {}),
        updated: index.sources.find(item => item.source_table === '12362')?.fetched_at ?? index.updated,
        text: JSON.stringify({ kommune: entity.name, kommunenummer: entity.code, funksjon: code,
          boundaryHistory: detail.boundaryHistory,
          data: selectedYears.map(year => ({ year, ...Object.fromEntries(['gross_expenses', 'net_expenses', 'investments'].map(metric => {
            const value = values?.[metric]?.[year]
            return [metric, { amountThousandNok: value?.amount ?? null, nokPerCapita: value?.perCapita ?? null }]
          })) })), method: 'KOSTRA kommunekonsern, 12362. Løpende priser. Netto og brutto er separate begreper. Kr per innbygger er ikke kr per elev. Null betyr at tallet mangler.',
        }),
      }]
    }
    return metrics.map(([metric, label]) => ({
      id: `kostra-${metric.replaceAll('_', '-')}-${entity.code}`,
      title: `${label[0].toUpperCase() + label.slice(1)}, ${entity.name} kommunekonsern`,
      url: 'https://www.ssb.no/statbank/table/12137/',
      snapshotUrl: `https://fellestall.no/data/kostra/entities/municipality-${entity.code}.json`,
      updated: source?.fetched_at ?? index.updated,
      ...(insights ? { municipality: entity.code } : {}),
      text: JSON.stringify({
        kommune: entity.name,
        kommunenummer: entity.code,
        metric,
        ...(insights ? { boundaryHistory: detail.boundaryHistory ?? [], metricCode: overviewCodes[metric] } : {}),
        data: selectedYears.map(year => {
          const row = detail.overview[metric]?.[year]
          return metric === 'net_expenses'
            ? { year, netExpenditureThousandNok: row?.amount ?? null, netExpenditureNokPerCapita: row?.perCapita ?? null }
            : { year, amountThousandNok: row?.amount ?? null, amountNokPerCapita: row?.perCapita ?? null }
        }),
        method: 'KOSTRA kommunekonsern. Beløp i løpende priser. Null som JSON-verdi betyr at tallet mangler.',
      }),
    }))
  }))).flat()
}

async function priceIndex(read) {
  const kpi = await read('kpi.json')
  return { id: 'ssb-kpi-aarsindeks', title: 'SSB · Konsumprisindeksen, årsgjennomsnitt',
    url: 'https://www.ssb.no/statbank/table/14711/', text: JSON.stringify({ method: 'KPI totalindeks 2025 = 100.', indexByYear: kpi }) }
}

async function countsSources(expenses, question, fetchCounts, denominator) {
  const definitions = parsed => denominator === 'population' || /per innbygger|befolkning/.test(question)
    ? norwayPopulation : parsed.funksjon === 'FGK8b' ? publicSchoolPupils : norwayPopulation
  const byKey = new Map()
  for (const source of expenses) {
    if (!source.municipality) continue
    const parsed = JSON.parse(source.text)
    const definition = definitions(parsed)
    const years = parsed.data.filter(row => Number.isInteger(row.year)).map(row => row.year)
    const key = definition.table + '-' + source.municipality
    if (years.length >= 2) byKey.set(key, { years: [years[0], years.at(-1)], definition, parsed, region: source.municipality })
  }
  const responses = await Promise.allSettled([...byKey.values()].map(async ({ years, definition, parsed, region }) => {
    const result = await fetchCounts(definition, region, years)
    if (!Object.values(result.counts).some(Number.isFinite)) return null
    return { id: `ssb-${definition.table}-${region}`, title: `${definition.label} · ${parsed.kommune}`,
      url: `https://www.ssb.no/statbank/table/${definition.table}/`, snapshotUrl: result.url,
      updated: result.updated, countMetadata: { region, table: definition.table, unit: definition.unit, label: definition.label },
      text: JSON.stringify({ ...definition, region, countsByYear: result.counts,
        method: definition === publicSchoolPupils ? 'Elevtall i kommunale grunnskoler. Årsregnskapet i kommunekonsernet kan dekke flere utgiftstyper enn undervisning for disse elevene.'
          : 'Innbyggere ved inngangen til året. Hentet fra SSB og summert over begge kjønn og alle aldre.' }),
    }
  }))
  return responses.flatMap(item => item.status === 'fulfilled' && item.value ? [item.value] : [])
}

export function selectedBudgetReferences(question) {
  return [...new Set(Array.from(question.matchAll(/(?:^|\n)Fellestalls rad-ID: ([ui]-\d{1,3}-\d{4}(?:-\d{1,3})?)(?=\s|$)/g),
    ([, id]) => id))].slice(0, 4)
}

const chapterDocuments = {
  'u-17-1720': [{
    id: 'fd-prop1s-2025-1720',
    title: 'Forsvarsdepartementets budsjettproposisjon for 2025, kapittel 1720 Forsvaret',
    url: 'https://www.regjeringen.no/no/dokumenter/prop.-1-s-20242025/id3057361/?ch=3',
    text: 'Budsjettproposisjonen for 2025 bruker navnet «Forsvaret» for kap. 1720. Post 01 er driftsutgifter for Forsvaret. ' +
      'Departementets fordeling omfatter blant annet Hæren, Sjøforsvaret, Luftforsvaret og Forsvarsstaben. Flere foreslåtte satsinger ' +
      'var avsatt sentralt i Forsvarsstaben i forslaget, med senere fordeling til driftsenhetene. Dokumentet beskriver budsjettforslaget, ikke regnskapsført fordeling i 2025.',
  }, {
    id: 'fd-prop16s-2025-1720',
    title: 'Forsvarsdepartementets omtale av kapittelomleggingen fra 2021',
    url: 'https://www.regjeringen.no/no/dokumenter/prop.-16-s-20252026/id3140207/?ch=3',
    text: 'Fra 2021 ble forsvarsgrenene og andre selvstendige enheter i Forsvaret samlet under kap. 1720 Forsvaret. ' +
      'Etterretningstjenesten (kap. 1735) og Redningshelikoptertjenesten (kap. 1791) ble holdt utenfor. ' +
      'Tall for kap. 1720 før og etter 2021 gjelder derfor forskjellige avgrensninger.',
  }],
  'u-17-1760': [{
    id: 'fd-prop1s-2025-1760',
    title: 'Prop. 1 S for 2025, Forsvarsdepartementets omtale av kapittel 1760 post 45',
    url: 'https://www.regjeringen.no/no/dokumenter/prop.-1-s-20242025/id3057361/?ch=3',
    text: 'Post 45 finansierer større materiellanskaffelser og vedlikehold, herunder nye kampfly med baseløsning, ' +
      'flernasjonale investeringsprogrammer i NATO, forskning, utvikling og innovasjon. Proposisjonen er regjeringens forslag for 2025.',
  }, {
    id: 'fma-regnskap-2025-1760-45',
    title: 'Forsvarsmateriell 2025, kontantregnskap for kapittel 1760 post 45',
    url: 'https://www.fma.no/arsrapport-2025/arsregnskap/Kontantregnskap',
    text: 'For 2025 viser bevilgningsrapporteringen på kapittel 1760 post 45 samlet tildeling på 37 031 357 tusen kroner ' +
      'og regnskap på 36 330 464 tusen kroner. Dette er beløpet på posten samlet i kontantregnskapet.',
  }, {
    id: 'fma-arsrapport-2025-investeringsprosjekter',
    title: 'Forsvarsmateriell 2025, regnskapsnoter om konkrete investeringsprosjekter',
    url: 'https://www.fma.no/arsrapport-2025/arsregnskap/Noter',
    text: 'Forsvarsmateriell navngir blant annet F-35-anskaffelsen, nye ubåter, P-8A Poseidon maritime patruljefly, ' +
      'luftovervåking og artillerisystem 155 mm. Prosjekttabellen for varelager under tilvirkning oppgir tilgang i 2025 ' +
      'på 1 994 820 tusen kroner for F-35-anskaffelsen, 1 781 099 for nye ubåter og 670 964 for P-8A Poseidon. ' +
      'Tilgang i virksomhetsregnskapet er ikke det samme som kontantutbetaling fra post 45. ' +
      'De navngitte prosjektene er eksempler, og tabellen er ikke en full avstemming av post 45.',
  }],
}

export function findBudgetNodes(tree, { id, chapter, post }) {
  const rows = []
  for (const department of tree) for (const item of department.children ?? []) {
    if (id ? !id.startsWith(item.id) : item.id.split('-')[2] !== chapter) continue
    const selected = id ? id === item.id ? item : item.children?.find(row => row.id === id)
      : post ? item.children?.find(row => Number(row.id.split('-')[3]) === Number(post)) : item
    if (selected) rows.push({ department, chapter: item, selected })
  }
  return rows
}

function budgetSelectors(question) {
  return [...question.matchAll(/\bkap(?:ittel)?\.?\s*(\d{4})(?!\d)(?:[\s,]*\/?\s*post\s*(\d{1,3})(?!\d))?/gi)]
    .slice(0, 4).map(([, chapter, post])=>({chapter,...(post?{post}:{})}))
}

export function budgetSelector(question) { return budgetSelectors(question)[0] ?? null }

async function budgetRowSources(read, ids, selection, years, insights) {
  const files = new Map()
  const result = []
  const idList = [...ids]
  if (selection && !idList.length) {
    for (const file of ['utgifter.json', 'inntekter.json']) {
      const tree = await read(file)
      files.set(file, tree)
      const found = findBudgetNodes(tree, selection)
      if (found.length) { idList.push(...found.map(row=>row.selected.id)); break }
    }
  }
  const meta = insights ? await read('meta.json').catch(() => ({})) : {}
  for (const id of idList) {
    const file = id.startsWith('u-') ? 'utgifter.json' : 'inntekter.json'
    if (!files.has(file)) files.set(file, await read(file))
    const tree = files.get(file)
    const [match] = findBudgetNodes(tree, { id })
    if (!match) continue
    const { department, chapter, selected } = match
    const chapterId = chapter.id
    const chapterNumber = chapterId.split('-')[2]
    const post = id.split('-')[3]
    const scopes = insights ? findBudgetNodes(tree,{chapter:chapterNumber,post}).map(({department,selected})=>({
      department:department.navn,id:selected.id,
      accountingYears:Object.entries(selected.serier).filter(([,row])=>Number.isFinite(row.regnskap)).map(([year])=>Number(year)),
    })) : []
    const documents = chapterDocuments[chapterId] ?? []
    result.push({
      id: 'dfo-' + id,
      title: `DFØ · ${selected.tag} · ${selected.navn}`,
      url: 'https://statsregnskapet.dfo.no/',
      snapshotUrl: 'https://fellestall.no/data/' + file,
      ...(insights ? { budget: { id, years, latestAccounting: meta.siste_regnskap_aar,
        proposalUrl: meta.kilder?.find(source => /Gul bok/i.test(source.navn))?.url,
        proposalYear: meta.budsjettforslag?.findLast(proposal => proposal.phase === 'initial')?.year,
        ...(scopes.length>1?{scopes}:{}),
      } } : {}),
      text: JSON.stringify({
        department: department.navn, chapter: chapterNumber, selected: selected.tag, labelInDataset: selected.navn,
        ...(chapterId === 'u-17-1720' ? { officialChapterNameSince2021: 'Forsvaret', scopeChangedIn: 2021 } : {}),
        ...(chapterId === 'u-17-1760' ? { officialChapterNameIn2025: 'Forsvarsmateriell og større anskaffelser og vedlikehold' } : {}),
        ...(scopes.length>1?{organizationalScopes:scopes}:{}),
        millionNokByYearAndPhase: selected.serier,
        posts: selected.children?.map(row => ({
          post: row.tag, label: row.navn, latestAccounting: Object.entries(row.serier)
            .filter(([, amount]) => Number.isFinite(amount.regnskap)).sort((a, b) => Number(a[0]) - Number(b[0])).slice(-3)
            .map(([year, amount]) => [year, amount.regnskap]),
        })),
        method: 'Millioner kroner i løpende priser. Regnskap og budsjettfaser er separate serier. Bruk dokumentomtalen for hva kapitlet dekker.' +
          (insights ? ' Løpende revidert betyr saldert budsjett pluss registrerte endringsvedtak hos DFØ, og kan omfatte senere vedtak enn vårens RNB.' : ''),
      }),
    }, ...documents)
  }
  return [...new Map(result.map(source => [source.id, source])).values()]
}

async function stateSources(read, stateReport, years) {
  const meta = await read('meta.json')
  const available = meta.regnskap_aar
  const selected = years.length ? years : available.slice(-2)
  if (!selected.every(year => available.includes(year))) {
    throw new Error(`Statsregnskapet i dette datasettet dekker ${available[0]}–${available.at(-1)}`)
  }
  const end = Math.max(...selected)
  const start = selected.length > 1 ? Math.min(...selected) : available.findLast(year => year < end) ?? end
  const report = await stateReport({ start, end: start === end ? available[1] : end })
  return [{
    id: 'dfø-statsregnskap-utgifter',
    title: 'Statsregnskapets utgifter, Fellestalls standardavgrensning',
    url: 'https://statsregnskapet.dfo.no/',
    snapshotUrl: 'https://fellestall.no/data/utgifter.json',
    updated: report.dataUpdated,
    snapshotHash: report.dataHash,
    relatedSources: report.sources.map(({ name, url }) => ({ name, url })),
    text: JSON.stringify({
      method: report.methodology,
      data: report.rows,
      requestedYears: selected,
      limitations: report.limitations,
    }),
  }]
}

async function oilSources(read, years) {
  const snapshot = await read('oljepengebruk.json')
  const available = Object.keys(snapshot.serier).map(Number).sort((a, b) => a - b)
  const selected = years.length ? years : available.slice(-2)
  if (!selected.every(year => available.includes(year))) {
    throw new Error(`Oljepengebruken i dette datasettet dekker ${available[0]}–${available.at(-1)}`)
  }
  const bySource = new Map()
  for (const year of selected) {
    for (const [phase, value] of Object.entries(snapshot.serier[year])) {
      const { url, navn, sha256 } = value.kilde
      if (!bySource.has(url)) bySource.set(url, { url, navn, sha256, rows: [] })
      bySource.get(url).rows.push({
        year, phase, structuralMillionNok: value.strukturelt, oilAdjustedMillionNok: value.oljekorrigert,
      })
    }
  }
  return [...bySource.values()].map(({ url, navn, sha256, rows }, index) => ({
    id: `finansdep-oljepengebruk-${index + 1}`,
    title: navn,
    url,
    snapshotUrl: 'https://fellestall.no/data/oljepengebruk.json',
    snapshotHash: sha256,
    text: JSON.stringify({
      data: rows,
      method: 'Oljepengebruk måles som strukturelt oljekorrigert budsjettunderskudd i løpende mill. kroner. Budsjettfaser og regnskap er egne observasjoner. Tallene viser ikke faktiske fondsoverføringer.',
    }),
  }))
}

export async function resolveSvenSources(question, dataDir, {
  read = file => readJson(dataDir, file),
  stateReport = options => buildReport(dataDir, options),
  insights = false, lens, denominator, fetchCounts = officialMunicipalCounts, fetchCase = readPublicCase, loadValues, loadCentrality,
} = {}) {
  if (typeof question !== 'string' || !question.trim()) throw new TypeError('Spørsmålet mangler')
  const normalized = normalize(question)
  const years = requestedYears(normalized)
  const budgetRows = selectedBudgetReferences(question)
  const combined = ['delivery','reconcile'].includes(lens)
  const namedBudgets = insights ? budgetSelectors(normalized).slice(0,combined?4:1) : []
  const evidence = []
  if (budgetRows.length) evidence.push(...await budgetRowSources(read,budgetRows,null,years,insights))
  if ((!evidence.length || combined) && namedBudgets.length) {
    const groups = await Promise.all(namedBudgets.map(selection=>budgetRowSources(read,[],selection,years,insights)))
    evidence.push(...groups.flat())
  }
  const budgetEvidence = [...new Map(evidence.map(source=>[source.id,source])).values()]
  if (budgetEvidence.length && !combined) return budgetEvidence
  if (insights) {
    const link = question.match(/https:\/\/www\.stortinget\.no\/no\/Saker-og-publikasjoner\/Saker\/Sak\/?\?p=\d+/i)?.[0]
    const id = publicCaseId(link ?? normalized.match(/\b(?:stortingssak|stortingets saks-id|sak-id)\s*[:#]?\s*(\d{4,8})\b/)?.[1])
    if (id) {
      const record = await fetchCase(id)
      return [...budgetEvidence,{ id: 'storting-sak-' + id, title: record.title, url: record.url, parliamentCase: id,
        text: JSON.stringify({ ...record, method: 'Stortingets åpne data. Statusen «behandlet» kan vise til komiteen. Les ferdigbehandlet, vedtaksfelt og tilhørende dokumenter for å fastslå utfallet.' }) }]
    }
  }
  if (budgetEvidence.length && lens !== 'reconcile') return budgetEvidence
  if (/oljepengebruk|oljepenger|strukturelt oljekorrigert/.test(normalized)) return [...budgetEvidence,...await oilSources(read, years)]
  const metrics = Object.entries(municipalMetrics).filter(([, label]) => mentionsTerm(normalized, label))
  const service = serviceTerms.find(([, , pattern]) => pattern.test(normalized))
  if (insights && lens === 'peers') {
    const index = await read('kostra/index.json')
    const focus = index.entities.filter(entity=>entity.kind === 'municipality').flatMap(entity=>entity.name.split(/\s+[–-]\s+/)
      .filter(name=>name.length>2 && mentionsTerm(normalized,name)).map(name=>({entity,offset:normalized.indexOf(normalize(name)),length:name.length})))
      .sort((a,b)=>a.offset-b.offset || b.length-a.length)[0]?.entity
    const metric = service && /brutto/.test(normalized) ? 'gross_expenses' : service && /investering/.test(normalized) ? 'investments'
      : service ? 'net_expenses' : metrics[0]?.[0] ?? 'net_expenses'
    const evidence = await peerBenchmark({index,focus,year:years.at(-1) ?? index.latestYear,service,metric,loadValues,loadCentrality})
    if (evidence?.length) return evidence
  }
  if (metrics.length || service) {
    try {
      const found = await municipalSources(read, normalized, years, metrics, service, insights, lens)
      const needsDrivers = insights && lens === 'drivers'
      const needsPrices = needsDrivers || /realvekst|reell vekst|prisjuster|faste kroner|inflasjon|konsumprisindeks/.test(normalized)
      const [prices, counts] = await Promise.all([
        needsPrices ? priceIndex(read).catch(error => { if (!insights) throw error; return null }) : null,
        needsDrivers ? countsSources(found, normalized, fetchCounts, denominator) : [],
      ])
      if (prices) found.push(prices)
      found.push(...counts)
      return [...budgetEvidence,...found]
    } catch (error) {
      if (!budgetEvidence.length && (metrics.length || /kommun|kostra/.test(normalized))) throw error
    }
  }
  if (/statsregnskap|statens\s+utgifter|(?:brukte|bruker)\s+staten/.test(normalized) &&
      !/departement|forsvar|helse|samferdsel|utdanning|trygd|budsjettforslag/.test(normalized)) {
    return [...budgetEvidence,...await stateSources(read, stateReport, years)]
  }
  if (combined) return budgetEvidence
  throw new Error('Automatisk oppslag dekker statsregnskapets samlede utgifter, oljepengebruk og utvalgte nøkkeltall for kommunekonsern. Legg ved kilder for andre spørsmål.')
}
