import { officialCentrality, officialMunicipalValues, publicSchoolPupils, statbankDataUrl } from './policy-public-data.mjs'

const population = {table:'06913',regionKey:'Region',options:{ContentsCode:'Folkemengde'},label:'Innbyggere ved inngangen til året',unit:'innbyggere'}
const metrics = {
  net_expenses:{name:'Netto driftsutgifter',overview:'AGD1',service:'AGD2'},
  gross_expenses:{name:'Brutto driftsutgifter',service:'AGD10'},
  investments:{name:'Investeringsutgifter',overview:'AGI1',service:'AGI5'},
  expenses:{name:'Brutto driftsutgifter totalt',overview:'AGD9'}, revenues:{name:'Brutto driftsinntekter',overview:'AGD13'},
  net_result:{name:'Netto driftsresultat',overview:'AGD23'}, debt:{name:'Netto lånegjeld',overview:'KG31'},
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b)
  const middle = Math.floor(sorted.length/2)
  return !sorted.length ? null : sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2
}

export async function peerBenchmark({ index, focus, year, service, metric, loadValues = officialMunicipalValues, loadCentrality = officialCentrality }) {
  const indicator = metrics[metric]
  const code = indicator?.[service?'service':'overview']
  if (!code || !focus || !index.years?.includes(year)) return null
  const group = focus.peer_group_id?.match(/^peer_group:EKG(\d+)$/)?.[1]
  const peers = index.entities.filter(entity=>entity.kind==='municipality' && entity.code!==focus.code)
  const groupMembers = group ? peers.filter(entity=>entity.peer_group_id===focus.peer_group_id) : []
  const centralityRequest = loadCentrality(year).catch(()=>({values:{}}))
  const fallback = groupMembers.length < 2
  const fallbackCentrality = fallback ? (await centralityRequest).values : null
  const fallbackClass = fallbackCentrality?.[focus.code]
  const candidates = fallbackClass ? peers.filter(entity=>fallbackCentrality[entity.code]===fallbackClass) : groupMembers
  const selected = [focus,...candidates]
  const regions = selected.map(entity=>entity.code)
  const definition = { table:service?'12362':'12137',regionKey:'KOKkommuneregion0000',label:indicator.name,
    options:service?{ContentsCode:'KOSbelop0000',KOKart0000:code,KOKfunksjon0000:service[0]}:{ContentsCode:'KOSbelop0000',KOKartkap0000:code} }
  const sizeDefinition = service?.[0] === 'FGK8b' ? publicSchoolPupils : population
  const result = await Promise.allSettled([
    loadValues(definition,regions,year),loadValues(sizeDefinition,regions,year),centralityRequest,
  ])
  const get = index => result[index].status === 'fulfilled' ? result[index].value : {values:{}}
  const [expenses,sizes,centrality] = [get(0),get(1),get(2)]
  const observations = selected.map(entity=>{
    const amount = expenses.values[entity.code] ?? null
    const size = sizes.values[entity.code] ?? null
    const cost = Number.isFinite(amount) && size > 0 ? Math.round(amount*1000/size*100)/100 : null
    return { code:entity.code,name:entity.name,amount,size,centrality:centrality.values[entity.code] ?? null,cost }
  })
  const [target,...all] = observations
  const available = all.filter(entity=>Number.isFinite(entity.cost))
  const close = target.centrality!==null && target.size>0 ? available.filter(entity=>entity.centrality === target.centrality)
    .sort((a,b)=>Math.abs(Math.log(a.size/target.size))-Math.abs(Math.log(b.size/target.size)) || a.code.localeCompare(b.code)).slice(0,5) : []
  const sets = [{ id:'close',label:'Lik sentralitet og nærmest i størrelse',members:close },{ id:'group',label:fallbackClass?'Alle med lik sentralitet og data':'Hele KOSTRA-gruppen med data',members:available }]
    .map(({id,label,members})=>({id,label,codes:members.map(entity=>entity.code),median:median(members.map(entity=>entity.cost))}))
  const unit = sizeDefinition === publicSchoolPupils ? 'kr per elev' : 'kr per innbygger'
  const benchmark = { title:indicator.name+(service?' · '+service[1]:''),year,group:group ? Number(group):null,groupYear:index.latestYear,
    target,rows:all,sets,unit,sizeUnit:sizeDefinition.unit,measure:indicator.name,
    notes:[sizeDefinition === publicSchoolPupils
      ? 'Utgifter for kommunekonsernet delt på elever i kommunale grunnskoler. Ulik dekning og elevsammensetning kan påvirke sammenligningen.'
      : 'Utgifter for kommunekonsernet delt på folketall 1. januar.',
    'Sentralitet måler tilgjengelighet til arbeidsplasser og tjenester. Utvalget justerer ikke for alle forskjeller i behov eller tjenestekvalitet.',
    ...(fallbackClass ? ['KOSTRA-gruppen har færre enn to andre kommuner. Det bredere utvalget har samme sentralitetsklasse, og kan ha andre rammevilkår.'] : []),
    ...(focus.code==='0301' ? ['Oslo har både kommunale og fylkeskommunale oppgaver. Sjekk om ansvaret for tjenesten er likt før avviket tolkes.'] : [])],
  }
  const folders = [
    {key:'expenses',data:expenses,title:`SSB tabell ${definition.table} · ${indicator.name}`,overview:`https://www.ssb.no/statbank/table/${definition.table}/`,definition},
    {key:'size',data:sizes,title:`SSB tabell ${sizeDefinition.table} · ${sizeDefinition.label}`,overview:`https://www.ssb.no/statbank/table/${sizeDefinition.table}/`,definition:sizeDefinition},
    {key:'centrality',data:centrality,title:'SSB KLASS · Sentralitet',overview:'https://www.ssb.no/klass/klassifikasjoner/128'},
  ]
  const dataSources = folders.flatMap(({key,data,title,overview,definition})=>{
    if (!data.url) return []
    const rows = observations.flatMap(row=>Number.isFinite(data.values[row.code]) ? [{
      id:`ssb-peers-${key}-${focus.code}/${year}/${row.code}`,subject:row.name,year,value:data.values[row.code],
      label:title,unit:key==='expenses'?'1 000 kr':key==='size'?sizeDefinition.unit:'klasse',
      where:`${row.name} (${row.code}) · ${year}`,
      snapshotUrl:definition?statbankDataUrl(definition.table,{...definition.options,Tid:String(year),[definition.regionKey]:row.code}):data.url,
    }] : [])
    return [{id:`ssb-peers-${key}-${focus.code}`,title,url:overview,snapshotUrl:data.url,peerRecords:rows,
      text:JSON.stringify({year,unit:rows[0]?.unit,values:data.values})}]
  })
  const groupSource = {id:`kostra-peer-group-${focus.code}`,title:'Fellestall · KOSTRA-grupper',url:'https://fellestall.no/data/kostra/index.json',peerBenchmark:benchmark,
    text:JSON.stringify({year:index.latestYear,group,municipalities:selected.map(({name,code})=>({name,code}))})}
  return [groupSource,...dataSources]
}
