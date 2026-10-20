import { deliverResearchRevision } from './research-revision.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analysisSettings } from './config.mjs'
import { githubClient } from './github.mjs'
import { validateArticle } from './schema.mjs'
import { assertReviewBranch } from './review.mjs'
import { runWorkflow, readReviewContext } from './workflow.mjs'
import { pipelineRepository, assertCurrentEntry, completeEntry, pipelinePath, pipelineMarker } from './pipeline-model.mjs'
import { ensurePipelineNext, buildPipelineReport } from './pipeline-reports.mjs'
import { topicKey } from '../../web/src/analyser/topics.js'

export async function deliverScheduled({ g, reviewer, actor, input, ...options }) {
  if (!['weekly', 'feedback', 'replacement', 'budget-day', 'oil-funds'].includes(input.mode))
    throw Error('Ugyldig leveringsmodus')
  if (
    !/^[a-f0-9]{40}$/.test(input.sourceCommit ?? '') ||
    !/^editorial\/(?:drafts|handoff)\/[a-z0-9-]+\.json$/.test(input.sourcePath ?? '')
  )
    throw Error('Leveringen krever en fast commit og en kontrollert JSON-sti')
  if (!actor || !(await g.permission(actor)) || !reviewer || !(await g.permission(reviewer)))
    throw Error('Avsender og godkjenner må ha skrivetilgang')
  const source = await g.content(input.sourcePath, input.sourceCommit)
  if (!source) throw Error('Leveringsfilen finnes ikke')
  const packet = source.value
  const mode =
    input.mode === 'weekly' && ['replacement', 'budget-day', 'oil-funds', 'research-revision'].includes(packet.mode)
      ? packet.mode
      : input.mode
  const article = validateArticle(packet.article ?? packet)
  if (article.status !== 'draft' || article.approval || article.publishedAt)
    throw Error('Bare et utkast uten godkjenning kan leveres')
  if (mode === 'research-revision') return deliverResearchRevision({g,reviewer,actor,packet,sourceCommit:input.sourceCommit,...options})
  const at = options.now?.() ?? new Date().toISOString()
  const repository = pipelineRepository(g)
  let queued = null
  if (mode === 'weekly') {
    const file = await g.content(pipelinePath)
    if (file) {
      // Et eldre ukesutkast skal ikke kunne omgå administratorens nye bestilling.
      if (!packet.pipeline) throw Error('Ukesanalysen mangler gjeldende pipelineinstruks. Planlegg analysen på nytt.')
      queued = assertCurrentEntry(file.value, packet.pipeline, at)
      if (!packet.pipeline.plan || (queued.reportPlan && JSON.stringify(queued.reportPlan) !== JSON.stringify(packet.pipeline.plan))) throw Error('Ugyldig analyseplan for gjeldende pipelineinstruks.')
    } else if (packet.pipeline) throw Error('Den oppgitte pipelineinstruksen finnes ikke på main.')
  }
  let event = null,
    previous = null
  if (mode === 'feedback') {
    if (!Number.isSafeInteger(input.number) || input.number < 1)
      throw Error('Mangler gyldig gjennomgangsnummer')
    event = { issue: { number: input.number }, comment: { user: { login: actor, type: 'User' } } }
    const context = await readReviewContext(g, event)
    assertReviewBranch(context.pr, g.repository)
    if (packet.base?.head !== context.pr.head.sha || packet.base?.number !== input.number)
      throw Error('Revisjonen gjelder ikke gjeldende gjennomgangsversjon')
    previous = context.article.copy
  }
  let result = await runWorkflow({
    ...options,
    command: mode,
    replacementFor: mode === 'replacement' ? article.replaces : null,
    detailSelections: mode === 'weekly' ? article.report.detailSelections : undefined,
    budgetYear: mode === 'budget-day' ? article.report.year : undefined,
    budgetQuestion: mode === 'budget-day' ? article.report.question : undefined,
    budgetBaseline: mode === 'budget-day' ? article.report.baselineSeries ?? 'saldert' : undefined,
    oilYear: mode === 'oil-funds' ? article.report.year : undefined,
    event,
    g,
    reviewer,
    expectedHead: packet.base?.head,
    ...(queued ? {
      pipelinePlan: packet.pipeline.plan,
      pipelineReference: packet.pipeline,
      beforeDraftWrite: async () => assertCurrentEntry((await repository.read()).document, packet.pipeline, at),
    } : {}),
    generateCopy: async (report, revision = {}) => {
      if (JSON.stringify(article.report) !== JSON.stringify(report))
        throw Error('Leveringens datagrunnlag samsvarer ikke med den kontrollerte rapporten')
      if (
        previous &&
        (JSON.stringify(revision.previous) !== JSON.stringify(previous) ||
          revision.feedback !== packet.base.feedback)
      )
        throw Error('Utkast eller endringsønsker ble endret etter at revisjonen ble skrevet')
      return article.copy
    },
    ...(article.presentation ? { presentation:article.presentation } : {}),
  })
  if (queued && result?.waiting && result.pipelineMatch) {
    // Gjenoppta hvis PR-en ble opprettet, men review request feilet før kvittering.
    const context = await readReviewContext(g, { issue: { number: result.number } })
    const published = (await g.content('web/src/analyser/publications.json')).value
    const trustedReport = buildPipelineReport(options.dataDir ?? 'web/public/data', published, packet.pipeline.plan, at)
    if (!context.pr.body?.includes(pipelineMarker(packet.pipeline)) ||
        JSON.stringify(trustedReport) !== JSON.stringify(article.report) ||
        JSON.stringify(context.article.report) !== JSON.stringify(article.report) ||
        JSON.stringify(context.article.copy) !== JSON.stringify(article.copy)) throw Error('Gjennomgangen gjelder ikke samme kontrollerte pipelineutkast. Køen er beholdt.')
    result = { ...result, waiting: false, delivered: true, recovered: true }
  }
  if (queued && result?.delivered) {
    const current = await repository.read()
    const completed = completeEntry(current.document, packet.pipeline, { at, reviewUrl: result.reviewUrl, topicKey: topicKey(article.report) })
    await repository.write(completed, current.sha, `analysis: lever pipelinetema til gjennomgang #${result.number}`)
    const published = (await g.content('web/src/analyser/publications.json')).value
    await ensurePipelineNext(repository, { dataDir: options.dataDir ?? 'web/public/data', published, at })
  }
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const settings = analysisSettings()
  if (!settings.enabled) throw Error('Analyselevering er deaktivert')
  try {
    await deliverScheduled({
      g: githubClient(),
      reviewer: settings.reviewer,
      actor: process.env.GITHUB_ACTOR,
      input: {
        mode: process.env.ANALYSIS_MODE,
        sourceCommit: process.env.ANALYSIS_SOURCE_COMMIT,
        sourcePath: process.env.ANALYSIS_SOURCE_PATH,
        number: Number(process.env.ANALYSIS_PR_NUMBER),
      },
    })
  } catch (error) {
    const message =
      error instanceof SyntaxError ? 'Leveringsfilen inneholder ugyldig JSON' : error.message
    console.error(
      `::error::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`,
    )
    process.exitCode = 1
  }
}
