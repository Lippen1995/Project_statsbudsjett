import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { digest } from '../../server/sven/benchmark.mjs'

const endpoint = 'https://api.anthropic.com/v1/messages/batches'
const batchId = /^msgbatch_[A-Za-z0-9]+$/
const waiting = Symbol('next batch wave')

export function anthropicBatch({ apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch, wait = setTimeout } = {}) {
  if (!apiKey) throw new Error('Sett ANTHROPIC_API_KEY for den interne batchkjøringen')
  async function send(path, body) {
    const response = await fetchImpl(endpoint + path, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw new Error(`Anthropic Batch svarte HTTP ${response.status}`)
    return response
  }
  return {
    async create(requests) {
      const { id } = await (await send('', { requests })).json()
      if (!batchId.test(id)) throw new Error('Ugyldig batch-ID fra Anthropic')
      return id
    },
    async results(id) {
      if (!batchId.test(id)) throw new Error('Ugyldig batch-ID')
      let status
      do {
        status = await (await send('/' + id)).json()
        if (status.id !== id || !['in_progress', 'canceling', 'ended'].includes(status.processing_status)) {
          throw new Error('Ugyldig batchstatus fra Anthropic')
        }
        if (status.processing_status !== 'ended') await wait(10_000)
      } while (status.processing_status !== 'ended')
      const data = await (await send('/' + id + '/results')).text()
      if (!Number.isFinite(Date.parse(status.ended_at))) throw new Error('Batchen mangler ferdigtid')
      return { endedAt: status.ended_at, rows: data.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)) }
    },
  }
}

export async function runInternalBatch({
  file, model, signature, tasks, execute, batch = anthropicBatch(), recoverId,
  progress = message => console.error(message),
}) {
  if (typeof model !== 'string' || !model) throw new Error('Sett SVEN_MODEL for den interne batchkjøringen')
  if (!tasks.length || new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Ugyldige testsaker')
  const lock = file + '.lock'
  await writeFile(lock, String(process.pid), { mode: 0o600, flag: 'wx' })
  try {
    let state
    try { state = JSON.parse(await readFile(file, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    const identity = digest({ signature, model, tasks })
    if (state && state.identity !== identity) throw new Error('Batchfilen tilhører et annet testgrunnlag eller en annen modell')
    state ??= {
      identity, startedAt: new Date().toISOString(), cases: tasks.map(() => ({ phases: {}, local: {} })),
    }
    async function save() {
      const temp = file + '.tmp'
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 })
      await rename(temp, file)
    }
    if (recoverId) {
      if (!state.pending || state.pending.id || !batchId.test(recoverId)) throw new Error('Ingen ukjent innsending å koble til denne batch-ID-en')
      // Confirm ownership by matching every custom_id before storing the supplied ID.
      const candidate = await batch.results(recoverId)
      await accept(candidate)
    }

    async function accept({ rows, endedAt }) {
      const expected = new Map(state.pending.entries.map(entry => [entry.custom_id, entry]))
      if (rows.length !== expected.size || new Set(rows.map(row => row.custom_id)).size !== expected.size ||
          rows.some(row => !expected.has(row.custom_id) || !['succeeded', 'errored', 'canceled', 'expired'].includes(row.result?.type))) {
        throw new Error('Batchresultatene samsvarer ikke med de innsendte testtrinnene')
      }
      for (const row of rows) {
        const { index, phase, hash } = expected.get(row.custom_id)
        state.cases[index].phases[phase] = { hash, ...row.result, endedAt }
      }
      delete state.pending
      await save()
    }

    for (;;) {
      if (state.pending) {
        if (!state.pending.id) {
          throw new Error('Forrige innsending har ukjent status. Finn batch-ID i Anthropic Console og bruk --batch-id=<id>. En ny batch sendes ikke.')
        }
        await accept(await batch.results(state.pending.id))
      }
      const entries = []
      for (const [index, task] of tasks.entries()) {
        const record = state.cases[index]
        if (record.result) continue
        let requested = false
        try {
          const request = async ({ phase = 'answer', instructions, input, tools, maxTokens = 4096 }) => {
            const params = { model, system: instructions, messages: [{ role: 'user', content: input }],
              max_tokens: maxTokens, ...(tools ? { tools } : {}) }
            const hash = digest(params)
            const previous = record.phases[phase]
            if (previous) {
              if (previous.hash !== hash) throw new Error('Inputen til et tidligere modelltrinn er endret')
              if (previous.type !== 'succeeded' || previous.message?.stop_reason !== 'end_turn') {
                throw Object.assign(new Error('Modelltrinnet leverte ikke et fullstendig svar'),
                  { name: previous.type === 'expired' ? 'TimeoutError' : 'Error' })
              }
              return { ...previous.message, _svenReceivedAt: previous.endedAt }
            }
            requested = true
            entries.push({ index, phase, hash, custom_id: randomUUID(), params })
            throw waiting
          }
          const freeze = async (key, read) => {
            if (!Object.hasOwn(record.local, key)) {
              try { record.local[key] = { value: await read() } }
              catch { record.local[key] = { missing: true } }
            }
            if (record.local[key].missing) throw new Error('Det fryste kildeoppslaget mangler grunnlag')
            return record.local[key].value
          }
          const value = await execute(task, { request, freeze, waiting })
          if (!requested) record.result = { status: 'completed', value }
        } catch (error) {
          if (error !== waiting && !requested) {
            record.result = { status: error.name === 'TimeoutError' ? 'timeout' : 'failed', error: error.message }
          }
        }
      }
      if (!entries.length) {
        await save()
        return state.cases.map(({ result, phases }, index) => ({ id: tasks[index].id, ...result,
          startedAt: state.startedAt, phases: Object.entries(phases).map(([phase, step]) =>
            ({ phase, usage: step.message?.usage, endedAt: step.endedAt, type: step.type })),
        }))
      }
      state.pending = { entries }
      await save()
      state.pending.id = await batch.create(entries.map(({ custom_id, params }) => ({ custom_id, params })))
      await save()
      progress(`Batch ${state.pending.id}: ${entries.length} interne modelltrinn.`)
    }
  } finally { await unlink(lock) }
}
