import { readFile } from 'node:fs/promises'
import { cooldownEnd, topicKey } from '../../web/src/analyser/topics.js'
import { buildTopicCatalog } from '../../scripts/admin/topic-catalog.mjs'

let catalog
export async function loadTopicCatalog() {
  if (!catalog) {
    try { catalog = JSON.parse(await readFile(new URL('./topic-catalog.json', import.meta.url), 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT' || process.env.VERCEL) throw error
      catalog = buildTopicCatalog()
    }
  }
  if (catalog.version !== 1 || !Array.isArray(catalog.topics)) throw Error('Svens temagrunnlag er utilgjengelig')
  return catalog
}

export function eligibleTopics(catalog, published, document, { excludeKeys = [], at = new Date().toISOString() } = {}) {
  if (!Array.isArray(excludeKeys) || excludeKeys.length > 100 || excludeKeys.some(key => typeof key !== 'string' || key.length > 180)) throw Object.assign(Error('Ugyldig temavalg.'), { status: 400 })
  const excluded = new Set([
    ...document.items.map(entry => entry.topicKey).filter(Boolean),
    ...document.history.map(event => event.entry.topicKey).filter(Boolean),
    ...published.filter(article => Date.parse(at) < cooldownEnd(article)).map(article => topicKey(article.report)),
    ...excludeKeys,
  ])
  return catalog.topics.filter(suggestion => !excluded.has(suggestion.topicKey))
}
