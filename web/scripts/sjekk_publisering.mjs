/**
 * Publiseringssjekk: kjører de kontrollene som ellers gjøres for hånd, mot et
 * ferdig bygg.
 *
 *   npm run build
 *   npx vite preview --port 4173 &
 *   node scripts/sjekk_publisering.mjs 4173
 *
 * Kontrollene er valgt fordi hver av dem har fanget en virkelig feil i dette
 * prosjektet, ikke fordi de er vanlige å ha:
 *
 *   Kontrast måles mot flaten teksten faktisk males på. En DOM-vandring
 *   oppover treet gir feil svar for tekst inne i en graf, og en
 *   bakgrunnsvandring som forkastet «rgb(247, 245, 240)» ga en gang 4,41:1 der
 *   den virkelige verdien var 4,54:1 – altså feil på begge sider av grensen.
 *
 *   Animasjonene slås ikke av. Seksjonene ligger på opacity: 0 og reises opp av
 *   en animasjon; slår man den av, måles hele siden som usynlig. De ventes ut i
 *   stedet. Og målingen kjøres i begge bevegelsesinnstillinger: flisene i
 *   kartet var en gang dempet til 88 %, noe som bare slo inn for dem som ba om
 *   redusert bevegelse – og senket kontrasten under kravet nettopp for dem.
 *
 *   Forespørsler utenfor eget domene telles. Skriftene lå hos Google, og
 *   personvernerklæringen sier nå at ingenting går til en tredjepart. Den
 *   påstanden skal kunne etterprøves.
 *
 * Avslutter med 0 hvis alt er i orden, 1 ellers, slik at den kan brukes i CI.
 */
/*
 * Playwright hentes i kjøretid, ikke som avhengighet i package.json. Ligger den
 * der, installerer «npm ci» den ved hver utrulling – og utrullingen trenger den
 * ikke. PLAYWRIGHT_BROWSERS_PATH respekteres hvis den er satt.
 */
let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error(
    'Fant ikke playwright. Kontrollen kjøres for hånd og er derfor ikke en\n'
    + 'avhengighet i prosjektet. Installer den først:\n\n'
    + '    npm install --no-save playwright\n'
    + '    npx playwright install chromium\n')
  process.exit(2)
}

const PORT = process.argv[2] || '4173'
const BASE = `http://localhost:${PORT}`
const SIDER = ['', 'personvern.html', 'vilkar.html', 'tilgjengelighet.html']

const feil = []
const merknader = []
const ok = (t) => console.log(`  [32m✓[0m ${t}`)
const nei = (t) => { console.log(`  [31m✗[0m ${t}`); feil.push(t) }
const obs = (t) => { console.log(`  [33m![0m ${t}`); merknader.push(t) }

/** Kontrastmåling. Skilt ut fordi den kjøres på nytt per bevegelsesinnstilling. */
const maalKontrast = (side) => side.evaluate(() => {
  const lin = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
  const kon = (a, c) => {
    const la = lum(a), lb = lum(c)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }
  const tall = s => (s.match(/[\d.]+/g) || []).map(Number)

  /** Første HELDEKKENDE bakgrunn oppover i DOM-treet */
  const domBunn = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const v = tall(getComputedStyle(n).backgroundColor)
      if (v.length >= 3 && (v.length < 4 || v[3] > 0.95)) return v.slice(0, 3)
    }
    return [255, 255, 255]
  }

  const GEOMETRI = new Set(['rect', 'path', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text'])
  const flate = (el) => {
    const s = getComputedStyle(el)
    const raa = el.ownerSVGElement != null ? s.fill : s.backgroundColor
    if (!raa || raa === 'none') return null
    const v = tall(raa)
    if (v.length < 3) return null
    let a = v.length > 3 ? v[3] : 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) a *= +getComputedStyle(n).opacity
    return { rgb: v.slice(0, 3), a }
  }

  /**
   * Malt farge i et punkt: spør hva som ligger øverst, ta det ut av treffsonen,
   * spør på nytt. Laget må tas ut med pointer-events og ikke visibility –
   * skjuler man en <g> eller <svg> forsvinner alt under den, og målingen faller
   * gjennom til sidefargen.
   */
  const maltFarge = (x, y) => {
    const rort = [], lag = []
    let bunn = null
    try {
      for (let i = 0; i < 40; i++) {
        const el = document.elementFromPoint(x, y)
        if (!el || el === document.documentElement || el === document.body) break
        const geometri = el.ownerSVGElement != null && GEOMETRI.has(el.tagName.toLowerCase())
        const f = flate(el)
        if (f && f.a > 0.001) {
          if (f.a > 0.999) { bunn = f.rgb; break }
          lag.push(f)
        } else if (!geometri) { bunn = domBunn(el); break }
        el.style.setProperty('pointer-events', 'none', 'important')
        rort.push(el)
      }
    } finally { rort.forEach(e => e.style.removeProperty('pointer-events')) }
    let ut = bunn ?? [255, 255, 255]
    for (let i = lag.length - 1; i >= 0; i--) {
      const { rgb, a } = lag[i]
      ut = ut.map((v, j) => a * rgb[j] + (1 - a) * v)
    }
    return ut
  }

  const funn = []
  let maalt = 0
  const vurder = (el, fg, bg, px, vekt, tekst, kilde) => {
    const krav = px >= 24 || (px >= 18.66 && vekt >= 700) ? 3 : 4.5
    const k = kon(fg, bg)
    maalt++
    if (k < krav - 0.005) {
      funn.push(`${k.toFixed(2)}:1 (krav ${krav}) ${px}px ${kilde} "${tekst.slice(0, 30)}"`)
    }
  }

  // HTML-tekst
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg')) continue
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || +s.opacity < 0.1) continue
    vurder(el, tall(s.color).slice(0, 3), domBunn(el), parseFloat(s.fontSize),
      +s.fontWeight || 400, el.textContent.trim(),
      String(el.className || el.tagName).split(' ')[0])
  }

  // SVG-tekst: fill-attributtet, som computed.color ikke fanger
  const stil = document.createElement('style')
  stil.textContent = 'svg text{visibility:hidden!important}'
  document.head.append(stil)
  for (const t of document.querySelectorAll('svg text')) {
    const r = t.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    const s = getComputedStyle(t)
    const fg = tall(s.fill).slice(0, 3)
    if (fg.length < 3) continue
    let verst = null
    for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.3, 0.7]) {
      const bg = maltFarge(r.x + r.width * fx, r.y + r.height * fy)
      const k = kon(fg, bg)
      if (!verst || k < verst.k) verst = { k, bg }
    }
    vurder(t, fg, verst.bg, parseFloat(s.fontSize), +s.fontWeight || 400,
      t.textContent.trim(), 'graf')
  }
  stil.remove()
  return { funn, maalt }
})

const settledeAnimasjoner = (side) =>
  side.waitForFunction(() => document.getAnimations().every(a => a.playState === 'finished'),
    null, { timeout: 15000 }).catch(() => {})

const nettleser = await chromium.launch()

try {
  const side = await nettleser.newPage({ viewport: { width: 1400, height: 1000 } })

  /*
   * «vite preview» svarer med index.html og status 200 på hvilken som helst
   * ukjent adresse, slik enkeltsideapplikasjoner skal. Det gjør at en sjekk på
   * statuskoden alene ikke sier om filen finnes: en skrivefeil i en lenke ville
   * gått gjennom. Vi ber derfor først om en adresse som garantert ikke finnes,
   * og bruker svaret som fingeravtrykk på «dette er reservesvaret».
   *
   * GitHub Pages svarer 404 på det samme, så sjekken er strengere enn den
   * trenger å være i produksjon – men den skal kunne kjøres lokalt.
   */
  const reserve = await (await side.request.get(`${BASE}/finnes-ikke-${Math.random().toString(36).slice(2)}`)).text()
  const finnes = async (url) => {
    const svar = await side.request.get(url)
    if (!svar.ok()) return { ok: false, hvorfor: `status ${svar.status()}` }
    const kropp = await svar.text()
    if (kropp === reserve) return { ok: false, hvorfor: 'fikk reservesvaret – filen finnes ikke' }
    return { ok: true, kropp }
  }

  // --- 1. Sidene svarer, og har det de skal i <head> ------------------------
  console.log('\nSider og metadata')
  for (const sti of SIDER) {
    const navn = sti || '(forsiden)'
    if (sti) {
      const f = await finnes(`${BASE}/${sti}`)
      if (!f.ok) { nei(`${navn}: ${f.hvorfor}`); continue }
    }
    // Forsiden bygges av JavaScript, så h1 finnes ikke ved domcontentloaded.
    // Vi venter på at appen har tegnet, ellers teller vi null overskrifter.
    await side.goto(`${BASE}/${sti}`, { waitUntil: 'networkidle' })
    await side.waitForSelector('h1', { timeout: 15000 }).catch(() => {})
    const hode = await side.evaluate(() => ({
      tittel: document.title,
      beskrivelse: document.querySelector('meta[name=description]')?.content,
      kanonisk: document.querySelector('link[rel=canonical]')?.href,
      ikon: document.querySelector('link[rel=icon]')?.getAttribute('href'),
      sprak: document.documentElement.lang,
      h1: document.querySelectorAll('h1').length,
    }))
    const mangler = []
    if (!hode.tittel) mangler.push('tittel')
    if (!hode.beskrivelse) mangler.push('description')
    if (!hode.kanonisk) mangler.push('canonical')
    if (!hode.ikon) mangler.push('ikon')
    if (hode.sprak !== 'nb') mangler.push(`lang=${hode.sprak || 'mangler'}`)
    if (hode.h1 !== 1) mangler.push(`${hode.h1} h1-elementer`)
    if (mangler.length) nei(`${navn}: mangler ${mangler.join(', ')}`)
    else ok(`${navn}: tittel, beskrivelse, kanonisk adresse, ikon, lang=nb, én h1`)
  }

  // Delingskort – bare forsiden trenger det
  await side.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const deling = await side.evaluate(() => {
    const m = (p) => document.querySelector(`meta[property="${p}"]`)?.content
    return { tittel: m('og:title'), bilde: m('og:image'), type: m('og:type'),
      kort: document.querySelector('meta[name="twitter:card"]')?.content }
  })
  if (deling.tittel && deling.bilde && deling.type && deling.kort) {
    if (!deling.bilde.startsWith('https://')) nei('og:image er ikke en absolutt adresse')
    else {
      const f = await finnes(deling.bilde.replace(/^https:\/\/[^/]+/, BASE))
      f.ok ? ok('delingskort på plass, og bildet finnes')
           : nei(`og:image finnes ikke i bygget: ${f.hvorfor}`)
    }
  } else nei('delingskort mangler og:title/og:image/og:type/twitter:card')

  // --- 2. robots.txt og sitemap --------------------------------------------
  console.log('\nIndeksering')
  const robots = await finnes(`${BASE}/robots.txt`)
  robots.ok ? ok('robots.txt finnes') : nei(`robots.txt: ${robots.hvorfor}`)
  const kart = await finnes(`${BASE}/sitemap.xml`)
  if (!kart.ok) nei(`sitemap.xml: ${kart.hvorfor}`)
  else {
    const adresser = [...kart.kropp.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    let brutt = 0
    for (const a of adresser) {
      const lokal = a.replace(/^https:\/\/[^/]+/, BASE)
      // Roten skal nettopp svare med index.html, så den unntas fingeravtrykket
      const f = lokal === `${BASE}/` || lokal === BASE
        ? { ok: (await side.request.get(`${BASE}/`)).ok() }
        : await finnes(lokal)
      if (!f.ok) { brutt++; nei(`sitemap peker på ${a}: ${f.hvorfor ?? 'svarer ikke'}`) }
    }
    if (!brutt) ok(`sitemap.xml: ${adresser.length} adresser, alle finnes`)
  }

  // --- 3. Ingen forespørsler ut av huset -----------------------------------
  console.log('\nTredjeparter')
  for (const sti of SIDER) {
    const p = await nettleser.newPage({ viewport: { width: 1400, height: 1000 } })
    const utenfor = new Set()
    p.on('request', r => {
      const u = new URL(r.url())
      if (u.host !== `localhost:${PORT}`) utenfor.add(u.host)
    })
    await p.goto(`${BASE}/${sti}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1200)
    const navn = sti || '(forsiden)'
    utenfor.size ? nei(`${navn} kontakter ${[...utenfor].join(', ')}`)
                 : ok(`${navn}: ingen forespørsler utenfor eget domene`)
    await p.close()
  }

  // --- 4. Tastatur og tekstalternativ --------------------------------------
  console.log('\nTilgjengelighet – tastatur og tekstalternativ')
  await side.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await side.evaluate(() => document.querySelectorAll('[data-avslor]').forEach(e => e.classList.add('synlig')))
  await settledeAnimasjoner(side)
  await side.keyboard.press('Tab')
  const forste = await side.evaluate(() => document.activeElement?.textContent?.trim())
  forste === 'Hopp til innholdet'
    ? ok('første tabulatorstopp er hoppelenken')
    : nei(`første tabulatorstopp er «${forste}», ikke hoppelenken`)

  const grafer = await side.evaluate(() => {
    const s = [...document.querySelectorAll('svg')]
    return { alle: s.length, merket: s.filter(x => x.getAttribute('role') && x.getAttribute('aria-label')).length }
  })
  grafer.alle === grafer.merket
    ? ok(`alle ${grafer.alle} grafer har role og aria-label`)
    : nei(`${grafer.alle - grafer.merket} av ${grafer.alle} grafer mangler tekstalternativ`)

  const flater = await side.evaluate(() => {
    const g = [...document.querySelectorAll('#kartet svg g')].filter(x => x.querySelector('rect'))
    return { alle: g.length, naabare: g.filter(x => x.tabIndex >= 0 && x.getAttribute('aria-label')).length }
  })
  flater.alle && flater.alle === flater.naabare
    ? ok(`alle ${flater.alle} flater i kartet er nåbare med navn`)
    : nei(`${flater.alle - flater.naabare} av ${flater.alle} flater i kartet er ikke nåbare`)

  const utenJs = await nettleser.newPage({ javaScriptEnabled: false })
  await utenJs.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const tekst = (await utenJs.textContent('body')).replace(/\s+/g, ' ').trim()
  tekst.length > 80 ? ok('siden sier noe fornuftig uten JavaScript')
                    : nei('siden er tom uten JavaScript')
  await utenJs.close()

  // --- 5. Tilpasning: smal skjerm, stor tekst, økt tekstavstand ------------
  console.log('\nTilgjengelighet – tilpasning')
  for (const bredde of [320, 390]) {
    const p = await nettleser.newPage({ viewport: { width: bredde, height: 900 } })
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.querySelectorAll('[data-avslor]').forEach(e => e.classList.add('synlig')))
    await settledeAnimasjoner(p)
    const overflyt = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    overflyt <= 1 ? ok(`${bredde} px: ingen vannrett rulling`)
                  : nei(`${bredde} px: ${overflyt} px vannrett rulling`)
    await p.close()
  }
  const stor = await nettleser.newPage({ viewport: { width: 1280, height: 900 } })
  await stor.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await stor.evaluate(() => {
    document.querySelectorAll('[data-avslor]').forEach(e => e.classList.add('synlig'))
    document.documentElement.style.fontSize = '32px'          // 200 %
  })
  await settledeAnimasjoner(stor)
  const overflytStor = await stor.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  overflytStor <= 1 ? ok('200 % tekststørrelse: ingen vannrett rulling')
                    : nei(`200 % tekststørrelse: ${overflytStor} px vannrett rulling`)
  await stor.close()

  // --- 6. Kontrast, i begge bevegelsesinnstillinger ------------------------
  console.log('\nTilgjengelighet – kontrast')
  for (const bevegelse of ['no-preference', 'reduce']) {
    for (const sti of SIDER) {
      const p = await nettleser.newPage({ viewport: { width: 1500, height: 1100 }, reducedMotion: bevegelse })
      await p.goto(`${BASE}/${sti}`, { waitUntil: 'networkidle' })
      await p.evaluate(() => document.querySelectorAll('[data-avslor]').forEach(e => e.classList.add('synlig')))
      await settledeAnimasjoner(p)
      await p.waitForTimeout(250)

      const hoyde = await p.evaluate(() => document.body.scrollHeight)
      const alle = new Map()
      let maalt = 0
      for (let y = 0; y < hoyde; y += 800) {
        await p.evaluate(v => scrollTo(0, v), y)
        await settledeAnimasjoner(p)
        await p.waitForTimeout(150)
        const r = await maalKontrast(p)
        maalt += r.maalt
        for (const f of r.funn) alle.set(f, true)
      }
      const navn = `${sti || '(forsiden)'} [${bevegelse}]`
      if (alle.size) {
        nei(`${navn}: ${alle.size} kontrastfeil av ${maalt} målte`)
        for (const f of [...alle.keys()].slice(0, 8)) console.log(`      ${f}`)
      } else ok(`${navn}: ${maalt} målinger, alle over kravet`)
      await p.close()
    }
  }

  // --- 7. Ingen feil i konsollen -------------------------------------------
  console.log('\nKjøretid')
  const rein = await nettleser.newPage({ viewport: { width: 1400, height: 1000 } })
  const jsFeil = []
  rein.on('pageerror', e => jsFeil.push(e.message))
  rein.on('console', m => { if (m.type() === 'error') jsFeil.push(m.text()) })
  await rein.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await rein.evaluate(() => document.querySelectorAll('[data-avslor]').forEach(e => e.classList.add('synlig')))
  await settledeAnimasjoner(rein)
  jsFeil.length ? nei(`${jsFeil.length} feil i konsollen: ${jsFeil.slice(0, 3).join(' | ')}`)
                : ok('ingen feil i konsollen')

  // Egen adresse for tallene: nyttelasten ved første besøk
  const vekt = await rein.evaluate(async () => {
    const filer = performance.getEntriesByType('resource')
      .filter(r => /\.(js|css|json|woff2)$/.test(r.name))
    const sum = filer.reduce((s, r) => s + (r.encodedBodySize || 0), 0)
    return { antall: filer.length, kB: Math.round(sum / 1024) }
  })
  obs(`nyttelast ved første besøk: ${vekt.kB} kB over ${vekt.antall} filer (komprimert)`)
  await rein.close()

  // --- 8. Egendefinert domene ----------------------------------------------
  console.log('\nDomene')
  const cname = await finnes(`${BASE}/CNAME`)
  if (cname.ok) {
    ok(`CNAME ligger i bygget: ${cname.kropp.trim()}`)
  } else {
    obs('ingen CNAME i bygget – nettstedet publiseres på github.io-adressen. '
      + 'Se docs/publisering.md: filen legges inn FØRST når DNS-en peker riktig, '
      + 'ellers blir siden utilgjengelig.')
  }
} finally {
  await nettleser.close()
}

console.log('\n' + '─'.repeat(64))
if (feil.length) {
  console.log(`[31m${feil.length} feil[0m må rettes før publisering:`)
  feil.forEach(f => console.log(`  – ${f}`))
} else {
  console.log('[32mAlle kontroller gikk gjennom.[0m')
}
if (merknader.length) {
  console.log(`\n${merknader.length} til opplysning:`)
  merknader.forEach(m => console.log(`  – ${m}`))
}
process.exit(feil.length ? 1 : 0)
