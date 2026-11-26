import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const base=process.argv[2]||'http://127.0.0.1:4181'
const artifacts=resolve(process.argv[3]||'/tmp/fellestall-customer-browser')
await mkdir(artifacts,{recursive:true})
const browser=await chromium.launch({headless:true})
const errors=[]
const password='Et langt kundepassord 123!'
async function context() {
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
  await ctx.route('https://fellestall.no/**',route=>route.abort())
  ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)))
  return ctx
}
async function email(ctx,address,purpose) {
  const response=await ctx.request.get(base+'/__test/mail?email='+encodeURIComponent(address))
  assert.equal(response.status(),200)
  const message=(await response.json()).findLast(item=>item.purpose===purpose)
  assert(message,'Testens e-postkvittering mangler')
  return message.url
}
async function register(ctx,page,address,name) {
  await page.goto(base+'/#konto/registrer')
  await page.locator('#login-form [name=name]').fill(name)
  await page.locator('#login-form [name=email]').fill(address)
  await page.locator('#login-form [name=password]').fill(password)
  await page.locator('#login-form [type=submit]').click()
  await page.waitForURL('**/#konto/bekreft')
  assert.equal((await ctx.request.get(base+'/api/customer/session')).status(),401)
  await page.goto(await email(ctx,address,'verify'))
  await page.waitForURL('**/#konto')
  await login(page,address,password)
}
async function login(page,address,value) {
  await page.locator('#login-form [name=email]').fill(address)
  await page.locator('#login-form [name=password]').fill(value)
  await page.locator('#login-form [type=submit]').click()
  await page.waitForURL('**/#sven')
  await page.locator('#message').waitFor()
}
const a=await context(),b=await context()
try {
  const pa=await a.newPage()
  await pa.goto(base+'/#hjem')
  await pa.waitForFunction('typeof saved!=="undefined"')
  await pa.evaluate(()=>localStorage.setItem('fellestall-mobil-sven-preview',JSON.stringify({session:true,name:'Falsk testøkt',talks:[]})))
  await pa.goto(base+'/#sven')
  await pa.waitForURL('**/#konto')
  assert.equal(await pa.locator('#message').count(),0)
  assert.equal((await a.request.post(base+'/api/sven/chat',{headers:{origin:base},data:{requestId:'e'.repeat(64),question:'Hei'}})).status(),401)
  await pa.screenshot({path:resolve(artifacts,'registration.png')})
  await register(a,pa,'mobil-a@example.test','Kunde A')
  const sessionA=await(await a.request.get(base+'/api/customer/session')).json()
  assert.equal(sessionA.account.plan,'free')
  const cookieA=(await a.cookies()).find(cookie=>cookie.name.includes('fellestall-customer')&&cookie.name.includes('session_token'))
  assert(cookieA?.httpOnly)
  assert.equal(await pa.evaluate(({password,token})=>JSON.stringify(localStorage).includes(password)||JSON.stringify(localStorage).includes(token),{password,token:cookieA.value}),false)
  await pa.locator('[data-action=sven-projects]').click()
  await pa.locator('#sven-project-form [name=name]').fill('Privat prosjekt A')
  await pa.locator('#sven-project-form [type=submit]').click()
  await pa.waitForFunction('saved.svenProjects?.length===1')
  await pa.evaluate('sheet.close()')
  await pa.locator('#message').fill('Forklar kommunetallene')
  await pa.getByRole('button',{name:'Send melding',exact:true}).click()
  await pa.getByText('Dette er et kontrollert testsvar til den innloggede kunden.',{exact:true}).waitFor()
  await pa.locator('#sven-file-input').setInputFiles({name:'privat-test.csv',mimeType:'text/csv',buffer:Buffer.from('Område;Beløp\nSkole;120')})
  await pa.waitForFunction('svenDraftFiles().length===1')
  const resources={}
  for(const kind of ['projects','conversations','jobs','files']) {
    const value=await(await a.request.get(base+'/api/customer/resources/'+kind)).json()
    assert(value.items.length>=1,kind+' må knyttes til kunden')
    resources[kind]=value.items[0].id
  }
  await pa.screenshot({path:resolve(artifacts,'authenticated-chat.png')})
  const pb=await b.newPage()
  await register(b,pb,'mobil-b@example.test','Kunde B')
  assert.equal(await pb.evaluate('saved.name'),'Kunde B')
  assert.equal(await pb.evaluate('saved.talks.length'),0)
  assert.equal(await pb.evaluate('saved.svenProjects?.length||0'),0)
  for(const [kind,id] of Object.entries(resources)) {
    assert.equal((await b.request.get(base+'/api/customer/resources/'+kind+'/'+id)).status(),404)
    assert.equal((await b.request.put(base+'/api/customer/resources/'+kind+'/'+id,{headers:{origin:base},data:{title:'Urettmessig endring'}})).status(),404)
  }
  for(const body of [{requestId:resources.jobs,resume:true},{requestId:resources.jobs,progress:true}]) {
    assert.equal((await b.request.post(base+'/api/sven/chat',{headers:{origin:base},data:body})).status(),404)
  }
  assert.equal((await b.request.post(base+'/api/customer/auth/update-user',{headers:{origin:base},data:{plan:'paid',role:'admin'}})).status(),404)
  assert.equal((await(await b.request.get(base+'/api/customer/session')).json()).account.plan,'free')
  await pa.goto(base+'/#innstillinger/konto')
  await pa.locator('[data-action=logout]').click()
  await pa.waitForURL('**/#hjem')
  assert.equal((await a.request.get(base+'/api/customer/session')).status(),401)
  const oldCookie=await a.request.get(base+'/api/customer/session',{headers:{cookie:cookieA.name+'='+cookieA.value}})
  assert.equal(oldCookie.status(),401)
  assert.equal((await b.request.get(base+'/api/customer/session')).status(),200)
  await pa.goto(base+'/#konto/glemt-passord')
  await pa.locator('[name=email]').fill('mobil-a@example.test')
  await pa.locator('#customer-forgot-form [type=submit]').click()
  await pa.getByText('Hvis adressen finnes hos oss, får du en e-post med en lenke.',{exact:true}).waitFor()
  await pa.goto(await email(a,'mobil-a@example.test','reset'))
  await pa.locator('#customer-reset-form').waitFor()
  assert.equal(new URL(pa.url()).searchParams.has('token'),false)
  const newPassword='Et nytt kundepassord 456!'
  await pa.locator('#customer-reset-form [name=password]').fill(newPassword)
  await pa.locator('#customer-reset-form [type=submit]').click()
  await pa.waitForURL('**/#konto')
  await login(pa,'mobil-a@example.test',newPassword)
  assert.equal((await(await a.request.get(base+'/api/customer/session')).json()).user.id,sessionA.user.id)
  assert.equal(await pa.evaluate('saved.talks.length'),0,'Private nettleserdata skal tømmes ved utlogging; varig innhold følger i lagringssteget')
  assert.deepEqual(errors,[])
  console.log('PASS: ekte mobilregistrering, e-postbekreftelse, HttpOnly-økt, prosjekt/samtale/fil/jobb-eierskap, to isolerte kunder, ingen egen oppgradering, utlogging og passordgjenoppretting. Ingen live modell- eller e-postkall.')
} finally {await a.close();await b.close();await browser.close()}
