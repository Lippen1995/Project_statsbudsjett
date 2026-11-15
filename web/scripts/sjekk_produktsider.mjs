import assert from 'node:assert/strict'
import { readFileSync,existsSync } from 'node:fs'
import { resolve,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCT_PATHS,productMetadata,productRoute,productVisibility } from '../src/products/launch.mjs'
const dist=fileURLToPath(new URL('../dist/',import.meta.url))
const homepage=readFileSync(resolve(dist,'index.html'),'utf8')
const sitemap=readFileSync(resolve(dist,'sitemap.xml'),'utf8')
assert.equal(homepage.includes('href="/hjelper-deg/"'),productVisibility().navigation)
for(const path of PRODUCT_PATHS) {
  const file=resolve(dist,path.slice(1),'index.html')
  const html=readFileSync(file,'utf8');const meta=productMetadata(productRoute(path))
  assert.ok(html.includes(`<meta name="robots" content="${meta.robots}"`))
  assert.ok(html.includes(`rel="canonical" href="${meta.canonical}"`))
  assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length,1)
  assert.ok(html.includes('window.__FELLESTALL_PRODUCTS__='))
  assert.ok(!html.includes('window.__FELLESTALL_SEO_META__='))
  assert.ok(html.includes('Under utvikling'))
  assert.equal(sitemap.includes(meta.canonical),productVisibility().navigation)
  for(const match of html.matchAll(/(?:src|href)="([^"]*assets\/[^\"]+)"/g)) assert.ok(existsSync(resolve(dirname(file),match[1])),`Missing asset: ${match[1]}`)
}
const product=readFileSync(resolve(dist,'hjelper-deg/mitt-sameie/index.html'),'utf8')
for(const text of ['Bygget i utviklingsmiljøet','Planlagt før lansering','Separate tillegg senere','https://sameie.fellestall.no/kom-i-gang','https://sameie.fellestall.no/logg-inn']) assert.ok(product.includes(text))
console.log('Produktsider: pre-rendering, metadata, assets, launch gate and clear availability passed.')
