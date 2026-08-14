import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const sitemap = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8')
const feil = []

const krev = (krav, melding) => { if (!krav) feil.push(melding) }
const antall = (uttrykk) => [...html.matchAll(uttrykk)].length

krev(/<title>Statsbudsjettet og statsregnskapet forklart \| Fellestall\.no<\/title>/.test(html), 'søkefokusert tittel mangler')
krev(/<meta name="description" content="[^"]{120,170}"/.test(html), 'meta description mangler eller har uheldig lengde')
krev(html.includes('name="robots" content="index, follow, max-image-preview:large'), 'robots-metadata mangler')
krev(html.includes('rel="canonical" href="https://fellestall.no/"'), 'kanonisk adresse mangler')
krev(html.includes('hreflang="nb-NO"'), 'språkalternativ mangler')
krev(html.includes('property="og:image" content="https://fellestall.no/delingsbilde.png"'), 'delingsbilde mangler')
krev(html.includes('name="twitter:image:alt"'), 'tekstalternativ for delingsbildet mangler')
krev(antall(/<h1(?:\s|>)/g) === 1, 'den statiske HTML-en skal ha nøyaktig én h1')
krev(antall(/<h2(?:\s|>)/g) >= 9, 'den statiske HTML-en mangler innholdsseksjoner')
krev(html.includes('Hvor blir det av skattepengene?'), 'hovedinnholdet er ikke gjengitt i første HTML-svar')

const jsonTreff = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
krev(Boolean(jsonTreff), 'JSON-LD mangler')
if (jsonTreff) {
  try {
    const data = JSON.parse(jsonTreff[1])
    const typer = data['@graph']?.map((node) => node['@type']) ?? []
    krev(typer.includes('WebSite'), 'WebSite-data mangler')
    krev(typer.includes('Dataset'), 'Dataset-data mangler')
    const datasett = data['@graph'].find((node) => node['@type'] === 'Dataset')
    krev(datasett?.distribution?.length >= 3, 'datasettet mangler nedlastbare fordelinger')
    krev(Boolean(datasett?.dateModified), 'datasettet mangler oppdateringsdato')
  } catch (error) {
    feil.push(`JSON-LD kan ikke leses: ${error.message}`)
  }
}

krev(sitemap.includes('<lastmod>'), 'sitemap mangler korrekt oppdateringssignal')
krev(!sitemap.includes('<changefreq>') && !sitemap.includes('<priority>'), 'sitemap inneholder signaler Google ignorerer')

if (feil.length) {
  console.error('SEO-sjekken fant feil:')
  feil.forEach((feiltekst) => console.error(`  – ${feiltekst}`))
  process.exit(1)
}

console.log('SEO-sjekk: statisk innhold, metadata, strukturerte data og sitemap er på plass.')
