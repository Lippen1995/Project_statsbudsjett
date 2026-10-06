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

export function observationSuffix(index) {
  let result = ''
  do {
    result = String.fromCharCode(65 + (index % 26)) + result
    index = Math.floor(index / 26) - 1
  } while (index >= 0)
  return result
}

export function validateDetailSelections(detailSelections) {
  if (detailSelections === undefined) return
  if (!Array.isArray(detailSelections) || !detailSelections.length || detailSelections.length > 12)
    throw Error('Velg én til tolv konkrete postutvalg')
  const ids = new Set()
  for (const s of detailSelections) {
    if (
      !s ||
      Object.keys(s).some((k) => !['id', 'nodeIds'].includes(k)) ||
      !/^[a-z]{1,24}$/.test(s.id ?? '') ||
      ids.has(s.id) ||
      selections.some((x) => x.id === s.id) ||
      !Array.isArray(s.nodeIds) ||
      !s.nodeIds.length ||
      s.nodeIds.length > 8 ||
      s.nodeIds.some(
        (id) => typeof id !== 'string' || !/^u-\d{2}(?:-\d{4}(?:-\d{2})?)?$/.test(id),
      ) ||
      new Set(s.nodeIds).size !== s.nodeIds.length ||
      s.nodeIds.some((a) => s.nodeIds.some((b) => b !== a && b.startsWith(a + '-')))
    )
      throw Error('Ugyldig postutvalg eller overlappende kapittel og post')
    ids.add(s.id)
  }
}

export function selectEventEvidence(nodes, rows, { detailSelections } = {}) {
  validateDetailSelections(detailSelections)
  const index = new Map()
  const parents = new Map()
  const visit = (node) => {
    if (node.fin || node.transfer) return
    index.set(node.id, node)
    node.children?.forEach((child) => {
      parents.set(child.id, node.navn)
      visit(child)
    })
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
  const details = (detailSelections ?? []).map((s) => {
    if (s.nodeIds.some((id) => !index.has(id)))
      throw Error('Postutvalget finnes ikke innenfor analysens avgrensning')
    return {
      ...s,
      title: s.nodeIds
        .map((id) => {
          const node = index.get(id)
          return node.children?.length ? node.navn : `${node.navn} (${parents.get(id)})`
        })
        .join(' + '),
      event: 'Postvis regnskapssammenligning',
      context:
        'Beløpene følger de oppgitte post-ID-ene i uttrekket. Et utvalg med flere poster summeres uten å dobbelttelle kapittel og underpost. Flytting mellom andre poster og endrede formål må vurderes særskilt.',
    }
  })
  const items = [...selections, ...details]
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
  if (details.some((s) => !items.some((i) => i.id === s.id)))
    throw Error('Postutvalget mangler observerte regnskapsverdier')
  return items.length
    ? { version: detailSelections ? 2 : 1, items, hash: evidenceHash(items) }
    : undefined
}

export function validateEventEvidence(evidence, rows, scopeId) {
  if (evidence === undefined) return
  if (
    ![1, 2].includes(evidence?.version) ||
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
          (scopeId !== 'state' && node.id !== scopeId && !node.id.startsWith(scopeId + '-')),
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
    if (evidence.version === 2) {
      for (const [i, row] of item.rows.entries()) {
        const suffix = observationSuffix(i)
        add('Year' + suffix, row.year, String(row.year), 'regnskapsår')
        if (row.reported)
          add(
            'Amount' + suffix,
            row.expenditure,
            amount(row.expenditure),
            `løpende beløp, ${row.year}`,
          )
      }
      add(
        'FirstRecordedAmount',
        firstRecorded.expenditure,
        amount(firstRecorded.expenditure),
        'første observerte beløp på postutvalget',
      )
      if (last.reported) {
        const change = last.expenditure - firstRecorded.expenditure
        add(
          'ChangeSinceFirst',
          change,
          amount(change),
          'beløpsendring fra første observerte år, ikke en årsaksandel',
        )
        if (firstRecorded.expenditure > 0)
          add(
            'GrowthSinceFirst',
            (change / firstRecorded.expenditure) * 100,
            `${number((change / firstRecorded.expenditure) * 100)} %`,
            'prosentvis endring fra første observerte år',
          )
        const contribution = last.expenditure - item.rows[0].expenditure
        add(
          'ContributionAmount',
          contribution,
          amount(contribution),
          'bokført bidrag til totalendringen; ikke-observert startpost bidrar ikke til startsummen',
        )
        const totalChange = rows.at(-1).expenditure - rows[0].expenditure
        if (totalChange !== 0)
          add(
            'NetChangeRatio',
            (contribution / totalChange) * 100,
            `${number((contribution / totalChange) * 100)} %`,
            'postens bokførte endring delt på nettoendringen i totalen; ikke årsaksandel',
          )
        add(
          'ChangeFromPeak',
          last.expenditure - peak.expenditure,
          amount(last.expenditure - peak.expenditure),
          'beløpsendring fra høyeste observerte år',
        )
        if (peak.expenditure > 0)
          add(
            'GrowthFromPeak',
            (last.expenditure / peak.expenditure - 1) * 100,
            `${number((last.expenditure / peak.expenditure - 1) * 100)} %`,
            'prosentvis endring fra høyeste observerte år',
          )
        const previous = item.rows.at(-2)
        if (previous?.reported) {
          add(
            'LastAnnualChangeAmount',
            last.expenditure - previous.expenditure,
            amount(last.expenditure - previous.expenditure),
            'beløpsendring mellom de siste to regnskapsårene',
          )
          if (previous.expenditure > 0)
            add(
              'GrowthLastYear',
              (last.expenditure / previous.expenditure - 1) * 100,
              `${number((last.expenditure / previous.expenditure - 1) * 100)} %`,
              'prosentvis endring mellom de siste to regnskapsårene',
            )
        }
      }
    }
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
