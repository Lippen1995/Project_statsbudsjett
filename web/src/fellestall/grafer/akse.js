/** Fordel opptil fem årsetiketter jevnt, alltid med første og siste år. */
export function yearTickIndices(length, maxTicks = 5) {
  if (length <= 0) return []
  const count = Math.min(length, Math.max(2, maxTicks))
  if (length <= count) return Array.from({ length }, (_, index) => index)
  return [...new Set(Array.from(
    { length: count },
    (_, index) => Math.round(index * (length - 1) / (count - 1)),
  ))]
}
