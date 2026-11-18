import { createHash } from 'node:crypto'
const finite = value => typeof value === 'number' && Number.isFinite(value)

export function difference(value, reference) {
  if (!finite(value) || !finite(reference)) return { difference: null, percent: null, reason: 'Manglende observasjon' }
  return { difference: value - reference,
    percent: reference > 0 ? (value / reference - 1) * 100 : null,
    ...(reference > 0 ? {} : {reason:'Prosentavvik er ikke meningsfullt mot null eller negativ referanse'}) }
}

// The chosen municipality never contributes to its own peer baseline. Population
// must be supplied explicitly; never infer it from rounded per-capita figures.
export function comparePeerGroup(observations, targetId, method = 'median') {
  if (!['median','mean','weighted'].includes(method)) throw new Error('Ukjent referansemetode')
  if (!Array.isArray(observations) || observations.some(row=>typeof row.id!=='string'||!row.id||!Number.isInteger(row.year)||typeof row.metric!=='string'||!row.metric||typeof row.scope!=='string'||!row.scope||typeof row.unit!=='string'||!row.unit)) throw new Error('Observasjonene mangler nødvendig metadata')
  const target = observations.find(row => row.id === targetId)
  if (!target || new Set(observations.map(row=>row.id)).size !== observations.length) throw new Error('Ugyldig kommuneutvalg')
  if (observations.some(row => row.year !== target.year || row.unit !== target.unit || row.metric !== target.metric || row.scope !== target.scope)) throw new Error('Observasjonene har ulik periode, enhet, nøkkeltall eller regnskapsomfang')
  const peers = observations.filter(row => row.id !== targetId && finite(row.value))
  const excluded = observations.filter(row => row.id !== targetId && !finite(row.value)).map(row=>row.id)
  if (!peers.length) throw new Error('Ingen observerte sammenligningskommuner')
  let reference
  if (method === 'median') {
    const sorted=peers.map(row=>row.value).sort((a,b)=>a-b), n=sorted.length
    reference=n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2
  } else if (method === 'mean') reference=peers.reduce((sum,row)=>sum+row.value,0)/peers.length
  else {
    if (target.unit !== 'NOK/innbygger' || peers.some(row=>!finite(row.population)||row.population<=0)) throw new Error('Befolkningsvektet snitt krever eksplisitt folketall og kroner per innbygger')
    reference=peers.reduce((sum,row)=>sum+row.value*row.population,0)/peers.reduce((sum,row)=>sum+row.population,0)
  }
  return {targetId,method,reference,peerIds:peers.map(row=>row.id),excludedIds:excluded,...difference(target.value,reference),
    year:target.year,unit:target.unit,metric:target.metric,scope:target.scope}
}

export function deriveMunicipalEvidence(sources) {
  const groups=new Map(), growth=[]
  for(const source of sources) {
    if(!source.id?.startsWith('kostra-'))continue
    let parsed
    try {parsed=JSON.parse(source.text)} catch {continue}
    if(!parsed.kommunenummer || !parsed.metric || !Array.isArray(parsed.data))continue
    const rows=parsed.data.map(row=>({year:row.year,
      nominal:row.amountThousandNok??row.netExpenditureThousandNok??null,
      perCapita:row.amountNokPerCapita??row.netExpenditureNokPerCapita??null})).sort((a,b)=>a.year-b.year)
    for(const row of rows) for(const [field,unit] of [['nominal','1000 NOK'],['perCapita','NOK/innbygger']]) {
      const key=`${parsed.metric}:${row.year}:${field}`
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push({id:parsed.kommunenummer,name:parsed.kommune,value:row[field],year:row.year,metric:parsed.metric,unit,sourceId:source.id})
    }
    for(let i=1;i<rows.length;i++) for(const [field,unit] of [['nominal','1000 NOK'],['perCapita','NOK/innbygger']]) {
      const from=rows[i-1],to=rows[i]
      growth.push({municipality:parsed.kommune,metric:parsed.metric,fromYear:from.year,toYear:to.year,unit,
        from:from[field],to:to[field],...difference(to[field],from[field]),sourceIds:[source.id],
        intervalYears:to.year-from.year,priceBasis:'løpende priser',meaning:'Endring over hele intervallet, ikke nødvendigvis ett år. Ingen kausal tolkning.'})
    }
  }
  const comparisons=[]
  for(const rows of groups.values()) for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++) {
    const left=rows[i],right=rows[j]
    comparisons.push({left:left.name,right:right.name,metric:left.metric,year:left.year,unit:left.unit,
      leftValue:left.value,rightValue:right.value,...difference(left.value,right.value),sourceIds:[left.sourceId,right.sourceId]})
  }
  if(!growth.length&&!comparisons.length)return []
  const text=JSON.stringify({method:'Deterministiske beregninger fra KOSTRA kommunekonsern. Avvik = venstre minus høyre. Prosent = (venstre / høyre - 1) × 100 bare når høyre er positiv. Ingen inflasjons-, behovs- eller oppgavekorrigering. Avvik er ikke et dokumentert sparepotensial.',comparisons,growth})
  const hash=createHash('sha256').update(text).digest('hex')
  return [{id:`calculation-${hash.slice(0,16)}`,title:'Etterprøvbare kommuneberegninger',url:'https://www.ssb.no/statbank/table/12137/',
    evidenceKind:'calculation',derivedFrom:[...new Set([...comparisons,...growth].flatMap(row=>row.sourceIds))],text,hash}]
}
