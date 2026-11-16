import test from 'node:test'
import assert from 'node:assert/strict'
import { startIntro, startupIntroPlugin } from '../src/fellestall/startup-intro.mjs'

function setup({ seen = false, hash = '', reduced = false, navigation = 'navigate', blockedStorage = false, referrer = '' } = {}) {
  let now = 0, nextId = 0
  const timers = new Map(), listeners = new Map(), classes = new Set()
  const overlay = { removed: false, remove() { this.removed = true }, classList: { add(name) { classes.add(name) } } }
  const motion = { matches: reduced, addEventListener(type, cb) { this.cb = cb }, removeEventListener() { this.cb = null } }
  const window = {
    location: { hash, origin: 'https://fellestall.no' }, matchMedia: () => motion,
    performance: { getEntriesByType: () => [{ type: navigation }] },
    sessionStorage: { getItem() { if (blockedStorage) throw Error('blocked'); return seen ? '1' : null }, setItem() { if (blockedStorage) throw Error('blocked'); seen = true } },
    setTimeout(cb, delay) { const id = ++nextId; timers.set(id, { cb, at: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    addEventListener(type, cb) { listeners.set(type, cb) },
    removeEventListener(type) { listeners.delete(type) },
  }
  startIntro(window, { getElementById: () => overlay, referrer })
  return {
    overlay, classes, timers, listeners, motion,
    emit(type, event = {}) { listeners.get(type)?.(event) },
    tick(ms) {
      const end = now + ms
      while (true) {
        const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
        if (!entry || entry[1].at > end) break
        now = entry[1].at; timers.delete(entry[0]); entry[1].cb()
      }
      now = end
    },
  }
}

test('ready homepage stays covered for two seconds then crossfades and cleans up', () => {
  const s = setup(); s.emit('fellestall:ready'); s.tick(1999)
  assert.ok(s.classes.has('ft-intro--active')); assert.ok(!s.classes.has('ft-intro--leaving'))
  s.tick(1); assert.ok(s.classes.has('ft-intro--leaving')); assert.equal(s.overlay.removed, false)
  s.tick(650); assert.ok(s.overlay.removed); assert.equal(s.listeners.size, 0); assert.equal(s.timers.size, 0)
})
test('slow data waits for readiness, but stalled data cannot block the site', () => {
  const slow = setup(); slow.tick(2500); assert.ok(!slow.classes.has('ft-intro--leaving'))
  slow.emit('fellestall:ready'); slow.tick(650); assert.ok(slow.overlay.removed)
  const stalled = setup(); stalled.tick(4650); assert.ok(stalled.overlay.removed)
})
for (const options of [{seen:true}, {referrer:'https://fellestall.no/analyser/'}, {hash:'#kommuner'}, {hash:'#sider/sammenlign-din-kommune'}, {reduced:true}, {navigation:'back_forward'}, {navigation:'reload'}, {navigation:'reload',blockedStorage:true}]) {
  test(`skips intro: ${JSON.stringify(options)}`, () => { const s = setup(options); assert.ok(s.overlay.removed); assert.equal(s.timers.size, 0) })
}
test('storage denial does not break the first view', () => { const s = setup({blockedStorage:true}); s.emit('fellestall:ready'); s.tick(2650); assert.ok(s.overlay.removed) })
for (const event of ['pagehide', 'hashchange', 'keydown']) {
  test(`${event} releases intro immediately and removes listeners`, () => { const s = setup(); s.emit(event, {key:'Tab'}); assert.ok(s.overlay.removed); assert.equal(s.listeners.size,0); assert.equal(s.timers.size,0) })
}
test('changing reduced motion preference immediately releases intro', () => { const s = setup(); s.motion.matches = true; s.motion.cb(); assert.ok(s.overlay.removed) })
test('reused script on analysis page with no overlay is harmless', () => { assert.doesNotThrow(() => startIntro({}, {getElementById: () => null})) })
test('build injects the approved branding outside React and leaves other templates intact', () => {
  const plugin = startupIntroPlugin()
  const source = '<head></head><body><!-- STARTUP_INTRO --><div id="root">SEO content</div></body>'
  const result = plugin.transformIndexHtml(source)
  assert.ok(result.includes('Offentlig økonomi. Enkelt forklart. Åpent for alle.'))
  assert.ok(result.includes('aria-hidden="true"'))
  assert.ok(result.indexOf('id="ft-intro"') < result.indexOf('id="root"'))
  assert.ok(result.includes('SEO content'))
  assert.equal(plugin.transformIndexHtml('<head></head><body>Admin</body>'), '<head></head><body>Admin</body>')
})
