import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { customerDatabase, request, cookieOf } from './test-support.mjs'
import { createHandler } from '../../server/admin/handler.mjs'
import { customerSecret, customerOrigin } from '../../server/customer/auth.mjs'

test('kundekontoer har ekte registrering, bekreftelse, separate økter og serverstyrt gratisnivå',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  assert.equal((await db.call('/api/customer/session')).status,401)
  const a=await db.register('kunde-a@example.test','Kunde A')
  const b=await db.register('kunde-b@example.test','Kunde B')
  assert.match(a.cookie,/fellestall-customer/)
  assert.doesNotMatch(a.cookie,/fellestall-admin/)
  assert.notEqual(a.cookie,b.cookie)
  const session=await(await db.call('/api/customer/session',undefined,a.cookie)).json()
  assert.equal(session.user.id,a.user.id)
  assert.deepEqual(session.account,{plan:'free'})
  assert.equal(session.user.role,undefined)
  assert.equal((await db.call('/api/customer/auth/update-user',{plan:'paid',role:'admin'},a.cookie)).status,404)
  assert.equal((await db.call('/api/customer/auth/admin/set-role',{role:'admin'},a.cookie)).status,404)
  const admin=createHandler({...db,github:{},health:{},origin:'http://localhost:5173'})
  assert.equal((await admin(request('/api/admin/session',undefined,a.cookie))).status,401)
  const adminUser=(await db.sql.query('SELECT email FROM ft_admin_user'))[0]
  const login=await admin(request('/api/auth/sign-in/email',{email:adminUser.email,password:db.password}))
  assert.equal(login.status,200)
  assert.equal((await db.call('/api/customer/session',undefined,cookieOf(login))).status,401)

  const signup=await db.call('/api/customer/auth/sign-up/email',{email:'ubekreftet@example.test',name:'Ny kunde',password:a.password})
  assert.equal(signup.status,200)
  assert.equal(cookieOf(signup),'')
  assert.equal((await db.call('/api/customer/auth/sign-in/email',{email:'ubekreftet@example.test',password:a.password})).status,403)
  const logout=await db.call('/api/customer/auth/sign-out',{},a.cookie)
  assert.equal(logout.status,200)
  assert.equal((await db.call('/api/customer/session',undefined,a.cookie)).status,401)
  assert.equal((await db.call('/api/customer/session',undefined,b.cookie)).status,200)
})

test('alle innholdstyper og foreldretilknytninger kontrolleres mot eier på serveren',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  const a=await db.register('ressurs-a@example.test'),b=await db.register('ressurs-b@example.test')
  const projectId=randomUUID(),conversationId=randomUUID(),fileId=randomUUID()
  const create=(kind,body,cookie)=>db.call('/api/customer/resources/'+kind,body,cookie)
  assert.equal((await create('projects',{id:projectId,title:'Privat prosjekt'},a.cookie)).status,201)
  assert.equal((await create('conversations',{id:conversationId,title:'Privat samtale',projectId},a.cookie)).status,201)
  assert.equal((await create('files',{id:fileId,title:'Privat vedlegg',projectId},a.cookie)).status,201)
  const aUser=await db.service.access.authorize({method:'GET',headers:{cookie:a.cookie}})
  const jobId='a'.repeat(64)
  await db.service.access.claimJob(aUser,jobId,{title:'Privat analyse',conversationId,projectId,files:[{assetId:fileId}]})
  for(const [kind,id] of [['projects',projectId],['conversations',conversationId],['files',fileId],['jobs',jobId]]) {
    const path='/api/customer/resources/'+kind+'/'+id
    assert.equal((await db.call(path,undefined,a.cookie)).status,200)
    assert.equal((await db.call(path,undefined,b.cookie)).status,404)
    assert.equal((await db.call(path,{title:'Forsøkt endring'},b.cookie,'PUT')).status,404)
    assert.deepEqual((await(await db.call('/api/customer/resources/'+kind,undefined,b.cookie)).json()).items,[])
  }
  assert.equal((await create('projects',{id:projectId,title:'Overta ID'},b.cookie)).status,404)
  assert.equal((await create('conversations',{title:'Feil eier',projectId},b.cookie)).status,404)
  assert.equal((await create('projects',{title:'Falsk eier',ownerId:a.user.id},b.cookie)).status,400)
  const bUser=await db.service.access.authorize({method:'GET',headers:{cookie:b.cookie}})
  await assert.rejects(db.service.access.claimJob(bUser,'b'.repeat(64),{title:'Tyveri',conversationId,projectId}),e=>e.status===404)
  const ownConversation=await(await create('conversations',{title:'B sin samtale'},b.cookie)).json()
  await assert.rejects(db.service.access.claimJob(bUser,'b'.repeat(64),{title:'Vedlegg fra A',conversationId:ownConversation.id,files:[{assetId:fileId}]}),e=>e.status===404)
  await db.sql.query('UPDATE ft_customer_session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',[a.user.id])
  assert.equal((await db.call('/api/customer/resources/projects/'+projectId,undefined,a.cookie)).status,401)
})

test('gjenoppretting bruker engangstoken, avviser feil/utløpt token og tilbakekaller gamle økter',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  const a=await db.register('reset@example.test')
  const body={email:a.user.email,redirectTo:'http://localhost:5173/#konto/nytt-passord'}
  const reset=await db.call('/api/customer/auth/request-password-reset',body)
  assert.equal(reset.status,200)
  const missing=await db.call('/api/customer/auth/request-password-reset',{...body,email:'ukjent@example.test'})
  assert.deepEqual(await reset.json(),await missing.json())
  const sent=db.messages.findLast(value=>value.purpose==='reset')
  assert.match(sent.url,/\/api\/customer\/auth\/reset-password\//)
  const token=sent.token
  const password='Et helt nytt testpassord 456!'
  assert.equal((await db.call('/api/customer/auth/reset-password',{token:'ugyldig',newPassword:password})).status,400)
  assert.equal((await db.call('/api/customer/auth/reset-password',{token,newPassword:password})).status,200)
  assert.equal((await db.call('/api/customer/session',undefined,a.cookie)).status,401)
  assert.equal((await db.call('/api/customer/auth/reset-password',{token,newPassword:password})).status,400)
  assert.equal((await db.call('/api/customer/auth/sign-in/email',{email:a.user.email,password:a.password})).status,401)
  assert.equal((await db.call('/api/customer/auth/sign-in/email',{email:a.user.email,password})).status,200)
  await db.call('/api/customer/auth/request-password-reset',body)
  const expired=db.messages.findLast(value=>value.purpose==='reset').token
  await db.sql.query('UPDATE ft_customer_verification SET "expiresAt"=now()-interval \'1 second\' WHERE identifier=$1',['reset-password:'+expired])
  assert.equal((await db.call('/api/customer/auth/reset-password',{token:expired,newPassword:a.password})).status,400)
})

test('origin, gjenopprettingsretur og e-postberedskap kontrolleres uten utsending til en leverandør',async t=>{
  const db=await customerDatabase()
  t.after(()=>db.engine.close())
  const attack=new Request('http://localhost:5173/api/customer/auth/sign-up/email',{method:'POST',headers:{origin:'https://annet.test','content-type':'application/json'},body:JSON.stringify({email:'angrep@example.test',name:'Test',password:'Et langt passord 123'})})
  assert.equal((await db.service.handle(attack)).status,403)
  assert.equal((await db.call('/api/customer/auth/request-password-reset',{email:'ingen@example.test',redirectTo:'https://annet.test/'})).status,403)
  db.mail.ready=false
  assert.equal((await db.call('/api/customer/auth/request-password-reset',{email:'ingen@example.test'})).status,503)
  assert.equal((await db.call('/api/customer/auth/sign-up/email',{email:'ingen@example.test',name:'Test',password:'Et langt passord 123'})).status,503)
  assert.equal((await db.sql.query('SELECT * FROM ft_customer_user')).length,0)
  assert.equal((await(await db.call('/api/customer/config')).json()).recoveryEmailReady,false)
  assert.notEqual(customerSecret({BETTER_AUTH_SECRET:'a'.repeat(32)}),'a'.repeat(32))
  assert.equal(customerOrigin({VERCEL_ENV:'preview',VERCEL_URL:'preview.example.test'}),'https://preview.example.test')
  assert.throws(()=>customerOrigin({FELLESTALL_CUSTOMER_ORIGIN:'https://example.test/path'}))
})
