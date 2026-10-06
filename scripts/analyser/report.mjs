import { attachSsbEvidence } from './ssb-research.mjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { calculateFacts } from './facts.mjs'
import { selectEventEvidence, eventEvidenceFacts } from './event-evidence.mjs'
import { topicKey } from '../../web/src/analyser/topics.js'

export function buildReport(dataDir, { start, end, departmentId = null, question } = {}) {
  const names = ['meta', 'utgifter', 'befolkning', 'kpi']
  const raw = Object.fromEntries(
    names.map((n) => [n, readFileSync(`${dataDir}/${n}.json`, 'utf8')]),
  )
  const data = Object.fromEntries(names.map((n) => [n, JSON.parse(raw[n])]))
  const years = data.meta.regnskap_aar
  start ??= years[0]
  end ??= years.at(-1)
  if (!years.includes(start) || !years.includes(end) || end <= start)
    throw Error('Ugyldig regnskapsperiode')
  const nodes = departmentId ? data.utgifter.filter((n) => n.id === departmentId) : data.utgifter
  if (!nodes.length) throw Error('Ukjent departement')
  const scopeName = departmentId ? nodes[0].navn : 'Staten'
  const sum = (node, year) => {
    if (node.fin || node.transfer) return 0
    if (node.children?.length) return node.children.reduce((s, n) => s + sum(n, year), 0)
    const v = node.serier?.[year]?.regnskap
    // Poster som ikke eksisterte i et år har null/ingen serie. De bidrar ikke
    // til summen; dette er samme avgrensning som forsiden, ikke en estimert post.
    if (v == null) return 0
    if (!Number.isFinite(v)) throw Error(`Ugyldig regnskap for ${node.id} i ${year}`)
    return v
  }
  const rows = years
    .filter((y) => y >= start && y <= end)
    .map((year) => {
      const population = data.befolkning[year],
        cpi = data.kpi[year]
      if (!(population > 0) || !(cpi > 0)) throw Error(`Mangler befolkning eller KPI for ${year}`)
      const expenditure = nodes.reduce((s, n) => s + sum(n, year), 0)
      if (!(expenditure > 0)) throw Error(`Ingen utgifter for ${year}`)
      return {
        year,
        expenditure,
        population,
        cpi,
        perCapita: (expenditure * 1e6) / population,
      }
    })
  if (rows.length !== end - start + 1) throw Error('Brudd i tidsserien')
  const first = rows[0],
    last = rows.at(-1)
  const eventEvidence = selectEventEvidence(nodes, rows)
  topicKey({
    kind: 'real-expenditure-per-capita',
    scopeId: departmentId ?? 'state',
    question,
    eventEvidence,
  })
  const facts = {
    ...calculateFacts(first, last, rows),
    ...eventEvidenceFacts(eventEvidence, rows),
  }
  return attachSsbEvidence(dataDir, {
    kind: 'real-expenditure-per-capita',
    factsVersion: 2,
    scopeId: departmentId ?? 'state',
    scopeName,
    ...(question ? { question } : {}),
    start,
    end,
    dataUpdated: data.meta.oppdatert,
    dataHash: createHash('sha256')
      .update(names.map((n) => raw[n]).join('\n'))
      .digest('hex'),
    facts,
    ...(eventEvidence ? { eventEvidence } : {}),
    rows: rows.map((r) => ({
      ...r,
      nominalIndex: (r.perCapita / first.perCapita) * 100,
      priceIndex: (r.cpi / first.cpi) * 100,
      realPerCapita: (r.perCapita * last.cpi) / r.cpi,
    })),
    sources: [
      ...(eventEvidence
        ? [
            {
              name: 'Fellestall: de konkrete regnskapspostene',
              url: 'https://fellestall.no/data/utgifter.json',
              local: '/data/utgifter.json',
              description:
                'Hendelseseksemplene er valgt fra samme DFØ-uttrekk som hovedserien. Navn, post-ID-er og årlige beløp er frosset i artikkelens datagrunnlag. Utvalget er ikke et fullstendig koronaregnskap eller en årsaksfordeling av hele veksten.',
            },
          ]
        : []),
      {
        name: 'DFØ Statsregnskapet',
        url: 'https://statsregnskapet.dfo.no',
        local: '/data/utgifter.json',
        description:
          'Regnskapsførte utgifter i mill. kroner. Finansposter og SPU-overføringer er utelatt.',
      },
      {
        name: 'SSB folkemengde, tabell 07459',
        url: 'https://www.ssb.no/statbank/table/07459/',
        local: '/data/befolkning.json',
        description: 'Folkemengde ved inngangen til året, som i resten av Fellestall.',
      },
      {
        name: 'SSB konsumprisindeks',
        url: 'https://www.ssb.no/priser-og-prisindekser/konsumpriser/statistikk/konsumprisindeksen',
        local: '/data/kpi.json',
        description: 'Årsgjennomsnitt for KPI, fra Fellestalls normaliserte serie.',
      },
    ],
    methodology: [
      ...(eventEvidence
        ? [
            'Hendelsesgrunnlaget følger et lite, redaksjonelt valgt utvalg regnskapsposter. Beløpene er i løpende mill. kroner; eventuelle KPI-justerte endringer per innbygger bruker samme folketall og prisserie som hovedanalysen. En post uten regnskapsføring i uttrekket er merket som ikke observert, ikke som et komplett mål på alle utgifter til formålet. Postene identifiseres med navn og ID.',
          ]
        : []),
      `Vi summerer regnskapsførte utgifter på postnivå for ${scopeName}. Finansposter og overføringer til Statens pensjonsfond utland utelates, med samme filtre som standardvisningen på forsiden. Poster uten regnskapsføring i et år bidrar ikke til summen.`,
      'Kroner per innbygger = utgifter i mill. kr × en million / folkemengden ved inngangen til året.',
      'Faste kroner = løpende kroner per innbygger × KPI i sluttåret / KPI i det aktuelle året. Realvekst = sluttverdi i faste kroner / startverdi i faste kroner − én.',
      'Vekstsammenligningen viser samme regnskap i løpende kroner, per innbygger og KPI-justert per innbygger. Prosentene er alternative mål, ikke bidrag som kan legges sammen eller trekkes direkte fra hverandre.',
      'Nivågrafen viser KPI-justerte kroner per innbygger i sluttårets priser. Grafen for årlige endringer sammenligner hvert år med året før, etter justering for folketall og KPI. Året med størst endring velges etter absolutt prosentendring, uavhengig av fortegn.',
    ],
    limitations: [
      ...(departmentId
        ? [
            'Departementenes ansvarsområder kan endres over tid. Serien følger Fellestalls normaliserte departementsinndeling, og må ikke alene tolkes som vekst i identiske tjenester.',
          ]
        : []),
      'KPI måler husholdningenes konsumpriser, ikke statens lønns-, bygge- eller innkjøpskostnader. KPI-justering er et sammenligningsmål, ikke et mål på produksjonsvolum.',
      'Utgifter sier ikke hvor mye eller hvor god tjenesteproduksjon innbyggerne får. Overføringer, pensjoner og tilskudd inngår også.',
      'Tallene identifiserer ikke årsakene til endringene. De kan ikke alene brukes til å konkludere om effektivitet, sløsing eller virkningen av politiske beslutninger.',
      'Befolkningsjustering tar ikke hensyn til alderssammensetning. Regnskap sammenlignes med regnskap; framtidige budsjetter er ikke blandet inn.',
      'Artikkelen har et frosset datagrunnlag. Senere korrigeringer i kildene endrer ikke automatisk en allerede godkjent analyse.',
    ],
  })
}
