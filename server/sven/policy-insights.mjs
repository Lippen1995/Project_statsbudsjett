import { createHash } from 'node:crypto'
import { calculationFormula, tableFromChart } from './deliverables.mjs'
import { publicCaseId, statbankDataUrl } from './policy-public-data.mjs'
import { budgetPhases } from './sources.mjs'

export const policyRouting = `Velg også lens i det første svaret når det er relevant: "drivers" ved spørsmål om hva som forklarer utgiftsendring, "budget" ved spor fra forslag til regnskap, "comparison" ved sammenlignbarhet eller "factcheck" ved sjekk av en påstand. For drivers kan denominator være "pupils" eller "population". Velg fellestall når saken gjelder tall eller kapittel/post som Fellestall dekker, eller når du har Stortingets saks-ID. Ta med identifikator, år og balansert avgrensning i meaning. Når brukeren spør om en konkret forklaring eller vil sjekke en offentlig påstand, velg også relevante primærkilder der de kan belyse saken utover tallene.`

export const policyAnswerInstructions = `Hvis input har policyEvidence, bruk det til å etterprøve tallene. Bruk kildetall med korrekt enhet, eller forklar omregning. For en numerisk celle kan du gi policy.cells [{ "row":0,"column":1,"observationId":"eksakt ID fra policyEvidence" }]. Indekser starter på null. policy.chartCells bruker samme format med år og kategori i kolonne null. Bruk policy.findings [{ "index":0,"observationId":"ID" }] for å knytte et tall i en finding til en faktisk observasjon. For eksterne eller opplastede kilder kan du i stedet gi cellen sourceId, quote (ordrett sitat inkludert tallet) og valgfritt page (bare sidetall angitt i kilden). For en påstandssjekk gi policy.factCheck {"claim":"påstanden som sjekkes","claimSourceId":"ID eller null","verdict":"supported|partial|contradicted|insufficient","reasoning":"kort begrunnelse","sourceIds":["uavhengig kilde"],"interpretations":[{"basis":"periode og enhet","result":"utfall","sourceIds":["kilde"]}]}. Bevar ordlyden når brukeren oppgir et sitat. Et utsagn og en manglende kilde er ikke et grunnlag for å erklære noe feil. Forklar hva alternative relevante avgrensninger betyr. Du kan gi policy.comparison {"status":"direct|adjusted|incompatible|unclear","reason":"hva er målt, hva ble omregnet eller hva er usikkert","sourceIds":["kilde"]} ved en kildebelagt sammenligning. Formelle brudd i policyEvidence veier tyngre enn en generell antakelse om sammenlignbarhet. Dekomponering er et regnestykke i oppgitt rekkefølge, ikke bevis på årsak. Skill løpende revidert budsjett hos DFØ fra vårens RNB, og hold forslag, vedtak og regnskap adskilt. Der en fase mangler i budsjettsporet, kan du gi policy.budgetEvidence [{"budgetSourceId":"ID fra tidslinje","year":2025,"phase":"forslag","sourceId":"offisiell kilde","rawValue":120,"unit":"mill. kr","quote":"ordrett utdrag med beløpet"}]. Bruk bare relevante originaldokumenter for samme kapittel, post, fase og år.`

export const policyAuditInstructions = `\nVurder om en bestilt faktasjekk gjengir påstanden korrekt, viser relevant tallgrunnlag og skiller alternative avgrensninger, og om databrudd eller ulike regnskaps- og budsjettfaser er tatt hensyn til. Ved oppgitte kildeutdrag skal sitat og tall stemme med utdraget. Kontroller at en fase fylt fra ekstern budsjettkilde gjelder riktig kapittel, post, budsjettfase og år.`

const finite = Number.isFinite
const safe = (value, max) => typeof value === 'string' && value.trim().length && value.length <= max
const labelKey = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ').trim()
const compactNumber = value => Number(value.toPrecision(14))
const unitText = { kr: 'kr', thousand: '1 000 kr', million: 'mill. kr', perCapita: 'kr per innbygger', realPerCapita: 'faste kr per innbygger' }
const serviceLabels = { gross_expenses: 'Brutto driftsutgifter', net_expenses: 'Netto driftsutgifter', investments: 'Investeringsutgifter' }
const serviceCodes = { gross_expenses: 'AGD10', net_expenses: 'AGD2', investments: 'AGI5' }
const overviewLabels = { ...serviceLabels, revenues: 'Driftsinntekter', expenses: 'Driftsutgifter', net_result: 'Netto driftsresultat', debt: 'Netto lånegjeld' }

function recorded(source, suffix, data) {
  return { id: source.id + '/' + suffix, sourceId: source.id,
    url: data.url ?? source.url, snapshotUrl: data.snapshotUrl ?? source.snapshotUrl, ...data }
}

function municipalRecords(source, data) {
  if (!source.municipality || !Array.isArray(data.data)) return []
  const table = data.funksjon ? '12362' : '12137'
  const subject = data.kommune
  const metrics = data.funksjon ? Object.keys(serviceLabels) : data.metric ? [data.metric] : []
  return data.data.flatMap(row => metrics.flatMap(metric => {
    const metricCode = data.funksjon ? serviceCodes[metric] : data.metricCode
    const amount = data.funksjon ? row[metric]?.amountThousandNok : row.amountThousandNok ?? row.netExpenditureThousandNok
    const perCapita = data.funksjon ? row[metric]?.nokPerCapita : row.amountNokPerCapita ?? row.netExpenditureNokPerCapita
    const coordinates = { KOKkommuneregion0000: data.kommunenummer,
      ...(data.funksjon ? { KOKfunksjon0000: data.funksjon, KOKart0000: metricCode } : { KOKartkap0000: metricCode }), Tid: row.year }
    return [[amount, 'thousand', 'KOSbelop0000'],
      [perCapita, 'perCapita', data.funksjon ? 'KOSbelopinnbygge0000' : 'KOSbelopprinnb0000']].flatMap(([value, unit, content]) => {
      if (!finite(value)) return []
      return [recorded(source, [metric,row.year,unit].join('/'), { label: overviewLabels[metric] ?? source.title, subject,
        value, unit: unitText[unit], year: row.year, metric, unitCode: unit,
        where: `SSB tabell ${table} · ${subject} (${data.kommunenummer}) · ${data.funksjon ? 'funksjon ' + data.funksjon + ' · ' : ''}${metricCode ?? metric} · ${row.year} · kommunekonsern`,
        ...(metricCode ? { snapshotUrl: statbankDataUrl(table, { ...coordinates, ContentsCode: content }) } : {}),
      })]
    })
  }))
}

function budgetRecords(source, data) {
  if (!source.budget || !data.millionNokByYearAndPhase) return []
  return Object.entries(data.millionNokByYearAndPhase).flatMap(([year, row]) =>
    budgetPhases.flatMap(({ id, label }) => finite(row[id]) ? [recorded(source, 'phase/' + year + '/' + id,
      { label, subject: data.labelInDataset, value: row[id], unit: unitText.million, unitCode: 'million', year: Number(year), phase: id,
        where: `${data.department} · ${data.selected} · ${year} · ${label}`,
        ...(id === 'forslag' && Number(year) === source.budget.proposalYear && source.budget.proposalUrl
          ? { url: source.budget.proposalUrl } : {}),
      })] : []))
}

function countsRecords(source, data) {
  if (!source.countMetadata || !data.countsByYear) return []
  const { table, region, label, unit } = source.countMetadata
  return Object.entries(data.countsByYear).flatMap(([year,value]) => finite(value) ? [
    recorded(source, 'count/' + year, { label, value, unit, year: Number(year),
      where: `SSB tabell ${table} · kommune ${region} · ${year} · ${label}` }),
  ] : [])
}

function priceRecords(source, data) {
  return Object.entries(data.indexByYear ?? {}).flatMap(([year,value]) => finite(value) && value > 0 ? [
    recorded(source, 'kpi/' + year, { label: 'Konsumprisindeksen', value, unit: 'indeks (2025 = 100)', year: Number(year),
      where: 'SSB tabell 14711 · KPI totalindeks · årsgjennomsnitt ' + year }),
  ] : [])
}

function nationalRecords(source, data) {
  if (source.id !== 'dfø-statsregnskap-utgifter' || !Array.isArray(data.data)) return []
  return data.data.flatMap(row => [
    ['expenditure','million', 'Utgifter i statsregnskapet', 'https://statsregnskapet.dfo.no/'],
    ['perCapita','perCapita','Utgifter per innbygger', 'https://statsregnskapet.dfo.no/'],
    ['realPerCapita','realPerCapita','Utgifter per innbygger i sluttårets priser', 'https://statsregnskapet.dfo.no/'],
    ['population','innbyggere','Folkemengde ved inngangen til året','https://www.ssb.no/statbank/table/07459/'],
    ['cpi','prisindeks','Konsumprisindeksen','https://www.ssb.no/statbank/table/14711/'],
  ].flatMap(([key,unit,label,url]) => finite(row[key]) ? [recorded(source, 'state/' + row.year + '/' + key, {
    label,value:row[key],unit:unitText[unit] ?? unit,unitCode:unit,year:row.year,subject:'Statsregnskapet',url,
    ...(key === 'population' ? { snapshotUrl:'https://fellestall.no/data/befolkning.json' } : {}),
    ...(key === 'cpi' ? { snapshotUrl:'https://fellestall.no/data/kpi.json' } : {}),
    where: label + ' · ' + row.year,
    ...(key === 'perCapita' ? { formula: 'Bokførte utgifter i mill. kr × 1 000 000 / folkemengden' } : {}),
    ...(key === 'realPerCapita' ? { formula: 'Nominell kr per innbygger × KPI i sluttåret / KPI i observasjonsåret' } : {}),
    ...(key === 'perCapita' || key === 'realPerCapita' ? { inputs: key==='perCapita' ?
      ['expenditure','population'].map(field=>source.id+'/state/'+row.year+'/'+field) :
      [source.id+'/state/'+row.year+'/perCapita',source.id+'/state/'+row.year+'/cpi',
        source.id+'/state/'+data.data.at(-1).year+'/cpi'] } : {}),
  })] : []))
}

export function moneyDrivers(before, after, priceBefore, priceAfter, countBefore, countAfter) {
  if (![before, after, priceBefore, priceAfter, countBefore, countAfter].every(finite) ||
      before <= 0 || after < 0 || Math.min(priceBefore,priceAfter,countBefore,countAfter) <= 0) return null
  const priceAdjusted = before * (priceAfter / priceBefore)
  const sameActivityInEndYear = priceAdjusted * (countAfter / countBefore)
  return { before, after, change: compactNumber(after - before),
    prices: compactNumber(priceAdjusted - before),
    count: compactNumber(sameActivityInEndYear - priceAdjusted),
    residual: compactNumber(after - sameActivityInEndYear),
    realChangePercent: compactNumber((after / priceAdjusted - 1) * 100),
    realPerUnitChangePercent: compactNumber((after / sameActivityInEndYear - 1) * 100),
  }
}

function traceCalculation(source, detail) {
  return recorded(source, detail.id, { value: detail.value, label: detail.label, unit: detail.unit,
    where: detail.where, formula: detail.formula, inputs: detail.inputs, ...(detail.year ? { year:detail.year } : {}) })
}

function addDriverSeries(source, before, after, costs, counts, records, title, countKind) {
  const estimate = moneyDrivers(before?.value, after?.value, costs[0]?.value, costs[1]?.value, counts[0]?.value, counts[1]?.value)
  if (!estimate) return null
  const unit = before.unit
  const from = before.year, to = after.year
  const inputIds = [before,after,...costs,...counts].map(item => item.id)
  const countUnit = countKind==='elever' ? 'elev' : 'innbygger'
  const rows = [
    ['prices','Prisvekst','Startbeløp × (KPI slutt / KPI start − 1)'],
    ['count',countKind==='elever'?'Endret elevtall':'Endret folketall','Startbeløp × prisfaktor × (antall slutt / antall start − 1)'],
    ['residual',`Endret reelt forbruk per ${countUnit}`,'Sluttbeløp − startbeløp × prisfaktor × antallsfaktor'],
  ].map(([id,label,formula]) => {
    const record = traceCalculation(source, { id:`drivers/${from}/${to}/${id}`, label, value:estimate[id], unit,
      where: title + ' · ' + from + '–' + to, formula, inputs:inputIds, year:to })
    records.set(record.id, record)
    return { label, value:record.value, observationId:record.id }
  })
  const growth = traceCalculation(source, { id:`drivers/${from}/${to}/real-per-unit`, label:`Realvekst per ${countUnit}`,
    value:estimate.realPerUnitChangePercent, unit:'%', where:title + ' · ' + from + '–' + to,
    formula:'(Sluttbeløp / (startbeløp × prisfaktor × antallsfaktor) − 1) × 100', inputs:inputIds, year:to })
  records.set(growth.id, growth)
  return { title, unit, from, to, before:before.value, after:after.value, total:estimate.change, rows,
    startObservation:before.id, endObservation:after.id, realGrowth:growth.id, countKind,
    note: countKind==='elever'
      ? 'Regnestykket bruker KPI først, deretter elevtall. Elevtallet gjelder kommunale grunnskoler, mens regnskapsposten kan dekke flere kostnader. Resten kan blant annet gjenspeile bemanning, oppgaver og sammensetning.'
      : 'Regnestykket bruker KPI først, deretter folketall ved inngangen til året. Resten viser endret reelt forbruk per innbygger og kan skyldes flere forhold.',
  }
}

function driverData(sources, sourceData, records, lens, question) {
  const comparisons = [], drivers = []
  const coveredMoves = new Set()
  const costSource = sources.find(source => source.id === 'ssb-kpi-aarsindeks')
  for (const [source, data] of sourceData) {
    if (!source.municipality && !source.budget && source.id !== 'dfø-statsregnskap-utgifter') continue
    const own = [...records.values()].filter(record => record.sourceId === source.id)
    const years = source.budget ? source.budget.years : data.data?.map(row => row.year)
    if (!years?.length) continue
    const from = Math.min(...years), to = Math.max(...years)
    if (from === to) continue
    if (source.budget?.scopes?.length) {
      const active = source.budget.scopes.filter(scope=>scope.accountingYears.some(year=>year>=from&&year<=to))
      const key = active.map(item=>item.id).sort().join('/')
      if (active.length>1 && !coveredMoves.has(key)) {
        coveredMoves.add(key)
        const labels = active.map(item=>item.department+' ('+item.accountingYears.filter(year=>year>=from&&year<=to).join(', ')+')')
        comparisons.push({status:'unclear',label:source.title,
          reason:'Samme kapittel- eller postnummer er bokført under flere departementer i perioden. '+labels.join(' og ')+
            '. Kontroller ansvarsflyttingen og innholdet før beløp legges sammen eller veksten beregnes.',
          sourceIds:sourceData.filter(([item])=>active.some(record=>record.id===item.budget?.id)).map(([item])=>item.id)})
      }
    }
    const breaks = (data.boundaryHistory ?? []).filter(item => item.changeYear > from && item.changeYear <= to)
    if (data.scopeChangedIn > from && data.scopeChangedIn <= to) breaks.push({ changeYear:data.scopeChangedIn, budget:true })
    if (breaks.length) {
      const causes = [...new Set(breaks.map(event => event.budget ? `kapittelavgrensningen ble endret i ${event.changeYear}`
        : `${event.sourceName} → ${event.targetName} (${event.changeYear})`))]
      comparisons.push({ status:'incompatible', label:source.title,
        reason:`Brudd i perioden ${from}–${to}. ${causes.join(' og ')}. Tallene må settes på samme avgrensning før veksten kan sammenlignes direkte.`,
        sourceIds:[source.id] })
      continue
    }
    if (lens !== 'drivers') continue
    if (source.budget) continue
    if (source.municipality) {
      const metric = data.funksjon ? (/\bbrutto/.test(labelKey(question)) ? 'gross_expenses'
        : /investeringsutgift/.test(labelKey(question)) ? 'investments' : 'net_expenses') : data.metric
      if (!['expenses','net_expenses','gross_expenses','investments'].includes(metric)) continue
      const title = `${overviewLabels[metric] ?? source.title} · ${data.kommune}`
      const at = year => own.find(record => record.metric === metric && record.unitCode === 'thousand' && record.year === year)
      const countSource = sources.find(item => item.countMetadata?.region === source.municipality)
      const costs = [from,to].map(year => records.get(costSource?.id + '/kpi/' + year))
      const counts = [from,to].map(year => records.get(countSource?.id + '/count/' + year))
      const driver = addDriverSeries(source, at(from), at(to), costs, counts, records, title, countSource?.countMetadata.unit)
      if (driver) drivers.push(driver)
      else comparisons.push({ status:'unclear', label:title,
        reason:'Pris-, antalls- eller regnskapsgrunnlaget for begge år er ikke komplett. Bidragene kan ikke fordeles på dette grunnlaget.', sourceIds:[source.id] })
    } else {
      const get = (year, key) => records.get(source.id + '/state/' + year + '/' + key)
      const driver = addDriverSeries(source, get(from,'expenditure'), get(to,'expenditure'), [get(from,'cpi'),get(to,'cpi')],
        [get(from,'population'),get(to,'population')], records, 'Statsregnskapets utgifter', 'innbyggere')
      if (driver) drivers.push(driver)
    }
  }
  return { comparisons, drivers }
}

export function buildPolicyEvidence(sources, lens, question) {
  const records = new Map(), sourceData = [], timelines = [], follow = new Map()
  const register = item => follow.set([item.kind,item.key,item.metric].join(':'), item)
  for (const source of sources) {
    if (!source.municipality && !source.budget && !source.countMetadata && !source.parliamentCase &&
        !['ssb-kpi-aarsindeks','dfø-statsregnskap-utgifter'].includes(source.id)) continue
    let data
    try { data = JSON.parse(source.text) } catch { continue }
    sourceData.push([source,data])
    const found = source.municipality ? municipalRecords(source,data) : source.budget ? budgetRecords(source,data)
      : source.countMetadata ? countsRecords(source,data) : source.id === 'ssb-kpi-aarsindeks' ? priceRecords(source,data) : nationalRecords(source,data)
    for (const item of found) records.set(item.id,item)
    if (source.municipality) register({kind:'municipality',key:source.municipality,title:data.kommune,
      metric:data.funksjon ?? data.metric})
    if (source.parliamentCase) register({kind:'case',key:source.parliamentCase,title:source.title})
    if (!source.budget) continue
    register({kind:'budget',key:source.budget.id,title:source.title.replace(/^DFØ · /,'')})
    if (lens !== 'budget') continue
    const available = Object.keys(data.millionNokByYearAndPhase ?? {}).map(Number)
    const requested = source.budget.years.length ? source.budget.years
      : [...new Set([source.budget.latestAccounting, available.at(-1)])].filter(Number.isInteger)
    for (const year of requested.filter((year,index)=>available.includes(year)||index===0||index===requested.length-1)) {
      const rows = budgetPhases.map(phase => {
        const record=records.get(source.id + '/phase/' + year + '/' + phase.id)
        return { phase:phase.id,label:phase.label, value:record?.value ?? null, ...(record ? { observationId:record.id } : {}) }
      })
      timelines.push({ title:data.selected + ' · ' + data.labelInDataset + ' · ' + data.department,
        year, unit:unitText.million, sourceId:source.id, rows })
    }
  }
  const caseLink = question.match(/https:\/\/www\.stortinget\.no\/no\/Saker-og-publikasjoner\/Saker\/Sak\/?\?p=\d+/i)?.[0]
  const caseId = publicCaseId(caseLink)
  if (caseId && ![...follow.values()].some(item => item.kind==='case' && item.key===caseId)) register({kind:'case',key:caseId,title:'Stortingssak '+caseId})
  return { records, timelines, follow:[...follow.values()], ...driverData(sources,sourceData,records,lens,question) }
}

const verdicts = ['supported','partial','contradicted','insufficient']
const references = (ids, known) => Array.isArray(ids) && ids.length > 0 && ids.length <= 15 && ids.every(id => known.has(id))
function normalizedFact(check, known, question) {
  if (!check || !safe(check.claim,1200) || !safe(check.reasoning,2200) || !verdicts.includes(check.verdict)) return null
  const support = references(check.sourceIds, known) ? [...new Set(check.sourceIds.filter(id=>id!==check.claimSourceId))] : []
  const claimSource = known.get(check.claimSourceId)
  const literal = labelKey(question).includes(labelKey(check.claim))
  const original = claimSource && labelKey(claimSource.text).includes(labelKey(check.claim))
  const interpretations = Array.isArray(check.interpretations) ? check.interpretations.slice(0,7).flatMap(entry =>
    safe(entry?.basis,300) && safe(entry.result,650) && references(entry.sourceIds,known)
      ? [{ basis:entry.basis,result:entry.result,sourceIds:[...new Set(entry.sourceIds)] }] : []) : []
  return { claim:check.claim, wording:original?'source':literal?'user':'paraphrase',
    ...(original ? { claimSourceId:claimSource.id } : {}),
    verdict:support.length ? check.verdict : 'insufficient', reasoning:check.reasoning, sourceIds:support, interpretations }
}

function numericInQuote(quote,value) {
  const numbers = quote.match(/[-−]?\d{1,3}(?:[ .\u00a0\u202f]\d{3})+(?:,\d+)?|[-−]?\d+(?:[.,]\d+)?/g) ?? []
  return numbers.some(raw => Number(raw.replace(/[-−]/g,'-').replace(/[ \u00a0\u202f]/g,'')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g,'').replace(',','.')) === value)
}

const unitCode = unit => {
  const text = labelKey(unit)
  if (/\b(?:1000|1 000|tusen)\s*(?:kr|nok)/.test(text)) return 'thousand'
  if (/mill(?:ion(?:er)?)?\.?\s*(?:kroner|kr|nok)/.test(text)) return 'million'
  if (/(kr|kroner|nok)\s*(?:per|\/)\s*innb/.test(text)) return /fast/.test(text)?'realPerCapita':'perCapita'
  if (/^(kr|kroner|nok)$/.test(text)) return 'kr'
  return ''
}
const equal = (a,b) => finite(a) && finite(b) && Math.abs(a-b) <= Math.max(Math.abs(b)*1e-12,1e-10)

function matchAutomatic(records, table, rowIndex, column) {
  const header = table.columns[column]
  const row = table.rows[rowIndex]
  const unit = unitCode(header.unit)
  if (!unit) return null
  const context = labelKey([header.label,...row.filter((cell,index)=>typeof cell==='string' ||
    Number.isInteger(cell) && /^(år|periode|budsjettår)$/i.test(table.columns[index].label))].join(' '))
  const years = yearsInCell(table,rowIndex,column)
  const list = [...records.values()].filter(candidate => candidate.unitCode === unit &&
    table.sourceIds.includes(candidate.sourceId) && equal(candidate.value,row[column]) &&
    Number.isInteger(candidate.year) && years.includes(String(candidate.year)) &&
    (candidate.phase ? context.includes(candidate.phase)
      : candidate.subject && context.includes(labelKey(candidate.subject).split(/[ -]+/)[0])))
  return list.length === 1 ? list[0] : null
}

function yearsInCell(table,rowIndex,column) {
  const yearPattern = /\b(?:19|20)\d{2}\b/g
  const inHeading = table.columns[column].label.match(yearPattern) ?? []
  return inHeading.length ? inHeading : table.rows[rowIndex].flatMap((cell,index)=>
    typeof cell==='string' || Number.isInteger(cell) && /^(år|periode|budsjettår)$/i.test(table.columns[index].label)
      ? String(cell).match(yearPattern) ?? [] : [])
}

function quotedObservation(source, spec, value, header) {
  if (!safe(spec.quote, 650) || !labelKey(source.text).includes(labelKey(spec.quote)) || !numericInQuote(spec.quote,value)) return null
  let page=source.page
  if (Number.isInteger(spec.page) && spec.page>0 && source.type==='upload') {
    const part=source.text.split(/(?:^|\n)Side (\d+)[^\n]*\n/).slice(1)
    for(let i=0;i<part.length;i+=2) if(Number(part[i])===spec.page && labelKey(part[i+1]).includes(labelKey(spec.quote))) page=spec.page
  }
  const url = source.url && page ? source.url.split('#')[0] + '#page=' + page : source.url
  return recorded(source,'quote/'+createHash('sha256').update(spec.quote + String(value)).digest('hex').slice(0,12),
    { label:header.label, value, unit:header.unit ?? '', where: page ? 'Side ' + page : 'Kildeutdrag',
      ...(url ? { url } : {}), ...(page ? { page } : {}), quote:spec.quote })
}

function attachTableRefs(table, policy, records, sources) {
  if (!table) return []
  const edits = new Map()
  if (Array.isArray(policy?.cells)) for (const cell of policy.cells.slice(0,900)) {
    if (Number.isInteger(cell?.row) && Number.isInteger(cell.column)) edits.set(cell.row+':'+cell.column,cell)
  }
  const result = []
  for (const [rowIndex,row] of table.rows.entries()) {
    const ids = new Map()
    for (const [column, value] of row.entries()) {
      if (!finite(value)) continue
      const hint = edits.get(rowIndex+':'+column)
      const record = records.get(hint?.observationId)
      const fromSource = sources.get(hint?.sourceId)
      const years = yearsInCell(table,rowIndex,column)
      const observation = record && table.sourceIds.includes(record.sourceId) && equal(record.value,value) &&
          (!record.year || !years.length || years.includes(String(record.year))) &&
          (!record.unitCode || !unitCode(table.columns[column].unit) || record.unitCode===unitCode(table.columns[column].unit))
        ? record : fromSource && table.sourceIds.includes(fromSource.id) ? quotedObservation(fromSource,hint,value,table.columns[column]) :
          matchAutomatic(records,table,rowIndex,column)
      if (!observation) continue
      records.set(observation.id,observation)
      ids.set(column,observation.id)
      result.push({row:rowIndex,column,observationId:observation.id})
    }
    for (const [offset,calculation] of table.calculations.entries()) {
      const value=table.derived[rowIndex]?.[offset]
      if (!finite(value)) continue
      const column=table.columns.length+offset
      const id=`tabell-beregning/${rowIndex}/${column}`
      records.set(id,{ id,label:calculation.label,value,unit:calculation.unit,where:table.title,
        formula:calculationFormula(calculation,index=>table.columns[index].label),
        inputs:calculation.columns.flatMap(index=>ids.has(index)?[ids.get(index)]:[]),
        values:calculation.columns.map(index=>({label:table.columns[index].label,value:row[index],unit:table.columns[index].unit ?? ''})),
      })
      result.push({row:rowIndex,column,observationId:id})
    }
  }
  return result
}

function completeBudgetTimeline(timelines, supplements, records, known) {
  if (!Array.isArray(supplements) || !supplements.length) return timelines
  return timelines.map(timeline=>({ ...timeline, rows:timeline.rows.map(row=>{
    if (row.value!==null) return row
    const candidates=supplements.slice(0,60).filter(entry=>entry?.budgetSourceId===timeline.sourceId &&
      entry.year===timeline.year && entry.phase===row.phase && finite(entry.rawValue))
    for (const entry of candidates) {
      const source=known.get(entry.sourceId)
      if (!source?.primaryCandidate || !source.url) continue
      try {
        const host=new URL(source.url).hostname
        if (!['regjeringen.no','stortinget.no','dfo.no'].some(domain=>host===domain||host.endsWith('.'+domain))) continue
      } catch { continue }
      const units={kr:1e-6,thousand:1e-3,million:1}
      const factor=units[unitCode(entry.unit)]
      if (!factor) continue
      const evidence=quotedObservation(source,entry,entry.rawValue,{label:row.label,unit:entry.unit})
      if (!evidence) continue
      const value=compactNumber(entry.rawValue*factor)
      const record={...evidence,id:evidence.id+'/'+timeline.year+'/'+row.phase,value,unit:timeline.unit,year:timeline.year,
        ...(factor!==1?{formula:'Kildebeløp i '+entry.unit+' × '+factor+' = mill. kr',values:[{label:'Kildebeløp',value:entry.rawValue,unit:entry.unit}]}:{})}
      records.set(record.id,record)
      return {...row,value,observationId:record.id}
    }
    return row
  }) }))
}

export function finishPolicy(answer, proposed, evidence, sources, question) {
  const known = new Map(sources.map(source=>[source.id,source]))
  const factCheck = normalizedFact(proposed?.factCheck, known, question)
  const comparisons = [...evidence.comparisons]
  const reported = proposed?.comparison
  if (reported && ['direct','adjusted','incompatible','unclear'].includes(reported.status) &&
      safe(reported.reason,1000) && references(reported.sourceIds,known) &&
      (!comparisons.length || !['direct','adjusted'].includes(reported.status))) {
    comparisons.push({status:reported.status,reason:reported.reason,sourceIds:reported.sourceIds})
  }
  const records = new Map(evidence.records)
  const tableRefs=attachTableRefs(answer.deliverables?.table,proposed,records,known)
  const chartRefs=answer.chart ? attachTableRefs(tableFromChart(answer.chart), { cells:proposed?.chartCells }, records, known) : []
  const timelines=completeBudgetTimeline(evidence.timelines,proposed?.budgetEvidence,records,known)
  const findingRefs = Array.isArray(proposed?.findings) ? proposed.findings.slice(0,120).flatMap(item=>{
    const { index, observationId }=item ?? {}
    if (!Number.isInteger(index) || index<0 || index>=answer.findings.length) return []
    const finding=answer.findings[index]
    const record=records.get(observationId)
    return finding&&record&&finding.sourceIds.includes(record.sourceId)&&numericInQuote(finding.text,record.value)?[{index,observationId}]:[]
  }).filter((item,index,all)=>all.findIndex(ref=>ref.index===item.index&&ref.observationId===item.observationId)===index) : []
  const retain = new Set([
    ...[...tableRefs,...chartRefs,...findingRefs].map(row=>row.observationId),
    ...timelines.flatMap(row=>row.rows.map(point=>point.observationId).filter(Boolean)),
    ...evidence.drivers.flatMap(driver=>[driver.startObservation,driver.endObservation,driver.realGrowth,...driver.rows.map(row=>row.observationId)]),
  ])
  for (const id of retain) for (const input of records.get(id)?.inputs ?? []) retain.add(input)
  const observations = [...retain].flatMap(id=>records.has(id)?[records.get(id)]:[])
  const linkedSources = new Set([...observations.map(item=>item.sourceId).filter(Boolean),
    ...comparisons.flatMap(item=>item.sourceIds), ...timelines.map(item=>item.sourceId),
    ...(factCheck ? [...factCheck.sourceIds,...factCheck.interpretations.flatMap(item=>item.sourceIds),factCheck.claimSourceId].filter(Boolean) : []),
  ])
  if (!(observations.length||comparisons.length||timelines.length||evidence.drivers.length||factCheck||evidence.follow.length)) return answer
  return { ...answer, policy: { observations, tableRefs, chartRefs, findingRefs, comparisons, drivers:evidence.drivers, timelines,
    follow:evidence.follow, ...(factCheck ? { factCheck } : {}), sourceIds:[...linkedSources] } }
}

export function modelPolicyEvidence(evidence) {
  const observations = [...evidence.records.values()].slice(0,200).map(({id,label,value,unit,year,subject}) =>
    ({id,label,value,unit,year,...(subject?{subject}:{})}))
  return { observations, comparisons:evidence.comparisons, drivers:evidence.drivers, timelines:evidence.timelines }
}
