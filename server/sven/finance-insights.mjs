import { readGrantPayments } from './grant-payments.mjs'
import { officialMunicipalSeries, publicSchoolPupils, statbankDataUrl } from './policy-public-data.mjs'
import { median } from './municipal-peers.mjs'

export const financeLenses = ['transfers','distribution','school-quality','anomalies']
export const financeRouting = `Bruk fellestall når oppgaven trenger offentlige tall. Velg eventuelt ett av disse perspektivene:
transfers for mottakere og faktiske utbetalinger (direkte termindata for kommunalt rammetilskudd, andre ordninger kan kreve nettsøk),
distribution for hvem som får gevinst eller tap av en endring i kommunal inntektsutjevning (oppgi eventuelt finance med symmetric, supplementary og threshold i prosent),
school-quality for kommuneutgifter sammen med mål på skole, anomalies for uvanlige regnskapsendringer sammenlignet med kommunens tidligere år.
Behold kommunen, ordningen, kapittel/post, år og termin i meaning. Når tydelig grunnlag mangler, velg kilden som kan avklare det, eller still ett konkret spørsmål hvis avgrensningen endrer resultatet. Velg flere uavhengige kilder ved behov.`
export const financeAnswerInstructions = `Når policyEvidence.finance finnes, bruk det som beregnet grunnlag og henvis til medfølgende sourceId-er. Utbetaling viser den oppgitte perioden og definisjonen. Summer aldri kolonnen hittil i år på tvers av terminer. Budsjett, rapportert utbetaling og kommunens regnskapsførte inntekt er egne mål. Distribusjon er en simulering med uendret skattegrunnlag og folketall. Behold enheten og vis hvilket år datagrunnlaget gjelder. Ved skole: skill utgift, ressursinnsats og elevutfall. Samsvar over tid gir ikke grunnlag for å tilskrive en effekt. Ved avvik: gi prioritet til det mest betydelige, og se etter bokføring, engangsposter eller endret ansvar dersom det kan avklares. Mulige forklaringer krever kilder for å presenteres som fakta. For andre tilskuddsordninger kan du returnere policy.grantTrail {"title":"navn på ordningen","year":2025,"rows":[{"recipient":"mottaker","stage":"allocated|paid|received","value":123,"unit":"kr","sourceId":"kilde","quote":"ordrett kildeutdrag med beløp og mottaker","page":3}]}. Bruk ordlyden i kilden til å skille tildelt, utbetalt og bokført. Oppgi manglende ledd. Regneark uten ordrett dokumentasjon kan omtales og lenkes i teksten.`
export const financeAuditInstructions = `Kontroller bokføring mot betaler/mottaker og periode, at akkumulerte utbetalinger ikke summeres flere ganger, at simulert omfordeling skiller mellom scenario og observert regnskap, og at skole- og avviksindikatorer ikke gis en årsaksforklaring uten eget grunnlag.`

const kddRules = 'https://www.regjeringen.no/no/dokumenter/prop.-94-s-20252026/id3159220/?ch=9'
const greenBook = 'https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/gront-hefte/id547024/'
const kddTaxBase = 'https://www.regjeringen.no/no/tema/kommuner-og-regioner/kommuneokonomi/inntektssystemet-for-kommuner-og-fylkeskommuner/lopende-inntektsutjevning/id548672/'
const rulesByYear = {2024:60,2025:62}
const supportedPosts = new Set([60,61,62,64,66,67])
const regionKey = 'KOKkommuneregion0000'
const metric = (key,label,unit,contents)=>({key,table:'12255',regionKey,label,unit,options:{ContentsCode:contents}})
const schoolMetrics = [
  metric('group','Gruppestørrelse 2 (elever per lærer, ordinær undervisning)','elever per lærer','KOSgrstr20000'),
  metric('points','Gjennomsnittlige grunnskolepoeng','poeng','KOSgrunnskolepoe0000'),
  metric('reading','Lesing på 8. trinn, mestringsnivå 3–5','%','KOSandles080000'),
  metric('math','Regning på 8. trinn, mestringsnivå 3–5','%','KOSandreg080000'),
]

const round = (value,places=2)=>Number(value.toFixed(places))
const sum = values=>values.reduce((total,value)=>total+value,0)
const amount = value=>Number.isFinite(value?.amount)?value.amount*1000:null
const source = (id,title,url,summary,finance)=>({id,title,url,text:JSON.stringify(summary),...(finance?{finance}: {})})
const observation = (id,field,labels)=>({id:id+'/'+field,sourceId:id,...labels})

export function financeRates(value={}) {
  if (!value || typeof value!=='object') return {}
  return Object.fromEntries(['symmetric','supplementary','threshold'].flatMap(key=>
    Number.isFinite(value[key])&&value[key]>=0&&value[key]<=100?[[key,value[key]]]:[]))
}

export function normalizeGrantTrail(raw, sources, getObservation) {
  if (!raw || typeof raw.title!=='string' || !raw.title.trim() || raw.title.length>180 ||
      !Number.isInteger(raw.year) || raw.year<1900 || raw.year>2199 || !Array.isArray(raw.rows)) return null
  const stages={allocated:'Tildelt',paid:'Utbetalt',received:'Bokført hos mottaker'}
  const currencies=/^(?:kr|kroner|nok|1 000 kr|tusen kroner|mill\. kr|millioner kroner)$/i
  const rows=[]
  for (const spec of raw.rows.slice(0,80)) {
    const source=sources.get(spec?.sourceId)
    if (!source || !Object.hasOwn(stages,spec.stage) || typeof spec.recipient!=='string' || !spec.recipient.trim() ||
        spec.recipient.length>150 || !currencies.test(spec.unit) || typeof spec.quote!=='string' ||
        !spec.quote.toLocaleLowerCase('nb-NO').includes(spec.recipient.toLocaleLowerCase('nb-NO'))) continue
    const exact=getObservation(spec,stages[spec.stage]+' · '+spec.recipient)
    if (exact && !rows.some(row=>row.observationId===exact.id)) rows.push({
      recipient:spec.recipient,stage:spec.stage,label:stages[spec.stage],value:exact.value,unit:exact.unit,observationId:exact.id,
    })
  }
  if (!rows.length) return null
  return {title:raw.title,year:raw.year,rows,
    missing:Object.keys(stages).filter(stage=>!rows.some(row=>row.stage===stage)).map(stage=>stages[stage])}
}

export function simulateEqualization(rows,rates) {
  const population=sum(rows.map(row=>row.population))
  if (population<=0) return null
  const average=sum(rows.map(row=>row.population*row.tax))/population
  const cutoff=average*rates.threshold/100
  const extra=row=>Math.max(0,cutoff-row.tax)*rates.supplementary/100
  const contribution=sum(rows.map(row=>extra(row)*row.population))/population
  return {population,average,contribution,rows:rows.map(row=>{
    const equalization=(average-row.tax)*rates.symmetric/100+extra(row)-contribution
    return {...row,perCapita:equalization,amount:equalization*row.population}
  })}
}

function modelDistribution(index,year,focus,parameters) {
  const baseline={symmetric:rulesByYear[year],supplementary:35,threshold:90}
  if (!Number.isFinite(baseline.symmetric)) return []
  const municipalities=new Map(index.entities.filter(entity=>entity.kind==='municipality').map(entity=>[entity.id??'municipality:'+entity.code,entity]))
  const raw=index.incomeEqualization?.[year]??{}
  const rows=Object.entries(raw).flatMap(([id,row])=>{
    const municipality=municipalities.get(id)
    return municipality && row.basis==='actual' && row.population>0 && Number.isFinite(row.taxBefore?.amount) && Number.isFinite(row.equalization?.amount)
      ? [{code:municipality.code,name:municipality.name,population:row.population,tax:row.taxBefore.amount*1000/row.population,
        actual:row.equalization.amount*1000,workbook:row.sourceUrl}] : []
  })
  if (!rows.length || rows.length!==municipalities.size) return []
  const base=simulateEqualization(rows,baseline)
  // A counterfactual uses the official population and the municipality-only tax base.
  // Check the published baseline before presenting estimates for all municipalities.
  if (!base || base.rows.some(row=>Math.abs(row.amount-row.actual)>Math.max(1,Math.abs(row.actual)*1e-8))) return []
  const proposed={...baseline,...financeRates(parameters)}
  const estimate=simulateEqualization(rows,proposed)
  const deltas=estimate.rows.map((row,index)=>({
    code:row.code,name:row.name,delta:round(row.amount-base.rows[index].amount),deltaPerCapita:round(row.perCapita-base.rows[index].perCapita),
  })).sort((a,b)=>b.delta-a.delta||a.code.localeCompare(b.code))
  const workbook=rows[0].workbook || kddTaxBase
  const data={year,baseline,proposed,focus:focus?.code??null,sourceId:'kdd-sven-inntektsutjevning-'+year,rulesId:'kdd-sven-regler',
    rows:rows.map(({workbook,actual,...row})=>row),totalPopulation:base.population,average:base.average,
    highlights:{gains:deltas.filter(row=>row.delta>0).slice(0,5),losses:deltas.filter(row=>row.delta<0).slice(-5).reverse(),
      focus:deltas.find(row=>row.code===focus?.code)??null},
    method:'Skatt per innbygger sammenlignes med det folketallsvektede landsgjennomsnittet. Tillegg under valgt terskel finansieres med likt trekk per innbygger i alle kommunene. Folketall og skattegrunnlag holdes fast. Modellen dekker inntektsutjevning.'}
  return [source(data.sourceId,'KDD · Offisielt skattegrunnlag og inntektsutjevning, '+year,workbook,
    {year,baseline,proposed,highlights:data.highlights,totalPopulation:base.population,average:base.average,method:data.method},
    {key:'distribution',data}),
  source(data.rulesId,'Kommuneproposisjonen · Regler for inntektsutjevning',kddRules,
    {baseline,official:'62 % symmetrisk i 2025. Fra 2026 64 %. 35 % tillegg under 90 % av landsgjennomsnittet, finansiert med likt trekk per innbygger.'})]
}

async function transferSources({year,term,tag,focus,read,loadPayments}) {
  const post=tag?.post ? Number(tag.post):undefined
  if (!year || (post && !supportedPosts.has(post))) return []
  const payment=await loadPayments(year,term,{post})
  if (!payment || !payment.recipients.length) return []
  const {scope,columns,guide,reports}=payment
  const id=['kdd',year,payment.term,post||'alle',scope].join('-')
  const workbook=payment.url
  const title=scope==='post-ytd'?`Beregnet utbetaling for post ${post} fra publiserte terminer`
    :scope==='term'?`Utbetaling i termin ${payment.term}`:'Samlet beløp utbetalt hittil i år'
  const rows=payment.recipients.map(row=>({
    code:row.code,name:row.name,row:row.row,value:post?(scope==='post-ytd'?row.postTotal:row.posts[post]??null)
      :scope==='term'?row.paid:row.ytd,
  })).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)||a.code.localeCompare(b.code))
  if (!rows.some(row=>Number.isFinite(row.value))) return []
  const selected=rows.find(row=>row.code===focus?.code)
  const records=[]
  const phaseSourceIds=[]
  const extras=[]
  const officialColumn=post===60?`${columns.base} + ${columns.equalization}`:post?columns[post]:scope==='term'?columns.term:columns.annual
  if (selected&&Number.isFinite(selected.value)) records.push(observation(id,selected.code,{
    label:title,subject:selected.name,year,unit:'kr',unitCode:'kr',value:selected.value,url:workbook,
    where:`Kap. 571 · ${selected.name} (${selected.code}) · ${scope==='post-ytd'?'summerte terminer':`termin ${payment.term}`} · rad ${selected.row} i viste ark · kolonne ${officialColumn}`,
    ...(scope==='post-ytd'?{formula:'Summen av beløp for samme post i termintabellene.'}:post===60?{formula:'Innbyggertilskudd inkludert utgiftsutjevning + inntektsutjevning i terminen.'}:{})}))
  if (focus && !post) {
    const detail=await read(`kostra/entities/municipality-${focus.code}.json`).catch(()=>null)
    const projected=detail?.blockGrantCalculation?.values?.[year]
    const budget=amount(projected?.components?.find(row=>row.code==='budgeted_block_grant_before_income_equalization'))
    const booked=amount(detail?.stateFlows?.incoming?.find(row=>row.code==='state_block_grant')?.values?.[year])
    const bookSource='ssb-13551-'+focus.code+'-'+year
    const budgetSource='kdd-gront-hefte-'+focus.code+'-'+year
    if (Number.isFinite(budget)&&projected?.sourceUrl) {
      records.push(observation(budgetSource,'budget',{label:'Budsjettert rammetilskudd før inntektsutjevning',subject:focus.name,year,
        value:budget,unit:'kr',unitCode:'kr',url:projected.sourceUrl,where:'Grønt hefte, budsjettert beløp før inntektsutjevning'}))
      extras.push(source(budgetSource,'KDD · Grønt hefte',projected.sourceUrl??greenBook,{year,municipality:focus.name,budget}))
      phaseSourceIds.push(budgetSource)
    }
    if (Number.isFinite(booked)) {
      const url='https://www.ssb.no/statbank/table/13551/'
      const snapshotUrl=statbankDataUrl('13551',{
        KOKkommuneregion0000:focus.code,KOKart0000:'A800',ContentsCode:'KOSbelop0000',Tid:year,
      })
      records.push(observation(bookSource,'booked',{label:'Bokført rammetilskudd hos kommunekonsernet',subject:focus.name,year,
        value:booked,unit:'kr',unitCode:'kr',url,snapshotUrl,where:'SSB KOSTRA · kommunekonsernets årsregnskap'}))
      extras.push(source(bookSource,'SSB · Bokført rammetilskudd',url,{year,municipality:focus.name,booked}))
      phaseSourceIds.push(bookSource)
    }
  }
  const valid=rows.filter(row=>Number.isFinite(row.value))
  const data={year,term:payment.term,scope,post:post??null,title,rows,sourceId:id,focus:focus?.code??null,officialColumn,
    guide,reports:reports??[],total:valid.length===rows.length?sum(valid.map(row=>row.value)):null,
    records:records.map(row=>row.id),phaseSourceIds,
    note:'Utbetalingstabellen gjelder kommunalt rammetilskudd på kapittel 571. Den viser overføring til kommunen. Bokført mottak og budsjett gjelder egne målegrunnlag, og tabellen følger ikke kommunens videre bruk.'}
  return [source(id,'KDD · Rammetilskudd til kommunene, '+year+' termin '+payment.term,workbook,
    {year,term:payment.term,scope,post:post??null,title,focus:selected??null,total:data.total,top:valid.slice(0,12),note:data.note},
    {key:'transfers',data,records}),...extras]
}

async function schoolSources({years,focus,read,loadSeries}) {
  if (!focus || !years.length) return []
  const detail=await read(`kostra/entities/municipality-${focus.code}.json`)
  const local=detail.services.find(item=>item.code==='FGK8b')?.metrics?.net_expenses
  const definitions=[publicSchoolPupils,...schoolMetrics]
  const responses=await Promise.allSettled(definitions.map(definition=>loadSeries(definition,focus.code,years)))
  const fields=new Map()
  for (const [index,definition] of definitions.entries()) {
    const result=responses[index]
    if(result.status==='fulfilled') fields.set(definition.key??'pupils',{definition,...result.value})
  }
  const id='kostra-skolekvalitet-'+focus.code
  const sourceIds=[id]
  const records=[]
  const extra=[]
  const spendingId='ssb-12362-'+focus.code+'-skole'
  const spendingURL='https://www.ssb.no/statbank/table/12362/'
  const yearRows=[]
  for (const year of years) {
    const raw=local?.[year]?.amount
    const pupils=fields.get('pupils')?.values[year]
    const spending=Number.isFinite(raw)&&pupils>0?round(raw*1000/pupils):null
    const cells={}
    if (Number.isFinite(raw)) records.push(observation(spendingId,year,{label:'Netto driftsutgifter, grunnskole',subject:focus.name,year,
      value:raw,unit:'1 000 kr',url:spendingURL,snapshotUrl:statbankDataUrl('12362',{[regionKey]:focus.code,
        KOKfunksjon0000:'FGK8b',KOKart0000:'AGD2',ContentsCode:'KOSbelop0000',Tid:year}),where:'SSB tabell 12362 · FGK8b · AGD2'}))
    for (const [key,{definition,values}] of fields) {
      const value=values[year]
      if (!Number.isFinite(value)) continue
      const fieldId='ssb-'+definition.table+'-'+focus.code+'-'+key
      const url='https://www.ssb.no/statbank/table/'+definition.table+'/'
      const record=observation(fieldId,year,{label:definition.label,subject:focus.name,year,unit:definition.unit,value,url,
        snapshotUrl:statbankDataUrl(definition.table,{[definition.regionKey]:focus.code,...definition.options,Tid:year}),
        where:'SSB tabell '+definition.table+' · '+focus.code+' · '+year})
      records.push(record)
      cells[key]={value,observationId:record.id}
    }
    if (Number.isFinite(spending)) {
      const record=observation(id,'spending/'+year,{label:'Netto driftsutgifter per elev',subject:focus.name,year,unit:'kr per elev',
        value:spending,formula:'Netto driftsutgifter (1 000 kr) × 1 000 ÷ elever i kommunale grunnskoler',
        inputs:[spendingId+'/'+year,cells.pupils.observationId]})
      records.push(record)
      cells.spending={value:spending,observationId:record.id}
    }
    yearRows.push({year,cells})
  }
  if(!yearRows.some(row=>Object.keys(row.cells).length)) return []
  for (const [key,{definition,values}] of fields) {
    const fieldId='ssb-'+definition.table+'-'+focus.code+'-'+key
    extra.push(source(fieldId,'SSB · '+definition.label,'https://www.ssb.no/statbank/table/'+definition.table+'/',
      {municipality:focus.name,values,unit:definition.unit}))
    sourceIds.push(fieldId)
  }
  if (records.some(record=>record.sourceId===spendingId)) {
    extra.push(source(spendingId,'SSB · Netto driftsutgifter grunnskole',spendingURL,
      {municipality:focus.name,values:Object.fromEntries(years.map(year=>[year,local?.[year]?.amount??null])),unit:'1 000 kr'}))
    sourceIds.push(spendingId)
  }
  const changes=(detail.boundaryHistory??[]).filter(item=>item.changeYear>years[0]&&item.changeYear<=years.at(-1))
  const indicators=[{key:'spending',label:'Netto driftsutgifter per elev',unit:'kr per elev'},...schoolMetrics
    .map(({key,label,unit})=>({key,label,unit}))]
  const data={municipality:focus.name,code:focus.code,sourceId:id,sourceIds,indicators,rows:yearRows,
    breaks:[...new Set(changes.map(item=>item.changeYear))],
    notes:['Utgifter gjelder kalenderår. Elev- og skoleutfall følger SSBs statistikkår. Utgiftene til kommunekonsernet kan dekke mer enn undervisningen for elevene i nevneren.',
      'Gruppestørrelse måler ressursinnsats. Poeng og nasjonale prøver måler observerte elevutfall. Tallene kan påvirkes av elevsammensetning, fravær og rapportering.',
      'Tabellen kan vise utvikling side om side. Den måler ikke effekten av endret pengebruk.'],
    absenceUrl:'https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/fravarstall/'}
  return [source(id,'SSB · Grunnskole og kommuneutgifter','https://www.ssb.no/statbank/table/12255/',data, {key:'schoolQuality',data,records}),...extra]
}

const overview = [
  ['revenues','Brutto driftsinntekter','AGD13'],['expenses','Brutto driftsutgifter','AGD9'],
  ['net_expenses','Netto driftsutgifter','AGD1'], ['debt','Netto lånegjeld','KG31'], ['investments','Investeringsutgifter','AGI1'],
  ['net_result','Netto driftsresultat','AGD23'],
]
const serviceItems=[
  ['net_expenses','Netto driftsutgifter','AGD2'],['gross_expenses','Brutto driftsutgifter','AGD10'],['investments','Investeringsutgifter','AGI5'],
]

export function anomalySeries(points,year,breaks=[]) {
  const current=points?.[year]?.amount
  const previous=points?.[year-1]?.amount
  if (!Number.isFinite(current)||!Number.isFinite(previous)||breaks.includes(year)) return null
  const rate=(before,after)=>Number.isFinite(before)&&Number.isFinite(after)&&before>0&&after>=0
    ?(after-before)/before*100:null
  const currentRate=rate(previous,current)
  const earliestComparable=breaks.filter(value=>value<year).at(-1)??-Infinity
  const historical=[year-4,year-3,year-2,year-1].flatMap(end=>{
    const result=rate(points?.[end-1]?.amount,points?.[end]?.amount)
    return end>earliestComparable&&Number.isFinite(result)?[result]:[]
  })
  const typical=historical.length>=3?median(historical):null
  const gap=currentRate===null||typical===null?null:currentRate-typical
  const deviation=gap===null?null:Math.abs(gap)/Math.max(3,1.4826*median(historical.map(value=>Math.abs(value-typical))))
  return {current,previous,change:round((current-previous)*1000),rate:currentRate===null?null:round(currentRate),
    typical:typical===null?null:round(typical),gap:gap===null?null:round(gap),deviation:deviation===null?null:round(deviation),
    sample:historical.length}
}

async function anomalySources({year,focus,service,read}) {
  if (!focus || !year) return []
  const detail=await read(`kostra/entities/municipality-${focus.code}.json`)
  const id='kostra-avvik-'+focus.code+'-'+year
  const breaks=[...new Set((detail.boundaryHistory??[]).map(item=>item.changeYear))].sort((a,b)=>a-b)
  const categories=[
    ...(!service?overview.map(([key,label,code])=>({key,label,code,points:detail.overview?.[key]})):[]),
    ...detail.services.filter(item=>!service||item.code===service[0]).flatMap(item=>serviceItems.map(([key,label,code])=>({
      key:item.code+'-'+key,label:item.label??item.name??(service?.[1]||item.code),measure:label,code,service:item.code,points:item.metrics?.[key],
    }))),
  ]
  const signals=categories.flatMap(category=>{
    const point=anomalySeries(category.points,year,breaks)
    return point?[{...point,key:category.key,label:category.label,measure:category.measure??null,code:category.code,service:category.service??null}]:[]
  }).sort((a,b)=>(b.deviation??-1)-(a.deviation??-1)||Math.abs(b.change)-Math.abs(a.change))
  if (!signals.length && !breaks.includes(year)) return []
  const top=signals.filter(row=>row.change!==0).slice(0,12)
  const records=top.flatMap(row=>[year-1,year].map(y=>{
    const table=row.service?'12362':'12137'
    const filter={[regionKey]:focus.code,...(row.service?{KOKfunksjon0000:row.service,KOKart0000:row.code}:{KOKartkap0000:row.code}),
      ContentsCode:'KOSbelop0000',Tid:y}
    return observation(id,row.key+'/'+y,{label:[row.label,row.measure].filter(Boolean).join(' · '),subject:focus.name,year:y,unit:'1 000 kr',
      value:y===year?row.current:row.previous,url:'https://www.ssb.no/statbank/table/'+table+'/',snapshotUrl:statbankDataUrl(table,filter),
      where:'SSB tabell '+table+' · '+focus.code+' · '+y})
  }))
  const data={municipality:focus.name,year,sourceId:id,breaks,compared:signals.length,
    rows:top.map(row=>({...row,previousId:id+'/'+row.key+'/'+(year-1),currentId:id+'/'+row.key+'/'+year})),
    method:'Endring i årets nominelle beløp sammenlignes med medianen av inntil fire tidligere års prosentendringer. Avvik rangeres med robust spredning, med gulv på 3 prosentpoeng. Tabellrader kan overlappe. Grensebrudd og svakt grunnlag vises særskilt. Et utslag er et spor til videre undersøkelse.'}
  return [source(id,'SSB KOSTRA · Kommuneregnskap, '+focus.name,'https://www.ssb.no/statbank/table/12137/',data,{key:'anomalies',data,records})]
}

export async function financeSources({lens,years,focus,service,question,options,read,index,
  loadPayments=readGrantPayments,loadSeries=officialMunicipalSeries}) {
  const year=years.at(-1)??index.latestYear
  if (lens==='distribution' && /inntektsutjevning|skatteutjevning|inntektssystem/.test(question)) {
    const known=Object.keys(rulesByYear).map(Number).filter(value=>value<=year).at(-1)
    return modelDistribution(index,known,focus,options)
  }
  if (lens==='transfers' && /rammetilskot|rammetilskudd|\bkap(?:ittel)?\.?\s*0?571\b/.test(question)) {
    const term=Number(question.match(/\btermin(?:en)?\s*(\d{1,2})\b/)?.[1])||undefined
    const match=question.match(/\bpost\s*(\d{1,3})\b/)
    const tag=match?{post:match[1]}:null
    return transferSources({year,term,tag,focus,read,loadPayments})
  }
  if (lens==='school-quality' && /skole|undervisning|elev/.test(question)) {
    const available=index.years??[]
    const periods=years.length?years.filter(value=>available.includes(value)):available.slice(-5)
    return schoolSources({years:periods,focus,read,loadSeries})
  }
  if (lens==='anomalies') return anomalySources({year,focus,service,read})
  return []
}
