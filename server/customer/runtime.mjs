import pg from 'pg'
import { customerSecret, customerOrigin } from './auth.mjs'
import { customerMail } from './mail.mjs'
import { migrateCustomers } from './migrations.mjs'
import { createCustomerService } from './service.mjs'

let initializing
export function customerRuntime() {
  initializing ||= (async()=>{
    const secret=customerSecret(),origin=customerOrigin()
    if (!process.env.DATABASE_URL) throw Error('Kundetjenesten mangler database.')
    const connection=new URL(process.env.DATABASE_URL)
    connection.searchParams.set('sslmode','verify-full')
    const pool=new pg.Pool({connectionString:connection.href,max:3,connectionTimeoutMillis:10000,query_timeout:8000})
    try {
      await migrateCustomers(pool)
      return createCustomerService({pool,secret,origin,mail:customerMail()})
    } catch(error) {await pool.end();throw error}
  })().catch(error=>{initializing=null;throw error})
  return initializing
}

export const runtimeCustomerAccess={
  authorize:async req=>(await customerRuntime()).access.authorize(req),
  owned:async(...args)=>(await customerRuntime()).resources.owned(...args),
  claimJob:async(...args)=>(await customerRuntime()).access.claimJob(...args),
  createFile:async(...args)=>(await customerRuntime()).access.createFile(...args),
  saveFile:async(...args)=>(await customerRuntime()).storage.saveFile(...args),
  jobCache:{
    durable:true,
    get:async(...args)=>(await customerRuntime()).storage.jobCache.get(...args),
    set:async(...args)=>(await customerRuntime()).storage.jobCache.set(...args),
    claim:async(...args)=>(await customerRuntime()).storage.jobCache.claim(...args),
  },
}
