import { readFileSync, writeFileSync } from 'node:fs'

const meta = JSON.parse(readFileSync(new URL('../public/data/meta.json', import.meta.url), 'utf8'))
const sistEndret = String(meta.oppdatert).slice(0, 10)

const adresser = [
  { loc: 'https://fellestall.no/', lastmod: sistEndret },
  { loc: 'https://fellestall.no/personvern.html' },
  { loc: 'https://fellestall.no/vilkar.html' },
  { loc: 'https://fellestall.no/tilgjengelighet.html' },
]

const urlsett = adresser.map(({ loc, lastmod }) => [
  '  <url>',
  `    <loc>${loc}</loc>`,
  ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
  '  </url>',
].join('\n')).join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsett}
</urlset>
`

writeFileSync(new URL('../public/sitemap.xml', import.meta.url), sitemap, 'utf8')
