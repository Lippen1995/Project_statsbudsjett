/** Endringene er sortert med største økning først. */
export function vannfallStolper(endr) {
  const topp = endr.filter((r) => r.delta > 0).slice(0, 6)
    .concat(endr.filter((r) => r.delta < 0).slice(-4))
  const sett = new Set(topp.map((r) => r.node.i))
  const restRader = endr.filter((r) => !sett.has(r.node.i))
  const stolper = topp.map((r) => ({ navn: r.navn, v: r.delta, node: r.node }))
  if (restRader.length) {
    stolper.push({
      navn: 'Øvrige',
      v: restRader.reduce((sum, r) => sum + r.delta, 0),
      rest: restRader.map((r) => r.node),
    })
  }
  return stolper
}
