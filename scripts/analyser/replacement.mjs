import { validateArticle, contentHash } from './schema.mjs'
import { currentAnalyses, topicKey, topicBlocked } from '../../web/src/analyser/topics.js'
import { articleMetadata } from './article-metadata.mjs'
import { buildOilReport } from './oil-report.mjs'
import { buildReport } from './report.mjs'
import { evidenceHash, eventEvidenceFacts, validateDetailSelections } from './event-evidence.mjs'

function combinedSelections(source, extra) {
  const result = structuredClone(source.report.detailSelections ?? [])
  for (const selection of extra) {
    const existing = result.find((s) => s.id === selection.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(selection))
      throw Error('Et eksisterende postutvalg kan ikke endre betydning')
    if (!existing) result.push(structuredClone(selection))
  }
  validateDetailSelections(result)
  return result
}

export function replacementReport(source, reference, { dataDir = 'web/public/data' } = {}) {
  if (reference.oilRefresh) {
    if (reference.oilRefresh !== true || reference.detailSelections || source.report.kind !== 'oil-funds') throw Error('Ugyldig oljepengeoppdatering')
    const report = buildOilReport(dataDir, source.report.year)
    if (!report.fullBudget) throw Error('Fullt budsjett mangler')
    return report
  }
  if (!reference.detailSelections) return structuredClone(source.report)
  validateDetailSelections(reference.detailSelections)
  const old = source.report
  if (old.kind !== 'real-expenditure-per-capita')
    throw Error('Postutvidelsen krever en regnskapsanalyse')
  const detailSelections = combinedSelections(source, reference.detailSelections)
  const current = buildReport(dataDir, {
    departmentId: old.scopeId === 'state' ? null : old.scopeId,
    start: old.start,
    end: old.end,
    question: old.question,
    detailSelections,
  })
  if (JSON.stringify(current.rows) !== JSON.stringify(old.rows))
    throw Error('Hovedserien har endret seg; en ren postutvidelse er ikke tillatt')
  const items = structuredClone(old.eventEvidence?.items ?? [])
  for (const selection of detailSelections) {
    if (!items.some((i) => i.id === selection.id))
      items.push(current.eventEvidence.items.find((i) => i.id === selection.id))
  }
  const eventEvidence = { version: 2, items, hash: evidenceHash(items) }
  return {
    ...structuredClone(old),
    detailSelections,
    eventEvidence,
    detailSource: { dataHash: current.dataHash, dataUpdated: current.dataUpdated },
    facts: { ...structuredClone(old.facts), ...eventEvidenceFacts(eventEvidence, old.rows) },
    sources: [
      ...structuredClone(old.sources),
      {
        name: `Fellestall: postgrunnlag ${current.dataHash.slice(0, 8)}`,
        url: 'https://fellestall.no/data/utgifter.json',
        local: '/data/utgifter.json',
        description: `Postutvalget er beregnet fra det versjonerte uttrekket oppdatert ${current.dataUpdated}. Post-ID-er, postnavn, årlige beløp og kildeversjon er bevart i artikkelens datagrunnlag.`,
      },
    ].filter((s, i, all) => all.findIndex((x) => x.name === s.name) === i),
    methodology: [
      ...new Set([
        ...old.methodology.map((m) =>
          m.replace('Grafen for årlige endringer sammenligner', 'Årlige endringer sammenligner'),
        ),
        'Hovedserien og de tidligere faktaene er bevart. Postutvalget beregnes fra det offentlige regnskapsgrunnlaget og godtas bare når årlige totalsummer er identiske med hovedserien. Flere poster i samme utvalg summeres. Overlappende utvalg skal ikke legges sammen. En ikke-observert post er markert som manglende; den bidrar ikke til regnskapssummen, men dette beviser ikke at formålet hadde null utgifter. Forholdet mellom en posts bokførte endring og nettoendringen i totalen er en regnskapsmessig sammenligning, ikke en dokumentert årsaksandel.',
      ]),
    ],
    limitations: [
      ...new Set([
        ...old.limitations,
        'Postnavn og kapittelnavn kan være historiske etiketter i Fellestalls normaliserte serie. Post-ID-er kan også endre innhold over tid. En ny post er ikke automatisk et helt nytt formål, og en post som forsvinner er ikke automatisk et reelt kutt. Omgrupperte drifts- og bistandsposter må derfor vurderes samlet og mot budsjettmaterialet før årsak eller aktivitetsvekst fastslås.',
      ]),
    ],
  }
}
export function replacementSource(published, reference) {
  if (!reference?.slug || !/^[a-f0-9]{64}$/.test(reference.contentHash ?? ''))
    throw Error('Manglende erstatningsgrunnlag')
  const source = currentAnalyses(published).find((a) => a.slug === reference.slug)
  if (!source || contentHash(source) !== reference.contentHash)
    throw Error('Erstatningsgrunnlaget er endret eller allerede erstattet')
  return validateArticle(source, { published: true })
}
export function replacementDraft(source, createdAt, { detailSelections, dataDir, oilRefresh } = {}) {
  validateArticle(source, { published: true })
  const digest = contentHash(source)
  return {
    ...articleMetadata(source.report, createdAt.slice(0, 10)),
    slug:
      articleMetadata(source.report, createdAt.slice(0, 10)).slug +
      '-revision-' +
      digest.slice(0, 8),
    topic: source.topic,
    geography: source.geography,
    type: source.type,
    status: 'draft',
    createdAt,
    generatedAt: createdAt,
    report: replacementReport(source, { detailSelections, oilRefresh }, { dataDir }),
    copy: structuredClone(source.copy),
    replaces: {
      slug: source.slug,
      contentHash: digest,
      ...(detailSelections ? { detailSelections: structuredClone(detailSelections) } : {}),
      ...(oilRefresh ? {oilRefresh: true} : {}),
    },
  }
}
export function assertPublicationTopic(article, published, { dataDir } = {}) {
  if (article.replaces) {
    const source = replacementSource(published, article.replaces)
    if (topicKey(source.report) !== topicKey(article.report))
      throw Error('Erstatningen må gjelde samme problemstilling')
    if (article.replaces.oilRefresh) {
      if (JSON.stringify(article.report) !== JSON.stringify(replacementReport(source, article.replaces, { dataDir }))) throw Error('Oljepengeoppdateringen avviker fra betrodd kildearkiv')
    } else if (article.replaces.detailSelections) {
      const r = article.report
      const extended = [
        'eventEvidence',
        'facts',
        'sources',
        'methodology',
        'limitations',
        'detailSelections',
        'detailSource',
      ]
      if (
        Object.entries(source.report).some(
          ([key, value]) =>
            !extended.includes(key) && JSON.stringify(r[key]) !== JSON.stringify(value),
        ) ||
        Object.entries(source.report.facts).some(
          ([key, value]) => JSON.stringify(r.facts[key]) !== JSON.stringify(value),
        ) ||
        (source.report.eventEvidence?.items ?? []).some(
          (item) =>
            JSON.stringify(r.eventEvidence?.items.find((i) => i.id === item.id)) !==
            JSON.stringify(item),
        ) ||
        JSON.stringify(r.detailSelections) !==
          JSON.stringify(combinedSelections(source, article.replaces.detailSelections)) ||
        !r.detailSource
      )
        throw Error('Postutvidelsen må bevare det frosne hovedgrunnlaget og tidligere fakta')
    } else if (JSON.stringify(source.report) !== JSON.stringify(article.report))
      throw Error('Erstatningen må beholde det frosne datagrunnlaget')
  } else if (topicBlocked(article.report, published, article.publishedAt))
    throw Error(
      'Samme problemstilling er publisert de siste to årene; bruk en eksplisitt erstatning',
    )
}
