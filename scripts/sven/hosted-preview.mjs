import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCache } from '@vercel/functions'
import example from '../../editorial/learning/feedback/review-5664781959.json' with { type: 'json' }
import { selectEditorialExamples } from '../analyser/learning-context.mjs'
import { buildReport } from '../analyser/report.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { compactSearchEvidence, interpretGreeting, researchWithSven } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'
import { previewRequests, validRequestId } from '../../server/sven/preview-requests.mjs'
import { prepareMunicipalMap } from '../../server/sven/municipal-map.mjs'

const model = 'claude-sonnet-5-5'
const previewModels = [
  { id: model, label: 'Claude Sonnet 5.5', detail: 'Standard' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detail: 'Høyere forbruk' },
]
const effortLevels = [
  { id: 'default', label: 'Modellens standard' },
  { id: 'low', label: 'Lav · raskere' },
  { id: 'medium', label: 'Middels · balansert' },
  { id: 'high', label: 'Høy · grundigere' },
]

// The Messages API requires max_tokens. Both preview models support 128,000.
const anthropicOutputLimit = 128_000
const invocationLeaseMs = 330_000

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
  mapGeometry = prepareMunicipalMap,
  publishJob,
  cache = getCache({ namespace: 'fellestall-sven-preview-v1' }),
  onUsage = ({ phase, input, output, cacheRead, cacheWrite, searches, elapsedMs, stopReason, maxTokens }) => {
    console.info('[Sven usage]', JSON.stringify({ phase, input, output, cacheRead, cacheWrite, searches, elapsedMs, stopReason, maxTokens }))
  },
} = {}) {
  const requests = previewRequests(cache, { leaseMs: invocationLeaseMs, ...(publishJob ? { ttl: 86_400 } : {}) })
  const loadSnapshot = snapshotLoader({ cache })
  const reply = (status, body) => ({ status, body })
  const directReply = summary => reply(200, { summary, findings: [], uncertainties: [], recommendation: null, sources: [] })
  let busy = false
  async function answerQuestion({ question, history, asOf, selectedModel = model, effort = 'default', files = false, uploads = [] }, memo) {
    const greeting = !uploads.length && interpretGreeting(question)
    if (greeting) return directReply(greeting.reply)
    if (!apiKey) return reply(503, { error: 'Sven-nøkkelen mangler i denne Vercel-previewen.' })
    if (!publishJob && busy) return reply(429, { error: 'Sven undersøker et annet spørsmål. Prøv igjen snart.' })
    busy = true
    const step = new AbortController()
    const { signal } = step
    const continuation = new Error('Continue from checkpoint')
    let startedModelCall = false
    let phase = 'interpret'
    const usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 }
    const measuredReply = (status, body) => reply(status, {
      ...body, ...(usage.calls ? { model: selectedModel, effort, usage } : {}),
    })
    try {
      const request = createRequest({ apiKey, model: selectedModel, timeoutMs: publishJob ? 260_000 : null,
        stream: true, cacheInstructions: true, ...(effort === 'default' ? {} : { effort }), onUsage })
      const result = await researchWithSven({
        question, history, asOf, signal, maxSearches: 3, conversational: true, charts: true, files, uploads,
        editorialExamples: selectEditorialExamples({ question }, [example]),
        localSources: async query => {
          const entry = await memo('local-sources', { query, asOf }, async () => {
            try { return { sources: await sources(query, signal, loadSnapshot) } }
            catch { return { missing: true } }
          })
          if (entry.missing) throw new Error('Kildeoppslaget mangler grunnlag')
          return entry.sources
        },
        request: async ({ signal: requestSignal, ...input }) => {
          phase = input.phase
          const params = { ...input, maxTokens: anthropicOutputLimit }
          requestSignal?.throwIfAborted()
          const addUsage = measured => {
            if (!measured) return
            usage.calls++
            usage.input += measured.input_tokens ?? 0
            usage.output += measured.output_tokens ?? 0
            usage.cacheRead += measured.cache_read_input_tokens ?? 0
            usage.cacheWrite += measured.cache_creation_input_tokens ?? 0
            usage.searches += measured.server_tool_use?.web_search_requests ?? 0
          }
          let result
          try {
            result = await memo(phase, { model: selectedModel, ...params, ...(effort === 'default' ? {} : { effort }) },
              async () => {
                const message = await request({ ...params, signal: requestSignal })
                return ['research', 'research-followup'].includes(phase) ? compactSearchEvidence(message) : message
              }, { billable: true, beforeStart: () => {
                if (startedModelCall) {
                  // Yield between calls. Completed phases are replayed from
                  // the checkpoint when the client resumes the same request.
                  step.abort(continuation)
                  throw continuation
                }
                startedModelCall = true
              } })
          } catch (error) {
            addUsage(error?.usage)
            throw error
          }
          addUsage(result.usage)
          return result
        },
      })
      const withGeometry = async deliverables => {
        if (!deliverables?.map) return deliverables
        return { ...deliverables, map: await memo('map-geometry', deliverables.map, () => mapGeometry(deliverables.map)) }
      }
      if (result.status === 'conversation') return measuredReply(200, {
        ...directReply(result.reply).body, ...(result.chart ? { chart: result.chart } : {}),
        ...(result.deliverables ? { deliverables: await withGeometry(result.deliverables) } : {}),
      })
      if (result.status === 'no-evidence') {
        return measuredReply(422, { error: 'Jeg fant ikke kilder som kunne underbygge et svar på dette. Hvis du har en kilde, kan du gjerne dele den.' })
      }
      if (result.status !== 'reviewed') {
        return measuredReply(422, { error: 'Sven fant mangler i svaret. Prøv et mer avgrenset spørsmål.' })
      }
      const { deliverables } = result.answer
      const used = new Set([...result.answer.findings, result.answer.recommendation, result.answer.chart,
        deliverables?.table, deliverables?.map, deliverables?.illustration, ...(deliverables?.sections ?? [])]
        .filter(Boolean).flatMap(finding => finding.sourceIds))
      const links = result.sources.filter(source => used.has(source.id) && (source.url?.startsWith('https://') || source.type === 'upload'))
        .map(({ id, title, url, type }) => type === 'upload' ? { id, title, type } : { id, title, url })
      return measuredReply(200, { ...result.answer, sources: links,
        ...(deliverables ? { deliverables: await withGeometry(deliverables) } : {}),
      })
    } catch (error) {
      if (error === continuation) return reply(202, { pending: true, continuation: true })
      console.warn('[Sven preview]', phase, String(error?.message).match(/^Claude API svarte HTTP \d{3}$/)?.[0] ?? error?.code ?? error?.name, ['pause_turn', 'max_tokens', 'refusal'].includes(error?.stopReason) ? error.stopReason : undefined)
      const limited = /HTTP (402|429)$/.test(error?.message)
      return measuredReply(limited ? 429 : 502, { error: limited
        ? 'Claude har nådd en bruksgrense. Vent litt eller sjekk Sven-budsjettet.'
        : 'Sven kunne ikke svare akkurat nå. Prøv igjen.' })
    } finally {
      busy = false
    }
  }

  const handle = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const send = (status, body) => res.status(status).json(body)
    if (environment !== 'preview') return send(404, { error: 'Previewen er utilgjengelig.' })
    if (req.method === 'GET') return send(200, { configured: Boolean(apiKey), model, models: previewModels, effortLevels, files: true })
    if (req.method !== 'POST') return send(405, { error: 'Metoden støttes ikke.' })
    if (req.headers.origin !== `https://${req.headers.host}` ||
        req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
      return send(403, { error: 'Send spørsmålet fra den beskyttede forhåndsvisningen.' })
    }
    const { requestId, resume, progress, question: rawQuestion, history = [], files: attachments = [], carryAttachments, model: selectedModel = model,
      effort = 'default' } = req.body ?? {}
    if (!validRequestId(requestId)) return send(400, { error: 'Innsendingen mangler en gyldig ID. Last siden på nytt.' })
    if (progress === true) return send(200, await requests.progress(requestId))
    if (resume === true) {
      const result = publishJob ? await requests.backgroundStatus(requestId) : null
      const { status, body } = result ?? await requests.resume(requestId, answerQuestion)
      return send(status, body)
    }
    const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : ''
    if (!question || question.length > 2000 || !Array.isArray(history) || history.length > 6 ||
        history.some(turn => !['user', 'assistant'].includes(turn?.role) ||
          typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 1200)) {
      return send(400, { error: 'Skriv et spørsmål på opptil 2000 tegn.' })
    }
    if (!previewModels.some(option => option.id === selectedModel)) return send(400, { error: 'Denne modellen er ikke tilgjengelig.' })
    if (!effortLevels.some(option => option.id === effort)) return send(400, { error: 'Dette resonneringsnivået er ikke tilgjengelig.' })
    if (!Array.isArray(attachments) || attachments.length > 3 || attachments.some(file =>
      typeof file?.name !== 'string' || !file.name.trim() || file.name.length > 180 ||
      typeof file.text !== 'string' || !file.text.trim() || file.text.length > 24_000)) {
      return send(400, { error: 'Sven kan motta opptil tre lesbare vedlegg per melding.' })
    }
    const currentAttachments = carryAttachments === true && interpretGreeting(question) ? [] : attachments
    const uploads = currentAttachments.map(({ name, text, partial }, index) => ({
      id: `vedlegg-${index + 1}`, type: 'upload', title: name,
      text: partial ? `Utdrag av vedlegget. Innhold kan mangle.\n${text}` : text,
    }))
    const asOf = new Date().toISOString().slice(0, 10)
    const brief = { question, history, asOf, selectedModel, effort, files: true, uploads }
    if (publishJob && apiKey && (uploads.length || !interpretGreeting(question))) {
      try {
        const { status, body } = await requests.enqueue(requestId, brief, publishJob)
        return send(status, body)
      } catch {
        return send(503, { error: 'Analysen venter på oppstart. Sven prøver å koble til igjen.', recoverable: true })
      }
    }
    const { status, body } = await requests.run(requestId, brief, answerQuestion)
    return send(status, body)
  }
  handle.work = (id, state) => requests.work(id, state, answerQuestion, publishJob)
  return handle
}

export default hostedPreview()
