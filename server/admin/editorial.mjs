import { randomUUID } from 'node:crypto'
import { contentHash, validateArticle } from '../../scripts/analyser/schema.mjs'
import { assertReviewBranch } from '../../scripts/analyser/review.mjs'
import { replacementDraft } from '../../scripts/analyser/replacement.mjs'
import { currentAnalyses } from '../../web/src/analyser/topics.js'
import { audit, fail, requireRole, text } from './core.mjs'

const publicationPath = 'web/src/analyser/publications.json'
function validateEdit(article) {
  try {
    return validateArticle(article)
  } catch (error) {
    fail(error.message, 400)
  }
}
export function editorialService({ sql, github }) {
  async function published() {
    const file = await github.readFile(publicationPath)
    if (!file) throw Error('Publiseringsregisteret mangler')
    const articles = JSON.parse(file.content)
    articles.forEach((a) => validateArticle(a, { published: true }))
    return { articles, sha: file.sha }
  }
  async function review(number) {
    if (!Number.isSafeInteger(number) || number < 1)
      fail('Ugyldig gjennomgang.')
    const pr = await github.api(`pulls/${number}`)
    assertReviewBranch(pr, 'Lippen1995/Project_statsbudsjett')
    const files = await github.api(`pulls/${number}/files?per_page=100`)
    if (
      files.length !== 1 ||
      files[0].status !== 'added' ||
      !/^editorial\/drafts\/[a-z0-9-]+\.json$/.test(files[0].filename)
    )
      fail('Gjennomgangen inneholder uventede filendringer.', 409)
    const file = await github.readFile(files[0].filename, pr.head.sha)
    const article = validateArticle(JSON.parse(file.content))
    const [comments, reviews, commits] = await Promise.all([
      github.api(`issues/${number}/comments?per_page=100`),
      github.api(`pulls/${number}/reviews?per_page=100`),
      github.api(`pulls/${number}/commits?per_page=100`),
    ])
    const processed = new Set(
      (article.processedFeedbackIds || []).map((v) =>
        typeof v === 'number' ? 'comment-' + v : v,
      ),
    )
    const feedback = [
      ...comments
        .filter((c) => c.user.type !== 'Bot' && c.body?.trim())
        .map((c) => ({
          id: 'comment-' + c.id,
          body: c.body,
          actor: c.user.login,
          at: c.created_at,
        })),
      ...reviews
        .filter(
          (r) =>
            r.user.type !== 'Bot' &&
            ['COMMENTED', 'CHANGES_REQUESTED'].includes(r.state) &&
            r.body?.trim(),
        )
        .map((r) => ({
          id: 'review-' + r.id,
          body: r.body,
          actor: r.user.login,
          at: r.submitted_at,
        })),
    ].map((f) => ({ ...f, processed: processed.has(f.id) }))
    return {
      number,
      head: pr.head.sha,
      branch: pr.head.ref,
      path: file.path,
      fileSha: file.sha,
      article,
      hash: contentHash(article),
      title: pr.title,
      url: pr.html_url,
      feedback,
      reviews: reviews.map((r) => ({
        id: r.id,
        state: r.state,
        actor: r.user.login,
        head: r.commit_id,
        at: r.submitted_at,
      })),
      commits: commits.map((c) => ({
        sha: c.sha,
        title: c.commit.message.split('\n')[0],
        at: c.commit.committer.date,
      })),
    }
  }
  return {
    published,
    review,
    async list() {
      const rows = await github.api('pulls?state=open&base=main&per_page=100')
      return rows
        .filter(
          (p) =>
            p.head.repo?.full_name === 'Lippen1995/Project_statsbudsjett' &&
            /^analysis\/weekly-[a-z0-9-]+$/.test(p.head.ref),
        )
        .map((p) => ({
          number: p.number,
          title: p.title,
          head: p.head.sha,
          updatedAt: p.updated_at,
          url: p.html_url,
          author: p.user.login,
          status: p.draft ? 'draft' : 'review',
        }))
    },
    async save(user, value) {
      requireRole(user, ['admin', 'editor'])
      const current = await review(value.number)
      if (current.head !== value.head || current.fileSha !== value.fileSha)
        fail('Utkastet er endret. Hent siste versjon før lagring.', 409)
      const next = {
        ...current.article,
        copy: value.copy,
        status: 'draft',
        generatedAt: new Date().toISOString(),
        ...(value.presentation ? { presentation: value.presentation } : {}),
      }
      delete next.approval
      delete next.publishedAt
      if (value.processedFeedbackIds) {
        if (
          !Array.isArray(value.processedFeedbackIds) ||
          value.processedFeedbackIds.some(
            (id) => !current.feedback.some((f) => f.id === id),
          )
        )
          fail('Ugyldig tilbakemeldingsreferanse.')
        next.processedFeedbackIds = [
          ...new Set([
            ...(next.processedFeedbackIds || []),
            ...value.processedFeedbackIds,
          ]),
        ]
      }
      validateEdit(next)
      const result = await github.writeFile(
        current.path,
        JSON.stringify(next, null, 2) + '\n',
        current.fileSha,
        {
          branch: current.branch,
          message: 'admin: revider analyseutkast etter gjennomgang',
        },
      )
      await audit(
        sql,
        user,
        'edit-draft',
        'reviews/' + value.number,
        { head: current.head, hash: current.hash },
        { ...result, hash: contentHash(next) },
      )
      return { ...result, hash: contentHash(next) }
    },
    async comment(user, value) {
      requireRole(user, ['admin', 'editor'])
      const current = await review(value.number)
      if (current.head !== value.head)
        fail('Utkastet er endret. Hent siste versjon.', 409)
      const body = text(value.body, 5, 10000)
      const result = await github.api(`issues/${value.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      await audit(
        sql,
        user,
        'request-revision',
        'reviews/' + value.number,
        null,
        { head: current.head, commentId: result.id, body },
      )
      return { requested: true, id: result.id, url: result.html_url }
    },
    async approve(user, value) {
      requireRole(user)
      const current = await review(value.number)
      if (current.head !== value.head || current.hash !== value.hash)
        fail(
          'Teksten er endret etter forhåndsvisningen. Les og godkjenn siste versjon.',
          409,
        )
      if (value.confirm !== 'GODKJENN')
        fail('Skriv GODKJENN for å godkjenne denne eksakte versjonen.')
      const [checklist] = await sql.query(
        "SELECT data FROM ft_admin_records WHERE collection='checklists' AND data->>'article'=$1 AND data->>'head'=$2 ORDER BY updated_at DESC LIMIT 1",
        [String(value.number), current.head],
      )
      if (
        !checklist ||
        !['numbers', 'sources', 'scope', 'title', 'conclusion', 'images'].every(
          (k) => checklist.data[k],
        )
      )
        fail('Fullfør sjekklisten for denne versjonen før godkjenning.')
      if (current.feedback.some((f) => !f.processed))
        fail('Ubehandlede endringsønsker må behandles før godkjenning.', 409)
      const settings = await github.readFile(
          'editorial/analysis-settings.json',
        ),
        reviewer = JSON.parse(settings.content).reviewer
      if (
        (await github.identity()).login?.toLowerCase() !==
        reviewer?.toLowerCase()
      )
        fail('GitHub-tilgangen tilhører ikke den utpekte godkjenneren.', 403)
      const self = await github.api(
        'collaborators/' + encodeURIComponent(reviewer) + '/permission',
      )
      if (!['admin', 'write', 'maintain'].includes(self.permission))
        fail('Den utpekte GitHub-godkjenneren mangler skrivetilgang.', 403)
      const result = await github.api(`pulls/${value.number}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          commit_id: current.head,
          event: 'APPROVE',
          body: `Menneskelig godkjent i Fellestall-admin. Kontrollert innholdsversjon: ${current.hash}.`,
        }),
      })
      await audit(
        sql,
        user,
        'approve-publication',
        'reviews/' + value.number,
        { head: current.head },
        {
          hash: current.hash,
          reviewId: result.id,
          reviewer: result.user?.login,
        },
      )
      return {
        approved: true,
        head: current.head,
        hash: current.hash,
        url: current.url,
        note: 'GitHub kjører eksisterende tester og publiseringskontroller før teksten kan bli publisert.',
      }
    },
    async previous(number, sha) {
      const current = await review(number)
      if (!current.commits.some((c) => c.sha === sha))
        fail('Velg en versjon fra denne gjennomgangen.')
      const file = await github.readFile(current.path, sha)
      return {
        current: current.article,
        previous: validateArticle(JSON.parse(file.content)),
        sha,
      }
    },
    async revisePublished(user, value) {
      requireRole(user, ['admin', 'editor'])
      const registry = await published(),
        source = currentAnalyses(registry.articles).find(
          (a) => a.slug === value.slug,
        )
      if (!source || contentHash(source) !== value.hash)
        fail(
          'Analysen er endret eller allerede erstattet. Hent siste versjon.',
          409,
        )
      const article = {
        ...replacementDraft(source, new Date().toISOString()),
        copy: value.copy,
        ...(value.presentation ? { presentation: value.presentation } : {}),
      }
      validateEdit(article)
      const path = 'editorial/handoff/admin-' + randomUUID() + '.json'
      const result = await github.writeFile(
        path,
        JSON.stringify({ mode: 'replacement', article }, null, 2) + '\n',
        null,
        {
          message: 'admin: bestill menneskelig gjennomgang av revidert analyse',
        },
      )
      const job = await github.dispatch('analysis-handoff.yml', {
        mode: 'replacement',
        source_commit: result.commit,
        source_path: path,
      })
      await audit(
        sql,
        user,
        'revision-request',
        'articles/' + source.slug,
        { hash: value.hash },
        { ...result, ...job },
      )
      return { requested: true, ...result, ...job }
    },
    async withdraw(user, value) {
      requireRole(user)
      if (value.confirm !== 'TREKK TILBAKE')
        fail('Skriv TREKK TILBAKE for å bekrefte.')
      const registry = await published(),
        article = currentAnalyses(registry.articles).find(
          (a) => a.slug === value.slug,
        )
      if (
        !article ||
        contentHash(article) !== value.hash ||
        registry.sha !== value.sha
      )
        fail('Publiseringsregisteret er endret. Hent siste versjon.', 409)
      const slugs = new Set([article.slug])
      let parent = article.replaces?.slug
      while (parent) {
        slugs.add(parent)
        parent = registry.articles.find((a) => a.slug === parent)?.replaces
          ?.slug
      }
      const archive = await github.readFile('editorial/withdrawals.json'),
        entries = archive ? JSON.parse(archive.content) : []
      const removed = registry.articles.filter((a) => slugs.has(a.slug)),
        at = new Date().toISOString(),
        reason = text(value.reason, 5, 2000)
      entries.push({ at, reason, articles: removed })
      const head = await github.api('git/ref/heads/main')
      // Recheck the publication blob after obtaining the parent for the atomic commit.
      if ((await github.readFile(publicationPath)).sha !== registry.sha)
        fail('Publiseringsregisteret ble endret. Hent siste versjon.', 409)
      const result = await github.commitChanges(
        {
          [publicationPath]: registry.articles.filter(
            (a) => !slugs.has(a.slug),
          ),
          'editorial/withdrawals.json': entries,
        },
        head.object.sha,
        'admin: trekk tilbake analyse etter eksplisitt bekreftelse',
      )
      await audit(
        sql,
        user,
        'withdraw',
        'articles/' + article.slug,
        { hash: value.hash },
        { ...result, reason, archived: removed.map((a) => a.slug) },
      )
      return { withdrawn: true, ...result }
    },
    async distribution() {
      const [registry, file] = await Promise.all([
        published(),
        github.readFile('editorial/linkedin-receipts.json'),
      ])
      const receipts = file ? JSON.parse(file.content) : []
      return currentAnalyses(registry.articles).map((a) => ({
        slug: a.slug,
        title: a.copy.title,
        report: a.report,
        text: a.copy.linkedin,
        hash: contentHash(a),
        receipt: receipts.find((r) => r.contentHash === contentHash(a)) || null,
      }))
    },
    async reconcileDistribution(user, value) {
      requireRole(user)
      if (value.confirm !== 'AVSTEM' || value.checked !== true)
        fail('Kontroller LinkedIn og skriv AVSTEM.')
      const reason = text(value.reason, 5, 1000),
        postId = text(value.postId || '', 0, 150)
      if (postId && !/^urn:li:(share|ugcPost):[0-9]+$/.test(postId))
        fail('Bruk en gyldig LinkedIn post-ID.')
      const head = await github.api('git/ref/heads/main'),
        file = await github.readFile(
          'editorial/linkedin-receipts.json',
          head.object.sha,
        ),
        receipts = file ? JSON.parse(file.content) : [],
        receipt = receipts.find(
          (r) => r.slug === value.slug && r.contentHash === value.hash,
        )
      if (receipt?.status !== 'pending')
        fail('Kvitteringen er endret eller trenger ikke avstemming.', 409)
      const archive = await github.readFile(
          'editorial/linkedin-reconciliations.json',
          head.object.sha,
        ),
        history = archive ? JSON.parse(archive.content) : []
      history.push({
        receipt,
        at: new Date().toISOString(),
        reason,
        outcome: postId ? 'sent' : 'confirmed-not-sent',
        postId: postId || null,
      })
      const next = postId
        ? receipts.map((r) =>
            r === receipt
              ? {
                  ...r,
                  status: 'sent',
                  postId,
                  sentAt: new Date().toISOString(),
                  reconciled: true,
                }
              : r,
          )
        : receipts.filter((r) => r !== receipt)
      const result = await github.commitChanges(
        {
          'editorial/linkedin-receipts.json': next,
          'editorial/linkedin-reconciliations.json': history,
        },
        head.object.sha,
        'admin: avstem LinkedIn-forsøk etter manuell kontroll',
      )
      await audit(
        sql,
        user,
        'distribution-reconcile',
        'articles/' + value.slug,
        receipt,
        { postId: postId || null, reason, ...result },
      )
      return { reconciled: true, ...result }
    },
    async retryDistribution(user, value) {
      requireRole(user)
      const list = await this.distribution(),
        article = list.find(
          (a) => a.slug === value.slug && a.hash === value.hash,
        )
      if (!article) fail('Analysen er endret. Hent siste versjon.', 409)
      if (article.receipt?.status === 'sent')
        fail('Denne versjonen er allerede sendt.', 409)
      if (article.receipt?.status === 'pending')
        fail(
          'Et tidligere forsøk har ukjent resultat. Avstem kvitteringen før ny sending.',
          409,
        )
      if (value.confirm !== 'SEND')
        fail('Skriv SEND for å bekrefte distribusjonen.')
      const result = await github.dispatch('analysis-distribute.yml', {})
      await audit(
        sql,
        user,
        'distribution-request',
        'articles/' + value.slug,
        null,
        { hash: value.hash, ...result },
      )
      return { requested: true, ...result }
    },
  }
}
