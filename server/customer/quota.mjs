import { createHmac, randomUUID } from 'node:crypto'
import { customerError } from './resources.mjs'
import { modelPrices, normalizeUsage, operationKey, priceVersion, quotaConfig, quotaPeriod, requestDigest, reservationQuote, safeAmount, usageCost } from './quota-config.mjs'

const amount=row=>safeAmount(row??0)
export function customerQuota({pool,secret,config=quotaConfig(),now=()=>new Date()}) {
  const sql=async(text,values)=>(await pool.query(text,values)).rows
  const ownerHash=id=>createHmac('sha256',secret).update('sven-meter-owner:'+id).digest('hex')
  async function entitlement(db,userId) {
    const [row]=await db('SELECT plan,paid_from,paid_until FROM ft_customer_access WHERE user_id=$1',[userId])
    if(row?.plan==='paid'&&row.paid_from&&new Date(row.paid_from)<=now()&&row.paid_until&&new Date(row.paid_until)>now()) {
      const start=new Date(row.paid_from).toISOString(),end=new Date(row.paid_until).toISOString()
      return {plan:'paid',period:{key:'paid:'+start,resetAt:end}}
    }
    return {plan:'free',period:quotaPeriod(now())}
  }
  async function summary(user) {
    const {plan:currentPlan,period}=await entitlement(sql,user.id),globalPeriod=quotaPeriod(now())
    if(!config.ready)return {ready:false,plan:currentPlan,period,remaining:0,usedPercent:0,totalUsedPercent:0,extraPercent:null,blocked:true,models:[]}
    const [row]=await sql('SELECT * FROM ft_customer_quota_period WHERE owner_id=$1 AND period=$2',[user.id,period.key])
    const credits=await sql('SELECT * FROM ft_customer_quota_credit WHERE owner_id=$1 AND valid_from<=$2 AND (expires_at IS NULL OR expires_at>$2) ORDER BY created_at,id',[user.id,now()])
    const [global]=await sql('SELECT * FROM ft_customer_quota_global WHERE period=$1',[globalPeriod.key])
    const [unknown]=await sql("SELECT count(*)::int AS count FROM ft_customer_meter WHERE owner_id=$1 AND state IN ('reserved','running','unknown')",[user.id])
    const included=config.plans[currentPlan].monthlyNano,spent=amount(row?.spent),held=amount(row?.held)
    const extra=credits.reduce((sum,row)=>sum+amount(row.amount),0),extraSpent=credits.reduce((sum,row)=>sum+amount(row.spent),0),extraHeld=credits.reduce((sum,row)=>sum+amount(row.held),0)
    const extraRemaining=credits.reduce((sum,row)=>sum+Math.max(0,amount(row.amount)-amount(row.spent)-amount(row.held)),0)
    const remaining=Math.max(0,included-spent-held)+extraRemaining
    return {ready:true,plan:currentPlan,period,included,spent,held,extra,extraSpent,extraHeld,extraRemaining,remaining,
      usedPercent:included?spent/included*100:0,totalUsedPercent:included+extra?(spent+extraSpent)/(included+extra)*100:0,
      extraPercent:extra?extraRemaining/extra*100:null,unresolved:unknown?.count??0,
      blocked:Boolean(global?.blocked)||amount(global?.spent)+amount(global?.held)>=config.globalMonthlyNano,
      models:config.plans[currentPlan].models,priceVersion}
  }
  async function transaction(period,userId,work,{requireUser=true}={}) {
    const client=await pool.connect()
    const db=async(text,values)=>(await client.query(text,values)).rows
    try {
      await db('BEGIN')
      await db('INSERT INTO ft_customer_quota_global(period) VALUES($1) ON CONFLICT DO NOTHING',[period])
      const [global]=await db('SELECT * FROM ft_customer_quota_global WHERE period=$1 FOR UPDATE',[period])
      if(userId) {
        const [user]=await db('SELECT id FROM ft_customer_user WHERE id=$1 FOR UPDATE',[userId])
        if(!user&&requireUser)throw customerError('Du må logge inn.',401)
      }
      const result=await work(db,global)
      await db('COMMIT');return result
    }catch(error){await db('ROLLBACK');throw error}
    finally{client.release()}
  }
  async function allowed(user,model) {
    if(!config.ready)throw customerError('Sven-kapasiteten er ikke konfigurert ennå.',503)
    const {plan:currentPlan}=await entitlement(sql,user.id)
    if(!config.plans[currentPlan].models.includes(model))throw customerError('Denne modellen er ikke inkludert i abonnementet ditt.',403)
  }
  async function maintain(period) {
    return transaction(period,null,async db=>{
      const orphans=await db("UPDATE ft_customer_meter SET state='rejected',cost=0,note='account-deleted-before-start',updated_at=now() WHERE period=$1 AND owner_id IS NULL AND state='reserved' RETURNING reserved",[period])
      const released=orphans.reduce((sum,row)=>sum+amount(row.reserved),0)
      if(released)await db('UPDATE ft_customer_quota_global SET held=held-$2 WHERE period=$1',[period,released])
      const expired=await db("UPDATE ft_customer_meter SET state='unknown',note='worker-ended-without-usage',updated_at=now() WHERE period=$1 AND state IN ('reserved','running') AND coalesce(lease_until,created_at+interval '330 seconds')<$2 RETURNING id",[period,now()])
      if(expired.length)await db("UPDATE ft_customer_quota_global SET blocked=true,blocked_reason=coalesce(blocked_reason,'unknown-usage') WHERE period=$1",[period])
      return {released,expired:expired.length}
    },{requireUser:false})
  }
  async function reserve({userId,requestId,phase,model,params}) {
    if(!config.ready)throw customerError('Sven-kapasiteten er ikke konfigurert ennå.',503)
    if(!/^[a-f0-9]{64}$/.test(requestId??'')||typeof phase!=='string'||phase.length>80)throw customerError('Modellkallet mangler en gyldig innsending.')
    const id=operationKey(userId,requestId,phase),digest=createHmac('sha256',secret).update(requestDigest(model,params)).digest('hex'),period=quotaPeriod(now())
    await maintain(period.key)
    return transaction(period.key,userId,async(db,global)=>{
      const [previous]=await db('SELECT * FROM ft_customer_meter WHERE id=$1',[id])
      if(previous) {
        if(previous.digest!==digest)throw customerError('Innsendingen er endret. Opprett en ny analyse.',409)
        throw customerError('Modellkallet er allerede registrert. Hent resultatet for samme innsending; et uavklart kall gjentas ikke automatisk.',409)
      }
      const {plan:currentPlan,period:ownerPeriod}=await entitlement(db,userId),included=config.plans[currentPlan].monthlyNano
      if(!config.plans[currentPlan].models.includes(model))throw customerError('Denne modellen er ikke inkludert i abonnementet ditt.',403)
      await db('INSERT INTO ft_customer_quota_period(owner_id,period) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,ownerPeriod.key])
      const [balance]=await db('SELECT * FROM ft_customer_quota_period WHERE owner_id=$1 AND period=$2',[userId,ownerPeriod.key])
      const credits=await db('SELECT * FROM ft_customer_quota_credit WHERE owner_id=$1 AND valid_from<=$2 AND (expires_at IS NULL OR expires_at>$2) ORDER BY expires_at NULLS LAST,created_at,id FOR UPDATE',[userId,now()])
      const includedFree=Math.max(0,included-amount(balance.spent)-amount(balance.held))
      const available=includedFree+credits.reduce((sum,row)=>sum+Math.max(0,amount(row.amount)-amount(row.spent)-amount(row.held)),0)
      if(global.blocked)throw customerError('Sven har midlertidig stanset nye analyser. Prøv igjen senere.',503)
      const globalFree=Math.max(0,config.globalMonthlyNano-amount(global.spent)-amount(global.held))
      let quote
      try {quote=reservationQuote(model,params,config,Math.min(available,globalFree))}
      catch(error){if(globalFree<available&&error.status===402)throw customerError('Sven har nådd den samlede kapasitetsgrensen. Prøv igjen senere.',503);throw error}
      const funding={period:ownerPeriod.key,included:Math.min(includedFree,quote.reservedNano),credits:[]}
      let rest=quote.reservedNano-funding.included
      for(const credit of credits) {
        const take=Math.min(rest,Math.max(0,amount(credit.amount)-amount(credit.spent)-amount(credit.held)))
        if(!take)continue
        funding.credits.push({id:credit.id,amount:take});rest-=take
        await db('UPDATE ft_customer_quota_credit SET held=held+$2 WHERE id=$1',[credit.id,take])
      }
      await db('UPDATE ft_customer_quota_period SET held=held+$3 WHERE owner_id=$1 AND period=$2',[userId,ownerPeriod.key,funding.included])
      await db('UPDATE ft_customer_quota_global SET held=held+$2 WHERE period=$1',[period.key,quote.reservedNano])
      await db(`INSERT INTO ft_customer_meter(id,owner_id,owner_hash,period,request_id,phase,model,digest,price_version,state,reserved,funding,rates)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10,$11,$12)`,[id,userId,ownerHash(userId),period.key,requestId,phase,model,digest,priceVersion,quote.reservedNano,JSON.stringify(funding),JSON.stringify(modelPrices[model])])
      return {id,model,maxTokens:quote.maxTokens,reservedNano:quote.reservedNano,period:period.key}
    })
  }
  async function record(ticket,measurement,{complete=true,rejected=false}={}) {
    const [initial]=await sql('SELECT owner_id,period FROM ft_customer_meter WHERE id=$1',[ticket.id])
    if(!initial)throw Error('Forbruksreservasjonen finnes ikke.')
    return transaction(initial.period,initial.owner_id,async(db)=>{
      const [row]=await db('SELECT * FROM ft_customer_meter WHERE id=$1 FOR UPDATE',[ticket.id])
      const usage=normalizeUsage(measurement),audit=usage??normalizeUsage(measurement,{partial:true})
      const sameUsage=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([key,value])=>b[key]===value)
      complete=complete&&Boolean(usage)&&(!usage.model||usage.model===row.model||usage.model.startsWith(row.model+'-'))
      const measured=usage?usageCost(row.model,usage,row.rates):null
      if(['settled','rejected'].includes(row.state)) {
        if(rejected&&row.state==='rejected'||complete&&row.state==='settled'&&(amount(row.cost)===measured||row.note==='duplicate-provider-measurement')&&sameUsage(row.usage,usage))return {state:row.state,cost:amount(row.cost),duplicate:true}
        throw customerError('Forbruket er allerede endelig avregnet.',409)
      }
      if(!complete&&!rejected) {
        await db("UPDATE ft_customer_meter SET state='unknown',usage=$2,provider_request_id=coalesce(provider_request_id,$3),note='awaiting-confirmed-usage',updated_at=now() WHERE id=$1",[ticket.id,audit?JSON.stringify(audit):null,audit?.providerRequestId??null])
        await db("UPDATE ft_customer_quota_global SET blocked=true,blocked_reason=coalesce(blocked_reason,'unknown-usage') WHERE period=$1",[row.period])
        return {state:'unknown',held:amount(row.reserved)}
      }
      if(row.provider_request_id&&usage?.providerRequestId&&row.provider_request_id!==usage.providerRequestId)throw customerError('Målingen tilhører en annen leverandørforespørsel.',409)
      let duplicate=false
      if(complete&&usage.providerRequestId) {
        const [prior]=await db('SELECT * FROM ft_customer_meter WHERE provider_request_id=$1 AND id<>$2',[usage.providerRequestId,ticket.id])
        if(prior) {
          if(prior.owner_hash!==row.owner_hash||prior.model!==row.model||!sameUsage(prior.usage,usage))throw customerError('Leverandørmålingen finnes med et annet grunnlag.',409)
          duplicate=true
        }
      }
      const cost=rejected||duplicate?0:measured,reserved=amount(row.reserved),funding=row.funding
      let rest=cost,includedCost=Math.min(rest,amount(funding.included));rest-=includedCost
      if(row.owner_id) {
        await db('UPDATE ft_customer_quota_period SET held=held-$3,spent=spent+$4 WHERE owner_id=$1 AND period=$2',[row.owner_id,funding.period??row.period,funding.included,includedCost])
        for(const credit of funding.credits) {
          const spend=Math.min(rest,amount(credit.amount));rest-=spend
          await db('UPDATE ft_customer_quota_credit SET held=held-$2,spent=spent+$3 WHERE id=$1',[credit.id,credit.amount,spend])
        }
        if(rest)await db('UPDATE ft_customer_quota_period SET spent=spent+$3 WHERE owner_id=$1 AND period=$2',[row.owner_id,funding.period??row.period,rest])
      }
      const [unresolved]=await db("SELECT count(*)::int AS count FROM ft_customer_meter WHERE period=$1 AND state='unknown' AND id<>$2",[row.period,ticket.id])
      await db(`UPDATE ft_customer_quota_global SET held=held-$2,spent=spent+$3,
        blocked=$4 OR (blocked AND NOT(coalesce(blocked_reason='unknown-usage',false) AND $5)),
        blocked_reason=CASE WHEN $4 THEN 'reservation-overrun' WHEN blocked_reason='unknown-usage' AND $5 THEN NULL ELSE blocked_reason END WHERE period=$1`,[row.period,reserved,cost,cost>reserved,unresolved.count===0])
      await db(`UPDATE ft_customer_meter SET state=$2,cost=$3,usage=$4,provider_request_id=$5,
        note=$6,updated_at=now() WHERE id=$1`,[ticket.id,rejected?'rejected':'settled',cost,audit?JSON.stringify(audit):null,
        duplicate?null:audit?.providerRequestId??row.provider_request_id??null,duplicate?'duplicate-provider-measurement':cost>reserved?'reservation-bound-exceeded':null])
      return {state:rejected?'rejected':'settled',cost,overrun:cost>reserved,duplicate}
    },{requireUser:false})
  }
  async function execute(ticket,params,work) {
    const started=await sql("UPDATE ft_customer_meter SET state='running',lease_until=$2,updated_at=now() WHERE id=$1 AND state='reserved' AND owner_id IS NOT NULL RETURNING id",[ticket.id,new Date(now().getTime()+330000)])
    if(!started.length)throw customerError('Modellkallet er allerede startet eller kontoen er slettet. Hent status for samme innsending.',409)
    let recorded=false,finalized=false
    const measured=async usage=>{const result=await record(ticket,usage,{complete:usage.complete!==false});recorded=true;finalized=['settled','rejected'].includes(result.state)}
    try {
      const result=await work({...params,maxTokens:ticket.maxTokens},measured)
      if(!recorded){const receipt=await record(ticket,result?.usage?{...result.usage,...(result.id?{requestId:result.id}:{}),...(result.model?{model:result.model}:{})}:null,{complete:true});finalized=receipt.state==='settled'}
      return result
    }catch(error){
      if(!recorded){const audit=error.usage||error.providerRequestId?{...error.usage,...(error.providerRequestId?{requestId:error.providerRequestId}:{}),...(error.providerModel?{model:error.providerModel}:{})}:null;const receipt=await record(ticket,audit,{complete:false,rejected:error.notBilled===true}).catch(()=>null);finalized=receipt?.state==='rejected'}
      if(finalized)error.meterFinalized=true
      throw error
    }
  }
  async function credit(user,{source,amount:creditAmount,expiresAt=null,validFrom}) {
    const start=validFrom??now()
    if(typeof source!=='string'||source.length>180||!Number.isSafeInteger(creditAmount)||creditAmount<1||
      !Number.isFinite(new Date(start).getTime())||expiresAt!==null&&(!Number.isFinite(new Date(expiresAt).getTime())||new Date(expiresAt)<=new Date(start)))throw Error('Ugyldig ekstrakapasitet.')
    return transaction(quotaPeriod(now()).key,user.id,async db=>{
      await db(`INSERT INTO ft_customer_quota_credit(id,owner_id,source,amount,valid_from,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source) DO NOTHING`,[randomUUID(),user.id,source,creditAmount,start,expiresAt])
      const [row]=await db('SELECT * FROM ft_customer_quota_credit WHERE source=$1',[source])
      if(row.owner_id!==user.id||amount(row.amount)!==creditAmount||validFrom!==undefined&&new Date(row.valid_from).getTime()!==new Date(validFrom).getTime()||
        (row.expires_at?new Date(row.expires_at).getTime():null)!==(expiresAt?new Date(expiresAt).getTime():null))throw customerError('Kapasitetshendelsen er allerede brukt med andre vilkår.',409)
      return {id:row.id,amount:amount(row.amount)}
    })
  }
  return {summary,allowed,reserve,record,execute,credit,maintain,config,prices:modelPrices}
}
