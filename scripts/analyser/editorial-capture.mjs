import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { fileHash } from './editorial.mjs'
import { editorialInputHash } from './editorial-policy.mjs'
import { graphPlan } from '../../web/src/analyser/chart-plan.js'
import { editorialRendererHash } from './editorial-render-hash.mjs'

// Render the actual existing application, not a second chart implementation.
export async function captureEditorial({ url, article, output, executablePath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' }) {
  const target = new URL(url)
  if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
    throw Error('Visuell evaluering bruker bare lokal forhåndsvisning')
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const manifests = []
  mkdirSync(output, { recursive: true })
  try {
    for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      const failures = [], images = []
      page.on('pageerror', error => failures.push(error.message))
      await page.route('**/*', route => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort())
      const response = await page.goto(url, { waitUntil: 'networkidle' })
      if (!response?.ok()) throw Error('Forhåndsvisningen svarte ikke med en fungerende artikkelside')
      await page.evaluate(() => document.fonts.ready)
      const rendered = await page.evaluate(() => window.__FELLESTALL_ANALYSES__?.article)
      if (!rendered || editorialInputHash(rendered) !== editorialInputHash(article)) throw Error('Forhåndsvisningen gjelder feil artikkelversjon')
      const figures = page.locator('.an-article .an-figure, .an-article .an-health-scenario')
      const graphCount = graphPlan(article.copy, article.report).length
      if (await figures.count() !== graphCount) failures.push('Antall rendrerte grafer samsvarer ikke med grafplanen')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      if (overflow) failures.push('Siden har horisontal overflow')
      const add = async (locator, name) => {
        const file = `${device}-${name}.png`
        await locator.screenshot({ path: resolve(output, file), animations: 'disabled' })
        images.push({ file, hash: fileHash(resolve(output, file)) })
      }
      await add(page.locator('.an-article'), 'article')
      await add(page.locator('.an-article-header'), 'opening')
      for (let i = 0; i < await figures.count(); i++) {
        await add(figures.nth(i), `graph-${i}`)
        for (const svg of await figures.nth(i).locator('svg:visible').all()) {
          const clipped = await svg.evaluate(element => {
            const view = element.viewBox.baseVal
            return [...element.querySelectorAll('text')].some(text => {
              const b = text.getBBox()
              return b.x < view.x - 2 || b.y < view.y - 2 || b.x + b.width > view.x + view.width + 2 || b.y + b.height > view.y + view.height + 2
            })
          })
          if (clipped) failures.push(`Graf ${i}: SVG-tekst utenfor tegneområdet`)
        }
      }
      const manifest = { version: 1, device, viewport: { width, height }, inputHash: editorialInputHash(article),
        rendererHash: editorialRendererHash(),
        at: new Date().toISOString(), graphCount, images, failures }
      const path = resolve(output, device + '.json')
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
      manifests.push({ device, manifest: path, hash: fileHash(path), rendererHash:manifest.rendererHash, failures })
      await page.close()
    }
  } finally { await browser.close() }
  return manifests
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [url, articlePath, output] = process.argv.slice(2)
  const packet = JSON.parse(readFileSync(articlePath, 'utf8'))
  console.log(JSON.stringify(await captureEditorial({url, article: packet.article ?? packet, output}),null,2))
}
