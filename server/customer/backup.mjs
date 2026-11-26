import { createHash } from 'node:crypto'
import { customerEncryption, removeFileReferences } from './storage.mjs'
import { customerSchemaVersion } from './migrations.mjs'

const tables={
  ft_customer_resource:['kind','id','owner_id','title','project_id','conversation_id','created_at','updated_at','deleted_at'],
  ft_customer_document:['owner_id','kind','id','version','data','updated_at'],
  ft_customer_file:['id','owner_id','data','created_at'],
  ft_customer_job:['storage_key','owner_id','request_id','data','lease_token','lease_until','updated_at'],
};
const signature='fellestall-customer-content-backup-v1'

export async function backupCustomerContent(pool,secret) {
  const client=await pool.connect(),crypto=customerEncryption(secret)
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const {rows:[schema]}=await client.query('SELECT version FROM ft_customer_schema WHERE id=1')
    if(schema?.version!==customerSchemaVersion)throw Error('Uventet kundeskjema.')
    const data={}
    for(const [table,columns] of Object.entries(tables)) data[table]=(await client.query(`SELECT ${columns.join(',')} FROM ${table}`)).rows
    const owners=[...new Set(Object.values(data).flat().map(row=>row.owner_id))]
    const archive=crypto.seal(signature,{version:customerSchemaVersion,createdAt:new Date().toISOString(),owners,data})
    await client.query('COMMIT')
    return {format:signature,sha256:createHash('sha256').update(archive).digest('hex'),archive}
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}

// Capture this again immediately before recovery. A ledger taken with the old
// backup cannot account for erasures performed after that backup was taken.
export async function backupErasureLedger(pool,secret) {
  const {rows}=await pool.query('SELECT * FROM ft_customer_erasure ORDER BY erased_at')
  return customerEncryption(secret).seal(signature+':erasures',{capturedAt:new Date().toISOString(),entries:rows})
}

export async function restoreCustomerContent(pool,secret,backup,{isolated=false,erasureLedger}={}) {
  if(!isolated||!erasureLedger)throw Error('Gjenoppretting krever et isolert, tomt mål og en oppdatert slettelogg.')
  if(backup?.format!==signature||createHash('sha256').update(backup.archive??'').digest('hex')!==backup.sha256)throw Error('Sikkerhetskopien har feil format eller kontrollsum.')
  const crypto=customerEncryption(secret),snapshot=crypto.open(signature,backup.archive),ledger=crypto.open(signature+':erasures',erasureLedger)
  if(snapshot.version!==customerSchemaVersion||Date.parse(ledger.capturedAt)<Date.parse(snapshot.createdAt))throw Error('Skjemaet eller sletteloggen er for gammel.')
  const data=snapshot.data,removed=new Set()
  const accountDeleted=new Set(snapshot.owners.filter(owner=>ledger.entries.some(entry=>entry.owner_hash===crypto.ownerHash(owner)&&entry.kind==='account')))
  for(const row of data.ft_customer_resource) {
    if(ledger.entries.some(entry=>entry.owner_hash===crypto.ownerHash(row.owner_id)&&entry.kind===row.kind&&entry.id===row.id))removed.add(row.owner_id+':'+row.kind+':'+row.id)
  }
  let changed=true
  while(changed) {
    changed=false
    for(const row of data.ft_customer_resource) if(!removed.has(row.owner_id+':'+row.kind+':'+row.id)&&
      (removed.has(row.owner_id+':projects:'+row.project_id)||removed.has(row.owner_id+':conversations:'+row.conversation_id))) {
      removed.add(row.owner_id+':'+row.kind+':'+row.id);changed=true
    }
  }
  for(const row of data.ft_customer_resource) if(removed.has(row.owner_id+':'+row.kind+':'+row.id)) {row.title='Slettet';row.deleted_at=new Date().toISOString()}
  for(const row of data.ft_customer_document) {
    let erased=removed.has(row.owner_id+':'+row.kind+':'+row.id)||ledger.entries.some(entry=>entry.owner_hash===crypto.ownerHash(row.owner_id)&&entry.kind===row.kind&&entry.id===row.id)
    if(row.kind==='analyses'&&row.data) {
      const value=crypto.open(`${row.owner_id}:${row.kind}:${row.id}`,row.data)
      erased ||= removed.has(row.owner_id+':conversations:'+value.talkId)||removed.has(row.owner_id+':projects:'+value.projectId)
    }
    if(erased) {row.data=null;row.version++}
    else if(row.data) {
      const context=`${row.owner_id}:${row.kind}:${row.id}`,before=crypto.open(context,row.data)
      let after=before
      for(const file of data.ft_customer_resource.filter(resource=>resource.owner_id===row.owner_id&&resource.kind==='files'&&removed.has(row.owner_id+':files:'+resource.id)))after=removeFileReferences(after,file.id)
      if(JSON.stringify(before)!==JSON.stringify(after)){row.data=crypto.seal(context,after);row.version++}
    }
  }
  data.ft_customer_file=data.ft_customer_file.filter(row=>!removed.has(row.owner_id+':files:'+row.id))
  data.ft_customer_job=data.ft_customer_job.filter(row=>!removed.has(row.owner_id+':jobs:'+row.request_id))
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE ft_customer_user IN EXCLUSIVE MODE')
    for(const table of ['ft_customer_user','ft_customer_erasure',...Object.keys(tables)]) {
      const {rows:[count]}=await client.query(`SELECT count(*)::int AS count FROM ${table}`)
      if(count.count)throw Error('Målet må være tomt. Eksisterende kunder kan ikke overskrives.')
    }
    for(const owner of snapshot.owners.filter(owner=>!accountDeleted.has(owner))) {
      const email=createHash('sha256').update(owner).digest('hex')+'@restore.invalid'
      await client.query('INSERT INTO ft_customer_user(id,name,email,"emailVerified") VALUES($1,$2,$3,false)',[owner,'Isolert gjenoppretting',email])
    }
    const counts={}
    for(const [table,columns] of Object.entries(tables)) {
      const rows=data[table].filter(row=>!accountDeleted.has(row.owner_id));counts[table]=rows.length
      for(const row of rows) {
        if(table==='ft_customer_job') {row.lease_token=null;row.lease_until=null}
        await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(column=>row[column]))
      }
    }
    for(const row of ledger.entries) await client.query('INSERT INTO ft_customer_erasure(owner_hash,kind,id,erased_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[row.owner_hash,row.kind,row.id,row.erased_at])
    await client.query('COMMIT')
    return {owners:snapshot.owners.length-accountDeleted.size,counts}
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}
