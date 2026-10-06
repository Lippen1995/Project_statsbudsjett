import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { validateArticle } from './schema.mjs'
const targets = [
  'https://www.regjeringen.no/no/statsbudsjett/2027/id3172975/',
  'https://data.ssb.no/api/pxwebapi/v2/tables?lang=no',
  ...new Set(
    JSON.parse(readFileSync('editorial/research/budsjett-2027/sources.json'))
      .sources.filter((s) => s.sourceType === 'party-primary')
      .map((s) => new URL(s.url).origin + '/'),
  ),
]
const failures = []
for (const url of targets) {
  // curl respects the cloud executor's proxy and CA; don't attempt a direct route.
  const r = spawnSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '20',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      url,
    ],
    { encoding: 'utf8' },
  )
  const status = Number(r.stdout)
  console.log(`${url}: ${r.status === 0 ? status : 'nettverksfeil'}`)
  if (r.status !== 0 || status < 200 || status >= 400) failures.push(url)
}
const github = spawnSync(
  'gh',
  ['api', 'repos/Lippen1995/Project_statsbudsjett', '--jq', '.permissions.push'],
  { encoding: 'utf8' },
)
if (github.status !== 0 || github.stdout.trim() !== 'true')
  failures.push('GitHub API / repository write permission')
console.log(
  `GitHub API: ${github.status === 0 && github.stdout.trim() === 'true' ? 'lesing og repository-skrivetilgang bekreftet' : 'ikke bekreftet'}`,
)
JSON.parse(readFileSync('web/src/analyser/publications.json')).forEach((a) =>
  validateArticle(a, { published: true }),
)
if (failures.length) {
  console.error('Budsjettdagsarbeidet er blokkert av manglende tilgang: ' + failures.join(', '))
  console.error(
    'Bruk det publiserte miljøet i en ny kjøring; ikke endre proxy, omgå kildekontroll eller skriv en historisk analyse som erstatning.',
  )
  process.exitCode = 1
} else
  console.log(
    'Kilder, GitHub og publiseringsregister er kontrollert. Dette bekrefter ikke en AI-tidsplan eller et mottatt mobilvarsel.',
  )
