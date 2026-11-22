import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import example from '../../editorial/learning/feedback/review-5664781959.json' with { type: 'json' }
import { selectEditorialExamples } from '../analyser/learning-context.mjs'
import { buildReport } from '../analyser/report.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'
import { researchWithSven } from '../../server/sven/research.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'

const model = 'claude-sonnet-5-5'
const snapshot = 'https://fellestall.no/data/'

function openingReply(question) {
  const words = question.toLocaleLowerCase('nb-NO').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  if (/^(hei(?: hei| sven)?|heisann|hallo(?: sven)?|god (?:morgen|dag|kveld)|hello|hi|hey)$/.test(words)) {
    return /^(hello|hi|hey)$/.test(words)
      ? 'Hi! What would you like to explore?'
      : 'Hei! Hva vil du undersøke eller snakke om i dag?'
  }
}

async function loadSnapshot(file, signal) {
  const response = await fetch(snapshot + file, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  if (!response.ok) throw new Error('Fellestalls datagrunnlag er utilgjengelig')
  return response.text()
}

async function resolveSources(question, signal) {
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
} = {}) {
  let busy = false
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
    const payload = req.body
    const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
    const history = payload?.history ?? []
    if (!question || question.length > 2000 || !Array.isArray(history) || history.length > 6 ||
        history.some(turn => !['user', 'assistant'].includes(turn?.role) ||
          typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 1200)) {
      return send(400, { error: 'Skriv et spørsmål på opptil 2000 tegn.' })
    }
    const reply = openingReply(question)
    const sendReply = summary => send(200, { summary, findings: [], uncertainties: [], recommendation: null, sources: [] })
    if (reply) return sendReply(reply)
    if (!apiKey) return send(503, { error: 'Sven-nøkkelen mangler i denne Vercel-previewen.' })
    if (busy) return send(429, { error: 'Sven undersøker et annet spørsmål. Prøv igjen snart.' })
    busy = true
    const signal = AbortSignal.timeout(150_000)
    let phase = 'plan'
    try {
      const request = createRequest({ apiKey, model, timeoutMs: 55_000 })
      const result = await researchWithSven({
        question, history, signal, maxSearches: 3, conversational: true,
        editorialExamples: selectEditorialExamples({ question }, [example]),
        localSources: query => sources(query, signal),
        request: input => {
          phase = input.phase
          return request({ ...input, maxTokens: Math.min(input.maxTokens ?? 2400, 3600) })
        },
      })
      if (result.status === 'conversation') return sendReply(result.reply)
      if (result.status === 'no-evidence') {
        return send(422, { error: 'Jeg fant ikke kilder som kunne underbygge et svar på dette. Hvis du har en kilde, kan du gjerne dele den.' })
      }
      if (result.status !== 'reviewed') {
        return send(422, { error: 'Sven fant mangler i svaret. Prøv et mer avgrenset spørsmål.' })
      }
      const used = new Set([...result.answer.findings, result.answer.recommendation]
        .filter(Boolean).flatMap(finding => finding.sourceIds))
      const links = result.sources.filter(source => used.has(source.id) && source.url?.startsWith('https://'))
        .map(({ title, url }) => ({ title, url }))
      return send(200, { ...result.answer, sources: links })
    } catch (error) {
      console.warn('[Sven preview]', phase, String(error?.message).match(/^Claude API svarte HTTP \d{3}$/)?.[0] ?? error?.name)
      const limited = /HTTP (402|429)$/.test(error?.message)
      return send(limited ? 429 : 502, { error: limited
        ? 'Claude har nådd en bruksgrense. Vent litt eller sjekk Sven-budsjettet.'
        : 'Sven kunne ikke svare akkurat nå. Prøv igjen.' })
    } finally {
      busy = false
    }
  }
}

export default hostedPreview()
