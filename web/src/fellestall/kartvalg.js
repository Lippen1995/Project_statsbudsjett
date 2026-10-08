export const KART_SERIER = ['Regnskap', 'Saldert budsjett', 'Revidert budsjett', 'Regjeringens budsjettforslag']
export function kartValg(data) {
  const regnskap = new Set(data.meta.regnskap_aar.map(Number))
  const aar = [...new Set([...data.meta.regnskap_aar, ...data.meta.budsjett_aar].map(Number))].sort((a,b)=>a-b)
  return aar.flatMap((y) => KART_SERIER.flatMap((navn,si) => {
    if (si === 0 && !regnskap.has(y)) return []
    const forslag = data.meta.budsjettforslag?.find((p)=>p.year===y)
    if (si === 3 && !forslag) return []
    if (!data.utgifter.some((n)=>n.s?.[y]?.[si]!=null)) return []
    return [{aar:y,si,navn:si===3 ? forslag.label : navn}]
  }))
}

/** Historiske regnskap gir kontekst når en budsjettform bare finnes for ett år. */
export function kartHistorikk(opsjoner, valgt) {
  const aar = [...new Set(opsjoner.map((o) => o.aar))]
  return aar.map((y) => {
    const finn = (si) => opsjoner.find((o) => o.aar === y && o.si === si)
    if (y === valgt.aar) return valgt
    return finn(0) ?? finn(valgt.si) ?? finn(2) ?? finn(1) ?? finn(3)
  })
}
