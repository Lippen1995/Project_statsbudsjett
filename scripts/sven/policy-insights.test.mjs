import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import ExcelJS from 'exceljs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'
import { buildPolicyEvidence, finishPolicy, moneyDrivers } from '../../server/sven/policy-insights.mjs'
import { parsePublicCase, readStatbankCounts } from '../../server/sven/policy-public-data.mjs'
import { normalizeWatchTarget, readWatchTarget } from '../../server/sven/public-watch.mjs'
import { exportFile, normalizeExport } from '../../server/sven/file-export.mjs'
import { hostedPreview, previewWatch } from './test-access.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/',import.meta.url))
const disk = async file=>JSON.parse(await readFile(dataDir+file,'utf8'))
const school = 'Hvorfor har netto driftsutgifter til grunnskolen i Stavanger endret seg fra 2021 til 2025?'
const counts = async (definition,region,years) => {
  assert.equal(definition.table,'11971')
  assert.equal(region,'1103')
  return { counts:Object.fromEntries(years.map(year=>[year,year===2021 ? 16651 : 16481])) }
}
const sum=rows=>rows.reduce((total,row)=>total+row.value,0)
const baseAnswer={summary:'Sven',findings:[],uncertainties:[],recommendation:null}

test('publisert datacache beholder KOSTRA-tjenester, perioder og kommunegrensehistorikk', async () => {
  const store=new Map()
  const fetchImpl=async url=>Response.json(await disk(new URL(url).pathname.replace(/^\/data\//,'')))
  const load=snapshotLoader({cache:{get:key=>store.get(key),set:(key,value)=>store.set(key,value)},fetchImpl})
  const read=async name=>JSON.parse(await load(name))
  const [index,entity]=await Promise.all([read('kostra/index.json'),read('kostra/entities/municipality-1103.json')])
  assert(index.years.includes(2021))
  assert(index.sources.find(source=>source.source_table==='12362'))
  assert(entity.boundaryHistory.some(item=>item.changeYear===2020))
  assert(entity.services.find(item=>item.code==='FGK8b').metrics.net_expenses[2025].amount>0)
  const sources=await resolveSvenSources(school,dataDir,{read,insights:true,lens:'drivers',fetchCounts:counts})
  const { records,drivers }=buildPolicyEvidence(sources,'drivers',school)
  const latest=records.get('kostra-fgk8b-1103/net_expenses/2025/thousand')
  assert.match(latest.snapshotUrl,/tables\/12362\/data/)
  assert.equal(new URL(latest.snapshotUrl).searchParams.get('valueCodes[KOKart0000]'),'AGD2')
  assert.equal(latest.value,2795547)
  assert.equal(drivers[0].countKind,'elever')
  assert(Math.abs(sum(drivers[0].rows)-drivers[0].total)<1e-6)
  assert(drivers[0].rows[1].value<0)
})

test('pris og antall dekomponeres additivt og et reelt grensebrudd stanser årsammenligningen', async () => {
  assert.deepEqual(moneyDrivers(100,144,100,120,10,12),{
    before:100,after:144,change:44,prices:20,count:24,residual:0,realChangePercent:20,realPerUnitChangePercent:0,
  })
  assert.equal(moneyDrivers(100,144,100,120,0,12),null)
  const query=school.replace('2021','2019')
  const sources=await resolveSvenSources(query,dataDir,{insights:true,lens:'drivers',fetchCounts:counts})
  const evidence=buildPolicyEvidence(sources,'drivers',query)
  assert.equal(evidence.drivers.length,0)
  assert(evidence.comparisons.some(item=>item.status==='incompatible'&&item.reason.includes('Finnøy')))
})

test('SSB summerer i korrekt matrisedimensjon og skiller manglende fra null', () => {
  const definition={regionKey:'Region',options:{Kjonn:'*',ContentsCode:'Population'}}
  const parsed=readStatbankCounts({
    id:['Tid','Region','Kjonn','ContentsCode'],size:[2,1,2,1],
    dimension:{Region:{category:{index:{'1103':0}}},Tid:{category:{index:{2021:0,2025:1}}},
      ContentsCode:{category:{index:{Population:0}}}},
    value:[120,80,99,null],
  },[2021,2025],definition,'1103')
  assert.deepEqual(parsed,{2021:200,2025:null})
})

test('budsjettsporet bruker reelle faser og flagger kapittel med flere departementer', async () => {
  const question='Følg kapittel 1760 post 45 fra forslag til regnskap i 2025 og 2027'
  const sources=await resolveSvenSources(question,dataDir,{insights:true,lens:'budget'})
  const result=buildPolicyEvidence(sources,'budget',question)
  assert.deepEqual(result.timelines[0].rows.map(item=>item.value),[null,34476.2,50578.4,45877.9])
  assert.deepEqual(result.timelines[1].rows.map(item=>item.value),[33742.377,null,null,null])
  const proposal=result.records.get(result.timelines[1].rows[0].observationId)
  assert.match(proposal.url,/regjeringen\.no/)
  const relocated='Sammenlign kapittel 0001 fra 2023 til 2025'
  const resolved=await resolveSvenSources(relocated,dataDir,{insights:true,lens:'comparison'})
  const evidence=buildPolicyEvidence(resolved,'comparison',relocated)
  assert(evidence.comparisons.some(item=>item.reason.includes('flere departementer')))
})

test('manglende budsjettfase kan fylles fra et etterprøvbart offisielt utdrag', async () => {
  const question='Følg kapittel 1760 post 45 i 2025'
  const sources=await resolveSvenSources(question,dataDir,{insights:true,lens:'budget'})
  const evidence=buildPolicyEvidence(sources,'budget',question)
  const excerpt={id:'primær',title:'Testdokument',primaryCandidate:true,url:'https://www.regjeringen.no/dokument.pdf',
    text:'Kapittel 1760 post 45: foreslått 3 450 000 tusen kroner i 2025.'}
  const make=(quote)=>finishPolicy(baseAnswer,{budgetEvidence:[{budgetSourceId:sources[0].id,year:2025,
    phase:'forslag',sourceId:excerpt.id,rawValue:3450000,unit:'1 000 kr',quote}]},evidence,[...sources,excerpt],question)
  assert.equal(make('foreslått 3 450 000 tusen kroner').policy.timelines[0].rows[0].value,3450)
  assert.equal(make('et oppdiktet beløp på 3 450 000').policy.timelines[0].rows[0].value,null)
})

test('tallsporet avviser feil år og falske sitater, dokumenterer beregnede celler og følger med til Excel', async () => {
  const expense='kostra-fgk8b-1103'
  const sources=await resolveSvenSources(school,dataDir,{insights:true,lens:'drivers',fetchCounts:counts})
  const meta=buildPolicyEvidence(sources,'drivers',school)
  const priorValue=meta.records.get(expense+'/net_expenses/2021/thousand').value
  const current=meta.records.get(expense+'/net_expenses/2025/thousand').value
  const extra={ id:'web-excerpt',title:'Kilde for råtall',url:'https://www.regjeringen.no/rapport.pdf',
    text:'På side 7 viser tabellen et særskilt beløp på 12 300 kroner.',page:7 }
  const table={ title:'Grunnskoleutgifter · Stavanger', columns:[{label:'Kommune'},{label:'2021',unit:'1 000 kr'},
    {label:'2025',unit:'1 000 kr'},{label:'Eksternt',unit:'kr'}],
    rows:[['Stavanger',priorValue,current,12300]], calculations:[{label:'Vekst',unit:'%',op:'growth',columns:[1,2]}],
    derived:[[(current/priorValue-1)*100]], sourceIds:[expense,extra.id] }
  const analysis={...baseAnswer,deliverables:{title:table.title,formats:['xlsx'],sections:[],table}}
  const done=finishPolicy(analysis,{cells:[
    { row:0,column:1,observationId:expense+'/net_expenses/2025/thousand' },
    { row:0,column:3,sourceId:extra.id,quote:'et særskilt beløp på 12 300 kroner.' },
  ]},meta,[...sources,extra],school)
  assert.equal(done.policy.tableRefs.find(item=>item.column===1).observationId,expense+'/net_expenses/2021/thousand')
  const quote=done.policy.observations.find(item=>item.id.startsWith(extra.id+'/quote/'))
  assert.equal(quote.url,'https://www.regjeringen.no/rapport.pdf#page=7')
  const growth=done.policy.observations.find(item=>item.id==='tabell-beregning/0/4')
  assert.equal(growth.inputs.length,2)
  assert.match(growth.formula,/2025\/2021/)
  const bad=finishPolicy(analysis,{cells:[{row:0,column:3,sourceId:extra.id,quote:'fantasipåstand på 12 300 kroner'}]},meta,[...sources,extra],school)
  assert(!bad.policy.tableRefs.some(item=>item.column===3))
  const model=normalizeExport('xlsx',{...done,sources:[...sources,extra]})
  const book=new ExcelJS.Workbook()
  await book.xlsx.load(await exportFile('xlsx',model))
  const sheet=book.getWorksheet('Kildespor')
  assert.equal(sheet.getCell('B2').value,'B2')
  assert.match(sheet.getCell('I2').value.hyperlink,/tables\/12362/)
})

test('faktasjekk krever uavhengig kilde for konklusjon og beholder flere avgrensninger', () => {
  const claim='Kommunens skolebudsjett økte med 25 %.'
  const sources=[
    {id:'sitat',title:'Utsagn',url:'https://www.stortinget.no/',text:claim},
    {id:'regnskap',title:'Regnskap',url:'https://www.ssb.no/',text:'Regnskapet viser 8 % vekst.'},
  ]
  const testing=sourceIds=>finishPolicy(baseAnswer,{factCheck:{claim,claimSourceId:'sitat',verdict:'partial',reasoning:'År og fase er avgjørende.',sourceIds,
    interpretations:[{basis:'Regnskap, samme år',result:'8 %',sourceIds:['regnskap']}] }},
  buildPolicyEvidence(sources,'factcheck',claim),sources,claim).policy.factCheck
  assert.equal(testing(['regnskap']).wording,'source')
  assert.equal(testing(['regnskap']).verdict,'partial')
  assert.equal(testing(['regnskap']).interpretations.length,1)
  assert.equal(testing(['sitat']).verdict,'insufficient')
})

const caseDoc=(at, extra='')=>`<detaljert_sak xmlns="http://data.stortinget.no">
  <respons_dato_tid>${at}</respons_dato_tid><id>47163</id><korttittel>En kjent sak</korttittel>
  <status>behandlet</status><ferdigbehandlet>false</ferdigbehandlet>
  <publikasjon_referanse_liste><publikasjon_referanse><eksport_id>første</eksport_id><lenke_tekst>Innstilling</lenke_tekst>
  <lenke_url>//www.stortinget.no/dok/innstilling</lenke_url><type>innstilling</type></publikasjon_referanse>${extra}</publikasjon_referanse_liste>
</detaljert_sak>`

test('oppfølging fanger nye dokumenter og relevante endringer uten å varsle om lesetidspunktet', async () => {
  let xml=caseDoc('tid-1')
  const info={fetchCase:async id=>parsePublicCase(xml,id)}
  const target={kind:'case',key:'47163'}
  const before=await readWatchTarget(target,info)
  assert(before.points.some(row=>row.id==='completed'&&row.value==='Nei'))
  xml=caseDoc('tid-2')
  assert.equal((await readWatchTarget(target,info)).version,before.version)
  xml=caseDoc('tid-3','<publikasjon_referanse><lenke_tekst>Vedtak</lenke_tekst><lenke_url>//www.stortinget.no/dok/vedtak</lenke_url></publikasjon_referanse>')
  const changed=await readWatchTarget(target,info)
  assert.notEqual(changed.version,before.version)
  assert(changed.points.some(row=>row.value==='Vedtak'))
  const municipality=await readWatchTarget({kind:'municipality',key:'1103',metric:'FGK8b'},{read:disk})
  assert(municipality.points.some(row=>row.id==='2025'&&row.value===2795547))
  const budget=await readWatchTarget({kind:'budget',key:'1760-45',year:2025},{read:disk})
  assert(budget.points.some(row=>row.id.endsWith('-regnskap')&&row.value===45877.9))
  assert.equal(normalizeWatchTarget({kind:'case',key:'https://example.com/?p=47163'}),null)
})

const headers={host:'preview.test',origin:'https://preview.test','content-type':'application/json'}
const replyStub=()=>({setHeader(){},status(code){this.code=code;return this},json(body){return {status:this.code,body}}})
test('oppfølgingsendepunktet behandler bare gyldige, offentlige emner', async () => {
  const handle=previewWatch({environment:'preview',read:disk})
  const call=targets=>handle({method:'POST',headers,body:{targets}},replyStub())
  assert.equal((await call([{kind:'budget',key:'../secret'}])).status,400)
  assert.equal((await call([{kind:'municipality',key:'1103'}])).body.items[0].target.key,'1103')
})

test('previewen tolker oppgaven, henter tallspor og leverer kilde til mobilchatten', async () => {
  const pack=data=>({content:[{type:'text',text:JSON.stringify(data)}]})
  const calls=[]
  const key='kostra-fgk8b-1103'
  const preview=hostedPreview({environment:'preview',apiKey:'test',
    sources:(query,_signal,_load,options)=>resolveSvenSources(query,dataDir,{...options,fetchCounts:counts}),
    createRequest:()=>async ({phase,input})=>{
      calls.push(phase)
      const query=JSON.parse(input)
      if(phase==='interpret') return pack({ action:'research',lens:'drivers',denominator:'pupils',tools:['fellestall'],
        intent:{request:school,purpose:'Bryte ned endring',meaning:school},
        plan:{scope:'Stavanger',questions:[school],searches:[],counterSearch:'',missing:[]} })
      if(phase==='answer-0'){
        assert(query.policyEvidence.drivers[0].rows.length===3)
        return pack({...baseAnswer,deliverables:{title:'Stavanger',formats:[],sections:[],table:{title:'Grunnskole',sourceIds:[key],
          columns:[{label:'Kommune'},{label:'2025',unit:'1 000 kr'}],rows:[['Stavanger',2795547]]}}})
      }
      assert.equal(phase,'review-0')
      assert(query.answer.policy.tableRefs.length)
      return pack({passed:true,issues:[]})
    },
  })
  const requestId=randomBytes(32).toString('hex')
  const post=body=>preview({method:'POST',headers,body:{...body,requestId}},replyStub())
  let result=await post({question:school})
  for(let i=0;result.status===202&&i<7;i++)result=await post({resume:true})
  assert.equal(result.status,200)
  assert(result.body.sources.find(source=>source.id==='ssb-11971-1103'))
  assert.equal(result.body.policy.tableRefs[0].observationId,key+'/net_expenses/2025/thousand')
  assert.deepEqual(calls,['interpret','answer-0','review-0'])
})
