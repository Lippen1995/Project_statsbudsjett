import { readFileSync, writeFileSync } from 'node:fs'
import { validateArticle } from '../../scripts/analyser/schema.mjs'
import { currentAnalyses } from '../src/analyser/topics.js'

const meta = JSON.parse(readFileSync(new URL('../public/data/meta.json', import.meta.url), 'utf8'))
const sistEndret = String(meta.oppdatert).slice(0, 10)
const analyses = JSON.parse(
  readFileSync(
    process.env.ANALYSIS_PUBLICATIONS_FILE ??
      new URL('../src/analyser/publications.json', import.meta.url),
    'utf8',
  ),
)
analyses.forEach((article) => validateArticle(article, { published: true }))

const adresser = [
  { loc: 'https://fellestall.no/', lastmod: sistEndret },
  { loc: 'https://fellestall.no/personvern.html' },
  { loc: 'https://fellestall.no/vilkar.html' },
  { loc: 'https://fellestall.no/tilgjengelighet.html' },
  { loc: 'https://fellestall.no/analyser/mot-sven/' },
  {
    loc: 'https://fellestall.no/analyser/',
    ...(analyses.length
      ? {
          lastmod: analyses
            .map((a) => a.publishedAt.slice(0, 10))
            .sort()
            .at(-1),
        }
      : {}),
  },
  ...currentAnalyses(analyses).map((a) => ({
    loc: `https://fellestall.no/analyser/${a.slug}/`,
    lastmod: a.publishedAt.slice(0, 10),
  })),
]

const urlsett = adresser
  .map(({ loc, lastmod }) =>
    [
      '  <url>',
      `    <loc>${loc}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n'),
  )
  .join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsett}
</urlset>
`

writeFileSync(new URL('../public/sitemap.xml', import.meta.url), sitemap, 'utf8')
