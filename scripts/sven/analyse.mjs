import { readFile } from 'node:fs/promises'
import { analyzeWithSven } from '../../server/sven/analysis.mjs'
import { anthropicSven } from '../../server/sven/anthropic.mjs'

try {
  const [surface, path, ...flags] = process.argv.slice(2)
  if (!['chat', 'editorial'].includes(surface) || !path ||
      (flags.length > 0 && (surface !== 'editorial' || flags.length !== 1 || flags[0] !== '--recommendation-requested'))) {
    throw new Error('Bruk: node scripts/sven/analyse.mjs chat|editorial <grunnlag.json> [--recommendation-requested]')
  }
  const { question, sources } = JSON.parse(await readFile(path, 'utf8'))
  const recommendationRequested = flags.includes('--recommendation-requested')
  const answer = await analyzeWithSven({ question, sources, surface, recommendationRequested }, anthropicSven())
  console.log(JSON.stringify(answer, null, 2))
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Ugyldig JSON i underlaget eller modellsvar' : error.message)
  process.exitCode = 1
}
