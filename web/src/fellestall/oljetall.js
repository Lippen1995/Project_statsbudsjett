/** Siste tilgjengelige utfall/budsjett. Metadata skiller manglende regnskap fra nullbeløp. */
export function oljeTidsserie(data) {
  const kapitler = data.inntekter.flatMap((d) => (d.c ?? []).filter((k) => k.x))
  const regnskapAar = new Set(data.meta.regnskap_aar.map(Number))
  const aar = [...new Set(kapitler.flatMap((k) => Object.keys(k.s ?? {}).map(Number)))].sort((a, b) => a - b)
  const typer = [[0, 'Regnskap'], [2, 'Revidert budsjett'], [1, 'Saldert budsjett'], [3, 'Foreslått budsjett']]
  return aar.flatMap((y) => {
    const aktive = kapitler.filter((k) => k.s?.[y])
    const valgt = typer.find(([si]) => (si !== 0 || regnskapAar.has(y)) && aktive.every((k) => k.s[y][si] != null))
    if (!valgt) return []
    const [si, type] = valgt
    const belop = aktive.reduce((sum, k) => sum + k.s[y][si], 0)
    const fond = data.fondsverdi?.[y - 1]
    const folk = data.befolkning?.[y]
    return [{ aar: y, type, budsjett: si !== 0, belop, prosent: fond > 0 ? belop / fond * 100 : null, perPerson: folk > 0 ? belop * 1e6 / folk : null }]
  })
}

/** Koble budsjettlinjen til siste regnskap, uten å vise eldre budsjetter som utfall. */
export function oljeGrafSerier(rader, felt, farge) {
  const sisteRegnskap = rader.findLastIndex((r) => !r.budsjett)
  return [
    { farge, navn: 'Regnskap', punkter: rader.map((r) => ({ v: r.budsjett ? null : r[felt] })) },
    { farge, navn: 'Siste budsjett', stiplet: true, punkter: rader.map((r, i) => ({ v: r.budsjett || (i === sisteRegnskap && rader[i + 1]?.budsjett) ? r[felt] : null })) },
  ]
}

/** Finansdepartementets anslag må holdes adskilt fra bokførte overføringer. */
export function oljeMakroTidsserie(data) {
  const regnskapAar = new Set(data.meta.regnskap_aar.map(Number))
  const fra = Math.min(...regnskapAar)
  const typer = [['regnskap', 'Historisk anslag'], ['revidert', 'Revidert budsjett'], ['saldert', 'Saldert budsjett'], ['forslag', 'Foreslått budsjett']]
  return Object.entries(data.oljepengebruk?.serier ?? {})
    .filter(([y]) => Number(y) >= fra)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([y, serier]) => {
      const valgt = typer.find(([serie]) => (serie !== 'regnskap' || regnskapAar.has(Number(y))) && Number.isFinite(serier[serie]?.strukturelt))
      if (!valgt) return []
      const [serie, type] = valgt
      const verdi = serier[serie]
      const fond = data.fondsverdi?.[Number(y) - 1]
      const folk = data.befolkning?.[y]
      return [{ ...verdi, aar: Number(y), serie, type, budsjett: serie !== 'regnskap', belop: verdi.strukturelt,
        prosent: fond > 0 ? verdi.strukturelt / fond * 100 : verdi.prosent_fond ?? null,
        fondsanslag: !(fond > 0) && verdi.prosent_fond != null,
        perPerson: folk > 0 ? verdi.strukturelt * 1e6 / folk : null }]
    })
}

/** Positiv overføringsdifferanse er overskudd først når året er gjort opp. */
export function oljeDifferanser(overforing, makro) {
  if (!makro) return null
  return {
    strukturell: makro.belop - makro.oljekorrigert,
    overforing: overforing ? overforing.belop - makro.oljekorrigert : null,
  }
}

/** Begge pengestrømmer bruker samme budsjettversjon før netto beregnes. */
export function oljeStromTidsserie(data) {
  const inn = data.utgifter.flatMap((d) => (d.c ?? []).filter((k) => k.x))
  const ut = data.inntekter.flatMap((d) => (d.c ?? []).filter((k) => k.x))
  const regnskap = new Set(data.meta.regnskap_aar.map(Number))
  const aar = [...new Set([...inn, ...ut].flatMap((k) => Object.keys(k.s ?? {}).map(Number)))].sort((a, b) => a - b)
  const typer = [[0, 'Regnskap'], [2, 'Revidert budsjett'], [1, 'Saldert budsjett'], [3, 'Foreslått budsjett']]
  return aar.flatMap((y) => {
    const til = inn.filter((k) => k.s?.[y])
    const fra = ut.filter((k) => k.s?.[y])
    if (!til.length || !fra.length) return []
    const valgt = typer.find(([si]) => (si !== 0 || regnskap.has(y)) && [...til, ...fra].every((k) => Number.isFinite(k.s[y][si])))
    if (!valgt) return []
    const [si, type] = valgt
    const innskudd = til.reduce((sum, k) => sum + k.s[y][si], 0)
    const overforing = fra.reduce((sum, k) => sum + k.s[y][si], 0)
    return [{ aar: y, type, budsjett: si !== 0, innskudd, overforing, netto: innskudd - overforing }]
  })
}
