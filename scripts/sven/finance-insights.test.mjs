import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { extractGrantTerms, parseGrantPaymentWorkbook } from '../../server/sven/grant-payments.mjs'
import { financeSources, anomalySeries, simulateEqualization } from '../../server/sven/finance-insights.mjs'
import { buildPolicyEvidence, finishPolicy } from '../../server/sven/policy-insights.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'
import { snapshotLoader } from '../../server/sven/snapshot-cache.mjs'
import { hostedPreview } from './test-access.mjs'

const pack = value=>({content:[{type:'text',text:JSON.stringify(value)}]})
const read = async file=>JSON.parse(await readFile(new URL('../../web/public/data/'+file,import.meta.url),'utf8'))
const focus={code:'1103',name:'Stavanger',kind:'municipality'}
const plan={scope:'Fellestall',questions:['Hva kan dokumenteres?'],searches:[],counterSearch:'',missing:[]}
const answer={summary:'Kildene gir noe grunnlag.',findings:[],uncertainties:[],recommendation:null}

test('terminverktøyet henter kommunevedlegget og skiller termin, hittil i år og poster uten dobbelttelling',async()=>{
  const base='/contentassets/9140b6b52571440d9a7db00274df83e5/2025/'
  const html=`<h3>Kommunene</h3><ul><li>Desember (termin 11)<br><a href="${base}k11_2025.xlsx">Excel</a></li></ul>
  <h3>Fylkeskommunene</h3><ul><li>Desember (termin 11)<br><a href="${base}fk11_2025.xlsx">Excel</a></li></ul>`
  const [term]=extractGrantTerms(html,2025)
  assert(term.url.endsWith('/k11_2025.xlsx'))
  assert.equal(extractGrantTerms(html,2024).length,0)
  const workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('Utbetalinger')
  sheet.addRow(['Beregning av rammetilskudd og utbetaling til kommunene, desember 2025 (termin 11)'])
  sheet.addRow([])
  sheet.addRow(['Kommune','Innbyggertilskudd/utgiftsutjevning','Egentlig inntekt-sutjevning','Inntektsutjevning denne terminen',
    'Distriktstilskudd Sør-Norge','Distriktstilskudd Nord-Norge','Totalt skjønnstilskudd','Herav ordinært skjønn',
    'Herav ekstra skjønn fra Statsforvalteren','Herav ekstra skjønn fra KDD','Veksttilskudd','Storbytilskudd',
    'Terminutbetaling','Gjenstående inntekts-utjevning','Samlet beløp utbetalt hittil i år'])
  sheet.addRow(['1103 Stavanger',100,900,-20,0,0,10,10,0,0,0,0,90,0,900])
  sheet.addRow(['0301 Oslo',200,200,-40,0,0,0,0,0,0,0,0,160,0,1600])
  sheet.addRow([null,null,null,null,null,null,null,null,null,null,null,null,250,0,2500])
  const bytes=Buffer.from(await workbook.xlsx.writeBuffer())
  const report=await parseGrantPaymentWorkbook(bytes,2025,11)
  const row=report.recipients[0]
  assert.deepEqual([row.paid,row.ytd,row.posts[60],row.posts[64]],[90,900,80,10])
  await assert.rejects(parseGrantPaymentWorkbook(bytes,2026,11),/År, termin/)
  const sources=await financeSources({lens:'transfers',years:[2025],focus,question:'rammetilskudd',read,index:{latestYear:2025},
    loadPayments:async()=>({post:null,scope:'ytd',year:2025,...term,...report})})
  const policy=finishPolicy(answer,null,buildPolicyEvidence(sources,'transfers',''),sources,'').policy
  assert.equal(policy.finance.transfers.total,2500)
  assert.equal(policy.observations.find(record=>record.id.endsWith('/1103')).value,900)
  assert(policy.observations.some(record=>record.label.includes('Bokført')&&new URL(record.snapshotUrl).searchParams.get('valueCodes[KOKart0000]')==='A800'))
})

test('skatteutjevning bruker alle kommuner og en budsjettbalansert modell med KDDs observerte utgangspunkt',async()=>{
  const cache=new Map()
  const load=snapshotLoader({cache:{get:key=>cache.get(key),set:(key,value)=>cache.set(key,value)},
    fetchImpl:async()=>Response.json(await read('kostra/index.json'))})
  const index=JSON.parse(await load('kostra/index.json'))
  const [src,rules]=await financeSources({lens:'distribution',years:[2025],focus,question:'inntektsutjevning',options:{symmetric:64},read,index})
  assert(rules.url.includes('regjeringen.no'))
  const data=src.finance.data
  assert.equal(data.rows.length,357)
  assert.equal(data.totalPopulation,5594340)
  assert.equal(data.highlights.focus.delta,-34641840.86)
  const result=simulateEqualization(data.rows,data.proposed)
  assert(Math.abs(result.rows.reduce((sum,row)=>sum+row.amount,0))<1)
  assert.deepEqual(data.baseline,{symmetric:62,supplementary:35,threshold:90})
  const same=await financeSources({lens:'distribution',years:[2023],focus,question:'inntektsutjevning',read,index})
  assert.deepEqual(same,[])
})

test('skolekvalitet binder utgift og elevtall til eksakte uttrekk og lar manglende utfall stå tomt',async()=>{
  const sources=await resolveSvenSources('Utgifter og skolekvalitet i Stavanger 2024–2025',undefined,{read,insights:true,lens:'school-quality',
    loadSeries:async (definition,_code,years)=>({values:Object.fromEntries(years.map(year=>[year,definition.table==='11971'?16481:
      definition.key==='reading'?null:definition.key==='points'?43.2:15.7]))})})
  const {policy}=finishPolicy(answer,null,buildPolicyEvidence(sources,'school-quality',''),sources,'')
  const row=policy.finance.schoolQuality.rows.at(-1)
  assert.equal(row.cells.points.value,43.2)
  assert.equal(row.cells.reading,undefined)
  assert.equal(row.cells.spending.value,169622.41)
  const record=policy.observations.find(record=>record.id===row.cells.spending.observationId)
  assert.equal(record.inputs.length,2)
  assert(policy.observations.some(record=>new URL(record.snapshotUrl||'https://example.test').searchParams.get('valueCodes[ContentsCode]')==='KOSgrunnskolepoe0000'))
})

test('uvanlige utslag viser kr og historisk endring med grunnlagskrav og kommunegrensebrudd',async()=>{
  const row=Object.fromEntries([100,102,104,107,110,200].map((amount,index)=>[2020+index,{amount}]))
  assert.equal(anomalySeries(row,2025).change,90000)
  assert(anomalySeries(row,2025).deviation>20)
  assert.equal(anomalySeries(row,2025,[2025]),null)
  assert.equal(anomalySeries(row,2025,[2023]).typical,null)
  const sources=await resolveSvenSources('Uvanlige endringer i Stavanger 2025',undefined,{read,insights:true,lens:'anomalies'})
  const {policy}=finishPolicy(answer,null,buildPolicyEvidence(sources,'anomalies',''),sources,'')
  assert(policy.finance.anomalies.compared>12)
  assert.equal(policy.finance.anomalies.rows.length,12)
  assert(policy.observations.find(row=>row.id===policy.finance.anomalies.rows[0].currentId).snapshotUrl.includes('data.ssb.no'))
})

test('andre tilskudd får sporbart delresultat med dokumenterte stadium og synlige mangler',()=>{
  const sources=[{id:'publisher',url:'https://www.regjeringen.no/test',title:'Statlig dokument',text:'I 2025 ble Fjordvik kommune tildelt 55 000 kroner.'}]
  const {policy}=finishPolicy(answer,{grantTrail:{title:'Fjordvik',year:2025,rows:[
    {recipient:'Fjordvik kommune',stage:'allocated',sourceId:'publisher',quote:sources[0].text,value:55000,unit:'kr'},
    {recipient:'Fjordvik kommune',stage:'paid',sourceId:'publisher',quote:'Fjordvik kommune fikk pengene utbetalt.',value:55000,unit:'kr'},
  ]}},buildPolicyEvidence(sources,'transfers',''),sources,'')
  assert.equal(policy.finance.grantTrail.rows.length,1)
  assert(policy.finance.grantTrail.missing.includes('Utbetalt'))
})

async function previewQuestion(options,question) {
  const preview=hostedPreview({environment:'preview',apiKey:'test',...options})
  const req={method:'POST',headers:{origin:'https://preview.test',host:'preview.test','content-type':'application/json'},
    body:{requestId:randomBytes(32).toString('hex'),question}}
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}
  for(let call=0;call<12;call++){
    const result=await preview(req,res)
    if(!result.body.continuation) return result
    req.body={requestId:req.body.requestId,resume:true}
  }
  throw new Error('Previewen fullførte ikke')
}

test('ukjent verktøy velger et tilgjengelig kildeoppslag og fortsetter med nettsøk om dekning mangler',async()=>{
  const phases=[]
  const question='Hvem fikk tilskuddet fra ordningen?'
  const result=await previewQuestion({sources:async()=>[],
    createRequest:()=>async({phase,tools,input})=>{
      phases.push(phase)
      if(phase==='interpret') return pack({intent:{request:question,purpose:'Finne mottakere',meaning:question},action:'research',
        tools:['oppdiktet-tildelingsregister'],lens:'transfers'})
      if(phase==='research') {
        assert(tools.some(tool=>tool.name==='web_search'))
        return{content:[{type:'text',text:'Kildetekst',citations:[{type:'web_search_result_location',
          url:'https://www.regjeringen.no/test',title:'Tildelingsoversikt',cited_text:'Kommune A fikk tildelt 100 kr.'}]}]}
      }
      if(phase==='answer-0') return pack({...answer,findings:[{text:'Kommune A fikk tildelt 100 kr.',sourceIds:[JSON.parse(input).sources[0].id]}]})
      assert.equal(phase,'review-0')
      return pack({passed:true,issues:[]})
    }},question)
  assert.equal(result.code,200)
  assert.deepEqual(phases,['interpret','research','answer-0','review-0'])
  assert.equal(result.body.sources[0].title,'Tildelingsoversikt')
})

test('manglende grunnlag svarer med et konkret oppfølgingsspørsmål',async()=>{
  const question='Hvem fikk tilskuddet?'
  const result=await previewQuestion({sources:async()=>[],createRequest:()=>async({phase})=>phase==='interpret'
    ?pack({intent:{request:question,purpose:'Finne mottakere',meaning:question},action:'research',tools:['fellestall'],lens:'transfers',plan})
    :{content:[]}},question)
  assert.equal(result.code,200)
  assert.match(result.body.summary,/Hvilken tilskuddsordning og hvilket år/)
})
