import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { editorialInputHash } from '../../scripts/analyser/editorial-policy.mjs'

const repo = fileURLToPath(new URL('../../',import.meta.url)), temporary=mkdtempSync(join(tmpdir(),'sven-editorial-browser-'))
const preview=join(temporary,'preview.json'),output=repo+'editorial/runs/browser-verification/'
mkdirSync(output,{recursive:true})
writeFileSync(preview,readFileSync(repo+'docs/sven/examples/health-after.json'))
const port=Number(process.env.EDITORIAL_TEST_PORT??5207),base=`http://127.0.0.1:${port}`
const server=spawn(process.execPath,[repo+'web/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
  {cwd:repo+'web',env:{...process.env,ANALYSIS_PREVIEW_FILE:preview},stdio:'pipe'})
let browser
try {
  for(let i=0;i<100;i++) {
    if(await fetch(base).then(r=>r.ok).catch(()=>false))break
    if(i===99)throw Error('Forhåndsvisningen startet ikke')
    await new Promise(r=>setTimeout(r,100))
  }
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
  for(const name of ['health','students','family']) {
    const article=JSON.parse(readFileSync(repo+`docs/sven/examples/${name}-after.json`,'utf8'))
    writeFileSync(preview,JSON.stringify(article))
    for(const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
      const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[]
      page.on('pageerror',e=>errors.push(e.message))
      const response=await page.goto(base+'/analyser/forhandsvisning/',{waitUntil:'networkidle'})
      assert.equal(response.status(),200)
      assert.equal(editorialInputHash(await page.evaluate(()=>window.__FELLESTALL_ANALYSES__.article)),editorialInputHash(article))
      assert.equal(await page.getByRole('heading',{name:'Vår vurdering',exact:true}).count(),0)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),true)
      const chart=page.locator('.an-figure svg').first(),container=page.locator('.an-figure').first()
      const bounds=await chart.boundingBox(),parent=await container.boundingBox()
      assert.ok(bounds.width<=parent.width && bounds.x>=parent.x,'Kort tidsserie skal være synlig uten vannrett rulling')
      const table=page.locator('.an-figure details summary').first()
      await table.focus();await page.keyboard.press('Space')
      assert.equal(await page.locator('.an-figure details').first().getAttribute('open'),'')
      if(name==='health') {
        const results=page.locator('.an-health-results'),before=await results.textContent()
        const slider=page.locator('.an-health-controls input[type=range]').first()
        await slider.focus();await page.keyboard.press('ArrowRight')
        assert.notEqual(await results.textContent(),before,'Scenariet skal beregnes på nytt ved tastaturendring')
        await page.keyboard.press('ArrowLeft')
        assert.equal(await results.textContent(),before)
      }
      assert.deepEqual(errors,[])
      await page.locator('.an-article-header').screenshot({path:output+`${name}-${device}-opening.png`})
      console.log(`${name} ${device}: kildeversjon, mobilbredde, tabelltastatur og scenario OK`)
      await page.close()
    }
  }
}finally{await browser?.close();server.kill('SIGTERM');rmSync(temporary,{recursive:true,force:true})}
