import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCache } from '@vercel/functions'
import example from '../../editorial/learning/feedback/review-5664781959.json' with { type: 'json' }
import { selectEditorialExamples } from '../analyser/learning-context.mjs'
import { buildReport } from '../analyser/report.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { interpretGreeting, researchWithSven } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'
import { previewRequests, validRequestId } from '../../server/sven/preview-requests.mjs'

const model = 'claude-sonnet-5-5'

async function resolveSources(question, signal, loadSnapshot) {
  return resolveSvenSources(question, undefined, {
    read: async file => JSON.parse(await loadSnapshot(file, signal)),
    stateReport: async (options) => {
      const dir = await mkdtemp(join(tmpdir(), 'sven-preview-'))
      try {
        await Promise.all(['meta', 'utgifter', 'befolkning', 'kpi'].map(async name => {
          const file = name + '.json'
          await writeFile(join(dir, file), await loadSnapshot(file, signal))
        }))
        return buildReport(dir, options)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  })
}

export function hostedPreview({
  environment = process.env.VERCEL_ENV,
  apiKey = process.env.SVEN_ANTHROPIC_API_KEY,
  createRequest = claudeTransport,
  sources = resolveSources,
  cache = getCache({ namespace: 'fellestall-sven-preview-v1' }),
  onUsage = ({ phase, input, output, cacheRead, cacheWrite, searches, elapsedMs }) => {
    console.info('[Sven usage]', JSON.stringify({ phase, input, output, cacheRead, cacheWrite, searches, elapsedMs }))
  },
} = {}) {
  const requests = previewRequests(cache)
  const loadSnapshot = snapshotLoader({ cache })
  const reply = (status, body) => ({ status, body })
  const directReply = summary => reply(200, { summary, findings: [], uncertainties: [], recommendation: null, sources: [] })
  let busy = false
  async function answerQuestion({ question, history, asOf }, memo) {
    const greeting = interpretGreeting(question)
    if (greeting) return directReply(greeting.reply)
    if (!apiKey) return reply(503, { error: 'Sven-nøkkelen mangler i denne Vercel-previewen.' })
    if (busy) return reply(429, { error: 'Sven undersøker et annet spørsmål. Prøv igjen snart.' })
    busy = true
    const signal = AbortSignal.timeout(150_000)
    let phase = 'interpret'
    try {
      const request = createRequest({ apiKey, model, timeoutMs: 55_000, cacheInstructions: true, onUsage })
      const result = await researchWithSven({
        question, history, asOf, signal, maxSearches: 3, conversational: true,
        editorialExamples: selectEditorialExamples({ question }, [example]),
        localSources: async query => {
          const entry = await memo('local-sources', { query, asOf }, async () => {
            try { return { sources: await sources(query, signal, loadSnapshot) } }
            catch { return { missing: true } }
          })
          if (entry.missing) throw new Error('Kildeoppslaget mangler grunnlag')
          return entry.sources
        },
        request: ({ signal: requestSignal, ...input }) => {
          phase = input.phase
          const params = { ...input, maxTokens: Math.min(input.maxTokens ?? 2400, 3600) }
          requestSignal?.throwIfAborted()
          return memo(phase, params, () => request({ ...params, signal: requestSignal }), { billable: true })
        },
      })
      if (result.status === 'conversation') return directReply(result.reply)
      if (result.status === 'no-evidence') {
        return reply(422, { error: 'Jeg fant ikke kilder som kunne underbygge et svar på dette. Hvis du har en kilde, kan du gjerne dele den.' })
      }
      if (result.status !== 'reviewed') {
        return reply(422, { error: 'Sven fant mangler i svaret. Prøv et mer avgrenset spørsmål.' })
      }
      const used = new Set([...result.answer.findings, result.answer.recommendation]
        .filter(Boolean).flatMap(finding => finding.sourceIds))
      const links = result.sources.filter(source => used.has(source.id) && source.url?.startsWith('https://'))
        .map(({ title, url }) => ({ title, url }))
      return reply(200, { ...result.answer, sources: links })
    } catch (error) {
      console.warn('[Sven preview]', phase, String(error?.message).match(/^Claude API svarte HTTP \d{3}$/)?.[0] ?? error?.name)
      if (signal.aborted) return reply(202, { pending: true })
      const limited = /HTTP (402|429)$/.test(error?.message)
      return reply(limited ? 429 : 502, { error: limited
        ? 'Claude har nådd en bruksgrense. Vent litt eller sjekk Sven-budsjettet.'
        : 'Sven kunne ikke svare akkurat nå. Prøv igjen.' })
    } finally {
      busy = false
    }
  }

  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const send = (status, body) => res.status(status).json(body)
    if (environment !== 'preview') return send(404, { error: 'Previewen er utilgjengelig.' })
    if (req.method === 'GET') return send(200, { configured: Boolean(apiKey), model })
    if (req.method !== 'POST') return send(405, { error: 'Metoden støttes ikke.' })
    if (req.headers.origin !== `https://${req.headers.host}` ||
        req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
      return send(403, { error: 'Send spørsmålet fra den beskyttede forhåndsvisningen.' })
    }
    const { requestId, resume, question: rawQuestion, history = [] } = req.body ?? {}
    if (!validRequestId(requestId)) return send(400, { error: 'Innsendingen mangler en gyldig ID. Last siden på nytt.' })
    if (resume === true) {
      const { status, body } = await requests.resume(requestId, answerQuestion)
      return send(status, body)
    }
    const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : ''
    if (!question || question.length > 2000 || !Array.isArray(history) || history.length > 6 ||
        history.some(turn => !['user', 'assistant'].includes(turn?.role) ||
          typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 1200)) {
      return send(400, { error: 'Skriv et spørsmål på opptil 2000 tegn.' })
    }
    const asOf = new Date().toISOString().slice(0, 10)
    const { status, body } = await requests.run(requestId, { question, history, asOf }, answerQuestion)
    return send(status, body)
  }
}

export default hostedPreview()
