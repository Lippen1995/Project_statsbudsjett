import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import SeoFallback from './src/fellestall/SeoFallback.jsx'

const NETTSTED = 'https://fellestall.no/'

function seo() {
  const meta = JSON.parse(readFileSync(new URL('./public/data/meta.json', import.meta.url), 'utf8'))
  const seoMeta = {
    forsteAar: meta.regnskap_aar[0],
    sisteBudsjettAar: meta.siste_budsjett_aar,
    oppdatert: meta.oppdatert,
  }
  const strukturert = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${NETTSTED}#nettsted`,
        url: NETTSTED,
        name: 'Fellestall.no',
        alternateName: 'Fellestall',
        description: 'Statsbudsjettet og statsregnskapet, normalisert og forklart med kroner per innbygger, andeler og utvikling over tid.',
        inLanguage: 'nb-NO',
        sameAs: 'https://github.com/Lippen1995/Project_statsbudsjett',
      },
      {
        '@type': 'Dataset',
        '@id': `${NETTSTED}#datasett`,
        url: NETTSTED,
        name: 'Norske statsfinanser – statsbudsjett og statsregnskap',
        alternateName: 'Fellestall-datasettet',
        description: 'Normaliserte tall for det norske statsbudsjettet og statsregnskapet, med utgifter og inntekter fra departement til kapittel, post og artskonto, supplert med folketall, konsumprisindeks, BNP og Oljefondets markedsverdi.',
        inLanguage: 'nb-NO',
        dateModified: meta.oppdatert,
        temporalCoverage: `${meta.regnskap_aar[0]}/${meta.siste_budsjett_aar}`,
        spatialCoverage: { '@type': 'Country', name: 'Norge' },
        isAccessibleForFree: true,
        keywords: ['statsbudsjettet', 'statsregnskapet', 'statsfinanser', 'skattepenger', 'offentlige utgifter', 'Oljefondet', 'Norge'],
        license: `${NETTSTED}vilkar.html`,
        isBasedOn: meta.kilder.map((kilde) => kilde.url),
        variableMeasured: ['Utgifter', 'Inntekter', 'Budsjett', 'Regnskap', 'Kroner per innbygger', 'Andel av BNP'],
        distribution: [
          {
            '@type': 'DataDownload',
            name: 'Utgifter',
            encodingFormat: 'application/json',
            contentUrl: `${NETTSTED}data/utgifter.json`,
          },
          {
            '@type': 'DataDownload',
            name: 'Inntekter',
            encodingFormat: 'application/json',
            contentUrl: `${NETTSTED}data/inntekter.json`,
          },
          {
            '@type': 'DataDownload',
            name: 'Metadata og kildeinformasjon',
            encodingFormat: 'application/json',
            contentUrl: `${NETTSTED}data/meta.json`,
          },
        ],
        mainEntityOfPage: { '@id': `${NETTSTED}#nettsted` },
      },
    ],
  }

  const fallback = renderToStaticMarkup(React.createElement(SeoFallback, seoMeta))
  const jsonLd = JSON.stringify(strukturert).replaceAll('<', '\\u003c')
  const klientMeta = JSON.stringify(seoMeta).replaceAll('<', '\\u003c')

  return {
    name: 'fellestall-seo',
    transformIndexHtml(html) {
      return html
        .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`)
        .replace('<!-- SEO_DATA -->', [
          `<meta property="og:updated_time" content="${meta.oppdatert}" />`,
          `<script>window.__FELLESTALL_SEO_META__=${klientMeta}</script>`,
          `<script type="application/ld+json">${jsonLd}</script>`,
        ].join('\n  '))
    },
  }
}

export default defineConfig({
  plugins: [react(), seo()],
  base: './',
})
