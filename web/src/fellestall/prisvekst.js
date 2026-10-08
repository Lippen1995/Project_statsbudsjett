import { sumRot } from './kompakt.js'

/** Regnskap overtar budsjettet; ellers velges siste tilgjengelige budsjettfase. */
export function prisvekstRader(data, uRot) {
  const regnskap = new Set(data.meta.regnskap_aar.map(Number))
  const aar = [...new Set([...data.meta.regnskap_aar, ...data.meta.budsjett_aar].map(Number))].sort((a, b) => a - b)
  const kpi = { ...data.prisvekstAnslag?.kpi, ...data.kpi }
  const folk = { ...data.prisvekstAnslag?.befolkning, ...data.befolkning }
  const typer = [[0, 'Regnskap'], [2, 'Revidert budsjett'], [1, 'Saldert budsjett'], [3, 'Regjeringens budsjettforslag']]
  return aar.flatMap((y) => {
    const valgt = typer.find(([si]) => (si !== 0 || regnskap.has(y)) && uRot.some((n) => n.s?.[y]?.[si] != null))
    if (!valgt || !(kpi[y] > 0) || !(folk[y] > 0)) return []
    const [si, type] = valgt
    return [{ aar: y, type, budsjett: si !== 0, anslag: !data.kpi?.[y] || !data.befolkning?.[y],
      kpi: kpi[y], perInnbygger: sumRot(uRot, y, si) * 1e6 / folk[y] }]
  })
}
