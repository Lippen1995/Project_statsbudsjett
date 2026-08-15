const PALETTE = ['#F3E6D8', '#E9C7AF', '#D99D7D', '#C97052', '#9F3F2C']

export function parseKostraRoute(hash = '') {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] !== 'kostra') return { page: 'map', countyCode: null }
  if (parts[1] === 'kommune' && /^\d{4}$/.test(parts[2] ?? '')) {
    return { page: 'detail', kind: 'municipality', code: parts[2] }
  }
  if (parts[1] === 'fylke' && /^\d{2}$/.test(parts[2] ?? '')) {
    if (parts[3] === 'detaljer') {
      return { page: 'detail', kind: 'county', code: `${parts[2]}00` }
    }
    return { page: 'map', countyCode: parts[2] }
  }
  return { page: 'map', countyCode: null }
}

export function mapValue(index, metricId, year, entityId, mode) {
  const point = index?.values?.[metricId]?.[year]?.[entityId]
  return point?.[mode] ?? null
}

export function choroplethColor(value, values) {
  if (value == null || !Number.isFinite(value)) return '#E3DED4'
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return PALETTE[0]
  const rank = sorted.findIndex((candidate) => candidate >= value)
  const percentile = (rank < 0 ? sorted.length - 1 : rank) / Math.max(1, sorted.length - 1)
  return PALETTE[Math.min(PALETTE.length - 1, Math.floor(percentile * PALETTE.length))]
}

export function formatKostraValue(value, mode) {
  if (value == null) return '–'
  if (mode === 'perCapita') {
    return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value)} kr`
  }
  const mill = value / 1000
  const abs = Math.abs(mill)
  const sign = mill < 0 ? '−' : ''
  if (abs >= 1000) return `${sign}${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(abs / 1000)} mrd.`
  return `${sign}${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(abs)} mill.`
}

export function metricSeries(index, metricId, entityId, mode) {
  return index.years.map((year) => ({ v: mapValue(index, metricId, year, entityId, mode) }))
}

