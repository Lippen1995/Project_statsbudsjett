import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReport } from '../../scripts/analyser/report.mjs'
import { municipalMetrics } from './municipal-metrics.mjs'

const readJson = async (dir, file) => JSON.parse(await readFile(join(dir, file), 'utf8'))
const supportedPeriod = /\b(?:19|20)\d{2}\b/g
const normalize = text => text.normalize('NFC').toLocaleLowerCase('nb-NO')

function mentionsTerm(question, name) {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(question)
}

async function municipalSources(read, question, years, metrics) {
  const index = await read('kostra/index.json')
  const selectedYears = years.length ? years : [index.latestYear]
  const entities = index.entities.filter(entity =>
    entity.kind === 'municipality' && entity.name.length > 2 && mentionsTerm(question, entity.name))
  if (!entities.length) throw new Error('Oppgi kommunenavn for oppslag i kommuneregnskapet')
  if (entities.length > 12) throw new Error('Oppgi høyst tolv kommuner per oppslag')
  const source = index.sources.find(item => item.source_table === '12137')
  return (await Promise.all(entities.map(async entity => {
    const detail = await read(`kostra/entities/municipality-${entity.code}.json`)
    return metrics.map(([metric, label]) => ({
      id: `kostra-${metric.replaceAll('_', '-')}-${entity.code}`,
      title: `${label[0].toUpperCase() + label.slice(1)}, ${entity.name} kommunekonsern`,
      url: 'https://www.ssb.no/statbank/table/12137/',
      snapshotUrl: `https://fellestall.no/data/kostra/entities/municipality-${entity.code}.json`,
      updated: source?.fetched_at ?? index.updated,
      text: JSON.stringify({
        kommune: entity.name,
        kommunenummer: entity.code,
        metric,
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

async function budgetRowSources(read, ids) {
  const files = new Map()
  const result = []
  for (const id of ids) {
    const file = id.startsWith('u-') ? 'utgifter.json' : 'inntekter.json'
    if (!files.has(file)) files.set(file, await read(file))
    const [, division, chapterNumber] = id.split('-')
    const department = files.get(file).find(row => row.id === id.slice(0, 2 + division.length))
    const chapterId = id.split('-').slice(0, 3).join('-')
    const chapter = department?.children?.find(row => row.id === chapterId)
    const selected = id === chapterId ? chapter : chapter?.children?.find(row => row.id === id)
    if (!selected) continue
    const documents = chapterDocuments[chapterId] ?? []
    result.push({
      id: 'dfo-' + id,
      title: `DFØ · ${selected.tag} · ${selected.navn}`,
      url: 'https://statsregnskapet.dfo.no/',
      snapshotUrl: 'https://fellestall.no/data/' + file,
      text: JSON.stringify({
        department: department.navn, chapter: chapterNumber, selected: selected.tag, labelInDataset: selected.navn,
        ...(chapterId === 'u-17-1720' ? { officialChapterNameSince2021: 'Forsvaret', scopeChangedIn: 2021 } : {}),
        ...(chapterId === 'u-17-1760' ? { officialChapterNameIn2025: 'Forsvarsmateriell og større anskaffelser og vedlikehold' } : {}),
        millionNokByYearAndPhase: selected.serier,
        posts: selected.children?.map(row => ({
          post: row.tag, label: row.navn, latestAccounting: Object.entries(row.serier)
            .filter(([, amount]) => Number.isFinite(amount.regnskap)).sort((a, b) => Number(a[0]) - Number(b[0])).slice(-3)
            .map(([year, amount]) => [year, amount.regnskap]),
        })),
        method: 'Millioner kroner i løpende priser. Regnskap og budsjettfaser er separate serier. Bruk dokumentomtalen for hva kapitlet dekker.',
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
} = {}) {
  if (typeof question !== 'string' || !question.trim()) throw new TypeError('Spørsmålet mangler')
  const budgetRows = selectedBudgetReferences(question)
  if (budgetRows.length) {
    const evidence = await budgetRowSources(read, budgetRows)
    if (evidence.length) return evidence
  }
  const normalized = normalize(question)
  const years = [...new Set(Array.from(normalized.matchAll(supportedPeriod), ([year]) => Number(year)))].sort()
  if (/oljepengebruk|oljepenger|strukturelt oljekorrigert/.test(normalized)) return oilSources(read, years)
  const metrics = Object.entries(municipalMetrics).filter(([, label]) => mentionsTerm(normalized, label))
  if (metrics.length) return municipalSources(read, normalized, years, metrics)
  if (/statsregnskap|statens\s+utgifter|(?:brukte|bruker)\s+staten/.test(normalized) &&
      !/departement|forsvar|helse|samferdsel|utdanning|trygd|budsjettforslag/.test(normalized)) {
    return stateSources(read, stateReport, years)
  }
  throw new Error('Automatisk oppslag dekker statsregnskapets samlede utgifter, oljepengebruk og utvalgte nøkkeltall for kommunekonsern. Legg ved kilder for andre spørsmål.')
}
