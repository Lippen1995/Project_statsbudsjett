import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { customerDatabase, testQuotas } from './test-support.mjs'
import { customerQuota } from '../../server/customer/quota.mjs'
import { nanoUSD, normalizeUsage, quotaConfig, quotaPeriod, reservationQuote, usageCost } from '../../server/customer/quota-config.mjs'
import { previewRequests } from '../../server/sven/preview-requests.mjs'
import { customerRequestKey } from '../../server/customer/storage.mjs'
import { hostedPreview } from '../sven/hosted-preview.mjs'
import { visionImport } from '../../server/sven/vision-import.mjs'
import { previewFiles } from '../sven/preview-files.mjs'
import { claudeTransport } from '../../server/sven/provider.mjs'

const model='claude-sonnet-5-5',id=()=>randomBytes(32).toString('hex')
const params={phase:'answer-0',instructions:'Svar med kilde.',input:'Privat testspørsmål',maxTokens:128000,meterInputTokens:100}
const usage=(requestId='provider-'+id())=>({input:100,output:10,cacheRead:40,cacheWrite:20,searches:1,requestId,model,stopReason:'end_turn'})
function config({free=0.1,paid=1,global=10}={}) {
  return quotaConfig({FELLESTALL_SVEN_QUOTAS:{version:1,plans:{free:{monthlyNano:Math.round(free*nanoUSD),models:[model]},paid:{monthlyNano:Math.round(paid*nanoUSD),models:[model,'claude-opus-5-5']}},globalMonthlyNano:Math.round(global*nanoUSD)}})
}
async function setup(t,options={}) {
  const db=await customerDatabase();t.after(()=>db.engine.close())
  const a=await db.register('kvote-a@example.test'),b=await db.register('kvote-b@example.test')
  let date=new Date('2026-11-26T12:00:00Z')
  const quota=customerQuota({pool:db.pool,secret:db.secret,config:config(options),now:()=>date})
  const reserve=(user=a.user,changes={})=>quota.reserve({userId:user.id,requestId:id(),phase:'answer-0',model,params,...changes})
  return {...db,a,b,quota,reserve,setDate:value=>date=new Date(value)}
}
function call(handler,body,cookie,method='POST') {
  let status;const res={setHeader(){},status(value){status=value;return res},json(body){return{status,body}}}
  return handler({method,headers:{host:'localhost:5173',origin:'http://localhost:5173','content-type':'application/json',cookie},body},res)
}

test('prisvekting inkluderer input, output, cache og søk; perioder følger Oslo og manglende måling er ukjent',()=>{
  assert.equal(usageCost(model,normalizeUsage({input_tokens:1000,output_tokens:100,cache_read_input_tokens:1000,cache_creation_input_tokens:200,server_tool_use:{web_search_requests:2}})),23600000)
  assert.equal(usageCost('claude-opus-5-5',normalizeUsage({input:1000,output:100,cacheRead:1000,cacheWrite:200,searches:2})),27200000)
  assert.equal(normalizeUsage({input_tokens:10}),null)
  assert.equal(normalizeUsage({input:10,output:NaN}),null)
  assert.equal(quotaPeriod(new Date('2026-11-30T23:30:00Z')).key,'2026-12')
  assert.equal(quotaPeriod(new Date('2026-05-31T22:30:00Z')).resetAt,'2026-06-30T22:00:00.000Z')
  assert.equal(quotaConfig({}).ready,false)
  assert.throws(()=>config({free:-1}))
  assert.throws(()=>reservationQuote(model,{...params,meterInputTokens:undefined},config(),1e9),{status:503})
  const quote=reservationQuote(model,params,config(),100000000)
  assert(quote.maxTokens<128000);assert(quote.reservedNano<=100000000)
})

test('to instanser reserverer samme kapasitet atomisk; ferdig måling og leverandør-ID avregnes én gang',async t=>{
  const db=await setup(t),second=customerQuota({pool:db.pool,secret:db.secret,config:config(),now:()=>new Date('2026-11-26T12:00:00Z')})
  const input={userId:db.a.user.id,requestId:id(),phase:'answer-0',model,params}
  const outcomes=await Promise.allSettled([db.quota.reserve(input),second.reserve({...input,requestId:id()})])
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1)
  assert.equal(outcomes.find(row=>row.status==='rejected').reason.status,402)
  const ticket=outcomes.find(row=>row.status==='fulfilled').value,measured=usage()
  const cost=usageCost(model,normalizeUsage(measured))
  await db.quota.record(ticket,measured)
  await second.record(ticket,measured)
  let state=await db.quota.summary(db.a.user)
  assert.equal(state.spent,cost);assert.equal(state.held,0)
  const another=await db.reserve();await db.quota.record(another,measured)
  state=await db.quota.summary(db.a.user)
  assert.equal(state.spent,cost);assert.equal(state.held,0)
  assert.equal((await db.quota.summary(db.b.user)).spent,0)
  const rows=await db.sql.query('SELECT request_id,digest,usage FROM ft_customer_meter')
  assert.doesNotMatch(JSON.stringify(rows),/Privat testspørsmål|Svar med kilde/)
  assert.equal((await db.call('/api/customer/usage',undefined,db.a.cookie)).status,200)
  assert.equal((await db.call('/api/customer/credit',{amount:1000000000},db.a.cookie)).status,404)
})

test('ukjent forbruk beholder hele reservasjonen og stanser nye kall; bekreftet måling frigir riktig rest',async t=>{
  const db=await setup(t),ticket=await db.reserve()
  await db.quota.record(ticket,{input:100,output:1},{complete:false})
  let state=await db.quota.summary(db.a.user)
  assert.equal(state.held,ticket.reservedNano);assert.equal(state.spent,0);assert.equal(state.unresolved,1);assert.equal(state.blocked,true)
  await assert.rejects(db.reserve(db.b.user),{status:503})
  await assert.rejects(db.quota.reserve({userId:db.a.user.id,requestId:(await db.sql.query('SELECT request_id FROM ft_customer_meter WHERE id=$1',[ticket.id]))[0].request_id,phase:'answer-0',model,params}),{status:409})
  const measured=usage();await db.quota.record(ticket,measured)
  state=await db.quota.summary(db.a.user)
  assert.equal(state.held,0);assert.equal(state.spent,usageCost(model,normalizeUsage(measured)));assert.equal(state.blocked,false)
  const rejected=await db.reserve()
  await db.quota.record(rejected,null,{rejected:true})
  assert.equal((await db.quota.summary(db.a.user)).spent,state.spent)
})

test('ett arbeidstoken starter bare én leverandørforespørsel og prosessavbrudd blir varig ukjent',async t=>{
  const db=await setup(t),ticket=await db.reserve()
  let calls=0,enter,release
  const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve)
  const work=db.quota.execute(ticket,params,async(_params,measured)=>{calls++;enter();await gate;await measured(usage());return {ok:true}})
  await entered
  await assert.rejects(db.quota.execute(ticket,params,()=>{calls++;assert.fail()}),{status:409})
  release();await work;assert.equal(calls,1)
  const interrupted=await db.reserve()
  await db.sql.query("UPDATE ft_customer_meter SET state='running',lease_until='2026-11-26T11:00:00Z' WHERE id=$1",[interrupted.id])
  await db.quota.maintain('2026-11')
  assert.equal((await db.quota.summary(db.a.user)).blocked,true)
  assert.equal((await db.sql.query('SELECT state FROM ft_customer_meter WHERE id=$1',[interrupted.id]))[0].state,'unknown')
})

test('oppgradering, utløp, ekstrakapasitet og periodeskifte beholder korrekt forbruk',async t=>{
  const db=await setup(t,{free:0.001,paid:0.1}),key=id()
  await assert.rejects(db.reserve(),{status:402})
  await assert.rejects(db.quota.allowed(db.a.user,'claude-opus-5-5'),{status:403})
  await db.sql.query("UPDATE ft_customer_access SET plan='paid',paid_from='2026-11-26T00:00:00Z',paid_until='2026-12-15T00:00:00Z' WHERE user_id=$1",[db.a.user.id])
  await db.quota.allowed(db.a.user,'claude-opus-5-5')
  assert.equal((await db.quota.summary(db.a.user)).plan,'paid')
  const ticket=await db.reserve(),measured={input:100,output:10,cacheRead:0,cacheWrite:0,searches:0}
  await db.quota.record(ticket,measured)
  db.setDate('2026-12-01T12:00:00Z')
  assert.equal((await db.quota.summary(db.a.user)).spent,usageCost(model,measured),'Kalendermåned skal ikke nullstille et løpende betalt abonnement')
  const grant=await db.quota.credit(db.a.user,{source:'test-confirmed-'+key,amount:50000000})
  assert.deepEqual(await db.quota.credit(db.a.user,{source:'test-confirmed-'+key,amount:50000000}),grant)
  await assert.rejects(db.quota.credit(db.a.user,{source:'test-confirmed-'+key,amount:50000001}),{status:409})
  db.setDate('2026-12-16T12:00:00Z')
  const reset=await db.quota.summary(db.a.user)
  assert.equal(reset.plan,'free');assert.equal(reset.spent,0);assert.equal(reset.extraRemaining,50000000)
  const fromExtra=await db.reserve();await db.quota.record(fromExtra,{...measured,output:200})
  assert((await db.quota.summary(db.a.user)).extraRemaining<50000000)
  await db.quota.credit(db.a.user,{source:'expired-'+key,amount:10000000,validFrom:'2026-10-01T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z'})
  assert.equal((await db.quota.summary(db.a.user)).extra,50000000)
})

test('global grense deles mellom kunder og sletting kan ikke nullstille global kostnad',async t=>{
  const db=await setup(t,{free:1,global:0.1}),ticket=await db.reserve()
  await assert.rejects(db.reserve(db.b.user),{status:503})
  const measured={input:100,output:10,cacheRead:0,cacheWrite:0,searches:0}
  await db.quota.record(ticket,measured);await db.service.storage.deleteAccount(db.a.user)
  const [global]=await db.sql.query('SELECT * FROM ft_customer_quota_global WHERE period=$1',['2026-11'])
  assert.equal(Number(global.spent),usageCost(model,measured))
  assert.equal((await db.sql.query('SELECT owner_id FROM ft_customer_meter WHERE id=$1',[ticket.id]))[0].owner_id,null)
  assert.equal((await db.quota.summary(db.b.user)).spent,0)
})

test('uventet leverandørforbruk registreres i sin helhet og utløser en varig stopp',async t=>{
  const db=await setup(t),ticket=await db.reserve(),measured={input:1000000,output:128000,cacheRead:0,cacheWrite:0,searches:10}
  const receipt=await db.quota.record(ticket,measured)
  assert.equal(receipt.overrun,true)
  assert.equal((await db.quota.summary(db.a.user)).spent,usageCost(model,measured))
  assert.equal((await db.quota.summary(db.b.user)).blocked,true)
  await assert.rejects(db.reserve(db.b.user),{status:503})
})

test('kvotestopp pauser samme køjobb; oppgradering gjenopptar uten å gjenta fullførte modelltrinn',async t=>{
  const db=await setup(t),conversation=await db.service.resources.create(db.a.user,'conversations',{title:'Fortsett samme analyse'})
  const requestId=id();await db.service.storage.claimJob(db.a.user,requestId,{title:'Kvote',conversationId:conversation.id})
  const internal=customerRequestKey(db.a.user.id,requestId),packets=[]
  const requests=previewRequests(db.service.storage.jobCache)
  const publish=async(id,state)=>packets.push({id,state:structuredClone(state)})
  const brief={customerId:db.a.user.id,customerRequestId:requestId}
  await requests.enqueue(internal,brief,publish)
  let count=0,paid=false
  const execute=async(_brief,memo)=>{
    await memo('interpret',{},async()=>{count++;return 'Ferdig tolkning'},{billable:true})
    try {await memo('answer',{},async()=>{count++;return 'Ferdig svar'},{billable:true,beforeStart:()=>{if(!paid)throw Object.assign(Error('Kvote'),{status:402})}})}
    catch{return {status:402,body:{quotaBlocked:true,recoverable:true,error:'Kvote'}}}
    return {status:200,body:{summary:'Ferdig svar'}}
  }
  const first=await requests.work(internal,packets[0].state,execute,publish)
  assert.equal(first.status,402);assert.equal(count,1)
  assert.equal((await requests.backgroundStatus(internal)).status,402)
  assert.equal((await requests.work(internal,packets[0].state,()=>assert.fail('Pause skal bestå'),publish)).status,402)
  paid=true;await requests.restartQueued(internal,publish)
  assert.equal((await requests.work(internal,packets.at(-1).state,execute,publish)).status,200)
  assert.equal(count,2)
})

test('virkelig chatguard avregner i serveren, avviser modellbytte og ignorerer klientens kvote',async t=>{
  const db=await setup(t),conversation=await db.service.resources.create(db.a.user,'conversations',{title:'Serverkvote'})
  let models=0
  const options={environment:'preview',apiKey:'test-only',access:db.service.access,countTokens:async()=>100,
    createRequest:()=>async()=>{models++;return{content:[{type:'text',text:JSON.stringify({intent:{meaning:'Forklar tallene',purpose:'Forstå',request:'Test'},action:'reply',reply:'Kontrollert svar'})}],usage:{input_tokens:100,output_tokens:10},stop_reason:'end_turn'}}}
  const handler=hostedPreview(options),requestId=id(),input={requestId,conversationId:conversation.id,question:'Forklar tallene',plan:'paid',remaining:1000000000}
  assert.equal((await call(handler,{...input,model:'claude-opus-5-5'},db.a.cookie)).status,403)
  assert.equal(models,0)
  assert.equal((await call(handler,input,db.a.cookie)).status,200)
  const server=await(await db.call('/api/customer/usage',undefined,db.a.cookie)).json()
  assert.equal(server.spent,300000);assert.equal(server.held,0)
  await call(handler,{requestId,resume:true},db.a.cookie);assert.equal(models,1)
})

test('visuell fillesing reserveres og måles før resultatet lagres; kjent ID kan ikke dobbelstarte',async t=>{
  const db=await setup(t),requestId=id();let calls=0
  const createVisual=options=>visionImport({...options,apiKey:'test-only',countTokens:async()=>100,transport:settings=>async()=>{
    calls++;await settings.onUsage({input:100,output:10,cacheRead:0,cacheWrite:0,model,requestId:'visual-'+requestId,complete:true})
    return{content:[{type:'text',text:JSON.stringify({pages:[{page:1,text:'Privat bildeinnhold',uncertain:false}],partial:false})}],usage:{input_tokens:100,output_tokens:10}}
  }})
  const handler=previewFiles({environment:'preview',access:db.service.access,createVisual})
  const body={action:'extract',name:'test.png',requestId,data:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')}
  assert.equal((await call(handler,body,db.a.cookie)).status,200)
  assert.equal((await call(handler,body,db.a.cookie)).status,409)
  assert.equal(calls,1)
  assert.equal((await db.service.quota.summary(db.a.user)).spent,300000)
})

test('avbrutt strøm beholder leverandør-ID og reservasjon uten automatisk nytt kjøp; HTTP-avvisning belastes ikke',async t=>{
  const db=await setup(t),conversation=await db.service.resources.create(db.a.user,'conversations',{title:'Avbrudd'})
  const packets=[];let calls=0,reject=false
  const options={environment:'preview',apiKey:'test-only',access:db.service.access,countTokens:async()=>100,
    publishJob:async(id,state)=>packets.push({id,state:structuredClone(state)}),
    createRequest:settings=>claudeTransport({...settings,fetchImpl:async()=>{
      calls++
      if(reject)return Response.json({error:{message:'rate limit'}},{status:429})
      return new Response('data: '+JSON.stringify({type:'message_start',message:{id:'partial-test-provider',model,usage:{input_tokens:12}}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}})
    }})}
  const chat=hostedPreview(options),requestId=id()
  assert.equal((await call(chat,{requestId,conversationId:conversation.id,question:'Undersøk kilden'},db.a.cookie)).status,202)
  assert.equal((await chat.work(packets[0].id,packets[0].state)).status,202)
  let [row]=await db.sql.query('SELECT * FROM ft_customer_meter WHERE request_id=$1',[requestId])
  assert.equal(row.state,'unknown');assert.equal(row.provider_request_id,'partial-test-provider');assert.equal(row.usage.output,null)
  assert.equal((await chat.work(packets[0].id,packets[0].state)).status,409);assert.equal(calls,1)
  assert.equal((await db.service.quota.summary(db.a.user)).held,Number(row.reserved))
  await db.service.quota.record({id:row.id},{input:12,output:0,cacheRead:0,cacheWrite:0,searches:0,requestId:'partial-test-provider',model})
  reject=true
  const next=id();assert.equal((await call(chat,{requestId:next,conversationId:conversation.id,question:'Prøv senere'},db.a.cookie)).status,202)
  const packet=packets.at(-1);assert.equal((await chat.work(packet.id,packet.state)).status,429)
  assert.equal((await chat.work(packet.id,packet.state)).status,429);assert.equal(calls,2)
  ;[row]=await db.sql.query('SELECT * FROM ft_customer_meter WHERE request_id=$1',[next])
  assert.equal(row.state,'rejected');assert.equal(Number(row.cost),0)
  assert.equal((await db.service.quota.summary(db.a.user)).spent,24000)
})
