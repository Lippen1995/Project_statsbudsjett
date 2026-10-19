import { useLiveResource } from './useLiveResource.js'

const number = (value, digits = 0) => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits }).format(value)
const time = value => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
const measures = [
  { key: 'lcp', label: 'Lasting av hovedinnhold', scale: 1000, unit: 's', good: 2500, poor: 4000, digits: 2 },
  { key: 'inp', label: 'Respons på interaksjon', scale: 1, unit: 'ms', good: 200, poor: 500, digits: 0 },
  { key: 'cls', label: 'Visuell stabilitet', scale: 1, unit: '', good: .1, poor: .25, digits: 3 },
]

export default function LivePerformance() {
  const resource = useLiveResource('/api/admin/live')
  const data = resource.data, totals = data?.totals
  return <section className="ad-live-performance" aria-label="Live ytelsesmålinger">
    <header className="ad-live-heading"><div><p className="ad-eyebrow">SISTE 15 MINUTTER</p><h2>Akkurat nå.</h2><p>De siste målingene fra lesernes nettlesere.</p></div><div className="ad-live-meta"><span className={`ad-live-badge ${resource.error ? 'ad-live-offline' : ''}`}><i />{resource.error ? 'Forbindelsen er brutt' : resource.loading ? 'Kobler til' : 'LIVE'}</span><small>{data ? `Oppdatert ${time(data.checkedAt)}` : 'Henter målinger …'}</small><button className="ad-text-button" onClick={resource.reload}>Oppdater nå</button></div></header>
    {resource.error && <div className="ad-notice ad-notice-error" role="status">{data ? 'Viser sist mottatte målinger. ' : ''}{resource.error} Nye målinger hentes automatisk når forbindelsen er tilbake.</div>}
    <div className="ad-live-metrics">{measures.map(metric => {
      const value = totals?.[metric.key]
      const count = totals?.[metric.key + '_count'] || 0
      const classification = value == null ? '' : value <= metric.good ? 'ad-good' : value > metric.poor ? 'ad-measure-poor' : 'ad-measure-fair'
      return <article className="ad-live-metric" key={metric.key}><div><span>{metric.key.toUpperCase()}</span><span className={`ad-live-quality ${classification}`}>{value == null ? 'Venter på data' : value <= metric.good ? 'Innenfor målet' : value > metric.poor ? 'Treg opplevelse' : 'Kan forbedres'}</span></div><strong>{value == null ? '—' : number(value / metric.scale, metric.digits)}<small>{value == null ? '' : metric.unit}</small></strong><p>{metric.label}</p><small>{number(count)} mottatte målinger</small></article>
    })}<article className="ad-live-metric"><div><span>TRAFIKK</span><span className="ad-live-quality">Siste 15 min</span></div><strong>{totals ? number(totals.views) : '—'}</strong><p>Sidevisninger</p><small>Uten besøks-ID eller informasjonskapsler</small></article></div>
    <p className="ad-footnote">Oppdateres hvert 15. sekund mens siden er åpen. Verdiene er gjennomsnitt av mottatte målinger i de siste 15 minuttbolkene. {totals?.latest_sample_at ? `Siste måling mottatt kl. ${time(totals.latest_sample_at)}.` : 'Ingen målinger mottatt i dette tidsrommet ennå.'}</p>
  </section>
}
