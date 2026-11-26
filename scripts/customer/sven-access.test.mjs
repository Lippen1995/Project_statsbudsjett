import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { customerDatabase, origin } from './test-support.mjs'
import { hostedPreview } from '../sven/hosted-preview.mjs'
import { previewFiles } from '../sven/preview-files.mjs'
import { previewWatch } from '../sven/preview-watch.mjs'

function call(handler,body,cookie,method='POST') {
  let status
  const res={setHeader(){},status(value){status=value;return res},json(body){return{status,body}}}
  return handler({method,headers:{host:'localhost:5173',origin,'content-type':'application/json',...(cookie?{cookie}:{})},body},res)
}
const message=value=>({content:[{type:'text',text:JSON.stringify(value)}],usage:{input_tokens:10,output_tokens:5},stop_reason:'end_turn'})

test('chat, resultat, status og køarbeid er bundet til reelle kundeøkter og eier',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  const a=await db.register('chat-a@example.test'),b=await db.register('chat-b@example.test')
  const aUser=await db.service.access.authorize({method:'GET',headers:{cookie:a.cookie}})
  const bUser=await db.service.access.authorize({method:'GET',headers:{cookie:b.cookie}})
  const ca=await db.service.resources.create(aUser,'conversations',{title:'Samtale A'})
  const cb=await db.service.resources.create(bUser,'conversations',{title:'Samtale B'})
  const stored=new Map(),cache={get:async key=>stored.get(key),set:async(key,value)=>stored.set(key,value)}
  let models=0
  const options={environment:'preview',apiKey:'controlled-test-key',access:db.service.access,cache,
    createRequest:()=>async()=>{models++;return message({intent:{meaning:'Forklar dette',purpose:'Forstå tall',request:'Privat spørsmål'},action:'reply',reply:'Privat svar til kunde A'})}}
  const handler=hostedPreview(options)
  const id=randomBytes(32).toString('hex')
  const input={requestId:id,conversationId:ca.id,question:'Forklar hva tallene betyr',customerId:b.user.id,plan:'paid'}
  assert.equal((await call(handler,input)).status,401)
  assert.equal(models,0)
  const result=await call(handler,input,a.cookie)
  assert.equal(result.status,200)
  assert.equal(result.body.summary,'Privat svar til kunde A')
  assert.equal(models,1)
  assert.equal((await call(handler,{requestId:id,resume:true},a.cookie)).body.summary,result.body.summary)
  assert.equal(models,1)
  for(const input of [{requestId:id,resume:true},{requestId:id,progress:true},{requestId:id,conversationId:cb.id,question:'Overta innsending'}]) {
    const rejected=await call(hostedPreview(options),input,b.cookie)
    assert.equal(rejected.status,404)
    assert.equal(JSON.stringify(rejected).includes('Privat svar'),false)
  }
  assert.equal((await call(handler,{...input,requestId:randomBytes(32).toString('hex')},b.cookie)).status,404)
  const rows=await db.sql.query('SELECT owner_id FROM ft_customer_resource WHERE kind=\'jobs\' AND id=$1',[id])
  assert.equal(rows[0].owner_id,a.user.id)
  const packets=[]
  const queued=hostedPreview({...options,publishJob:async(id,state)=>packets.push({id,state:structuredClone(state)})})
  const next=randomBytes(32).toString('hex')
  assert.equal((await call(queued,{requestId:next,conversationId:ca.id,question:'Undersøk senere'},a.cookie)).status,202)
  const packet=packets[0]
  assert.notEqual(packet.id,next)
  assert.equal(packet.state.brief.customerId,a.user.id)
  assert.equal(packet.state.brief.customerRequestId,next)
  assert.equal((await queued.work(packet.id,{...packet.state,brief:{...packet.state.brief,customerId:b.user.id}})).status,404)
  assert.equal(models,1)
  assert.equal((await queued.work(packet.id,packet.state)).status,200)
  assert.equal(models,2)
  assert.equal((await call(queued,{requestId:next,resume:true},b.cookie)).status,404)
  await db.call('/api/customer/auth/sign-out',{},a.cookie)
  assert.equal((await call(handler,{requestId:id,resume:true},a.cookie)).status,401)
  assert.equal((await call(handler,{requestId:id,progress:true},a.cookie)).status,401)
  assert.equal(models,2)
})

test('fil- og følgerutene krever kundeøkt; fil-ID kan ikke brukes fra en annen konto',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  const a=await db.register('fil-a@example.test'),b=await db.register('fil-b@example.test')
  const files=previewFiles({environment:'preview',access:db.service.access,readVisual:()=>assert.fail('Ingen modellkall')})
  const upload={action:'extract',name:'tall.csv',data:Buffer.from('Navn;Beløp\nKommune;120').toString('base64')}
  assert.equal((await call(files,upload)).status,401)
  const result=await call(files,upload,a.cookie)
  assert.equal(result.status,200)
  assert.match(result.body.assetId,/^[a-f0-9-]{36}$/)
  assert.match(result.body.text,/120/)
  const user=await db.service.access.authorize({method:'GET',headers:{cookie:a.cookie}})
  assert.equal((await db.service.resources.owned(user,'files',result.body.assetId)).title,'tall.csv')
  assert.equal((await call(files,{action:'export',fileId:result.body.assetId},b.cookie)).status,404)
  const watch=previewWatch({environment:'preview',access:db.service.access,read:()=>assert.fail('Ingen kildeoppslag før innlogging')})
  assert.equal((await call(watch,{targets:[]})).status,401)
  assert.equal((await call(watch,{targets:[]},b.cookie)).status,400)
})
