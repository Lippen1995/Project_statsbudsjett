import { attachSsbEvidence, ssbEvidenceFacts } from './ssb-research.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { number } from '../../web/src/analyser/model.js'
import { loadPriorities, validatePriorities, priorityFacts } from './party-priorities.mjs'
import { loadBudgetDocuments, budgetDocumentFacts, validateBudgetDocuments } from './budget-documents.mjs'
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
export function budgetFacts(rows, year, baseYear, evidence = [], version = 1) {
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
    for (const [i, row] of values.slice(0, version === 2 ? 26 : 6).entries()) {
      const key = prefix + String.fromCharCode(65 + i)
      facts[key + 'Name'] = fact(0, row.name, 'Konkret budsjettpost')
      facts[key + 'Amount'] = fact(
        row.change,
        `${number(row.change, 1)} mill. kr`,
        'Endring på posten',
      )
    }
  }
  if (version === 2) {
    const departments = [...new Set(rows.map((r) => r.department))].sort()
    for (const [i, id] of departments.entries()) {
      const selected = rows.filter((r) => r.department === id)
      const prefix = 'department' + String.fromCharCode(65 + i)
      facts[prefix + 'Name'] = fact(0, selected[0].departmentName, 'Departement i forslaget')
      for (const [suffix, value] of [
        ['Before', selected.reduce((s, r) => s + r.before, 0)],
        ['After', selected.reduce((s, r) => s + r.after, 0)],
        ['Change', selected.reduce((s, r) => s + r.change, 0)],
      ]) facts[prefix + suffix] = fact(value, `${number(value / 1000, 1)} mrd. kr`, 'Departementsbeløp, løpende kroner')
    }
    const groups = {
      pension: (r) => r.id.startsWith('2670-'),
      hospitalBase: (r) => ['0732-72', '0732-73', '0732-74', '0732-75'].includes(r.id),
      hospitalActivity: (r) => r.id === '0732-76',
      hospitalSpecial: (r) => r.id === '0732-70',
      hospitalTotal: (r) => r.id.startsWith('0732-'),
      ukraineMilitary: (r) => r.id.startsWith('1750-'),
      electricity: (r) => ['1820-75', '1820-77'].includes(r.id),
      enova: (r) => r.id === '1428-50',
      integration: (r) => r.id === '0671-60',
      sickness: (r) => r.id === '2650-70',
      disability: (r) => r.id === '2655-70',
      workAssessment: (r) => r.id === '2651-70',
      interest: (r) => r.id === '1650-89',
      parental: (r) => r.id === '2530-70',
      railInvestment: (r) => r.id === '1352-73',
      railRenewal: (r) => r.id === '1352-72',
      avinor: (r) => r.id === '1315-71',
    }
    for (const [prefix, select] of Object.entries(groups)) {
      const selected = rows.filter(select)
      const a = selected.reduce((s, r) => s + r.before, 0)
      const b = selected.reduce((s, r) => s + r.after, 0)
      for (const [suffix, value] of [['Before', a], ['After', b], ['Change', b - a]])
        facts[prefix + suffix] = fact(value, `${number(value / 1000, 1)} mrd. kr`, 'Kontrollert postgruppe, løpende kroner')
    }
    const mainChange = rows.filter((r) => ['06', '07', '17'].includes(r.department)).reduce((s, r) => s + r.change, 0)
    facts.mainChange = fact(mainChange, `${number(mainChange / 1000, 1)} mrd. kr`, 'Netto endring i arbeid, helse og forsvar')
    if (after !== before) facts.mainChangeShare = fact(mainChange / (after - before) * 100, `${number(mainChange / (after - before) * 100, 1)} %`, 'Andel av netto samlet endring, ikke årsaksandel')
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
export function nextBudgetReport(dataDir, published, { eligible = () => true, baselineSeries = 'saldert' } = {}) {
  if (!['saldert', 'revidert'].includes(baselineSeries)) throw Error('Ukjent budsjettgrunnlag')
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
          : siteRecords(dataDir, baseYear, baselineSeries)
      if (!before.some(included)) continue
      const after = outcome ? outcome.records : proposal.records
      const rows = compareBudgetRecords(before, after)
      const comparison = outcome ? 'proposal-to-adopted-budget' : 'previous-budget-to-proposal'
      const revisedComparison = baselineSeries === 'revidert' && !outcome && item.phase === 'initial'
      const baseline = revisedComparison ? { baselineSeries, factsVersion: 2, baselineUpdated: meta.oppdatert } : {}
      const partyPriorities = loadPriorities(dataDir, item.year, item.phase, rows)
      const budgetDocuments = revisedComparison
        ? loadBudgetDocuments(dataDir, item.year) : undefined
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
      const facts = {
        ...budgetFacts(rows, item.year, baseYear, politicalEvidence, revisedComparison ? 2 : 1),
        ...priorityFacts(partyPriorities),
        ...budgetDocumentFacts(budgetDocuments),
      }
      const report = attachSsbEvidence(dataDir, {
        kind: 'budget-comparison',
        comparison,
        ...baseline,
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
          ...baseline,
          politicalEvidence,
          ...(partyPriorities ? { partyPriorities } : {}),
          ...(budgetDocuments ? { budgetDocuments } : {}),
        }),
        proposalHash: item.hash,
        outcomeHash: outcome ? item.outcome.hash : null,
        rows,
        facts,
        beforeLabel: outcome
          ? 'Regjeringens budsjettforslag'
          : item.phase === 'revised'
            ? 'Vedtatt budsjett før RNB-forslaget'
            : `${baselineSeries === 'revidert' ? 'Revidert' : 'Saldert'} budsjett ${baseYear}`,
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
              : baselineSeries === 'revidert'
                ? 'Forrige års løpende reviderte budsjett fra DFØ. Inkluderer registrerte endringsvedtak; ikke et særskilt frosset RNB-vedtak.'
                : 'Forrige års salderte budsjett fra nettstedets kontrollerte DFØ-uttrekk.',
          },
          ...politicalEvidence.map((e) => ({
            name: 'Dokumentert parlamentarisk behandling',
            url: e.url,
            description:
              'Arkivert kildetekst og kontrollert sitat knyttet til konkrete budsjettposter.',
          })),
          ...(partyPriorities ?? []).map((p) => ({
            name: `Partikilde: ${p.party} – ${p.id}`,
            url: p.url,
            description: `Originalkilde og kontrollert sitat. ${p.sourceDate ? 'Publisert ' + p.sourceDate + '. ' : 'Publiseringsdato er ikke bekreftet. '}${p.period ? 'Programperiode ' + p.period.join('–') + '. ' : p.referenceYear ? 'Opprinnelig budsjettår ' + p.referenceYear + '. ' : ''}Hentet ${p.retrievedAt}. Prioritering dokumenterer ikke forhandlingsgjennomslag.`,
          })),
          ...(budgetDocuments ?? []).filter((d, i, all) => all.findIndex((other) => other.url === d.url) === i).map((d) => ({ name: d.name, url: d.url,
            description: `Lest primærkilde, hentet ${d.retrievedAt}. Utvalgte kildeutdrag er frosset med SHA-256. Linjebryting og delte ord fra PDF er normalisert.` })),
        ],
        methodology: [
          'Kapittel og post er sammenligningsnøkkelen, uavhengig av hvilket departement posten tilhører.',
          'Utgiftsposter uten finansposter og overføringer til Statens pensjonsfond utland; beløp i løpende mill. kroner.',
          'Forslag, saldert budsjett og revidert budsjett holdes atskilt. Ingen fremtidige KPI-er eller folketall er fremstilt som faktiske verdier.',
        ],
        limitations: [
          ...(revisedComparison ? ['Revidert budsjett er DFØs løpende serie: saldert budsjett pluss registrerte endringsvedtak. Det kan omfatte endringer etter vårens RNB. Nasjonalbudsjettets oppdaterte anslag for inneværende år er et annet sammenligningsgrunnlag. Departementsbeløp grupperes etter departementet i forslaget; ansvarsflyttinger må undersøkes.'] : []),
          'Endret postinndeling, flyttinger og engangsbevilgninger kan påvirke sammenligningen; tallforskjeller er ikke i seg selv årsaksforklaringer.',
          'Manglende post i et uttrekk gir null i sammenligningen og må undersøkes mot budsjettdokumentene. Nettstedets eldre budsjettall er avrundet til en tidel million kroner.',
          'Partiers gjennomslag krever dokumentert kobling til budsjettavtale, innstilling eller vedtak. En stemme for budsjettet dokumenterer støtte, ikke nødvendigvis eierskap til en endring.',
        ],
        politicalEvidence,
        ...(partyPriorities ? { partyPriorities } : {}),
        ...(budgetDocuments ? { budgetDocuments } : {}),
      })
      if (eligible(report)) return report
    }
  }
  return null
}
export function validateBudgetReport(r) {
  const baseHash = hash({
    rows: r.rows,
    proposalHash: r.proposalHash,
    outcomeHash: r.outcomeHash,
    comparison: r.comparison,
    ...(r.baselineSeries ? { baselineSeries: r.baselineSeries, factsVersion: r.factsVersion, baselineUpdated: r.baselineUpdated } : {}),
    politicalEvidence: r.politicalEvidence ?? [],
    ...(r.partyPriorities ? { partyPriorities: r.partyPriorities } : {}),
    ...(r.budgetDocuments ? { budgetDocuments: r.budgetDocuments } : {}),
  })
  const expectedHash = r.ssbEvidence ? hash({ base: baseHash, evidence: r.ssbEvidence }) : baseHash
  if (
    (r.baselineSeries !== undefined && (r.baselineSeries !== 'revidert' || r.factsVersion !== 2 || r.phase !== 'initial' || r.comparison !== 'previous-budget-to-proposal')) ||
    (r.factsVersion !== undefined && r.factsVersion !== 2) ||
    (r.factsVersion === 2 && r.baselineSeries !== 'revidert') ||
    (r.baselineSeries && (!Number.isFinite(Date.parse(r.baselineUpdated)) || r.beforeLabel !== `Revidert budsjett ${r.start}`)) ||
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
    JSON.stringify({
      ...budgetFacts(r.rows, r.year, r.start, r.politicalEvidence ?? [], r.factsVersion ?? 1),
      ...priorityFacts(r.partyPriorities),
      ...budgetDocumentFacts(r.budgetDocuments),
      ...ssbEvidenceFacts(r.ssbEvidence),
    })
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
    r.dataHash !== expectedHash
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
  validatePriorities(r.partyPriorities, r.rows)
  validateBudgetDocuments(r.budgetDocuments)
  return r
}
