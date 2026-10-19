import { useEffect, useState } from 'react'
import AnalysisPipeline from './AnalysisPipeline.jsx'
import LivePerformance from './LivePerformance.jsx'
import ServiceStatus from './ServiceStatus.jsx'
import { api, useResource } from './api.js'

const sections = [
  { id: 'ytelse', label: 'Ytelse', icon: 'pulse', description: 'Hvordan oppleves Fellestall?' },
  { id: 'trafikk', label: 'Trafikk', icon: 'chart', description: 'Se hvordan nettstedet blir brukt.' },
  { id: 'sven', label: 'Sven', icon: 'spark', description: 'Instrukser, læring og arbeidet bak analysene.' },
  { id: 'pipeline', label: 'Analysepipeline', icon: 'pipeline', description: 'Bestem hva Sven skal undersøke, og når.' },
  { id: 'drift', label: 'Driftsstatus', icon: 'server', description: 'Hold oversikt over tjenestene bak Fellestall.' },
  { id: 'historikk', label: 'Endringshistorikk', icon: 'clock', description: 'Følg endringer og automatiske kjøringer.' },
]
const date = value => new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const number = value => value == null ? '—' : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value)

function Icon({ name, size = 20 }) {
  const paths = {
    pulse: 'M3 12h4l3-8 4 16 3-8h4', chart: 'M4 20V11m8 9V4m8 16v-7',
    pipeline: 'M4 5h5v5H4zM15 14h5v5h-5zM9 7h5a3 3 0 0 1 3 3v4M7 10v5a3 3 0 0 0 3 3h5',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01',
    clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    arrow: 'M7 17 17 7M7 7h10v10', lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
    exit: 'M9 4H4v16h5M13 8l4 4-4 4M8 12h13', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    menu: 'M4 6h16M4 12h16M4 18h16', check: 'm5 12 4 4L19 6', refresh: 'M20 7v5h-5M4 17v-5h5M5.1 7a8 8 0 0 1 13.6-2L20 7M4 17l1.3 2a8 8 0 0 0 13.6-2',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.chart} /></svg>
}

function Logo() { return <span className="ad-logo">Fellestall<span>.no</span></span> }
function Notice({ children, error = false }) { return <div className={`ad-notice ${error ? 'ad-notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div> }
function Loading() { return <p className="ad-loading" role="status">Henter oppdatert informasjon …</p> }
function ResourceState({ resource }) {
  return resource.loading ? <Loading /> : resource.error ? <Notice error>{resource.error} <button className="ad-text-button" onClick={resource.reload}>Prøv igjen</button></Notice> : null
}

function Login({ onLogin, expired }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) })
      const user = await api('/api/admin/session')
      setPassword(''); onLogin(user)
    } catch { setError('Kunne ikke logge inn. Kontroller e-post og passord. Ved gjentatte forsøk må du vente fem minutter. Kontroller serveroppsettet hvis problemet vedvarer.') }
    finally { setBusy(false) }
  }
  return <div className="ad ad-login">
    <aside className="ad-login-intro">
      <Logo /><span className="ad-eyebrow">BAK TALLENE</span>
      <h1>Et godt overblikk.<br /><em>Også på innsiden.</em></h1>
      <p>Administrer Fellestall, følg utviklingen og gi Sven et bedre grunnlag for neste analyse.</p>
      <div className="ad-login-grid" aria-hidden="true">{[48, 76, 42, 96, 64, 84, 100, 72, 90].map((v, i) => <i key={i} style={{ height: `${v}%` }} />)}</div>
      <small>Offentlige tall. Innsikt for alle.</small>
    </aside>
    <main className="ad-login-main">
      <a className="ad-back" href="/">← Til Fellestall.no</a>
      <form className="ad-login-form" onSubmit={submit}>
        <span className="ad-lock"><Icon name="lock" size={22} /></span>
        <p className="ad-eyebrow">ADMINISTRASJON</p><h2>Velkommen inn.</h2>
        <p className="ad-muted">Logg inn med administratorkontoen din.</p>
        {expired && <Notice>Økten er utløpt. Logg inn igjen for å fortsette.</Notice>}
        <label htmlFor="admin-email">E-postadresse</label>
        <input id="admin-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoCapitalize="none" spellCheck={false} placeholder="deg@eksempel.no" />
        <label htmlFor="admin-password">Passord</label>
        <div className="ad-password"><input id="admin-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" aria-label={show ? 'Skjul passord' : 'Vis passord'} aria-pressed={show} onClick={() => setShow(v => !v)}><Icon name="eye" /></button></div>
        {error && <Notice error>{error}</Notice>}
        <button className="ad-primary" disabled={busy}>{busy ? 'Logger inn …' : 'Logg inn'}<span aria-hidden="true">→</span></button>
        <p className="ad-login-note"><Icon name="lock" size={13} /> Kun for administratorer i Fellestall.</p>
      </form>
      <small className="ad-muted">Fellestall.no · Administrasjon</small>
    </main>
  </div>
}

function MetricCard({ label, value, note, icon, tone }) {
  return <article className="ad-metric"><div className="ad-metric-label">{label}<Icon name={icon || 'pulse'} size={18} /></div><strong>{value}</strong><p className={tone || ''}>{note}</p></article>
}
function Empty({ title, children }) { return <div className="ad-empty"><Icon name="chart" size={30} /><h3>{title}</h3><p>{children}</p></div> }
function Panel({ title, eyebrow, children, extra }) {
  return <section className="ad-panel"><header className="ad-panel-header"><div>{eyebrow && <p className="ad-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{extra}</header>{children}</section>
}
function Bars({ rows, label = 'Sidevisninger' }) {
  const max = Math.max(...rows.map(r => r.views), 1)
  return <div className="ad-bars">{rows.map(r => <div className="ad-bar-row" key={r.label}><div><span>{r.label === 'mobile' ? 'Mobil' : r.label === 'desktop' ? 'Datamaskin' : r.label}</span><strong>{number(r.views)}</strong></div><meter min="0" max={max} value={r.views} aria-label={`${r.label}: ${number(r.views)} ${label.toLowerCase()}`} /></div>)}</div>
}
function DailyChart({ daily }) {
  const max = Math.max(...daily.map(d => d.views), 1)
  return <div className="ad-daily" role="img" aria-label={daily.map(d => `${d.day}: ${number(d.views)} sidevisninger`).join('. ')}>{daily.map(d => <div key={d.day} title={`${d.day}: ${number(d.views)} sidevisninger`}><i style={{ height: `${Math.max(d.views / max * 100, 1)}%` }} /><span>{d.day.slice(8)}.{d.day.slice(5, 7)}</span></div>)}</div>
}

function Measurements({ section, days }) {
  const resource = useResource(`/api/admin/metrics?days=${days}`)
  const data = resource.data
  if (!data) return <ResourceState resource={resource} />
  const t = data.totals
  if (section === 'trafikk') return <>
    <div className="ad-metrics"><MetricCard label="Sidevisninger" value={number(t.views || 0)} note={`Siste ${days} dager`} icon="chart" /><MetricCard label="Sider med besøk" value={number(data.pages.length)} note="Inntil de 20 mest besøkte" icon="arrow" /><MetricCard label="Trafikkilder" value={number(data.sources.length)} note="Henvisende domener, inntil 20" icon="server" /></div>
    <Panel title="Trafikk over tid" eyebrow="SIDEVISNINGER" extra={<span className="ad-tag">Siste {days} dager</span>}>{data.daily.some(r => r.views > 0) ? <DailyChart daily={data.daily} /> : <Empty title="De første besøkene kommer her">Statistikken fylles når nettstedet får besøk etter at målingene er aktivert.</Empty>}</Panel>
    <div className="ad-columns"><Panel title="Mest besøkte sider">{data.pages.length ? <Bars rows={data.pages} /> : <Empty title="Ingen sidevisninger ennå">Besøkte sider vises her.</Empty>}</Panel><Panel title="Hvor kommer leserne fra?">{data.sources.length ? <Bars rows={data.sources} /> : <Empty title="Ingen trafikkilder ennå">Direkte trafikk og henvisende domener vises her.</Empty>}</Panel></div>
    <Panel title="Enheter">{data.devices.length ? <Bars rows={data.devices} /> : <p className="ad-panel-copy">Fordeling mellom mobil og datamaskin vises når de første målingene kommer.</p>}</Panel>
    <p className="ad-footnote">Sidevisninger telles uten besøks-ID eller informasjonskapsler. Statistikken viser ikke unike personer. Egne besøk på /admin telles ikke. Automatisert trafikk kan forekomme.</p>
  </>
  const cards = [
    { name: 'LCP', label: 'Lasting av hovedinnhold', key: 'lcp', good: 2500, unit: 's', scale: 1000, text: 'Mål: 2,5 sekunder eller raskere' },
    { name: 'INP', label: 'Respons på interaksjon', key: 'inp', good: 200, unit: 'ms', scale: 1, text: 'Mål: 200 millisekunder eller raskere' },
    { name: 'CLS', label: 'Visuell stabilitet', key: 'cls', good: 0.1, unit: '', scale: 1, text: 'Mål: 0,10 eller lavere' },
  ]
  return <>
    <div className="ad-history-heading"><p className="ad-eyebrow">HISTORISKE MÅLINGER</p><h2>Utviklingen over tid.</h2></div>
    <div className="ad-section-line"><span className="ad-tag"><i className="ad-dot" /> Faktiske nettlesermålinger</span><span className="ad-muted">Gjennomsnitt · siste {days} dager</span></div>
    <div className="ad-metrics">{cards.map(c => <MetricCard key={c.key} label={c.name + ' · ' + c.label} value={t[c.key] == null ? '—' : `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: c.key === 'inp' ? 0 : 2 }).format(t[c.key] / c.scale)} ${c.unit}`} note={t[c.key] == null ? 'Venter på målinger' : `${number(t[c.key + '_count'])} målinger · ${t[c.key] <= c.good ? 'Innenfor målet' : 'Over målet'}`} tone={t[c.key] != null && t[c.key] <= c.good ? 'ad-good' : ''} />)}</div>
    <Panel title="En rask og stødig opplevelse" eyebrow="NETTSTEDETS YTELSE">{!t.lcp_count && !t.inp_count && !t.cls_count ? <Empty title="Klar for de første målingene">Når leserne bruker Fellestall, samler vi inn lasting, responstid og visuell stabilitet. Ingen historiske målinger er lagt til.</Empty> : <div className="ad-quality-list">{cards.map(c => <div key={c.key}><strong>{c.name}</strong><span>{c.label}<small>{c.text}</small></span><span className="ad-tag">{number(t[c.key + '_count'] || 0)} målinger</span></div>)}</div>}</Panel>
    <div className="ad-columns"><Panel title="Slik leser du målingene"><p className="ad-panel-copy">LCP måler når hovedinnholdet blir synlig. INP måler hvor raskt siden svarer på et klikk eller tastetrykk. CLS måler hvor mye innhold flytter seg mens siden brukes.</p></Panel><Panel title="Et bedre grunnlag over tid"><p className="ad-panel-copy">Tallene er gjennomsnitt av tilgjengelige målinger, ikke Googles Core Web Vitals-vurdering ved 75-persentilen. Nettleserstøtte og faktisk bruk avgjør hvilke målinger som finnes.</p></Panel></div>
  </>
}

function History({ id }) {
  const resource = useResource(`/api/admin/sven/history?id=${id}`)
  return resource.data ? <LogRows rows={resource.data} /> : <ResourceState resource={resource} />
}
function LogRows({ rows }) {
  return rows.length ? <ul className="ad-log">{rows.map(r => <li key={r.id}><span className="ad-log-icon"><Icon name="clock" size={17} /></span><div><a href={r.url} target="_blank" rel="noreferrer">{r.title} <span aria-hidden="true">↗</span></a><small>{date(r.date)}{r.status && ` · ${r.conclusion || r.status}`}</small></div></li>)}</ul> : <p className="ad-panel-copy">Ingen hendelser i denne oversikten.</p>
}

function Sven({ onDirty, onSaving }) {
  const resource = useResource('/api/admin/sven/files')
  const [tab, setTab] = useState('Instrukser')
  const [id, setId] = useState('instructions')
  const [file, setFile] = useState(null)
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const dirty = Boolean(file && file.content !== content)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => { onSaving(busy) }, [busy, onSaving])
  useEffect(() => () => onSaving(false), [onSaving])
  useEffect(() => () => onDirty(false), [onDirty])
  useEffect(() => {
    const controller = new AbortController()
    setFile(null); setError(''); setMessage(''); setReason('')
    api(`/api/admin/sven/file?id=${id}`, { signal: controller.signal }).then(value => { setFile(value); setContent(value.content) }).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [id, reload])
  function select(nextId, nextTab) {
    if (nextId === id && nextTab === tab) return
    if (busy || (dirty && !window.confirm('Du har ulagrede endringer. Vil du forkaste dem?'))) return
    if (file) setContent(file.content)
    setId(nextId); setTab(nextTab)
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const result = await api('/api/admin/sven/file', { method: 'PUT', body: JSON.stringify({ id, content, sha: file.sha, reason }) })
      setFile({ ...file, sha: result.sha, content }); setReason('')
      setMessage('Lagret i Svens arbeidsgrunnlag. Endringen brukes når Sven leser instruksjonene ved neste skrive- eller revisjonsøkt.')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  if (!resource.data) return <ResourceState resource={resource} />
  return <>
    <div className="ad-sven-intro"><img src="/bilder/sven-ai-analytiker.webp" alt="AI-generert portrett av Sven" width="72" height="72" /><div><span className="ad-eyebrow">FELLESTALLS AI-ANALYTIKER</span><h2>Et bedre grunnlag. Bedre analyser.</h2><p>Her ser og endrer du instruksene og det redaksjonelle materialet Sven lærer av.</p></div></div>
    <div className="ad-tabs" role="group" aria-label="Sven-område">{['Instrukser', 'Trening', 'Logg'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => select(t === 'Trening' ? 'handbook' : 'instructions', t)}>{t}</button>)}</div>
    {tab === 'Logg' ? <Activity /> : <>
      {tab === 'Trening' && <Notice>Sven lærer gjennom instruksjoner, referanser og tilbakemeldinger. Dette materialet er arbeidsgrunnlag ved neste økt; modellen finjusteres ikke her.</Notice>}
      {!resource.data.writable && <Notice>Skrivetilgang til GitHub mangler på serveren. Du kan lese materialet; lagring blir tilgjengelig når tilgangen er konfigurert.</Notice>}
      <div className="ad-editor-layout"><nav className="ad-file-list" aria-label="Svens arbeidsfiler">{resource.data.files.filter(f => f.group === tab).map(f => <button key={f.id} aria-current={id === f.id ? 'page' : undefined} onClick={() => select(f.id, tab)}>{f.title}<span>→</span></button>)}</nav>
        <Panel title={file?.title || 'Henter arbeidsfil …'} extra={dirty && <span className="ad-tag ad-unsaved">Ulagrede endringer</span>}>
          {error && <Notice error>{error} <button type="button" className="ad-text-button" onClick={() => { if (!dirty || window.confirm('Forkaste endringene og hente siste versjon?')) setReload(n => n + 1) }}>Hent siste versjon</button></Notice>}
          {message && <Notice>{message}</Notice>}
          {file ? <form className="ad-editor" onSubmit={save}><p className="ad-filepath">{file.path}</p><label className="ad-visually-hidden" htmlFor="sven-content">{file.title}</label><textarea id="sven-content" value={content} onChange={e => setContent(e.target.value)} spellCheck={false} disabled={busy || !resource.data.writable} />
            <label htmlFor="sven-reason">Hva endrer du, og hvorfor?</label><input id="sven-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="F.eks. presiser hvordan kilder skal oppgis" minLength={5} maxLength={300} required disabled={busy || !resource.data.writable} />
            <div className="ad-editor-footer"><small>Lagres i prosjektets historikk. Filene ligger i et offentlig repository; skriv bare generelle føringer og åpne kilder her. Analysepublisering krever fortsatt egen godkjenning.</small><button className="ad-primary" disabled={!dirty || busy || !resource.data.writable}>{busy ? 'Lagrer …' : 'Lagre endringer'}<Icon name="check" size={17} /></button></div>
          </form> : !error && <Loading />}
        </Panel>
      </div>
      {file && <Panel key={`${id}-${file.sha}`} title="Endringer i denne filen"><History id={id} /></Panel>}
    </>}
  </>
}

function Activity() {
  const resource = useResource('/api/admin/log')
  if (!resource.data) return <ResourceState resource={resource} />
  return <div className="ad-columns"><Panel title="Redaksjonelle endringer"><LogRows rows={resource.data.commits} /></Panel><Panel title="Automatiske kjøringer"><LogRows rows={resource.data.runs} /></Panel></div>
}
function Operations() {
  return <ServiceStatus />
}

export default function AdminApp() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [expired, setExpired] = useState(false)
  const [section, setSection] = useState(() => sections.some(s => s.id === location.hash.slice(1)) ? location.hash.slice(1) : 'ytelse')
  const [days, setDays] = useState(7)
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api('/api/admin/session', { signal: controller.signal, skipSessionExpiry: true }).then(setUser).catch(() => {}).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    const end = () => { setUser(null); setExpired(true) }
    window.addEventListener('admin-session-expired', end)
    return () => { controller.abort(); window.removeEventListener('admin-session-expired', end) }
  }, [])
  useEffect(() => {
    const prevent = e => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function navigate(id) {
    if (saving) return
    if (id === section) { setOpen(false); return }
    if (dirty && !window.confirm('Du har ulagrede endringer. Vil du forkaste dem?')) return
    setDirty(false); setSection(id); setOpen(false); history.replaceState(null, '', `#${id}`)
  }
  async function logout() {
    if (saving) return
    if (dirty && !window.confirm('Forkaste ulagrede endringer og logge ut?')) return
    setLoggingOut(true)
    try { await api('/api/auth/sign-out', { method: 'POST', body: '{}' }); setUser(null); setDirty(false); setExpired(false) }
    catch { setError('Utloggingen kunne ikke fullføres. Prøv igjen.') }
    finally { setLoggingOut(false) }
  }
  if (checking) return <div className="ad ad-initial"><Logo /><Loading /></div>
  if (!user) return <Login expired={expired} onLogin={value => { setUser(value); setExpired(false); setError('') }} />
  const current = sections.find(s => s.id === section)
  return <div className="ad ad-shell">
    <a className="ad-skip" href="#admin-content">Hopp til innhold</a>
    <button className="ad-mobile-menu" aria-expanded={open} aria-controls="admin-sidebar" onClick={() => setOpen(v => !v)}><Icon name="menu" /><Logo /><span className="ad-visually-hidden">Meny</span></button>
    {open && <button className="ad-overlay" aria-label="Lukk meny" onClick={() => setOpen(false)} />}
    <aside id="admin-sidebar" className={`ad-sidebar ${open ? 'ad-sidebar-open' : ''}`}>
      <div className="ad-brand"><Logo /><span className="ad-admin-label"><Icon name="lock" size={11} /> ADMINISTRASJON</span></div>
      <p className="ad-nav-label">ARBEIDSROM</p>
      <nav aria-label="Administrasjon">{sections.map(s => <button key={s.id} aria-current={s.id === section ? 'page' : undefined} onClick={() => navigate(s.id)}><Icon name={s.icon} /><span>{s.label}</span>{s.id === 'sven' && <i className="ad-nav-badge">AI</i>}</button>)}</nav>
      <div className="ad-sidebar-bottom"><a href="/" target="_blank" rel="noreferrer">Åpne Fellestall.no<Icon name="arrow" size={16} /></a><div className="ad-account"><span className="ad-avatar">FI</span><div><strong>Fjord Insight</strong><small>{user.email}</small></div></div><button onClick={logout} disabled={loggingOut}><Icon name="exit" size={17} />{loggingOut ? 'Logger ut …' : 'Logg ut'}</button></div>
    </aside>
    <div className="ad-workspace"><header className="ad-topbar"><span>Arbeidsrom <span aria-hidden="true">/</span> <strong>{current.label}</strong></span><span className="ad-private"><Icon name="lock" size={13} /> Privat område</span></header>
      <main id="admin-content" className="ad-content" tabIndex={-1}>
        <div className="ad-page-heading"><div><p className="ad-eyebrow">FELLESTALL · ADMINISTRASJON</p><h1>{current.label}<span>.</span></h1><p>{current.description}</p></div>{['ytelse', 'trafikk'].includes(section) && <label className="ad-period"><Icon name="clock" size={16} /><span className="ad-visually-hidden">Måleperiode</span><select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(d => <option key={d} value={d}>Siste {d} dager</option>)}</select></label>}</div>
        {error && <Notice error>{error}</Notice>}
        {section === 'ytelse' && <><ServiceStatus compact onOpen={() => navigate('drift')} /><LivePerformance /></>}
        {['ytelse', 'trafikk'].includes(section) && <Measurements section={section} days={days} />}
        {section === 'sven' && <Sven onDirty={setDirty} onSaving={setSaving} />}
        {section === 'pipeline' && <AnalysisPipeline onDirty={setDirty} onSaving={setSaving} />}
        {section === 'drift' && <Operations />}
        {section === 'historikk' && <Activity />}
        <footer className="ad-footer"><span>Fellestall.no</span><span>Et godt grunnlag for bedre innsikt.</span></footer>
      </main>
    </div>
  </div>
}
