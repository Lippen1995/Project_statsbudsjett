// Shared, integer-valued ticks. Focused line axes get visible padding; bar
// lengths always use a zero baseline. Display bounds never change observations.
export function plotScale(values, includeZero = true) {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw Error('Ugyldige grafverdier')
  let low = Math.min(...values), high = Math.max(...values)
  if (includeZero) { low = Math.min(0, low); high = Math.max(0, high) }
  else { const padding = (high - low || Math.max(1, Math.abs(low) * .1)) * .1; low -= padding; high += padding }
  const raw = (high - low || 1) / 5
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, Math.ceil([1, 2, 2.5, 5, 10].find(n => n * magnitude >= raw) * magnitude))
  const min = Math.floor(low / step) * step
  const max = Math.max(min + step, Math.ceil(high / step) * step)
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) }
}

// Total change between the first and last frozen observations, never an
// annualized rate or a regression trend. A zero/negative base is not a growth rate.
export function periodChange(values) {
  if (values.length < 2 || values.some(v => !Number.isFinite(v)) || values[0] <= 0) return null
  return (values.at(-1) / values[0] - 1) * 100
}
