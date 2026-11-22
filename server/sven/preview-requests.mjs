import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const validRequestId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
const cacheKey = id => 'request-v1:' + createHash('sha256').update(id).digest('hex')

function seal(id, value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(id, 'hex'), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

function unseal(id, value) {
  const bytes = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(id, 'hex'), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
}

export function previewRequests(cache) {
  const active = new Set()
  const pending = { status: 202, body: { pending: true } }
  async function read(id) {
    try {
      const entry = await cache.get(cacheKey(id))
      if (entry?.pending) return pending
      return entry?.result ? unseal(id, entry.result) : null
    } catch { return null }
  }
  async function store(id, value, ttl) {
    try { await cache.set(cacheKey(id), value, { ttl, name: 'Sven preview request' }) }
    catch { /* A failed write never triggers another model call. */ }
  }
  return {
    async resume(id) {
      if (active.has(id)) return pending
      return await read(id) ?? {
        status: 410, body: { error: 'Jeg fant ikke status for denne innsendingen. Du kan velge å sende et nytt spørsmål.' },
      }
    },
    async run(id, execute) {
      if (active.has(id)) return pending
      active.add(id)
      try {
        const existing = await read(id)
        if (existing) return existing
        await store(id, { pending: true }, 180)
        const result = await execute()
        await store(id, { result: seal(id, result) }, 900)
        return result
      } finally { active.delete(id) }
    },
  }
}
