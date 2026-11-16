/** Runs inline, before hydration: the static fallback never flashes through the intro. */
export function startIntro(window, document) {
  const overlay = document.getElementById('ft-intro')
  if (!overlay) return // Analysis pages reuse scripts but do not contain the intro.
  const seenKey = 'fellestall-intro-v1'
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const navigation = window.performance?.getEntriesByType('navigation')[0]
  let internalNavigation = false
  try { internalNavigation = new URL(document.referrer).origin === window.location.origin } catch { /* No referrer on a direct entry. */ }
  let seen = false
  try { seen = window.sessionStorage.getItem(seenKey) === '1' } catch { /* Storage may be disabled. */ }
  if (seen || internalNavigation || window.location.hash || reducedMotion.matches || ['reload', 'back_forward'].includes(navigation?.type)) {
    overlay.remove()
    return
  }
  try { window.sessionStorage.setItem(seenKey, '1') } catch { /* The intro still works without storage. */ }
  overlay.classList.add('ft-intro--active')
  let ready = false
  let minimumElapsed = false
  let closing = false
  let removalTimer
  const remove = () => {
    overlay.remove()
    window.clearTimeout(minimumTimer)
    window.clearTimeout(deadlineTimer)
    window.clearTimeout(removalTimer)
    window.removeEventListener('fellestall:ready', onReady)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pagehide', remove)
    window.removeEventListener('hashchange', remove)
    reducedMotion.removeEventListener('change', onMotion)
  }
  const close = () => {
    if (closing) return
    closing = true
    overlay.classList.add('ft-intro--leaving')
    removalTimer = window.setTimeout(remove, 650)
  }
  const onReady = () => { ready = true; if (minimumElapsed) close() }
  const onKey = (event) => {
    if (['Tab', 'Escape', 'Enter', ' ', 'ArrowDown', 'PageDown', 'Home', 'End'].includes(event.key)) remove()
  }
  const onMotion = () => { if (reducedMotion.matches) remove() }
  // A stalled data request must never trap the visitor behind the branding.
  const minimumTimer = window.setTimeout(() => { minimumElapsed = true; if (ready) close() }, 2000)
  const deadlineTimer = window.setTimeout(close, 4000)
  window.addEventListener('fellestall:ready', onReady)
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', remove)
  window.addEventListener('hashchange', remove)
  reducedMotion.addEventListener('change', onMotion)
}

export const introMarkup = `<div id="ft-intro" aria-hidden="true"><div class="ft-intro-content"><div class="ft-intro-rule"></div><div class="ft-intro-logo">Fellestall<span>.no</span></div><div class="ft-intro-tagline">Offentlig økonomi. Enkelt forklart. Åpent for alle.</div></div></div>`

export const introStyle = `
#ft-intro { display:none; }
#ft-intro.ft-intro--active {
  display:grid; place-items:center; position:fixed; inset:0; z-index:10000;
  background:#f7f5f0; color:#14161a; opacity:1;
  transition:opacity 650ms cubic-bezier(.4,0,.2,1);
  animation:ft-intro-safety 1ms 5s forwards;
}
#ft-intro.ft-intro--leaving { opacity:0; pointer-events:none; }
.ft-intro-content { width:100%; box-sizing:border-box; padding:32px 24px; text-align:center; transform:translateY(-3vh); }
.ft-intro-rule { width:46px; height:2px; background:#c5452e; margin:0 auto 28px; animation:ft-intro-rule 520ms 80ms both; }
.ft-intro-logo { font:700 clamp(48px,7.72vw,104px)/1.2 'Playfair Display',Georgia,serif; letter-spacing:-.01em; white-space:nowrap; animation:ft-intro-logo 490ms 60ms both; }
.ft-intro-logo span { color:#c5452e; }
.ft-intro-tagline { font:400 clamp(16px,1.86vw,25px)/1.6 'Libre Franklin',system-ui,sans-serif; color:#3b3a36; max-width:760px; margin:32px auto 0; text-wrap:balance; animation:ft-intro-tagline 450ms 200ms both; }
@keyframes ft-intro-logo { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes ft-intro-tagline { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
@keyframes ft-intro-rule { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.ft-intro-logo,.ft-intro-tagline,.ft-intro-rule { animation-timing-function:cubic-bezier(.22,.9,.3,1); }
@keyframes ft-intro-safety { to { visibility:hidden; pointer-events:none; } }
@media (prefers-reduced-motion:reduce) { #ft-intro.ft-intro--active { display:none; } }
`

export function startupIntroPlugin() {
  return {
    name: 'fellestall-startup-intro',
    transformIndexHtml(html) {
      if (!html.includes('<!-- STARTUP_INTRO -->')) return html
      return html.replace('<!-- STARTUP_INTRO -->', `${introMarkup}<script>(${startIntro.toString()})(window,document)</script>`)
        .replace('</head>', `<style>${introStyle}</style>\n</head>`)
    },
  }
}
