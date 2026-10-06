import { validateArticle, contentHash } from './schema.mjs'
import { currentAnalyses, topicKey, topicBlocked } from '../../web/src/analyser/topics.js'
import { articleMetadata } from './article-metadata.mjs'
export function replacementSource(published, reference) {
  if (!reference?.slug || !/^[a-f0-9]{64}$/.test(reference.contentHash ?? ''))
    throw Error('Manglende erstatningsgrunnlag')
  const source = currentAnalyses(published).find((a) => a.slug === reference.slug)
  if (!source || contentHash(source) !== reference.contentHash)
    throw Error('Erstatningsgrunnlaget er endret eller allerede erstattet')
  return validateArticle(source, { published: true })
}
export function replacementDraft(source, createdAt) {
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
    report: structuredClone(source.report),
    copy: structuredClone(source.copy),
    replaces: { slug: source.slug, contentHash: digest },
  }
}
export function assertPublicationTopic(article, published) {
  if (article.replaces) {
    const source = replacementSource(published, article.replaces)
    if (topicKey(source.report) !== topicKey(article.report))
      throw Error('Erstatningen må gjelde samme problemstilling')
    if (JSON.stringify(source.report) !== JSON.stringify(article.report))
      throw Error('Erstatningen må beholde det frosne datagrunnlaget')
  } else if (topicBlocked(article.report, published, article.publishedAt))
    throw Error(
      'Samme problemstilling er publisert de siste to årene; bruk en eksplisitt erstatning',
    )
}
