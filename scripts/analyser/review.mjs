import { validateArticle, contentHash } from './schema.mjs'
export function isDesignatedReviewer(login, configuredReviewer) {
  return (
    typeof login === 'string' &&
    typeof configuredReviewer === 'string' &&
    configuredReviewer.trim().length > 0 &&
    login.toLowerCase() === configuredReviewer.trim().toLowerCase()
  )
}

export function assertDesignatedReviewer(login, configuredReviewer) {
  if (!isDesignatedReviewer(login, configuredReviewer))
    throw Error('Bare den nåværende ansvarlige godkjenneren kan godkjenne publisering')
}

export function reviseArticle(article, copy, { feedbackId, feedbackAt, generatedAt }) {
  validateArticle(article)
  const next = {
    ...article,
    copy,
    status: 'draft',
    generatedAt,
    lastFeedbackId: feedbackId,
    lastFeedbackAt: feedbackAt,
  }
  delete next.approval
  delete next.publishedAt
  return validateArticle(next)
}
export function approveArticle(
  article,
  { reviewer, commitId, currentHead, approvedAt, pendingFeedback = false },
) {
  validateArticle(article)
  if (!reviewer || !commitId || commitId !== currentHead)
    throw Error('Godkjenningen gjelder ikke gjeldende versjon')
  if (pendingFeedback) throw Error('Endringsønsker må behandles før godkjenning')
  const approved = {
    ...article,
    status: 'published',
    publishedAt: approvedAt,
    approval: { reviewer, approvedAt, commitId, contentHash: contentHash(article) },
  }
  return validateArticle(approved, { published: true })
}
export function assertReviewBranch(pr, repository) {
  if (
    pr.state !== 'open' ||
    pr.head.repo?.full_name !== repository ||
    !/^analysis\/weekly-[a-z0-9-]+$/.test(pr.head.ref) ||
    pr.base.ref !== 'main'
  )
    throw Error('Uventet gjennomgangsgren')
}

export function assertActiveApproval(reviews, eventReview, currentHead) {
  const review = reviews.find((r) => r.id === eventReview.id)
  if (!review || review.state.toUpperCase() !== 'APPROVED' || review.commit_id !== currentHead)
    throw Error('Godkjenningen er trukket tilbake eller gjelder ikke gjeldende versjon')
  const latestByReviewer = new Map()
  for (const item of [...reviews].sort((a, b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(item.state.toUpperCase()))
      latestByReviewer.set(item.user.login, item)
  }
  if ([...latestByReviewer.values()].some((r) => r.state.toUpperCase() === 'CHANGES_REQUESTED'))
    throw Error('En gjennomgang ber fortsatt om endringer; ny godkjenning kreves')
}
