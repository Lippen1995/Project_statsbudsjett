import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analysisSettings } from './config.mjs'
import { githubClient } from './github.mjs'
import { validateArticle } from './schema.mjs'
import { assertReviewBranch } from './review.mjs'
import { runWorkflow, readReviewContext } from './workflow.mjs'

export async function deliverScheduled({ g, reviewer, actor, input, ...options }) {
  if (!['weekly', 'feedback', 'replacement'].includes(input.mode))
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
  const mode = input.mode === 'weekly' && packet.mode === 'replacement' ? 'replacement' : input.mode
  const article = validateArticle(packet.article ?? packet)
  if (article.status !== 'draft' || article.approval || article.publishedAt)
    throw Error('Bare et utkast uten godkjenning kan leveres')
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
  await runWorkflow({
    ...options,
    command: mode,
    replacementFor: mode === 'replacement' ? article.replaces : null,
    detailSelections: mode === 'weekly' ? article.report.detailSelections : undefined,
    event,
    g,
    reviewer,
    expectedHead: packet.base?.head,
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
  })
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
