/**
 * Tall-formatering for norsk bokmål.
 * Alle beløp er i mill. kr.
 */

const NB = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 })
const NB0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })
const NB_PCT = new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })

export function formatMillKr(v, { compact = true } = {}) {
  if (v == null) return '–'
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (compact) {
    if (abs >= 1000) return sign + NB.format(abs / 1000) + ' mrd.'
    return sign + NB.format(abs) + ' mill.'
  }
  return sign + NB.format(abs) + ' mill. kr'
}

/** Formater en verdi etter visningsmodus (mill. kr / kr per person / % av BNP) */
export function formatVerdi(v, modus = 'lopende') {
  if (v == null) return '–'
  if (modus === 'person') {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr'
  }
  if (modus === 'bnp') {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(v) + ' %'
  }
  return formatMillKr(v)
}

export function formatPct(v) {
  if (v == null) return '–'
  return NB_PCT.format(v / 100)
}

export function formatAvvik(regnskap, saldert) {
  if (regnskap == null || saldert == null || saldert === 0) return null
  const pct = ((regnskap - saldert) / Math.abs(saldert)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${NB.format(pct)} % ${pct >= 0 ? 'over' : 'under'} saldert budsjett`
}

export function formatCAGR(first, last, years) {
  if (!first || !last || years <= 0) return null
  const rate = (Math.pow(last / first, 1 / years) - 1) * 100
  const sign = rate >= 0 ? '+' : ''
  return `${sign}${NB.format(rate)} % p.a.`
}

export function formatTotalEndring(first, last) {
  if (!first || !last) return null
  const pct = ((last - first) / Math.abs(first)) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${NB0.format(pct)} %`
}
