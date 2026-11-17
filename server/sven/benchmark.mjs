import { randomInt, randomUUID, createHash } from 'node:crypto'
export const dimensions = ['factualAccuracy','sourceSupport','temporalStatus','reasoning','counterEvidence','usefulness','clarity']
const nonempty = x => typeof x === 'string' && x.trim().length > 0
export const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')

export function prepareBenchmark(cases, { asOf, timeLimitMinutes = 15 } = {}) {
  if (!Array.isArray(cases) || !cases.length || new Set(cases.map(c => c.id)).size !== cases.length ||
    cases.some(c => !nonempty(c.id) || !nonempty(c.domain) || !nonempty(c.question))) throw new Error('Ugyldig testsett')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) throw new Error('Ugyldig testprotokoll')
  return { id: randomUUID(), asOf, timeLimitMinutes, createdAt: new Date().toISOString(),
    cases: cases.map(c => ({ ...c, surface: c.surface || 'chat', recommendationRequested: c.recommendationRequested === true })),
    products: ['Sven','ChatGPT','Claude'], protocol: 'products-with-search-v1',
    instructions: 'Bruk samme spørsmål og dato i nye samtaler. Aktiver tilgjengelig nettsøk. Registrer faktisk modell, abonnement, verktøy, tid og originaltranskripsjon. Ingen manuell forbedring av svar. API-baseline er en separat test, ikke en erstatning for produktet.' }
}

export function validateSubmission(manifest, submission) {
  if (!manifest.products.includes(submission.product) || !manifest.cases.some(c => c.id === submission.caseId)) throw new Error('Ukjent produkt eller testsak')
  if (!nonempty(submission.answer) || !nonempty(submission.model) || !nonempty(submission.productVersion) ||
    !nonempty(submission.runAt) || !Number.isFinite(Date.parse(submission.runAt)) || !Array.isArray(submission.tools) ||
    !submission.tools.every(nonempty) || !Number.isFinite(submission.elapsedSeconds) || submission.elapsedSeconds < 0 ||
    !['completed','failed','timeout'].includes(submission.status)) throw new Error('Svar eller obligatoriske kjøredata mangler')
  if (submission.status === 'completed' && submission.elapsedSeconds > manifest.timeLimitMinutes * 60) throw new Error('Tidsbudsjettet er overskredet; merk som timeout')
  if (submission.manifestHash !== digest(manifest)) throw new Error('Svaret tilhører en annen testprotokoll')
  return submission
}

export function blindBenchmark(manifest, submissions, random = randomInt) {
  const seen = new Set()
  for (const item of submissions) {
    validateSubmission(manifest,item)
    const key = `${item.caseId}:${item.product}`
    if (seen.has(key)) throw new Error('Duplikatsvar i testen')
    seen.add(key)
  }
  if (submissions.length !== manifest.cases.length * manifest.products.length) throw new Error('Alle produkter må ha et registrert resultat på hver sak, også ved feil eller timeout')
  const key = [], cases = []
  for (const task of manifest.cases) {
    const rows = submissions.filter(item => item.caseId === task.id)
    for (let i=rows.length-1; i>0; i--) { const j=random(i+1); [rows[i],rows[j]]=[rows[j],rows[i]] }
    const answers = rows.map((item,i) => {
      const label = String.fromCharCode(65+i)
      key.push({caseId:task.id,label,product:item.product,submissionHash:digest(item)})
      return {label,answer:item.answer,status:item.status}
    })
    cases.push({id:task.id,domain:task.domain,question:task.question,surface:task.surface,recommendationRequested:task.recommendationRequested,answers})
  }
  return { review: {manifestHash:digest(manifest),dimensions,cases}, key }
}

export function scoreBenchmark(review, key, ratings) {
  if (key.length !== review.cases.length * 3 || new Set(key.map(k=>`${k.caseId}:${k.label}`)).size !== key.length || review.cases.some(c => new Set(key.filter(k=>k.caseId===c.id).map(k=>k.product)).size !== 3)) throw new Error('Ugyldig blindnøkkel')
  const expected = review.cases.flatMap(c => c.answers.map(a => `${c.id}:${a.label}`))
  if (ratings.length !== expected.length || new Set(ratings.map(r=>`${r.caseId}:${r.label}`)).size !== expected.length) throw new Error('Vurder alle svar før avblinding')
  const rows = ratings.map(rating => {
    if (!expected.includes(`${rating.caseId}:${rating.label}`) || !nonempty(rating.reason) || typeof rating.criticalError !== 'boolean' ||
      dimensions.some(d => !Number.isInteger(rating.scores?.[d]) || rating.scores[d] < 0 || rating.scores[d] > 4)) throw new Error('Ufullstendig fagvurdering')
    const mapping = key.find(k => k.caseId === rating.caseId && k.label === rating.label)
    if (!mapping) throw new Error('Blindnøkkel mangler')
    const task = review.cases.find(c=>c.id===rating.caseId)
    const status = task.answers.find(a=>a.label===rating.label).status
    return {...rating,product:mapping.product,domain:task.domain, score:rating.criticalError || status !== 'completed' ? 0 : dimensions.reduce((s,d)=>s+rating.scores[d],0)/dimensions.length}
  })
  const domains = [...new Set(rows.map(r=>r.domain))]
  const products = [...new Set(key.map(r=>r.product))]
  const summaries = ['alle',...domains].flatMap(domain => products.map(product => {
    const values=rows.filter(r=>r.product===product && (domain==='alle'||r.domain===domain))
    return {domain,product,cases:values.length,mean:values.reduce((s,r)=>s+r.score,0)/values.length,criticalErrors:values.filter(r=>r.criticalError).length}
  }))
  const paired = products.filter(p=>p!=='Sven').map(product => {
    const values=review.cases.map(c=>{
      const sven=rows.find(r=>r.caseId===c.id&&r.product==='Sven').score
      const baseline=rows.find(r=>r.caseId===c.id&&r.product===product).score
      return Math.sign(sven-baseline)
    })
    return {against:product,wins:values.filter(v=>v>0).length,ties:values.filter(v=>v===0).length,losses:values.filter(v=>v<0).length}
  })
  return {manifestHash:review.manifestHash,summaries,paired,rows,
    conclusion:'Deskriptiv test. Små utvalg og ett vurderingspanel dokumenterer ikke generell overlegenhet. Kjør et separat, reservert testsett og uavhengige vurderere før kvalitetskrav eller automatisk utrulling.'}
}
