import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')

const base = 'http://127.0.0.1:4173'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'pipe' })
let browser
try {
  for (let i = 0; i < 100; i++) {
    if (await fetch(base).then(r => r.ok).catch(() => false)) break
    if (i === 99) throw Error('Preview server did not start')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch()
  await mkdir('browser-artifacts', { recursive: true })
  for (const [name, viewport] of [['desktop', {width:1348,height:926}], ['mobile', {width:390,height:844}]]) {
    const context = await browser.newContext({viewport})
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    // Delay the data so the intro remains in view while layout/font checks run.
    await page.route('**/data/meta.json', async route => { await new Promise(r => setTimeout(r, 2300)); await route.continue() })
    await page.goto(base, {waitUntil:'domcontentloaded'})
    assert.equal(await page.locator('#ft-intro').isVisible(), true)
    assert.equal(await page.locator('.ft-intro-tagline').textContent(), 'Offentlig økonomi. Enkelt forklart. Åpent for alle.')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(650)
    const box = await page.locator('.ft-intro-logo').boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({path:`browser-artifacts/${name}-intro.png`})
    await page.waitForFunction(() => !document.getElementById('ft-intro'), null, {timeout:7000})
    await page.getByRole('heading', {name:'Hvor blir det av skattepengene?',exact:true}).waitFor()
    await page.screenshot({path:`browser-artifacts/${name}-homepage.png`})
    await page.evaluate(() => sessionStorage.clear()) // Test reload detection independently of the session flag.
    await page.reload({waitUntil:'domcontentloaded'})
    assert.equal(await page.locator('#ft-intro').count(), 0)
    await page.evaluate(() => { location.hash = '#kartet' })
    assert.equal(await page.locator('#ft-intro').count(), 0)
    assert.deepEqual(errors, [])
    await context.close()
  }
  for (const options of [{reducedMotion:'reduce'}, {javaScriptEnabled:false}]) {
    const context = await browser.newContext(options)
    const page = await context.newPage(); await page.goto(base)
    assert.equal(await page.locator('#ft-intro').isVisible(), false)
    await page.getByRole('heading', {name:'Hvor blir det av skattepengene?',exact:true}).waitFor()
    await context.close()
  }
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${base}/#kommuner`, {waitUntil:'domcontentloaded'})
  assert.equal(await page.locator('#ft-intro').count(), 0)
  // A first visit to an analysis page must not make internal navigation show an intro.
  await page.goto(`${base}/analyser/`)
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(base, {referer:`${base}/analyser/`,waitUntil:'domcontentloaded'})
  assert.equal(await page.locator('#ft-intro').count(), 0)
  await context.close()
  console.log('PASS: desktop/mobile intro, real homepage, reload, internal navigation, deep links, reduced motion and no JavaScript.')
} finally {
  await browser?.close()
  server.kill()
}
