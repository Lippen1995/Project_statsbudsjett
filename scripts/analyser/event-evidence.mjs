import { createHash } from 'node:crypto'

// Selected accounting examples, not a complete pandemic or war account.
const selections = [
  {
    id: 'dagpenger',
    title: 'Dagpenger',
    event: 'Koronapandemien og årene etter nedstengingene',
    context:
      'Pandemien er bakgrunn for å undersøke inntektsstøtte og permitteringer. Dagpengeposten omfatter også ordinær arbeidsledighet og kan ikke i sin helhet merkes som koronastøtte.',
    nodeIds: ['u-06-2541-70'],
  },
  {
    id: 'koronakompensasjon',
    title: 'Midlertidig koronakompensasjon til foretak, én post',
    event: 'Koronapandemien og midlertidige støtteordninger',
    context:
      'Postnavnet knytter ordningen uttrykkelig til omsetningsfall som følge av koronapandemien. Denne posten alene dekker ikke alle koronaordninger eller tidligere føring på andre poster.',
    nodeIds: ['u-09-0900-85'],
  },
  {
    id: 'ukrainastotte',
    title: 'Militær støtte til Ukraina, én post',
    event: 'Krigen i Ukraina og nye støtteutgifter',
    context:
      'Posten viser bokført militær støtte til Ukraina. Den er et konkret eksempel på andre utgifter etter pandemispranget, ikke et mål på all norsk støtte til Ukraina eller alle forsvarsutgifter.',
    nodeIds: ['u-17-1700-79'],
  },
  {
    id: 'alderspensjon',
    title: 'Pensjonskapitlet Alderdom',
    event: 'Løpende pensjonsutgifter',
    context:
      'Kapitlet gir et eksempel på løpende utgifter ved siden av krisetiltakene. Regnskapet alene skiller ikke virkningen av flere mottakere, regulering eller regelendringer.',
    nodeIds: ['u-06-2670'],
  },
]

export const evidenceHash = (items) =>
  createHash('sha256').update(JSON.stringify(items)).digest('hex')

export function selectEventEvidence(nodes, rows) {
  const index = new Map()
  const visit = (node) => {
    if (node.fin || node.transfer) return
    index.set(node.id, node)
    node.children?.forEach(visit)
  }
  nodes.forEach(visit)
  const sum = (node, year) => {
    if (node.fin || node.transfer) return 0
    if (node.children?.length)
      return node.children.reduce((value, child) => value + sum(child, year), 0)
    const value = node.serier?.[year]?.regnskap
    if (value == null) return 0
    if (!Number.isFinite(value)) throw Error('Ugyldig hendelsesgrunnlag')
    return value
  }
  const reported = (node, year) =>
    node.children?.length
      ? node.children.some((child) => !child.fin && !child.transfer && reported(child, year))
      : node.serier?.[year]?.regnskap != null
  const items = selections
    .filter((selection) => selection.nodeIds.every((id) => index.has(id)))
    .map((selection) => ({
      ...selection,
      basis:
        'Postnavn og bokførte beløp i Fellestalls DFØ-uttrekk; historisk bakgrunn er ikke en beregnet årsaksandel.',
      nodes: selection.nodeIds.map((id) => ({ id, name: index.get(id).navn })),
      rows: rows.map((row) => ({
        year: row.year,
        expenditure: selection.nodeIds.reduce(
          (value, id) => value + sum(index.get(id), row.year),
          0,
        ),
        reported: selection.nodeIds.some((id) => reported(index.get(id), row.year)),
      })),
    }))
    .filter((item) => item.rows.some((row) => row.reported))
  return items.length ? { version: 1, items, hash: evidenceHash(items) } : undefined
}

export function validateEventEvidence(evidence, rows, scopeId) {
  if (evidence === undefined) return
  if (
    evidence?.version !== 1 ||
    !Array.isArray(evidence.items) ||
    !evidence.items.length ||
    evidence.hash !== evidenceHash(evidence.items)
  )
    throw Error('Ugyldig eller endret hendelsesgrunnlag')
  const ids = new Set()
  for (const item of evidence.items) {
    if (
      !/^[a-z]+$/.test(item.id) ||
      ids.has(item.id) ||
      ['title', 'event', 'context', 'basis'].some(
        (key) => typeof item[key] !== 'string' || !item[key].trim(),
      )
    )
      throw Error('Ugyldig hendelsesbeskrivelse')
    ids.add(item.id)
    if (
      !Array.isArray(item.nodeIds) ||
      !item.nodeIds.length ||
      new Set(item.nodeIds).size !== item.nodeIds.length ||
      !Array.isArray(item.nodes) ||
      item.nodes.length !== item.nodeIds.length ||
      item.nodes.some(
        (node, i) =>
          node.id !== item.nodeIds[i] ||
          !node.name ||
          (scopeId !== 'state' && !node.id.startsWith(scopeId + '-')),
      )
    )
      throw Error('Hendelsesgrunnlaget har feil avgrensning')
    if (
      !Array.isArray(item.rows) ||
      item.rows.length !== rows.length ||
      !item.rows.some((row) => row.reported) ||
      item.rows.some(
        (row, i) =>
          row.year !== rows[i].year ||
          !Number.isFinite(row.expenditure) ||
          typeof row.reported !== 'boolean' ||
          (!row.reported && row.expenditure !== 0),
      )
    )
      throw Error('Ufullstendig hendelsesserie')
  }
}

export function eventEvidenceFacts(evidence, rows) {
  if (!evidence) return {}
  const number = (value, digits = 1) =>
    new Intl.NumberFormat('nb-NO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  const facts = {}
  const amount = (value) =>
    Math.abs(value) >= 1000 ? `${number(value / 1000)} mrd. kr` : `${number(value)} mill. kr`
  for (const item of evidence.items) {
    const last = item.rows.at(-1)
    const reportedRows = item.rows.filter((row) => row.reported)
    const peak = reportedRows.reduce(
      (best, row) => (row.expenditure > best.expenditure ? row : best),
      reportedRows[0],
    )
    const firstRecorded = reportedRows[0]
    const reference = item.rows.find((row) => row.year === 2020) ?? item.rows[0]
    const add = (suffix, value, text, label) => {
      facts[item.id + suffix] = {
        value,
        text,
        label: `${item.title}: ${label}`,
      }
    }
    add('PeakYear', peak.year, String(peak.year), 'år med høyeste løpende beløp i perioden')
    add(
      'PeakAmount',
      peak.expenditure,
      amount(peak.expenditure),
      `høyeste løpende beløp, ${peak.year}`,
    )
    if (last.reported)
      add('LastAmount', last.expenditure, amount(last.expenditure), `løpende beløp, ${last.year}`)
    add('ReferenceYear', reference.year, String(reference.year), 'sammenligningsår')
    if (reference.reported)
      add(
        'ReferenceAmount',
        reference.expenditure,
        amount(reference.expenditure),
        `løpende beløp, ${reference.year}`,
      )
    if (firstRecorded)
      add(
        'FirstRecordedYear',
        firstRecorded.year,
        String(firstRecorded.year),
        'første år med regnskapsføring på denne posten i perioden',
      )
    if (reference.reported && last.reported && reference.expenditure > 0 && last.expenditure >= 0) {
      const base = rows.find((row) => row.year === reference.year)
      const end = rows.at(-1)
      const growth =
        ((last.expenditure / end.population / (reference.expenditure / base.population)) *
          (base.cpi / end.cpi) -
          1) *
        100
      add(
        'RealGrowthSinceReference',
        growth,
        `${number(growth)} %`,
        `KPI-justert endring per innbygger, ${reference.year}–${last.year}`,
      )
    }
  }
  return facts
}
