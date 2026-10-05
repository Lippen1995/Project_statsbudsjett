import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const hash = (raw) => createHash('sha256').update(raw).digest('hex')
const number = (v) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(v)
export function ssbEvidenceFacts(evidence = []) {
  if (!Array.isArray(evidence) || evidence.length > 5) throw Error('Ugyldig SSB-grunnlag')
  const facts = {},
    ids = new Set()
  for (const e of evidence) {
    if (
      !/^[A-Za-z]{1,24}$/.test(e.id) ||
      ids.has(e.id) ||
      !/^\d{5}$/.test(e.table) ||
      !/^[a-f0-9]{64}$/.test(e.hash) ||
      !Number.isFinite(Date.parse(e.retrievedAt)) ||
      typeof e.unit !== 'string' ||
      !e.unit ||
      !e.title ||
      !e.purpose ||
      !e.selections ||
      !e.categories ||
      !Array.isArray(e.rows) ||
      e.rows.length < 2 ||
      e.rows.length > 200 ||
      e.rows.some(
        (r, i) =>
          !Number.isFinite(r.value) ||
          !Number.isSafeInteger(r.year) ||
          r.year < 1800 ||
          r.year > 2100 ||
          (i > 0 && r.year !== e.rows[i - 1].year + 1),
      )
    )
      throw Error('Ugyldig eller ufullstendig SSB-serie')
    ids.add(e.id)
    const first = e.rows[0],
      last = e.rows.at(-1),
      prefix = `ssb${e.id}`
    const fact = (value, text, label) => ({ value, text, label })
    facts[prefix + 'StartYear'] = fact(
      first.year,
      String(first.year),
      `${e.title}: første observasjonsår`,
    )
    facts[prefix + 'EndYear'] = fact(
      last.year,
      String(last.year),
      `${e.title}: siste observasjonsår`,
    )
    facts[prefix + 'Start'] = fact(
      first.value,
      `${number(first.value)} ${e.unit}`,
      `${e.title}: startverdi`,
    )
    facts[prefix + 'End'] = fact(
      last.value,
      `${number(last.value)} ${e.unit}`,
      `${e.title}: sluttverdi`,
    )
    facts[prefix + 'Change'] = fact(
      last.value - first.value,
      `${number(last.value - first.value)} ${e.unit}`,
      `${e.title}: endring i måleenheten`,
    )
    if (first.value > 0 && last.value >= 0) {
      const growth = (last.value / first.value - 1) * 100
      facts[prefix + 'Growth'] = fact(
        growth,
        `${number(growth)} %`,
        `${e.title}: prosentvis endring, ikke prosentpoeng`,
      )
    }
  }
  return facts
}

export function attachSsbEvidence(dataDir, report) {
  const indexPath = `${dataDir}/ssb-research/index.json`
  if (!existsSync(indexPath)) return report
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  if (index.version !== 1 || !Array.isArray(index.extracts)) throw Error('Ukjent SSB-register')
  const scope = report.kind === 'budget-comparison' ? `budget:${report.year}` : report.scopeId
  const entries = index.extracts.filter((e) => e.scope === scope)
  if (!entries.length) return report
  const evidence = entries.map((e) => {
    if (!/^[a-f0-9]{64}$/.test(e.hash) || e.path !== `ssb-research/${e.hash}.json`)
      throw Error('Ugyldig SSB-arkivsti')
    const raw = readFileSync(`${dataDir}/${e.path}`)
    if (hash(raw) !== e.hash) throw Error('SSB-kildehash samsvarer ikke')
    const snapshot = JSON.parse(raw)
    if (
      snapshot.version !== 1 ||
      snapshot.url !== `https://www.ssb.no/statbank/table/${snapshot.table}/`
    )
      throw Error('Ugyldig SSB-kilde')
    return {
      id: e.id,
      scope: e.scope,
      purpose: e.purpose,
      hash: e.hash,
      table: snapshot.table,
      title: snapshot.title,
      retrievedAt: snapshot.retrievedAt,
      updated: snapshot.series.updated ?? null,
      selections: snapshot.selections,
      categories: snapshot.series.categories,
      unit: snapshot.series.unit,
      rows: snapshot.series.rows,
    }
  })
  const facts = ssbEvidenceFacts(evidence)
  return {
    ...report,
    ssbEvidence: evidence,
    dataHash: hash(JSON.stringify({ base: report.dataHash, evidence })),
    facts: { ...report.facts, ...facts },
    sources: [
      ...report.sources,
      ...evidence.flatMap((e) => [
        {
          name: `SSB: ${e.title} — ${e.id} (tabell ${e.table})`,
          url: `https://www.ssb.no/statbank/table/${e.table}/`,
          description: `Frosset uttrekk hentet ${e.retrievedAt}. ${e.purpose}`,
        },
        {
          name: `Frosset SSB-uttrekk: ${e.id}`,
          url: `https://fellestall.no/data/ssb-research/${e.hash}.json`,
          local: `/data/ssb-research/${e.hash}.json`,
          description:
            'Originalrespons, metadata, utvalg og tidspunkt. Filens SHA-256 inngår i analysegrunnlaget.',
        },
      ]),
    ],
    methodology: [
      ...report.methodology,
      'SSB-serier er eksplisitte årlige utvalg. Start-/sluttverdier, forskjell og eventuell prosentvis endring beregnes fra arkiverte observasjoner. Prosentvis endring er ikke prosentpoeng.',
    ],
    limitations: [
      ...report.limitations,
      'SSB-seriene er bakgrunnsvariabler, ikke en dokumentert årsaksfordeling av budsjettveksten. Geografi, definisjoner, tidsperiode, revisjoner og eventuelle prognoser må vurderes før tolkning. Siste observerte år erstatter ikke et fremtidig budsjettår.',
    ],
  }
}
