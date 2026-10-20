import { onLCP, onINP, onCLS } from 'web-vitals'

// Bare summerte målinger: ingen cookies, besøks-ID, søkestrenger eller fulle henvisningsadresser.
export function startTelemetry({ notFound=false } = {}) {
  if (/^\/(admin|api)(\/|$)/.test(location.pathname) || navigator.webdriver) return
  const path = notFound ? '/404/' : location.pathname
  let source = 'direkte'
  try { const ref = new URL(document.referrer); if (ref.hostname !== location.hostname) source = ref.hostname } catch { /* Direkte besøk. */ }
  const device = matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
  const release=typeof __FT_RELEASE__==='string'?__FT_RELEASE__:'ukjent'
  const send = (type, value, extra={}) => {
    const data = JSON.stringify({ path, source, device, type, value,release,...extra })
    navigator.sendBeacon?.('/api/telemetry', new Blob([data], { type: 'application/json' }))
  }
  const originalFetch=window.fetch.bind(window)
  window.fetch=async (...args)=>{try{const result=await originalFetch(...args);if(result.status>=400){const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(url.origin===location.origin&&/^\/(api|data)\//.test(url.pathname))window.dispatchEvent(new Event('fellestall-api-error'))}return result}catch(error){window.dispatchEvent(new Event('fellestall-api-error'));throw error}}
  let viewed = false
  const view = () => { if (!viewed && document.visibilityState === 'visible') { viewed = true; send('view') } }
  view()
  const sent = new Set()
  const report = metric => { if (!sent.has(metric.id)) { sent.add(metric.id); send(metric.name.toLowerCase(), metric.value) } }
  onLCP(report)
  onINP(report)
  onCLS(report)
  document.addEventListener('visibilitychange', view)
  const features=new Map()
  const feature=name=>{const now=Date.now();if(now-(features.get(name)||0)<2000)return;features.set(name,now);send('feature',undefined,{feature:name})}
  document.addEventListener('change',e=>{if(e.target.matches?.('select,input[type="radio"],input[type="checkbox"]'))feature('filter')})
  document.addEventListener('click',e=>{if(e.target.closest?.('svg.recharts-surface'))feature('chart');const t=e.target.closest?.('button,a');if(!t)return;const label=(t.getAttribute('aria-label')||t.textContent||'').toLowerCase();if(t.hasAttribute('download'))feature('download');else if(/del|share/.test(label))feature('share');else if(/sammenlign|compare/.test(label))feature('compare')})
  let searchTimer
  document.addEventListener('input',e=>{if(e.target.matches?.('input[type="search"]')){clearTimeout(searchTimer);searchTimer=setTimeout(()=>feature('search'),1500)}})
  window.addEventListener('error',e=>{const code=['TypeError','ReferenceError','SyntaxError','RangeError'].find(name=>(e.error?.name||'')===name)||'Error';send('error',undefined,{errorCode:code})})
  window.addEventListener('unhandledrejection',()=>send('error',undefined,{errorCode:'unhandled-rejection'}))
  window.addEventListener('fellestall-api-error',()=>send('error',undefined,{errorCode:'api-error'}))
  if(notFound)feature('404')
  window.addEventListener('fellestall-feature',e=>{if(['filter','compare','share','download','search','chart','404'].includes(e.detail))feature(e.detail)})
}
