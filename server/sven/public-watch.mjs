import { createHash } from 'node:crypto'
import { budgetPhases, findBudgetNodes } from './sources.mjs'
import { publicCaseId, readPublicCase } from './policy-public-data.mjs'

const sectorTitles = {
  FGK8b: 'Grunnskole', FGK7: 'Barnehage', FGK9: 'Helse og omsorg', FGK13: 'Barnevern',
  FGK5: 'Samferdsel', FGK2: 'Kultur',
}
const overviewTitles = {
  net_expenses: 'Netto driftsutgifter', net_result: 'Netto driftsresultat', revenues: 'Driftsinntekter',
  debt: 'Netto lånegjeld', investments: 'Investeringsutgifter', expenses: 'Driftsutgifter',
}

export function normalizeWatchTarget(target) {
  const { kind, key, metric, year } = target ?? {}
  if (typeof key !== 'string' || key.length > 380) return null
  if (kind === 'municipality' && /^\d{4}$/.test(key)) {
    const name = metric || 'net_expenses'
    if (Object.hasOwn(sectorTitles,name) || Object.hasOwn(overviewTitles,name)) return {kind,key,metric:name}
  }
  if (kind === 'budget' && /^(?:[ui]-\d{1,3}-)?\d{4}(?:-\d{1,3})?$/.test(key) &&
      (year == null || Number.isInteger(year) && year >= 1900 && year <= 2099)) {
    return {kind,key,...(year==null?{}:{year})}
  }
  if (kind === 'case') {
    const id=publicCaseId(key)
    if (id) return {kind,key:id}
  }
  return null
}

function digest(points) {
  const canonical = points.map(({ id, value, url }) => [id,value,url ?? null])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function takeSnapshot(target, title, source, points) {
  return { target, title, source, points, version:digest(points) }
}

function municipalSeries(detail, metric, sector) {
  const rows = sector ? detail.services?.find(item=>item.code === metric)?.metrics?.net_expenses : detail.overview?.[metric]
  return Object.entries(rows ?? {}).filter(([, row])=>Number.isFinite(row?.amount))
    .sort(([a],[b])=>Number(a)-Number(b)).slice(-12)
}

async function municipalitySnapshot(target, read) {
  const detail = await read('kostra/entities/municipality-' + target.key + '.json')
  if (detail.entity?.code !== target.key) throw new Error('Fant ikke denne kommunen')
  const sector = sectorTitles[target.metric]
  const metricTitle = sector ? 'Netto driftsutgifter · ' + sector : overviewTitles[target.metric]
  const source = 'https://www.ssb.no/statbank/table/' + (sector ? '12362' : '12137') + '/'
  const points = municipalSeries(detail,target.metric,sector).map(([year,row])=>
    ({ id:year, label:metricTitle + ' · ' + year, value:row.amount, unit:'1 000 kr', url:source }))
  if (!points.length) throw new Error('Ingen tall for dette nøkkeltallet eller tjenesteområdet')
  const boundaries = (detail.boundaryHistory ?? []).map(row=>
    ({ id:`boundary-${row.changeYear}-${row.sourceCode}-${row.targetCode}`, label:'Kommunegrense', value:row.sourceName + ' → ' + row.targetName + ' (' + row.changeYear + ')' }))
  return takeSnapshot(target, detail.entity.name + ' · ' + metricTitle, source, [...points,...boundaries])
}

async function budgetSnapshot(target, read) {
  const stable = target.key.startsWith('u-') || target.key.startsWith('i-')
  const [chapter, post] = target.key.split('-')
  const query = stable ? {id:target.key} : {chapter,post}
  const files = stable ? [target.key.startsWith('u-') ? 'utgifter.json' : 'inntekter.json'] : ['utgifter.json','inntekter.json']
  for (const file of files) {
    const tree = await read(file)
    const hits = findBudgetNodes(tree,query)
    if (!hits.length) continue
    const source = 'https://statsregnskapet.dfo.no/'
    const meta = await read('meta.json').catch(()=>null)
    const proposal = meta?.budsjettforslag?.findLast(item=>item.phase==='initial')
    const proposalUrl = meta?.kilder?.find(item=>/Gul bok/i.test(item.navn))?.url
    const points = hits.flatMap(({department,selected})=>{
      const years = target.year ? [String(target.year)] : Object.keys(selected.serier).sort().slice(-4)
      const amounts=years.flatMap(year=>budgetPhases.flatMap(phase=>{
        const amount = selected.serier[year]?.[phase.id]
        if (!Number.isFinite(amount)) return []
        const url = phase.id==='forslag' && proposal?.year===Number(year) ? proposalUrl ?? source : source
        return [{ id:selected.id+'-'+year+'-'+phase.id,label:year+' · '+phase.label+(hits.length>1?' · '+department.navn:''),
          value:amount,unit:'mill. kr',url }]
      }))
      return [{id:'scope-'+selected.id,label:'Budsjettavgrensning',value:department.navn+' · '+selected.navn},...amounts]
    })
    const {selected}=hits.at(-1)
    return takeSnapshot(target, selected.tag+' · '+selected.navn, source,points)
  }
  if (stable) return takeSnapshot(target, 'Budsjettpost ' + target.key, 'https://statsregnskapet.dfo.no/',
    [{id:'not-found',label:'Budsjettpost',value:'Vises ikke i det gjeldende datasettet'}])
  throw new Error('Fant ikke kapittelet eller posten')
}

async function caseSnapshot(target, fetchCase) {
  const record = await fetchCase(target.key)
  const points = [
    { id:'status', label:'Stortingets registrerte status', value:record.status ?? 'Ukjent' },
    { id:'completed', label:'Ferdigbehandlet', value:record.completed?'Ja':'Nei' },
    ...(record.decision ? [{id:'decision',label:'Vedtak',value:record.decision}] : []),
    ...(record.summary ? [{id:'summary',label:'Kortvedtak',value:record.summary}] : []),
    ...record.documents.map(item=>({id:item.url,label:'Dokument',value:item.title,url:item.url})),
  ]
  return takeSnapshot(target, record.title, record.url, points)
}

export async function readWatchTarget(target, { read, fetchCase = readPublicCase } = {}) {
  const normalized = normalizeWatchTarget(target)
  if (!normalized) throw new Error('Ugyldig oppfølging')
  if (normalized.kind==='municipality') return municipalitySnapshot(normalized,read)
  if (normalized.kind==='budget') return budgetSnapshot(normalized,read)
  return caseSnapshot(normalized,fetchCase)
}
