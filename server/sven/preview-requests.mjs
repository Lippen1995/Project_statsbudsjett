import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { isWebSearchPhase } from './provider.mjs'

export const validRequestId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
const cacheKey = id => 'request-v2:' + createHash('sha256').update(id).digest('hex')
const defaultTtl = 900

function seal(id, value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(id, 'hex'), iv)
  const packed = deflateRawSync(JSON.stringify(value))
  const data = Buffer.concat([cipher.update(packed), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

function unseal(id, value) {
  const bytes = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(id, 'hex'), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(inflateRawSync(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])).toString('utf8'))
}

export function previewRequests(cache, { now = Date.now, leaseMs = 175_000, ttl = defaultTtl } = {}) {
  const active = new Set()
  const pending = { status: 202, body: { pending: true } }
  const missing = {
    status: 410, body: { error: 'Jeg fant ikke status for denne innsendingen. Du kan velge å sende et nytt spørsmål.' },
  }
  const uncertain = {
    status: 409, body: { error: 'Et tidligere modellkall mangler bekreftet resultat. Sven sender det ikke på nytt automatisk.' },
  }
  function write(id, state, lease) {
    const value = seal(id, state)
    if (value.length > 1_900_000) throw new Error('Undersøkelsen er for stor til å lagre i previewen')
    return lease ? lease.set(value) : cache.set(cacheKey(id), value, { ttl, name: 'Sven preview request' })
  }
  async function read(id) {
    const encrypted = await cache.get(cacheKey(id))
    return encrypted ? unseal(id, encrypted) : null
  }
  const backgroundPending = { status: 202, body: { pending: true, background: true } }
  async function enqueue(id, brief, publish) {
    const lease = cache.claim ? await cache.claim(cacheKey(id), leaseMs) : undefined
    if(lease?.gone) return missing
    if(cache.claim&&!lease) return backgroundPending
    try {
      const saved = await read(id)
      const state = saved ?? { brief, steps: {}, revision: 0, phase: 'queued' }
      if (state.result) return state.result
      if (!Number.isInteger(state.revision)) return pending
      // Sending the same revision again is idempotent at the queue. Store the
      // lookup first so even a worker that starts immediately can find it.
      if (!saved) await write(id, state, lease)
      if (!saved || state.phase === 'queued') await publish(id, state)
      return backgroundPending
    } finally {await lease?.release?.()}
  }
  async function backgroundStatus(id) {
    const state = await read(id)
    if (state?.result) return state.result
    if (state?.paused) return state.paused
    return Number.isInteger(state?.revision)
      ? { ...backgroundPending, body: { ...backgroundPending.body, phase: state.phase } }
      : null
  }
  async function advance(id, execute, brief, job, {retryQuota=false}={}) {
    if (active.has(id)) return pending
    active.add(id)
    let lease
    try {
      lease=cache.claim ? await cache.claim(cacheKey(id),leaseMs) : undefined
      if(lease?.gone) return missing
      if(cache.claim&&!lease) return pending
      const save=(state)=>write(id,state,lease)
      const saved = await read(id)
      if (saved?.result) return saved.result
      if(saved?.paused) {
        if(!retryQuota)return saved.paused
        delete saved.paused
      }
      if (job && saved?.revision > job.state.revision) {
        await job.publish(id, saved)
        return backgroundPending
      }
      if (saved && (brief || saved.leaseUntil > now())) return pending
      if (!saved && !brief && !job) return missing
      // A durable job must have an existing checkpoint. Queue copies cannot
      // recreate a deleted or lost checkpoint, including after account erasure.
      if (!saved && job && cache.durable) return missing
      const state = saved ?? (job ? structuredClone(job.state) : { brief, steps: {} })
      const interrupted = Object.entries(state.steps).find(([, step]) => step.running)
      if (interrupted) {
        if(cache.durable) {
          await save({result:uncertain,leaseUntil:0})
          return uncertain
        }
        const [phase, previous] = interrupted
        if (!job) return uncertain
        state.retries ??= {}
        if (!state.retries[phase]) {
          state.retries[phase] = 1
          delete state.steps[phase]
        } else if (isWebSearchPhase(phase) || phase === 'direct-fetch') {
          state.steps[phase] = { digest: previous.digest, value: { content: [], stop_reason: 'pause_turn' } }
        } else {
          const result = { status: 502, body: { error: 'Et modellkall ble avbrutt to ganger. Start en ny analyse for å prøve igjen.' } }
          await save({ result, leaseUntil: 0 })
          return result
        }
      }
      state.leaseUntil = now() + leaseMs
      await save(state)
      async function memo(phase, input, work, { billable = false, beforeStart } = {}) {
        const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
        const previous = state.steps[phase]
        if (previous) {
          if (previous.digest !== digest || previous.running) throw new Error('Trinnet kan ikke trygt gjenbrukes')
          return previous.value
        }
        const permit=await beforeStart?.()
        state.phase = phase
        if (billable) state.steps[phase] = { digest, running: true }
        await save(state)
        let value
        try {value=await work(permit)}
        catch(error) {
          if(error.notBilled||error.meterFinalized){delete state.steps[phase];await save(state)}
          throw error
        }
        state.steps[phase] = { digest, value }
        await save(state)
        return value
      }
      const result = await execute(state.brief, memo)
      state.leaseUntil = 0
      if(result.body?.quotaBlocked) {
        state.paused=result;state.phase='quota'
        await save(state);return result
      }
      const running = Object.values(state.steps).some(step => step.running)
      if (job && running && [429, 502].includes(result.status)) {
        await save(state)
        return pending
      }
      if (result.status !== 202) state.result = result
      if (job && result.body.continuation) state.revision++
      await save(state.result ? { result, leaseUntil: 0 } : state)
      if (job && result.body.continuation) {
        await job.publish(id, state)
        return backgroundPending
      }
      return result
    } catch {
      return { status: 503, body: { error: 'Sven kunne ikke lagre fremdriften. Bruk «Hent svar» for å sjekke samme innsending.', recoverable: true } }
    } finally { if(lease?.release)await lease.release().catch(()=>{}); active.delete(id) }
  }
  async function restartQueued(id,publish) {
    const lease=cache.claim?await cache.claim(cacheKey(id),leaseMs):undefined
    if(lease?.gone)return missing
    if(cache.claim&&!lease)return backgroundPending
    try {
      const state=await read(id)
      if(!state)return missing
      if(state.result)return state.result
      if(state.paused) {
        delete state.paused;state.phase='queued';state.leaseUntil=0;state.revision++
        await write(id,state,lease)
      }
      if(state.phase==='queued')await publish(id,state)
      return backgroundPending
    }finally{await lease?.release?.()}
  }
  return {
    run: (id, brief, execute) => advance(id, execute, brief),
    resume: (id, execute,options) => advance(id, execute,undefined,undefined,options),
    enqueue, backgroundStatus,restartQueued,
    work: (id, state, execute, publish) => advance(id, execute, undefined, { state, publish }),
    async progress(id) {
      try {
        const state = await read(id)
        if (state?.result) return { done: true }
        return state?.phase && (Number.isInteger(state.revision) || state.leaseUntil > now()) ? { phase: state.phase } : {}
      } catch { return {} }
    },
  }
}

export function previewJobCodec(secret) {
  const key = createHmac('sha256', secret).update('fellestall-sven-queue-v1').digest('hex')
  return {
    pack: (id, state) => seal(key, { id, state }),
    unpack: packet => unseal(key, packet),
  }
}
