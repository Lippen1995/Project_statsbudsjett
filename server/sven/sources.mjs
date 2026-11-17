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

async function municipalSources(dataDir, question, years, metrics) {
  const index = await readJson(dataDir, 'kostra/index.json')
  const selectedYears = years.length ? years : [index.latestYear]
  const entities = index.entities.filter(entity =>
    entity.kind === 'municipality' && entity.name.length > 2 && mentionsTerm(question, entity.name))
  if (!entities.length) throw new Error('Oppgi kommunenavn for oppslag i kommuneregnskapet')
  if (entities.length > 12) throw new Error('Oppgi høyst tolv kommuner per oppslag')
  const source = index.sources.find(item => item.source_table === '12137')
  return (await Promise.all(entities.map(async entity => {
    const detail = await readJson(dataDir, `kostra/entities/municipality-${entity.code}.json`)
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

async function stateSources(dataDir, years) {
  const meta = await readJson(dataDir, 'meta.json')
  const available = meta.regnskap_aar
  const selected = years.length ? years : available.slice(-2)
  if (!selected.every(year => available.includes(year))) {
    throw new Error(`Statsregnskapet i dette datasettet dekker ${available[0]}–${available.at(-1)}`)
  }
  const end = Math.max(...selected)
  const start = selected.length > 1 ? Math.min(...selected) : available.findLast(year => year < end) ?? end
  const report = buildReport(dataDir, { start, end: start === end ? available[1] : end })
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

async function oilSources(dataDir, years) {
  const snapshot = await readJson(dataDir, 'oljepengebruk.json')
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

export async function resolveSvenSources(question, dataDir) {
  if (typeof question !== 'string' || !question.trim()) throw new TypeError('Spørsmålet mangler')
  const normalized = normalize(question)
  const years = [...new Set(Array.from(normalized.matchAll(supportedPeriod), ([year]) => Number(year)))].sort()
  if (/oljepengebruk|oljepenger|strukturelt oljekorrigert/.test(normalized)) return oilSources(dataDir, years)
  const metrics = Object.entries(municipalMetrics).filter(([, label]) => mentionsTerm(normalized, label))
  if (metrics.length) return municipalSources(dataDir, normalized, years, metrics)
  if (/statsregnskap|statens\s+utgifter|(?:brukte|bruker)\s+staten/.test(normalized) &&
      !/departement|forsvar|helse|samferdsel|utdanning|trygd|budsjettforslag/.test(normalized)) {
    return stateSources(dataDir, years)
  }
  throw new Error('Automatisk oppslag dekker statsregnskapets samlede utgifter, oljepengebruk og utvalgte nøkkeltall for kommunekonsern. Legg ved kilder for andre spørsmål.')
}
