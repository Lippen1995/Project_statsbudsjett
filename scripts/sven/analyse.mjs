import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyzeWithSven } from '../../server/sven/analysis.mjs'
import { anthropicSven } from '../../server/sven/anthropic.mjs'
import { resolveSvenSources } from '../../server/sven/sources.mjs'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))

try {
  const [surface, path, ...flags] = process.argv.slice(2)
  if (surface === 'sources' && path && !flags.length) {
    console.log(JSON.stringify(await resolveSvenSources(path, dataDir), null, 2))
  } else {
    await runAnalysis(surface, path, flags)
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Ugyldig JSON i underlaget eller modellsvar' : error.message)
  process.exitCode = 1
}

async function runAnalysis(surface, path, flags) {
  if (!['chat', 'editorial'].includes(surface) || !path ||
      (flags.length > 0 && (surface !== 'editorial' || flags.length !== 1 || flags[0] !== '--recommendation-requested'))) {
    throw new Error('Bruk: node scripts/sven/analyse.mjs chat|editorial <grunnlag.json> [--recommendation-requested]')
  }
  const { question, sources: suppliedSources } = JSON.parse(await readFile(path, 'utf8'))
  const sources = suppliedSources ?? await resolveSvenSources(question, dataDir)
  const recommendationRequested = flags.includes('--recommendation-requested')
  const answer = await analyzeWithSven({ question, sources, surface, recommendationRequested }, anthropicSven())
  if (suppliedSources == null) {
    answer.sources = sources.map(({ text, ...reference }) => reference)
  }
  console.log(JSON.stringify(answer, null, 2))
}
