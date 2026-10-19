// Reproducible arithmetic over frozen accounting and official SSB observations.
// References only: the plan never supplies amounts, years or observations.
export function calculateResearch(report) {
  const plan = report.researchPlan
  if (plan === undefined) return { facts: {}, series: [] }
  if (report.kind !== 'real-expenditure-per-capita' || !Array.isArray(plan) || !plan.length || plan.length > 5)
    throw Error('Ugyldig beregningsplan')
  const facts = {}, series = [], ids = new Set()
  const fmt = (v, digits = 1) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits }).format(v)
  const add = (key, value, text, label) => {
    if (!Number.isFinite(value)) throw Error('Ugyldig beregnet verdi')
    facts[key] = { value, text, label }
  }
  const item = (id) => {
    const e = report.eventEvidence?.items.find(e => e.id === id)
    if (!e) throw Error('Beregningen mangler regnskapspost')
    return e
  }
  for (const p of plan) {
    if (!p || !/^[A-Za-z]{1,24}$/.test(p.id ?? '') || ids.has(p.id)) throw Error('Ugyldig beregningsidentitet')
    ids.add(p.id)
    const prefix = `calc${p.id}`
    let rows, unit, label
    if (p.kind === 'exclude-chapters') {
      if (Object.keys(p).some(k => !['id', 'kind', 'evidenceIds'].includes(k)) || !Array.isArray(p.evidenceIds) || !p.evidenceIds.length || new Set(p.evidenceIds).size !== p.evidenceIds.length)
        throw Error('Ugyldig justeringsutvalg')
      const excluded = p.evidenceIds.map(item), nodes = excluded.flatMap(e => e.nodeIds)
      if (nodes.some(n => !/^u-\d{2}-\d{4}$/.test(n)) || nodes.some((n, i) => nodes.indexOf(n) !== i))
        throw Error('Justeringen krever adskilte hele kapitler')
      rows = report.rows.map(r => {
        const amount = excluded.reduce((s, e) => {
          const v = e.rows.find(x => x.year === r.year)
          if (!v || !Number.isFinite(v.expenditure) || v.expenditure < 0) throw Error('Ufullstendig justeringsgrunnlag')
          // Only subtract the chapter's booked contribution to this scope.
          // Absence after a documented transfer does not mean zero national expenditure.
          return s + v.expenditure
        }, 0)
        const value = r.expenditure - amount
        if (!(value > 0)) throw Error('Justeringen fjerner hele regnskapet')
        return { year: r.year, value, cpi: r.cpi, population: r.population }
      })
      unit = 'mill. kr'; label = 'Departementsutgifter uten valgte kapitler'
      const first = rows[0], last = rows.at(-1)
      const nominal = (last.value / first.value - 1) * 100
      const real = (last.value / first.value * first.cpi / last.cpi - 1) * 100
      const perCapita = (last.value / first.value * first.cpi / last.cpi * first.population / last.population - 1) * 100
      add(prefix+'NominalGrowth', nominal, fmt(nominal)+' %', 'Nominell vekst uten valgte kapitler')
      add(prefix+'RealGrowth', real, fmt(real)+' %', 'KPI-justert samlet vekst uten valgte kapitler')
      add(prefix+'RealPerCapitaGrowth', perCapita, fmt(perCapita)+' %', 'KPI-justert vekst per innbygger uten valgte kapitler')
    } else if (p.kind === 'per-observation') {
      if (Object.keys(p).some(k => !['id', 'kind', 'numerator', 'denominator'].includes(k))) throw Error('Ugyldig forholdstallsplan')
      const numerator = item(p.numerator), denominator = report.ssbEvidence?.find(e => e.id === p.denominator)
      if (!denominator || !['personer', 'antall'].includes(denominator.unit)) throw Error('Forholdstallet mangler offisielt personantall')
      rows = report.rows.map(r => {
        const n = numerator.rows.find(x => x.year === r.year), d = denominator.rows.find(x => x.year === r.year)
        if (!n?.reported || !Number.isFinite(n.expenditure) || !(d?.value > 0)) throw Error('Manglende år eller ugyldig nevner i forholdstall')
        return { year:r.year, value:n.expenditure*1e6/d.value, cpi:r.cpi, population:r.population }
      })
      unit='kr per registrert person';label='Regnskapsført bevilgning per registrert student'
      const f=rows[0],l=rows.at(-1)
      add(prefix+'NominalGrowth',(l.value/f.value-1)*100,fmt((l.value/f.value-1)*100)+' %','Nominell endring per registrert person')
      add(prefix+'RealGrowth',(l.value/f.value*f.cpi/l.cpi-1)*100,fmt((l.value/f.value*f.cpi/l.cpi-1)*100)+' %','KPI-justert endring per registrert person')
    } else throw Error('Ukjent beregningsoperasjon')
    const first=rows[0],last=rows.at(-1)
    const amount = v => unit==='mill. kr'?fmt(v/1000)+' mrd. kr':fmt(v,0)+' kr'
    add(prefix+'Start',first.value,amount(first.value),label+' i første år')
    add(prefix+'End',last.value,amount(last.value),label+' i siste år')
    series.push({id:p.id,label,unit,rows:rows.map(({year,value})=>({year,value})),source:'Beregnet fra analysens frosne DFØ- og SSB-grunnlag'})
    series.push({id:p.id+'Real',label:label+' i faste priser',unit:unit+' i faste priser',rows:rows.map(r=>({year:r.year,value:r.value*last.cpi/r.cpi})),source:'Frosset regnskap og SSB, KPI-justert til sluttårets priser'})
  }
  return {facts,series}
}
