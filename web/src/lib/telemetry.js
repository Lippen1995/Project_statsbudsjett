import { onLCP, onINP, onCLS } from 'web-vitals'

// Bare summerte målinger: ingen cookies, besøks-ID, søkestrenger eller fulle henvisningsadresser.
export function startTelemetry() {
  if (/^\/(admin|api)(\/|$)/.test(location.pathname) || navigator.webdriver) return
  const path = location.pathname
  let source = 'direkte'
  try { const ref = new URL(document.referrer); if (ref.hostname !== location.hostname) source = ref.hostname } catch { /* Direkte besøk. */ }
  const device = matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
  const send = (type, value) => {
    const data = JSON.stringify({ path, source, device, type, value })
    navigator.sendBeacon?.('/api/telemetry', new Blob([data], { type: 'application/json' }))
  }
  let viewed = false
  const view = () => { if (!viewed && document.visibilityState === 'visible') { viewed = true; send('view') } }
  view()
  const sent = new Set()
  const report = metric => { if (!sent.has(metric.id)) { sent.add(metric.id); send(metric.name.toLowerCase(), metric.value) } }
  onLCP(report)
  onINP(report)
  onCLS(report)
  document.addEventListener('visibilitychange', view)
}
