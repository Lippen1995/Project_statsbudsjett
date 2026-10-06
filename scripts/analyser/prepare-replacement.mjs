import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { replacementDraft, replacementSource } from './replacement.mjs'
import { contentHash, validateArticle } from './schema.mjs'
const [output, slug] = process.argv.slice(2)
if (!/^editorial\/handoff\/[a-z0-9-]+\.json$/.test(output ?? ''))
  throw Error('Oppgi editorial/handoff/<navn>.json og publisert analyseadresse')
const published = JSON.parse(readFileSync('web/src/analyser/publications.json'))
published.forEach((a) => validateArticle(a, { published: true }))
const source = published.find((a) => a.slug === slug)
if (!source) throw Error('Fant ikke den publiserte analysen')
replacementSource(published, { slug, contentHash: contentHash(source) })
const article = replacementDraft(source, new Date().toISOString())
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify({ mode: 'replacement', article }, null, 2) + '\n')
console.log(
  'Erstatningsutkast klargjort. Revider copy og grafer; behold report og replaces uendret. Ny menneskelig godkjenning kreves.',
)
