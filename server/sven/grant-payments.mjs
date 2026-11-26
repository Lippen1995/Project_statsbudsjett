import { SaxesParser } from 'saxes'
import { unzipOffice } from './office-archive.mjs'

const government = 'https://www.regjeringen.no'
export const grantPaymentIndex = government+'/no/tema/kommuner-og-regioner/kommuneokonomi/inntektssystemet-for-kommuner-og-fylkeskommuner/utbetaling-av-rammetilskudd-til-kommuner/terminutbetalinger/id548801/'
const assetPath = '/contentassets/9140b6b52571440d9a7db00274df83e5/'
const correctionTerm = 11
const normalTerms = [1,2,3,4,5,6,7,8,9,10]

function approvedAsset(value, extension) {
  if (!value) return null
  const url = new URL(value, government)
  return url.origin === government && !url.username && !url.password &&
    url.pathname.startsWith(assetPath) && url.pathname.toLowerCase().endsWith(extension) ? url.href : null
}

export function extractGrantTerms(html, year) {
  const results = new Map()
  for (const [, section] of html.matchAll(/<h3[^>]*>\s*Kommunene\s*<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi)) {
    for (const [, row] of section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const title = row.split(/<br\s*\/?\s*>/i)[0]
      const term = Number(title.match(/\btermin\s*(\d{1,2})\b/i)?.[1])
      const links = [...row.matchAll(/href=["']([^"']+)["']/gi)].map(([,url])=>url)
      const spreadsheet = approvedAsset(links.find(url=>url.endsWith('.xlsx') && new RegExp('(?:^|[/_-])'+year+'(?:$|[/_.-])').test(url)),'.xlsx')
      const guide = approvedAsset(links.find(url=>url.endsWith('.pdf')),'.pdf')
      if (spreadsheet && term>=1 && term<=correctionTerm && !results.has(term)) results.set(term,{term,url:spreadsheet,guide})
    }
  }
  return [...results.values()].sort((a,b)=>a.term-b.term)
}

function xmlParser() {
  const parser = new SaxesParser()
  parser.on('doctype',()=>{throw new Error('Ukjent XML-format i departementets regneark')})
  return parser
}

function sharedStrings(xml) {
  if (!xml) return []
  const strings=[]
  const parser=xmlParser()
  let reading=false, value=''
  parser.on('opentag',({name})=>{
    if (name==='si') value=''
    if (name==='t') reading=true
  })
  parser.on('text',text=>{if(reading)value+=text})
  parser.on('closetag',({name})=>{
    if(name==='t')reading=false
    if(name==='si')strings.push(value)
  })
  parser.write(xml).close()
  return strings
}

function readGrid(xml,strings) {
  const grid=[]
  const parser=xmlParser()
  let row, cell, reading=false, buffer=''
  parser.on('opentag',({name,attributes})=>{
    if(name==='row') row={number:Number(attributes.r),fields:{}}
    if(name==='c'&&row) cell={column:attributes.r?.match(/^[A-Z]+/)?.[0],type:attributes.t??'n'}
    if(cell && (name==='v'||name==='t')) {reading=true;buffer=''}
  })
  parser.on('text',text=>{if(reading)buffer+=text})
  parser.on('closetag',({name})=>{
    if((name==='v'||name==='t')&&reading&&cell) {
      cell.value=name==='t'?buffer:cell.type==='s'?strings[Number(buffer)]
        :cell.type==='n'&&buffer.trim()&&Number.isFinite(Number(buffer))?Number(buffer):undefined
      reading=false
    }
    if(name==='c'&&cell) {
      if(cell.column&&cell.value!==undefined) row.fields[cell.column]=cell.value
      cell=null
    }
    if(name==='row'&&row) {grid.push(row);row=null}
  })
  parser.write(xml).close()
  return grid
}

const normalizedHeader = value => String(value??'').normalize('NFC').toLocaleLowerCase('nb-NO').replace(/[\s-]+/g,' ').trim()

export async function parseGrantPaymentWorkbook(bytes,year,term) {
  const parts=await unzipOffice(bytes,path=>path==='xl/worksheets/sheet1.xml'||path==='xl/sharedStrings.xml')
  if(!parts.has('xl/worksheets/sheet1.xml')) throw new Error('Utbetalingsarket mangler')
  const grid=readGrid(parts.get('xl/worksheets/sheet1.xml'),sharedStrings(parts.get('xl/sharedStrings.xml')))
  const title=grid.slice(0,4).flatMap(row=>Object.values(row.fields))
    .find(value=>typeof value==='string' && new RegExp('\\b'+year+'\\s*\\(termin\\s+'+term+'\\)','i').test(value))
  const header=grid.find(row=>Object.values(row.fields).some(value=>normalizedHeader(value)==='samlet beløp utbetalt hittil i år'))
  const columnFor = label => Object.entries(header?.fields??{}).find(([,value])=>normalizedHeader(value)===label)?.[0]
  const columns={name:columnFor('kommune'),term:columnFor('terminutbetaling'),annual:columnFor('samlet beløp utbetalt hittil i år'),
    base:columnFor('innbyggertilskudd/utgiftsutjevning'),equalization:columnFor('inntektsutjevning denne terminen'),
    61:columnFor('distriktstilskudd sør norge'),62:columnFor('distriktstilskudd nord norge'),64:columnFor('totalt skjønnstilskudd'),
    66:columnFor('veksttilskudd'),67:columnFor('storbytilskudd')}
  if (!title || !columns.name || !columns.term || !columns.annual) throw new Error('År, termin eller kolonner stemmer ikke i utbetalingsarket')
  const recipients=[]
  const seen=new Set()
  for (const row of grid.filter(row=>row.number>header.number)) {
    const match=String(row.fields[columns.name]??'').match(/^(\d{4})\s+(.+)$/)
    if (!match) continue
    const [,code,name]=match
    const ytd=row.fields[columns.annual], paid=row.fields[columns.term]
    if (seen.has(code) || !Number.isFinite(ytd) || !Number.isFinite(paid)) throw new Error('Utbetaling mangler eller vises flere ganger')
    seen.add(code)
    const posts={}
    if (Number.isFinite(row.fields[columns.base]) && Number.isFinite(row.fields[columns.equalization])) {
      posts[60]=row.fields[columns.base]+row.fields[columns.equalization]
    }
    for (const post of [61,62,64,66,67]) if (Number.isFinite(row.fields[columns[post]])) posts[post]=row.fields[columns[post]]
    recipients.push({code,name,ytd,paid,row:row.number,posts})
  }
  if(!recipients.length) throw new Error('Fant ingen mottakere i utbetalingsarket')
  const sum = recipients.reduce((total,row)=>total+row.ytd,0)
  const printed=grid.find(row=>row.number>recipients.at(-1).row && Number.isFinite(row.fields[columns.annual]))?.fields[columns.annual]
  if (Number.isFinite(printed) && Math.abs(sum-printed)>recipients.length) throw new Error('Mottakerbeløp stemmer ikke med sumlinjen')
  return {title,columns,recipients}
}

export async function readGrantPayments(year,requestedTerm,{fetchImpl=fetch,signal,post}={}) {
  const get=async (url,format)=>{
    const deadline=AbortSignal.timeout(12000)
    const response=await fetchImpl(url,{redirect:'error',signal:signal?AbortSignal.any([signal,deadline]):deadline})
    if(!response.ok) throw new Error('Departementets terminoversikt er utilgjengelig')
    const reader=response.body.getReader()
    const chunks=[]
    let size=0
    try {
      for(;;) {
        const {done,value}=await reader.read()
        if(done) break
        size+=value.length
        if(size>2_500_000) throw new Error('Terminfilen er større enn forventet')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(()=>{}) }
    const bytes=Buffer.concat(chunks)
    return format==='text'?bytes.toString('utf8'):bytes
  }
  const entries=extractGrantTerms(await get(grantPaymentIndex,'text'),year)
  const selected=requestedTerm?entries.find(entry=>entry.term===requestedTerm):entries.at(-1)
  if (!selected) return null
  const load=async entry=>({...entry,...await parseGrantPaymentWorkbook(await get(entry.url,'xlsx'),year,entry.term)})
  if (!post || requestedTerm) return {post,scope:requestedTerm?'term':'ytd',year,...await load(selected)}
  const applicable=entries.filter(entry=>entry.term<=selected.term)
  const required=normalTerms.filter(term=>term<=selected.term)
  if (!required.every(term=>entries.some(entry=>entry.term===term))) {
    return {post,scope:'unavailable',year,term:selected.term,url:grantPaymentIndex,guide:selected.guide,recipients:[]}
  }
  const reports=await Promise.all(applicable.map(load))
  const latest=reports.at(-1)
  const maps=reports.map(report=>new Map(report.recipients.map(row=>[row.code,row])))
  return {...latest,post,scope:'post-ytd',year,
    reports:reports.map(({url,guide,term})=>({url,guide,term})),
    recipients:latest.recipients.map(row=>{
      const values=maps.map(map=>map.get(row.code)?.posts[post])
      return {...row,postTotal:values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0):null}
    }) }
}
