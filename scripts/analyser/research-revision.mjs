import { readReviewContext, pendingFeedback } from './workflow.mjs'
import { buildReport } from './report.mjs'
import { validateArticle } from './schema.mjs'
import { renderReview } from './render-review.mjs'
import { factText } from '../../web/src/analyser/model.js'

// Data expansion is a distinct revision: rebuild from trusted main and retain
// the original primary series. It can never publish or reuse an approval.
export async function deliverResearchRevision({g,reviewer,actor,packet,sourceCommit,dataDir='web/public/data',now=()=>new Date().toISOString()}) {
  if (!Number.isSafeInteger(packet.base?.number) || !packet.reason?.trim()) throw Error('Forskningsrevisjonen mangler gjennomgang og begrunnelse')
  const {pr,path,article:previous}=await readReviewContext(g,{issue:{number:packet.base.number}})
  if (pr.head.sha!==packet.base.head || pr.user?.type!=='Bot') throw Error('Forskningsrevisjonen gjelder ikke botens gjeldende head')
  const feedback=await pendingFeedback(g,pr.number,previous)
  if (packet.base.feedback!==feedback.map(f=>`${f.user}: ${f.body}`).join('\n\n')) throw Error('Nye innspill kom etter forskningsrevisjonen')
  const r=previous.report,a=packet.article
  if (r.kind!=='real-expenditure-per-capita' || a.slug!==previous.slug || a.createdAt!==previous.createdAt || a.status!=='draft' || a.approval || a.publishedAt)
    throw Error('Uventet forskningsrevisjon')
  for(const k of ['topic','geography','type','replaces']) if(JSON.stringify(a[k])!==JSON.stringify(previous[k])) throw Error('Revisjonen endrer artikkelidentiteten')
  const rebuilt=buildReport(dataDir,{departmentId:r.scopeId==='state'?null:r.scopeId,start:r.start,end:r.end,question:r.question,detailSelections:a.report.detailSelections,researchPlan:a.report.researchPlan})
  if (JSON.stringify(rebuilt.rows)!==JSON.stringify(r.rows) || rebuilt.scopeId!==r.scopeId) throw Error('Primærserien er endret; forskningsrevisjonen må avklares')
  if (JSON.stringify(rebuilt)!==JSON.stringify(a.report)) throw Error('Forskningsrevisjonen samsvarer ikke med uavhengig beregning')
  const next={...previous,report:rebuilt,copy:a.copy,status:'draft',generatedAt:now(),
    processedFeedbackIds:[...(previous.processedFeedbackIds??[]),...feedback.map(f=>f.id)],
    researchRevision:{previousHead:pr.head.sha,actor,sourceCommit,reason:packet.reason,generatedAt:now()}}
  delete next.approval;delete next.publishedAt
  validateArticle(next)
  const latest=await g.api(`${g.root}/pulls/${pr.number}`)
  const latestFeedback=await pendingFeedback(g,pr.number,previous)
  if(latest.state!=='open'||latest.head.sha!==pr.head.sha||JSON.stringify(latestFeedback)!==JSON.stringify(feedback)) throw Error('Gjennomgangen er endret; ingen revisjon skrevet')
  await g.commit(pr.head.ref,pr.head.sha,{[path]:next},'analysis: utvid kontrollert beregningsgrunnlag etter menneskelig innspill')
  await g.api(`${g.root}/pulls/${pr.number}`,{method:'PATCH',body:{title:`Analyse til gjennomgang: ${factText(next.copy.title,next.report)}`,body:renderReview(next)}})
  await g.api(`${g.root}/pulls/${pr.number}/requested_reviewers`,{method:'POST',body:{reviewers:[reviewer]}})
  console.log(`Forskningsrevisjon levert til gjennomgang #${pr.number}. Ny godkjenning kreves. Ingen publisering.`)
}
