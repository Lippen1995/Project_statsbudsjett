import { brotliCompress, brotliDecompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const compress = promisify(brotliCompress)
const decompress = promisify(brotliDecompress)
const origin = 'https://fellestall.no/data/'
const freshness = 120_000

function compactKostra(file, raw) {
  if (file === 'kostra/index.json') {
    const { latestYear, years, updated, entities, sources, incomeEqualization } = JSON.parse(raw)
    const taxBase=Object.fromEntries(Object.entries(incomeEqualization??{}).filter(([year])=>Number(year)>=2024).map(([year,rows])=>
      [year,Object.fromEntries(Object.entries(rows).filter(([id])=>id.startsWith('municipality:')).map(([id,row])=>[
        id,{population:row.population,taxBefore:{amount:row.taxBefore?.amount},equalization:{amount:row.equalization?.amount},
          basis:row.basis,sourceUrl:row.sourceUrl},
      ]))]))
    return JSON.stringify({ latestYear, years, updated, ...(Object.keys(taxBase).length?{incomeEqualization:taxBase}:{}),
      sources: sources.filter(source => ['12137', '12362', '07022'].includes(source.source_table)),
      entities: entities.filter(entity => entity.kind === 'municipality')
        .map(({ id, name, code, kind, peer_group_id }) => ({ id, name, code, kind, peer_group_id })),
    })
  }
  if (file.startsWith('kostra/entities/')) {
    const { entity, latestYear, overview, services, boundaryHistory, stateFlows, blockGrantCalculation } = JSON.parse(raw)
    return JSON.stringify({ entity, latestYear, overview, services, boundaryHistory, stateFlows, blockGrantCalculation })
  }
  return raw
}

export function snapshotLoader({ cache, fetchImpl = fetch, now = Date.now }) {
  const inFlight = new Map()
  async function load(file, refresh) {
    const key = `snapshot-v4:${file}`
    let saved
    try { saved = await cache.get(key) } catch { /* Read the authoritative snapshot. */ }
    const decode = async () => (await decompress(Buffer.from(saved.data, 'base64'))).toString('utf8')
    if (!refresh && saved?.data && saved.freshUntil > now()) {
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
  return async (file, signal, {refresh=false} = {}) => {
    signal?.throwIfAborted()
    const key = refresh ? 'refresh:' + file : file
    if (!inFlight.has(key)) {
      inFlight.set(key, load(file,refresh).finally(() => inFlight.delete(key)))
    }
    const data = await inFlight.get(key)
    signal?.throwIfAborted()
    return data
  }
}
