import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { githubClient } from './github.mjs'
import { readReviewContext } from './workflow.mjs'
import { contentHash } from './schema.mjs'
import { renderReview } from './render-review.mjs'

export function previewPath(number, head) {
  if (!Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40}$/.test(head))
    throw Error('Ugyldig forhåndsvisningsversjon')
  return `/analyser/utkast/pr-${number}/${head}/`
}

export async function collectPreviews(g) {
  const previews = []
  for (const pr of await g.pages('/pulls?state=open&base=main')) {
    if (pr.user?.login !== 'github-actions[bot]' || !pr.head.ref.startsWith('analysis/weekly-'))
      continue
    const { article, pr: current } = await readReviewContext(g, {
      pull_request: { number: pr.number },
    })
    if (article.status !== 'draft' || article.approval || article.publishedAt)
      throw Error('Forhåndsvisningen krever et ugodkjent utkast')
    previews.push({
      number: pr.number,
      head: current.head.sha,
      path: previewPath(pr.number, current.head.sha),
      url: `https://github.com/${g.repository}/pull/${pr.number}`,
      hash: contentHash(article),
      article,
    })
  }
  return previews
}

export async function notifyPreviews(g, previews) {
  for (const preview of previews) {
    const current = await g.api(`${g.root}/pulls/${preview.number}`)
    // Never present an old preview as the current version after a revision.
    if (current.state !== 'open' || current.head.sha !== preview.head) continue
    if (contentHash(preview.article) !== preview.hash)
      throw Error('Forhåndsvisningens gjennomgangsversjon er endret')
    // Direct native-task edits can leave the PR description at the old hash.
    // Preserve an up-to-date body; regenerate a stale one from the exact built draft.
    const reviewBody = current.body?.includes(`Versjon: \`${preview.hash}\``)
      ? current.body
      : renderReview(preview.article)
    const body = reviewBody.replace(
      /<!-- analysis-preview:start -->[\s\S]*?<!-- analysis-preview:end -->\s*/g,
      '',
    )
    const notice = [
      '<!-- analysis-preview:start -->',
      `## [Se utkastet med grafer på mobil og PC](https://fellestall.no${previewPath(preview.number, preview.head)})`,
      `Forhåndsvisning av denne versjonen: \`${preview.head}\`. Siden er merket utkast og er ikke i analysebiblioteket. Lenken er offentlig tilgjengelig.`,
      '<!-- analysis-preview:end -->',
      '',
    ].join('\n')
    await g.api(`${g.root}/pulls/${preview.number}`, {
      method: 'PATCH',
      body: { body: notice + '\n' + body },
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = githubClient()
  const file = process.env.ANALYSIS_REVIEW_PREVIEWS_FILE
  if (!file) throw Error('Mangler fil for forhåndsvisninger')
  if (process.argv[2] === 'collect') writeFileSync(file, JSON.stringify(await collectPreviews(g)))
  else if (process.argv[2] === 'notify')
    await notifyPreviews(g, JSON.parse(readFileSync(file, 'utf8')))
  else throw Error('Bruk collect eller notify')
}
