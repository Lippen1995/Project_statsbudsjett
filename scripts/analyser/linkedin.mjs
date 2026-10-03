import { validateArticle, contentHash } from './schema.mjs'
import { factText } from '../../web/src/analyser/model.js'
export function linkedInPayload(article, organizationId) {
  validateArticle(article, { published: true })
  if (!/^\d+$/.test(organizationId ?? ''))
    throw Error('LINKEDIN_ORGANIZATION_ID må være den faktiske LinkedIn-sidens ID')
  return {
    author: `urn:li:organization:${organizationId}`,
    commentary: `${factText(article.copy.linkedin, article.report)}\n\nhttps://fellestall.no/analyser/${article.slug}/`,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
}
export function assertLiveVersion(article, live) {
  validateArticle(article, { published: true })
  if (
    live?.contentHash !== contentHash(article) ||
    JSON.stringify(live.report) !== JSON.stringify(article.report)
  )
    throw Error('Den eksakte godkjente analysesiden er ikke tilgjengelig ennå')
}
export function assertUnsent(receipts, article) {
  const existing = receipts.find((r) => r.contentHash === contentHash(article))
  if (existing)
    throw Error(
      existing.status === 'sent'
        ? 'Innlegget er allerede publisert'
        : 'Et publiseringsforsøk er registrert. Kontroller LinkedIn før eventuell ny sending; automatisk gjentakelse er blokkert',
    )
}
