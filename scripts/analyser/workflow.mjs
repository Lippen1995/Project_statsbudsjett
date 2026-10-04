import { readFileSync, writeFileSync } from 'node:fs'
import { nextReport } from './candidates.mjs'
import { validateArticle } from './schema.mjs'
import {
  approveArticle,
  assertReviewBranch,
  reviseArticle,
  assertActiveApproval,
  assertDesignatedReviewer,
  isDesignatedReviewer,
} from './review.mjs'
import { renderReview } from './render-review.mjs'
import { factText } from '../../web/src/analyser/model.js'
export async function pendingFeedback(g, number, article) {
  const comments = await g.pages(`/issues/${number}/comments`)
  const reviews = await g.pages(`/pulls/${number}/reviews`)
  const rows = [
    ...comments
      .filter((c) => c.user.type !== 'Bot' && c.body?.trim())
      .map((c) => ({
        id: `comment-${c.id}`,
        user: c.user.login,
        at: c.created_at,
        body: c.body,
      })),
    ...reviews
      .filter(
        (r) =>
          ['CHANGES_REQUESTED', 'COMMENTED'].includes(r.state) &&
          r.body?.trim() &&
          r.user.type !== 'Bot',
      )
      .map((r) => ({
        id: `review-${r.id}`,
        user: r.user.login,
        at: r.submitted_at,
        body: r.body,
      })),
  ]
  const allowed = []
  for (const row of rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
    if (!(article.processedFeedbackIds ?? []).includes(row.id) && (await g.permission(row.user)))
      allowed.push(row)
  return allowed
}

export async function readReviewContext(g, event) {
  const number = event?.issue?.number ?? event?.pull_request?.number
  if (!number) throw Error('Mangler gjennomgangsnummer')
  const pr = await g.api(`${g.root}/pulls/${number}`)
  assertReviewBranch(pr, g.repository)
  const files = await g.pages(`/pulls/${number}/files`)
  if (
    files.length !== 1 ||
    !/^editorial\/drafts\/[a-z0-9-]+\.json$/.test(files[0].filename) ||
    files[0].status !== 'added'
  )
    throw Error('Gjennomgangen inneholder uventede filendringer; automatisk behandling er stoppet')
  const path = files[0].filename
  const file = await g.content(path, pr.head.sha)
  return { number, pr, path, article: validateArticle(file.value) }
}
export async function runWorkflow({
  command,
  event,
  g,
  reviewer,
  generateCopy = async () => {
    throw Error('Tekst må leveres fra den planlagte oppgaven; AI-API er deaktivert')
  },
  expectedHead = null,
  trustedMain = null,
  dataDir = 'web/public/data',
  publicationPath = 'web/src/analyser/publications.json',
  now = () => new Date().toISOString(),
}) {
  const draftPrefix = 'editorial/drafts/'
  const comment = (number, body) =>
    g.api(`${g.root}/issues/${number}/comments`, { method: 'POST', body: { body } })
  const requestReview = (number) =>
    g.api(`${g.root}/pulls/${number}/requested_reviewers`, {
      method: 'POST',
      body: { reviewers: [reviewer] },
    })
  const feedbackFor = (number, article) => pendingFeedback(g, number, article)
  const context = () => readReviewContext(g, event)
  if (command === 'weekly') {
    if (!reviewer || !(await g.permission(reviewer)))
      throw Error('ANALYSIS_REVIEWER må være en bruker med skrivetilgang til repositoryet')
    const open = await g.pages('/pulls?state=open&base=main')
    const existing = open.find((pr) => /^analysis\/weekly-/.test(pr.head.ref))
    if (existing) {
      if (
        !(existing.requested_reviewers ?? []).some((person) =>
          isDesignatedReviewer(person.login, reviewer),
        )
      )
        await requestReview(existing.number)
      console.log('Et utkast venter allerede på gjennomgang. Ingen ny publisering.')
      return
    }
    const published = (await g.content(publicationPath)).value
    published.forEach((a) => validateArticle(a, { published: true }))
    const report = nextReport(dataDir, published)
    if (!report) {
      console.log(
        'Ingen nye dokumenterte problemstillinger i denne analysetypen. Uken hoppes over.',
      )
      return
    }
    const createdAt = now(),
      date = createdAt.slice(0, 10)
    const slug = `utgifter-per-innbygger-${report.scopeId}-${report.start}-${report.end}-${date}`
    let article = validateArticle({
      slug,
      status: 'draft',
      createdAt,
      generatedAt: createdAt,
      topic: report.scopeId === 'state' ? 'Statsfinanser' : report.scopeName,
      geography: 'Staten',
      type: 'Utvikling over tid',
      report,
      copy: await generateCopy(report),
    })
    const main = await g.api(`${g.root}/git/ref/heads/main`)
    const branch = `analysis/weekly-${date}-${report.scopeId}-${report.start}-${report.end}`
    const path = `${draftPrefix}${slug}.json`
    const existingRef = await g.api(`${g.root}/git/ref/heads/${branch}`, { allow404: true })
    if (existingRef) {
      const closed = await g.pages(
        `/pulls?state=closed&head=${encodeURIComponent(g.repository.split('/')[0] + ':' + branch)}`,
      )
      if (closed.length)
        throw Error('Gjennomgangen er allerede lukket; den åpnes ikke automatisk på nytt')
      const difference = await g.api(
        `${g.root}/compare/${main.object.sha}...${existingRef.object.sha}`,
      )
      if (
        difference.files?.length !== 1 ||
        difference.files[0].filename !== path ||
        difference.files[0].status !== 'added'
      )
        throw Error('Eksisterende leveringsgren har uventede endringer')
      const stored = validateArticle((await g.content(path, existingRef.object.sha)).value)
      const identity = (a) =>
        JSON.stringify({
          slug: a.slug,
          report: a.report,
          copy: a.copy,
          topic: a.topic,
          geography: a.geography,
          type: a.type,
        })
      if (
        stored.status !== 'draft' ||
        stored.approval ||
        stored.publishedAt ||
        identity(stored) !== identity(article)
      )
        throw Error('Eksisterende utkast er endret; det overskrives ikke')
      article = stored
    } else {
      await g.api(`${g.root}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${branch}`, sha: main.object.sha },
      })
      await g.commit(branch, main.object.sha, { [path]: article }, `analysis: utkast ${date}`)
    }
    const pr = await g.api(`${g.root}/pulls`, {
      method: 'POST',
      body: {
        title: `Analyse til gjennomgang: ${factText(article.copy.title, article.report)}`,
        head: branch,
        base: 'main',
        body: renderReview(article),
      },
    })
    await requestReview(pr.number)
    console.log(`Utkast klart i gjennomgang #${pr.number}. Ingen offentlig publisering.`)
  } else if (command === 'feedback' || command === 'feedback-notice') {
    const actor = event.comment?.user ?? event.review?.user
    if (actor?.type === 'Bot' || !(await g.permission(actor?.login ?? ''))) {
      console.log('Ingen autorisert menneskelig tilbakemelding.')
      return
    }
    const { number, pr, path, article } = await context()
    if (expectedHead && pr.head.sha !== expectedHead)
      throw Error('Revisjonen gjelder ikke gjeldende gjennomgangsversjon')
    const feedback = await feedbackFor(number, article)
    if (!feedback.length) {
      console.log('Ingen nye endringsønsker.')
      return
    }
    if (command === 'feedback-notice') {
      await comment(
        number,
        'Endringsønsket er registrert. Den planlagte AI-oppgaven må revidere utkastet før ny godkjenning. Ingen AI-API-kjøring er startet. Oppgaven kontrollerer innspill ved neste kjøring; du kan også be AI revidere tidligere i oppgavens chat.',
      )
      return
    }
    const copy = await generateCopy(article.report, {
      previous: article.copy,
      feedback: feedback.map((f) => `${f.user}: ${f.body}`).join('\n\n'),
    })
    const last = feedback.at(-1)
    const next = reviseArticle(article, copy, {
      feedbackId: last.id,
      feedbackAt: last.at,
      generatedAt: now(),
    })
    next.processedFeedbackIds = [
      ...(article.processedFeedbackIds ?? []),
      ...feedback.map((f) => f.id),
    ]
    const latest = await g.api(`${g.root}/pulls/${number}`)
    if (latest.head.sha !== pr.head.sha || latest.state !== 'open')
      throw Error('Utkastet ble endret mens AI arbeidet; ingen endring er skrevet')
    await g.commit(
      pr.head.ref,
      pr.head.sha,
      { [path]: next },
      'analysis: revider etter menneskelig tilbakemelding',
    )
    await g.api(`${g.root}/pulls/${number}`, {
      method: 'PATCH',
      body: {
        title: `Analyse til gjennomgang: ${factText(next.copy.title, next.report)}`,
        body: renderReview(next),
      },
    })
    await comment(
      number,
      'Utkastet og LinkedIn-teksten er oppdatert etter endringsønskene. Les den nye versjonen øverst. Tidligere godkjenning gjelder ikke denne versjonen. Godkjenn på nytt med «Review changes → Approve».',
    )
    await requestReview(number)
  } else if (command === 'stage' || command === 'publish') {
    assertDesignatedReviewer(event?.review?.user?.login, reviewer)
    if (
      event?.review?.state?.toUpperCase() !== 'APPROVED' ||
      !(await g.permission(event.review.user.login))
    )
      throw Error('Mangler menneskelig godkjenning')
    const { number, pr, path, article } = await context()
    const approved = approveArticle(article, {
      reviewer: event.review.user.login,
      commitId: event.review.commit_id,
      currentHead: pr.head.sha,
      approvedAt: event.review.submitted_at,
      pendingFeedback: (await feedbackFor(number, article)).length > 0,
    })
    const reviews = await g.pages(`/pulls/${number}/reviews`)
    const authorizedReviews = []
    for (const review of reviews)
      if (
        isDesignatedReviewer(review.user.login, reviewer) &&
        (await g.permission(review.user.login))
      )
        authorizedReviews.push(review)
    assertActiveApproval(authorizedReviews, event.review, pr.head.sha)
    const published = [...(await g.content(publicationPath, trustedMain ?? pr.base.sha)).value]
    if (published.some((a) => a.slug === approved.slug))
      throw Error('Analyseadressen finnes allerede')
    published.forEach((a) => validateArticle(a, { published: true }))
    published.push(approved)
    if (command === 'stage') {
      writeFileSync(publicationPath, JSON.stringify(published, null, 2) + '\n')
      console.log('Godkjent versjon klargjort for lokale tester. Ikke publisert.')
    } else {
      // Build/test must have validated the identical approved content in this job.
      const staged = JSON.parse(readFileSync(publicationPath, 'utf8'))
      if (JSON.stringify(staged) !== JSON.stringify(published))
        throw Error('Testet og godkjent publiseringsinnhold er forskjellig')
      const latest = await g.api(`${g.root}/pulls/${number}`)
      if (latest.head.sha !== pr.head.sha || latest.state !== 'open')
        throw Error('Gjennomgangen ble endret før publisering')
      const main = await g.api(`${g.root}/git/ref/heads/main`)
      if (main.object.sha !== (trustedMain ?? pr.base.sha))
        throw Error('Main er endret; ny validering kreves før publisering')
      if ((await feedbackFor(number, article)).length)
        throw Error('Et nytt endringsønske kom før fletting; automatisk publisering er stoppet')
      // A single merge commit changes only the registry on trusted main. The
      // review head is a second parent so GitHub records the review as merged.
      // Never rewrite the reviewed branch: a blocked publish can still be revised.
      const sha = await g.commit(
        'main',
        main.object.sha,
        { [publicationPath]: published },
        'analysis: publiser menneskelig godkjent versjon',
        { mergeParent: pr.head.sha },
      )
      console.log(`Godkjent analyse flettet: ${sha}`)
    }
  } else throw Error('Bruk weekly, feedback, feedback-notice, stage eller publish')
}
