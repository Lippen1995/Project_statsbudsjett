import { useLiveResource } from './useLiveResource.js'

const labels = { operational: 'Normal drift', degraded: 'Nedsatt ytelse', outage: 'Driftsavvik' }
const when = value => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const clock = value => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
const n = value => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(value)

function StatusMark({ status }) {
  return <span className={`ad-status-mark ad-status-${status}`} aria-hidden="true">{status === 'operational' ? '✓' : status === 'degraded' ? '!' : '×'}</span>
}

function History({ history }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(today + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() - 29 + i)
    const key = day.toISOString().slice(0, 10)
    return { key, ...history.find(row => row.day === key) }
  })
  const checks = history.reduce((sum, row) => sum + row.checks, 0)
  const normal = history.reduce((sum, row) => sum + row.operational, 0)
  return <section className="ad-panel ad-status-history"><header className="ad-panel-header"><div><p className="ad-eyebrow">SISTE 30 DAGER</p><h2>En historikk du kan følge.</h2></div><div className="ad-status-ratio"><strong>{checks ? n(normal / checks * 100) + ' %' : '—'}</strong><small>kontroller uten avvik</small></div></header><div className="ad-status-history-body"><div className="ad-uptime-bars" role="img" aria-label="Driftskontroller de siste 30 dagene. Grå dager har ingen registrerte kontroller.">{days.map(day => <span key={day.key} className={!day.checks ? 'ad-uptime-unknown' : day.checks === day.operational ? 'ad-uptime-good' : 'ad-uptime-incident'} title={`${day.key}: ${day.checks ? `${day.operational} av ${day.checks} kontroller uten avvik` : 'Ingen registrerte kontroller'}`} />)}</div><div className="ad-uptime-labels"><span>30 dager siden</span><span>I dag</span></div><div className="ad-uptime-legend"><span><i className="ad-uptime-good" />Ingen avvik</span><span><i className="ad-uptime-incident" />Avvik registrert</span><span><i className="ad-uptime-unknown" />Ingen kontroller</span></div><p>{n(checks)} enkeltkontroller av tjenestene. Historikken viser utførte kontroller fra overvåkingen startet. Den er ikke et kontinuerlig mål på tilgjengelighet mellom kontrollene.</p></div></section>
}

export default function ServiceStatus({ compact = false, onOpen }) {
  const resource = useLiveResource('/api/admin/live-status', 30000)
  const data = resource.data
  const fresh = data && !resource.error && Date.now() - new Date(data.checkedAt).getTime() < 120000
  if (!data) return <section className="ad-panel ad-status-waiting" aria-label="Live driftsstatus"><span className="ad-live-badge ad-live-offline"><i />DRIFTSSTATUS</span><p role="status">{resource.error ? 'Driftsstatus kan ikke hentes akkurat nå.' : 'Kontrollerer tjenestene …'}</p>{resource.error && <button className="ad-text-button" onClick={resource.reload}>Prøv igjen</button>}</section>
  const summary = !fresh ? 'Viser sist kjente driftsstatus.' : data.status === 'operational' ? 'Alt fungerer som det skal.' : data.status === 'degraded' ? 'Noen tjenester svarer langsomt.' : 'Et driftsavvik er registrert.'
  return <div className={`ad-service-status ${compact ? 'ad-service-status-compact' : ''}`} aria-label="Live driftsstatus">
    <section className={`ad-status-overview ad-status-${fresh ? data.status : 'unknown'}`}><div className="ad-status-overview-copy"><StatusMark status={fresh ? data.status : 'degraded'} /><div><span className="ad-eyebrow">FELLESTALL · DRIFTSSTATUS</span><h2>{summary}</h2><p>{fresh ? `Sist kontrollert kl. ${clock(data.checkedAt)}` : `Siste kontroll ${when(data.checkedAt)}. Nye kontroller hentes automatisk.`}</p></div></div><div className="ad-status-controls"><span className={`ad-live-badge ${fresh ? '' : 'ad-live-offline'}`}><i />{fresh ? 'LIVE' : 'AVVENTER OPPDATERING'}</span><button className="ad-text-button" onClick={resource.reload}>Oppdater</button></div></section>
    <div className="ad-service-grid">{data.components.map(component => <article className="ad-service-card" key={component.id}><div><StatusMark status={component.status} /><strong>{component.name}</strong></div><span className={`ad-service-condition ad-condition-${component.status}`}>{labels[component.status]}</span><small>{component.status === 'outage' ? component.message : `${n(component.latency_ms)} ms ved siste kontroll`}</small></article>)}</div>
    {resource.error && <div className="ad-notice ad-notice-error" role="status">Forbindelsen er brutt. Statusen over er fra siste vellykkede kontroll.</div>}
    {compact ? <div className="ad-status-summary-footer"><span>Oppdateres hvert 30. sekund mens siden er åpen.</span><button className="ad-text-button" onClick={onOpen}>Se statushistorikk →</button></div> : <>
      <section className="ad-panel ad-status-notifications"><div><span className="ad-eyebrow">E-POST VED STATUSENDRINGER</span><h2>{data.notifications.enabled ? 'Du får beskjed når status endrer seg.' : 'E-postvarsling avventer tilkobling.'}</h2><p>{data.notifications.enabled ? `Varsler sendes til ${data.notifications.recipient}.` : `Mottaker er ${data.notifications.recipient}. Bakgrunnsovervåking og e-postvarsling er ikke aktivert ennå. Denne visningen henter nye kontroller mens den er åpen.`}</p></div><span className={`ad-tag ${data.notifications.enabled ? 'ad-good' : ''}`}>{data.notifications.enabled ? 'Aktivert' : 'Ikke aktivert'}</span></section>
      <History history={data.history} />
      <section className="ad-panel ad-status-incidents"><header className="ad-panel-header"><div><p className="ad-eyebrow">HENDELSESLOGG</p><h2>Endringer i driften.</h2></div></header>{data.incidents.length ? <ol>{data.incidents.map(event => <li key={event.id}><span className={`ad-incident-dot ${event.status === 'resolved' ? 'ad-incident-resolved' : ''}`} /><div><div className="ad-incident-heading"><span className={`ad-tag ${event.status === 'resolved' ? 'ad-good' : ''}`}>{event.status === 'resolved' ? 'Normal drift' : event.status === 'detected' ? 'Avvik oppdaget' : 'Statusoppdatering'}</span><time dateTime={event.created_at}>{when(event.created_at)}</time></div><h3>{event.summary}</h3><p>{event.components.filter(component => component.status !== 'operational').map(component => `${component.name}: ${labels[component.status].toLowerCase()}`).join(' · ') || 'Alle kontrollerte tjenester svarer normalt igjen.'}</p></div></li>)}</ol> : <div className="ad-empty"><h3>Ingen driftsavvik registrert.</h3><p>Statusendringer vises her når de oppdages. Tidligere, uovervåkede perioder er ikke fylt inn.</p></div>}</section>
      <p className="ad-footnote">Svartidene er målt fra kontrolltjenesten. Lesernes opplevelse måles separat under Ytelse. En statusoppdatering her publiserer ingen analyser.</p>
    </>}
  </div>
}
