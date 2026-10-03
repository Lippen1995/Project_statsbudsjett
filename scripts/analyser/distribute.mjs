import { githubClient } from './github.mjs'
import { linkedInToken } from './linkedin-auth.mjs'
import { contentHash } from './schema.mjs'
import { linkedInPayload, assertLiveVersion, assertUnsent } from './linkedin.mjs'
const g = githubClient()
const path = 'editorial/linkedin-receipts.json'
const version = process.env.LINKEDIN_VERSION
if (!/^20\d{4}$/.test(version ?? ''))
  throw Error('LinkedIn-tilgang og en støttet LINKEDIN_VERSION må konfigureres')
const publications = (await g.content('web/src/analyser/publications.json')).value
const saved = await g.content(path)
const receipts = saved?.value ?? []
if (receipts.some((r) => r.status === 'pending'))
  throw Error(
    'Et tidligere LinkedIn-forsøk mangler bekreftet kvittering. Kontroller dette før nye innlegg sendes',
  )
const candidates = publications.filter(
  (a) => !receipts.some((r) => r.contentHash === contentHash(a)),
)
const article = candidates.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0]
if (!article) {
  console.log('Ingen nye godkjente LinkedIn-innlegg.')
  process.exit(0)
}
const token = await linkedInToken()
const payload = linkedInPayload(article, process.env.LINKEDIN_ORGANIZATION_ID)
assertUnsent(receipts, article)
const url = `https://fellestall.no/analyser/${article.slug}/datagrunnlag.json`
let live = false
for (const delay of [0, 5000, 10000, 20000, 30000]) {
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
  try {
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) continue
    assertLiveVersion(article, await response.json())
    live = true
    break
  } catch {
    /* Deployment may still be propagating. No post before verified readiness. */
  }
}
if (!live)
  throw Error(
    'Analysesiden er ikke klar. LinkedIn er ikke publisert; kjør distribusjonen igjen etter ferdig utrulling',
  )
// Persist a claim before sending. A timeout can mean the post was created:
// fail closed and require reconciliation instead of creating duplicate posts.
const save = async (message) => {
  const head = await g.api(`${g.root}/git/ref/heads/main`)
  const current = (await g.content(path))?.value ?? []
  if (JSON.stringify(current) !== JSON.stringify(receipts.slice(0, -1)))
    throw Error('Publiseringsloggen ble endret parallelt; sending er stoppet')
  await g.commit('main', head.object.sha, { [path]: receipts }, message)
}
const receipt = {
  contentHash: contentHash(article),
  slug: article.slug,
  status: 'pending',
  attemptedAt: new Date().toISOString(),
}
receipts.push(receipt)
await save('analysis: reserver LinkedIn-publisering')
try {
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })
  if (response.status !== 201)
    throw Error(
      `LinkedIn svarte HTTP ${response.status}; kontroller publiseringsforsøket før ny sending`,
    )
  const postId = response.headers.get('x-restli-id')
  if (!postId)
    throw Error('LinkedIn manglet en publiseringskvittering; kontroller siden før ny sending')
  receipt.status = 'sent'
  receipt.postId = postId
  receipt.sentAt = new Date().toISOString()
  const head = await g.api(`${g.root}/git/ref/heads/main`)
  const current = (await g.content(path)).value
  if (current.at(-1)?.contentHash !== receipt.contentHash || current.at(-1)?.status !== 'pending')
    throw Error('Publiseringsloggen er endret; publiseringskvitteringen må avstemmes manuelt')
  await g.commit(
    'main',
    head.object.sha,
    { [path]: receipts },
    'analysis: lagre LinkedIn-kvittering',
  )
  console.log(`LinkedIn publisert for ${article.slug}; kvittering lagret.`)
} catch (error) {
  console.error(error.message)
  console.error(
    'Publiseringsloggen står som pending. Den vil ikke bli sendt automatisk på nytt. Kontroller LinkedIn og avstem kvitteringen før videre forsøk.',
  )
  process.exitCode = 1
}
