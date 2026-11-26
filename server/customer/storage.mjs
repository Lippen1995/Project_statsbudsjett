import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { customerError, customerResources, resourceId } from './resources.mjs'

export const customerRequestKey = (owner,id) => createHash('sha256').update(`customer-request-v1:${owner}:${id}`).digest('hex')
export const jobStorageKey = (owner,id) => 'request-v2:'+createHash('sha256').update(customerRequestKey(owner,id)).digest('hex')
const kinds = new Set(['projects','conversations','analyses','watches','watchEvents','preferences'])
export const preferenceKeys = new Set(['name','email','municipality','followMunicipality','useFollowAsDefault','phone','job','organization','offices','affiliation','research','interestTopics','theme','units','bookmarks','shortcuts','svenModel','svenEffort'])
const isObject = value => value && typeof value==='object' && !Array.isArray(value)
const cleanJSON = value => {
  if (Array.isArray(value)) return value.every(cleanJSON)
  return !isObject(value) || Object.entries(value).every(([key,item])=>!['__proto__','constructor','prototype'].includes(key)&&cleanJSON(item))
}

export function removeFileReferences(value,id) {
  if(Array.isArray(value))return value.filter(item=>!isObject(item)||item.assetId!==id&&item.id!==id).map(item=>removeFileReferences(item,id))
  if(!isObject(value))return value
  return Object.fromEntries(Object.entries(value).filter(([key,item])=>!(key==='officeAssetId'&&item===id)).map(([key,item])=>[key,
    key==='projectAssetIds'&&Array.isArray(item)?item.filter(value=>value!==id):
    key==='inputAssetIds'&&isObject(item)?Object.fromEntries(Object.entries(item).filter(([,value])=>value!==id)):removeFileReferences(item,id)]))
}

export function customerEncryption(secret) {
  const key=createHmac('sha256',secret).update('fellestall-customer-content-v1').digest()
  return {
    seal(context,value) {
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv)
      cipher.setAAD(Buffer.from(context))
      const data=Buffer.concat([cipher.update(deflateRawSync(JSON.stringify(value))),cipher.final()])
      return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')
    },
    open(context,value) {
      const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12))
      cipher.setAAD(Buffer.from(context));cipher.setAuthTag(data.subarray(12,28))
      return JSON.parse(inflateRawSync(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]),{maxOutputLength:160_000_000}))
    },
    ownerHash:id=>createHmac('sha256',key).update('erasure:'+id).digest('hex'),
  }
}

export function customerStorage({pool,secret}) {
  const crypto=customerEncryption(secret)
  const sql={query:async(text,values)=>(await pool.query(text,values)).rows}
  const resource=customerResources(sql)
  const context=(user,kind,id)=>`${user.id}:${kind}:${id}`
  async function transaction(user,work) {
    const client=await pool.connect()
    try {
      await client.query('BEGIN')
      const {rows}=await client.query('SELECT id FROM ft_customer_user WHERE id=$1 FOR UPDATE',[user.id])
      if(!rows.length) throw customerError('Du må logge inn.',401)
      const db={query:async(text,values)=>(await client.query(text,values)).rows}
      const result=await work(db,customerResources(db))
      await client.query('COMMIT');return result
    } catch(error) {await client.query('ROLLBACK');throw error}
    finally {client.release()}
  }
  function documentView(user,row) {
    return {kind:row.kind,id:row.id,version:row.version,value:row.data?crypto.open(context(user,row.kind,row.id),row.data):null}
  }
  function validate(change) {
    if(!isObject(change)||!kinds.has(change.kind)||!Number.isSafeInteger(change.version)||change.version<0||
      !(change.kind==='preferences'?preferenceKeys.has(change.id):resourceId('projects',change.id))) throw customerError('Ugyldig innhold eller versjon.')
    if(!cleanJSON(change.value)||change.value===undefined||Buffer.byteLength(JSON.stringify(change.value))>2_000_000) throw customerError('Innholdet er ugyldig eller for stort.',413)
    if(change.kind!=='preferences'&&change.value!==null&&(!isObject(change.value)||change.value.id!==change.id)) throw customerError('Innholdets ID stemmer ikke.')
    if(change.kind==='preferences'&&change.value!==null) {
      const {id,value}=change
      const valid=id==='useFollowAsDefault'?typeof value==='boolean':['interestTopics','bookmarks'].includes(id)?Array.isArray(value)&&value.every(item=>typeof item==='string'):id==='shortcuts'?isObject(value):typeof value==='string'&&value.length<=1000
      if(!valid)throw customerError('Ugyldig profilvalg.')
    }
    if(change.value!==null&&change.kind==='conversations'&&(!Array.isArray(change.value.messages)||typeof change.value.title!=='string'||
      change.value.messages.some(message=>!isObject(message)||!resourceId('conversations',message.id)||typeof message.question!=='string'||typeof message.body!=='string'||
        ['fileAttachments','pendingFiles','carriedFiles'].some(field=>message[field]!==undefined&&(!Array.isArray(message[field])||message[field].some(file=>!isObject(file))))))) throw customerError('Samtalen mangler gyldige meldinger eller navn.')
    if(change.value!==null&&change.kind==='projects'&&(!Array.isArray(change.value.assets)||typeof change.value.name!=='string')) throw customerError('Prosjektet mangler navn eller filer.')
  }
  async function list(user) {
    const rows=await sql.query('SELECT * FROM ft_customer_document WHERE owner_id=$1 ORDER BY kind COLLATE "C",id COLLATE "C"',[user.id])
    return {items:rows.map(row=>documentView(user,row))}
  }
  async function page(user,cursor='') {
    const items=(await list(user)).items.filter(item=>!cursor||item.kind+':'+item.id>cursor)
    const selected=[];let bytes=0
    for(const item of items) {
      const size=Buffer.byteLength(JSON.stringify(item))
      if(selected.length&&(bytes+size>2_800_000||selected.length>=100))break
      selected.push(item);bytes+=size
    }
    const last=selected.at(-1)
    return {items:selected,nextCursor:selected.length<items.length?last.kind+':'+last.id:null}
  }
  async function write(user,changes) {
    if(!Array.isArray(changes)||!changes.length||changes.length>100) throw customerError('Send mellom 1 og 100 endringer.')
    changes.forEach(validate)
    if(new Set(changes.map(item=>item.kind+':'+item.id)).size!==changes.length) throw customerError('Samme innhold forekommer flere ganger.')
    return transaction(user,async(db,resources)=>{
      const rows=await db.query('SELECT * FROM ft_customer_document WHERE owner_id=$1',[user.id])
      for(const change of changes) {
        const row=rows.find(row=>row.kind===change.kind&&row.id===change.id)
        if((row?.version??0)!==change.version || row?.data===null&&change.value!==null&&change.kind!=='preferences') throw customerError('Innholdet er endret på en annen enhet. Hent lagret versjon før du fortsetter.',409)
        if(change.value!==null&&['conversations','analyses'].includes(change.kind)&&changes.some(parent=>parent.value===null&&
          (parent.kind==='projects'&&parent.id===change.value.projectId||parent.kind==='conversations'&&parent.id===change.value.talkId))) throw customerError('Innholdet tilhører et prosjekt eller en samtale som slettes.',409)
      }
      // Create parents before children, independent of browser change order.
      for(const change of [...changes].sort((a,b)=>(a.kind==='projects'?-1:0)-(b.kind==='projects'?-1:0))) {
        if(change.value===null) continue
        const {kind,id,value}=change
        if(kind==='projects') {
          await resources.create(user,kind,{id,title:value.name})
          await resources.rename(user,kind,id,value.name)
          for(const asset of value.assets) await resources.owned(user,'files',asset.id)
        }
        if(kind==='conversations') {
          await resources.create(user,kind,{id,title:value.title,projectId:value.projectId})
          await resources.rename(user,kind,id,value.title)
          for(const message of value.messages) for(const file of [...(message.fileAttachments??[]),...(message.pendingFiles??[]),...(message.carriedFiles??[])]) if(file.assetId) await resources.owned(user,'files',file.assetId)
        }
        if(kind==='analyses') {
          await resources.owned(user,'conversations',value.talkId)
          if(value.projectId) await resources.owned(user,'projects',value.projectId)
        }
      }
      for(const change of changes) {
        if(change.value===null&&['projects','conversations'].includes(change.kind)) await eraseResource(db,user,change.kind,change.id)
        await db.query(`INSERT INTO ft_customer_document(owner_id,kind,id,version,data) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(owner_id,kind,id) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data,updated_at=now()`,
        [user.id,change.kind,change.id,change.version+1,change.value===null?null:crypto.seal(context(user,change.kind,change.id),change.value)])
        if(change.value===null) await journal(db,user,change.kind,change.id)
      }
      const [size]=await db.query('SELECT count(*)::int AS count,coalesce(sum(length(data)),0)::bigint AS bytes FROM ft_customer_document WHERE owner_id=$1 AND data IS NOT NULL',[user.id])
      if(size.count>2000||Number(size.bytes)>25_000_000) throw customerError('Kontoens lagringsgrense er nådd. Eksporter eller slett innhold før du legger til mer.',413)
      return {items:(await db.query('SELECT * FROM ft_customer_document WHERE owner_id=$1 ORDER BY kind,id',[user.id]))
        .filter(row=>rows.find(previous=>previous.kind===row.kind&&previous.id===row.id)?.version!==row.version).map(row=>documentView(user,row))}
    })
  }
  async function journal(db,user,kind,id) {
    await db.query('INSERT INTO ft_customer_erasure(owner_hash,kind,id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[crypto.ownerHash(user.id),kind,id])
  }
  async function eraseResource(db,user,kind,id) {
    const rows=await db.query(`SELECT kind,id FROM ft_customer_resource WHERE owner_id=$1 AND deleted_at IS NULL
      AND ((kind=$2 AND id=$3) OR ($2='projects' AND project_id=$3) OR ($2='conversations' AND conversation_id=$3))`,[user.id,kind,id])
    for(const row of rows) {
      await db.query("UPDATE ft_customer_resource SET deleted_at=now(),title='Slettet',updated_at=now() WHERE owner_id=$1 AND kind=$2 AND id=$3",[user.id,row.kind,row.id])
      await db.query('UPDATE ft_customer_document SET data=NULL,version=version+1,updated_at=now() WHERE owner_id=$1 AND kind=$2 AND id=$3',[user.id,row.kind,row.id])
      if(row.kind==='files') await db.query('DELETE FROM ft_customer_file WHERE owner_id=$1 AND id=$2',[user.id,row.id])
      if(row.kind==='jobs') await db.query('DELETE FROM ft_customer_job WHERE owner_id=$1 AND request_id=$2',[user.id,row.id])
      await journal(db,user,row.kind,row.id)
    }
    // Saved analyses are references into a conversation; remove their contents too.
    const analyses=await db.query("SELECT * FROM ft_customer_document WHERE owner_id=$1 AND kind='analyses' AND data IS NOT NULL",[user.id])
    for(const row of analyses) {
      const value=crypto.open(context(user,row.kind,row.id),row.data)
      if(kind==='projects'&&value.projectId===id||kind==='conversations'&&value.talkId===id) {
        await db.query('UPDATE ft_customer_document SET data=NULL,version=version+1 WHERE owner_id=$1 AND kind=$2 AND id=$3',[user.id,row.kind,row.id]);await journal(db,user,row.kind,row.id)
      }
    }
  }
  async function remove(user,kind,id) {
    return transaction(user,async(db,resources)=>{
      await resources.owned(user,kind,id);await eraseResource(db,user,kind,id)
      if(kind==='files') {
        const rows=await db.query('SELECT * FROM ft_customer_document WHERE owner_id=$1 AND data IS NOT NULL',[user.id])
        for(const row of rows) {
          const before=crypto.open(context(user,row.kind,row.id),row.data),after=removeFileReferences(before,id)
          if(JSON.stringify(before)!==JSON.stringify(after))await db.query('UPDATE ft_customer_document SET data=$4,version=version+1,updated_at=now() WHERE owner_id=$1 AND kind=$2 AND id=$3',[user.id,row.kind,row.id,crypto.seal(context(user,row.kind,row.id),after)])
        }
      }
      return {deleted:true}
    })
  }
  async function saveFile(user,{name,bytes,meta,projectId,conversationId}) {
    if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>2*1024*1024) throw customerError('Velg en fil på opptil 2 MB.')
    return transaction(user,async(db,resources)=>{
      const [size]=await db.query('SELECT coalesce(sum(length(data)),0)::bigint AS bytes FROM ft_customer_file WHERE owner_id=$1',[user.id])
      const file=await resources.create(user,'files',{title:name,projectId,conversationId})
      const value={name,data:bytes.toString('base64'),meta:{...meta,assetId:file.id}}
      const encrypted=crypto.seal(context(user,'files',file.id),value)
      if(Number(size.bytes)+encrypted.length>100_000_000) throw customerError('Fillageret er fullt. Slett filer før du laster opp flere.',413)
      await db.query('INSERT INTO ft_customer_file(id,owner_id,data) VALUES($1,$2,$3)',[file.id,user.id,encrypted])
      return file
    })
  }
  async function file(user,id) {
    await resource.owned(user,'files',id)
    const [row]=await sql.query('SELECT data FROM ft_customer_file WHERE owner_id=$1 AND id=$2',[user.id,id])
    if(!row) throw customerError('Filen finnes ikke.',404)
    return crypto.open(context(user,'files',id),row.data)
  }
  async function claimJob(user,id,options) {
    return transaction(user,async(db,resources)=>{
      if(!options.conversationId) throw customerError('Velg en samtale før innsending.')
      for(const file of options.files??[]) if(file.assetId) {
        const owned=await resources.owned(user,'files',file.assetId)
        if(!owned.projectId&&!owned.conversationId)await db.query("UPDATE ft_customer_resource SET project_id=$3,conversation_id=$4 WHERE owner_id=$1 AND kind='files' AND id=$2",[user.id,file.assetId,options.projectId??null,options.conversationId])
      }
      const result=await resources.create(user,'jobs',{id,...options})
      await db.query('INSERT INTO ft_customer_job(storage_key,owner_id,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[jobStorageKey(user.id,id),user.id,id])
      return result
    })
  }
  const jobLive=`EXISTS(SELECT 1 FROM ft_customer_resource r WHERE r.owner_id=j.owner_id AND r.kind='jobs' AND r.id=j.request_id AND r.deleted_at IS NULL)`
  const jobCache={
    durable:true,
    async get(key) {
      const [row]=await sql.query(`SELECT j.data FROM ft_customer_job j WHERE storage_key=$1 AND ${jobLive}`,[key])
      return row?.data?crypto.open('job:'+key,row.data):null
    },
    async set(key,value) {
      const rows=await sql.query(`UPDATE ft_customer_job j SET data=$2,updated_at=now() WHERE storage_key=$1 AND ${jobLive} RETURNING storage_key`,[key,crypto.seal('job:'+key,value)])
      if(!rows.length) throw customerError('Analysen er slettet.',410)
    },
    async claim(key,leaseMs) {
      const token=randomUUID()
      const rows=await sql.query(`UPDATE ft_customer_job j SET lease_token=$2,lease_until=now()+($3 * interval '1 millisecond')
        WHERE storage_key=$1 AND (lease_until IS NULL OR lease_until<now()) AND ${jobLive} RETURNING storage_key`,[key,token,leaseMs])
      if(!rows.length) {
        const [live]=await sql.query(`SELECT storage_key FROM ft_customer_job j WHERE storage_key=$1 AND ${jobLive}`,[key])
        return live?null:{gone:true}
      }
      return {
        get:()=>jobCache.get(key),
        async set(value) {
          const rows=await sql.query(`UPDATE ft_customer_job j SET data=$3,updated_at=now() WHERE storage_key=$1 AND lease_token=$2 AND lease_until>now() AND ${jobLive} RETURNING storage_key`,[key,token,crypto.seal('job:'+key,value)])
          if(!rows.length) throw customerError('Analysen er slettet eller overtatt av en annen arbeider.',409)
        },
        release:()=>sql.query('UPDATE ft_customer_job SET lease_token=NULL,lease_until=NULL WHERE storage_key=$1 AND lease_token=$2',[key,token]),
      }
    },
  }
  async function deleteAccount(user) {
    return transaction(user,async db=>{
      await journal(db,user,'account','*')
      await db.query('DELETE FROM ft_customer_verification WHERE value=$1 OR identifier=$2',[user.id,user.email])
      await db.query('DELETE FROM ft_customer_user WHERE id=$1',[user.id])
      return {deleted:true}
    })
  }
  return {list,page,write,remove,saveFile,file,claimJob,jobCache,deleteAccount,transaction,crypto}
}
