import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const hash = (raw) => createHash('sha256').update(raw).digest('hex')

export function validateBudgetDocuments(documents = []) {
  if (!Array.isArray(documents) || documents.length > 26) throw Error('Ugyldige budsjettkilder')
  for (const d of documents) {
    if (!/^https:\/\/www\.regjeringen\.no\//.test(d.url) || !d.name ||
        !/^[a-f0-9]{64}$/.test(d.sha256) || !Number.isFinite(Date.parse(d.retrievedAt)) ||
        typeof d.text !== 'string' || hash(d.text) !== d.sha256 ||
        typeof d.quote !== 'string' || d.quote.length < 30 || !d.text.includes(d.quote))
      throw Error('Budsjettdokument eller sitat kan ikke kontrolleres')
  }
}

export function loadBudgetDocuments(dataDir, year) {
  const path = `${dataDir}/budget-research/${year}/index.json`
  if (!existsSync(path)) return undefined
  const index = JSON.parse(readFileSync(path, 'utf8'))
  if (index.version !== 1 || index.year !== year || !Array.isArray(index.documents))
    throw Error('Ugyldig budsjettkildearkiv')
  const documents = index.documents.map((d) => {
    if (!/^[a-f0-9]{64}\.txt$/.test(d.path)) throw Error('Ugyldig budsjettkildesti')
    const { path, ...metadata } = d
    return { ...metadata, text: readFileSync(`${dataDir}/budget-research/${year}/${path}`, 'utf8') }
  })
  validateBudgetDocuments(documents)
  return documents
}

export function budgetDocumentFacts(documents) {
  validateBudgetDocuments(documents)
  return Object.fromEntries((documents ?? []).map((d, i) => [
    'document' + String.fromCharCode(65 + i) + 'Quote',
    { value: 0, text: d.quote, label: `Ordrett kildeutdrag: ${d.name}` },
  ]))
}
