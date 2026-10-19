import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {githubClient} from './github.mjs'
import {readReviewContext,pendingFeedback} from './workflow.mjs'
import {buildReport} from './report.mjs'
import {analysisSettings} from './config.mjs'
const [output,number,selectionFile]=process.argv.slice(2)
if(!/^editorial\/handoff\/[a-z0-9-]+\.json$/.test(output??'')||!Number.isSafeInteger(Number(number))||!analysisSettings().enabled)throw Error('Oppgi leveringsfil, gjennomgangsnummer og beregningsutvalg')
const g=githubClient({transport:'gh'}),{article,pr}=await readReviewContext(g,{issue:{number:Number(number)}}),selection=JSON.parse(readFileSync(selectionFile))
if(article.report.kind!=='real-expenditure-per-capita'||typeof selection.reason!=='string'||!selection.reason.trim())throw Error('Beregningene krever regnskapsrapport og begrunnelse')
const r=article.report,report=buildReport('web/public/data',{departmentId:r.scopeId==='state'?null:r.scopeId,start:r.start,end:r.end,question:r.question,detailSelections:selection.detailSelections??r.detailSelections,researchPlan:selection.researchPlan})
if(JSON.stringify(r.rows)!==JSON.stringify(report.rows))throw Error('Primærserien har endret seg')
const feedback=await pendingFeedback(g,pr.number,article)
const next={...article,report,status:'draft',generatedAt:new Date().toISOString()};delete next.approval;delete next.publishedAt
const packet={mode:'research-revision',reason:selection.reason,base:{number:pr.number,head:pr.head.sha,feedback:feedback.map(f=>`${f.user}: ${f.body}`).join('\n\n')},article:next}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(packet,null,2)+'\n')
console.log('Kontrollert utvidelse klargjort. Revider copy, valider og lever med boten; ny godkjenning kreves.')
