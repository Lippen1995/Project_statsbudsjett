// Orchestrates existing stage executors. The native host or the existing Sven
// transport supplies executeStage; this module never creates another provider.
import { newEditorialRun, checkpoint as record, reviseRun, finishEditorial, stages, assertRun } from './editorial.mjs'
import { editorialInputHash, policy } from './editorial-policy.mjs'
import { loadSkills } from './editorial-skills.mjs'

export async function runEditorial({ article, run = newEditorialRun(article), executeStage,
  persist = async () => {}, model, now = () => new Date().toISOString() }) {
  article = run.article ?? article
  assertRun(run, article)
  if (run.status === 'approved') return { article, run }
  if (run.pending) throw Error('Et arbeidssteg har uavklart resultat; kontroller forbruk før eksplisitt gjenopptakelse')
  if (run.status !== 'working') throw Error('Kjøringen må revideres eksplisitt før gjenopptakelse')
  const commit = async next => { next.article = article; await persist(next, run.revision); run = next }
  while (run.status === 'working') {
    const stage = stages.find(s => !run.completed[s])
    if (!stage) {
      const result = finishEditorial(run, article)
      if (result.run.status === 'approved') {
        article = { ...article, editorial: result.editorial }
        // Reports remain portable; local manifests/images live in the private run.
        article.editorial.visual = { ...article.editorial.visual,
          captures: article.editorial.visual.captures?.map(({manifest,...capture}) => capture) }
        await commit(result.run)
      } else {
        const finding = run.completed.editor.value.assessment.findings.find(f => f.severity !== 'suggestion')
        const target = stages.includes(finding?.target) ? finding.target : 'draft'
        await commit(reviseRun(run, target, result.run.reason || 'Sluttkontrollen krevde en målrettet redaksjonell revisjon.'))
      }
      continue
    }
    if (run.usage.reduce((sum,u)=>sum+u.workUnits,0) >= policy.maxWorkUnits ||
        Date.parse(now())-Date.parse(run.startedAt) > policy.maxElapsedMinutes*60000) {
      await commit({...run,status:'blocked',reason:'Arbeids- eller tidsgrensen er nådd før neste steg.',revision:run.revision+1})
      break
    }
    const key = `${run.id}:${stage}:revision-${run.revision}`
    await commit({...run,pending:{stage,key,at:now()},revision:run.revision+1})
    let output
    try {
      output = await executeStage({ stage, article, revision: run.revisions,
        context: loadSkills(stage,{query:article.topic}),
        decisions: Object.values(run.completed).map(c=>({stage:c.stage,summary:c.value.summary})) })
    } catch (error) {
      await commit({...run,status:'blocked',reason:`Arbeidssteget ${stage} feilet: ${error.message}`,revision:run.revision+1})
      throw error
    }
    if (output.article) {
      const changed = editorialInputHash(output.article) !== editorialInputHash(article)
      assertRun(run, output.article)
      article = output.article
      delete article.editorial
      if (changed && stages.indexOf(stage) > stages.indexOf('draft')) {
        // Recheck changed copy and all its visuals instead of attaching an old audit.
        const next=reviseRun({...run,pending:null},'draft','Språk- eller kontrollpasset endret artikkelen; tekst og grafikk må kontrolleres på nytt.')
        await commit(next)
        continue
      }
    }
    try {
      const next = record({...run,pending:null}, article, stage, output.value,
        {key,model:output.model ?? model,at:now(),...output.usage})
      await commit(next)
    } catch(error) {
      await commit({...run,pending:null,status:'blocked',reason:`Ugyldig resultat fra ${stage}: ${error.message}`,revision:run.revision+1})
      throw error
    }
  }
  return {article,run}
}
