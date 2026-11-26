import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { customerDatabase } from './test-support.mjs'
import { createCustomerService } from '../../server/customer/service.mjs'
import { customerRequestKey } from '../../server/customer/storage.mjs'
import { previewRequests } from '../../server/sven/preview-requests.mjs'
import { backupCustomerContent, backupErasureLedger, restoreCustomerContent } from '../../server/customer/backup.mjs'
import { migrateCustomers } from '../../server/customer/migrations.mjs'
import { testDatabase } from '../admin/test-support.mjs'

async function fixture(t) {
  const db=await customerDatabase();t.after(()=>db.engine.close())
  const a=await db.register('lagring-a@example.test'),b=await db.register('lagring-b@example.test')
  return {...db,a,b}
}
const change=(kind,id,value,version=0)=>({kind,id,value,version})
async function seed(db,user) {
  const project={id:randomUUID(),name:'Privat prosjekt',assets:[]}
  const talk={id:randomUUID(),title:'Privat samtale',projectId:project.id,messages:[{id:randomUUID(),question:'Privat spørsmål',body:'Privat svar',answer:{deliverables:{text:'Lagret leveranseversjon'}}}]}
  const analysis={id:randomUUID(),talkId:talk.id,messageId:talk.messages[0].id,projectId:project.id,title:'Lagret analyse'}
  const file=await db.service.storage.saveFile(user.user,{name:'privat.csv',bytes:Buffer.from('Område;Beløp\nSkole;120'),meta:{name:'privat.csv',text:'Skole;120'},projectId:undefined})
  project.assets.push({id:file.id,name:file.title})
  const watch={id:randomUUID(),target:{kind:'municipality',key:'Stavanger'},title:'Stavanger',points:[]}
  const event={id:randomUUID(),when:new Date().toISOString(),title:'Endret kilde',changes:[],seen:false}
  const changes=[change('conversations',talk.id,talk),change('projects',project.id,project),change('analyses',analysis.id,analysis),change('watches',watch.id,watch),change('watchEvents',event.id,event),change('preferences','theme','dark'),change('preferences','municipality','Stavanger')]
  const existing=(await db.service.storage.list(user.user)).items
  for(const item of changes)item.version=existing.find(row=>row.kind===item.kind&&row.id===item.id)?.version??0
  const result=await db.call('/api/customer/content',{changes},user.cookie,'PUT')
  assert.equal(result.status,200,await result.clone().text())
  return {project,talk,analysis,file,watch,event,items:(await result.json()).items}
}

test('innhold, versjoner, valg og originalfiler overlever en ny server; kryptering og eier kontrolleres',async t=>{
  const db=await fixture(t),data=await seed(db,db.a)
  const restarted=createCustomerService({pool:db.pool,secret:db.secret,origin:db.service.origin,mail:db.mail})
  assert.deepEqual((await restarted.storage.list(db.a.user)).items,data.items)
  assert.equal((await restarted.storage.file(db.a.user,data.file.id)).data,Buffer.from('Område;Beløp\nSkole;120').toString('base64'))
  assert.deepEqual((await restarted.storage.list(db.b.user)).items,[])
  assert.equal((await db.call('/api/customer/files/'+data.file.id,undefined,db.b.cookie)).status,404)
  const encrypted=await db.sql.query('SELECT data FROM ft_customer_document UNION ALL SELECT data FROM ft_customer_file')
  assert.doesNotMatch(JSON.stringify(encrypted),/Privat spørsmål|Privat svar|Skole|Lagret leveranseversjon/)
  const wrongKey=createCustomerService({pool:db.pool,secret:'annen-hemmelighet'.repeat(4),origin:db.service.origin,mail:db.mail})
  await assert.rejects(wrongKey.storage.list(db.a.user))
  const invalid=await db.call('/api/customer/content',{changes:[change('conversations',randomUUID(),{id:randomUUID(),title:'Ugyldig',messages:[]})]},db.a.cookie,'PUT')
  assert.equal(invalid.status,400)
})

test('versjonssjekk avviser tapte oppdateringer og hele feilaktige transaksjoner',async t=>{
  const db=await fixture(t),data=await seed(db,db.a)
  const next={...data.talk,title:'Endret på enhet A'}
  assert.equal((await db.call('/api/customer/content',{changes:[change('conversations',next.id,next,1)]},db.a.cookie,'PUT')).status,200)
  assert.equal((await db.call('/api/customer/content',{changes:[change('conversations',next.id,{...next,title:'Gammel enhet B'},1)]},db.a.cookie,'PUT')).status,409)
  assert.equal((await db.service.storage.list(db.a.user)).items.find(row=>row.id===next.id).value.title,next.title)
  const foreign=await seed(db,db.b)
  const project={id:randomUUID(),name:'Rull tilbake',assets:[{id:foreign.file.id,name:'Andres fil'}]}
  assert.equal((await db.call('/api/customer/content',{changes:[change('preferences','units','total'),change('projects',project.id,project)]},db.a.cookie,'PUT')).status,404)
  assert.equal((await db.service.storage.list(db.a.user)).items.some(row=>row.id==='units'),false)
  await assert.rejects(db.service.resources.owned(db.a.user,'projects',project.id),{status:404})
  assert.equal((await db.call('/api/customer/content',{changes:[change('conversations',foreign.talk.id,foreign.talk)]},db.a.cookie,'PUT')).status,404)
})

test('varig jobblås virker på tvers av instanser og en gammel arbeider kan ikke skrive etter sletting',async t=>{
  const db=await fixture(t),data=await seed(db,db.a),requestId='a'.repeat(64)
  await db.service.storage.claimJob(db.a.user,requestId,{title:'Analyse',conversationId:data.talk.id,projectId:data.project.id})
  const id=customerRequestKey(db.a.user.id,requestId),cache=db.service.storage.jobCache
  const first=previewRequests(cache),second=previewRequests(cache)
  let release,entered,calls=0
  const enteredPromise=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve)
  const task=first.run(id,{private:'Privat jobb'},async(_brief,memo)=>{
    await memo('answer',{question:'Privat jobb'},async()=>{calls++;entered();await gate;return 'Privat resultat'},{billable:true})
    return {status:200,body:{summary:'Privat resultat'}}
  })
  await enteredPromise
  assert.equal((await second.run(id,{private:'Annet'},()=>assert.fail('Dobbel modellstart'))).status,202)
  assert.equal((await second.resume(id,()=>assert.fail('Parallell gjenopptak'))).status,202)
  release();assert.equal((await task).status,200);assert.equal(calls,1)
  assert.equal((await previewRequests(cache).resume(id,()=>assert.fail('Ferdig resultat skal gjenbrukes'))).body.summary,'Privat resultat')
  assert.equal((await db.call('/api/customer/resources/conversations/'+data.talk.id,undefined,db.a.cookie,'DELETE')).status,200)
  assert.equal((await cache.get('request-v2:'+ (await import('node:crypto')).createHash('sha256').update(id).digest('hex'))),null)
  assert.equal((await previewRequests(cache).work(id,{brief:{private:'Gammel køkopi'},revision:0,steps:{}},()=>assert.fail('Slettet jobb skal ikke kjøre'),()=>{})).status,410)
  assert.equal((await db.sql.query('SELECT count(*)::int AS count FROM ft_customer_job'))[0].count,0)
  assert.equal((await db.call('/api/customer/content',{changes:[change('conversations',data.talk.id,data.talk,2)]},db.a.cookie,'PUT')).status,409)
  assert.equal((await db.service.storage.list(db.a.user)).items.find(row=>row.id===data.analysis.id).value,null)
  await assert.rejects(db.service.storage.claimJob(db.a.user,requestId,{title:'Gjenopprett',conversationId:data.talk.id,projectId:data.project.id}),{status:404})
  const another='b'.repeat(64),next=await seed(db,db.a)
  await db.service.storage.claimJob(db.a.user,another,{title:'Slettes under modellkall',conversationId:next.talk.id,projectId:next.project.id})
  let releaseDeleted,enteredDeleted
  const deletedEntered=new Promise(resolve=>enteredDeleted=resolve),deletedGate=new Promise(resolve=>releaseDeleted=resolve)
  const deletedTask=previewRequests(cache).run(customerRequestKey(db.a.user.id,another),{private:'Slett meg'},async(_brief,memo)=>{
    await memo('answer',{question:'Slett meg'},async()=>{enteredDeleted();await deletedGate;return 'Må ikke lagres'},{billable:true})
    return {status:200,body:{summary:'Må ikke lagres'}}
  })
  await deletedEntered;await db.service.storage.remove(db.a.user,'conversations',next.talk.id);releaseDeleted()
  assert.equal((await deletedTask).status,503)
  assert.equal((await db.sql.query('SELECT count(*)::int AS count FROM ft_customer_job'))[0].count,0)
  const fenced='c'.repeat(64),key='request-v2:'+(await import('node:crypto')).createHash('sha256').update(customerRequestKey(db.a.user.id,fenced)).digest('hex')
  await assert.rejects(db.service.storage.claimJob(db.a.user,fenced,{title:'Lease-overtakelse',conversationId:data.talk.id,projectId:data.project.id}),{status:404})
  const live=await seed(db,db.a)
  await db.service.storage.claimJob(db.a.user,fenced,{title:'Lease-overtakelse',conversationId:live.talk.id,projectId:live.project.id})
  const stale=await cache.claim(key,330000)
  await db.sql.query("UPDATE ft_customer_job SET lease_until=now()-interval '1 second' WHERE storage_key=$1",[key])
  const current=await cache.claim(key,330000)
  await assert.rejects(stale.set('utdatert sjekkpunkt'),{status:409});await stale.release()
  assert.equal(await cache.claim(key,330000),null,'Gammel release kan ikke frigjøre ny lease')
  await current.set('gjeldende sjekkpunkt');assert.equal(await cache.get(key),'gjeldende sjekkpunkt');await current.release()
})

test('konto krever korrekt passord for sletting og fjerner filer, innhold, økter og jobber',async t=>{
  const db=await fixture(t),data=await seed(db,db.a)
  assert.equal((await db.call('/api/customer/account',{password:'feil'},db.a.cookie,'DELETE')).status,400)
  assert.equal((await db.call('/api/customer/session',undefined,db.a.cookie)).status,200)
  assert.equal((await db.call('/api/customer/account',{password:db.a.password},db.a.cookie,'DELETE')).status,200)
  assert.equal((await db.call('/api/customer/session',undefined,db.a.cookie)).status,401)
  for(const table of ['ft_customer_resource','ft_customer_document','ft_customer_file','ft_customer_job'])assert.equal((await db.sql.query(`SELECT count(*)::int AS count FROM ${table} WHERE owner_id=$1`,[db.a.user.id]))[0].count,0)
  assert.equal((await db.call('/api/customer/files/'+data.file.id,undefined,db.b.cookie)).status,404)
  assert.equal((await db.call('/api/customer/session',undefined,db.b.cookie)).status,200)
  assert((await db.sql.query('SELECT * FROM ft_customer_erasure')).some(row=>row.kind==='account'))
})

test('sider begrenser API-svar uten å miste innhold; slettede originaler fjernes også fra referansene',async t=>{
  const db=await fixture(t),data=await seed(db,db.a)
  const changes=Array.from({length:100},()=>{const id=randomUUID();return change('watches',id,{id,target:{kind:'municipality',key:'Stavanger'},title:'Følgevalg',points:[]})})
  assert.equal((await db.call('/api/customer/content',{changes},db.a.cookie,'PUT')).status,200)
  const items=[];let cursor=''
  do {
    const response=await db.call('/api/customer/content'+(cursor?'?cursor='+encodeURIComponent(cursor):''),undefined,db.a.cookie)
    assert.equal(response.status,200);const page=await response.json();assert(page.items.length<=100);items.push(...page.items);cursor=page.nextCursor
  }while(cursor)
  assert.equal(items.length,107);assert.equal(new Set(items.map(row=>row.kind+':'+row.id)).size,107)
  assert.equal((await db.call('/api/customer/resources/files/'+data.file.id,undefined,db.a.cookie,'DELETE')).status,200)
  assert.equal((await db.call('/api/customer/files/'+data.file.id,undefined,db.a.cookie)).status,404)
  const project=(await db.service.storage.list(db.a.user)).items.find(row=>row.id===data.project.id)
  assert.deepEqual(project.value.assets,[]);assert.equal(project.version,2)
})

test('kryptert sikkerhetskopi gjenopprettes isolert og fersk slettelogg hindrer gjenoppliving',async t=>{
  const db=await fixture(t),a=await seed(db,db.a),b=await seed(db,db.b)
  await assert.rejects(backupCustomerContent(db.pool,db.secret,{maxBytes:1000}),/for stort/)
  assert.equal((await db.service.storage.list(db.a.user)).items.length,a.items.length,'Avvist kopi skal ikke endre kundedata')
  const backup=await backupCustomerContent(db.pool,db.secret)
  assert.doesNotMatch(JSON.stringify(backup),/Privat|example.test|password|session_token/)
  const isolated=await testDatabase();t.after(()=>isolated.engine.close());await migrateCustomers(isolated.pool)
  const ledger=await backupErasureLedger(db.pool,db.secret)
  const result=await restoreCustomerContent(isolated.pool,db.secret,backup,{isolated:true,erasureLedger:ledger})
  assert.equal(result.owners,2)
  const restored=createCustomerService({pool:isolated.pool,secret:db.secret,origin:db.service.origin,mail:db.mail})
  assert.deepEqual((await restored.storage.list(db.a.user)).items,a.items)
  assert.deepEqual(await restored.storage.file(db.b.user,b.file.id),await db.service.storage.file(db.b.user,b.file.id))
  assert.equal((await isolated.sql.query('SELECT count(*)::int AS count FROM ft_customer_account'))[0].count,0)
  await assert.rejects(restoreCustomerContent(isolated.pool,db.secret,backup,{isolated:true,erasureLedger:ledger}),/tomt/)
  await assert.rejects(restoreCustomerContent(isolated.pool,db.secret,{...backup,sha256:'bad'},{isolated:true,erasureLedger:ledger}),/kontrollsum/)
  await db.service.storage.deleteAccount(db.a.user)
  await db.service.storage.remove(db.b.user,'files',b.file.id)
  await db.service.storage.remove(db.b.user,'conversations',b.talk.id)
  const freshLedger=await backupErasureLedger(db.pool,db.secret)
  const erased=await testDatabase();t.after(()=>erased.engine.close());await migrateCustomers(erased.pool)
  assert.equal((await restoreCustomerContent(erased.pool,db.secret,backup,{isolated:true,erasureLedger:freshLedger})).owners,1)
  const after=createCustomerService({pool:erased.pool,secret:db.secret,origin:db.service.origin,mail:db.mail})
  assert.equal((await after.storage.list(db.a.user)).items.length,0)
  assert.equal((await after.storage.list(db.b.user)).items.find(row=>row.id===b.talk.id).value,null)
  assert.deepEqual((await after.storage.list(db.b.user)).items.find(row=>row.id===b.project.id).value.assets,[])
  await assert.rejects(after.storage.file(db.b.user,b.file.id),{status:404})
})
