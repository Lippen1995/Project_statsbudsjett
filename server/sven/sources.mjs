import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReport } from '../../scripts/analyser/report.mjs'
import { point } from '../../web/src/sider/comparison.js'

const readJson = async (dir, file) => JSON.parse(await readFile(join(dir, file), 'utf8'))
const supportedPeriod = /\b(?:19|20)\d{2}\b/g
const supportedMunicipalQuestion = /\bnetto\s+driftsutgifter\b/i
const normalize = text => text.normalize('NFC').toLocaleLowerCase('nb-NO')

function mentionsMunicipality(question, name) {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(question)
}

async function municipalSources(dataDir, question, years) {
  const index = await readJson(dataDir, 'kostra/index.json')
  const selectedYears = years.length ? years : [index.latestYear]
  const entities = index.entities.filter(entity =>
    entity.kind === 'municipality' && entity.name.length > 2 && mentionsMunicipality(question, entity.name))
  if (!entities.length) throw new Error('Oppgi kommunenavn for oppslag i netto driftsutgifter')
  if (entities.length > 12) throw new Error('Oppgi høyst tolv kommuner per oppslag')
  const source = index.sources.find(item => item.source_table === '12137')
  return Promise.all(entities.map(async entity => {
    const detail = await readJson(dataDir, `kostra/entities/municipality-${entity.code}.json`)
    const selected = selectedYears.map(year => {
      const row = point(detail, year)
      return {
        year,
        netExpenditureThousandNok: row?.amount ?? null,
        netExpenditureNokPerCapita: row?.perCapita ?? null,
      }
    })
    return {
      id: `kostra-net-expenses-${entity.code}`,
      title: `Netto driftsutgifter, ${entity.name} kommunekonsern`,
      url: 'https://www.ssb.no/statbank/table/12137/',
      snapshotUrl: `https://fellestall.no/data/kostra/entities/municipality-${entity.code}.json`,
      updated: source?.fetched_at ?? index.updated,
      text: JSON.stringify({
        kommune: entity.name,
        kommunenummer: entity.code,
        data: selected,
        method: 'KOSTRA kommunekonsern. Beløp i løpende priser. Null som JSON-verdi betyr at tallet mangler.',
      }),
    }
  }))
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

export async function resolveSvenSources(question, dataDir) {
  if (typeof question !== 'string' || !question.trim()) throw new TypeError('Spørsmålet mangler')
  const normalized = normalize(question)
  const years = [...new Set(Array.from(normalized.matchAll(supportedPeriod), ([year]) => Number(year)))].sort()
  if (supportedMunicipalQuestion.test(normalized)) return municipalSources(dataDir, normalized, years)
  if (/statsregnskap|statens\s+utgifter|(?:brukte|bruker)\s+staten/.test(normalized) &&
      !/departement|forsvar|helse|samferdsel|utdanning|trygd|budsjettforslag/.test(normalized)) {
    return stateSources(dataDir, years)
  }
  throw new Error('Automatisk oppslag dekker statsregnskapets samlede utgifter og kommunenes netto driftsutgifter. Legg ved kilder for andre spørsmål.')
}
