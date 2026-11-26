export const workbenchRouting = `Du kan også velge lens "reconcile" for å avstemme tall fra flere kilder, "delivery" for å spore et politisk løfte til dokumentert gjennomføring, eller "peers" for å finne sammenlignbare kommuner. Ved avstemming, hent begge tall og eventuelle dokumenterte justeringer. Ved løfter, se etter det opprinnelige løftet, formelt vedtak, tildelingsbrev og dokumentasjon av gjennomføring og leveranser. Ved peers velg fellestall, med fokuskommunens navn først i meaning, tjeneste og år. For en politisk kostnadsberegning kan du returnere policy.scenario direkte med action "reply" når oppgaven kun bygger på uttrykkelige forutsetninger. Bruk research først for relevante offentlige inngangstall.`

export const scenarioSchema = `For en interaktiv kostnadsberegning, returner policy.scenario {"title":"kort navn","assumptions":[{"key":"barn","label":"Barn som omfattes","unit":"barn","value":1000,"observationId":"valgfri eksakt observasjon"}],"lines":[{"label":"Redusert inntekt","direction":"cost","factors":["barn","krPerBarnPerMåned"],"firstYearMonths":"månederFørsteÅr","annualMonths":"månederIHelår"}]}. Alle faktorer og begge månedsvariablene må være blant assumptions. Factors ganget sammen skal gi et beløp per måned i kroner. Bruk "saving" for besparelser som trekkes fra. For enkeltutgifter utelat begge månedsfeltene og bruk "oneOff":true. Legg inn 12 eller faktisk antall betalingsmåneder for helår. Velg plausible, tydelig merkede eksempelforutsetninger når brukeren ønsker en beregning med ukjente innganger. Oppgi enhet "måneder" for månedsfelt. Gi sourceId, quote og evt. page for faktorer fra tekstkilder, eller observationId for råtall. En forutsetning uten verifisert kilde behandles som redigerbar antakelse.`

export const workbenchAnswerInstructions = `${scenarioSchema}
For avstemming bruk policy.reconciliation {"title":"…","left":{"label":"…","year":2025,"observationId":"…"},"right":{"label":"…","year":2025,"sourceId":"…","quote":"ordrett utdrag med beløp og helst år","value":1000,"unit":"kr"},"adjustments":[{"label":"hva som legges til eller trekkes fra for å gå fra venstre til høyre","direction":"add|subtract","year":2025,"observationId":"…"}],"context":"avgrensning, fase og om beløpene kan avstemmes","basis":"same-period|difference-only"}. Alle beløp kan refereres med observationId, eller kilde, ordrett quote, value og unit. Bruk kun dokumenterte, ikke-overlappende justeringer for samme år. Dersom måleenhet, år, regnskapsomfang eller fase gjør brua uegnet, bruk difference-only og forklar hvorfor. Resten regnes ut av Fellestall.
For et løfte bruk policy.delivery {"title":"hvilket løfte","stages":[{"stage":"promise|decision|funding|implementation|result","detail":"hva kilden dokumenterer","sourceId":"…","quote":"ordrett utdrag","date":"valgfri YYYY eller YYYY-MM-DD som fremgår av kilden"}]}. Knytt alle ledd til det samme tiltaket og geografien. Behold et trinn tomt hvis kildene ikke dekker det. Et vedtak eller en bevilgning dokumenterer ikke gjennomføring. Resultat betyr observert leveranse eller utfall. Skill det fra tilskrevet samfunnseffekt. Ved peerBenchmark bruk bare tilgjengelige verdier i peerBenchmark og forklar valget og usikkerheten ved utvalget.`

export const workbenchAuditInstructions = `\nKontroller at hver avstemmingsjustering gjelder samme beløp, avgrensning og år, har riktig fortegn og ikke overlapper med en annen. Påpek om to tall er ulike mål. Kontroller at hvert ledd i en løftekjede gjelder samme tiltak, riktig geografi og at utdraget faktisk viser statusen. En forventet leveranse kan ikke merkes som resultat. For scenario, etterprøv enheter, fortegn, betalingsmåneder, førsteår og helår. Ved kommunesammenligning skal antall, gruppe, medianer og forbehold stemme med peerBenchmark.`

export const compactText = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').trim()
const short = (value, length) => typeof value === 'string' && value.trim() && value.length <= length
const validYear = year => Number.isInteger(year) && year >= 1900 && year <= 2199
const tidy = value => Number(value.toPrecision(15))
const moneyScale = new Map([['kr',1],['kroner',1],['nok',1],['1 000 kr',1000],['1000 kr',1000],['tusen kr',1000],['tusen kroner',1000],
  ['mill. kr',1e6],['mill kr',1e6],['millioner kr',1e6],['millioner kroner',1e6],['mill. kroner',1e6],['mrd. kr',1e9],['mrd kr',1e9],
  ['milliarder kr',1e9],['milliarder kroner',1e9],['mrd. kroner',1e9]])

export function policyScenario(raw, getObservation = () => null) {
  if (!short(raw?.title, 160) || !Array.isArray(raw.assumptions) || !Array.isArray(raw.lines) ||
      raw.assumptions.length < 1 || raw.assumptions.length > 16 || raw.lines.length < 1 || raw.lines.length > 6) return null
  const assumptions = new Map()
  for (const item of raw.assumptions) {
    if (!short(item?.key, 48) || !/^[\p{L}\d_-]+$/u.test(item.key) || assumptions.has(item.key) ||
        !short(item.label, 120) || !short(item.unit, 48) || !Number.isFinite(item.value) || item.value < 0 || item.value > 1e13) return null
    const observation = getObservation(item, item.label)
    const observationId = observation?.value === item.value && compactText(observation.unit) === compactText(item.unit) ? observation.id : undefined
    assumptions.set(item.key, { key:item.key, label:item.label, unit:item.unit, value:item.value,
      ...(observationId ? { observationId } : {}) })
  }
  const lines = []
  for (const item of raw.lines) {
    if (!short(item?.label, 140) || !['cost','saving'].includes(item.direction) || !Array.isArray(item.factors) ||
        item.factors.length < 1 || item.factors.length > 4 || new Set(item.factors).size !== item.factors.length ||
        item.factors.some(key=>!assumptions.has(key))) return null
    const monthly = [item.firstYearMonths,item.annualMonths].map(key=>assumptions.get(key))
    if (item.oneOff === true ? item.firstYearMonths !== undefined || item.annualMonths !== undefined :
        monthly.some(input=>!input || compactText(input.unit) !== 'måneder' || !Number.isInteger(input.value) || input.value > 12) ||
        monthly[0].value > monthly[1].value || item.factors.some(key=>[item.firstYearMonths,item.annualMonths].includes(key))) return null
    lines.push({ label:item.label, direction:item.direction, factors:item.factors,
      ...(item.oneOff === true ? { oneOff:true } : { firstYearMonths:item.firstYearMonths, annualMonths:item.annualMonths }) })
  }
  const used = new Set(lines.flatMap(item=>[...item.factors,item.firstYearMonths,item.annualMonths]))
  return { title:raw.title, assumptions:[...assumptions.values()].filter(item=>used.has(item.key)), lines }
}

const stages = Object.freeze([
  { id:'promise',label:'Løfte' }, { id:'decision',label:'Vedtak' }, { id:'funding',label:'Finansiering' },
  { id:'implementation',label:'Gjennomføring' }, { id:'result',label:'Dokumentert resultat' },
])

export function deliveryChain(raw, sources, question, requested) {
  if (!requested && !short(raw?.title,300)) return null
  const entries = Array.isArray(raw?.stages) ? raw.stages.slice(0,15) : []
  return { title:short(raw?.title,300) ? raw.title : question.slice(0,300), stages:stages.map(({id,label})=>{
    const row = entries.find(item=>{
      const source = sources.get(item?.sourceId)
      return item?.stage === id && short(item.detail,700) && short(item.quote,650) && item.quote.trim().length >= 12 &&
        source && (source.url || source.type === 'upload') && compactText(source.text).includes(compactText(item.quote))
    })
    if (!row) return { id,label }
    const date = /^\d{4}(?:-\d{2}-\d{2})?$/.test(row.date ?? '') && row.quote.includes(row.date) ? row.date : undefined
    return { id,label,detail:row.detail,quote:row.quote,sourceId:row.sourceId,...(date ? {date} : {}) }
  }) }
}

export function reconcileAmounts(raw, getObservation, requested) {
  const partial = { title:short(raw?.title,180) ? raw.title : 'Avstemming av tall',
    context:short(raw?.context,750) ? raw.context : 'To etterprøvbare beløp med kjent enhet og periode trengs for å avstemme tallene.' }
  if (!raw?.left || !raw?.right) return requested ? partial : null
  const point = spec => {
    if (!short(spec?.label,160)) return null
    const record = getObservation(spec,spec.label)
    const scale = moneyScale.get(compactText(record?.unit))
    const year = record?.year ?? spec.year
    const value = scale * record?.value
    if (!Number.isFinite(value) || Math.abs(value) > 1e16 || !validYear(year) ||
        Number.isInteger(spec.year) && year !== spec.year || !record.year && !record.quote?.includes(String(year))) return null
    return { label:spec.label,value,year,observationId:record.id,phase:record.phase }
  }
  const left = point(raw.left), right = point(raw.right)
  if (!left || !right || left.observationId === right.observationId) return partial
  const difference = tidy(right.value-left.value)
  if (raw.basis !== 'same-period' || left.year !== right.year || left.phase && right.phase && left.phase !== right.phase) {
    return { ...partial,left,right,difference }
  }
  const used = new Set([left.observationId,right.observationId])
  const adjustments = []
  let unavailable = 0
  for (const spec of Array.isArray(raw.adjustments) ? raw.adjustments.slice(0,12) : []) {
    const row = point(spec)
    if (!row || row.year !== left.year || row.value < 0 || !['add','subtract'].includes(spec.direction) || used.has(row.observationId)) {
      unavailable++
      continue
    }
    used.add(row.observationId)
    adjustments.push({ ...row,value:row.value*(spec.direction === 'add' ? 1 : -1) })
  }
  const explained = tidy(adjustments.reduce((total,item)=>total+item.value,0))
  return { ...partial,left,right,difference,adjustments,explained,residual:tidy(difference-explained),unavailable }
}
