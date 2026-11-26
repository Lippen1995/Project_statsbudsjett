import { createHash } from 'node:crypto'
import { customerError } from './resources.mjs'

// Claude API list prices checked 2026-11-26. Nanodollars per token/search.
// https://platform.claude.com/docs/en/about-claude/pricing
export const priceVersion='claude-api-2026-11-26'
export const modelPrices=Object.freeze({
  'claude-sonnet-5-5':Object.freeze({input:2000,output:10000,cacheRead:100,cacheWrite:2500,searches:10_000_000,context:1_000_000,maxOutput:128_000}),
  'claude-opus-5-5':Object.freeze({input:4000,output:20000,cacheRead:200,cacheWrite:5000,searches:10_000_000,context:1_000_000,maxOutput:128_000}),
})
export const nanoUSD=1_000_000_000
export function safeAmount(value) {
  const number=Number(value)
  if(!Number.isSafeInteger(number)||number<0)throw Error('Ugyldig kapasitetsbeløp.')
  return number
}
export function quotaConfig(environment=process.env) {
  const text=environment.FELLESTALL_SVEN_QUOTAS
  if(!text)return {ready:false,priceVersion}
  let value
  try {value=typeof text==='string'?JSON.parse(text):text}catch {throw Error('Ugyldig Sven-kvoteoppsett.')}
  if(value.version!==1||!value.plans||!Number.isSafeInteger(value.globalMonthlyNano)||value.globalMonthlyNano<1)throw Error('Sven mangler global grense eller kontoplaner.')
  const plans={}
  for(const name of ['free','paid']) {
    const plan=value.plans[name]
    if(!plan||!Number.isSafeInteger(plan.monthlyNano)||plan.monthlyNano<0||!Array.isArray(plan.models)||!plan.models.length||
      new Set(plan.models).size!==plan.models.length||plan.models.some(model=>!modelPrices[model]))throw Error('Sven mangler gyldige kvoter eller modeller for '+name+'.')
    plans[name]={monthlyNano:plan.monthlyNano,models:[...plan.models]}
  }
  const maxOutputTokens=value.maxOutputTokens??128_000,minOutputTokens=value.minOutputTokens??1024
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens>128000||maxOutputTokens<1||!Number.isSafeInteger(minOutputTokens)||minOutputTokens<1||minOutputTokens>maxOutputTokens)throw Error('Ugyldig grense for modellutdata.')
  const toolInputReserveTokens=value.toolInputReserveTokens??16000
  if(!Number.isSafeInteger(toolInputReserveTokens)||toolInputReserveTokens<16000||toolInputReserveTokens>1_000_000)throw Error('Ugyldig inputreserve for kildeverktøy.')
  return {ready:true,priceVersion,plans,globalMonthlyNano:safeAmount(value.globalMonthlyNano),maxOutputTokens,minOutputTokens,toolInputReserveTokens}
}

export function quotaPeriod(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit'}).formatToParts(date)
  const year=Number(parts.find(part=>part.type==='year').value),month=Number(parts.find(part=>part.type==='month').value)
  const next=new Date(Date.UTC(year,month,1)),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Oslo',hour:'2-digit',hourCycle:'h23'}).format(next))
  return {key:`${year}-${String(month).padStart(2,'0')}`,resetAt:new Date(next.getTime()-hour*3600000).toISOString()}
}

export function normalizeUsage(value,{partial=false}={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const raw='input_tokens' in value
  const usage={
    input:raw?value.input_tokens:value.input,output:raw?value.output_tokens:value.output,
    cacheRead:(raw?value.cache_read_input_tokens:value.cacheRead)??0,
    cacheWrite:(raw?value.cache_creation_input_tokens:value.cacheWrite)??0,
    searches:(raw?value.server_tool_use?.web_search_requests:value.searches)??0,
  }
  if(Object.values(usage).some(number=>!Number.isSafeInteger(number)||number<0)) {
    if(!partial)return null
    for(const key of Object.keys(usage))if(!Number.isSafeInteger(usage[key])||usage[key]<0)usage[key]=null
  }
  return {...usage,...(typeof value.requestId==='string'?{providerRequestId:value.requestId.slice(0,180)}:{}),
    ...(typeof value.model==='string'?{model:value.model}:{}),...(typeof value.stopReason==='string'?{stopReason:value.stopReason.slice(0,80)}:{})}
}
export function usageCost(model,usage,prices=modelPrices[model]) {
  if(!prices||!normalizeUsage(usage)||['input','output','cacheRead','cacheWrite','searches'].some(key=>!Number.isSafeInteger(prices[key])||prices[key]<0))throw Error('Forbruket kan ikke avregnes.')
  const cost=['input','output','cacheRead','cacheWrite','searches'].reduce((sum,key)=>sum+BigInt(usage[key])*BigInt(prices[key]),0n)
  if(cost>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Forbruket er utenfor avregningsgrensen.')
  return Number(cost)
}

export function reservationQuote(model,params,config,available) {
  const prices=modelPrices[model]
  if(!prices)throw customerError('Modellen er ikke tilgjengelig.',403)
  // The provider's free count endpoint includes images and PDFs, but rejects
  // server tools. Their prompt overhead and later input are estimates;
  // an unexpected overrun is recorded in full and trips the global breaker.
  if(!Number.isSafeInteger(params.meterInputTokens)||params.meterInputTokens<0)throw customerError('Forbruket kunne ikke beregnes før oppstart.',503)
  let toolTurns=0,searches=0
  for(const tool of params.tools??[]) {
    if(!['web_search_20250305','web_fetch_20250910'].includes(tool.type)||!Number.isSafeInteger(tool.max_uses)||tool.max_uses<1||tool.max_uses>12)throw customerError('Verktøyet mangler en kontrollerbar forbruksgrense.',503)
    toolTurns+=tool.max_uses
    if(tool.type==='web_search_20250305')searches+=tool.max_uses
  }
  const base=Math.ceil(params.meterInputTokens*1.1)+1024+(params.tools?.length??0)*2048
  if(base>prices.context)throw customerError('Grunnlaget er for stort for modellen.',413)
  const inputTokens=(base+toolTurns*config.toolInputReserveTokens)*(toolTurns+1)
  const fixed=inputTokens*Math.max(prices.input,prices.cacheWrite)+searches*prices.searches
  const maxTokens=Math.min(params.maxTokens??config.maxOutputTokens,config.maxOutputTokens,prices.maxOutput,
    Math.floor(Math.max(0,available-fixed)/prices.output))
  if(maxTokens<config.minOutputTokens)throw customerError('Du har for lite ledig kapasitet til neste analysetrinn. Reservert kapasitet blir frigitt når forbruket er avklart.',402)
  return {reservedNano:safeAmount(fixed+maxTokens*prices.output),maxTokens,inputBound:inputTokens,searchBound:searches}
}

export const operationKey=(owner,request,phase)=>createHash('sha256').update(`sven-meter-v1:${owner}:${request}:${phase}`).digest('hex')
export const requestDigest=(model,params)=>createHash('sha256').update(JSON.stringify({model,...params,signal:undefined})).digest('hex')
