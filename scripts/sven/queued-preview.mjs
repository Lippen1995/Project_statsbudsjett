import { createHash } from 'node:crypto'
import { QueueClient } from '@vercel/queue'
import { hostedPreview } from './hosted-preview.mjs'
import { previewJobCodec, validRequestId } from '../../server/sven/preview-requests.mjs'

const queue = new QueueClient({ region: 'iad1' })
const topic = 'sven-preview-analyses'
const secret = process.env.SVEN_ANTHROPIC_API_KEY
const codec = secret ? previewJobCodec(secret) : null
const retryDelivery = new Error('Sven analysis can still progress')
const retryStorage = new Error('Sven checkpoint temporarily unavailable')

async function publishJob(id, state) {
  const idempotencyKey = createHash('sha256').update(`${id}:${state.revision}`).digest('hex')
  await queue.send(topic, { checkpoint: codec.pack(id, { ...state, leaseUntil: 0 }) }, { idempotencyKey })
}

export const chat = hostedPreview({ publishJob })
export const worker = queue.handleNodeCallback(async packet => {
  if (process.env.VERCEL_ENV !== 'preview' || !codec || typeof packet?.checkpoint !== 'string') return
  let job
  try { job = codec.unpack(packet.checkpoint) } catch { return }
  if (!validRequestId(job?.id) || !Number.isInteger(job.state?.revision)) return
  const result = await chat.work(job.id, job.state)
  if (result.status === 202 && !result.body.background) throw retryDelivery
  if (result.status === 503 && result.body.recoverable) throw retryStorage
}, {
  visibilityTimeoutSeconds: 330,
  retry: (error, metadata) => {
    if (error === retryDelivery) return { afterSeconds: 15 }
    return { afterSeconds: Math.min(120, 10 * metadata.deliveryCount) }
  },
})
