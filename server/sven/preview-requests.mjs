import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export const validRequestId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
const cacheKey = id => 'request-v2:' + createHash('sha256').update(id).digest('hex')
const ttl = 900

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

export function previewRequests(cache, { now = Date.now, leaseMs = 175_000 } = {}) {
  const active = new Set()
  const pending = { status: 202, body: { pending: true } }
  const missing = {
    status: 410, body: { error: 'Jeg fant ikke status for denne innsendingen. Du kan velge å sende et nytt spørsmål.' },
  }
  const uncertain = {
    status: 409, body: { error: 'Et tidligere modellkall mangler bekreftet resultat. Sven sender det ikke på nytt automatisk.' },
  }
  function write(id, state) {
    const value = seal(id, state)
    if (value.length > 1_900_000) throw new Error('Undersøkelsen er for stor til å lagre i previewen')
    return cache.set(cacheKey(id), value, { ttl, name: 'Sven preview request' })
  }
  async function advance(id, execute, brief) {
    if (active.has(id)) return pending
    active.add(id)
    try {
      const encrypted = await cache.get(cacheKey(id))
      const saved = encrypted ? unseal(id, encrypted) : null
      if (saved?.result) return saved.result
      if (saved && (brief || saved.leaseUntil > now())) return pending
      if (!saved && !brief) return missing
      const state = saved ?? { brief, steps: {} }
      if (Object.values(state.steps).some(step => step.running)) return uncertain
      state.leaseUntil = now() + leaseMs
      await write(id, state)
      async function memo(phase, input, work, { billable = false, beforeStart } = {}) {
        const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
        const previous = state.steps[phase]
        if (previous) {
          if (previous.digest !== digest || previous.running) throw new Error('Trinnet kan ikke trygt gjenbrukes')
          return previous.value
        }
        beforeStart?.()
        state.phase = phase
        if (billable) state.steps[phase] = { digest, running: true }
        await write(id, state)
        const value = await work()
        state.steps[phase] = { digest, value }
        await write(id, state)
        return value
      }
      const result = await execute(state.brief, memo)
      state.leaseUntil = 0
      if (result.status !== 202) state.result = result
      await write(id, state.result ? { result, leaseUntil: 0 } : state)
      return result
    } catch {
      return { status: 503, body: { error: 'Sven kunne ikke lagre fremdriften. Bruk «Hent svar» for å sjekke samme innsending.', recoverable: true } }
    } finally { active.delete(id) }
  }
  return {
    run: (id, brief, execute) => advance(id, execute, brief),
    resume: (id, execute) => advance(id, execute),
    async progress(id) {
      try {
        const encrypted = await cache.get(cacheKey(id))
        if (!encrypted) return {}
        const state = unseal(id, encrypted)
        if (state.result) return { done: true }
        return state.leaseUntil > now() && state.phase ? { phase: state.phase } : {}
      } catch { return {} }
    },
  }
}
