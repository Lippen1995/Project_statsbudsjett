import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testDatabase } from '../admin/test-support.mjs'
import { migrateCustomers } from '../../server/customer/migrations.mjs'
import { packageCustomer } from './package.mjs'
import { customerMail } from '../../server/customer/mail.mjs'

test('kundemigrering er atomisk og gjentakbar og bevarer eksisterende administratorkonto',async t=>{
  const db=await testDatabase()
  t.after(()=>db.engine.close())
  const original=(await db.sql.query('SELECT id,email FROM ft_admin_user'))[0]
  const broken={connect:async()=>{
    const client=await db.pool.connect()
    return {release:()=>client.release(),query:async(text,values)=>{
      if(text.startsWith('CREATE TABLE IF NOT EXISTS ft_customer_resource'))throw Error('Kontrollert migreringsfeil')
      return client.query(text,values)
    }}
  }}
  await assert.rejects(migrateCustomers(broken),/Kontrollert migreringsfeil/)
  assert.equal((await db.sql.query("SELECT to_regclass('ft_customer_user') AS relation"))[0].relation,null)
  assert.deepEqual((await db.sql.query('SELECT id,email FROM ft_admin_user'))[0],original)
  await migrateCustomers(db.pool)
  const id=randomUUID()
  await db.sql.query('INSERT INTO ft_customer_user(id,name,email) VALUES($1,$2,$3)',[id,'Behold meg','behold@example.test'])
  await migrateCustomers(db.pool)
  assert.equal((await db.sql.query('SELECT id FROM ft_customer_user'))[0].id,id)
  assert.equal((await db.sql.query('SELECT version FROM ft_customer_schema'))[0].version,1)
  assert.deepEqual((await db.sql.query('SELECT id,email FROM ft_admin_user'))[0],original)
})

test('kundepakken inkluderer selvstendig funksjon og SQL uten administratorbootstrap',async t=>{
  const output=await mkdtemp(join(tmpdir(),'fellestall-customer-package-'))
  t.after(()=>rm(output,{recursive:true,force:true}))
  await packageCustomer(output)
  const directory=join(output,'functions/customer-api.func')
  const schema=await readFile(join(directory,'schema.sql'),'utf8')
  const source=await readFile(join(directory,'index.mjs'),'utf8')
  assert.match(schema,/ft_customer_resource/)
  assert.doesNotMatch(schema,/ft_admin_user/)
  assert.doesNotMatch(source,/FELLESTALL_ADMIN_PASSWORD_HASH|bootstrapAdmin/)
  assert.equal(JSON.parse(await readFile(join(directory,'.vc-config.json'),'utf8')).handler,'index.mjs')
})

test('bekreftelse og gjenoppretting bruker eksisterende e-postleverandør med dedupliserte utsendinger',async()=>{
  const calls=[]
  const mail=customerMail({key:'test-only-key',from:'konto@example.test',fetcher:async(url,options)=>{
    calls.push({url,...options});return new Response(JSON.stringify({id:'test-delivery'}),{status:200})
  }})
  const value={user:{email:'kunde@example.test'},url:'https://example.test/api/customer/auth/reset-password/test-only-token'}
  await mail.reset(value);await mail.reset(value);await mail.verify(value)
  assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key'])
  assert.notEqual(calls[0].headers['Idempotency-Key'],calls[2].headers['Idempotency-Key'])
  assert.deepEqual(JSON.parse(calls[0].body).to,['kunde@example.test'])
  assert.match(JSON.parse(calls[2].body).subject,/Bekreft/)
  assert.equal(customerMail({key:'',from:'konto@example.test'}).ready,false)
})
