import { validateArticle } from './schema.mjs'
import { graphPlan } from '../../web/src/analyser/chart-plan.js'
import { copyBlocks } from './editorial-policy.mjs'

// Diagnostics are evidence, never automatic prose edits or invented quality scores.
export function diagnoseArticle(article, {reviewVerification} = {}) {
  const blockers = [], warnings = []
  try { validateArticle(article,{reviewVerification}) } catch (e) { blockers.push({ kind: 'schema', observation: e.message }) }
  if (!article?.copy) return { blockers, warnings }
  const seen = new Map()
  for (const block of copyBlocks(article.copy)) {
    const text = block.text.trim(), normalized = text.toLocaleLowerCase('nb').replace(/\s+/g, ' ')
    if (/det er (?:imidlertid )?viktig å presisere|verdt å merke seg|dette understreker viktigheten|dette er en kompleks problemstilling|samlet sett viser|det gjenstår å se/i.test(text))
      warnings.push({ kind: 'language', block: block.id, observation: text, action: 'Vurder om innledningen tilfører informasjon; integrer nødvendig presisjon i påstanden.' })
    if (/(?:slike|disse)\s+(?:gevinster|effekter|fordeler)[^.]{0,80}muligheter[^.]{0,100}ikke[^.]{0,80}resultater|det er her skillet går mellom|en annen regneillustrasjon setter størrelsene i perspektiv|ikke leses ut av organisasjonskartet/iu.test(text))
      warnings.push({kind:'epistemic-scaffolding',block:block.id,observation:text,
        action:'Undersøk om setningen bare gjentar usikkerhet som allerede ligger i «kan», «foreslår» eller «antar». Stryk den hvis den ikke endrer tolkningen; behold nødvendige forbehold med konkret begrunnelse.'})
    if (seen.has(normalized)) warnings.push({ kind: 'repetition', block: block.id, observation: `Identisk tekst i ${seen.get(normalized)}`, action: 'Gi avsnittet en ny redaksjonell funksjon eller fjern det.' })
    seen.set(normalized, block.id)
  }
  for (const [i, section] of article.copy.sections.entries()) {
    for (const text of [section.heading, ...section.paragraphs])
      for (const match of text.matchAll(/\{\{fact:([A-Za-z]+)\}\}/g))
        if (!section.factIds.includes(match[1])) blockers.push({ kind: 'citation', observation: `Seksjon ${i}: ${match[1]} brukes uten factIds-spor` })
  }
  try { graphPlan(article.copy, article.report) } catch (e) { blockers.push({ kind: 'graph', observation: e.message }) }
  return { blockers, warnings }
}
