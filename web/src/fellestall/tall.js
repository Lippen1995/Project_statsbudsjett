/**
 * Tallformatering for Fellestall-visningen.
 *
 * Skiller seg fra lib/format.js på to punkter, og ligger derfor for seg selv:
 * beløp over en milliard skrives «1,2 mrd.» med én desimal, og negative tall
 * bruker typografisk minus (−) framfor bindestrek.
 */

const NF = (d) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: d })

export const n0 = NF(0)
export const n1 = NF(1)
export const n2 = NF(2)

/** Beløp i mill. kr → «12,3 mrd.» / «450 mill.» */
export function belopMill(v) {
  if (v == null) return '–'
  const abs = Math.abs(v)
  const fortegn = v < 0 ? '−' : ''
  if (abs >= 1000) return fortegn + n1.format(abs / 1000) + ' mrd.'
  return fortegn + n0.format(abs) + ' mill.'
}

/** Kronebeløp → «123 400 kr» */
export function kr(v) {
  if (v == null) return '–'
  return (v < 0 ? '−' : '') + n0.format(Math.abs(v)) + ' kr'
}

/** Prosent uten fortegn → «31 %» */
export function pct(v, d = 0) {
  if (v == null) return '–'
  return NF(d).format(v) + ' %'
}

/**
 * Andel av BNP. Postene spenner fra tolv prosent ned til noen tusendeler, så
 * to desimaler er nødvendig – men et beløp som finnes skal ikke vises som
 * «0,00 %», derfor terskelen.
 */
export function pctBnp(mill, bnpMill) {
  if (!bnpMill) return '–'
  const p = (mill / bnpMill) * 100
  if (p === 0) return '0 %'
  if (Math.abs(p) < 0.005) return (p < 0 ? '−' : '') + '<0,01 %'
  return NF(2).format(p) + ' %'
}

/** Fortegn foran et tall, med typografisk minus */
export const medFortegn = (v, tekst) => (v >= 0 ? '+' : '−') + tekst

/** Les et heltall ut av et fritekstfelt («1 234 kr» → 1234) */
export function lesTall(tekst) {
  const v = parseInt(String(tekst).replace(/\D/g, ''), 10)
  return isNaN(v) ? 0 : v
}
