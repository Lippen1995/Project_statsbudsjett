import { brotliCompress, brotliDecompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const compress = promisify(brotliCompress)
const decompress = promisify(brotliDecompress)
const origin = 'https://fellestall.no/data/'
const freshness = 120_000

function compactKostra(file, raw) {
  if (file === 'kostra/index.json') {
    const { latestYear, updated, entities, sources } = JSON.parse(raw)
    return JSON.stringify({ latestYear, updated,
      sources: sources.filter(source => source.source_table === '12137'),
      entities: entities.filter(entity => entity.kind === 'municipality')
        .map(({ name, code, kind }) => ({ name, code, kind })),
    })
  }
  if (file.startsWith('kostra/entities/')) {
    return JSON.stringify({ overview: JSON.parse(raw).overview })
  }
  return raw
}

export function snapshotLoader({ cache, fetchImpl = fetch, now = Date.now }) {
  const inFlight = new Map()
  async function load(file) {
    const key = `snapshot-v1:${file}`
    let saved
    try { saved = await cache.get(key) } catch { /* Read the authoritative snapshot. */ }
    const decode = async () => (await decompress(Buffer.from(saved.data, 'base64'))).toString('utf8')
    if (saved?.data && saved.freshUntil > now()) {
      try { return await decode() } catch { saved = null }
    }
    const headers = saved?.etag ? { 'If-None-Match': saved.etag } : undefined
    const response = await fetchImpl(origin + file, { headers, signal: AbortSignal.timeout(8000) })
    let data
    let etag
    if (response.status === 304 && saved?.data) {
      data = await decode()
      etag = saved.etag
    } else {
      if (!response.ok) throw new Error('Fellestalls datagrunnlag er utilgjengelig')
      data = compactKostra(file, await response.text())
      etag = response.headers.get('etag')
    }
    try {
      const packed = response.status === 304 ? saved.data : (await compress(data, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
      })).toString('base64')
      if (packed.length < 1_900_000) {
        await cache.set(key, { data: packed, etag, freshUntil: now() + freshness }, { ttl: 3600, tags: ['sven-public-snapshots'] })
      }
    } catch { /* A cache write must not prevent a fresh answer. */ }
    return data
  }
  return async (file, signal) => {
    signal?.throwIfAborted()
    if (!inFlight.has(file)) {
      inFlight.set(file, load(file).finally(() => inFlight.delete(file)))
    }
    const data = await inFlight.get(file)
    signal?.throwIfAborted()
    return data
  }
}
