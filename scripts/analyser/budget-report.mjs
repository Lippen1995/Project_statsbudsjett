import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { number } from '../../web/src/analyser/model.js'
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const archive = (path, digest) => {
  const raw = readFileSync(path)
  if (createHash('sha256').update(raw).digest('hex') !== digest)
    throw Error('Budsjettarkivets kilde er endret')
  return JSON.parse(raw)
}
const fact = (value, text, label) => ({ value, text, label })
const included = (r) => r.chapter < '3000' && Number(r.post) < 90 && r.chapter !== '2800'
export function compareBudgetRecords(before, after) {
  const index = (records) => {
    const map = new Map()
    for (const r of records.filter(included)) {
      if (!/^\d{4}-\d{2}$/.test(r.key) || !Number.isFinite(r.amount) || map.has(r.key))
        throw Error('Ugyldige eller dupliserte budsjettposter')
      map.set(r.key, r)
    }
    return map
  }
  const a = index(before),
    b = index(after)
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((key) => {
    const old = a.get(key),
      next = b.get(key),
      row = next ?? old
    return {
      id: key,
      name: `${row.chapterName} – ${row.postName}`,
      department: row.department,
      departmentName: row.departmentName,
      previousDepartment: old?.department ?? null,
      before: old?.amount ?? 0,
      after: next?.amount ?? 0,
      change: (next?.amount ?? 0) - (old?.amount ?? 0),
      added: !old,
      removed: !next,
    }
  })
}
export function budgetFacts(rows, year, baseYear, evidence = []) {
  const before = rows.reduce((s, r) => s + r.before, 0),
    after = rows.reduce((s, r) => s + r.after, 0)
  if (!(before > 0) || !(after > 0))
    throw Error('Budsjettanalysen mangler sammenlignbare positive totaler')
  const growth = (after / before - 1) * 100,
    changed = rows.filter((r) => Math.abs(r.change) >= 0.1)
  const facts = {
    budgetYear: fact(year, String(year), 'Budsjettår'),
    baseYear: fact(baseYear, String(baseYear), 'Sammenligningsår'),
    beforeTotal: fact(
      before,
      `${number(before / 1000, 1)} mrd. kr`,
      'Utgifter i sammenligningsgrunnlaget',
    ),
    afterTotal: fact(
      after,
      `${number(after / 1000, 1)} mrd. kr`,
      'Utgifter i budsjettet som analyseres',
    ),
    nominalGrowth: fact(growth, `${number(growth, 1)} %`, 'Endring i løpende kroner'),
    absoluteChange: fact(
      after - before,
      `${number((after - before) / 1000, 1)} mrd. kr`,
      'Samlet endring',
    ),
    changedPosts: fact(
      changed.length,
      String(changed.length),
      'Poster med endring på minst hundre tusen kroner',
    ),
  }
  for (const [prefix, values] of [
    ['increase', changed.filter((r) => r.change > 0).sort((a, b) => b.change - a.change)],
    ['cut', changed.filter((r) => r.change < 0).sort((a, b) => a.change - b.change)],
  ]) {
    for (const [i, row] of values.slice(0, 6).entries()) {
      const key = prefix + String.fromCharCode(65 + i)
      facts[key + 'Name'] = fact(0, row.name, 'Konkret budsjettpost')
      facts[key + 'Amount'] = fact(
        row.change,
        `${number(row.change, 1)} mill. kr`,
        'Endring på posten',
      )
    }
  }
  for (const [i, item] of evidence.entries()) {
    const prefix = 'party' + String.fromCharCode(65 + i)
    facts[prefix + 'Names'] = fact(0, item.parties.join(', '), 'Partier omtalt i kilden')
    facts[prefix + 'Quote'] = fact(0, item.quote, 'Ordrett dokumentasjon')
  }
  return facts
}
function siteRecords(dataDir, year, series) {
  const rows = []
  for (const department of read(`${dataDir}/utgifter.json`))
    for (const chapter of department.children ?? [])
      for (const post of chapter.children ?? []) {
        const amount = post.serier?.[year]?.[series]
        if (amount != null)
          rows.push({
            key: `${chapter.id.split('-').at(-1)}-${post.id.split('-').at(-1)}`,
            chapter: chapter.id.split('-').at(-1),
            post: post.id.split('-').at(-1),
            chapterName: chapter.navn,
            postName: post.navn,
            department: department.id.split('-').at(-1),
            departmentName: department.navn,
            amount,
          })
      }
  return rows
}
export function nextBudgetReport(dataDir, published) {
  if (!existsSync(`${dataDir}/budsjettarkiv/index.json`)) return null
  const index = read(`${dataDir}/budsjettarkiv/index.json`),
    meta = read(`${dataDir}/meta.json`)
  const latest = new Map(index.proposals.map((p) => [`${p.year}:${p.phase}`, p]))
  for (const item of [...latest.values()].reverse()) {
    const proposal = archive(`${dataDir}/${item.path}`, item.hash)
    const modes = item.outcome ? ['outcome', 'proposal'] : ['proposal']
    for (const mode of modes) {
      const outcome =
        mode === 'outcome' ? archive(`${dataDir}/${item.outcome.path}`, item.outcome.hash) : null
      const baseYear = outcome || item.phase === 'revised' ? item.year : item.year - 1
      const before = outcome
        ? proposal.records
        : item.phase === 'revised'
          ? item.baseline
            ? archive(`${dataDir}/${item.baseline.path}`, item.baseline.hash).records
            : []
          : siteRecords(dataDir, baseYear, 'saldert')
      if (!before.some(included)) continue
      const after = outcome ? outcome.records : proposal.records
      const rows = compareBudgetRecords(before, after)
      const comparison = outcome ? 'proposal-to-adopted-budget' : 'previous-budget-to-proposal'
      const politicalEvidence = item.politicalEvidence
        ? archive(`${dataDir}/${item.politicalEvidence.path}`, item.politicalEvidence.hash)
        : []
      for (const evidence of politicalEvidence) {
        const document = read(`${dataDir}/${evidence.documentPath}`)
        const sha = createHash('sha256').update(document.text).digest('hex')
        if (sha !== evidence.sourceHash || !document.text.includes(evidence.quote))
          throw Error('Politisk kilde eller sitat er endret')
      }
      if (
        published.some(
          (a) =>
            a.report.kind === 'budget-comparison' &&
            a.report.comparison === comparison &&
            a.report.phase === item.phase &&
            a.report.year === item.year &&
            JSON.stringify(a.report.rows) === JSON.stringify(rows) &&
            JSON.stringify(a.report.politicalEvidence ?? []) === JSON.stringify(politicalEvidence),
        )
      )
        continue
      const facts = budgetFacts(rows, item.year, baseYear, politicalEvidence)
      return {
        kind: 'budget-comparison',
        comparison,
        year: item.year,
        phase: item.phase,
        scopeId: `budget-${item.year}-${item.phase}-${mode}-${hash({ rows, politicalEvidence }).slice(0, 8)}`,
        scopeName: 'Statsbudsjettet',
        start: baseYear,
        end: item.year,
        dataUpdated: outcome?.source.dataUpdated ?? item.importedAt,
        dataHash: hash({
          rows,
          proposalHash: item.hash,
          outcomeHash: outcome ? item.outcome.hash : null,
          comparison,
          politicalEvidence,
        }),
        proposalHash: item.hash,
        outcomeHash: outcome ? item.outcome.hash : null,
        rows,
        facts,
        beforeLabel: outcome
          ? 'Regjeringens budsjettforslag'
          : item.phase === 'revised'
            ? 'Vedtatt budsjett før RNB-forslaget'
            : `Saldert budsjett ${baseYear}`,
        afterLabel: outcome
          ? item.phase === 'initial'
            ? 'Vedtatt saldert budsjett'
            : 'Bekreftet revidert budsjett'
          : item.phase === 'revised'
            ? 'Forslag til revidert nasjonalbudsjett'
            : 'Regjeringens budsjettforslag',
        sources: [
          {
            name: 'Regjeringens tallgrunnlag (Gul bok)',
            url: proposal.source.url,
            description:
              'Offisiell Excel-fil. Forslaget er arkivert med original kildefil og SHA-256.',
          },
          {
            name: 'Regjeringens budsjettdokumenter',
            url: proposal.source.landing ?? proposal.source.page,
            description: 'Offisielle budsjettdokumenter og begrunnelser for foreslåtte tiltak.',
          },
          {
            name: 'DFØ Statsregnskapet',
            url: 'https://statsregnskapet.dfo.no',
            description: outcome
              ? 'Frosset vedtatt budsjett etter at DFØ-data ble tilgjengelige.'
              : 'Forrige års salderte budsjett fra nettstedets kontrollerte DFØ-uttrekk.',
          },
          ...politicalEvidence.map((e) => ({
            name: 'Dokumentert parlamentarisk behandling',
            url: e.url,
            description:
              'Arkivert kildetekst og kontrollert sitat knyttet til konkrete budsjettposter.',
          })),
        ],
        methodology: [
          'Kapittel og post er sammenligningsnøkkelen, uavhengig av hvilket departement posten tilhører.',
          'Utgiftsposter uten finansposter og overføringer til Statens pensjonsfond utland; beløp i løpende mill. kroner.',
          'Forslag, saldert budsjett og revidert budsjett holdes atskilt. Ingen fremtidige KPI-er eller folketall er fremstilt som faktiske verdier.',
        ],
        limitations: [
          'Endret postinndeling, flyttinger og engangsbevilgninger kan påvirke sammenligningen; tallforskjeller er ikke i seg selv årsaksforklaringer.',
          'Manglende post i et uttrekk gir null i sammenligningen og må undersøkes mot budsjettdokumentene. Nettstedets eldre budsjettall er avrundet til en tidel million kroner.',
          'Partiers gjennomslag krever dokumentert kobling til budsjettavtale, innstilling eller vedtak. En stemme for budsjettet dokumenterer støtte, ikke nødvendigvis eierskap til en endring.',
        ],
        politicalEvidence,
      }
    }
  }
  return null
}
export function validateBudgetReport(r) {
  if (
    !['previous-budget-to-proposal', 'proposal-to-adopted-budget'].includes(r.comparison) ||
    !['initial', 'revised'].includes(r.phase) ||
    !Number.isSafeInteger(r.year) ||
    r.end !== r.year ||
    !Array.isArray(r.rows) ||
    !r.rows.length
  )
    throw Error('Ugyldig budsjettavgrensning')
  const ids = new Set()
  for (const row of r.rows) {
    if (
      ids.has(row.id) ||
      !/^\d{4}-\d{2}$/.test(row.id) ||
      !row.name ||
      !row.departmentName ||
      ![row.before, row.after, row.change].every(Number.isFinite) ||
      Math.abs(row.change - (row.after - row.before)) > 1e-7
    )
      throw Error('Budsjettpostene samsvarer ikke med regnestykket')
    ids.add(row.id)
  }
  if (
    JSON.stringify(r.facts) !==
    JSON.stringify(budgetFacts(r.rows, r.year, r.start, r.politicalEvidence ?? []))
  )
    throw Error('Budsjettfakta samsvarer ikke med datagrunnlaget')
  if (
    !/^[a-f0-9]{64}$/.test(r.proposalHash) ||
    (r.comparison === 'proposal-to-adopted-budget' && !/^[a-f0-9]{64}$/.test(r.outcomeHash ?? ''))
  )
    throw Error('Budsjettets arkivversjon mangler')
  if (
    r.start !==
      (r.comparison === 'proposal-to-adopted-budget' || r.phase === 'revised'
        ? r.year
        : r.year - 1) ||
    r.dataHash !==
      hash({
        rows: r.rows,
        proposalHash: r.proposalHash,
        outcomeHash: r.outcomeHash,
        comparison: r.comparison,
        politicalEvidence: r.politicalEvidence ?? [],
      })
  )
    throw Error('Budsjettets periode eller datagrunnlag er endret')
  for (const evidence of r.politicalEvidence ?? []) {
    if (
      !['agreement', 'committee-recommendation', 'vote', 'adopted-amendment'].includes(
        evidence.kind,
      ) ||
      !/^https:\/\/(?:www\.regjeringen\.no|www\.stortinget\.no)\//.test(evidence.url) ||
      !/^[a-f0-9]{64}$/.test(evidence.sourceHash) ||
      !evidence.quote ||
      !evidence.parties?.length ||
      !evidence.recordKeys?.length ||
      evidence.recordKeys.some((key) => !ids.has(key))
    )
      throw Error('Politisk gjennomslag mangler kontrollert dokumentasjon')
  }
  return r
}
