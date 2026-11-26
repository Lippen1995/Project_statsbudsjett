// Operator command. Never invoked by a public API or during deployment.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'
import { customerSecret } from '../../server/customer/auth.mjs'
import { backupCustomerContent, backupErasureLedger, restoreCustomerContent } from '../../server/customer/backup.mjs'
import { migrateCustomers } from '../../server/customer/migrations.mjs'

const [command,file,target]=process.argv.slice(2),secret=customerSecret()
if(command==='backup'||command==='erasures') {
  if(!file||!process.env.DATABASE_URL)throw Error('Oppgi filsti og DATABASE_URL i operatørmiljøet.')
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('sslmode','verify-full')
  const pool=new pg.Pool({connectionString:url.href,max:1})
  try {
    const value=command==='backup'?await backupCustomerContent(pool,secret):await backupErasureLedger(pool,secret)
    await writeFile(resolve(file),JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'})
    console.log('Kryptert '+(command==='backup'?'innholdskopi':'slettelogg')+' skrevet. Ingen innhold er logget.')
  }finally{await pool.end()}
} else if(command==='verify-restore') {
  if(!file||!target||!process.env.SVEN_ERASURE_LEDGER_FILE)throw Error('Oppgi sikkerhetskopi, ny lokal målmappe og SVEN_ERASURE_LEDGER_FILE.')
  // Only a new local database is allowed; there is no production restore mode.
  const {mkdir}=await import('node:fs/promises');await mkdir(resolve(target),{recursive:false,mode:0o700})
  const engine=new PGlite(resolve(target)),client={query:(...args)=>engine.query(...args),release(){}}
  const pool={query:client.query,connect:async()=>client}
  try {
    await migrateCustomers(pool)
    const result=await restoreCustomerContent(pool,secret,JSON.parse(await readFile(resolve(file),'utf8')),{isolated:true,erasureLedger:JSON.parse(await readFile(resolve(process.env.SVEN_ERASURE_LEDGER_FILE),'utf8'))})
    console.log(JSON.stringify({restored:true,...result,authenticationRestored:false}))
  }finally{await engine.close()}
} else throw Error('Bruk backup <ny fil>, erasures <ny fil>, eller verify-restore <kopi> <ny lokal målmappe>.')
